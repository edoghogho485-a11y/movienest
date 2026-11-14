import { useEffect, useState } from 'react';
import { Film, Play, Users, X } from 'lucide-react';
import { RoomVideoOption } from './RoomModal';

interface WatchChoiceModalProps {
  video: RoomVideoOption | null;
  onClose: () => void;
  onWatchTogether: (video: RoomVideoOption) => void;
  onWatchAlone: (video: RoomVideoOption) => void;
}

// Bottom sheet on phones, centered modal on laptops offering Watch Together vs Watch Alone
export function WatchChoiceModal({
  video,
  onClose,
  onWatchTogether,
  onWatchAlone,
}: WatchChoiceModalProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [video?.id, video?.youtubeId]);

  useEffect(() => {
    if (!video) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [video, onClose]);

  if (!video) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="watch-choice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-[#2a2a33] bg-[#14141a] p-5 sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-[#2a2a33] bg-[#08080A]">
              {!imgError ? (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Film className="h-5 w-5 text-[#E50914]" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Choose how to watch
              </p>
              <h2
                id="watch-choice-title"
                className="mt-0.5 font-display text-base font-semibold text-white line-clamp-2"
              >
                {video.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close watch options"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => onWatchTogether(video)}
            className="flex w-full min-h-[56px] items-center justify-between gap-3 rounded-xl bg-[#E50914] px-4 py-3 text-left text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-display text-sm font-semibold">Watch Together</p>
                <p className="text-xs text-white/85">
                  Create a private room with invite link &amp; chat
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onWatchAlone(video)}
            className="flex w-full min-h-[56px] items-center justify-between gap-3 rounded-xl border border-[#2a2a33] bg-[#1b1b24] px-4 py-3 text-left text-white transition-colors hover:border-[#E50914] active:bg-[#282834] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5 text-[#E50914] shrink-0 fill-current" aria-hidden="true" />
              <div>
                <p className="font-display text-sm font-semibold">Watch Alone</p>
                <p className="text-xs text-zinc-400">
                  Solo playback right now, no room or chat
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
