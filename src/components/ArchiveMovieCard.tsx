import { useState } from 'react';
import { Film, Share2, Users } from 'lucide-react';
import { ArchiveMovieItem } from '../lib/archive';
import { BookmarkButton } from './BookmarkButton';

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
      className={`flex flex-col rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3 transition-colors hover:border-[#f2a33a] ${className}`}
    >
      <button
        type="button"
        onClick={() => onWatch(movie)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 rounded-xl cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#14110f]">
          {!imgError ? (
            <img
              src={movie.thumbnail}
              alt={movie.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14110f] p-3">
              <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
              <span className="text-xs text-[#f4ece1] text-center line-clamp-1">
                {movie.title}
              </span>
            </div>
          )}

          <span className="absolute left-2 top-2 rounded-full border border-[#3a322a] bg-[#14110f] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f4ece1]">
            Archive
          </span>
        </div>

        <h3 className="mt-2.5 text-sm font-bold text-[#f4ece1] line-clamp-2 leading-snug group-hover:text-[#f2a33a] transition-colors">
          {movie.title}
        </h3>
        <p className="mt-1 text-xs text-[#b9aa98] truncate">
          {movie.year ? `${movie.year} · Internet Archive` : 'Internet Archive'}
        </p>
      </button>

      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCreateRoom(movie)}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-3 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Room</span>
        </button>

        <BookmarkButton
          source="archive"
          id={movie.identifier}
          title={movie.title}
          thumbnail={movie.thumbnail}
        />

        <button
          type="button"
          onClick={() => onShare(movie)}
          aria-label={`Share ${movie.title}`}
          className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
