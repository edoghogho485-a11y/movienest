import { useEffect, useState } from 'react';
import { Film, Link2, Users, X } from 'lucide-react';
import {
  extractYouTubeId,
  fetchYouTubeTitle,
  getYouTubeThumbnail,
} from '../lib/youtube';

export interface PastedYouTubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
}

interface PasteYouTubeBarProps {
  variant?: 'home' | 'modal';
  inputId?: string;
  onCreateRoomWithVideo: (video: PastedYouTubeVideo) => void;
}

export function PasteYouTubeBar({
  variant = 'home',
  inputId = 'paste-youtube-input',
  onCreateRoomWithVideo,
}: PasteYouTubeBarProps) {
  const [urlInput, setUrlInput] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  // Parse pasted YouTube URL and fetch its title via oEmbed whenever ID changes
  useEffect(() => {
    const parsedId = extractYouTubeId(urlInput);
    setVideoId(parsedId);
    setThumbError(false);

    if (!parsedId) {
      setTitle('');
      setLoadingTitle(false);
      return;
    }

    let cancelled = false;
    setLoadingTitle(true);
    setTitle('Loading video title...');

    fetchYouTubeTitle(parsedId).then((fetchedTitle) => {
      if (cancelled) return;
      setTitle(fetchedTitle);
      setLoadingTitle(false);
    });

    return () => {
      cancelled = true;
    };
  }, [urlInput]);

  const thumbnailUrl = videoId ? getYouTubeThumbnail(videoId) : '';
  const hasInvalidText = urlInput.trim().length > 0 && !videoId;
  const isHome = variant === 'home';

  const content = (
    <div
      className={
        isHome
          ? 'rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-4 sm:p-5'
          : 'rounded-2xl border border-[#3a322a] bg-[#14110f] p-4'
      }
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <label
          htmlFor={inputId}
          className="text-sm sm:text-base font-bold text-[#f4ece1]"
        >
          {isHome ? 'Paste any YouTube link' : 'Or paste any YouTube link'}
        </label>
        <span className="text-xs text-[#b9aa98]">
          Supports watch, youtu.be, and Shorts links
        </span>
      </div>

      <div className="relative mt-2.5">
        <Link2
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#f2a33a]"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
          className="w-full min-h-[44px] rounded-full border border-[#3a322a] bg-[#14110f] pl-10 pr-11 py-2.5 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
        />
        {urlInput && (
          <button
            type="button"
            onClick={() => setUrlInput('')}
            aria-label="Clear YouTube link"
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#b9aa98] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {hasInvalidText && (
        <p className="mt-2 text-xs text-[#b9aa98]">
          Paste a full YouTube link (youtube.com/watch, youtu.be, or /shorts/).
        </p>
      )}

      {videoId && (
        <div className="mt-4 rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3.5 sm:p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative aspect-video w-full sm:w-44 shrink-0 overflow-hidden rounded-xl border border-[#3a322a] bg-[#14110f]">
              {!thumbError ? (
                <img
                  src={thumbnailUrl}
                  alt={title || 'YouTube video thumbnail'}
                  referrerPolicy="no-referrer"
                  onError={() => setThumbError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#14110f]">
                  <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm sm:text-base font-bold text-[#f4ece1] line-clamp-2">
                {title}
              </p>
              <p className="mt-1 font-mono text-xs text-[#b9aa98]">
                ID: {videoId}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onCreateRoomWithVideo({
                      videoId,
                      title: loadingTitle ? `YouTube Video (${videoId})` : title,
                      thumbnail: thumbnailUrl,
                    })
                  }
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2 text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>Create Room with this</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!isHome) {
    return content;
  }

  return (
    <section
      aria-label="Paste a YouTube link"
      className="px-4 pt-5 pb-2 sm:px-6 lg:px-8"
    >
      {content}
    </section>
  );
}
