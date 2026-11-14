import { ArrowLeft } from 'lucide-react';
import { GenreDefinition } from '../data/genres';
import { SharedLibraryItem } from '../lib/supabase';
import { YouTubeSearchResult } from '../lib/youtube';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface GenreGridViewProps {
  genre: GenreDefinition;
  videos: YouTubeSearchResult[];
  onBack: () => void;
  onWatch: (video: YouTubeSearchResult) => void;
  onCreateRoom: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
}

export function GenreGridView({
  genre,
  videos,
  onBack,
  onWatch,
  onCreateRoom,
  onSavedToLibrary,
}: GenreGridViewProps) {
  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-2 -ml-2 text-sm font-medium text-zinc-300 transition-colors hover:text-[#E50914] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to browse</span>
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {genre.name}
          </h1>
        </div>

        <span className="text-xs font-medium text-zinc-400 tabular-nums">
          {videos.length} {videos.length === 1 ? 'movie' : 'movies'}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        {videos.map((video) => (
          <YouTubeMovieCard
            key={`grid-${genre.slug}-${video.videoId}`}
            video={video}
            defaultCategory={genre.defaultCategory}
            onWatch={onWatch}
            onCreateRoom={onCreateRoom}
            onSavedToLibrary={onSavedToLibrary}
          />
        ))}
      </div>
    </section>
  );
}
