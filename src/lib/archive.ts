import { getSearchCache, upsertSearchCache } from './supabase';

// Cache Archive search results for 72 hours (in milliseconds)
const ARCHIVE_CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export interface ArchiveMovieItem {
  identifier: string;
  title: string;
  year?: string;
  thumbnail: string;
}

export interface ArchiveGenreDefinition {
  slug: string;
  name: string;
  query: string;
}

// 5 Classic / Public Domain rows powered by Internet Archive (no API key needed)
export const ARCHIVE_GENRE_LIST: ArchiveGenreDefinition[] = [
  {
    slug: 'classic-movies',
    name: 'Classic Movies',
    query: 'mediatype:movies AND collection:feature_films',
  },
  {
    slug: 'sci-fi-classics',
    name: 'Sci-Fi Classics',
    query: 'mediatype:movies AND collection:feature_films AND subject:(sci-fi OR "science fiction")',
  },
  {
    slug: 'horror-classics',
    name: 'Horror Classics',
    query: 'mediatype:movies AND collection:feature_films AND subject:horror',
  },
  {
    slug: 'comedy-classics',
    name: 'Comedy Classics',
    query: 'mediatype:movies AND collection:feature_films AND subject:comedy',
  },
  {
    slug: 'cartoons',
    name: 'Cartoons',
    query: 'mediatype:movies AND collection:feature_films AND subject:(animation OR cartoon OR cartoons)',
  },
];

export function getArchiveThumbnail(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

// Search Internet Archive advancedsearch.php with 72-hour Supabase search_cache caching
export async function searchArchiveWithCache(
  archiveQuery: string,
  cacheSlug: string
): Promise<{ results: ArchiveMovieItem[]; error: boolean }> {
  const cacheKey = `archive:${cacheSlug}`;
  const cached = await getSearchCache<ArchiveMovieItem>(cacheKey);

  if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
    const fetchedAtMs = Date.parse(cached.fetched_at);
    const isFresh =
      !Number.isNaN(fetchedAtMs) &&
      Date.now() - fetchedAtMs < ARCHIVE_CACHE_MAX_AGE_MS;
    if (isFresh) {
      return { results: cached.results, error: false };
    }
  }

  try {
    const params = new URLSearchParams();
    params.set('q', archiveQuery);
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'year');
    params.append('sort[]', 'downloads desc');
    params.set('rows', '12');
    params.set('page', '1');
    params.set('output', 'json');

    const response = await fetch(
      `https://archive.org/advancedsearch.php?${params.toString()}`
    );

    if (!response.ok) {
      if (cached && cached.results.length > 0) {
        return { results: cached.results, error: false };
      }
      return { results: [], error: true };
    }

    const payload = (await response.json()) as {
      response?: {
        docs?: Array<{
          identifier?: string;
          title?: string | string[];
          year?: string | number;
        }>;
      };
    };

    const docs = payload.response?.docs ?? [];
    const mapped: ArchiveMovieItem[] = docs
      .filter((doc) => typeof doc.identifier === 'string' && doc.identifier.trim().length > 0)
      .map((doc) => {
        const identifier = doc.identifier!.trim();
        const rawTitle = Array.isArray(doc.title) ? doc.title[0] : doc.title;
        return {
          identifier,
          title: (rawTitle && String(rawTitle).trim()) || identifier,
          year: doc.year !== undefined ? String(doc.year) : undefined,
          thumbnail: getArchiveThumbnail(identifier),
        };
      });

    if (mapped.length > 0) {
      void upsertSearchCache(cacheKey, mapped);
    }

    return { results: mapped, error: false };
  } catch {
    if (cached && cached.results.length > 0) {
      return { results: cached.results, error: false };
    }
    return { results: [], error: true };
  }
}

export interface ArchiveMetadataResult {
  mp4Url: string | null;
  title: string | null;
  year?: string;
}

// Fetch https://archive.org/metadata/IDENTIFIER, pick the first .mp4 file, and build the download URL
export async function fetchArchiveMovieDetails(
  identifier: string
): Promise<ArchiveMetadataResult> {
  try {
    const response = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(identifier)}`
    );
    if (!response.ok) {
      return { mp4Url: null, title: null };
    }

    const data = (await response.json()) as {
      metadata?: {
        title?: string | string[];
        year?: string | number;
      };
      files?: Array<{
        name?: string;
        format?: string;
      }>;
    };

    const rawTitle = Array.isArray(data.metadata?.title)
      ? data.metadata?.title[0]
      : data.metadata?.title;
    const title = rawTitle ? String(rawTitle).trim() : null;
    const year =
      data.metadata?.year !== undefined ? String(data.metadata.year) : undefined;

    const files = Array.isArray(data.files) ? data.files : [];
    const firstMp4 = files.find(
      (file) => typeof file.name === 'string' && file.name.toLowerCase().endsWith('.mp4')
    );

    if (!firstMp4?.name) {
      return { mp4Url: null, title, year };
    }

    // Encode each path segment cleanly in case filenames contain spaces or symbols
    const encodedFilename = firstMp4.name
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return {
      mp4Url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedFilename}`,
      title,
      year,
    };
  } catch {
    return { mp4Url: null, title: null };
  }
}
