import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Users,
} from 'lucide-react';
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import {
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
    title: `YouTube Video (${videoId})`,
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
}

export function RoomPage({ room, sharedLibrary, onBack }: RoomPageProps) {
  const [copied, setCopied] = useState(false);
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

  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  // Latest room state ref so async YouTube callbacks always see current target state
  const latestRoomStateRef = useRef(roomState);
  latestRoomStateRef.current = roomState;

  // Loop-prevention refs:
  // 1) isApplyingRemoteRef pauses outgoing DB updates while applying an incoming Realtime event
  // 2) recentSentTimestampsRef ignores our own Supabase row updates echoing back over Realtime
  const isApplyingRemoteRef = useRef(false);
  const remoteResetTimerRef = useRef<number | null>(null);
  const recentSentTimestampsRef = useRef<Set<number>>(new Set());

  // Track last observed playback position to detect timeline seeks (even while paused)
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

  // If the room uses a raw YouTube ID not yet in our loaded lists, fetch its title via oEmbed
  useEffect(() => {
    setResolvedTitle(null);
    if (!video.needsTitleLookup) return;

    let cancelled = false;
    fetchYouTubeTitle(video.youtubeId).then((fetched) => {
      if (!cancelled) setResolvedTitle(fetched);
    });

    return () => {
      cancelled = true;
    };
  }, [video.youtubeId, video.needsTitleLookup]);

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

  // Apply remote state from Supabase to the local YouTube player without triggering a loop
  const applyRemoteStateToPlayer = (isPlaying: boolean, targetSeconds: number) => {
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

  // 1. Initialize the YouTube IFrame Player API instance
  useEffect(() => {
    let cancelled = false;
    setPlayerReady(false);
    setEmbedBlocked(false);

    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !playerMountRef.current) return;

      // Clear any previous DOM node before mounting YT.Player
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
          playsinline: 1, // Keeps playback inline on iOS/Android phones
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

            // Sync initial position and play state from Supabase when joining an active room
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
            // YouTube error 101 or 150 means the video owner disabled embedding
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
          // Ignore cleanup errors if iframe was already removed
        }
        playerRef.current = null;
      }
    };
  }, [room.id, video.youtubeId]);

  // 2. Detect timeline seeks (when scrubbing while playing or paused)
  useEffect(() => {
    if (!playerReady || embedBlocked) return;

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

      // If the player jumped by more than 2 seconds from expected playback, user seeked
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
  }, [playerReady, embedBlocked, room.id]);

  // 3. Subscribe to Supabase Realtime row updates and Realtime Presence for this room
  useEffect(() => {
    setSyncStatus('connecting');

    const channel = supabase.channel(`room:${room.id}`, {
      config: {
        presence: { key: clientIdRef.current },
      },
    });

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
      void supabase.removeChannel(channel);
    };
  }, [room.id]);

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is unavailable
    }
  };

  // Manual touch-friendly play/pause control (triggers onStateChange -> pushLocalState)
  const handleTogglePlayPause = () => {
    const player = playerRef.current;
    if (!player) return;

    const isCurrentlyPlaying = player.getPlayerState() === 1;
    if (isCurrentlyPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  const handleManualResync = () => {
    applyRemoteStateToPlayer(roomState.isPlaying, roomState.positionSeconds);
  };

  return (
    <section className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 -ml-2 text-sm font-medium text-zinc-300 transition-colors hover:text-[#E50914] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to MovieNest</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold tracking-wider text-[#E50914]">
            {room.code}
          </span>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/15 bg-[#111116] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:border-white/30 hover:bg-[#181820] cursor-pointer"
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
            <span>{video.meta}</span>
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
          {/* Responsive 16:9 YouTube IFrame API mount or Embed Fallback */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111116] shadow-2xl">
            {embedBlocked ? (
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
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612]"
                >
                  <span>Open on YouTube</span>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            ) : (
              <div ref={playerMountRef} className="relative aspect-video w-full bg-black" />
            )}
          </div>

          {/* Mobile-friendly synced playback controls bar */}
          {!embedBlocked && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111116] px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  disabled={!playerReady}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] disabled:opacity-50 cursor-pointer"
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

                <span className="font-mono text-xs text-zinc-300 tabular-nums">
                  Room time: {formatSeconds(roomState.positionSeconds)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleManualResync}
                disabled={!playerReady}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#181820] px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sync Player</span>
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-4">
          <RoomChat roomCode={room.code} />
        </div>
      </div>
    </section>
  );
}
