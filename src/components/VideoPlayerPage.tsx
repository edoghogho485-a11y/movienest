import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Film,
  Lock,
  Share2,
  Users,
} from 'lucide-react';
import { LibraryVideo } from '../data/libraryVideos';
import { fetchArchiveMovieDetails } from '../lib/archive';
import {
  getArchiveWatchAloneLink,
  getWatchAloneLink,
  ShareTarget,
} from '../lib/share';
import {
  fetchYouTubeTitle,
  loadYouTubeIframeAPI,
  YTPlayer,
} from '../lib/youtube';

export interface WatchableVideo {
  id: string;
  title: string;
  category: string;
  youtubeId: string;
  thumbnail: string;
  duration?: string;
  source?: 'youtube' | 'archive';
  videoUrl?: string;
}

interface VideoPlayerPageProps {
  video: WatchableVideo;
  relatedVideos: LibraryVideo[];
  onBack: () => void;
  onShare: (target: ShareTarget) => void;
  onInviteFriends: (video: WatchableVideo, currentSeconds: number) => void;
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
      className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] active:opacity-80 rounded-xl cursor-pointer"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#2a2a33] bg-[#14141a] transition-colors group-hover:border-[#E50914]">
        {!imgError ? (
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
            <span className="text-xs font-medium text-zinc-200 text-center line-clamp-1">
              {item.title}
            </span>
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
          aria-hidden="true"
        />
        <span className="absolute right-2.5 bottom-2 font-mono text-xs font-medium text-white tabular-nums">
          {item.duration}
        </span>
      </div>
      <p className="mt-2 font-display text-sm font-semibold text-white line-clamp-1 group-hover:text-[#E50914]">
        {item.title}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400">{item.category}</p>
    </button>
  );
}

// Solo player page (?watch=VIDEO_ID or ?archive=IDENTIFIER): zero room, zero chat, zero reactions, zero Supabase writes
export function VideoPlayerPage({
  video,
  relatedVideos,
  onBack,
  onShare,
  onInviteFriends,
  onSelectSampleVideo,
}: VideoPlayerPageProps) {
  const isArchive = video.source === 'archive';

  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);
  const [archiveUrl, setArchiveUrl] = useState<string | null>(
    isArchive ? video.videoUrl ?? null : null
  );
  const [archiveLoading, setArchiveLoading] = useState<boolean>(
    isArchive && !video.videoUrl
  );
  const [archiveError, setArchiveError] = useState<boolean>(false);

  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);

  // Resolve YouTube title via oEmbed when opened directly via ?watch=VIDEO_ID
  useEffect(() => {
    setResolvedTitle(null);
    if (isArchive || !video.title.startsWith('YouTube Video (')) return;

    let cancelled = false;
    fetchYouTubeTitle(video.youtubeId).then((fetched) => {
      if (!cancelled) setResolvedTitle(fetched);
    });
    return () => {
      cancelled = true;
    };
  }, [isArchive, video.youtubeId, video.title]);

  // Resolve Internet Archive MP4 URL + title from metadata when source === 'archive'
  useEffect(() => {
    if (!isArchive) {
      setArchiveUrl(null);
      setArchiveLoading(false);
      setArchiveError(false);
      return;
    }

    if (video.videoUrl) {
      setArchiveUrl(video.videoUrl);
      setArchiveLoading(false);
      setArchiveError(false);
      return;
    }

    let cancelled = false;
    setArchiveLoading(true);
    setArchiveError(false);

    fetchArchiveMovieDetails(video.youtubeId).then((details) => {
      if (cancelled) return;
      setArchiveLoading(false);
      if (details.title) {
        setResolvedTitle(details.title);
      }
      if (!details.mp4Url) {
        setArchiveError(true);
        return;
      }
      setArchiveUrl(details.mp4Url);
    });

    return () => {
      cancelled = true;
    };
  }, [isArchive, video.youtubeId, video.videoUrl]);

  // Initialize YouTube IFrame Player only when source is YouTube
  useEffect(() => {
    if (isArchive) return;

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
  }, [isArchive, video.youtubeId]);

  const displayTitle = resolvedTitle ?? video.title;

  const handleShareVideo = () => {
    onShare({
      kind: 'video',
      title: displayTitle,
      videoId: video.youtubeId,
      url: isArchive
        ? getArchiveWatchAloneLink(video.youtubeId)
        : getWatchAloneLink(video.youtubeId),
    });
  };

  const handleInviteFriends = () => {
    let currentTime = 0;
    try {
      if (isArchive) {
        currentTime = htmlVideoRef.current?.currentTime ?? 0;
      } else {
        currentTime = playerRef.current?.getCurrentTime() ?? 0;
      }
    } catch {
      currentTime = 0;
    }

    onInviteFriends(
      {
        ...video,
        title: displayTitle,
        source: isArchive ? 'archive' : 'youtube',
        videoUrl: archiveUrl ?? video.videoUrl,
      },
      Math.max(0, Math.floor(currentTime))
    );
  };

  return (
    <section className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 -ml-2 text-sm font-medium text-zinc-300 transition-colors hover:text-[#E50914] active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to MovieNest</span>
      </button>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[#2a2a33] bg-[#14141a]">
        {isArchive ? (
          archiveLoading ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black p-6 text-center">
              <Film className="h-8 w-8 text-[#E50914] animate-pulse" aria-hidden="true" />
              <p className="text-sm font-medium text-zinc-200">
                Loading movie from Internet Archive...
              </p>
            </div>
          ) : archiveError || !archiveUrl ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#2a2a33] bg-[#1b1b24]">
                <Film className="h-5 w-5 text-[#E50914]" aria-hidden="true" />
              </div>
              <div className="max-w-md space-y-1.5">
                <p className="font-display text-lg font-semibold text-white">
                  This Archive movie couldn&apos;t load
                </p>
                <p className="text-sm text-zinc-400">
                  The MP4 stream may be unavailable or temporarily slow on Internet Archive.
                </p>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
              >
                <span>Try another movie</span>
              </button>
            </div>
          ) : (
            <video
              ref={htmlVideoRef}
              src={archiveUrl}
              controls
              playsInline
              autoPlay
              onError={() => setArchiveError(true)}
              className="aspect-video w-full bg-black"
            />
          )
        ) : embedBlocked ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#2a2a33] bg-[#1b1b24]">
              <Lock className="h-5 w-5 text-[#E50914]" aria-hidden="true" />
            </div>
            <div className="max-w-md space-y-1.5">
              <p className="font-display text-lg font-semibold text-white">
                This video&apos;s owner blocks embedding
              </p>
              <p className="text-sm text-zinc-400">
                YouTube restricts playback of this video on external websites, so you can watch it
                directly on YouTube instead.
              </p>
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710]"
            >
              <span>Open on YouTube</span>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div ref={playerMountRef} className="relative aspect-video w-full bg-black" />
        )}
      </div>

      <div className="mt-6 flex flex-col gap-5 border-b border-[#2a2a33] pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {displayTitle}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            <span>Watching Alone</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>{isArchive ? 'Internet Archive' : video.category}</span>
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

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleShareVideo}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#2a2a33] bg-[#14141a] px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
          >
            <Share2 className="h-4 w-4 text-[#E50914]" aria-hidden="true" />
            <span>Share</span>
          </button>

          <button
            type="button"
            onClick={handleInviteFriends}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>Invite friends</span>
          </button>
        </div>
      </div>

      {relatedVideos.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-semibold text-white">
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
