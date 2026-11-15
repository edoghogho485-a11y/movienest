import { getSearchCache, upsertSearchCache } from './supabase';

// Cache Archive results for 24 hours (in milliseconds)
const ARCHIVE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ArchiveMovieItem {
  identifier: string;
  title: string;
  year?: string;
  addeddate?: string;
  addedAt?: string;
  thumbnail: string;
}

export interface ArchiveGenreDefinition {
  slug: 'archive-new' | 'archive-classics';
  name: string;
  query: string;
  sort: 'addeddate desc' | 'downloads desc';
}

// Two public-domain Internet Archive movie rows (no API key needed)
export const ARCHIVE_GENRE_LIST: ArchiveGenreDefinition[] = [
  {
    slug: 'archive-new',
    name: 'Recently added',
    query: 'mediatype:movies AND collection:feature_films',
    sort: 'addeddate desc',
  },
  {
    slug: 'archive-classics',
    name: 'Classics',
    query: 'mediatype:movies AND collection:feature_films',
    sort: 'downloads desc',
  },
];

export function getArchiveThumbnail(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

// Only allow Archive streams served directly from https://archive.org/download/
export function isValidArchiveDownloadUrl(
  url: string | null | undefined
): url is string {
  return typeof url === 'string' && url.startsWith('https://archive.org/download/');
}

function normalizeArchiveItems(items: ArchiveMovieItem[]): ArchiveMovieItem[] {
  return items.map((item) => ({
    ...item,
    addedAt: item.addedAt ?? item.addeddate,
  }));
}

// Fetch Internet Archive advancedsearch.php with 24-hour Supabase search_cache support
export async function searchArchiveWithCache(
  archiveQuery: string,
  cacheKey: string,
  sort = 'downloads desc'
): Promise<{ results: ArchiveMovieItem[]; error: boolean }> {
  const cached = await getSearchCache<ArchiveMovieItem>(cacheKey);

  if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
    const fetchedAtMs = Date.parse(cached.fetched_at);
    const isFresh =
      !Number.isNaN(fetchedAtMs) &&
      Date.now() - fetchedAtMs < ARCHIVE_CACHE_MAX_AGE_MS;
    if (isFresh) {
      return { results: normalizeArchiveItems(cached.results), error: false };
    }
  }

  try {
    const params = new URLSearchParams();
    params.set('q', archiveQuery);
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'year');
    params.append('fl[]', 'addeddate');
    params.append('sort[]', sort);
    params.set('rows', '24');
    params.set('output', 'json');

    const response = await fetch(
      `https://archive.org/advancedsearch.php?${params.toString()}`
    );

    if (!response.ok) {
      if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
        return { results: normalizeArchiveItems(cached.results), error: false };
      }
      return { results: [], error: true };
    }

    const payload = (await response.json()) as {
      response?: {
        docs?: Array<{
          identifier?: string;
          title?: string | string[];
          year?: string | number;
          addeddate?: string;
        }>;
      };
    };

    const docs = payload.response?.docs ?? [];
    const mapped: ArchiveMovieItem[] = docs
      .filter((doc) => typeof doc.identifier === 'string' && doc.identifier.trim().length > 0)
      .map((doc) => {
        const identifier = doc.identifier!.trim();
        const rawTitle = Array.isArray(doc.title) ? doc.title[0] : doc.title;
        const addeddate = typeof doc.addeddate === 'string' ? doc.addeddate : undefined;
        return {
          identifier,
          title: (rawTitle && String(rawTitle).trim()) || identifier,
          year: doc.year !== undefined ? String(doc.year) : undefined,
          addeddate,
          addedAt: addeddate,
          thumbnail: getArchiveThumbnail(identifier),
        };
      });

    if (mapped.length > 0) {
      void upsertSearchCache(cacheKey, mapped);
    }

    return { results: mapped, error: false };
  } catch {
    if (cached && Array.isArray(cached.results) && cached.results.length > 0) {
      return { results: normalizeArchiveItems(cached.results), error: false };
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

    const mp4Url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedFilename}`;
    return {
      mp4Url: isValidArchiveDownloadUrl(mp4Url) ? mp4Url : null,
      title,
      year,
    };
  } catch {
    return { mp4Url: null, title: null };
  }
}
