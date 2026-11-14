import { useState } from 'react';
import { Film, Play, Share2, Users } from 'lucide-react';
import {
  formatTimeLeft,
  getProgressPercent,
  WatchHistoryItem,
} from '../lib/localLists';
import { BookmarkButton } from './BookmarkButton';

interface ContinueWatchingRowProps {
  items: WatchHistoryItem[];
  onWatch: (item: WatchHistoryItem) => void;
  onCreateRoom: (item: WatchHistoryItem) => void;
  onShare: (item: WatchHistoryItem) => void;
}

function ContinueWatchingCard({
  item,
  onWatch,
  onCreateRoom,
  onShare,
}: {
  item: WatchHistoryItem;
  onWatch: (item: WatchHistoryItem) => void;
  onCreateRoom: (item: WatchHistoryItem) => void;
  onShare: (item: WatchHistoryItem) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const progressPercent = getProgressPercent(item.position, item.duration);
  const timeLeftLabel = formatTimeLeft(item.position, item.duration);

  return (
    <article className="w-[240px] sm:w-[270px] shrink-0 snap-start flex flex-col rounded-xl border border-[#2a2a33] bg-[#14141a] p-2.5 transition-colors hover:border-[#E50914]">
      <button
        type="button"
        onClick={() => onWatch(item)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] active:opacity-80 rounded-lg cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#1b1b24]">
          {!imgError && item.thumbnail ? (
            <img
              src={item.thumbnail}
              alt={item.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14141a] p-3">
              <Film className="h-6 w-6 text-[#E50914]/85" aria-hidden="true" />
              <span className="text-xs text-zinc-200 text-center line-clamp-1">
                {item.title}
              </span>
            </div>
          )}

          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
            aria-hidden="true"
          />

          {item.source === 'archive' && (
            <span className="absolute left-2 top-2 rounded-md border border-[#2a2a33] bg-[#14141a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-100">
              Archive
            </span>
          )}

          {/* Subtle center-bottom resume cue + red progress bar */}
          <span className="absolute bottom-2.5 left-2 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Play className="h-2.5 w-2.5 fill-[#E50914] text-[#E50914]" aria-hidden="true" />
            <span>Resume</span>
          </span>

          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
            aria-label={`Progress ${progressPercent}%`}
          >
            <div
              className="h-full bg-[#E50914]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <h3 className="mt-2.5 font-display text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-[#E50914] transition-colors">
          {item.title}
        </h3>
        <p className="mt-1 font-mono text-xs text-zinc-300 tabular-nums truncate">
          {timeLeftLabel}
        </p>
      </button>

      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCreateRoom(item)}
          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#E50914] px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Create Room</span>
        </button>

        <BookmarkButton
          source={item.source}
          id={item.id}
          videoUrl={item.video_url}
          title={item.title}
          thumbnail={item.thumbnail}
        />

        <button
          type="button"
          onClick={() => onShare(item)}
          aria-label={`Share ${item.title}`}
          className="inline-flex min-h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-white/15 bg-[#181820] text-zinc-200 transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
        >
          <Share2 className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

// Home page row displayed directly under the hero only when unfinished videos exist
export function ContinueWatchingRow({
  items,
  onWatch,
  onCreateRoom,
  onShare,
}: ContinueWatchingRowProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Continue Watching"
      className="px-4 pt-6 pb-2 sm:px-6 lg:px-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-white">
          Continue Watching
        </h2>
        <p className="text-xs text-zinc-500">Saved on this device only.</p>
      </div>

      <div className="mt-3 flex gap-4 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
        {items.map((item) => (
          <ContinueWatchingCard
            key={`cw-${item.source}-${item.id}`}
            item={item}
            onWatch={onWatch}
            onCreateRoom={onCreateRoom}
            onShare={onShare}
          />
        ))}
      </div>
    </section>
  );
}
