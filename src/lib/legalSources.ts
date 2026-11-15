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
  fetchCreativeCommonsMoviesWithCache,
  fetchTrustedChannelMoviesWithCache,
  getYouTubeThumbnail,
  YouTubeSearchResult,
} from './youtube';

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
  };
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

// Load all 4 legal movie sources in parallel, respecting each source's Supabase cache window
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

  const trustedVideos = dedupeYouTubeResults(
    trustedChannelBatches.flatMap((batch) => batch.results)
  );

  return {
    trustedVideos,
    trustedByGenre: groupTrustedVideosByGenre(trustedVideos),
    creativeCommons: dedupeYouTubeResults(ccRes.results),
    archiveNew: archiveNewRes.results,
    archiveClassics: archiveClassicsRes.results,
    ourPicks: libraryRes.items,
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
