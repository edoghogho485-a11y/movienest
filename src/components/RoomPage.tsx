import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Film,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Share2,
  Users,
} from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import { fetchArchiveMovieDetails } from '../lib/archive';
import { copyTextToClipboard, ShareTarget } from '../lib/share';
import {
  findRoomByCode,
  getInviteLink,
  RoomRecord,
  SharedLibraryItem,
  supabase,
  updateRoomPlayback,
} from '../lib/supabase';
import {
  fetchYouTubeTitle,
  loadYouTubeIframeAPI,
  YTPlayer,
} from '../lib/youtube';
import { RoomChat } from './RoomChat';

const REACTION_EMOJIS = ['❤️', '😂', '😭', '😡', '😮', '🔥'] as const;
const REACTION_COOLDOWN_MS = 1000;

interface FloatingReaction {
  id: string;
  emoji: string;
  leftPercent: number;
}

function resolveRoomVideo(videoId: string, sharedLibrary: SharedLibraryItem[]) {
  const fromShared = sharedLibrary.find((v) => v.video_id === videoId);
  if (fromShared) {
    return {
      title: fromShared.title,
      meta: fromShared.category,
      youtubeId: fromShared.video_id,
      needsTitleLookup: false,
    };
  }

  const fromLibrary = LIBRARY_VIDEOS.find(
    (v) => v.id === videoId || v.youtubeId === videoId
  );
  if (fromLibrary) {
    return {
      title: fromLibrary.title,
      meta: `${fromLibrary.category} · ${fromLibrary.duration}`,
      youtubeId: fromLibrary.youtubeId,
      needsTitleLookup: false,
    };
  }

  const fromFeatured = FEATURED_VIDEOS.find(
    (v) => v.id === videoId || v.youtubeId === videoId
  );
  if (fromFeatured) {
    return {
      title: fromFeatured.title,
      meta: `${fromFeatured.genre} · ${fromFeatured.duration}`,
      youtubeId: fromFeatured.youtubeId,
      needsTitleLookup: false,
    };
  }

  return {
    title: `Movie (${videoId})`,
    meta: 'Shared room playback',
    youtubeId: videoId || LIBRARY_VIDEOS[0].youtubeId,
    needsTitleLookup: true,
  };
}

function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

interface RoomPageProps {
  room: RoomRecord;
  sharedLibrary: SharedLibraryItem[];
  onBack: () => void;
  onShare: (target: ShareTarget) => void;
}

export function RoomPage({ room, sharedLibrary, onBack, onShare }: RoomPageProps) {
  const isArchive = room.source === 'archive';

  const [copied, setCopied] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'synced' | 'reconnecting'>('connecting');
  const [peopleCount, setPeopleCount] = useState(1);
  const [roomState, setRoomState] = useState<{
    isPlaying: boolean;
    positionSeconds: number;
  }>({
    isPlaying: room.is_playing,
    positionSeconds: room.position_seconds,
  });

  const [playerReady, setPlayerReady] = useState(false);
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);

  // Internet Archive MP4 state
  const [archiveUrl, setArchiveUrl] = useState<string | null>(
    isArchive ? room.video_url ?? null : null
  );
  const [archiveLoading, setArchiveLoading] = useState<boolean>(
    isArchive && !room.video_url
  );
  const [archiveError, setArchiveError] = useState<boolean>(false);

  // Floating reactions state (Broadcast over Supabase Realtime, max 1/sec per viewer)
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [reactionCooldown, setReactionCooldown] = useState(false);

  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const lastReactionAtRef = useRef<number>(0);

  // Latest room state ref so async player callbacks always see current target state
  const latestRoomStateRef = useRef(roomState);
  latestRoomStateRef.current = roomState;

  // Loop-prevention refs:
  // 1) isApplyingRemoteRef pauses outgoing DB updates while applying an incoming Realtime event
  // 2) recentSentTimestampsRef ignores our own Supabase row updates echoing back over Realtime
  const isApplyingRemoteRef = useRef(false);
  const remoteResetTimerRef = useRef<number | null>(null);
  const recentSentTimestampsRef = useRef<Set<number>>(new Set());

  // Track last observed playback position to detect timeline seeks (YouTube)
  const lastTimeCheckRef = useRef<{ time: number; wallMs: number; wasPlaying: boolean }>({
    time: room.position_seconds,
    wallMs: Date.now(),
    wasPlaying: room.is_playing,
  });

  // Unique presence key for this browser tab
  const clientIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `viewer-${Math.random().toString(36).slice(2, 10)}`
  );

  const video = resolveRoomVideo(room.video_id, sharedLibrary);
  const displayVideoTitle = resolvedTitle ?? video.title;
  const inviteLink = getInviteLink(room.code);

  // Spawn an emoji that floats up over the video and removes itself when finished
  const spawnFloatingReaction = (id: string, emoji: string) => {
    const leftPercent = 14 + Math.floor(Math.random() * 72);
    setFloatingReactions((prev) => {
      if (prev.some((item) => item.id === id)) return prev;
      return [...prev.slice(-18), { id, emoji, leftPercent }];
    });

    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
    }, 2300);
  };

  // Resolve title (and Archive MP4 URL if needed)
  useEffect(() => {
    setResolvedTitle(null);

    if (isArchive) {
      let cancelled = false;
      setArchiveError(false);
      if (room.video_url) {
        setArchiveUrl(room.video_url);
        setArchiveLoading(false);
      } else {
        setArchiveLoading(true);
      }

      fetchArchiveMovieDetails(room.video_id).then((details) => {
        if (cancelled) return;
        if (details.title) setResolvedTitle(details.title);
        if (!room.video_url) {
          setArchiveLoading(false);
          if (details.mp4Url) {
            setArchiveUrl(details.mp4Url);
          } else {
            setArchiveError(true);
          }
        }
      });

      return () => {
        cancelled = true;
      };
    }

    if (!video.needsTitleLookup) return;

    let cancelled = false;
    fetchYouTubeTitle(video.youtubeId).then((fetched) => {
      if (!cancelled) setResolvedTitle(fetched);
    });

    return () => {
      cancelled = true;
    };
  }, [isArchive, room.video_id, room.video_url, video.youtubeId, video.needsTitleLookup]);

  // Push local play/pause/seek state to Supabase
  const pushLocalState = async (isPlaying: boolean, positionSeconds: number) => {
    const updatedAt = new Date().toISOString();
    const sentMs = Date.parse(updatedAt);
    recentSentTimestampsRef.current.add(sentMs);
    window.setTimeout(() => {
      recentSentTimestampsRef.current.delete(sentMs);
    }, 10000);

    setRoomState({
      isPlaying,
      positionSeconds: Math.max(0, Math.floor(positionSeconds)),
    });

    await updateRoomPlayback({
      roomId: room.id,
      isPlaying,
      positionSeconds,
      updatedAt,
    });
  };

  // Apply remote state from Supabase to whichever player is active (HTML5 Archive or YouTube)
  const applyRemoteStateToPlayer = (isPlaying: boolean, targetSeconds: number) => {
    if (isArchive) {
      const videoEl = htmlVideoRef.current;
      if (!videoEl) return;

      isApplyingRemoteRef.current = true;
      if (remoteResetTimerRef.current) {
        window.clearTimeout(remoteResetTimerRef.current);
      }

      // Only seek when the time differs by more than 2 seconds
      if (Math.abs(videoEl.currentTime - targetSeconds) > 2) {
        videoEl.currentTime = targetSeconds;
      }

      if (isPlaying && videoEl.paused) {
        void videoEl.play().catch(() => {
          // Browser autoplay policies may pause unmuted playback until user taps Play
        });
      } else if (!isPlaying && !videoEl.paused) {
        videoEl.pause();
      }

      remoteResetTimerRef.current = window.setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 900);
      return;
    }

    const player = playerRef.current;
    if (!player) return;

    isApplyingRemoteRef.current = true;
    if (remoteResetTimerRef.current) {
      window.clearTimeout(remoteResetTimerRef.current);
    }

    const currentTime = player.getCurrentTime();
    const currentState = player.getPlayerState();

    // Only seek if the time differs by more than 2 seconds
    if (Math.abs(currentTime - targetSeconds) > 2) {
      player.seekTo(targetSeconds, true);
    }

    if (isPlaying && currentState !== 1) {
      player.playVideo();
    } else if (!isPlaying && currentState === 1) {
      player.pauseVideo();
    }

    lastTimeCheckRef.current = {
      time: targetSeconds,
      wallMs: Date.now(),
      wasPlaying: isPlaying,
    };

    // Release remote-guard after YouTube's async state transition settles
    remoteResetTimerRef.current = window.setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 1200);
  };

  // 1. Initialize YouTube IFrame Player API when source is YouTube
  useEffect(() => {
    if (isArchive) return;

    let cancelled = false;
    setPlayerReady(false);
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
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setPlayerReady(true);

            const initial = latestRoomStateRef.current;
            if (initial.isPlaying || initial.positionSeconds > 2) {
              applyRemoteStateToPlayer(initial.isPlaying, initial.positionSeconds);
            }
          },
          onStateChange: (event) => {
            if (cancelled || isApplyingRemoteRef.current) return;

            const currentTime = event.target.getCurrentTime();
            if (event.data === YT.PlayerState.PLAYING) {
              lastTimeCheckRef.current = {
                time: currentTime,
                wallMs: Date.now(),
                wasPlaying: true,
              };
              void pushLocalState(true, currentTime);
            } else if (event.data === YT.PlayerState.PAUSED) {
              lastTimeCheckRef.current = {
                time: currentTime,
                wallMs: Date.now(),
                wasPlaying: false,
              };
              void pushLocalState(false, currentTime);
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
      if (remoteResetTimerRef.current) {
        window.clearTimeout(remoteResetTimerRef.current);
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore cleanup errors
        }
        playerRef.current = null;
      }
    };
  }, [isArchive, room.id, video.youtubeId]);

  // 2. Detect YouTube timeline seeks
  useEffect(() => {
    if (isArchive || !playerReady || embedBlocked) return;

    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || isApplyingRemoteRef.current) return;

      const state = player.getPlayerState();
      const actualTime = player.getCurrentTime();
      const now = Date.now();
      const prev = lastTimeCheckRef.current;

      const isPlaying = state === 1;
      const elapsedSec = prev.wasPlaying ? (now - prev.wallMs) / 1000 : 0;
      const expectedTime = prev.time + elapsedSec;

      if (Math.abs(actualTime - expectedTime) > 2) {
        lastTimeCheckRef.current = {
          time: actualTime,
          wallMs: now,
          wasPlaying: isPlaying,
        };
        void pushLocalState(isPlaying, actualTime);
      } else {
        lastTimeCheckRef.current = {
          time: actualTime,
          wallMs: now,
          wasPlaying: isPlaying,
        };
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [isArchive, playerReady, embedBlocked, room.id]);

  // 3. Subscribe to Supabase Realtime row updates, Presence, and Broadcast reactions
  useEffect(() => {
    setSyncStatus('connecting');

    const channel = supabase.channel(`room:${room.id}`, {
      config: {
        presence: { key: clientIdRef.current },
      },
    });
    roomChannelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${room.id}`,
        },
        (payload) => {
          const updated = payload.new as RoomRecord;

          // Ignore the echo of updates triggered by our own player
          const incomingMs = Date.parse(updated.updated_at);
          for (const sentMs of recentSentTimestampsRef.current) {
            if (Math.abs(incomingMs - sentMs) < 250) {
              return;
            }
          }

          setRoomState({
            isPlaying: updated.is_playing,
            positionSeconds: updated.position_seconds,
          });

          applyRemoteStateToPlayer(updated.is_playing, updated.position_seconds);
        }
      )
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const data = payload as { id?: string; emoji?: string } | null;
        if (data?.id && data?.emoji) {
          spawnFloatingReaction(data.id, data.emoji);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const count = Object.keys(presenceState).length;
        setPeopleCount(Math.max(1, count));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus('synced');
          await channel.track({ joined_at: new Date().toISOString() });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncStatus('reconnecting');
        }
      });

    return () => {
      roomChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [room.id]);

  const handleCopyInvite = async () => {
    const ok = await copyTextToClipboard(inviteLink);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareRoom = () => {
    onShare({
      kind: 'room',
      title: displayVideoTitle,
      roomCode: room.code,
      url: inviteLink,
    });
  };

  // Broadcast emoji reaction (limited to 1 reaction per second per viewer)
  const handleSendReaction = (emoji: string) => {
    const now = Date.now();
    if (now - lastReactionAtRef.current < REACTION_COOLDOWN_MS) return;

    lastReactionAtRef.current = now;
    setReactionCooldown(true);
    window.setTimeout(() => setReactionCooldown(false), REACTION_COOLDOWN_MS);

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${now}-${Math.random().toString(36).slice(2, 8)}`;

    spawnFloatingReaction(id, emoji);

    void roomChannelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { id, emoji },
    });
  };

  // Manual touch-friendly play/pause control
  const handleTogglePlayPause = () => {
    if (isArchive) {
      const videoEl = htmlVideoRef.current;
      if (!videoEl) return;
      if (videoEl.paused) {
        void videoEl.play().catch(() => {});
      } else {
        videoEl.pause();
      }
      return;
    }

    const player = playerRef.current;
    if (!player) return;

    const isCurrentlyPlaying = player.getPlayerState() === 1;
    if (isCurrentlyPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  // Re-fetch the latest room row from Supabase so Sync Player works even after network sleep
  const handleManualResync = async () => {
    setResyncing(true);
    const { room: latest } = await findRoomByCode(room.code);
    setResyncing(false);

    if (latest) {
      setRoomState({
        isPlaying: latest.is_playing,
        positionSeconds: latest.position_seconds,
      });
      applyRemoteStateToPlayer(latest.is_playing, latest.position_seconds);
    } else {
      applyRemoteStateToPlayer(roomState.isPlaying, roomState.positionSeconds);
    }
  };

  return (
    <section className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 -ml-2 text-sm font-medium text-zinc-300 transition-colors hover:text-[#E50914] active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to MovieNest</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-sm font-semibold tracking-wider text-[#E50914]">
            {room.code}
          </span>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#2a2a33] bg-[#14141a] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShareRoom}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>Share</span>
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {room.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Now playing: <span className="text-zinc-200">{displayVideoTitle}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>{isArchive ? 'Internet Archive' : video.meta}</span>
          </p>
        </div>

        {/* Live Realtime sync & room presence indicator */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-300 pt-1">
          <span className="inline-flex items-center gap-1.5" aria-live="polite">
            <span
              className={`h-2 w-2 rounded-full ${
                syncStatus === 'synced'
                  ? 'bg-emerald-400'
                  : syncStatus === 'reconnecting'
                    ? 'bg-[#E50914]'
                    : 'bg-zinc-400'
              }`}
              aria-hidden="true"
            />
            <span>
              {syncStatus === 'synced'
                ? 'Synced'
                : syncStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Connecting'}
            </span>
          </span>

          <span className="text-zinc-600" aria-hidden="true">
            ·
          </span>

          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Users className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
            <span>
              {peopleCount} {peopleCount === 1 ? 'person' : 'people'} in room
            </span>
          </span>
        </div>
      </div>

      {/* Responsive layout: stacked under video on phones, beside video on laptops */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-8 flex flex-col">
          {/* Responsive 16:9 Player + floating reactions overlay */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111116] shadow-2xl">
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
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#181820]">
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
                  onLoadedMetadata={(e) => {
                    setPlayerReady(true);
                    const initial = latestRoomStateRef.current;
                    if (initial.positionSeconds > 2) {
                      isApplyingRemoteRef.current = true;
                      e.currentTarget.currentTime = initial.positionSeconds;
                      window.setTimeout(() => {
                        isApplyingRemoteRef.current = false;
                      }, 700);
                    }
                    if (initial.isPlaying) {
                      void e.currentTarget.play().catch(() => {});
                    }
                  }}
                  onPlay={(e) => {
                    if (!isApplyingRemoteRef.current) {
                      void pushLocalState(true, e.currentTarget.currentTime);
                    }
                  }}
                  onPause={(e) => {
                    if (!isApplyingRemoteRef.current && !e.currentTarget.ended) {
                      void pushLocalState(false, e.currentTarget.currentTime);
                    }
                  }}
                  onSeeked={(e) => {
                    if (!isApplyingRemoteRef.current) {
                      void pushLocalState(!e.currentTarget.paused, e.currentTarget.currentTime);
                    }
                  }}
                  onError={() => setArchiveError(true)}
                  className="aspect-video w-full bg-black"
                />
              )
            ) : embedBlocked ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#181820]">
                  <Lock className="h-5 w-5 text-[#E50914]" aria-hidden="true" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <p className="font-display text-lg font-semibold text-white">
                    This video&apos;s owner blocks embedding
                  </p>
                  <p className="text-sm text-zinc-400">
                    YouTube doesn&apos;t allow this video to play inside external apps. You can
                    open it directly on YouTube instead.
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

            {/* Floating emoji reactions overlay (broadcast to everyone in the room) */}
            {floatingReactions.length > 0 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
              >
                {floatingReactions.map((reaction) => (
                  <span
                    key={reaction.id}
                    style={{ left: `${reaction.leftPercent}%`, bottom: '12%' }}
                    className="animate-float-reaction absolute text-3xl sm:text-4xl select-none"
                  >
                    {reaction.emoji}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Synced playback controls + live emoji reaction buttons */}
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#2a2a33] bg-[#14141a] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            {!(embedBlocked || archiveError) ? (
              <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-start">
                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  disabled={!playerReady}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] disabled:opacity-50 cursor-pointer"
                >
                  {roomState.isPlaying ? (
                    <>
                      <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                      <span>Pause for All</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      <span>Play for All</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleManualResync}
                  disabled={!playerReady || resyncing}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#1b1b24] px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30 active:bg-[#282834] disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${resyncing ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{resyncing ? 'Syncing...' : 'Sync Player'}</span>
                </button>

                <span className="font-mono text-xs text-zinc-300 tabular-nums">
                  {formatSeconds(roomState.positionSeconds)}
                </span>
              </div>
            ) : (
              <div />
            )}

            {/* Room reactions bar (1 reaction per second per viewer) */}
            <div
              role="group"
              aria-label="Send a reaction to the room"
              className="flex flex-wrap items-center gap-1.5"
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={reactionCooldown}
                  onClick={() => handleSendReaction(emoji)}
                  aria-label={`React with ${emoji}`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#2a2a33] bg-[#1b1b24] text-lg transition-colors hover:border-[#E50914] active:bg-[#2a2a38] disabled:opacity-50 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <RoomChat roomCode={room.code} />
        </div>
      </div>
    </section>
  );
}
