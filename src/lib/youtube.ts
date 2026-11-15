// YouTube URL parsing, oEmbed metadata lookup, Data API v3 search + 72h cache, and IFrame API loader
import { getSearchCache, upsertSearchCache } from './supabase';

// Read API key from environment only (never hardcoded)
export const YOUTUBE_API_KEY =
  (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined)?.trim() ?? '';

export const hasYouTubeApiKey = Boolean(YOUTUBE_API_KEY);

// 24-hour freshness window for Trusted Channels, 72-hour window for Creative Commons
const CHANNEL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CC_CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const MIN_FULL_MOVIE_SECONDS = 60 * 60; // 60 minutes

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
  description?: string;
  tags?: string[];
  sourceLabel?: string;
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

// Parse an ISO 8601 duration (e.g. "PT1H42M18S") into total seconds
export function parseIsoDurationToSeconds(isoDuration?: string): number {
  if (!isoDuration || typeof isoDuration !== 'string') return 0;
  const match = isoDuration.trim().match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function formatDurationFromSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
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

// Fetch public, embeddable 60+ minute movies from one trusted YouTube handle (never uses search.list).
// Cached in Supabase search_cache under "channel:HANDLE" for 24 hours.
export async function fetchTrustedChannelMoviesWithCache(
  rawHandle: string
): Promise<{ results: YouTubeSearchResult[]; error: boolean }> {
  const cleanHandle = rawHandle.trim().replace(/^@+/, '');
  if (!cleanHandle) {
    return { results: [], error: false };
  }

  const cacheKey = `channel:${cleanHandle.toLowerCase()}`;
  const cached = await getSearchCache<YouTubeSearchResult>(cacheKey);
  const cachedAgeMs = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;

  if (
    cached &&
    Array.isArray(cached.results) &&
    cachedAgeMs >= 0 &&
    cachedAgeMs < CHANNEL_CACHE_MAX_AGE_MS
  ) {
    return {
      results: cached.results.map((item) => ({
        ...item,
        sourceLabel: 'Official channel',
      })),
      error: false,
    };
  }

  const fallbackCached = () => {
    if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
      return {
        results: cached.results.map((item) => ({
          ...item,
          sourceLabel: 'Official channel',
        })),
        error: false,
      };
    }
    return { results: [], error: true };
  };

  if (!YOUTUBE_API_KEY) {
    return fallbackCached();
  }

  try {
    // 1. Resolve handle -> uploads playlist via channels.list
    const channelParams = new URLSearchParams({
      part: 'contentDetails',
      forHandle: `@${cleanHandle}`,
      key: YOUTUBE_API_KEY,
    });
    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${channelParams.toString()}`
    );
    if (!channelRes.ok) {
      return fallbackCached();
    }

    const channelData = (await channelRes.json()) as {
      items?: Array<{
        contentDetails?: {
          relatedPlaylists?: { uploads?: string };
        };
      }>;
    };

    const uploadsPlaylistId =
      channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return fallbackCached();
    }

    // 2. Read the newest 50 uploads via playlistItems.list
    const playlistParams = new URLSearchParams({
      part: 'contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: '50',
      key: YOUTUBE_API_KEY,
    });
    const playlistRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams.toString()}`
    );
    if (!playlistRes.ok) {
      return fallbackCached();
    }

    const playlistData = (await playlistRes.json()) as {
      items?: Array<{
        contentDetails?: { videoId?: string };
      }>;
    };

    const videoIds = Array.from(
      new Set(
        (playlistData.items ?? [])
          .map((item) => item.contentDetails?.videoId?.trim())
          .filter((id): id is string => Boolean(id))
      )
    );

    if (videoIds.length === 0) {
      await upsertSearchCache(cacheKey, []);
      return { results: [], error: false };
    }

    // 3. Fetch status, contentDetails, and snippet in batches of 50 via videos.list
    const collected: YouTubeSearchResult[] = [];

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const videosParams = new URLSearchParams({
        part: 'status,contentDetails,snippet',
        id: batch.join(','),
        key: YOUTUBE_API_KEY,
      });

      const videosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`
      );
      if (!videosRes.ok) {
        return fallbackCached();
      }

      const videosData = (await videosRes.json()) as {
        items?: Array<{
          id?: string;
          status?: {
            privacyStatus?: string;
            embeddable?: boolean;
          };
          contentDetails?: {
            duration?: string;
          };
          snippet?: {
            title?: string;
            channelTitle?: string;
            description?: string;
            tags?: string[];
          };
        }>;
      };

      for (const item of videosData.items ?? []) {
        const videoId = item.id?.trim();
        if (!videoId) continue;

        // Keep only public, embeddable videos that are at least 60 minutes long
        const isPublic = item.status?.privacyStatus === 'public';
        const isEmbeddable = item.status?.embeddable === true;
        const durationSeconds = parseIsoDurationToSeconds(item.contentDetails?.duration);
        if (!isPublic || !isEmbeddable || durationSeconds < MIN_FULL_MOVIE_SECONDS) {
          continue;
        }

        collected.push({
          videoId,
          title: decodeHtmlEntities(item.snippet?.title ?? `YouTube Video (${videoId})`),
          channelTitle: decodeHtmlEntities(item.snippet?.channelTitle ?? `@${cleanHandle}`),
          thumbnail: getYouTubeThumbnail(videoId),
          duration: formatDurationFromSeconds(durationSeconds),
          durationSeconds,
          description: item.snippet?.description
            ? decodeHtmlEntities(item.snippet.description).slice(0, 1200)
            : undefined,
          tags: Array.isArray(item.snippet?.tags) ? item.snippet!.tags.slice(0, 30) : undefined,
          sourceLabel: 'Official channel',
        });
      }
    }

    await upsertSearchCache(cacheKey, collected);
    return { results: collected, error: false };
  } catch {
    return fallbackCached();
  }
}

// One Creative Commons YouTube search cached in Supabase search_cache under "cc" for 72 hours
export async function fetchCreativeCommonsMoviesWithCache(): Promise<{
  results: YouTubeSearchResult[];
  error: boolean;
}> {
  const cacheKey = 'cc';
  const cached = await getSearchCache<YouTubeSearchResult>(cacheKey);
  const cachedAgeMs = cached ? Date.now() - Date.parse(cached.fetched_at) : Infinity;

  if (
    cached &&
    Array.isArray(cached.results) &&
    cachedAgeMs >= 0 &&
    cachedAgeMs < CC_CACHE_MAX_AGE_MS
  ) {
    return {
      results: cached.results.map((item) => ({
        ...item,
        sourceLabel: 'Creative Commons',
      })),
      error: false,
    };
  }

  const fallbackCached = () => {
    if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
      return {
        results: cached.results.map((item) => ({
          ...item,
          sourceLabel: 'Creative Commons',
        })),
        error: false,
      };
    }
    return { results: [], error: true };
  };

  if (!YOUTUBE_API_KEY) {
    return fallbackCached();
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoLicense: 'creativeCommon',
    videoEmbeddable: 'true',
    videoDuration: 'long',
    order: 'date',
    maxResults: '12',
    q: 'full movie',
    key: YOUTUBE_API_KEY,
  });

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
    );
    if (!response.ok) {
      return fallbackCached();
    }

    const payload = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          description?: string;
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
          channelTitle: decodeHtmlEntities(item.snippet?.channelTitle ?? 'Creative Commons'),
          thumbnail: getYouTubeThumbnail(videoId),
          description: item.snippet?.description
            ? decodeHtmlEntities(item.snippet.description).slice(0, 600)
            : undefined,
          sourceLabel: 'Creative Commons',
        };
      });

    await upsertSearchCache(cacheKey, results);
    return { results, error: false };
  } catch {
    return fallbackCached();
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
