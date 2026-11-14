import { useEffect, useState } from 'react';
import { Film, Play, Users, X } from 'lucide-react';
import { formatClockDuration } from '../lib/localLists';
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/90 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="watch-choice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:rounded-[20px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl border border-[#3a322a] bg-[#14110f]">
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
                  <Film className="h-5 w-5 text-[#f2a33a]" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#b9aa98]">
                Choose how to watch
              </p>
              <h2
                id="watch-choice-title"
                className="mt-0.5 text-base font-bold text-[#f4ece1] line-clamp-2"
              >
                {video.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close watch options"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] active:bg-[#3a322a] cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => onWatchTogether(video)}
            className="flex w-full min-h-[56px] items-center justify-between gap-3 rounded-full bg-[#f2a33a] px-5 py-3 text-left text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">Watch Together</p>
                <p className="text-xs text-[#1a1208]/80">
                  {video.positionSeconds && video.positionSeconds > 0
                    ? `Start a private room at ${formatClockDuration(video.positionSeconds)}`
                    : 'Create a private room with invite link & chat'}
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onWatchAlone(video)}
            className="flex w-full min-h-[56px] items-center justify-between gap-3 rounded-full border border-[#3a322a] bg-[#14110f] px-5 py-3 text-left text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5 text-[#f2a33a] shrink-0 fill-current" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">Watch Alone</p>
                <p className="text-xs text-[#b9aa98]">
                  {video.positionSeconds && video.positionSeconds > 0
                    ? `Resume solo playback at ${formatClockDuration(video.positionSeconds)}`
                    : 'Solo playback right now, no room or chat'}
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
