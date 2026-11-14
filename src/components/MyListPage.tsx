import { useState } from 'react';
import { Bookmark, Clock, Film, Play, Share2, Trash2, Users } from 'lucide-react';
import {
  formatTimeLeft,
  getProgressPercent,
  LocalMediaSource,
  WatchHistoryItem,
  WatchLaterItem,
} from '../lib/localLists';
import { BookmarkButton } from './BookmarkButton';

interface MyListPageProps {
  watchLater: WatchLaterItem[];
  history: WatchHistoryItem[];
  onWatchWatchLater: (item: WatchLaterItem) => void;
  onCreateRoomWatchLater: (item: WatchLaterItem) => void;
  onShareWatchLater: (item: WatchLaterItem) => void;
  onRemoveWatchLater: (source: LocalMediaSource, id: string) => void;
  onWatchHistory: (item: WatchHistoryItem) => void;
  onCreateRoomHistory: (item: WatchHistoryItem) => void;
  onShareHistory: (item: WatchHistoryItem) => void;
  onRemoveHistory: (source: LocalMediaSource, id: string) => void;
  onClearHistory: () => void;
}

function ThumbnailThumb({
  thumbnail,
  title,
  source,
  progressPercent,
}: {
  thumbnail: string;
  title: string;
  source: LocalMediaSource;
  progressPercent?: number;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#14110f]">
      {!imgError && thumbnail ? (
        <img
          src={thumbnail}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14110f] p-3">
          <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
          <span className="text-xs text-[#f4ece1] text-center line-clamp-1">
            {title}
          </span>
        </div>
      )}

      {source === 'archive' && (
        <span className="absolute left-2 top-2 rounded-full border border-[#3a322a] bg-[#14110f] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f4ece1]">
          Archive
        </span>
      )}

      {typeof progressPercent === 'number' && progressPercent > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#3a322a]">
          <div
            className="h-full bg-[#f2a33a]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}

// 4th tab: My List (Watch Later + History, stored on this device only)
export function MyListPage({
  watchLater,
  history,
  onWatchWatchLater,
  onCreateRoomWatchLater,
  onShareWatchLater,
  onRemoveWatchLater,
  onWatchHistory,
  onCreateRoomHistory,
  onShareHistory,
  onRemoveHistory,
  onClearHistory,
}: MyListPageProps) {
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8 space-y-10">
      <div className="border-b border-[#3a322a] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#f4ece1] sm:text-3xl">
          My List
        </h1>
        <p className="mt-1.5 text-sm text-[#b9aa98]">
          Your bookmarked movies and watch progress.{' '}
          <span className="text-[#f4ece1] font-medium">Saved on this device only.</span>
        </p>
      </div>

      {/* Section 1: Watch Later */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            <h2 className="text-xl font-bold text-[#f4ece1]">
              Watch Later
            </h2>
            <span className="font-mono text-xs text-[#b9aa98] tabular-nums">
              ({watchLater.length})
            </span>
          </div>
        </div>

        {watchLater.length === 0 ? (
          <div className="rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-6 text-center">
            <p className="text-sm font-medium text-[#f4ece1]">
              No saved movies in Watch Later yet.
            </p>
            <p className="mt-1 text-xs text-[#b9aa98]">
              Tap the bookmark icon on any movie card, the solo player, or inside a room.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {watchLater.map((item) => (
              <article
                key={`wl-${item.source}-${item.id}`}
                className="flex flex-col rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3 transition-colors hover:border-[#f2a33a]"
              >
                <button
                  type="button"
                  onClick={() => onWatchWatchLater(item)}
                  className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 rounded-xl cursor-pointer"
                >
                  <ThumbnailThumb
                    thumbnail={item.thumbnail}
                    title={item.title}
                    source={item.source}
                  />
                  <h3 className="mt-2.5 text-sm font-bold text-[#f4ece1] line-clamp-2 leading-snug group-hover:text-[#f2a33a] transition-colors">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#b9aa98]">
                    {item.source === 'archive' ? 'Internet Archive' : 'YouTube'}
                  </p>
                </button>

                <div className="mt-auto pt-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onWatchWatchLater(item)}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-3 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current shrink-0" aria-hidden="true" />
                    <span>Watch</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onCreateRoomWatchLater(item)}
                    aria-label={`Create room for ${item.title}`}
                    title="Create Room"
                    className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onShareWatchLater(item)}
                    aria-label={`Share ${item.title}`}
                    title="Share"
                    className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                  >
                    <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveWatchLater(item.source, item.id)}
                    aria-label={`Remove ${item.title} from Watch Later`}
                    title="Remove from Watch Later"
                    className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: History */}
      <div className="space-y-4 border-t border-[#3a322a] pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            <h2 className="text-xl font-bold text-[#f4ece1]">
              History
            </h2>
            <span className="font-mono text-xs text-[#b9aa98] tabular-nums">
              ({history.length})
            </span>
          </div>

          {history.length > 0 && !confirmClearHistory && (
            <button
              type="button"
              onClick={() => setConfirmClearHistory(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 text-[#f2a33a]" aria-hidden="true" />
              <span>Clear history</span>
            </button>
          )}
        </div>

        {confirmClearHistory && history.length > 0 && (
          <div
            role="alertdialog"
            aria-label="Confirm clearing watch history"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f2a33a] bg-[#1e1a16] p-4"
          >
            <p className="text-sm text-[#f4ece1]">
              Clear all watch history and Continue Watching progress on this device?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearHistory(false)}
                className="min-h-[44px] rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2 text-xs font-medium text-[#f4ece1] hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearHistory();
                  setConfirmClearHistory(false);
                }}
                className="min-h-[44px] rounded-full bg-[#f2a33a] px-4 py-2 text-xs font-bold text-[#1a1208] hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
              >
                Confirm Clear
              </button>
            </div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-6 text-center">
            <p className="text-sm font-medium text-[#f4ece1]">
              Your watch history is empty.
            </p>
            <p className="mt-1 text-xs text-[#b9aa98]">
              Movies you watch alone or inside rooms are remembered here on this device only.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {history.map((item) => {
              const progressPercent = item.finished
                ? 100
                : getProgressPercent(item.position, item.duration);
              const statusLabel = item.finished
                ? 'Finished'
                : item.duration > 0
                  ? formatTimeLeft(item.position, item.duration)
                  : 'Watched';

              return (
                <article
                  key={`hist-${item.source}-${item.id}`}
                  className="flex flex-col rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3 transition-colors hover:border-[#f2a33a]"
                >
                  <button
                    type="button"
                    onClick={() => onWatchHistory(item)}
                    className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 rounded-xl cursor-pointer"
                  >
                    <ThumbnailThumb
                      thumbnail={item.thumbnail}
                      title={item.title}
                      source={item.source}
                      progressPercent={progressPercent}
                    />
                    <h3 className="mt-2.5 text-sm font-bold text-[#f4ece1] line-clamp-2 leading-snug group-hover:text-[#f2a33a] transition-colors">
                      {item.title}
                    </h3>
                    <p className="mt-1 font-mono text-xs text-[#b9aa98] tabular-nums truncate">
                      {statusLabel}
                    </p>
                  </button>

                  <div className="mt-auto pt-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onWatchHistory(item)}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-3 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 fill-current shrink-0" aria-hidden="true" />
                      <span>{item.finished || item.position <= 0 ? 'Watch' : 'Resume'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onCreateRoomHistory(item)}
                      aria-label={`Create room for ${item.title}`}
                      title="Create Room"
                      className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                    >
                      <Users className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
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
                      onClick={() => onShareHistory(item)}
                      aria-label={`Share ${item.title}`}
                      title="Share"
                      className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                    >
                      <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemoveHistory(item.source, item.id)}
                      aria-label={`Remove ${item.title} from History`}
                      title="Remove from History"
                      className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
