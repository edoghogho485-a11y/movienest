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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-2 -ml-2 text-sm font-medium text-zinc-300 transition-colors hover:text-[#E50914] active:bg-white/10 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to browse</span>
          </button>
          <div className="mt-1 flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {data.genre.name}
            </h1>
            {data.kind === 'archive' && (
              <span className="rounded-md border border-[#2a2a33] bg-[#14141a] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-200">
                Archive
              </span>
            )}
          </div>
        </div>

        <span className="text-xs font-medium text-zinc-400 tabular-nums">
          {count} {count === 1 ? 'movie' : 'movies'}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
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
