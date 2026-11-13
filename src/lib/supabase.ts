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

export function generateRoomCode(): string {
  const num = Math.floor(100 + Math.random() * 900);
  return `NEST-${num}`;
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
}): Promise<{ room: RoomRecord | null; error: string | null }> {
  const cleanName = params.name.trim() || 'Private Screening Room';

  // Retry a few times in case the generated short code already exists
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        code,
        name: cleanName,
        video_id: params.videoId,
        is_playing: false,
        position_seconds: 0,
      })
      .select()
      .single();

    if (!error && data) {
      return { room: data as RoomRecord, error: null };
    }

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

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', cleanCode)
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

