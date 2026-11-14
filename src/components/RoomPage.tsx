import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  ExternalLink,
  Film,
  ListVideo,
  Lock,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Share2,
  Timer,
  Users,
  Video,
} from 'lucide-react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import {
  fetchArchiveMovieDetails,
  isValidArchiveDownloadUrl,
} from '../lib/archive';
import { copyTextToClipboard, ShareTarget } from '../lib/share';
import {
  DISPLAY_NAME_MAX_LENGTH,
  findRoomByCode,
  getInviteLink,
  isRoomHost,
  normalizeQueueItems,
  QUEUE_MAX_ITEMS,
  QueueItem,
  RoomControlsMode,
  RoomRecord,
  SharedLibraryItem,
  supabase,
  updateRoomPlayback,
  updateRoomQueue,
  updateRoomSettings,
  updateRoomVideo,
} from '../lib/supabase';
import {
  fetchYouTubeTitle,
  loadYouTubeIframeAPI,
  YTPlayer,
} from '../lib/youtube';
import { DISPLAY_NAME_STORAGE_KEY, RoomChat } from './RoomChat';
import { RoomParticipant, RoomPeopleList } from './RoomPeopleList';
import { RoomQueuePanel } from './RoomQueuePanel';
import { RoomSettingsModal } from './RoomSettingsModal';
import {
  PickerMovieSelection,
  RoomVideoPickerModal,
} from './RoomVideoPickerModal';

const REACTION_EMOJIS = ['❤️', '😂', '😭', '😡', '😮', '🔥'] as const;
const REACTION_COOLDOWN_MS = 1000;

interface FloatingReaction {
  id: string;
  emoji: string;
  leftPercent: number;
}

interface RoomToast {
  id: string;
  text: string;
}

type ActivityAction = 'play' | 'pause' | 'seek' | 'video';

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
      meta: fromLibrary.category,
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
      meta: fromFeatured.genre,
      youtubeId: fromFeatured.youtubeId,
      needsTitleLookup: false,
    };
  }

  return {
    title: `Movie (${videoId})`,
    meta: 'Shared room playback',
    youtubeId: videoId,
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

function makeClientOrEventId(prefix = 'evt'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RoomPageProps {
  room: RoomRecord;
  sharedLibrary: SharedLibraryItem[];
  onBack: () => void;
  onShare: (target: ShareTarget) => void;
}

export function RoomPage({ room, sharedLibrary, onBack, onShare }: RoomPageProps) {
  const [currentRoom, setCurrentRoom] = useState<RoomRecord>(room);
  useEffect(() => {
    setCurrentRoom(room);
  }, [room]);

  const isArchive = currentRoom.source === 'archive';
  const isHost = isRoomHost(currentRoom);
  const controlsMode: RoomControlsMode =
    currentRoom.controls === 'host' ? 'host' : 'everyone';
  const isLocked = Boolean(currentRoom.locked);
  const canControlPlayback = controlsMode === 'everyone' || isHost;
  const queue = normalizeQueueItems(currentRoom.queue);

  // Shared display name synced between RoomChat and Realtime presence
  const [displayName, setDisplayName] = useState<string>(() => {
    try {
      return (
        localStorage
          .getItem(DISPLAY_NAME_STORAGE_KEY)
          ?.trim()
          .slice(0, DISPLAY_NAME_MAX_LENGTH) ?? ''
      );
    } catch {
      return '';
    }
  });

  const [copied, setCopied] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'synced' | 'reconnecting'>(
    'connecting'
  );
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [roomState, setRoomState] = useState<{
    isPlaying: boolean;
    positionSeconds: number;
  }>({
    isPlaying: currentRoom.is_playing,
    positionSeconds: currentRoom.position_seconds,
  });

  // Live "Room time" ticked every second from the active player
  const [roomTimeSeconds, setRoomTimeSeconds] = useState<number>(
    currentRoom.position_seconds
  );

  const [playerReady, setPlayerReady] = useState(false);
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);

  // Internet Archive MP4 state
  const [archiveUrl, setArchiveUrl] = useState<string | null>(
    isArchive ? currentRoom.video_url ?? null : null
  );
  const [archiveLoading, setArchiveLoading] = useState<boolean>(
    isArchive && !currentRoom.video_url
  );
  const [archiveError, setArchiveError] = useState<boolean>(false);

  // Floating reactions, activity/presence toasts, countdown overlay, modals, and mobile tabs
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [reactionNote, setReactionNote] = useState<string | null>(null);
  const [toasts, setToasts] = useState<RoomToast[]>([]);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'chat' | 'people' | 'queue'>('chat');

  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const lastReactionAtRef = useRef<number>(0);

  // Latest state refs so async callbacks avoid stale closures
  const latestRoomRef = useRef(currentRoom);
  latestRoomRef.current = currentRoom;
  const latestRoomStateRef = useRef(roomState);
  latestRoomStateRef.current = roomState;
  const latestCanControlRef = useRef(canControlPlayback);
  latestCanControlRef.current = canControlPlayback;
  const latestDisplayNameRef = useRef(displayName);
  latestDisplayNameRef.current = displayName;
  const latestIsHostRef = useRef(isHost);
  latestIsHostRef.current = isHost;

  // Loop-prevention refs
  const isApplyingRemoteRef = useRef(false);
  const remoteResetTimerRef = useRef<number | null>(null);
  const recentSentTimestampsRef = useRef<Set<number>>(new Set());
  const countdownTimersRef = useRef<number[]>([]);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  // Track presence keys so metadata updates (setting name) don't emit false leave/join toasts
  const hasInitialPresenceSyncRef = useRef(false);
  const knownPresenceNamesRef = useRef<Map<string, string>>(new Map());
  const pendingLeaveTimersRef = useRef<Map<string, number>>(new Map());

  // Track last observed playback position to detect timeline seeks (YouTube)
  const lastTimeCheckRef = useRef<{ time: number; wallMs: number; wasPlaying: boolean }>({
    time: currentRoom.position_seconds,
    wallMs: Date.now(),
    wasPlaying: currentRoom.is_playing,
  });

  // Unique presence key for this browser tab
  const clientIdRef = useRef<string>(makeClientOrEventId('viewer'));

  const video = resolveRoomVideo(currentRoom.video_id, sharedLibrary);
  const displayVideoTitle = resolvedTitle ?? video.title;
  const inviteLink = getInviteLink(currentRoom.code);

  const showToast = useCallback((text: string) => {
    const id = makeClientOrEventId('toast');
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const getCurrentPlayerTime = useCallback((): number => {
    try {
      if (latestRoomRef.current.source === 'archive') {
        return htmlVideoRef.current?.currentTime ?? latestRoomStateRef.current.positionSeconds;
      }
      return playerRef.current?.getCurrentTime() ?? latestRoomStateRef.current.positionSeconds;
    } catch {
      return latestRoomStateRef.current.positionSeconds;
    }
  }, []);

  // Spawn an emoji that floats up over the video
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

  // Broadcast an activity notice so other people in the room see a toast
  const broadcastActivity = useCallback(
    (action: ActivityAction, positionSeconds = 0) => {
      const actor = latestDisplayNameRef.current.trim() || 'Someone';
      void roomChannelRef.current?.send({
        type: 'broadcast',
        event: 'activity',
        payload: {
          id: makeClientOrEventId('act'),
          clientId: clientIdRef.current,
          actor,
          action,
          positionSeconds: Math.max(0, Math.floor(positionSeconds)),
        },
      });
    },
    []
  );

  // Resolve title (and Archive MP4 URL if needed) whenever the active video changes
  useEffect(() => {
    setResolvedTitle(null);

    if (isArchive) {
      let cancelled = false;
      setArchiveError(false);

      if (currentRoom.video_url) {
        if (isValidArchiveDownloadUrl(currentRoom.video_url)) {
          setArchiveUrl(currentRoom.video_url);
        } else {
          setArchiveUrl(null);
          setArchiveError(true);
        }
        setArchiveLoading(false);
      } else {
        setArchiveLoading(true);
      }

      fetchArchiveMovieDetails(currentRoom.video_id).then((details) => {
        if (cancelled) return;
        if (details.title) setResolvedTitle(details.title);
        if (!currentRoom.video_url) {
          setArchiveLoading(false);
          if (isValidArchiveDownloadUrl(details.mp4Url)) {
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
  }, [
    isArchive,
    currentRoom.video_id,
    currentRoom.video_url,
    video.youtubeId,
    video.needsTitleLookup,
  ]);

  // Apply remote state from Supabase to whichever player is active
  const applyRemoteStateToPlayer = useCallback(
    (isPlaying: boolean, targetSeconds: number) => {
      if (latestRoomRef.current.source === 'archive') {
        const videoEl = htmlVideoRef.current;
        if (!videoEl) return;

        isApplyingRemoteRef.current = true;
        if (remoteResetTimerRef.current) {
          window.clearTimeout(remoteResetTimerRef.current);
        }

        if (Math.abs(videoEl.currentTime - targetSeconds) > 2) {
          videoEl.currentTime = targetSeconds;
        }

        if (isPlaying && videoEl.paused) {
          void videoEl.play().catch(() => {
            // Browser autoplay policies may pause unmuted playback until user taps Play/Sync
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

      remoteResetTimerRef.current = window.setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 1200);
    },
    []
  );

  // Push local play/pause/seek state to Supabase (respects "Host only" controls)
  const pushLocalState = useCallback(
    async (
      isPlaying: boolean,
      positionSeconds: number,
      action: 'play' | 'pause' | 'seek',
      skipActivityBroadcast = false
    ) => {
      if (!latestCanControlRef.current) {
        const target = latestRoomStateRef.current;
        applyRemoteStateToPlayer(target.isPlaying, target.positionSeconds);
        showToast('Host controls playback');
        return;
      }

      const updatedAt = new Date().toISOString();
      const sentMs = Date.parse(updatedAt);
      recentSentTimestampsRef.current.add(sentMs);
      window.setTimeout(() => {
        recentSentTimestampsRef.current.delete(sentMs);
      }, 10000);

      const safePos = Math.max(0, Math.floor(positionSeconds));
      setRoomState({ isPlaying, positionSeconds: safePos });
      setRoomTimeSeconds(safePos);

      if (!skipActivityBroadcast) {
        broadcastActivity(action, safePos);
      }

      await updateRoomPlayback({
        roomId: latestRoomRef.current.id,
        isPlaying,
        positionSeconds: safePos,
        updatedAt,
      });
    },
    [applyRemoteStateToPlayer, broadcastActivity, showToast]
  );

  // Play a specific queued or picked movie across the whole room
  const switchRoomMovie = useCallback(
    async (movie: PickerMovieSelection, nextQueue?: QueueItem[]): Promise<string | null> => {
      if (!latestCanControlRef.current) {
        return 'Host controls playback in this room.';
      }

      const updatedAt = new Date().toISOString();
      const sentMs = Date.parse(updatedAt);
      recentSentTimestampsRef.current.add(sentMs);
      window.setTimeout(() => {
        recentSentTimestampsRef.current.delete(sentMs);
      }, 10000);

      const shouldAutoPlay = Boolean(nextQueue);
      const { error } = await updateRoomVideo({
        roomId: latestRoomRef.current.id,
        videoId: movie.videoId,
        source: movie.source,
        videoUrl: movie.source === 'archive' ? movie.videoUrl ?? null : null,
        isPlaying: shouldAutoPlay,
        positionSeconds: 0,
        queue: nextQueue,
        updatedAt,
      });

      if (error) {
        return error;
      }

      setCurrentRoom((prev) => ({
        ...prev,
        video_id: movie.videoId,
        source: movie.source,
        video_url: movie.source === 'archive' ? movie.videoUrl ?? null : null,
        is_playing: shouldAutoPlay,
        position_seconds: 0,
        queue: nextQueue ?? prev.queue,
        updated_at: updatedAt,
      }));
      setRoomState({ isPlaying: shouldAutoPlay, positionSeconds: 0 });
      setRoomTimeSeconds(0);
      broadcastActivity('video', 0);
      return null;
    },
    [broadcastActivity]
  );

  // Advance to the next movie in the Up Next queue when the current video ends
  const advanceQueueOnEnd = useCallback(async () => {
    const active = latestRoomRef.current;
    const currentQueue = normalizeQueueItems(active.queue);
    if (currentQueue.length === 0) return;

    const endedVideoId = active.video_id;
    const [nextItem, ...rest] = currentQueue;

    const runAdvance = async () => {
      // Skip if another client already switched away from the ended video
      if (latestRoomRef.current.video_id !== endedVideoId) return;

      let resolvedUrl = nextItem.videoUrl ?? null;
      if (nextItem.source === 'archive' && !resolvedUrl) {
        const details = await fetchArchiveMovieDetails(nextItem.videoId);
        if (!details.mp4Url || !isValidArchiveDownloadUrl(details.mp4Url)) {
          // Drop unplayable archive entry and keep moving
          await updateRoomQueue({ roomId: active.id, queue: rest });
          return;
        }
        resolvedUrl = details.mp4Url;
      }

      await switchRoomMovie(
        {
          videoId: nextItem.videoId,
          title: nextItem.title,
          thumbnail: nextItem.thumbnail,
          source: nextItem.source,
          videoUrl: resolvedUrl,
        },
        rest
      );
    };

    if (latestIsHostRef.current) {
      await runAdvance();
    } else if (latestCanControlRef.current) {
      // Wait briefly so the host leads auto-advance if present, avoiding duplicate skips
      if (autoAdvanceTimerRef.current) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        void runAdvance();
      }, 1800);
    }
  }, [switchRoomMovie]);

  // Run the synchronized 3 -> 2 -> 1 countdown overlay then begin playback together
  const runSyncedCountdown = useCallback(
    (targetSeconds: number, initiatedByHost: boolean) => {
      for (const timerId of countdownTimersRef.current) {
        window.clearTimeout(timerId);
      }
      countdownTimersRef.current = [];

      // Pause and seek everyone to the exact starting timestamp before 3-2-1
      applyRemoteStateToPlayer(false, targetSeconds);
      setCountdownValue(3);

      const t1 = window.setTimeout(() => setCountdownValue(2), 1000);
      const t2 = window.setTimeout(() => setCountdownValue(1), 2000);
      const t3 = window.setTimeout(() => {
        setCountdownValue(null);
        applyRemoteStateToPlayer(true, targetSeconds);
        if (initiatedByHost) {
          void pushLocalState(true, targetSeconds, 'play', true);
        }
      }, 3000);

      countdownTimersRef.current = [t1, t2, t3];
    },
    [applyRemoteStateToPlayer, pushLocalState]
  );

  // 1. Initialize YouTube IFrame Player API when source is YouTube
  useEffect(() => {
    if (isArchive) return;

    let cancelled = false;
    setPlayerReady(false);
    setEmbedBlocked(false);

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
            setRoomTimeSeconds(initial.positionSeconds);
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
              void pushLocalState(true, currentTime, 'play');
            } else if (event.data === YT.PlayerState.PAUSED) {
              lastTimeCheckRef.current = {
                time: currentTime,
                wallMs: Date.now(),
                wasPlaying: false,
              };
              void pushLocalState(false, currentTime, 'pause');
            } else if (event.data === YT.PlayerState.ENDED) {
              void advanceQueueOnEnd();
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
  }, [
    isArchive,
    currentRoom.id,
    video.youtubeId,
    applyRemoteStateToPlayer,
    pushLocalState,
    advanceQueueOnEnd,
  ]);

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
        void pushLocalState(isPlaying, actualTime, 'seek');
      } else {
        lastTimeCheckRef.current = {
          time: actualTime,
          wallMs: now,
          wasPlaying: isPlaying,
        };
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [isArchive, playerReady, embedBlocked, currentRoom.id, pushLocalState]);

  // 3. Keep "Room time" updated every second from the real player time
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!playerReady) return;
      const liveTime = getCurrentPlayerTime();
      setRoomTimeSeconds(Math.max(0, Math.floor(liveTime)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [playerReady, getCurrentPlayerTime]);

  // 4. Subscribe to Supabase Realtime row updates, Presence, and Broadcast events
  useEffect(() => {
    setSyncStatus('connecting');
    hasInitialPresenceSyncRef.current = false;
    knownPresenceNamesRef.current.clear();

    const channel = supabase.channel(`room:${currentRoom.id}`, {
      config: {
        presence: { key: clientIdRef.current },
      },
    });
    roomChannelRef.current = channel;

    const syncPresenceList = () => {
      const state = channel.presenceState() as Record<
        string,
        Array<{ name?: string; isHost?: boolean; joinedAt?: string }>
      >;
      const list: RoomParticipant[] = Object.entries(state).map(([key, entries]) => {
        const latest = entries[entries.length - 1] ?? {};
        const name = latest.name?.trim() || 'Guest';
        knownPresenceNamesRef.current.set(key, name);
        return {
          clientId: key,
          name,
          isHost: Boolean(latest.isHost),
          isSelf: key === clientIdRef.current,
          joinedAt: latest.joinedAt ?? '',
        };
      });

      if (list.length === 0) {
        list.push({
          clientId: clientIdRef.current,
          name: latestDisplayNameRef.current.trim() || 'Guest',
          isHost: latestIsHostRef.current,
          isSelf: true,
          joinedAt: '',
        });
      }

      setParticipants(list);
      hasInitialPresenceSyncRef.current = true;
    };

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${currentRoom.id}`,
        },
        (payload) => {
          const updated = payload.new as RoomRecord;
          const prevRoom = latestRoomRef.current;

          const videoChanged =
            updated.video_id !== prevRoom.video_id ||
            (updated.source ?? 'youtube') !== (prevRoom.source ?? 'youtube') ||
            (updated.video_url ?? null) !== (prevRoom.video_url ?? null);

          // Always sync room settings, queue, and video metadata
          setCurrentRoom(updated);

          if (videoChanged) {
            setRoomState({
              isPlaying: updated.is_playing,
              positionSeconds: updated.position_seconds,
            });
            setRoomTimeSeconds(updated.position_seconds);
            return;
          }

          // Ignore the echo of playback updates triggered by our own player
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
          setRoomTimeSeconds(updated.position_seconds);
          applyRemoteStateToPlayer(updated.is_playing, updated.position_seconds);
        }
      )
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const data = payload as { id?: string; emoji?: string } | null;
        if (data?.id && data?.emoji) {
          spawnFloatingReaction(data.id, data.emoji);
        }
      })
      .on('broadcast', { event: 'activity' }, ({ payload }) => {
        const data = payload as {
          clientId?: string;
          actor?: string;
          action?: ActivityAction;
          positionSeconds?: number;
        } | null;
        if (!data || data.clientId === clientIdRef.current) return;

        const actor = data.actor?.trim() || 'Someone';
        if (data.action === 'pause') {
          showToast(`${actor} paused`);
        } else if (data.action === 'play') {
          showToast(`${actor} played`);
        } else if (data.action === 'seek') {
          showToast(`${actor} jumped to ${formatSeconds(data.positionSeconds ?? 0)}`);
        } else if (data.action === 'video') {
          showToast(`${actor} changed the movie`);
        }
      })
      .on('broadcast', { event: 'countdown' }, ({ payload }) => {
        const data = payload as {
          clientId?: string;
          positionSeconds?: number;
        } | null;
        if (!data || data.clientId === clientIdRef.current) return;
        runSyncedCountdown(Math.max(0, data.positionSeconds ?? 0), false);
      })
      .on('presence', { event: 'sync' }, () => {
        syncPresenceList();
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (!hasInitialPresenceSyncRef.current || key === clientIdRef.current) {
          return;
        }
        // Cancel any pending leave toast if this key just refreshed metadata (e.g. set name)
        const pendingLeave = pendingLeaveTimersRef.current.get(key);
        if (pendingLeave) {
          window.clearTimeout(pendingLeave);
          pendingLeaveTimersRef.current.delete(key);
          syncPresenceList();
          return;
        }

        const wasKnown = knownPresenceNamesRef.current.has(key);
        const entry = (newPresences?.[0] ?? {}) as { name?: string };
        const name = entry.name?.trim() || 'Guest';
        knownPresenceNamesRef.current.set(key, name);

        if (!wasKnown && name !== 'Guest') {
          showToast(`${name} joined`);
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (!hasInitialPresenceSyncRef.current || key === clientIdRef.current) {
          return;
        }
        const entry = (leftPresences?.[0] ?? {}) as { name?: string };
        const leftName =
          entry.name?.trim() || knownPresenceNamesRef.current.get(key) || 'Guest';

        const timerId = window.setTimeout(() => {
          pendingLeaveTimersRef.current.delete(key);
          const currentState = channel.presenceState();
          if (currentState[key]) return;
          knownPresenceNamesRef.current.delete(key);
          if (leftName !== 'Guest') {
            showToast(`${leftName} left`);
          }
          syncPresenceList();
        }, 450);

        pendingLeaveTimersRef.current.set(key, timerId);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setSyncStatus('synced');
          await channel.track({
            name: latestDisplayNameRef.current.trim() || 'Guest',
            isHost: latestIsHostRef.current,
            joinedAt: new Date().toISOString(),
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setSyncStatus('reconnecting');
        }
      });

    return () => {
      roomChannelRef.current = null;
      for (const timerId of countdownTimersRef.current) {
        window.clearTimeout(timerId);
      }
      for (const timerId of pendingLeaveTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      pendingLeaveTimersRef.current.clear();
      if (autoAdvanceTimerRef.current) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [currentRoom.id, applyRemoteStateToPlayer, runSyncedCountdown, showToast]);

  // Update Realtime presence whenever the viewer updates their display name
  useEffect(() => {
    const channel = roomChannelRef.current;
    if (!channel || syncStatus !== 'synced') return;

    void channel.track({
      name: displayName.trim() || 'Guest',
      isHost,
      joinedAt: new Date().toISOString(),
    });
  }, [displayName, isHost, syncStatus]);

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
      roomCode: currentRoom.code,
      url: inviteLink,
    });
  };

  // Broadcast emoji reaction (limited to 1 reaction per second per viewer)
  const handleSendReaction = (emoji: string) => {
    const now = Date.now();
    if (now - lastReactionAtRef.current < REACTION_COOLDOWN_MS) {
      setReactionNote('Slow down a little');
      window.setTimeout(() => setReactionNote(null), 1500);
      return;
    }

    lastReactionAtRef.current = now;
    setReactionNote(null);

    const id = makeClientOrEventId('react');
    spawnFloatingReaction(id, emoji);

    void roomChannelRef.current?.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { id, emoji },
    });
  };

  // Manual touch-friendly play/pause control
  const handleTogglePlayPause = () => {
    if (!canControlPlayback) return;

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

  // Host-only "Start together" 3-2-1 countdown broadcast
  const handleStartTogether = () => {
    if (!isHost || !playerReady) return;
    const targetSeconds = Math.max(0, Math.floor(getCurrentPlayerTime()));

    void roomChannelRef.current?.send({
      type: 'broadcast',
      event: 'countdown',
      payload: {
        clientId: clientIdRef.current,
        positionSeconds: targetSeconds,
      },
    });

    runSyncedCountdown(targetSeconds, true);
  };

  // Re-fetch latest room state from Supabase
  const handleManualResync = async () => {
    setResyncing(true);
    const { room: latest } = await findRoomByCode(currentRoom.code);
    setResyncing(false);

    if (latest) {
      setCurrentRoom(latest);
      setRoomState({
        isPlaying: latest.is_playing,
        positionSeconds: latest.position_seconds,
      });
      setRoomTimeSeconds(latest.position_seconds);
      applyRemoteStateToPlayer(latest.is_playing, latest.position_seconds);
    } else {
      applyRemoteStateToPlayer(roomState.isPlaying, roomState.positionSeconds);
    }
  };

  const handleSaveRoomSettings = async (next: {
    controls: RoomControlsMode;
    locked: boolean;
  }): Promise<string | null> => {
    const { error } = await updateRoomSettings({
      roomId: currentRoom.id,
      controls: next.controls,
      locked: next.locked,
    });
    if (!error) {
      setCurrentRoom((prev) => ({
        ...prev,
        controls: next.controls,
        locked: next.locked,
      }));
    }
    return error;
  };

  const handleAddToQueue = async (movie: PickerMovieSelection): Promise<string | null> => {
    const currentQueue = normalizeQueueItems(latestRoomRef.current.queue);
    if (currentQueue.length >= QUEUE_MAX_ITEMS) {
      return `Queue is full (max ${QUEUE_MAX_ITEMS} movies).`;
    }

    const entry: QueueItem = {
      id: makeClientOrEventId('q'),
      videoId: movie.videoId,
      title: movie.title,
      thumbnail: movie.thumbnail,
      source: movie.source,
      videoUrl: movie.source === 'archive' ? movie.videoUrl ?? null : null,
      addedBy: displayName.trim() || undefined,
    };

    const nextQueue = [...currentQueue, entry];
    const { error } = await updateRoomQueue({
      roomId: currentRoom.id,
      queue: nextQueue,
    });
    if (!error) {
      setCurrentRoom((prev) => ({ ...prev, queue: nextQueue }));
    }
    return error;
  };

  const handlePlayQueuedItem = async (item: QueueItem) => {
    if (!canControlPlayback || queueBusyId) return;
    setQueueBusyId(item.id);

    let resolvedUrl = item.videoUrl ?? null;
    if (item.source === 'archive' && !resolvedUrl) {
      const details = await fetchArchiveMovieDetails(item.videoId);
      if (!details.mp4Url || !isValidArchiveDownloadUrl(details.mp4Url)) {
        setQueueBusyId(null);
        showToast("Couldn't load that Archive movie");
        return;
      }
      resolvedUrl = details.mp4Url;
    }

    const remaining = queue.filter((q) => q.id !== item.id);
    const err = await switchRoomMovie(
      {
        videoId: item.videoId,
        title: item.title,
        thumbnail: item.thumbnail,
        source: item.source,
        videoUrl: resolvedUrl,
      },
      remaining
    );
    setQueueBusyId(null);
    if (err) {
      showToast(err);
    }
  };

  const handleRemoveQueuedItem = async (itemId: string) => {
    if (!isHost || queueBusyId) return;
    setQueueBusyId(itemId);
    const nextQueue = queue.filter((q) => q.id !== itemId);
    const { error } = await updateRoomQueue({
      roomId: currentRoom.id,
      queue: nextQueue,
    });
    setQueueBusyId(null);
    if (error) {
      showToast(error);
    } else {
      setCurrentRoom((prev) => ({ ...prev, queue: nextQueue }));
    }
  };

  const peopleCount = Math.max(1, participants.length);

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

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold tracking-wider text-[#E50914]">
            {currentRoom.code}
          </span>

          {isHost && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#14141a] px-3 py-2 text-sm font-medium text-white transition-colors hover:border-[#E50914] active:bg-[#252530] cursor-pointer"
            >
              <Settings className="h-4 w-4 text-[#E50914]" aria-hidden="true" />
              <span>Room Settings</span>
            </button>
          )}

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
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {currentRoom.name}
            </h1>
            {isHost && (
              <span className="inline-flex items-center gap-1 rounded-md border border-[#E50914]/50 bg-[#1b1013] px-2.5 py-0.5 text-xs font-semibold text-[#E50914]">
                <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Host</span>
              </span>
            )}
            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-[#2a2a33] bg-[#14141a] px-2.5 py-0.5 text-xs font-medium text-zinc-200">
                <Lock className="h-3 w-3 text-[#E50914]" aria-hidden="true" />
                <span>Locked</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Now playing: <span className="text-zinc-200">{displayVideoTitle}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>{isArchive ? 'Internet Archive' : video.meta}</span>
          </p>
        </div>

        {/* Live Realtime sync & room presence indicator */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-zinc-300 pt-1">
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
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8 flex flex-col">
          {/* Responsive 16:9 Player + floating reactions, toasts, and 3-2-1 countdown overlay */}
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
                    onClick={canControlPlayback ? () => setPickerOpen(true) : onBack}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
                  >
                    <span>{canControlPlayback ? 'Pick another movie' : 'Back to MovieNest'}</span>
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
                    setRoomTimeSeconds(initial.positionSeconds);
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
                      void pushLocalState(true, e.currentTarget.currentTime, 'play');
                    }
                  }}
                  onPause={(e) => {
                    if (!isApplyingRemoteRef.current && !e.currentTarget.ended) {
                      void pushLocalState(false, e.currentTarget.currentTime, 'pause');
                    }
                  }}
                  onSeeked={(e) => {
                    if (!isApplyingRemoteRef.current) {
                      void pushLocalState(
                        !e.currentTarget.paused,
                        e.currentTarget.currentTime,
                        'seek'
                      );
                    }
                  }}
                  onEnded={() => void advanceQueueOnEnd()}
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
                    open it directly on YouTube or switch to another movie.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <a
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710]"
                  >
                    <span>Open on YouTube</span>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                  {canControlPlayback && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#2a2a33] bg-[#181820] px-4 py-2.5 text-sm font-medium text-white hover:border-white/30 cursor-pointer"
                    >
                      <span>Change video</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div ref={playerMountRef} className="relative aspect-video w-full bg-black" />
            )}

            {/* Activity & presence toast notices */}
            {toasts.length > 0 && (
              <div
                aria-live="polite"
                className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-1.5"
              >
                {toasts.map((toast) => (
                  <div
                    key={toast.id}
                    className="rounded-lg border border-white/15 bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow"
                  >
                    {toast.text}
                  </div>
                ))}
              </div>
            )}

            {/* 3, 2, 1 synchronized countdown overlay */}
            {countdownValue !== null && (
              <div
                aria-live="assertive"
                className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
                  Starting together in
                </p>
                <span className="mt-1 font-display text-7xl sm:text-8xl font-extrabold text-[#E50914] tabular-nums">
                  {countdownValue}
                </span>
              </div>
            )}

            {/* Floating emoji reactions overlay */}
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

          {/* Synced playback controls + live Room time + reaction buttons */}
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#2a2a33] bg-[#14141a] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {!(embedBlocked || archiveError) && (
                  <>
                    <button
                      type="button"
                      onClick={handleTogglePlayPause}
                      disabled={!playerReady || !canControlPlayback}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-[#E50914] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
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

                    {isHost && (
                      <button
                        type="button"
                        onClick={handleStartTogether}
                        disabled={!playerReady || countdownValue !== null}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#E50914]/50 bg-[#1b1013] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-[#E50914] active:bg-[#2a151a] disabled:opacity-45 cursor-pointer"
                      >
                        <Timer className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
                        <span>Start together</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleManualResync}
                      disabled={!playerReady || resyncing}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#1b1b24] px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30 active:bg-[#282834] disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${resyncing ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{resyncing ? 'Syncing...' : 'Sync Player'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={!canControlPlayback}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#1b1b24] px-3.5 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30 active:bg-[#282834] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Video className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
                  <span>Change video</span>
                </button>

                <span className="font-mono text-xs text-zinc-300 tabular-nums px-1">
                  Room time · {formatSeconds(roomTimeSeconds)}
                </span>
              </div>

              {!canControlPlayback && (
                <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                  <Lock className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
                  <span>Host controls playback</span>
                </p>
              )}
            </div>

            {/* Room reactions bar (1 reaction per second per viewer) */}
            <div className="flex flex-col items-start gap-1 sm:items-end shrink-0">
              <div
                role="group"
                aria-label="Send a reaction to the room"
                className="flex flex-wrap items-center gap-1.5"
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSendReaction(emoji)}
                    aria-label={`React with ${emoji}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#2a2a33] bg-[#1b1b24] text-lg transition-colors hover:border-[#E50914] active:bg-[#2a2a38] cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {reactionNote && (
                <p className="text-[11px] text-zinc-400" role="status">
                  {reactionNote}
                </p>
              )}
            </div>
          </div>

          {/* Desktop/Laptop Up Next queue under the player */}
          <div className="mt-5 hidden lg:block">
            <RoomQueuePanel
              queue={queue}
              isHost={isHost}
              canControlPlayback={canControlPlayback}
              busyItemId={queueBusyId}
              onOpenPicker={() => setPickerOpen(true)}
              onPlayQueuedItem={handlePlayQueuedItem}
              onRemoveItem={handleRemoveQueuedItem}
            />
          </div>
        </div>

        {/* Right column: Desktop shows Who's Here + Room Chat; Phones show Chat / People / Queue tabs */}
        <div className="lg:col-span-4 space-y-4">
          {/* Phone/tablet segmented tabs so the screen stays compact */}
          <div className="lg:hidden">
            <div
              role="tablist"
              aria-label="Room panels"
              className="mb-3 grid grid-cols-3 gap-1.5 rounded-xl border border-[#2a2a33] bg-[#14141a] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'chat'}
                onClick={() => setMobileTab('chat')}
                className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'chat'
                    ? 'bg-[#E50914] text-white'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Chat</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'people'}
                onClick={() => setMobileTab('people')}
                className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'people'
                    ? 'bg-[#E50914] text-white'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>People ({peopleCount})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === 'queue'}
                onClick={() => setMobileTab('queue')}
                className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  mobileTab === 'queue'
                    ? 'bg-[#E50914] text-white'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <ListVideo className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Queue ({queue.length})</span>
              </button>
            </div>

            {mobileTab === 'chat' && (
              <RoomChat
                roomCode={currentRoom.code}
                displayName={displayName}
                onDisplayNameChange={setDisplayName}
                inMobileTab
              />
            )}
            {mobileTab === 'people' && <RoomPeopleList participants={participants} />}
            {mobileTab === 'queue' && (
              <RoomQueuePanel
                queue={queue}
                isHost={isHost}
                canControlPlayback={canControlPlayback}
                busyItemId={queueBusyId}
                onOpenPicker={() => setPickerOpen(true)}
                onPlayQueuedItem={handlePlayQueuedItem}
                onRemoveItem={handleRemoveQueuedItem}
                inMobileTab
              />
            )}
          </div>

          {/* Desktop/Laptop side column: Who's Here + Room Chat */}
          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            <RoomPeopleList participants={participants} compact />
            <RoomChat
              roomCode={currentRoom.code}
              displayName={displayName}
              onDisplayNameChange={setDisplayName}
            />
          </div>
        </div>
      </div>

      <RoomSettingsModal
        open={settingsOpen && isHost}
        controls={controlsMode}
        locked={isLocked}
        onClose={() => setSettingsOpen(false)}
        onSaveSettings={handleSaveRoomSettings}
      />

      <RoomVideoPickerModal
        open={pickerOpen && canControlPlayback}
        canChangeVideo={canControlPlayback}
        queue={queue}
        sharedLibrary={sharedLibrary}
        onClose={() => setPickerOpen(false)}
        onPlayNow={(movie) => switchRoomMovie(movie)}
        onAddToQueue={handleAddToQueue}
      />
    </section>
  );
}
