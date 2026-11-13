import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Play } from 'lucide-react';
import { VideoItem } from '../data/videos';

interface FeaturedVideosProps {
  videos: VideoItem[];
  onSelectVideo: (video: VideoItem) => void;
}

function VideoCard({
  video,
  onSelect,
}: {
  video: VideoItem;
  onSelect: (video: VideoItem) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(video)}
      className="group w-[76vw] max-w-[310px] sm:w-[290px] lg:w-[320px] shrink-0 snap-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl cursor-pointer"
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
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#0F172A] via-[#111625] to-[#1C1917] p-4">
            <Film className="h-7 w-7 text-amber-400/80" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-300 text-center line-clamp-1">
              {video.title}
            </span>
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
          aria-hidden="true"
        />

        <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 text-xs font-medium text-amber-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span>Watch in room</span>
        </div>

        <span className="absolute right-3 bottom-2.5 font-mono text-xs font-medium text-slate-100 tabular-nums">
          {video.duration}
        </span>
      </div>

      <div className="mt-3 px-0.5">
        <h3 className="font-display text-base font-semibold text-slate-100 line-clamp-1 group-hover:text-amber-300 transition-colors duration-150">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          <span>{video.genre}</span>
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums">{video.year}</span>
        </p>
      </div>
    </button>
  );
}

export function FeaturedVideos({ videos, onSelectVideo }: FeaturedVideosProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distance = Math.min(container.clientWidth * 0.75, 640);
    container.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <section
      aria-labelledby="featured-videos-heading"
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2
            id="featured-videos-heading"
            className="font-display text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
          >
            Featured Videos
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Pick a film to start a private screening with friends.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => scrollByAmount('left')}
            aria-label="Scroll featured videos left"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-[#111625] text-slate-200 transition-colors duration-150 hover:border-white/30 hover:bg-[#161D30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount('right')}
            aria-label="Scroll featured videos right"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-[#111625] text-slate-200 transition-colors duration-150 hover:border-white/30 hover:bg-[#161D30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-5 sm:px-0"
      >
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} onSelect={onSelectVideo} />
        ))}
      </div>
    </section>
  );
}
