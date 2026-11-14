import { useState } from 'react';
import { Film, Share2, Users } from 'lucide-react';
import { ArchiveMovieItem } from '../lib/archive';

interface ArchiveMovieCardProps {
  movie: ArchiveMovieItem;
  className?: string;
  onWatch: (movie: ArchiveMovieItem) => void;
  onCreateRoom: (movie: ArchiveMovieItem) => void;
  onShare: (movie: ArchiveMovieItem) => void;
}

export function ArchiveMovieCard({
  movie,
  className = '',
  onWatch,
  onCreateRoom,
  onShare,
}: ArchiveMovieCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <article
      className={`flex flex-col rounded-xl border border-[#2a2a33] bg-[#14141a] p-2.5 transition-colors hover:border-[#E50914] ${className}`}
    >
      <button
        type="button"
        onClick={() => onWatch(movie)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] active:opacity-80 rounded-lg cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#1b1b24]">
          {!imgError ? (
            <img
              src={movie.thumbnail}
              alt={movie.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14141a] p-3">
              <Film className="h-6 w-6 text-[#E50914]/85" aria-hidden="true" />
              <span className="text-xs text-zinc-200 text-center line-clamp-1">
                {movie.title}
              </span>
            </div>
          )}

          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent"
            aria-hidden="true"
          />

          {/* Small Archive source badge */}
          <span className="absolute left-2 top-2 rounded-md border border-[#2a2a33] bg-[#14141a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-100">
            Archive
          </span>
        </div>

        <h3 className="mt-2.5 font-display text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-[#E50914] transition-colors">
          {movie.title}
        </h3>
        <p className="mt-1 text-xs text-zinc-400 truncate">
          {movie.year ? `${movie.year} · Internet Archive` : 'Internet Archive'}
        </p>
      </button>

      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCreateRoom(movie)}
          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#E50914] px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Create Room</span>
        </button>

        <button
          type="button"
          onClick={() => onShare(movie)}
          aria-label={`Share ${movie.title}`}
          className="inline-flex min-h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#181820] text-zinc-200 transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
        >
          <Share2 className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
