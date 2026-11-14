import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Film, Share2 } from 'lucide-react';
import { GENRE_LIST, GenreDefinition } from '../data/genres';
import {
  ARCHIVE_GENRE_LIST,
  ArchiveGenreDefinition,
  ArchiveMovieItem,
  searchArchiveWithCache,
} from '../lib/archive';
import {
  SHARED_LIBRARY_CATEGORIES,
  SharedLibraryItem,
} from '../lib/supabase';
import {
  getYouTubeThumbnail,
  searchYouTubeWithCache,
  YouTubeSearchResult,
} from '../lib/youtube';
import { ArchiveMovieCard } from './ArchiveMovieCard';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface GenreRowsProps {
  forceLoadSlug: string | null;
  libraryItems: SharedLibraryItem[];
  libraryLoading: boolean;
  onSeeAllGenre: (genre: GenreDefinition, videos: YouTubeSearchResult[]) => void;
  onSeeAllArchiveGenre: (
    genre: ArchiveGenreDefinition,
    movies: ArchiveMovieItem[]
  ) => void;
  onWatchYouTube: (video: YouTubeSearchResult) => void;
  onCreateRoomYouTube: (video: YouTubeSearchResult) => void;
  onShareYouTube: (video: YouTubeSearchResult) => void;
  onWatchArchive: (movie: ArchiveMovieItem) => void;
  onCreateRoomArchive: (movie: ArchiveMovieItem) => void;
  onShareArchive: (movie: ArchiveMovieItem) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
  onWatchLibraryItem: (item: SharedLibraryItem) => void;
  onShareLibraryItem: (item: SharedLibraryItem) => void;
}

// Single lazy-loaded YouTube genre row (fetches only when scrolled into view or jumped to)
function LazyGenreRow({
  genre,
  forceLoad,
  onSeeAll,
  onWatch,
  onCreateRoom,
  onShare,
  onSavedToLibrary,
}: {
  genre: GenreDefinition;
  forceLoad: boolean;
  onSeeAll: (genre: GenreDefinition, videos: YouTubeSearchResult[]) => void;
  onWatch: (video: YouTubeSearchResult) => void;
  onCreateRoom: (video: YouTubeSearchResult) => void;
  onShare: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(forceLoad);
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<YouTubeSearchResult[] | null>(null);

  useEffect(() => {
    if (forceLoad) {
      setShouldLoad(true);
    }
  }, [forceLoad]);

  // Observe when row nears the viewport before querying Supabase cache / YouTube API
  useEffect(() => {
    if (shouldLoad) return;
    const el = rowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '260px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || videos !== null) return;

    let cancelled = false;
    setLoading(true);

    searchYouTubeWithCache(genre.query).then(({ results }) => {
      if (cancelled) return;
      setVideos(results);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, videos, genre.query]);

  // Hide row completely when API/quota fails and no cached data exists
  if (videos !== null && videos.length === 0) {
    return null;
  }

  return (
    <div id={`genre-${genre.slug}`} ref={rowRef} className="scroll-mt-20">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-display text-lg font-semibold text-white">
          {genre.name}
        </h3>

        {videos && videos.length > 0 && (
          <button
            type="button"
            onClick={() => onSeeAll(genre, videos)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:text-[#E50914] active:bg-[#20202a] cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>See all</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {!shouldLoad || loading || videos === null ? (
        <div className="mt-3 flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((slot) => (
            <div
              key={slot}
              className="w-[240px] sm:w-[270px] shrink-0 rounded-xl border border-white/10 bg-[#111116] p-2.5 animate-pulse"
            >
              <div className="aspect-video w-full rounded-lg bg-[#1A1A22]" />
              <div className="mt-3 h-4 w-3/4 rounded bg-[#1A1A22]" />
              <div className="mt-2 h-3 w-1/2 rounded bg-[#1A1A22]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
          {videos.map((video) => (
            <YouTubeMovieCard
              key={`${genre.slug}-${video.videoId}`}
              video={video}
              defaultCategory={genre.defaultCategory}
              className="w-[240px] sm:w-[270px] shrink-0 snap-start"
              onWatch={onWatch}
              onCreateRoom={onCreateRoom}
              onShare={onShare}
              onSavedToLibrary={onSavedToLibrary}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Single lazy-loaded Internet Archive genre row (no API key needed, cached 72h in search_cache)
function LazyArchiveGenreRow({
  genre,
  forceLoad,
  onSeeAll,
  onWatch,
  onCreateRoom,
  onShare,
}: {
  genre: ArchiveGenreDefinition;
  forceLoad: boolean;
  onSeeAll: (genre: ArchiveGenreDefinition, movies: ArchiveMovieItem[]) => void;
  onWatch: (movie: ArchiveMovieItem) => void;
  onCreateRoom: (movie: ArchiveMovieItem) => void;
  onShare: (movie: ArchiveMovieItem) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(forceLoad);
  const [loading, setLoading] = useState(false);
  const [movies, setMovies] = useState<ArchiveMovieItem[] | null>(null);

  useEffect(() => {
    if (forceLoad) {
      setShouldLoad(true);
    }
  }, [forceLoad]);

  useEffect(() => {
    if (shouldLoad) return;
    const el = rowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '260px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || movies !== null) return;

    let cancelled = false;
    setLoading(true);

    searchArchiveWithCache(genre.query, genre.slug).then(({ results }) => {
      if (cancelled) return;
      setMovies(results);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, movies, genre.query, genre.slug]);

  if (movies !== null && movies.length === 0) {
    return null;
  }

  return (
    <div id={`genre-${genre.slug}`} ref={rowRef} className="scroll-mt-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h3 className="font-display text-lg font-semibold text-white">
            {genre.name}
          </h3>
          <span className="rounded-md border border-[#2a2a33] bg-[#14141a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
            Archive
          </span>
        </div>

        {movies && movies.length > 0 && (
          <button
            type="button"
            onClick={() => onSeeAll(genre, movies)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:text-[#E50914] active:bg-[#20202a] cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>See all</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {!shouldLoad || loading || movies === null ? (
        <div className="mt-3 flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((slot) => (
            <div
              key={slot}
              className="w-[240px] sm:w-[270px] shrink-0 rounded-xl border border-white/10 bg-[#111116] p-2.5 animate-pulse"
            >
              <div className="aspect-video w-full rounded-lg bg-[#1A1A22]" />
              <div className="mt-3 h-4 w-3/4 rounded bg-[#1A1A22]" />
              <div className="mt-2 h-3 w-1/2 rounded bg-[#1A1A22]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
          {movies.map((movie) => (
            <ArchiveMovieCard
              key={`${genre.slug}-${movie.identifier}`}
              movie={movie}
              className="w-[240px] sm:w-[270px] shrink-0 snap-start"
              onWatch={onWatch}
              onCreateRoom={onCreateRoom}
              onShare={onShare}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SharedLibraryCard({
  item,
  onWatch,
  onShare,
}: {
  item: SharedLibraryItem;
  onWatch: (item: SharedLibraryItem) => void;
  onShare: (item: SharedLibraryItem) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="w-[220px] sm:w-[250px] shrink-0 snap-start flex flex-col">
      <button
        type="button"
        onClick={() => onWatch(item)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] active:opacity-80 rounded-xl cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#2a2a33] bg-[#14141a] transition-colors group-hover:border-[#E50914]">
          {!imgError ? (
            <img
              src={getYouTubeThumbnail(item.video_id)}
              alt={item.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14141a] p-3">
              <Film className="h-6 w-6 text-[#E50914]" aria-hidden="true" />
              <span className="text-xs font-medium text-zinc-200 text-center line-clamp-1">
                {item.title}
              </span>
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent"
            aria-hidden="true"
          />
        </div>
        <h4 className="mt-2 font-display text-sm font-semibold text-zinc-100 line-clamp-1 group-hover:text-[#E50914] transition-colors">
          {item.title}
        </h4>
      </button>

      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-400 truncate">{item.category}</p>
        <button
          type="button"
          onClick={() => onShare(item)}
          aria-label={`Share ${item.title}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2a2a33] bg-[#14141a] text-zinc-300 transition-colors hover:border-white/30 hover:text-white active:bg-[#252530] cursor-pointer"
        >
          <Share2 className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function GenreRows({
  forceLoadSlug,
  libraryItems,
  libraryLoading,
  onSeeAllGenre,
  onSeeAllArchiveGenre,
  onWatchYouTube,
  onCreateRoomYouTube,
  onShareYouTube,
  onWatchArchive,
  onCreateRoomArchive,
  onShareArchive,
  onSavedToLibrary,
  onWatchLibraryItem,
  onShareLibraryItem,
}: GenreRowsProps) {
  const nonEmptyLibraryCategories = SHARED_LIBRARY_CATEGORIES.map((category) => ({
    category,
    items: libraryItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <section
      aria-label="Browse movies by genre"
      className="space-y-8 px-4 py-4 sm:px-6 lg:px-8"
    >
      {/* YouTube genre rows */}
      {GENRE_LIST.map((genre) => (
        <LazyGenreRow
          key={genre.slug}
          genre={genre}
          forceLoad={forceLoadSlug === genre.slug}
          onSeeAll={onSeeAllGenre}
          onWatch={onWatchYouTube}
          onCreateRoom={onCreateRoomYouTube}
          onShare={onShareYouTube}
          onSavedToLibrary={onSavedToLibrary}
        />
      ))}

      {/* 5 Internet Archive Classic Movie rows (no API key needed) */}
      {ARCHIVE_GENRE_LIST.map((genre) => (
        <LazyArchiveGenreRow
          key={genre.slug}
          genre={genre}
          forceLoad={forceLoadSlug === genre.slug}
          onSeeAll={onSeeAllArchiveGenre}
          onWatch={onWatchArchive}
          onCreateRoom={onCreateRoomArchive}
          onShare={onShareArchive}
        />
      ))}

      {/* Non-empty Shared Library rows */}
      {!libraryLoading &&
        nonEmptyLibraryCategories.map((group) => (
          <div key={group.category}>
            <h3 className="font-display text-lg font-semibold text-white">
              Saved · {group.category}
            </h3>
            <div className="mt-3 flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
              {group.items.map((item) => (
                <SharedLibraryCard
                  key={item.id}
                  item={item}
                  onWatch={onWatchLibraryItem}
                  onShare={onShareLibraryItem}
                />
              ))}
            </div>
          </div>
        ))}
    </section>
  );
}
