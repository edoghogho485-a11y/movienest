import { Film, ListVideo, Play, Plus, Trash2 } from 'lucide-react';
import { QUEUE_MAX_ITEMS, QueueItem } from '../lib/supabase';

interface RoomQueuePanelProps {
  queue: QueueItem[];
  isHost: boolean;
  canControlPlayback: boolean;
  busyItemId?: string | null;
  onOpenPicker: () => void;
  onPlayQueuedItem: (item: QueueItem) => void;
  onRemoveItem: (itemId: string) => void;
  inMobileTab?: boolean;
}

export function RoomQueuePanel({
  queue,
  isHost,
  canControlPlayback,
  busyItemId = null,
  onOpenPicker,
  onPlayQueuedItem,
  onRemoveItem,
  inMobileTab = false,
}: RoomQueuePanelProps) {
  const safeQueue = Array.isArray(queue) ? queue : [];

  return (
    <section
      aria-label="Up Next queue"
      className={`flex flex-col overflow-hidden rounded-[20px] border border-[#3a322a] bg-[#1e1a16] ${
        inMobileTab ? 'h-[380px]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#3a322a] px-4 py-3">
        <div className="flex items-center gap-2">
          <ListVideo className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#f4ece1]">
            Up Next
          </h2>
          <span className="font-mono text-xs text-[#b9aa98] tabular-nums">
            {safeQueue.length}/{QUEUE_MAX_ITEMS}
          </span>
        </div>

        {canControlPlayback && (
          <button
            type="button"
            onClick={onOpenPicker}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-3.5 py-1.5 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 text-[#f2a33a]" aria-hidden="true" />
            <span>Add movie</span>
          </button>
        )}
      </div>

      {safeQueue.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center gap-2 px-4 py-6 text-center ${
            inMobileTab ? 'flex-1' : ''
          }`}
        >
          <p className="text-xs text-[#b9aa98]">
            No movies queued up yet. When the current video finishes, the next queued movie plays
            automatically.
          </p>
        </div>
      ) : (
        <ul
          className={`divide-y divide-[#3a322a]/60 overflow-y-auto px-3 py-1.5 ${
            inMobileTab ? 'flex-1' : 'max-h-72'
          }`}
        >
          {safeQueue.map((item, index) => {
            const isBusy = busyItemId === item.id;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 py-2.5 px-1"
              >
                <span className="w-4 shrink-0 text-center font-mono text-xs text-[#b9aa98] tabular-nums">
                  {index + 1}
                </span>

                <div className="relative h-11 w-20 shrink-0 overflow-hidden rounded-xl border border-[#3a322a] bg-[#14110f]">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Film className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#f4ece1]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#b9aa98] truncate">
                    {item.source === 'archive' ? 'Internet Archive' : 'YouTube'}
                    {item.addedBy ? ` · Added by ${item.addedBy}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {canControlPlayback && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onPlayQueuedItem(item)}
                      aria-label={`Play ${item.title} now`}
                      title="Play now"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-50 cursor-pointer"
                    >
                      <Play className="h-4 w-4 fill-current text-[#f2a33a]" aria-hidden="true" />
                    </button>
                  )}

                  {isHost && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Remove ${item.title} from queue`}
                      title="Remove from queue"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f2a33a] active:bg-[#2a241e] disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
