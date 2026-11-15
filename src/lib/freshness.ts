// Freshness helpers for the 14-day "New" badge and "New this week" row

export const NEW_VIDEO_WINDOW_DAYS = 14;
const NEW_VIDEO_WINDOW_MS = NEW_VIDEO_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_ALLOWANCE_MS = 24 * 60 * 60 * 1000;

export function parseAddedAtMs(addedAt?: string | null): number | null {
  if (!addedAt || typeof addedAt !== 'string') return null;
  const ms = Date.parse(addedAt);
  return Number.isNaN(ms) ? null : ms;
}

// Returns true if the video's addedAt date is within the last 14 days
export function isNewVideo(addedAt?: string | null): boolean {
  const ms = parseAddedAtMs(addedAt);
  if (ms === null) return false;
  const ageMs = Date.now() - ms;
  return ageMs >= -CLOCK_SKEW_ALLOWANCE_MS && ageMs <= NEW_VIDEO_WINDOW_MS;
}
