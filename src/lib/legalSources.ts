// Coordinates MovieNest's 4 legal movie sources and keyword genre grouping:
// 1. Trusted YouTube Channels (24h cache)
// 2. Creative Commons YouTube search (72h cache)
// 3. Internet Archive Recently added & Classics (24h cache)
// 4. Our picks from Supabase "library" table (approved = true)
import { trustedChannels } from '../config/trustedChannels';
import {
  ARCHIVE_GENRE_LIST,
  ArchiveMovieItem,
  searchArchiveWithCache,
} from './archive';
import {
  fetchSharedLibrary,
  SharedLibraryItem,
} from './supabase';
import {
  checkPlayableYouTubeIdsWithCache,
  fetchCreativeCommonsMoviesWithCache,
  fetchTrustedChannelMoviesWithCache,
  getYouTubeThumbnail,
  YouTubeSearchResult,
} from './youtube';
import { makeBrokenVideoKey } from './brokenVideos';
import { isNewVideo, parseAddedAtMs } from './freshness';

export interface TrustedGenreRowDefinition {
  slug: string;
  name: string;
  keywords: string[];
}

// Existing genre rows populated by keyword matching on trusted-channel videos
export const TRUSTED_GENRE_DEFINITIONS: TrustedGenreRowDefinition[] = [
  {
    slug: 'nollywood',
    name: 'Nollywood',
    keywords: ['nollywood', 'nigerian'],
  },
  {
    slug: 'action',
    name: 'Action',
    keywords: [
      'action',
      'fight',
      'agent',
      'mission',
      'soldier',
      'war',
      'assassin',
      'revenge',
    ],
  },
  {
    slug: 'thriller',
    name: 'Thriller',
    keywords: [
      'thriller',
      'suspense',
      'mystery',
      'crime',
      'detective',
      'murder',
      'spy',
      'hostage',
      'conspiracy',
    ],
  },
  {
    slug: 'comedy',
    name: 'Comedy',
    keywords: [
      'comedy',
      'funny',
      'laugh',
      'hilarious',
      'humor',
      'humour',
      'parody',
      'sitcom',
      'romcom',
    ],
  },
  {
    slug: 'drama',
    name: 'Drama',
    keywords: [
      'drama',
      'emotional',
      'tragedy',
      'heartbreak',
      'struggle',
      'biopic',
      'biography',
      'melodrama',
    ],
  },
  {
    slug: 'romance',
    name: 'Romance',
    keywords: [
      'romance',
      'romantic',
      'love story',
      'wedding',
      'bride',
      'lover',
      'affair',
    ],
  },
  {
    slug: 'horror',
    name: 'Horror',
    keywords: [
      'horror',
      'scary',
      'ghost',
      'haunted',
      'demon',
      'zombie',
      'vampire',
      'slasher',
      'nightmare',
      'supernatural',
    ],
  },
  {
    slug: 'sci-fi',
    name: 'Sci-Fi',
    keywords: [
      'sci-fi',
      'scifi',
      'science fiction',
      'space',
      'alien',
      'aliens',
      'future',
      'robot',
      'galaxy',
      'cyber',
      'time travel',
    ],
  },
  {
    slug: 'family',
    name: 'Family',
    keywords: [
      'family',
      'kids',
      'children',
      'animation',
      'animated',
      'cartoon',
      'christmas',
      'holiday',
    ],
  },
];

export interface LegalCatalogState {
  trustedVideos: YouTubeSearchResult[];
  trustedByGenre: Record<string, YouTubeSearchResult[]>;
  creativeCommons: YouTubeSearchResult[];
  archiveNew: ArchiveMovieItem[];
  archiveClassics: ArchiveMovieItem[];
  ourPicks: SharedLibraryItem[];
}

export const EMPTY_LEGAL_CATALOG: LegalCatalogState = {
  trustedVideos: [],
  trustedByGenre: {},
  creativeCommons: [],
  archiveNew: [],
  archiveClassics: [],
  ourPicks: [],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAnyKeyword(haystack: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    const pattern = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i');
    if (pattern.test(haystack)) {
      return true;
    }
  }
  return false;
}

// Group trusted-channel videos into genre rows using keywords in title, description, and tags.
// Empty rows are omitted so the UI never displays empty sections.
export function groupTrustedVideosByGenre(
  videos: YouTubeSearchResult[]
): Record<string, YouTubeSearchResult[]> {
  if (videos.length === 0) return {};

  const grouped: Record<string, YouTubeSearchResult[]> = {};

  for (const video of videos) {
    const haystack = [
      video.title,
      video.description ?? '',
      ...(video.tags ?? []),
    ]
      .join(' ')
      .toLowerCase();

    for (const genre of TRUSTED_GENRE_DEFINITIONS) {
      if (matchesAnyKeyword(haystack, genre.keywords)) {
        if (!grouped[genre.slug]) {
          grouped[genre.slug] = [];
        }
        if (!grouped[genre.slug].some((item) => item.videoId === video.videoId)) {
          grouped[genre.slug].push(video);
        }
      }
    }
  }

  return grouped;
}

// Convert an approved "Our picks" Supabase row into a YouTubeSearchResult card item
export function ourPickToYouTubeResult(item: SharedLibraryItem): YouTubeSearchResult {
  return {
    videoId: item.video_id,
    title: item.title,
    channelTitle: item.credit || item.category || 'Our picks',
    thumbnail: getYouTubeThumbnail(item.video_id),
    sourceLabel: 'Our picks',
    addedAt: item.addedAt ?? item.created_at,
  };
}

// Resolve a human-readable source label for any video shown on cards or in the room header
export function getVideoSourceLabel(
  videoId: string,
  sourceType: 'youtube' | 'archive',
  catalog?: LegalCatalogState | null
): string {
  if (sourceType === 'archive') {
    return 'Public domain';
  }
  if (!catalog || !videoId) {
    return 'YouTube';
  }
  if (catalog.trustedVideos.some((v) => v.videoId === videoId)) {
    return 'Official channel';
  }
  if (catalog.creativeCommons.some((v) => v.videoId === videoId)) {
    return 'Creative Commons';
  }
  if (catalog.ourPicks.some((v) => v.video_id === videoId)) {
    return 'Our picks';
  }
  return 'YouTube';
}

// Hide videos that failed playback on this device from every catalog list and genre row
export function filterCatalogByBrokenVideos(
  catalog: LegalCatalogState,
  brokenKeys: Set<string>
): LegalCatalogState {
  if (brokenKeys.size === 0) return catalog;

  const isYtAllowed = (videoId: string) =>
    !brokenKeys.has(makeBrokenVideoKey('youtube', videoId));
  const isArchiveAllowed = (identifier: string) =>
    !brokenKeys.has(makeBrokenVideoKey('archive', identifier));

  const trustedVideos = catalog.trustedVideos.filter((v) => isYtAllowed(v.videoId));
  return {
    trustedVideos,
    trustedByGenre: groupTrustedVideosByGenre(trustedVideos),
    creativeCommons: catalog.creativeCommons.filter((v) => isYtAllowed(v.videoId)),
    archiveNew: catalog.archiveNew.filter((m) => isArchiveAllowed(m.identifier)),
    archiveClassics: catalog.archiveClassics.filter((m) => isArchiveAllowed(m.identifier)),
    ourPicks: catalog.ourPicks.filter((i) => isYtAllowed(i.video_id)),
  };
}

export type NewThisWeekItem =
  | { kind: 'youtube'; video: YouTubeSearchResult; addedAtMs: number }
  | { kind: 'archive'; movie: ArchiveMovieItem; addedAtMs: number };

// Merge videos added in the last 14 days from all 4 legal sources, newest first, up to 12
export function getNewThisWeekItems(catalog: LegalCatalogState): NewThisWeekItem[] {
  const seenKeys = new Set<string>();
  const collected: NewThisWeekItem[] = [];

  const ytCandidates = [
    ...catalog.trustedVideos,
    ...catalog.ourPicks.map(ourPickToYouTubeResult),
    ...catalog.creativeCommons,
  ];

  for (const video of ytCandidates) {
    if (!video.videoId) continue;
    const key = `youtube:${video.videoId}`;
    if (seenKeys.has(key)) continue;
    if (!isNewVideo(video.addedAt)) continue;
    const addedAtMs = parseAddedAtMs(video.addedAt);
    if (addedAtMs === null) continue;
    seenKeys.add(key);
    collected.push({ kind: 'youtube', video, addedAtMs });
  }

  for (const movie of [...catalog.archiveNew, ...catalog.archiveClassics]) {
    if (!movie.identifier) continue;
    const key = `archive:${movie.identifier}`;
    if (seenKeys.has(key)) continue;
    const dateValue = movie.addedAt ?? movie.addeddate;
    if (!isNewVideo(dateValue)) continue;
    const addedAtMs = parseAddedAtMs(dateValue);
    if (addedAtMs === null) continue;
    seenKeys.add(key);
    collected.push({
      kind: 'archive',
      movie: { ...movie, addedAt: dateValue },
      addedAtMs,
    });
  }

  collected.sort((a, b) => b.addedAtMs - a.addedAtMs);
  return collected.slice(0, 12);
}

// Deduplicate YouTube videos by videoId preserving order
function dedupeYouTubeResults(items: YouTubeSearchResult[]): YouTubeSearchResult[] {
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

// Load all 4 legal movie sources in parallel, respecting each source's 24h/72h cache & status checks
export async function loadAllLegalSources(): Promise<LegalCatalogState> {
  const cleanHandles = trustedChannels
    .map((handle) => handle.trim())
    .filter(Boolean);

  const archiveNewDef = ARCHIVE_GENRE_LIST[0];
  const archiveClassicsDef = ARCHIVE_GENRE_LIST[1];

  const [
    trustedChannelBatches,
    ccRes,
    archiveNewRes,
    archiveClassicsRes,
    libraryRes,
  ] = await Promise.all([
    cleanHandles.length > 0
      ? Promise.all(cleanHandles.map((handle) => fetchTrustedChannelMoviesWithCache(handle)))
      : Promise.resolve([]),
    fetchCreativeCommonsMoviesWithCache(),
    searchArchiveWithCache(archiveNewDef.query, archiveNewDef.slug, archiveNewDef.sort),
    searchArchiveWithCache(
      archiveClassicsDef.query,
      archiveClassicsDef.slug,
      archiveClassicsDef.sort
    ),
    fetchSharedLibrary(),
  ]);

  // Re-check "Our picks" every 24h to drop any video that is no longer public or embeddable
  let filteredOurPicks = libraryRes.items;
  if (filteredOurPicks.length > 0) {
    const statusMap = await checkPlayableYouTubeIdsWithCache(
      filteredOurPicks.map((item) => item.video_id),
      'library-status'
    );
    if (statusMap) {
      filteredOurPicks = filteredOurPicks.filter((item) => {
        const status = statusMap.get(item.video_id);
        return !status || status.playable;
      });
    }
  }

  const trustedVideos = dedupeYouTubeResults(
    trustedChannelBatches.flatMap((batch) => batch.results)
  );

  return {
    trustedVideos,
    trustedByGenre: groupTrustedVideosByGenre(trustedVideos),
    creativeCommons: dedupeYouTubeResults(ccRes.results),
    archiveNew: archiveNewRes.results,
    archiveClassics: archiveClassicsRes.results,
    ourPicks: filteredOurPicks,
  };
}

// Search strictly within the 4 loaded legal movie sources (never calls outside sources)
export function searchLegalCatalog(
  catalog: LegalCatalogState,
  rawQuery: string
): {
  youtube: YouTubeSearchResult[];
  archive: ArchiveMovieItem[];
} {
  const terms = rawQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return { youtube: [], archive: [] };
  }

  const allYouTube = dedupeYouTubeResults([
    ...catalog.trustedVideos,
    ...catalog.ourPicks.map(ourPickToYouTubeResult),
    ...catalog.creativeCommons,
  ]);

  const youtube = allYouTube.filter((video) => {
    const text = [
      video.title,
      video.channelTitle,
      video.description ?? '',
      ...(video.tags ?? []),
      video.sourceLabel ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  });

  const seenArchive = new Set<string>();
  const archive: ArchiveMovieItem[] = [];
  for (const movie of [...catalog.archiveNew, ...catalog.archiveClassics]) {
    if (!movie.identifier || seenArchive.has(movie.identifier)) continue;
    const text = `${movie.title} ${movie.year ?? ''} public domain`.toLowerCase();
    if (terms.every((term) => text.includes(term))) {
      seenArchive.add(movie.identifier);
      archive.push(movie);
    }
  }

  return { youtube, archive };
}
