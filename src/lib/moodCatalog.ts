// Home mood filtering, Tonight's picks, Hero featured slides, and non-repeating Surprise Me
// Built strictly from MovieNest's 4 legal sources (zero outside sources)
import { ArchiveMovieItem } from './archive';
import {
  LegalCatalogState,
  ourPickToYouTubeResult,
} from './legalSources';
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
  keywords: string[];
  description: string;
}

export const MOOD_DEFINITIONS: MoodDefinition[] = [
  {
    id: 'laugh',
    label: 'Laugh',
    genreSlugs: ['comedy'],
    keywords: ['comedy', 'funny', 'laugh', 'hilarious', 'humor', 'humour'],
    description: 'Light comedies lined up for an easy night.',
  },
  {
    id: 'cry',
    label: 'Cry',
    genreSlugs: ['drama'],
    keywords: ['drama', 'emotional', 'tragedy', 'heartbreak', 'life'],
    description: 'Heartfelt drama and emotional stories.',
  },
  {
    id: 'thrill',
    label: 'Thrill',
    genreSlugs: ['thriller', 'horror', 'action'],
    keywords: ['thriller', 'horror', 'action', 'mystery', 'suspense', 'night', 'dead'],
    description: 'Suspense, horror, and high-stakes action.',
  },
  {
    id: 'date-night',
    label: 'Date night',
    genreSlugs: ['romance', 'nollywood'],
    keywords: ['romance', 'romantic', 'love', 'nollywood', 'nigerian', 'wedding'],
    description: 'Romance and Nollywood favorites picked for two.',
  },
  {
    id: 'family',
    label: 'Family',
    genreSlugs: ['family', 'sci-fi'],
    keywords: ['family', 'kids', 'adventure', 'animation', 'sci-fi', 'space'],
    description: 'Family-friendly films and classics for everyone.',
  },
  {
    id: 'surprise',
    label: 'Surprise me',
    genreSlugs: [],
    keywords: [],
    description: 'One random pick from the legal movie catalog.',
  },
];

export type LegalPickItem =
  | { kind: 'youtube'; video: YouTubeSearchResult }
  | { kind: 'archive'; movie: ArchiveMovieItem };

const SURPRISE_HISTORY_KEY = 'movienest_surprise_history';
const MAX_SURPRISE_HISTORY = 10;

// In-memory backup if browser blocks localStorage
let memorySurpriseHistory: string[] = [];

// Read the last 10 Surprise Me IDs safely from localStorage
export function readSurpriseHistory(): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return memorySurpriseHistory;
    }
    const raw = window.localStorage.getItem(SURPRISE_HISTORY_KEY);
    if (!raw) return memorySurpriseHistory;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const clean = parsed
      .filter((id): id is string => typeof id === 'string')
      .slice(0, MAX_SURPRISE_HISTORY);
    memorySurpriseHistory = clean;
    return clean;
  } catch {
    return memorySurpriseHistory;
  }
}

function recordSurprisePick(itemKey: string): void {
  const previous = readSurpriseHistory().filter((id) => id !== itemKey);
  const next = [itemKey, ...previous].slice(0, MAX_SURPRISE_HISTORY);
  memorySurpriseHistory = next;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SURPRISE_HISTORY_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

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

export interface HeroFeaturedMovie {
  video: YouTubeSearchResult;
  categoryLabel: string;
}

// Pick up to 4 featured movies (slides 2-5) from loaded legal YouTube sources
// (Nollywood / Action trusted rows, Our picks, and Creative Commons)
export function getHeroFeaturedMoviesFromCatalog(
  catalog: LegalCatalogState
): HeroFeaturedMovie[] {
  const nollywoodPool = dedupeYouTubeVideos(catalog.trustedByGenre['nollywood'] ?? []);
  const actionPool = dedupeYouTubeVideos(catalog.trustedByGenre['action'] ?? []);
  const ourPicksPool = dedupeYouTubeVideos(catalog.ourPicks.map(ourPickToYouTubeResult));
  const ccPool = dedupeYouTubeVideos(catalog.creativeCommons);
  const otherTrustedPool = dedupeYouTubeVideos(catalog.trustedVideos);

  const buckets: Array<{ items: YouTubeSearchResult[]; label: string }> = [
    { items: nollywoodPool, label: 'Official channel' },
    { items: ourPicksPool, label: 'Our picks' },
    { items: actionPool, label: 'Official channel' },
    { items: ccPool, label: 'Creative Commons' },
    { items: otherTrustedPool, label: 'Official channel' },
  ];

  const picked: HeroFeaturedMovie[] = [];
  const seenIds = new Set<string>();
  const cursors = buckets.map(() => 0);

  // Round-robin across available legal buckets for a varied mix
  while (picked.length < 4) {
    let addedInPass = false;

    for (let b = 0; b < buckets.length && picked.length < 4; b++) {
      const bucket = buckets[b];
      while (cursors[b] < bucket.items.length) {
        const candidate = bucket.items[cursors[b]];
        cursors[b] += 1;
        if (!candidate?.videoId || seenIds.has(candidate.videoId)) continue;
        seenIds.add(candidate.videoId);
        picked.push({
          video: {
            ...candidate,
            sourceLabel: candidate.sourceLabel ?? bucket.label,
            thumbnail: candidate.thumbnail || getYouTubeThumbnail(candidate.videoId),
          },
          categoryLabel: candidate.sourceLabel ?? bucket.label,
        });
        addedInPass = true;
        break;
      }
    }

    if (!addedInPass) break;
  }

  return picked;
}

// Build Tonight's picks (up to 8 legal movies across YouTube sources + Internet Archive)
export function getTonightsPicksFromCatalog(
  catalog: LegalCatalogState
): LegalPickItem[] {
  const ourPickVideos = catalog.ourPicks.map(ourPickToYouTubeResult);
  const youtubePool = dedupeYouTubeVideos([
    ...ourPickVideos,
    ...catalog.trustedVideos,
    ...catalog.creativeCommons,
  ]);

  const picks: LegalPickItem[] = youtubePool
    .slice(0, 8)
    .map((video) => ({ kind: 'youtube', video }));

  // Fill remaining slots up to 8 with Public domain Internet Archive movies
  if (picks.length < 8) {
    const seenArchive = new Set<string>();
    for (const movie of [...catalog.archiveClassics, ...catalog.archiveNew]) {
      if (picks.length >= 8) break;
      if (!movie.identifier || seenArchive.has(movie.identifier)) continue;
      seenArchive.add(movie.identifier);
      picks.push({ kind: 'archive', movie });
    }
  }

  return picks;
}

// Filter loaded legal sources for a Home mood pill
export function getMoodVideosFromCatalog(
  moodId: MoodId,
  catalog: LegalCatalogState
): LegalPickItem[] {
  const def = MOOD_DEFINITIONS.find((m) => m.id === moodId);
  if (!def || moodId === 'surprise') return [];

  const ytCollected: YouTubeSearchResult[] = [];
  for (const slug of def.genreSlugs) {
    const row = catalog.trustedByGenre[slug];
    if (Array.isArray(row)) ytCollected.push(...row);
  }

  // Also match Our picks and Creative Commons by mood keywords
  const extraYouTube = [
    ...catalog.ourPicks.map(ourPickToYouTubeResult),
    ...catalog.creativeCommons,
  ];
  for (const video of extraYouTube) {
    const text = `${video.title} ${video.channelTitle} ${video.description ?? ''}`.toLowerCase();
    if (def.keywords.some((kw) => text.includes(kw))) {
      ytCollected.push(video);
    }
  }

  const dedupedYt = dedupeYouTubeVideos(ytCollected);
  const results: LegalPickItem[] = dedupedYt.map((video) => ({
    kind: 'youtube',
    video,
  }));

  // Also include matching Internet Archive movies, or fallback to top Archive classics if YouTube mood list is empty
  const seenArchive = new Set<string>();
  const archiveAll = [...catalog.archiveClassics, ...catalog.archiveNew];
  for (const movie of archiveAll) {
    if (!movie.identifier || seenArchive.has(movie.identifier)) continue;
    const text = `${movie.title} ${movie.year ?? ''}`.toLowerCase();
    if (def.keywords.some((kw) => text.includes(kw))) {
      seenArchive.add(movie.identifier);
      results.push({ kind: 'archive', movie });
    }
  }

  if (results.length === 0) {
    for (const movie of archiveAll.slice(0, 8)) {
      if (!movie.identifier || seenArchive.has(movie.identifier)) continue;
      seenArchive.add(movie.identifier);
      results.push({ kind: 'archive', movie });
    }
  }

  return results;
}

// Pick 1 random movie from all 4 legal sources without repeating the last 10 picks
export function pickSurpriseFromCatalog(
  catalog: LegalCatalogState,
  excludeCurrentId?: string
): LegalPickItem | null {
  const youtubePool = dedupeYouTubeVideos([
    ...catalog.trustedVideos,
    ...catalog.ourPicks.map(ourPickToYouTubeResult),
    ...catalog.creativeCommons,
  ]);

  const seenArchive = new Set<string>();
  const archivePool: ArchiveMovieItem[] = [];
  for (const movie of [...catalog.archiveNew, ...catalog.archiveClassics]) {
    if (!movie.identifier || seenArchive.has(movie.identifier)) continue;
    seenArchive.add(movie.identifier);
    archivePool.push(movie);
  }

  const pool: Array<{ key: string; item: LegalPickItem }> = [
    ...youtubePool.map((video) => ({
      key: `yt:${video.videoId}`,
      item: { kind: 'youtube', video } as LegalPickItem,
    })),
    ...archivePool.map((movie) => ({
      key: `ar:${movie.identifier}`,
      item: { kind: 'archive', movie } as LegalPickItem,
    })),
  ];

  if (pool.length === 0) return null;

  const recentIds = readSurpriseHistory();
  const excluded = new Set(recentIds);
  if (excludeCurrentId) {
    excluded.add(`yt:${excludeCurrentId}`);
    excluded.add(`ar:${excludeCurrentId}`);
    excluded.add(excludeCurrentId);
  }

  let candidates = pool.filter((entry) => !excluded.has(entry.key));
  if (candidates.length === 0 && excludeCurrentId) {
    candidates = pool.filter(
      (entry) =>
        entry.key !== `yt:${excludeCurrentId}` && entry.key !== `ar:${excludeCurrentId}`
    );
  }
  if (candidates.length === 0) {
    candidates = pool;
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  recordSurprisePick(chosen.key);
  return chosen.item;
}
