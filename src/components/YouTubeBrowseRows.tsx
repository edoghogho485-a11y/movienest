import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SharedLibraryCategory, SharedLibraryItem } from '../lib/supabase';
import { searchYouTubeWithCache, YouTubeSearchResult } from '../lib/youtube';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface BrowseRowConfig {
  title: string;
  query: string;
  defaultCategory: SharedLibraryCategory;
}

// Home page YouTube browse rows — Nollywood first
const BROWSE_ROWS: BrowseRowConfig[] = [
  {
    title: 'Nollywood Movies',
    query: 'full Nollywood movie 2026',
    defaultCategory: 'Nollywood',
  },
  {
    title: 'New Nollywood Releases',
    query: 'new Nollywood movie',
    defaultCategory: 'Nollywood',
  },
  {
    title: 'Full Movies',
    query: 'full movie',
    defaultCategory: 'Movies',
  },
  {
    title: 'Animation',
    query: 'full animated movie',
    defaultCategory: 'Animation',
  },
];

interface YouTubeBrowseRowsProps {
  onWatch: (video: YouTubeSearchResult) => void;
  onCreateRoom: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
  onFocusPasteBar: () => void;
}

function BrowseRow({
  config,
  onWatch,
  onCreateRoom,
  onSavedToLibrary,
  onFocusPasteBar,
}: {
  config: BrowseRowConfig;
  onWatch: (video: YouTubeSearchResult) => void;
  onCreateRoom: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
  onFocusPasteBar: () => void;
}) {
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    searchYouTubeWithCache(config.query).then((res) => {
      if (!active) return;
      setResults(res.results);
      setError(res.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [config.query]);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const container = scrollRef.current;
    if (!container) return;
    const distance = Math.min(container.clientWidth * 0.75, 620);
    container.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <div className="py-5 sm:py-6">
      <div className="mb-3.5 flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
          {config.title}
        </h2>

        {!loading && !error && results.length > 0 && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollByAmount('left')}
              aria-label={`Scroll ${config.title} left`}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#111625] text-slate-200 transition-colors hover:border-white/30 hover:bg-[#161D30] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByAmount('right')}
              aria-label={`Scroll ${config.title} right`}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#111625] text-slate-200 transition-colors hover:border-white/30 hover:bg-[#161D30] cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-[#0D121F] px-4 py-6 text-sm text-slate-400">
          Loading {config.title}...
        </div>
      ) : error ? (
        <button
          type="button"
          onClick={onFocusPasteBar}
          className="w-full rounded-xl border border-white/10 bg-[#0D121F] px-4 py-6 text-left text-sm text-slate-300 transition-colors hover:border-amber-400/50 cursor-pointer"
        >
          Search is resting, try again tomorrow, or paste a link
        </button>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#0D121F] px-4 py-6 text-sm text-slate-400">
          No movies available right now. Try pasting a YouTube link above.
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:gap-5 sm:px-0"
        >
          {results.map((video) => (
            <YouTubeMovieCard
              key={video.videoId}
              video={video}
              defaultCategory={config.defaultCategory}
              className="w-[74vw] max-w-[300px] sm:w-[280px] lg:w-[296px] shrink-0 snap-start"
              onWatch={onWatch}
              onCreateRoom={onCreateRoom}
              onSavedToLibrary={onSavedToLibrary}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function YouTubeBrowseRows({
  onWatch,
  onCreateRoom,
  onSavedToLibrary,
  onFocusPasteBar,
}: YouTubeBrowseRowsProps) {
  return (
    <section
      aria-label="Browse YouTube Movies"
      className="mx-auto max-w-6xl px-4 py-2 sm:px-6 lg:px-8 divide-y divide-white/10"
    >
      {BROWSE_ROWS.map((config) => (
        <BrowseRow
          key={config.title}
          config={config}
          onWatch={onWatch}
          onCreateRoom={onCreateRoom}
          onSavedToLibrary={onSavedToLibrary}
          onFocusPasteBar={onFocusPasteBar}
        />
      ))}
    </section>
  );
}
