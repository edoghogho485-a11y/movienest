import { createClient } from '@supabase/supabase-js';

// Single Supabase configuration for MovieNest
export const SUPABASE_URL = 'https://kzsrbemtexgawfrriqxe.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_m0kdzrMoHcS6wTDbHWeTxw_41iOb2Q7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Input validation rules
export const ROOM_NAME_MAX_LENGTH = 60;
export const DISPLAY_NAME_MAX_LENGTH = 30;
export const CHAT_MESSAGE_MAX_LENGTH = 300;
export const ROOM_CODE_PATTERN = /^NEST-[A-Z0-9]{3,6}$/;
const ROOM_CREATE_COOLDOWN_MS = 10_000;

let lastRoomCreatedAt = 0;

export function isValidRoomCode(rawCode: string): boolean {
  return ROOM_CODE_PATTERN.test(rawCode.trim().toUpperCase());
}

// Matches the "rooms" table schema in Supabase
export interface RoomRecord {
  id: string;
  code: string;
  name: string;
  video_id: string;
  source?: 'youtube' | 'archive' | string | null;
  video_url?: string | null;
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
  source?: 'youtube' | 'archive';
  videoUrl?: string | null;
  positionSeconds?: number;
}): Promise<{ room: RoomRecord | null; error: string | null }> {
  const cleanName = params.name.trim();
  if (cleanName.length < 1 || cleanName.length > ROOM_NAME_MAX_LENGTH) {
    return {
      room: null,
      error: `Room name must be between 1 and ${ROOM_NAME_MAX_LENGTH} characters.`,
    };
  }

  // Enforce 10-second client-side cooldown between creating rooms
  const now = Date.now();
  if (now - lastRoomCreatedAt < ROOM_CREATE_COOLDOWN_MS) {
    return {
      room: null,
      error: 'Slow down a little — please wait a few seconds before creating another room.',
    };
  }

  const videoSource = params.source ?? 'youtube';
  if (
    videoSource === 'archive' &&
    (!params.videoUrl || !params.videoUrl.startsWith('https://archive.org/download/'))
  ) {
    return {
      room: null,
      error: 'This Archive movie cannot be played in a room. Please pick another movie.',
    };
  }

  const cleanVideoId = params.videoId.trim();
  if (!cleanVideoId) {
    return { room: null, error: 'Please choose a video for your room.' };
  }

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
      return {
        room: null,
        error: 'Could not create your room right now. Please try again.',
      };
    }

    if (existing) {
      continue;
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code,
        name: cleanName,
        video_id: cleanVideoId,
        source: videoSource,
        video_url: videoSource === 'archive' ? params.videoUrl ?? null : null,
        is_playing: false,
        position_seconds: startSeconds,
      })
      .select()
      .single();

    if (!error && data) {
      lastRoomCreatedAt = Date.now();
      return { room: data as RoomRecord, error: null };
    }

    // Retry if another user took the same code between our check and insert
    if (error && error.code !== '23505') {
      return {
        room: null,
        error: 'Could not create your room right now. Please try again.',
      };
    }
  }

  return {
    room: null,
    error: 'Could not create your room right now. Please try again.',
  };
}

export async function findRoomByCode(
  rawCode: string
): Promise<{ room: RoomRecord | null; error: string | null }> {
  const cleanCode = rawCode.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(cleanCode)) {
    return { room: null, error: null };
  }

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .ilike('code', cleanCode)
    .maybeSingle();

  if (error) {
    return {
      room: null,
      error: 'Could not look up that room right now. Please try again.',
    };
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
      position_seconds: Math.max(0, Math.floor(params.positionSeconds)),
      updated_at: params.updatedAt,
    })
    .eq('id', params.roomId);

  return {
    error: error ? 'Could not sync playback right now.' : null,
  };
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
  const cleanRoomCode = roomCode.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(cleanRoomCode)) {
    return { messages: [], error: null };
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_code', cleanRoomCode)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      messages: [],
      error: 'Could not load chat messages right now.',
    };
  }

  return { messages: (data as RoomMessage[]) ?? [], error: null };
}

// Save a new chat message (validates 1-30 char display name and 1-300 char body)
export async function sendRoomMessage(params: {
  roomCode: string;
  senderName: string;
  body: string;
}): Promise<{ message: RoomMessage | null; error: string | null }> {
  const cleanRoomCode = params.roomCode.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(cleanRoomCode)) {
    return { message: null, error: 'Invalid room code.' };
  }

  const cleanSender = params.senderName.trim();
  if (cleanSender.length < 1 || cleanSender.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      message: null,
      error: `Display name must be 1 to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
    };
  }

  const cleanBody = params.body.trim();
  if (cleanBody.length < 1 || cleanBody.length > CHAT_MESSAGE_MAX_LENGTH) {
    return {
      message: null,
      error: `Message must be 1 to ${CHAT_MESSAGE_MAX_LENGTH} characters.`,
    };
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_code: cleanRoomCode,
      sender_name: cleanSender,
      body: cleanBody,
    })
    .select()
    .single();

  if (error) {
    return {
      message: null,
      error: 'Could not send your message. Please try again.',
    };
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
    return {
      items: [],
      error: 'Could not load the shared library right now.',
    };
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
  const cleanVideoId = params.videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanVideoId)) {
    return {
      item: null,
      duplicate: false,
      error: 'Please choose a valid YouTube video.',
    };
  }

  // Check first so duplicates are handled cleanly even without a unique index
  const { data: existing, error: lookupError } = await supabase
    .from('library')
    .select('*')
    .eq('video_id', cleanVideoId)
    .maybeSingle();

  if (lookupError) {
    return {
      item: null,
      duplicate: false,
      error: 'Could not save this video right now. Please try again.',
    };
  }

  if (existing) {
    return {
      item: existing as SharedLibraryItem,
      duplicate: true,
      error: null,
    };
  }

  const cleanTitle = params.title.trim().slice(0, 120) || `YouTube Video (${cleanVideoId})`;

  const { data, error } = await supabase
    .from('library')
    .insert({
      video_id: cleanVideoId,
      title: cleanTitle,
      category: params.category,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { item: null, duplicate: true, error: null };
    }
    return {
      item: null,
      duplicate: false,
      error: 'Could not save this video right now. Please try again.',
    };
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

// Fetch cached search results for a normalized query
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

// Save or refresh cached search results in Supabase
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
