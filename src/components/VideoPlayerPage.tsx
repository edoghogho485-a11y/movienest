import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ExternalLink,
  Film,
  Lock,
  Share2,
  Users,
} from 'lucide-react';
import { LibraryVideo } from '../data/libraryVideos';
import {
  fetchArchiveMovieDetails,
  getArchiveThumbnail,
  isValidArchiveDownloadUrl,
} from '../lib/archive';
import { upsertWatchHistory } from '../lib/localLists';
import {
  getArchiveWatchAloneLink,
  getWatchAloneLink,
  ShareTarget,
} from '../lib/share';
import {
  fetchYouTubeTitle,
  getYouTubeThumbnail,
  loadYouTubeIframeAPI,
  YTPlayer,
} from '../lib/youtube';
import { BookmarkButton } from './BookmarkButton';

export interface WatchableVideo {
  id: string;
  title: string;
  category: string;
  youtubeId: string;
  thumbnail: string;
  duration?: string;
  source?: 'youtube' | 'archive';
  videoUrl?: string;
  initialPositionSeconds?: number;
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
      className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 rounded-2xl cursor-pointer"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-[#3a322a] bg-[#1e1a16] transition-colors group-hover:border-[#f2a33a]">
        {!imgError ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#1e1a16] p-3">
            <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
            <span className="text-xs font-medium text-[#f4ece1] text-center line-clamp-1">
              {item.title}
            </span>
          </div>
        )}
        <span className="absolute right-2.5 bottom-2 rounded-md bg-[#14110f]/90 px-2 py-0.5 font-mono text-xs font-medium text-[#f4ece1] tabular-nums">
          {item.duration}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold text-[#f4ece1] line-clamp-1 group-hover:text-[#f2a33a]">
        {item.title}
      </p>
      <p className="mt-0.5 text-xs text-[#b9aa98]">{item.category}</p>
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
  const initialSeekRef = useRef<number>(
    typeof video.initialPositionSeconds === 'number' && video.initialPositionSeconds > 1
      ? Math.floor(video.initialPositionSeconds)
      : 0
  );
  useEffect(() => {
    initialSeekRef.current =
      typeof video.initialPositionSeconds === 'number' && video.initialPositionSeconds > 1
        ? Math.floor(video.initialPositionSeconds)
        : 0;
  }, [video.youtubeId, video.initialPositionSeconds]);

  const displayTitle = resolvedTitle ?? video.title;
  const resolvedThumbnail =
    video.thumbnail ||
    (isArchive
      ? getArchiveThumbnail(video.youtubeId)
      : getYouTubeThumbnail(video.youtubeId));

  // Keep latest metadata and last observed timestamps for leave/unmount saves
  const latestMetaRef = useRef({
    source: (isArchive ? 'archive' : 'youtube') as 'youtube' | 'archive',
    id: video.youtubeId,
    videoUrl: archiveUrl ?? video.videoUrl ?? null,
    title: displayTitle,
    thumbnail: resolvedThumbnail,
  });
  latestMetaRef.current = {
    source: isArchive ? 'archive' : 'youtube',
    id: video.youtubeId,
    videoUrl: archiveUrl ?? video.videoUrl ?? null,
    title: displayTitle,
    thumbnail: resolvedThumbnail,
  };

  const lastPlaybackRef = useRef<{ position: number; duration: number }>({
    position: 0,
    duration: 0,
  });

  const readPlaybackMetrics = useCallback((): {
    position: number;
    duration: number;
    isPlaying: boolean;
  } => {
    try {
      if (latestMetaRef.current.source === 'archive') {
        const el = htmlVideoRef.current;
        if (el) {
          const pos = Number.isFinite(el.currentTime) ? el.currentTime : 0;
          const dur = Number.isFinite(el.duration) ? el.duration : 0;
          if (pos > 0 || dur > 0) {
            lastPlaybackRef.current = { position: pos, duration: dur };
          }
          return {
            position: pos,
            duration: dur,
            isPlaying: !el.paused && !el.ended,
          };
        }
      } else {
        const player = playerRef.current;
        if (player && typeof player.getCurrentTime === 'function') {
          const pos = player.getCurrentTime();
          const dur = typeof player.getDuration === 'function' ? player.getDuration() : 0;
          const state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
          const safePos = typeof pos === 'number' && Number.isFinite(pos) ? pos : 0;
          const safeDur = typeof dur === 'number' && Number.isFinite(dur) ? dur : 0;
          if (safePos > 0 || safeDur > 0) {
            lastPlaybackRef.current = { position: safePos, duration: safeDur };
          }
          return {
            position: safePos,
            duration: safeDur,
            isPlaying: state === 1,
          };
        }
      }
    } catch {
      // Fall back to last cached playback metrics
    }
    return {
      position: lastPlaybackRef.current.position,
      duration: lastPlaybackRef.current.duration,
      isPlaying: false,
    };
  }, []);

  const saveHistoryProgress = useCallback(
    (markFinished = false) => {
      const meta = latestMetaRef.current;
      const metrics = readPlaybackMetrics();
      const position = metrics.position > 0 ? metrics.position : lastPlaybackRef.current.position;
      const duration = metrics.duration > 0 ? metrics.duration : lastPlaybackRef.current.duration;

      if (position <= 0 && !markFinished) return;

      upsertWatchHistory({
        source: meta.source,
        id: meta.id,
        video_url: meta.videoUrl,
        title: meta.title,
        thumbnail: meta.thumbnail,
        position,
        duration,
        markFinished,
      });
    },
    [readPlaybackMetrics]
  );

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
      if (isValidArchiveDownloadUrl(video.videoUrl)) {
        setArchiveUrl(video.videoUrl);
        setArchiveError(false);
      } else {
        setArchiveUrl(null);
        setArchiveError(true);
      }
      setArchiveLoading(false);
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
      if (!isValidArchiveDownloadUrl(details.mp4Url)) {
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
    lastPlaybackRef.current = { position: 0, duration: 0 };

    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !playerMountRef.current) return;

      playerMountRef.current.replaceChildren();
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
            if (cancelled) return;
            playerRef.current = player;
            if (initialSeekRef.current > 1 && typeof player.seekTo === 'function') {
              player.seekTo(initialSeekRef.current, true);
              initialSeekRef.current = 0;
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === YT.PlayerState.PAUSED) {
              saveHistoryProgress(false);
            } else if (event.data === YT.PlayerState.ENDED) {
              saveHistoryProgress(true);
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
      // Persist final position before tearing down the player
      saveHistoryProgress(false);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore cleanup errors
        }
        playerRef.current = null;
      }
    };
  }, [isArchive, video.youtubeId, saveHistoryProgress]);

  // Save playback position every 10 seconds while playing, and on tab/browser leave
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const metrics = readPlaybackMetrics();
      if (metrics.isPlaying) {
        saveHistoryProgress(false);
      }
    }, 10000);

    const handleLeave = () => {
      saveHistoryProgress(false);
    };

    window.addEventListener('pagehide', handleLeave);
    window.addEventListener('beforeunload', handleLeave);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pagehide', handleLeave);
      window.removeEventListener('beforeunload', handleLeave);
      saveHistoryProgress(false);
    };
  }, [video.youtubeId, isArchive, readPlaybackMetrics, saveHistoryProgress]);

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
        onClick={() => {
          saveHistoryProgress(false);
          onBack();
        }}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] hover:text-[#f2a33a] active:bg-[#2a241e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to MovieNest</span>
      </button>

      <div className="mt-4 overflow-hidden rounded-[20px] border border-[#3a322a] bg-[#1e1a16]">
        {isArchive ? (
          archiveLoading ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-[#14110f] p-6 text-center">
              <Film className="h-8 w-8 text-[#f2a33a] animate-pulse" aria-hidden="true" />
              <p className="text-sm font-medium text-[#f4ece1]">
                Loading movie from Internet Archive...
              </p>
            </div>
          ) : archiveError || !archiveUrl ? (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-[#14110f] p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#3a322a] bg-[#1e1a16]">
                <Film className="h-5 w-5 text-[#f2a33a]" aria-hidden="true" />
              </div>
              <div className="max-w-md space-y-1.5">
                <p className="text-lg font-bold text-[#f4ece1]">
                  This Archive movie couldn&apos;t load
                </p>
                <p className="text-sm text-[#b9aa98]">
                  The MP4 stream may be unavailable or temporarily slow on Internet Archive.
                </p>
              </div>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
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
              onLoadedMetadata={(e) => {
                if (initialSeekRef.current > 1) {
                  e.currentTarget.currentTime = initialSeekRef.current;
                  initialSeekRef.current = 0;
                }
              }}
              onPause={(e) => {
                if (!e.currentTarget.ended) {
                  saveHistoryProgress(false);
                }
              }}
              onEnded={() => saveHistoryProgress(true)}
              onError={() => setArchiveError(true)}
              className="aspect-video w-full bg-[#14110f]"
            />
          )
        ) : embedBlocked ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-[#14110f] p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#3a322a] bg-[#1e1a16]">
              <Lock className="h-5 w-5 text-[#f2a33a]" aria-hidden="true" />
            </div>
            <div className="max-w-md space-y-1.5">
              <p className="text-lg font-bold text-[#f4ece1]">
                This video&apos;s owner blocks embedding
              </p>
              <p className="text-sm text-[#b9aa98]">
                YouTube restricts playback of this video on external websites, so you can watch it
                directly on YouTube instead.
              </p>
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f]"
            >
              <span>Open on YouTube</span>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div ref={playerMountRef} className="relative aspect-video w-full bg-[#14110f]" />
        )}
      </div>

      <div className="mt-6 flex flex-col gap-5 border-b border-[#3a322a] pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#f4ece1] sm:text-3xl">
            {displayTitle}
          </h1>
          <p className="mt-1.5 text-sm text-[#b9aa98]">
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
          <BookmarkButton
            source={isArchive ? 'archive' : 'youtube'}
            id={video.youtubeId}
            videoUrl={archiveUrl ?? video.videoUrl}
            title={displayTitle}
            thumbnail={resolvedThumbnail}
            variant="button"
          />

          <button
            type="button"
            onClick={handleShareVideo}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2.5 text-sm font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
          >
            <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            <span>Share</span>
          </button>

          <button
            type="button"
            onClick={handleInviteFriends}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>Invite friends</span>
          </button>
        </div>
      </div>

      {relatedVideos.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-[#f4ece1]">
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
