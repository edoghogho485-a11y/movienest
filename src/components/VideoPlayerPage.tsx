import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Film, Lock, Users } from 'lucide-react';
import { LibraryVideo } from '../data/libraryVideos';
import { loadYouTubeIframeAPI, YTPlayer } from '../lib/youtube';

export interface WatchableVideo {
  id: string;
  title: string;
  category: string;
  youtubeId: string;
  thumbnail: string;
  duration?: string;
}

interface VideoPlayerPageProps {
  video: WatchableVideo;
  relatedVideos: LibraryVideo[];
  onBack: () => void;
  onCreateRoomWithVideo: (video: WatchableVideo) => void;
  onSelectSampleVideo: (video: LibraryVideo) => void;
}

function RelatedVideoCard({
  item,
  onSelect,
}: {
  item: LibraryVideo;
  onSelect: (video: LibraryVideo) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl cursor-pointer"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#111625] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:border-amber-400/50">
        {!imgError ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#0F172A] via-[#111625] to-[#1C1917] p-3">
            <Film className="h-6 w-6 text-amber-400/80" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-300 text-center line-clamp-1">
              {item.title}
            </span>
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
          aria-hidden="true"
        />
        <span className="absolute right-2.5 bottom-2 font-mono text-xs font-medium text-slate-100 tabular-nums">
          {item.duration}
        </span>
      </div>
      <p className="mt-2 font-display text-sm font-semibold text-slate-100 line-clamp-1 group-hover:text-amber-300">
        {item.title}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{item.category}</p>
    </button>
  );
}

export function VideoPlayerPage({
  video,
  relatedVideos,
  onBack,
  onCreateRoomWithVideo,
  onSelectSampleVideo,
}: VideoPlayerPageProps) {
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEmbedBlocked(false);

    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !playerMountRef.current) return;

      playerMountRef.current.innerHTML = '';
      const playerDiv = document.createElement('div');
      playerDiv.className = 'h-full w-full';
      playerMountRef.current.appendChild(playerDiv);

      const player = new YT.Player(playerDiv, {
        width: '100%',
        height: '100%',
        videoId: video.youtubeId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          playsinline: 1,
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (!cancelled) {
              playerRef.current = player;
            }
          },
          onError: (event) => {
            // YouTube error 101 or 150 means the owner blocked embedding
            if (!cancelled && (event.data === 101 || event.data === 150)) {
              setEmbedBlocked(true);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore cleanup errors
        }
        playerRef.current = null;
      }
    };
  }, [video.youtubeId]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 -ml-2 text-sm font-medium text-slate-300 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to MovieNest</span>
      </button>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0D121F] shadow-2xl">
        {embedBlocked ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#111625]">
              <Lock className="h-5 w-5 text-amber-400" aria-hidden="true" />
            </div>
            <div className="max-w-md space-y-1.5">
              <p className="font-display text-lg font-semibold text-slate-100">
                This video&apos;s owner blocks embedding
              </p>
              <p className="text-sm text-slate-400">
                YouTube restricts playback of this video on external websites, so you can watch it
                directly on YouTube instead.
              </p>
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400"
            >
              <span>Open on YouTube</span>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div ref={playerMountRef} className="relative aspect-video w-full bg-black" />
        )}
      </div>

      <div className="mt-6 flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            {video.title}
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            <span>{video.category}</span>
            {video.duration && (
              <>
                <span className="mx-2" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums">{video.duration}</span>
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCreateRoomWithVideo(video)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-amber-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090F] cursor-pointer"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>Create Room with this video</span>
        </button>
      </div>

      {relatedVideos.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-semibold text-slate-100">
            Sample Videos
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {relatedVideos.slice(0, 4).map((item) => (
              <RelatedVideoCard
                key={item.id}
                item={item}
                onSelect={onSelectSampleVideo}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
