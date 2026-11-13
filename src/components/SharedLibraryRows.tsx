import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Play } from 'lucide-react';
import { LibraryVideo } from '../data/libraryVideos';
import {
  SHARED_LIBRARY_CATEGORIES,
  SharedLibraryItem,
} from '../lib/supabase';
import { getYouTubeThumbnail } from '../lib/youtube';

interface SharedLibraryRowsProps {
  libraryItems: SharedLibraryItem[];
  loading: boolean;
  sampleVideos: LibraryVideo[];
  showCategoryRows?: boolean;
  onWatchLibraryItem: (item: SharedLibraryItem) => void;
  onWatchSampleVideo: (video: LibraryVideo) => void;
  onFocusPasteBar: () => void;
}

function ScrollableVideoCard({
  title,
  thumbnail,
  subtitle,
  duration,
  onSelect,
}: {
  title: string;
  thumbnail: string;
  subtitle: string;
  duration?: string;
  onSelect: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-[72vw] max-w-[290px] sm:w-[270px] lg:w-[290px] shrink-0 snap-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl cursor-pointer"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#111625] transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-amber-400/50">
        {!imgError ? (
          <img
            src={thumbnail}
            alt={title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0F172A] via-[#111625] to-[#1C1917] p-4">
            <Film className="h-6 w-6 text-amber-400/80" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-300 text-center line-clamp-1">
              {title}
            </span>
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"
          aria-hidden="true"
        />

        <div className="absolute bottom-2 left-3 hidden sm:flex items-center gap-1.5 text-xs font-medium text-amber-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span>Watch now</span>
        </div>

        {duration && (
          <span className="absolute right-3 bottom-2 font-mono text-xs font-medium text-slate-100 tabular-nums">
            {duration}
          </span>
        )}
      </div>

      <div className="mt-2.5 px-0.5">
        <h3 className="font-display text-sm sm:text-base font-semibold text-slate-100 line-clamp-1 group-hover:text-amber-300 transition-colors duration-150">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      </div>
    </button>
  );
}

function HorizontalRow({
  title,
  emptyMessage,
  loading,
  onEmptyClick,
  children,
}: {
  title: string;
  emptyMessage?: string;
  loading?: boolean;
  onEmptyClick?: () => void;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const container = scrollRef.current;
    if (!container) return;
    const distance = Math.min(container.clientWidth * 0.75, 600);
    container.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <div className="py-5 sm:py-6">
      <div className="mb-3.5 flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
          {title}
        </h2>

        {!emptyMessage && !loading && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollByAmount('left')}
              aria-label={`Scroll ${title} left`}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#111625] text-slate-200 transition-colors hover:border-white/30 hover:bg-[#161D30] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByAmount('right')}
              aria-label={`Scroll ${title} right`}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-[#111625] text-slate-200 transition-colors hover:border-white/30 hover:bg-[#161D30] cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-[#0D121F] px-4 py-6 text-sm text-slate-400">
          Loading {title}...
        </div>
      ) : emptyMessage ? (
        <button
          type="button"
          onClick={onEmptyClick}
          className="w-full rounded-xl border border-dashed border-white/15 bg-[#0D121F] px-4 py-6 text-left text-sm text-slate-400 transition-colors hover:border-amber-400/50 hover:text-slate-200 cursor-pointer"
        >
          {emptyMessage}
        </button>
      ) : (
        <div
          ref={scrollRef}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:gap-5 sm:px-0"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function SharedLibraryRows({
  libraryItems,
  loading,
  sampleVideos,
  showCategoryRows = true,
  onWatchLibraryItem,
  onWatchSampleVideo,
  onFocusPasteBar,
}: SharedLibraryRowsProps) {
  return (
    <section
      id="shared-library"
      aria-label="Video Library"
      className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8 divide-y divide-white/10"
    >
      {/* Sideways-scrolling row per category, with Nollywood and Movies at the top */}
      {showCategoryRows &&
        SHARED_LIBRARY_CATEGORIES.map((category) => {
          const itemsInCategory = libraryItems.filter(
            (item) => item.category === category
          );

          return (
            <HorizontalRow
              key={category}
              title={category}
              loading={loading}
              emptyMessage={
                !loading && itemsInCategory.length === 0
                  ? 'Paste a YouTube link to add the first one'
                  : undefined
              }
              onEmptyClick={onFocusPasteBar}
            >
              {itemsInCategory.map((item) => (
                <ScrollableVideoCard
                  key={item.id}
                  title={item.title}
                  thumbnail={getYouTubeThumbnail(item.video_id)}
                  subtitle={item.category}
                  onSelect={() => onWatchLibraryItem(item)}
                />
              ))}
            </HorizontalRow>
          );
        })}

      {/* Existing sample Blender / Creative Commons videos preserved below */}
      <HorizontalRow title="Sample Videos">
        {sampleVideos.map((video) => (
          <ScrollableVideoCard
            key={video.id}
            title={video.title}
            thumbnail={video.thumbnail}
            subtitle={video.category}
            duration={video.duration}
            onSelect={() => onWatchSampleVideo(video)}
          />
        ))}
      </HorizontalRow>
    </section>
  );
}
