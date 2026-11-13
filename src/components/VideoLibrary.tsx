import { useState } from 'react';
import { Film, Play, Search, X } from 'lucide-react';
import { LIBRARY_CATEGORIES, LibraryVideo } from '../data/libraryVideos';

interface VideoLibraryProps {
  videos: LibraryVideo[];
  onWatchVideo: (video: LibraryVideo) => void;
}

function LibraryCard({
  video,
  onSelect,
}: {
  video: LibraryVideo;
  onSelect: (video: LibraryVideo) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(video)}
      className="group flex flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl cursor-pointer"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#111625] transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-amber-400/50">
        {!imgError ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0F172A] via-[#111625] to-[#1C1917] p-3">
            <Film className="h-6 w-6 text-amber-400/80" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-300 text-center line-clamp-1">
              {video.title}
            </span>
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"
          aria-hidden="true"
        />

        <div className="absolute bottom-2 left-2.5 hidden sm:flex items-center gap-1.5 text-xs font-medium text-amber-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span>Watch now</span>
        </div>

        <span className="absolute right-2.5 bottom-2 font-mono text-xs font-medium text-slate-100 tabular-nums">
          {video.duration}
        </span>
      </div>

      <div className="mt-2.5 px-0.5">
        <h3 className="font-display text-sm sm:text-base font-semibold text-slate-100 line-clamp-1 group-hover:text-amber-300 transition-colors duration-150">
          {video.title}
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">{video.category}</p>
      </div>
    </button>
  );
}

export function VideoLibrary({ videos, onWatchVideo }: VideoLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] =
    useState<(typeof LIBRARY_CATEGORIES)[number]>('All');

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredVideos = videos.filter((video) => {
    const matchesCategory =
      activeCategory === 'All' || video.category === activeCategory;
    const matchesSearch =
      normalizedQuery === '' ||
      video.title.toLowerCase().includes(normalizedQuery) ||
      video.category.toLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesSearch;
  });

  const resetFilters = () => {
    setSearchQuery('');
    setActiveCategory('All');
  };

  return (
    <section
      id="video-library"
      aria-labelledby="video-library-heading"
      className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            id="video-library-heading"
            className="font-display text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
          >
            Video Library
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Free open-source movies and Creative Commons picks ready to watch together.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search library..."
            aria-label="Search video library"
            className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#111625] pl-10 pr-9 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Filter videos by category"
        className="no-scrollbar -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {LIBRARY_CATEGORIES.map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveCategory(category)}
              className={`min-h-[40px] rounded-lg px-4 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'border border-white/15 bg-[#111625] text-slate-300 hover:border-white/30 hover:text-slate-100'
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      {filteredVideos.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {filteredVideos.map((video) => (
            <LibraryCard key={video.id} video={video} onSelect={onWatchVideo} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-white/10 bg-[#111625] px-6 py-10 text-center">
          <p className="font-display text-base font-semibold text-slate-100">
            No matching videos found
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Try another search term or switch back to all categories.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 min-h-[44px] rounded-lg border border-white/15 bg-[#161D30] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-white/30 cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}
    </section>
  );
}
