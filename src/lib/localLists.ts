// Device-only storage for Watch Later ("movienest_watchlater") and History / Continue Watching ("movienest_history")
// Never store room codes, chat messages, or usernames in these lists.

export const WATCH_LATER_STORAGE_KEY = 'movienest_watchlater';
export const HISTORY_STORAGE_KEY = 'movienest_history';

export const WATCH_LATER_MAX_ITEMS = 100;
export const HISTORY_MAX_ITEMS = 30;
export const FINISHED_PROGRESS_RATIO = 0.95;

export const LOCAL_LISTS_UPDATED_EVENT = 'movienest:local-lists-updated';
export const LOCAL_LIST_TOAST_EVENT = 'movienest:local-list-toast';

export type LocalMediaSource = 'youtube' | 'archive';

export interface WatchLaterItem {
  source: LocalMediaSource;
  id: string;
  video_url?: string;
  title: string;
  thumbnail: string;
  addedAt: string;
}

export interface WatchHistoryItem {
  source: LocalMediaSource;
  id: string;
  video_url?: string;
  title: string;
  thumbnail: string;
  position: number;
  duration: number;
  finished: boolean;
  updatedAt: string;
}

export interface WatchLaterInput {
  source?: LocalMediaSource;
  id: string;
  video_url?: string | null;
  title: string;
  thumbnail: string;
}

export interface WatchProgressInput {
  source?: LocalMediaSource;
  id: string;
  video_url?: string | null;
  title: string;
  thumbnail: string;
  position: number;
  duration: number;
  markFinished?: boolean;
}

function normalizeSource(raw: unknown): LocalMediaSource {
  return raw === 'archive' ? 'archive' : 'youtube';
}

function normalizeTitle(raw: unknown, fallbackId: string): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().slice(0, 200);
  }
  return fallbackId;
}

function normalizeArchiveUrl(source: LocalMediaSource, rawUrl: unknown): string | undefined {
  if (source !== 'archive') return undefined;
  if (typeof rawUrl === 'string' && rawUrl.startsWith('https://archive.org/download/')) {
    return rawUrl;
  }
  return undefined;
}

function sanitizeWatchLaterEntry(raw: unknown): WatchLaterItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id) return null;

  const source = normalizeSource(obj.source);
  const video_url = normalizeArchiveUrl(source, obj.video_url);
  const thumbnail =
    typeof obj.thumbnail === 'string' && obj.thumbnail.trim() ? obj.thumbnail.trim() : '';
  const addedAt =
    typeof obj.addedAt === 'string' && !Number.isNaN(Date.parse(obj.addedAt))
      ? obj.addedAt
      : new Date().toISOString();

  // Keep only the strict Watch Later fields
  const entry: WatchLaterItem = {
    source,
    id,
    title: normalizeTitle(obj.title, id),
    thumbnail,
    addedAt,
  };
  if (video_url) {
    entry.video_url = video_url;
  }
  return entry;
}

function sanitizeHistoryEntry(raw: unknown): WatchHistoryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id) return null;

  const source = normalizeSource(obj.source);
  const video_url = normalizeArchiveUrl(source, obj.video_url);
  const thumbnail =
    typeof obj.thumbnail === 'string' && obj.thumbnail.trim() ? obj.thumbnail.trim() : '';

  const position =
    typeof obj.position === 'number' && Number.isFinite(obj.position)
      ? Math.max(0, Math.floor(obj.position))
      : 0;
  const duration =
    typeof obj.duration === 'number' && Number.isFinite(obj.duration)
      ? Math.max(0, Math.floor(obj.duration))
      : 0;

  const isFinished =
    Boolean(obj.finished) ||
    (duration > 0 && position / duration >= FINISHED_PROGRESS_RATIO);

  const updatedAt =
    typeof obj.updatedAt === 'string' && !Number.isNaN(Date.parse(obj.updatedAt))
      ? obj.updatedAt
      : new Date().toISOString();

  // Keep only the strict Watch History fields (never room code, chat, or username)
  const entry: WatchHistoryItem = {
    source,
    id,
    title: normalizeTitle(obj.title, id),
    thumbnail,
    position,
    duration,
    finished: isFinished,
    updatedAt,
  };
  if (video_url) {
    entry.video_url = video_url;
  }
  return entry;
}

function readLocalArray(key: string): unknown[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalArray(key: string, items: unknown[]): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

function notifyListsChanged(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LOCAL_LISTS_UPDATED_EVENT));
    }
  } catch {
    // Ignore event dispatch errors
  }
}

export function emitWatchLaterToast(message: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<string>(LOCAL_LIST_TOAST_EVENT, { detail: message })
      );
    }
  } catch {
    // Ignore event dispatch errors
  }
}

export function getWatchLaterItems(): WatchLaterItem[] {
  const rawList = readLocalArray(WATCH_LATER_STORAGE_KEY);
  const seen = new Set<string>();
  const cleaned: WatchLaterItem[] = [];

  for (const raw of rawList) {
    const entry = sanitizeWatchLaterEntry(raw);
    if (!entry) continue;
    const key = `${entry.source}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(entry);
    if (cleaned.length >= WATCH_LATER_MAX_ITEMS) break;
  }

  return cleaned;
}

export function isInWatchLater(source: LocalMediaSource, id: string): boolean {
  const safeId = id.trim();
  if (!safeId) return false;
  return getWatchLaterItems().some(
    (item) => item.source === source && item.id === safeId
  );
}

// Toggle a video in Watch Later (newest first, max 100 items)
export function toggleWatchLaterItem(input: WatchLaterInput): {
  saved: boolean;
  items: WatchLaterItem[];
} {
  const source = normalizeSource(input.source);
  const safeId = input.id.trim();
  if (!safeId) {
    return { saved: false, items: getWatchLaterItems() };
  }

  const current = getWatchLaterItems();
  const exists = current.some((item) => item.source === source && item.id === safeId);

  let next: WatchLaterItem[];
  let saved: boolean;

  if (exists) {
    next = current.filter((item) => !(item.source === source && item.id === safeId));
    saved = false;
  } else {
    const video_url = normalizeArchiveUrl(source, input.video_url);
    const newItem: WatchLaterItem = {
      source,
      id: safeId,
      title: normalizeTitle(input.title, safeId),
      thumbnail: input.thumbnail.trim(),
      addedAt: new Date().toISOString(),
    };
    if (video_url) {
      newItem.video_url = video_url;
    }
    next = [newItem, ...current].slice(0, WATCH_LATER_MAX_ITEMS);
    saved = true;
  }

  writeLocalArray(WATCH_LATER_STORAGE_KEY, next);
  notifyListsChanged();
  emitWatchLaterToast(saved ? 'Saved to Watch Later' : 'Removed from Watch Later');

  return { saved, items: next };
}

export function removeWatchLaterItem(source: LocalMediaSource, id: string): WatchLaterItem[] {
  const safeId = id.trim();
  const next = getWatchLaterItems().filter(
    (item) => !(item.source === source && item.id === safeId)
  );
  writeLocalArray(WATCH_LATER_STORAGE_KEY, next);
  notifyListsChanged();
  return next;
}

export function getHistoryItems(): WatchHistoryItem[] {
  const rawList = readLocalArray(HISTORY_STORAGE_KEY);
  const seen = new Set<string>();
  const cleaned: WatchHistoryItem[] = [];

  for (const raw of rawList) {
    const entry = sanitizeHistoryEntry(raw);
    if (!entry) continue;
    const key = `${entry.source}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(entry);
    if (cleaned.length >= HISTORY_MAX_ITEMS) break;
  }

  return cleaned;
}

// Continue Watching shows only unfinished videos with a saved playback position
export function getContinueWatchingItems(): WatchHistoryItem[] {
  return getHistoryItems().filter(
    (item) => !item.finished && item.position > 0 && item.duration > 0
  );
}

// Upsert playback progress (1 entry per video, latest 30 items, marked finished at >= 95%)
export function upsertWatchHistory(input: WatchProgressInput): WatchHistoryItem[] {
  const source = normalizeSource(input.source);
  const safeId = input.id.trim();
  if (!safeId) return getHistoryItems();

  const position = Number.isFinite(input.position) ? Math.max(0, Math.floor(input.position)) : 0;
  const duration = Number.isFinite(input.duration) ? Math.max(0, Math.floor(input.duration)) : 0;

  // Skip recording if playback hasn't started yet and wasn't explicitly finished
  if (position <= 0 && !input.markFinished) {
    return getHistoryItems();
  }

  const current = getHistoryItems();
  const existing = current.find((item) => item.source === source && item.id === safeId);

  const effectiveDuration = duration > 0 ? duration : existing?.duration ?? 0;
  const reachedEnd =
    Boolean(input.markFinished) ||
    (effectiveDuration > 0 && position / effectiveDuration >= FINISHED_PROGRESS_RATIO);

  // Prefer a real title over placeholder text like "YouTube Video (...)" or "Archive Movie (...)"
  const candidateTitle = normalizeTitle(input.title, safeId);
  const isPlaceholderTitle =
    candidateTitle.startsWith('YouTube Video (') ||
    candidateTitle.startsWith('Archive Movie (') ||
    candidateTitle.startsWith('Movie (');
  const bestTitle =
    isPlaceholderTitle && existing?.title ? existing.title : candidateTitle;

  const video_url =
    normalizeArchiveUrl(source, input.video_url) ?? existing?.video_url;

  const entry: WatchHistoryItem = {
    source,
    id: safeId,
    title: bestTitle,
    thumbnail: input.thumbnail.trim() || existing?.thumbnail || '',
    position: reachedEnd && effectiveDuration > 0 ? effectiveDuration : position,
    duration: effectiveDuration,
    finished: reachedEnd,
    updatedAt: new Date().toISOString(),
  };
  if (video_url) {
    entry.video_url = video_url;
  }

  const filtered = current.filter(
    (item) => !(item.source === source && item.id === safeId)
  );
  const next = [entry, ...filtered].slice(0, HISTORY_MAX_ITEMS);

  writeLocalArray(HISTORY_STORAGE_KEY, next);
  notifyListsChanged();
  return next;
}

export function removeHistoryItem(source: LocalMediaSource, id: string): WatchHistoryItem[] {
  const safeId = id.trim();
  const next = getHistoryItems().filter(
    (item) => !(item.source === source && item.id === safeId)
  );
  writeLocalArray(HISTORY_STORAGE_KEY, next);
  notifyListsChanged();
  return next;
}

export function clearWatchHistory(): void {
  writeLocalArray(HISTORY_STORAGE_KEY, []);
  notifyListsChanged();
}

export function getProgressPercent(position: number, duration: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  const pct = (position / duration) * 100;
  return Math.max(2, Math.min(100, Math.round(pct)));
}

export function formatClockDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

// Formats remaining watch time like "12:40 left"
export function formatTimeLeft(position: number, duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '';
  const remaining = Math.max(0, Math.floor(duration - Math.max(0, position)));
  return `${formatClockDuration(remaining)} left`;
}
