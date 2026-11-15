// Device-local list of videos that failed to play (YouTube 100/101/150 or Archive failure)
// Hidden on this device from then on so broken streams don't keep showing up

export const BROKEN_VIDEOS_STORAGE_KEY = 'movienest_broken_videos';
export const BROKEN_VIDEOS_UPDATED_EVENT = 'movienest:broken-videos-updated';

const MAX_BROKEN_VIDEOS = 200;

let memoryBrokenKeys: string[] = [];

export function makeBrokenVideoKey(source: 'youtube' | 'archive', id: string): string {
  return `${source}:${id.trim()}`;
}

export function readBrokenVideoKeys(): Set<string> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return new Set(memoryBrokenKeys);
    }
    const raw = window.localStorage.getItem(BROKEN_VIDEOS_STORAGE_KEY);
    if (!raw) return new Set(memoryBrokenKeys);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const cleaned = parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.includes(':'))
      .slice(0, MAX_BROKEN_VIDEOS);
    memoryBrokenKeys = cleaned;
    return new Set(cleaned);
  } catch {
    return new Set(memoryBrokenKeys);
  }
}

export function isBrokenVideo(source: 'youtube' | 'archive', id: string): boolean {
  if (!id.trim()) return false;
  return readBrokenVideoKeys().has(makeBrokenVideoKey(source, id));
}

// Remember a broken video on this device and notify mounted views to hide it
export function markBrokenVideo(source: 'youtube' | 'archive', id: string): void {
  const safeId = id.trim();
  if (!safeId) return;

  const key = makeBrokenVideoKey(source, safeId);
  const existing = Array.from(readBrokenVideoKeys()).filter((entry) => entry !== key);
  const next = [key, ...existing].slice(0, MAX_BROKEN_VIDEOS);
  memoryBrokenKeys = next;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(BROKEN_VIDEOS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage quota or private mode errors
  }

  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BROKEN_VIDEOS_UPDATED_EVENT));
    }
  } catch {
    // Ignore event dispatch errors
  }
}
