import { ArchiveMovieItem } from '../lib/archive';
import { NewThisWeekItem } from '../lib/legalSources';
import { YouTubeSearchResult } from '../lib/youtube';
import { ArchiveMovieCard } from './ArchiveMovieCard';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface NewThisWeekRowProps {
  items: NewThisWeekItem[];
  onWatchYouTube: (video: YouTubeSearchResult) => void;
  onCreateRoomYouTube: (video: YouTubeSearchResult) => void;
  onShareYouTube: (video: YouTubeSearchResult) => void;
  onWatchArchive: (movie: ArchiveMovieItem) => void;
  onCreateRoomArchive: (movie: ArchiveMovieItem) => void;
  onShareArchive: (movie: ArchiveMovieItem) => void;
}

// Home page "New this week" row: merges videos added in the last 14 days from all sources, newest first (up to 12)
export function NewThisWeekRow({
  items,
  onWatchYouTube,
  onCreateRoomYouTube,
  onShareYouTube,
  onWatchArchive,
  onCreateRoomArchive,
  onShareArchive,
}: NewThisWeekRowProps) {
  if (!items || items.length === 0) return null;

  return (
    <section
      aria-label="New this week"
      className="px-4 pt-6 pb-2 sm:px-6 lg:px-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#f4ece1]">
            New this week
          </h2>
          <p className="mt-0.5 text-xs text-[#b9aa98]">
            Freshly added across our channels and archives in the last 14 days.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
        {items.map((entry) =>
          entry.kind === 'youtube' ? (
            <YouTubeMovieCard
              key={`new-yt-${entry.video.videoId}`}
              video={entry.video}
              className="w-[260px] sm:w-[276px] shrink-0 snap-start"
              onWatch={onWatchYouTube}
              onCreateRoom={onCreateRoomYouTube}
              onShare={onShareYouTube}
            />
          ) : (
            <ArchiveMovieCard
              key={`new-ar-${entry.movie.identifier}`}
              movie={entry.movie}
              className="w-[260px] sm:w-[276px] shrink-0 snap-start"
              onWatch={onWatchArchive}
              onCreateRoom={onCreateRoomArchive}
              onShare={onShareArchive}
            />
          )
        )}
      </div>
    </section>
  );
}
