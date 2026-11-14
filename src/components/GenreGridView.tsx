import { ArrowLeft } from 'lucide-react';
import { GenreDefinition } from '../data/genres';
import { ArchiveGenreDefinition, ArchiveMovieItem } from '../lib/archive';
import { SharedLibraryItem } from '../lib/supabase';
import { YouTubeSearchResult } from '../lib/youtube';
import { ArchiveMovieCard } from './ArchiveMovieCard';
import { YouTubeMovieCard } from './YouTubeMovieCard';

export type SeeAllViewData =
  | {
      kind: 'youtube';
      genre: GenreDefinition;
      videos: YouTubeSearchResult[];
    }
  | {
      kind: 'archive';
      genre: ArchiveGenreDefinition;
      movies: ArchiveMovieItem[];
    };

interface GenreGridViewProps {
  data: SeeAllViewData;
  onBack: () => void;
  onWatchYouTube: (video: YouTubeSearchResult) => void;
  onCreateRoomYouTube: (video: YouTubeSearchResult) => void;
  onShareYouTube: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
  onWatchArchive: (movie: ArchiveMovieItem) => void;
  onCreateRoomArchive: (movie: ArchiveMovieItem) => void;
  onShareArchive: (movie: ArchiveMovieItem) => void;
}

export function GenreGridView({
  data,
  onBack,
  onWatchYouTube,
  onCreateRoomYouTube,
  onShareYouTube,
  onSavedToLibrary,
  onWatchArchive,
  onCreateRoomArchive,
  onShareArchive,
}: GenreGridViewProps) {
  const count = data.kind === 'youtube' ? data.videos.length : data.movies.length;

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#3a322a] pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            <span>Back to browse</span>
          </button>
          <div className="mt-3 flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#f4ece1] sm:text-3xl">
              {data.genre.name}
            </h1>
            {data.kind === 'archive' && (
              <span className="text-xs font-medium text-[#b9aa98]">
                · Archive
              </span>
            )}
          </div>
        </div>

        <span className="text-xs font-medium text-[#b9aa98] tabular-nums">
          {count} {count === 1 ? 'movie' : 'movies'}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.kind === 'youtube'
          ? data.videos.map((video) => (
              <YouTubeMovieCard
                key={`grid-${data.genre.slug}-${video.videoId}`}
                video={video}
                defaultCategory={data.genre.defaultCategory}
                onWatch={onWatchYouTube}
                onCreateRoom={onCreateRoomYouTube}
                onShare={onShareYouTube}
                onSavedToLibrary={onSavedToLibrary}
              />
            ))
          : data.movies.map((movie) => (
              <ArchiveMovieCard
                key={`grid-${data.genre.slug}-${movie.identifier}`}
                movie={movie}
                onWatch={onWatchArchive}
                onCreateRoom={onCreateRoomArchive}
                onShare={onShareArchive}
              />
            ))}
      </div>
    </section>
  );
}
