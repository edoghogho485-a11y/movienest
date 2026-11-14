import { createClient } from '@supabase/supabase-js';

// Single Supabase configuration for MovieNest
export const SUPABASE_URL = 'https://kzsrbemtexgawfrriqxe.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_m0kdzrMoHcS6wTDbHWeTxw_41iOb2Q7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Matches the "rooms" table schema in Supabase
export interface RoomRecord {
  id: string;
  code: string;
  name: string;
  video_id: string;
  is_playing: boolean;
  position_seconds: number;
  updated_at: string;
  created_at: string;
}

// Easy-to-read alphabet: excludes ambiguous 0, O, 1, I, L
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    const index = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    suffix += ROOM_CODE_CHARS[index];
  }
  return `NEST-${suffix}`;
}

export function getInviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = `?room=${encodeURIComponent(code)}`;
  url.hash = '';
  return url.toString();
}

export async function createRoomInSupabase(params: {
  name: string;
  videoId: string;
  positionSeconds?: number;
}): Promise<{ room: RoomRecord | null; error: string | null }> {
  const cleanName = params.name.trim() || 'Private Screening Room';
  const startSeconds = Math.max(0, Math.floor(params.positionSeconds ?? 0));

  // Check Supabase before inserting so we generate a fresh code if already taken
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();

    const { data: existing, error: checkError } = await supabase
      .from('rooms')
      .select('id')
      .ilike('code', code)
      .maybeSingle();

    if (checkError) {
      return { room: null, error: checkError.message };
    }

    if (existing) {
      continue;
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code,
        name: cleanName,
        video_id: params.videoId,
        is_playing: false,
        position_seconds: startSeconds,
      })
      .select()
      .single();

    if (!error && data) {
      return { room: data as RoomRecord, error: null };
    }

    // Retry if another user took the same code between our check and insert
    if (error && error.code !== '23505') {
      return { room: null, error: error.message };
    }
  }

  return { room: null, error: 'Could not generate a unique room code. Please try again.' };
}

export async function findRoomByCode(
  rawCode: string
): Promise<{ room: RoomRecord | null; error: string | null }> {
  const cleanCode = rawCode.trim().toUpperCase();
  if (!cleanCode) {
    return { room: null, error: null };
  }

  // Escape LIKE wildcards so case-insensitive lookup matches the exact code
  const escapedCode = cleanCode.replace(/[\\%_]/g, '\\$&');

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .ilike('code', escapedCode)
    .maybeSingle();

  if (error) {
    return { room: null, error: error.message };
  }

  return { room: (data as RoomRecord | null) ?? null, error: null };
}

// Persist play/pause and timestamp changes to the room row for Realtime sync
export async function updateRoomPlayback(params: {
  roomId: string;
  isPlaying: boolean;
  positionSeconds: number;
  updatedAt: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('rooms')
    .update({
      is_playing: params.isPlaying,
      // Integer seconds work cleanly with both integer and numeric DB columns
      position_seconds: Math.max(0, Math.floor(params.positionSeconds)),
      updated_at: params.updatedAt,
    })
    .eq('id', params.roomId);

  return { error: error ? error.message : null };
}

// Matches the "messages" table schema in Supabase
export interface RoomMessage {
  id: string;
  room_code: string;
  sender_name: string;
  body: string;
  created_at: string;
}

// Load existing messages for one room, oldest first
export async function fetchRoomMessages(
  roomCode: string
): Promise<{ messages: RoomMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_code', roomCode)
    .order('created_at', { ascending: true });

  if (error) {
    return { messages: [], error: error.message };
  }

  return { messages: (data as RoomMessage[]) ?? [], error: null };
}

// Save a new chat message (trims whitespace, enforces 300-char limit)
export async function sendRoomMessage(params: {
  roomCode: string;
  senderName: string;
  body: string;
}): Promise<{ message: RoomMessage | null; error: string | null }> {
  const cleanBody = params.body.trim().slice(0, 300);
  if (!cleanBody) {
    return { message: null, error: null };
  }

  const cleanSender = params.senderName.trim().slice(0, 40) || 'Guest';

  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_code: params.roomCode,
      sender_name: cleanSender,
      body: cleanBody,
    })
    .select()
    .single();

  if (error) {
    return { message: null, error: error.message };
  }

  return { message: data as RoomMessage, error: null };
}

// Shared library categories (Nollywood and Movies appear first on the home page)
export const SHARED_LIBRARY_CATEGORIES = [
  'Nollywood',
  'Movies',
  'Animation',
  'Documentary',
  'Music',
  'Other',
] as const;

export type SharedLibraryCategory = (typeof SHARED_LIBRARY_CATEGORIES)[number];

// Matches the "library" table schema in Supabase
export interface SharedLibraryItem {
  id: string;
  video_id: string;
  title: string;
  category: SharedLibraryCategory;
  created_at: string;
}

// Load all shared library videos, newest first
export async function fetchSharedLibrary(): Promise<{
  items: SharedLibraryItem[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('library')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: (data as SharedLibraryItem[]) ?? [], error: null };
}

// Save a YouTube video to the shared "library" table and ignore duplicates gracefully
export async function saveToSharedLibrary(params: {
  videoId: string;
  title: string;
  category: SharedLibraryCategory;
}): Promise<{
  item: SharedLibraryItem | null;
  duplicate: boolean;
  error: string | null;
}> {
  // Check first so duplicates are handled cleanly even without a unique index
  const { data: existing, error: lookupError } = await supabase
    .from('library')
    .select('*')
    .eq('video_id', params.videoId)
    .maybeSingle();

  if (lookupError) {
    return { item: null, duplicate: false, error: lookupError.message };
  }

  if (existing) {
    return {
      item: existing as SharedLibraryItem,
      duplicate: true,
      error: null,
    };
  }

  const cleanTitle = params.title.trim() || `YouTube Video (${params.videoId})`;

  const { data, error } = await supabase
    .from('library')
    .insert({
      video_id: params.videoId,
      title: cleanTitle,
      category: params.category,
    })
    .select()
    .single();

  if (error) {
    // Handle race-condition unique constraint violation gracefully as duplicate
    if (error.code === '23505') {
      return { item: null, duplicate: true, error: null };
    }
    return { item: null, duplicate: false, error: error.message };
  }

  return {
    item: data as SharedLibraryItem,
    duplicate: false,
    error: null,
  };
}

// Matches the "search_cache" table schema in Supabase (query, results JSON, fetched_at)
export interface SearchCacheRecord<T = unknown> {
  query: string;
  results: T[];
  fetched_at: string;
}

// Fetch cached YouTube search results for a normalized query
export async function getSearchCache<T = unknown>(
  normalizedQuery: string
): Promise<SearchCacheRecord<T> | null> {
  const { data, error } = await supabase
    .from('search_cache')
    .select('query, results, fetched_at')
    .eq('query', normalizedQuery)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as SearchCacheRecord<T>;
}

// Save or refresh cached YouTube search results in Supabase
export async function upsertSearchCache<T = unknown>(
  normalizedQuery: string,
  results: T[]
): Promise<void> {
  await supabase.from('search_cache').upsert(
    {
      query: normalizedQuery,
      results,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'query' }
  );
}
