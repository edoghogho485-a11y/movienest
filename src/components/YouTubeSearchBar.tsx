import { FormEvent, useState } from 'react';
import { Search, X } from 'lucide-react';
import { SharedLibraryItem } from '../lib/supabase';
import { searchYouTubeWithCache, YouTubeSearchResult } from '../lib/youtube';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface YouTubeSearchBarProps {
  onWatch: (video: YouTubeSearchResult) => void;
  onCreateRoom: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
  onFocusPasteBar: () => void;
}

export function YouTubeSearchBar({
  onWatch,
  onCreateRoom,
  onSavedToLibrary,
  onFocusPasteBar,
}: YouTubeSearchBarProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [apiError, setApiError] = useState(false);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || searching) return;

    setSearching(true);
    setHasSearched(true);
    setApiError(false);

    const response = await searchYouTubeWithCache(trimmed);

    setSearching(false);
    setResults(response.results);
    setApiError(response.error);
  };

  const handleClear = () => {
    setQuery('');
    setHasSearched(false);
    setResults([]);
    setApiError(false);
  };

  return (
    <section
      aria-label="Search YouTube movies"
      className="mx-auto max-w-6xl px-4 pt-6 pb-2 sm:px-6 lg:px-8"
    >
      <div className="rounded-2xl border border-white/10 bg-[#0D121F] p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <label
            htmlFor="youtube-search-input"
            className="font-display text-base font-semibold text-slate-100 sm:text-lg"
          >
            Search full movies on YouTube
          </label>
          <span className="text-xs text-slate-400">
            Embeddable full-length videos
          </span>
        </div>

        <form onSubmit={handleSearch} className="mt-3 flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="youtube-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Nollywood, action, comedy, documentaries..."
              className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#07090F] pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            {query && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!query.trim() || searching}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap transition-colors hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>{searching ? 'Searching...' : 'Search'}</span>
          </button>
        </form>

        {hasSearched && (
          <div className="mt-6">
            {searching ? (
              <p className="text-sm text-slate-400">Searching YouTube movies...</p>
            ) : apiError ? (
              <div className="rounded-xl border border-white/10 bg-[#111625] p-5 text-center">
                <p className="text-sm font-medium text-slate-200">
                  Search is resting, try again tomorrow, or paste a link
                </p>
                <button
                  type="button"
                  onClick={onFocusPasteBar}
                  className="mt-3 min-h-[40px] rounded-lg border border-amber-400/40 bg-[#161D30] px-4 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:border-amber-400 cursor-pointer"
                >
                  Paste a YouTube Link
                </button>
              </div>
            ) : results.length === 0 ? (
              <p className="text-sm text-slate-400">
                No embeddable long videos matched that search. Try another title or paste a
                YouTube link below.
              </p>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">
                    Showing {results.length} results
                  </p>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs font-medium text-amber-400 hover:underline cursor-pointer"
                  >
                    Clear results
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {results.map((video) => (
                    <YouTubeMovieCard
                      key={video.videoId}
                      video={video}
                      onWatch={onWatch}
                      onCreateRoom={onCreateRoom}
                      onSavedToLibrary={onSavedToLibrary}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
