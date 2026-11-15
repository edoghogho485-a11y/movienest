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

export type RoomControlsMode = 'everyone' | 'host';

export const QUEUE_MAX_ITEMS = 20;
const HOST_ID_STORAGE_KEY = 'movienest_host_id';

// Explicit column list for all "rooms" queries so new columns are always fetched
export const ROOM_SELECT_COLUMNS =
  'id, code, name, video_id, source, video_url, is_playing, position_seconds, host_id, controls, locked, queue, updated_at, created_at';

// Safe localStorage wrappers in case storage is empty, cleared, or blocked by browser privacy rules
let memoryHostId: string | null = null;

function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const val = window.localStorage.getItem(key);
    return val ? val.trim() : null;
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  source: 'youtube' | 'archive';
  videoUrl?: string | null;
  addedBy?: string;
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
  host_id?: string | null;
  controls?: RoomControlsMode | string | null;
  locked?: boolean | null;
  queue?: QueueItem[] | null;
  updated_at: string;
  created_at: string;
}

// Get or create a persistent random host ID stored on this device
export function getOrCreateDeviceHostId(): string {
  const existing = safeGetLocalStorage(HOST_ID_STORAGE_KEY);
  if (existing) {
    memoryHostId = existing;
    return existing;
  }

  if (memoryHostId) {
    safeSetLocalStorage(HOST_ID_STORAGE_KEY, memoryHostId);
    return memoryHostId;
  }

  const generated =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  memoryHostId = generated;
  safeSetLocalStorage(HOST_ID_STORAGE_KEY, generated);
  return generated;
}

export function isRoomHost(room: Pick<RoomRecord, 'host_id'> | null | undefined): boolean {
  if (!room?.host_id) return false;
  const localHostId = safeGetLocalStorage(HOST_ID_STORAGE_KEY) || memoryHostId;
  return Boolean(localHostId && localHostId === room.host_id);
}

// Normalize queue array from Supabase jsonb column (treats null/missing as empty array, caps at 20)
export function normalizeQueueItems(rawQueue: unknown): QueueItem[] {
  if (!Array.isArray(rawQueue)) return [];
  return rawQueue
    .filter((item): item is QueueItem => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<QueueItem>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.videoId === 'string' &&
        typeof candidate.title === 'string' &&
        (candidate.source === 'youtube' || candidate.source === 'archive')
      );
    })
    .slice(0, QUEUE_MAX_ITEMS);
}

// Normalize a room row from Supabase so missing/null fields never crash RoomPage
export function normalizeRoomRecord(raw: unknown): RoomRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<RoomRecord>;

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const code = typeof candidate.code === 'string' ? candidate.code.trim().toUpperCase() : '';
  if (!id || !code) return null;

  const nowIso = new Date().toISOString();
  return {
    id,
    code,
    name:
      typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name
        : 'Movie Room',
    video_id: typeof candidate.video_id === 'string' ? candidate.video_id : '',
    source: candidate.source === 'archive' ? 'archive' : 'youtube',
    video_url:
      typeof candidate.video_url === 'string' && candidate.video_url.trim()
        ? candidate.video_url
        : null,
    is_playing: Boolean(candidate.is_playing),
    position_seconds:
      typeof candidate.position_seconds === 'number' &&
      Number.isFinite(candidate.position_seconds)
        ? Math.max(0, Math.floor(candidate.position_seconds))
        : 0,
    host_id:
      typeof candidate.host_id === 'string' && candidate.host_id.trim()
        ? candidate.host_id.trim()
        : null,
    controls: candidate.controls === 'host' ? 'host' : 'everyone',
    locked: Boolean(candidate.locked),
    queue: normalizeQueueItems(candidate.queue),
    updated_at:
      typeof candidate.updated_at === 'string' && candidate.updated_at
        ? candidate.updated_at
        : nowIso,
    created_at:
      typeof candidate.created_at === 'string' && candidate.created_at
        ? candidate.created_at
        : nowIso,
  };
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
  try {
    const url = new URL(window.location.href);
    url.search = `?room=${encodeURIComponent(code)}`;
    url.hash = '';
    return url.toString();
  } catch {
    return `?room=${encodeURIComponent(code)}`;
  }
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

  const videoSource = params.source === 'archive' ? 'archive' : 'youtube';
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

    const hostId = getOrCreateDeviceHostId();

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
        host_id: hostId,
        controls: 'host',
        locked: false,
        queue: [],
      })
      .select(ROOM_SELECT_COLUMNS)
      .single();

    if (!error && data) {
      const normalizedRoom = normalizeRoomRecord(data);
      if (normalizedRoom) {
        lastRoomCreatedAt = Date.now();
        return {
          room: {
            ...normalizedRoom,
            // Preserve the local host_id if the table defaulted or omitted it
            host_id: normalizedRoom.host_id ?? hostId,
          },
          error: null,
        };
      }
      return {
        room: null,
        error: 'Room was saved in an unexpected format. Please try again.',
      };
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
    .select(ROOM_SELECT_COLUMNS)
    .ilike('code', cleanCode)
    .maybeSingle();

  if (error) {
    return {
      room: null,
      error: 'Could not look up that room right now. Please try again.',
    };
  }

  return { room: normalizeRoomRecord(data), error: null };
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

// Host-only: save room lock state
export async function updateRoomSettings(params: {
  roomId: string;
  locked: boolean;
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('rooms')
    .update({
      locked: params.locked,
    })
    .eq('id', params.roomId);

  return {
    error: error ? 'Could not update room settings right now.' : null,
  };
}

// Switch the active movie in the room (optionally updating the queue at the same time)
export async function updateRoomVideo(params: {
  roomId: string;
  videoId: string;
  source: 'youtube' | 'archive';
  videoUrl?: string | null;
  isPlaying?: boolean;
  positionSeconds?: number;
  queue?: QueueItem[];
  updatedAt?: string;
}): Promise<{ error: string | null }> {
  if (
    params.source === 'archive' &&
    (!params.videoUrl || !params.videoUrl.startsWith('https://archive.org/download/'))
  ) {
    return { error: 'This Archive movie link cannot be played.' };
  }

  const payload: Record<string, unknown> = {
    video_id: params.videoId.trim(),
    source: params.source,
    video_url: params.source === 'archive' ? params.videoUrl ?? null : null,
    is_playing: params.isPlaying ?? false,
    position_seconds: Math.max(0, Math.floor(params.positionSeconds ?? 0)),
    updated_at: params.updatedAt ?? new Date().toISOString(),
  };

  if (params.queue) {
    payload.queue = params.queue.slice(0, QUEUE_MAX_ITEMS);
  }

  const { error } = await supabase
    .from('rooms')
    .update(payload)
    .eq('id', params.roomId);

  return {
    error: error ? 'Could not switch the room video right now.' : null,
  };
}

// Save updated Up Next queue array (capped at 20 items)
export async function updateRoomQueue(params: {
  roomId: string;
  queue: QueueItem[];
}): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('rooms')
    .update({
      queue: params.queue.slice(0, QUEUE_MAX_ITEMS),
    })
    .eq('id', params.roomId);

  return {
    error: error ? 'Could not update the queue right now.' : null,
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

// Matches the "library" table schema in Supabase ("Our picks")
export interface SharedLibraryItem {
  id: string;
  video_id: string;
  title: string;
  category: string;
  credit?: string | null;
  permission_note?: string | null;
  approved?: boolean | null;
  created_at: string;
}

// Load approved "Our picks" rows from the Supabase "library" table, newest first
export async function fetchSharedLibrary(): Promise<{
  items: SharedLibraryItem[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('library')
    .select('video_id, title, category, credit, permission_note, created_at')
    .eq('approved', true)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      items: [],
      error: 'Could not load curated picks right now.',
    };
  }

  const rows = Array.isArray(data) ? data : [];
  const items: SharedLibraryItem[] = rows
    .filter((row) => typeof row?.video_id === 'string' && row.video_id.trim().length > 0)
    .map((row) => ({
      id: row.video_id,
      video_id: row.video_id.trim(),
      title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : `YouTube Video (${row.video_id})`,
      category: typeof row.category === 'string' && row.category.trim() ? row.category.trim() : 'Movies',
      credit: typeof row.credit === 'string' ? row.credit.trim() : null,
      permission_note: typeof row.permission_note === 'string' ? row.permission_note.trim() : null,
      approved: true,
      created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    }));

  return { items, error: null };
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

// --- Unique Usernames & Persistent Device Identity ---

export const DEVICE_ID_STORAGE_KEY = 'movienest_device';
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export interface UserProfile {
  username: string;
  changes: number;
}

export type UsernameRpcStatus =
  | 'ok'
  | 'taken'
  | 'invalid'
  | 'reserved'
  | 'already_set'
  | 'not_found'
  | 'limit_reached';

export function isValidUsernameFormat(rawName: string): boolean {
  return USERNAME_PATTERN.test(rawName.trim());
}

let memoryDeviceId: string | null = null;

// Generate and store a persistent random device ID (at least 20 chars) in localStorage
export function getOrCreateDeviceId(): string {
  const existing = safeGetLocalStorage(DEVICE_ID_STORAGE_KEY);
  if (existing && existing.length >= 20) {
    memoryDeviceId = existing;
    return existing;
  }

  if (memoryDeviceId && memoryDeviceId.length >= 20) {
    safeSetLocalStorage(DEVICE_ID_STORAGE_KEY, memoryDeviceId);
    return memoryDeviceId;
  }

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random()
          .toString(36)
          .slice(2)}`;
  const deviceId = randomPart.length >= 20 ? randomPart : randomPart.padEnd(24, '0');
  memoryDeviceId = deviceId;
  safeSetLocalStorage(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

export function getUsernameRpcErrorMessage(
  status: UsernameRpcStatus | 'error'
): string {
  switch (status) {
    case 'taken':
      return 'That username is already taken. Please try another one.';
    case 'reserved':
      return 'That username is reserved. Please pick a different one.';
    case 'invalid':
      return 'Use 3 to 20 characters with letters, numbers, and underscores only.';
    case 'already_set':
      return 'This device already has a username.';
    case 'not_found':
      return 'Could not find your existing username record.';
    case 'limit_reached':
      return "You've already used your one username change.";
    default:
      return 'Could not save your username right now. Please try again.';
  }
}

// Check if a username is currently available via RPC username_available(p_name)
export async function checkUsernameAvailable(
  rawName: string
): Promise<boolean | null> {
  const cleanName = rawName.trim();
  if (!isValidUsernameFormat(cleanName)) return null;

  const { data, error } = await supabase.rpc('username_available', {
    p_name: cleanName,
  });

  if (error || typeof data !== 'boolean') {
    return null;
  }
  return data;
}

// Restore username & change count for this device via RPC get_my_username(p_device)
export async function getMyUsername(
  deviceId = getOrCreateDeviceId()
): Promise<UserProfile | null> {
  const { data, error } = await supabase.rpc('get_my_username', {
    p_device: deviceId,
  });

  if (error || !data) {
    return null;
  }

  // Handle either single object return or single-row array return from Postgres RPC
  const record = Array.isArray(data) ? data[0] : data;
  if (!record || typeof record !== 'object') {
    return null;
  }

  const candidate = record as { username?: unknown; changes?: unknown };
  if (typeof candidate.username !== 'string' || !candidate.username.trim()) {
    return null;
  }

  return {
    username: candidate.username.trim(),
    changes: typeof candidate.changes === 'number' ? candidate.changes : 0,
  };
}

// Claim a first username for this device via RPC claim_username(p_device, p_name)
export async function claimUsername(
  rawName: string,
  deviceId = getOrCreateDeviceId()
): Promise<{ status: UsernameRpcStatus | 'error'; error: string | null }> {
  const cleanName = rawName.trim();
  if (!isValidUsernameFormat(cleanName)) {
    return {
      status: 'invalid',
      error: getUsernameRpcErrorMessage('invalid'),
    };
  }

  const { data, error } = await supabase.rpc('claim_username', {
    p_device: deviceId,
    p_name: cleanName,
  });

  if (error || typeof data !== 'string') {
    return {
      status: 'error',
      error: getUsernameRpcErrorMessage('error'),
    };
  }

  const status = data as UsernameRpcStatus;
  if (status === 'ok') {
    return { status: 'ok', error: null };
  }

  return {
    status,
    error: getUsernameRpcErrorMessage(status),
  };
}

// Change username once for this device via RPC change_username(p_device, p_name)
export async function changeUsername(
  rawName: string,
  deviceId = getOrCreateDeviceId()
): Promise<{ status: UsernameRpcStatus | 'error'; error: string | null }> {
  const cleanName = rawName.trim();
  if (!isValidUsernameFormat(cleanName)) {
    return {
      status: 'invalid',
      error: getUsernameRpcErrorMessage('invalid'),
    };
  }

  const { data, error } = await supabase.rpc('change_username', {
    p_device: deviceId,
    p_name: cleanName,
  });

  if (error || typeof data !== 'string') {
    return {
      status: 'error',
      error: getUsernameRpcErrorMessage('error'),
    };
  }

  const status = data as UsernameRpcStatus;
  if (status === 'ok') {
    return { status: 'ok', error: null };
  }

  return {
    status,
    error: getUsernameRpcErrorMessage(status),
  };
}

