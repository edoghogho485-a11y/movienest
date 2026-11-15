import { ArchiveMovieItem } from '../lib/archive';
import { LegalPickItem } from '../lib/moodCatalog';
import { YouTubeSearchResult } from '../lib/youtube';
import { ArchiveMovieCard } from './ArchiveMovieCard';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface TonightsPicksRowProps {
  items: LegalPickItem[];
  onWatchYouTube: (video: YouTubeSearchResult) => void;
  onCreateRoomYouTube: (video: YouTubeSearchResult) => void;
  onShareYouTube: (video: YouTubeSearchResult) => void;
  onWatchArchive: (movie: ArchiveMovieItem) => void;
  onCreateRoomArchive: (movie: ArchiveMovieItem) => void;
  onShareArchive: (movie: ArchiveMovieItem) => void;
  onBrowseAllMovies: () => void;
}

// Home page "Tonight's picks" section: horizontal scroll on phones, 4-column grid on laptops
export function TonightsPicksRow({
  items,
  onWatchYouTube,
  onCreateRoomYouTube,
  onShareYouTube,
  onWatchArchive,
  onCreateRoomArchive,
  onShareArchive,
  onBrowseAllMovies,
}: TonightsPicksRowProps) {
  if (!items || items.length === 0) return null;

  return (
    <section
      aria-label="Tonight's picks"
      className="px-4 pt-6 pb-2 sm:px-6 lg:px-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#f4ece1]">
            Tonight&apos;s picks
          </h2>
          <p className="mt-0.5 text-xs text-[#b9aa98]">
            Ready to watch together or solo right now.
          </p>
        </div>

        <button
          type="button"
          onClick={onBrowseAllMovies}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          Browse all sources
        </button>
      </div>

      {/* Horizontal scroll on phones, 4 cards per row on laptops */}
      <div className="mt-4 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:pb-0">
        {items.map((entry) =>
          entry.kind === 'youtube' ? (
            <YouTubeMovieCard
              key={`tonight-yt-${entry.video.videoId}`}
              video={entry.video}
              className="w-[260px] sm:w-[276px] shrink-0 snap-start lg:w-full"
              onWatch={onWatchYouTube}
              onCreateRoom={onCreateRoomYouTube}
              onShare={onShareYouTube}
            />
          ) : (
            <ArchiveMovieCard
              key={`tonight-ar-${entry.movie.identifier}`}
              movie={entry.movie}
              className="w-[260px] sm:w-[276px] shrink-0 snap-start lg:w-full"
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
