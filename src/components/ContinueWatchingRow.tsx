import { useState } from 'react';
import { Film, Play, Share2, Users } from 'lucide-react';
import {
  formatTimeLeft,
  getProgressPercent,
  LocalMediaSource,
  WatchHistoryItem,
} from '../lib/localLists';
import { BookmarkButton } from './BookmarkButton';
import { CardActionMenu } from './CardActionMenu';

interface ContinueWatchingRowProps {
  items: WatchHistoryItem[];
  getSourceLabel?: (source: LocalMediaSource, id: string) => string;
  onWatch: (item: WatchHistoryItem) => void;
  onCreateRoom: (item: WatchHistoryItem) => void;
  onShare: (item: WatchHistoryItem) => void;
}

function ContinueWatchingCard({
  item,
  sourceLabel,
  onWatch,
  onCreateRoom,
  onShare,
}: {
  item: WatchHistoryItem;
  sourceLabel: string;
  onWatch: (item: WatchHistoryItem) => void;
  onCreateRoom: (item: WatchHistoryItem) => void;
  onShare: (item: WatchHistoryItem) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const progressPercent = getProgressPercent(item.position, item.duration);
  const timeLeftLabel = formatTimeLeft(item.position, item.duration);

  return (
    <article className="w-[260px] sm:w-[276px] shrink-0 snap-start flex flex-col rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3 transition-colors hover:border-[#f2a33a]">
      <button
        type="button"
        onClick={() => onWatch(item)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 rounded-xl cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#14110f]">
          {!imgError && item.thumbnail ? (
            <img
              src={item.thumbnail}
              alt={item.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14110f] p-3">
              <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
              <span className="text-xs text-[#f4ece1] text-center line-clamp-1">
                {item.title}
              </span>
            </div>
          )}

          <span className="absolute left-2 top-2 rounded-full border border-[#3a322a] bg-[#14110f] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f4ece1]">
            {sourceLabel}
          </span>

          <span className="absolute bottom-2.5 left-2 inline-flex items-center gap-1 rounded-full bg-[#14110f] border border-[#3a322a] px-2.5 py-0.5 text-[10px] font-bold text-[#f4ece1]">
            <Play className="h-2.5 w-2.5 fill-[#f2a33a] text-[#f2a33a]" aria-hidden="true" />
            <span>Resume</span>
          </span>

          {/* Solid flat amber progress bar */}
          <div
            className="absolute inset-x-0 bottom-0 h-1.5 bg-[#3a322a]"
            aria-label={`Progress ${progressPercent}%`}
          >
            <div
              className="h-full bg-[#f2a33a]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <h3 className="mt-2.5 text-sm font-bold text-[#f4ece1] line-clamp-2 leading-snug group-hover:text-[#f2a33a] transition-colors">
          {item.title}
        </h3>
        <p className="mt-1 font-mono text-xs text-[#b9aa98] tabular-nums truncate">
          {timeLeftLabel}
        </p>
      </button>

      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCreateRoom(item)}
          className="inline-flex min-h-[44px] flex-1 min-w-0 items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-2.5 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Room</span>
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
          className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
        </button>

        <CardActionMenu
          title={item.title}
          videoId={item.id}
          sourceType={item.source}
          sourceLabel={sourceLabel}
        />
      </div>
    </article>
  );
}

// Home page row displayed under the hero only when unfinished videos exist
export function ContinueWatchingRow({
  items,
  getSourceLabel,
  onWatch,
  onCreateRoom,
  onShare,
}: ContinueWatchingRowProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Continue watching"
      className="px-4 pt-6 pb-2 sm:px-6 lg:px-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight text-[#f4ece1]">
          Continue watching
        </h2>
        <p className="text-xs text-[#b9aa98]">Saved on this device only.</p>
      </div>

      <div className="mt-4 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
        {items.map((item) => {
          const sourceLabel = getSourceLabel
            ? getSourceLabel(item.source, item.id)
            : item.source === 'archive'
              ? 'Public domain'
              : 'YouTube';
          return (
            <ContinueWatchingCard
              key={`cw-${item.source}-${item.id}`}
              item={item}
              sourceLabel={sourceLabel}
              onWatch={onWatch}
              onCreateRoom={onCreateRoom}
              onShare={onShare}
            />
          );
        })}
      </div>
    </section>
  );
}
