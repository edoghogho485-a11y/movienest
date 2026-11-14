// Mood filtering, Tonight's picks hydration, and non-repeating Surprise Me helpers (zero extra YouTube searches)
import { GENRE_LIST } from '../data/genres';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import { FEATURED_VIDEOS } from '../data/videos';
import { getSearchCache } from './supabase';
import { getYouTubeThumbnail, YouTubeSearchResult } from './youtube';

export type MoodId =
  | 'laugh'
  | 'cry'
  | 'thrill'
  | 'date-night'
  | 'family'
  | 'surprise';

export interface MoodDefinition {
  id: MoodId;
  label: string;
  genreSlugs: string[];
  description: string;
}

export const MOOD_DEFINITIONS: MoodDefinition[] = [
  {
    id: 'laugh',
    label: 'Laugh',
    genreSlugs: ['comedy', 'nollywood-comedy'],
    description: 'Comedy and Nollywood Comedy lined up for a light night.',
  },
  {
    id: 'cry',
    label: 'Cry',
    genreSlugs: ['sad-emotional', 'drama'],
    description: 'Heartfelt drama and emotional stories.',
  },
  {
    id: 'thrill',
    label: 'Thrill',
    genreSlugs: ['thriller', 'horror', 'action'],
    description: 'Suspense, horror, and high-stakes action.',
  },
  {
    id: 'date-night',
    label: 'Date night',
    genreSlugs: ['romance', 'nollywood-romance'],
    description: 'Romance and Nollywood Romance picked for two.',
  },
  {
    id: 'family',
    label: 'Family',
    genreSlugs: ['family', 'animation'],
    description: 'Family favorites and animated films for everyone.',
  },
  {
    id: 'surprise',
    label: 'Surprise me',
    genreSlugs: [],
    description: 'One random pick from the cached movie rows.',
  },
];

// Queries pre-hydrated strictly from Supabase search_cache (no YouTube API quota spent)
const MOOD_AND_PICK_SLUGS = [
  'nollywood-movies',
  'comedy',
  'nollywood-comedy',
  'sad-emotional',
  'drama',
  'thriller',
  'horror',
  'action',
  'romance',
  'nollywood-romance',
  'family',
  'animation',
] as const;

const TONIGHT_EXTRA_QUERY = 'full movie';
const SURPRISE_HISTORY_KEY = 'movienest_surprise_history';
const MAX_SURPRISE_HISTORY = 10;

// In-memory backup if browser blocks localStorage
let memorySurpriseHistory: string[] = [];

// Read the last 10 Surprise Me video IDs safely from localStorage
export function readSurpriseHistory(): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return memorySurpriseHistory;
    }
    const raw = window.localStorage.getItem(SURPRISE_HISTORY_KEY);
    if (!raw) return memorySurpriseHistory;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const clean = parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_SURPRISE_HISTORY);
    memorySurpriseHistory = clean;
    return clean;
  } catch {
    return memorySurpriseHistory;
  }
}

function recordSurprisePick(videoId: string): void {
  const previous = readSurpriseHistory().filter((id) => id !== videoId);
  const next = [videoId, ...previous].slice(0, MAX_SURPRISE_HISTORY);
  memorySurpriseHistory = next;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SURPRISE_HISTORY_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

// Fallback items from built-in open-licensed metadata if Supabase cache is cold
export function getFallbackCatalogVideos(): YouTubeSearchResult[] {
  const seen = new Set<string>();
  const combined: YouTubeSearchResult[] = [];

  for (const item of LIBRARY_VIDEOS) {
    if (seen.has(item.youtubeId)) continue;
    seen.add(item.youtubeId);
    combined.push({
      videoId: item.youtubeId,
      title: item.title,
      channelTitle: item.category,
      thumbnail: getYouTubeThumbnail(item.youtubeId),
    });
  }

  for (const item of FEATURED_VIDEOS) {
    if (seen.has(item.youtubeId)) continue;
    seen.add(item.youtubeId);
    combined.push({
      videoId: item.youtubeId,
      title: item.title,
      channelTitle: item.genre,
      thumbnail: getYouTubeThumbnail(item.youtubeId),
    });
  }

  return combined;
}

// Hydrate mood rows and Tonight's picks strictly from Supabase search_cache (zero YouTube API requests)
export async function loadCachedMoodAndPickRows(): Promise<{
  bySlug: Record<string, YouTubeSearchResult[]>;
  fullMovies: YouTubeSearchResult[];
}> {
  const targetGenres = GENRE_LIST.filter((g) =>
    (MOOD_AND_PICK_SLUGS as readonly string[]).includes(g.slug)
  );

  const [genreCacheResults, fullMovieCache] = await Promise.all([
    Promise.all(
      targetGenres.map(async (genre) => {
        const cached = await getSearchCache<YouTubeSearchResult>(genre.query.toLowerCase());
        return {
          slug: genre.slug,
          results: Array.isArray(cached?.results) ? cached.results : [],
        };
      })
    ),
    getSearchCache<YouTubeSearchResult>(TONIGHT_EXTRA_QUERY),
  ]);

  const bySlug: Record<string, YouTubeSearchResult[]> = {};
  for (const entry of genreCacheResults) {
    if (entry.results.length > 0) {
      bySlug[entry.slug] = entry.results;
    }
  }

  return {
    bySlug,
    fullMovies: Array.isArray(fullMovieCache?.results) ? fullMovieCache.results : [],
  };
}

// Deduplicate an array of YouTubeSearchResult by videoId preserving order
export function dedupeYouTubeVideos(items: YouTubeSearchResult[]): YouTubeSearchResult[] {
  const seen = new Set<string>();
  const out: YouTubeSearchResult[] = [];
  for (const item of items) {
    if (!item?.videoId || seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    out.push({
      ...item,
      thumbnail: item.thumbnail || getYouTubeThumbnail(item.videoId),
    });
  }
  return out;
}

// Build the movie list for a mood strictly from cached genre rows (plus fallback if cache is empty)
export function getMoodVideosFromCache(
  moodId: MoodId,
  cachedBySlug: Record<string, YouTubeSearchResult[]>
): YouTubeSearchResult[] {
  const def = MOOD_DEFINITIONS.find((m) => m.id === moodId);
  if (!def || def.genreSlugs.length === 0) return [];

  const collected: YouTubeSearchResult[] = [];
  for (const slug of def.genreSlugs) {
    const row = cachedBySlug[slug];
    if (Array.isArray(row)) {
      collected.push(...row);
    }
  }

  const deduped = dedupeYouTubeVideos(collected);
  if (deduped.length > 0) {
    return deduped;
  }

  // Fallback to built-in open movies when no cached genre rows exist yet
  return getFallbackCatalogVideos();
}

// Build Tonight's picks (4-8 items) from cached Nollywood + Full Movies rows, falling back to open library
export function getTonightsPicksFromCache(
  cachedBySlug: Record<string, YouTubeSearchResult[]>,
  fullMoviesCache: YouTubeSearchResult[]
): YouTubeSearchResult[] {
  const nollywood = cachedBySlug['nollywood-movies'] ?? [];
  const interleaved: YouTubeSearchResult[] = [];
  const maxPairs = Math.max(nollywood.length, fullMoviesCache.length, 4);

  for (let i = 0; i < maxPairs; i++) {
    if (nollywood[i]) interleaved.push(nollywood[i]);
    if (fullMoviesCache[i]) interleaved.push(fullMoviesCache[i]);
  }

  const deduped = dedupeYouTubeVideos(interleaved);
  if (deduped.length >= 4) {
    return deduped.slice(0, 8);
  }

  return dedupeYouTubeVideos([...deduped, ...getFallbackCatalogVideos()]).slice(0, 8);
}

// Pick 1 random movie from all cached rows without repeating the last 10 Surprise Me picks
export function pickSurpriseFromCache(
  cachedBySlug: Record<string, YouTubeSearchResult[]>,
  fullMoviesCache: YouTubeSearchResult[],
  excludeCurrentId?: string
): YouTubeSearchResult | null {
  const poolRaw: YouTubeSearchResult[] = [...fullMoviesCache];
  for (const row of Object.values(cachedBySlug)) {
    if (Array.isArray(row)) {
      poolRaw.push(...row);
    }
  }

  let pool = dedupeYouTubeVideos(poolRaw);
  if (pool.length === 0) {
    pool = getFallbackCatalogVideos();
  }
  if (pool.length === 0) return null;

  const recentIds = readSurpriseHistory();
  const excluded = new Set(recentIds);
  if (excludeCurrentId) excluded.add(excludeCurrentId);

  let candidates = pool.filter((item) => !excluded.has(item.videoId));

  // If the entire cached pool was picked within the last 10 tries, keep avoiding at least the current & newest picks
  if (candidates.length === 0) {
    const minimalExclude = new Set<string>();
    if (excludeCurrentId) minimalExclude.add(excludeCurrentId);
    else if (recentIds[0]) minimalExclude.add(recentIds[0]);
    candidates = pool.filter((item) => !minimalExclude.has(item.videoId));
  }

  if (candidates.length === 0) {
    candidates = pool;
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  recordSurprisePick(chosen.videoId);
  return chosen;
}
