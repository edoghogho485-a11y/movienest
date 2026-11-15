// YouTube URL parsing, oEmbed metadata lookup, Data API v3 search + 72h cache, and IFrame API loader
import { getSearchCache, upsertSearchCache } from './supabase';

// Read API key from environment only (never hardcoded)
export const YOUTUBE_API_KEY =
  (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined)?.trim() ?? '';

export const hasYouTubeApiKey = Boolean(YOUTUBE_API_KEY);

// 72-hour freshness window for Supabase search_cache
const CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
}

export interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration?: () => number;
  getPlayerState: () => number;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  destroy: () => void;
}

export interface YTPlayerEvent {
  data: number;
  target: YTPlayer;
}

export interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      width?: string | number;
      height?: string | number;
      videoId: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: YTPlayerEvent) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Decode common HTML entities returned by YouTube snippets without invoking an HTML parser
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&apos;': "'",
  };
  return text.replace(
    /&(?:amp|lt|gt|quot|#39|#x27|apos);/gi,
    (match) => entities[match.toLowerCase()] ?? match
  );
}

// Extract an 11-character YouTube video ID from youtube.com, m.youtube.com, or youtu.be URLs only
export function extractYouTubeId(rawInput: string): string | null {
  const input = rawInput.trim();
  if (!input) return null;

  try {
    const normalized = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    const host = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      const parts = url.pathname.split('/').filter(Boolean);
      if (
        parts.length >= 2 &&
        ['shorts', 'embed', 'live', 'v'].includes(parts[0].toLowerCase())
      ) {
        const id = parts[1];
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeMaxResThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Fetch the video's title from YouTube's public oEmbed endpoint (no API key needed)
export async function fetchYouTubeTitle(videoId: string): Promise<string> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      return `YouTube Video (${videoId})`;
    }
    const data = (await response.json()) as { title?: string };
    return data.title?.trim() || `YouTube Video (${videoId})`;
  } catch {
    return `YouTube Video (${videoId})`;
  }
}

// Search YouTube Data API v3 with 72-hour Supabase search_cache support
export async function searchYouTubeWithCache(rawQuery: string): Promise<{
  results: YouTubeSearchResult[];
  fromCache: boolean;
  error: boolean;
}> {
  const cleanQuery = rawQuery.trim();
  if (!cleanQuery) {
    return { results: [], fromCache: false, error: false };
  }

  const cacheKey = cleanQuery.toLowerCase();

  // 1. Check Supabase search_cache first (72-hour freshness window)
  const cached = await getSearchCache<YouTubeSearchResult>(cacheKey);
  const cachedAgeMs = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;

  if (
    cached &&
    Array.isArray(cached.results) &&
    cachedAgeMs >= 0 &&
    cachedAgeMs < CACHE_MAX_AGE_MS
  ) {
    return { results: cached.results, fromCache: true, error: false };
  }

  // 2. If no API key is configured, return any cached results if present
  if (!YOUTUBE_API_KEY) {
    if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
      return { results: cached.results, fromCache: true, error: false };
    }
    return { results: [], fromCache: false, error: true };
  }

  // 3. Call YouTube Data API v3
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    videoDuration: 'long',
    maxResults: '12',
    q: cleanQuery,
    key: YOUTUBE_API_KEY,
  });

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );

    if (!response.ok) {
      // Quota exceeded or API error: fall back to stale cache if available
      if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
        return { results: cached.results, fromCache: true, error: false };
      }
      return { results: [], fromCache: false, error: true };
    }

    const payload = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
          };
        };
      }>;
    };

    const results: YouTubeSearchResult[] = (payload.items ?? [])
      .filter((item) => Boolean(item.id?.videoId))
      .map((item) => {
        const videoId = item.id!.videoId!;
        return {
          videoId,
          title: decodeHtmlEntities(item.snippet?.title ?? `YouTube Video (${videoId})`),
          channelTitle: decodeHtmlEntities(item.snippet?.channelTitle ?? 'YouTube'),
          thumbnail: getYouTubeThumbnail(videoId),
        };
      });

    // 4. Upsert fresh results into Supabase search_cache
    await upsertSearchCache(cacheKey, results);

    return { results, fromCache: false, error: false };
  } catch {
    if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
      return { results: cached.results, fromCache: true, error: false };
    }
    return { results: [], fromCache: false, error: true };
  }
}

// Loads the official YouTube IFrame Player API script once and resolves when ready
let ytApiPromise: Promise<YTNamespace> | null = null;
export function loadYouTubeIframeAPI(): Promise<YTNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousReady) previousReady();
      if (window.YT) resolve(window.YT);
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  });

  return ytApiPromise;
}
