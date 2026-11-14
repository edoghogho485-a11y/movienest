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
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import { useRoomChannels } from '../hooks/useRoomChannels';
import {
  fetchArchiveMovieDetails,
  getArchiveThumbnail,
  isValidArchiveDownloadUrl,
} from '../lib/archive';
import { upsertWatchHistory } from '../lib/localLists';
import { copyTextToClipboard, ShareTarget } from '../lib/share';
import {
  findRoomByCode,
  getInviteLink,
  isRoomHost,
  normalizeQueueItems,
  normalizeRoomRecord,
  QUEUE_MAX_ITEMS,
  QueueItem,
  RoomControlsMode,
  RoomRecord,
  SharedLibraryItem,
  updateRoomPlayback,
  updateRoomQueue,
  updateRoomSettings,
  updateRoomVideo,
} from '../lib/supabase';
import {
  fetchYouTubeTitle,
  getYouTubeThumbnail,
  loadYouTubeIframeAPI,
  YTPlayer,
} from '../lib/youtube';
import { BookmarkButton } from './BookmarkButton';
import { RoomChat } from './RoomChat';
import { RoomPeopleList } from './RoomPeopleList';
import { RoomQueuePanel } from './RoomQueuePanel';
import { RoomSettingsModal } from './RoomSettingsModal';
import {
  PickerMovieSelection,
  RoomVideoPickerModal,
} from './RoomVideoPickerModal';

const REACTION_EMOJIS = ['❤️', '😂', '😭', '😡', '😮', '🔥'] as const;
const REACTION_COOLDOWN_MS = 1000;
const EMPTY_LIBRARY: SharedLibraryItem[] = [];

interface FloatingReaction {
  id: string;
  emoji: string;
  sender?: string;
  leftPercent: number;
}

interface RoomToast {
  id: string;
  text: string;
}

function resolveRoomVideo(videoId: string, sharedLibrary: SharedLibraryItem[]) {
  const safeId = typeof videoId === 'string' ? videoId : '';
  const safeLibrary = Array.isArray(sharedLibrary) ? sharedLibrary : EMPTY_LIBRARY;

  const fromShared = safeLibrary.find((v) => v.video_id === safeId);
  if (fromShared) {
    return {
      title: fromShared.title,
      meta: fromShared.category,
      youtubeId: fromShared.video_id,
      needsTitleLookup: false,
    };
  }

  const fromLibrary = LIBRARY_VIDEOS.find(
    (v) => v.id === safeId || v.youtubeId === safeId
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
    (v) => v.id === safeId || v.youtubeId === safeId
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
    title: safeId ? `Movie (${safeId})` : 'Movie Room',
    meta: 'Shared room playback',
    youtubeId: safeId,
    needsTitleLookup: Boolean(safeId),
  };
}

function formatSeconds(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
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
  username: string;
  sharedLibrary: SharedLibraryItem[];
  onBack: () => void;
  onShare: (target: ShareTarget) => void;
  onRequestUsername: () => void;
}

function buildSafeRoomFallback(rawRoom: RoomRecord): RoomRecord {
  return (
    normalizeRoomRecord(rawRoom) ?? {
      id: rawRoom?.id ?? '',
      code: rawRoom?.code ?? '',
      name: rawRoom?.name || 'Movie Room',
      video_id: rawRoom?.video_id ?? '',
      source: rawRoom?.source === 'archive' ? 'archive' : 'youtube',
      video_url: rawRoom?.video_url ?? null,
      is_playing: Boolean(rawRoom?.is_playing),
      position_seconds:
        typeof rawRoom?.position_seconds === 'number' && Number.isFinite(rawRoom.position_seconds)
          ? Math.max(0, Math.floor(rawRoom.position_seconds))
          : 0,
      host_id: rawRoom?.host_id ?? null,
      controls: rawRoom?.controls === 'host' ? 'host' : 'everyone',
      locked: Boolean(rawRoom?.locked),
      queue: normalizeQueueItems(rawRoom?.queue),
      updated_at: rawRoom?.updated_at || new Date().toISOString(),
      created_at: rawRoom?.created_at || new Date().toISOString(),
    }
  );
}

export function RoomPage({
  room,
  username,
  sharedLibrary,
  onBack,
  onShare,
  onRequestUsername,
}: RoomPageProps) {
  const safeLibrary = Array.isArray(sharedLibrary) ? sharedLibrary : EMPTY_LIBRARY;
  const safeUsername = typeof username === 'string' ? username : '';

  const [currentRoom, setCurrentRoom] = useState<RoomRecord>(() => buildSafeRoomFallback(room));
  useEffect(() => {
    setCurrentRoom(buildSafeRoomFallback(room));
  }, [room]);

  const isArchive = (currentRoom.source ?? 'youtube') === 'archive';
  const isHost = isRoomHost(currentRoom);
  const controlsMode: RoomControlsMode =
    currentRoom.controls === 'host' ? 'host' : 'everyone';
  const isLocked = Boolean(currentRoom.locked);
  const canControlPlayback = controlsMode === 'everyone' || isHost;
  const queue = normalizeQueueItems(currentRoom.queue);

  const [copied, setCopied] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [roomState, setRoomState] = useState<{
    isPlaying: boolean;
    positionSeconds: number;
  }>({
    isPlaying: Boolean(currentRoom.is_playing),
    positionSeconds: currentRoom.position_seconds ?? 0,
  });

  // Live "Room time" ticked every second from the active player
  const [roomTimeSeconds, setRoomTimeSeconds] = useState<number>(
    currentRoom.position_seconds ?? 0
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
  const lastReactionAtRef = useRef<number>(0);

  // Latest state refs so async callbacks avoid stale closures
  const latestRoomRef = useRef(currentRoom);
  latestRoomRef.current = currentRoom;
  const latestRoomStateRef = useRef(roomState);
  latestRoomStateRef.current = roomState;
  const latestCanControlRef = useRef(canControlPlayback);
  latestCanControlRef.current = canControlPlayback;
  const latestIsHostRef = useRef(isHost);
  latestIsHostRef.current = isHost;

  // Loop-prevention and timer refs
  const isApplyingRemoteRef = useRef(false);
  const remoteResetTimerRef = useRef<number | null>(null);
  const recentSentTimestampsRef = useRef<Set<number>>(new Set());
  const countdownTimersRef = useRef<number[]>([]);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const applyRemoteStateRef = useRef<(isPlaying: boolean, targetSeconds: number) => void>(() => {});
  const runSyncedCountdownRef = useRef<(targetSeconds: number, initiatedByHost: boolean) => void>(
    () => {}
  );

  // Track last observed playback position to detect timeline seeks (YouTube)
  const lastTimeCheckRef = useRef<{ time: number; wallMs: number; wasPlaying: boolean }>({
    time: currentRoom.position_seconds ?? 0,
    wallMs: Date.now(),
    wasPlaying: Boolean(currentRoom.is_playing),
  });

  const video = resolveRoomVideo(currentRoom.video_id, safeLibrary);
  const displayVideoTitle = resolvedTitle ?? video.title;
  const inviteLink = getInviteLink(currentRoom.code);
  const currentThumbnail = isArchive
    ? getArchiveThumbnail(currentRoom.video_id)
    : getYouTubeThumbnail(video.youtubeId || currentRoom.video_id);

  // Store only movie metadata & timestamps for local Continue Watching (never room code, chat, or username)
  const latestLocalHistoryMetaRef = useRef({
    source: (isArchive ? 'archive' : 'youtube') as 'youtube' | 'archive',
    id: isArchive ? currentRoom.video_id : video.youtubeId || currentRoom.video_id,
    videoUrl: isArchive ? archiveUrl ?? currentRoom.video_url ?? null : null,
    title: displayVideoTitle,
    thumbnail: currentThumbnail,
  });
  latestLocalHistoryMetaRef.current = {
    source: isArchive ? 'archive' : 'youtube',
    id: isArchive ? currentRoom.video_id : video.youtubeId || currentRoom.video_id,
    videoUrl: isArchive ? archiveUrl ?? currentRoom.video_url ?? null : null,
    title: displayVideoTitle,
    thumbnail: currentThumbnail,
  };
  const lastHistoryMetricsRef = useRef<{ position: number; duration: number }>({
    position: 0,
    duration: 0,
  });

  const readRoomHistoryMetrics = useCallback((): {
    position: number;
    duration: number;
    isPlaying: boolean;
  } => {
    try {
      if (latestLocalHistoryMetaRef.current.source === 'archive') {
        const el = htmlVideoRef.current;
        if (el) {
          const pos = Number.isFinite(el.currentTime) ? el.currentTime : 0;
          const dur = Number.isFinite(el.duration) ? el.duration : 0;
          if (pos > 0 || dur > 0) {
            lastHistoryMetricsRef.current = { position: pos, duration: dur };
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
            lastHistoryMetricsRef.current = { position: safePos, duration: safeDur };
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
      position: lastHistoryMetricsRef.current.position,
      duration: lastHistoryMetricsRef.current.duration,
      isPlaying: false,
    };
  }, []);

  const saveRoomHistoryProgress = useCallback(
    (markFinished = false) => {
      const meta = latestLocalHistoryMetaRef.current;
      if (!meta.id) return;
      const metrics = readRoomHistoryMetrics();
      const position = metrics.position > 0 ? metrics.position : lastHistoryMetricsRef.current.position;
      const duration = metrics.duration > 0 ? metrics.duration : lastHistoryMetricsRef.current.duration;
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
    [readRoomHistoryMetrics]
  );

  const showToast = useCallback((text: string) => {
    const id = makeClientOrEventId('toast');
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const getCurrentPlayerTime = useCallback((): number => {
    try {
      if ((latestRoomRef.current.source ?? 'youtube') === 'archive') {
        return htmlVideoRef.current?.currentTime ?? latestRoomStateRef.current.positionSeconds;
      }
      const player = playerRef.current;
      if (player && typeof player.getCurrentTime === 'function') {
        const t = player.getCurrentTime();
        if (typeof t === 'number' && Number.isFinite(t)) return t;
      }
      return latestRoomStateRef.current.positionSeconds;
    } catch {
      return latestRoomStateRef.current.positionSeconds;
    }
  }, []);

  // Spawn an emoji (with sender's username) that floats up over the video
  const spawnFloatingReaction = useCallback((id: string, emoji: string, sender?: string) => {
    const leftPercent = 14 + Math.floor(Math.random() * 72);
    setFloatingReactions((prev) => {
      if (prev.some((item) => item.id === id)) return prev;
      return [...prev.slice(-18), { id, emoji, sender, leftPercent }];
    });

    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
    }, 2300);
  }, []);

  // Single shared hook managing "room-db:CODE" and "room-live:CODE" channels for this room
  const {
    syncStatus,
    participants,
    messages: chatMessages,
    chatLoading,
    chatError,
    sendChatMessage,
    sendReaction,
    sendActivity: broadcastActivity,
    sendCountdown,
  } = useRoomChannels({
    roomId: currentRoom.id,
    roomCode: currentRoom.code,
    username: safeUsername,
    isHost,
    onRoomUpdated: (updated) => {
      const prevRoom = latestRoomRef.current;
      const videoChanged =
        updated.video_id !== prevRoom.video_id ||
        (updated.source ?? 'youtube') !== (prevRoom.source ?? 'youtube') ||
        (updated.video_url ?? null) !== (prevRoom.video_url ?? null);

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
      if (!Number.isNaN(incomingMs)) {
        for (const sentMs of recentSentTimestampsRef.current) {
          if (Math.abs(incomingMs - sentMs) < 250) {
            return;
          }
        }
      }

      setRoomState({
        isPlaying: updated.is_playing,
        positionSeconds: updated.position_seconds,
      });
      setRoomTimeSeconds(updated.position_seconds);
      applyRemoteStateRef.current(updated.is_playing, updated.position_seconds);
    },
    onReactionReceived: (payload) => {
      spawnFloatingReaction(payload.id, payload.emoji, payload.sender);
    },
    onActivityReceived: ({ actor, action, positionSeconds }) => {
      if (action === 'pause') {
        showToast(`${actor} paused`);
      } else if (action === 'play') {
        showToast(`${actor} played`);
      } else if (action === 'seek') {
        showToast(`${actor} jumped to ${formatSeconds(positionSeconds)}`);
      } else if (action === 'video') {
        showToast(`${actor} changed the movie`);
      }
    },
    onCountdownReceived: (positionSeconds) => {
      runSyncedCountdownRef.current(positionSeconds, false);
    },
    onPresenceNotice: (text) => {
      showToast(text);
    },
  });

  // Clean up local countdown / auto-advance timers when leaving the room
  useEffect(() => {
    return () => {
      for (const timerId of countdownTimersRef.current) {
        window.clearTimeout(timerId);
      }
      countdownTimersRef.current = [];
      if (autoAdvanceTimerRef.current) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, [currentRoom.id]);

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
      if ((latestRoomRef.current.source ?? 'youtube') === 'archive') {
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
      if (
        !player ||
        typeof player.getCurrentTime !== 'function' ||
        typeof player.getPlayerState !== 'function'
      ) {
        return;
      }

      try {
        isApplyingRemoteRef.current = true;
        if (remoteResetTimerRef.current) {
          window.clearTimeout(remoteResetTimerRef.current);
        }

        const currentTime = player.getCurrentTime();
        const currentState = player.getPlayerState();

        if (Math.abs(currentTime - targetSeconds) > 2 && typeof player.seekTo === 'function') {
          player.seekTo(targetSeconds, true);
        }

        if (isPlaying && currentState !== 1 && typeof player.playVideo === 'function') {
          player.playVideo();
        } else if (!isPlaying && currentState === 1 && typeof player.pauseVideo === 'function') {
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
      } catch {
        isApplyingRemoteRef.current = false;
      }
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

  applyRemoteStateRef.current = applyRemoteStateToPlayer;
  runSyncedCountdownRef.current = runSyncedCountdown;

  // 1. Initialize YouTube IFrame Player API when source is YouTube
  useEffect(() => {
    if (isArchive || !video.youtubeId) return;

    let cancelled = false;
    setPlayerReady(false);
    setEmbedBlocked(false);

    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !playerMountRef.current || !YT?.Player) return;

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
            if (cancelled) return;
            if (event.data === YT.PlayerState.PAUSED) {
              saveRoomHistoryProgress(false);
            } else if (event.data === YT.PlayerState.ENDED) {
              saveRoomHistoryProgress(true);
            }

            if (isApplyingRemoteRef.current) return;
            if (typeof event?.target?.getCurrentTime !== 'function') return;

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
      saveRoomHistoryProgress(false);
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
    saveRoomHistoryProgress,
  ]);

  // 2. Detect YouTube timeline seeks
  useEffect(() => {
    if (isArchive || !playerReady || embedBlocked) return;

    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (
        !player ||
        isApplyingRemoteRef.current ||
        typeof player.getPlayerState !== 'function' ||
        typeof player.getCurrentTime !== 'function'
      ) {
        return;
      }

      try {
        const state = player.getPlayerState();
        const actualTime = player.getCurrentTime();
        if (typeof actualTime !== 'number' || !Number.isFinite(actualTime)) return;

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
      } catch {
        // Ignore transient YouTube IFrame API errors
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

  // 4. Save Continue Watching progress every 10 seconds during playback and when leaving the room
  useEffect(() => {
    lastHistoryMetricsRef.current = { position: 0, duration: 0 };

    const intervalId = window.setInterval(() => {
      const metrics = readRoomHistoryMetrics();
      if (metrics.isPlaying) {
        saveRoomHistoryProgress(false);
      }
    }, 10000);

    const handleLeave = () => {
      saveRoomHistoryProgress(false);
    };

    window.addEventListener('pagehide', handleLeave);
    window.addEventListener('beforeunload', handleLeave);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pagehide', handleLeave);
      window.removeEventListener('beforeunload', handleLeave);
      saveRoomHistoryProgress(false);
    };
  }, [currentRoom.id, currentRoom.video_id, isArchive, readRoomHistoryMetrics, saveRoomHistoryProgress]);

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

  // Broadcast emoji reaction with username (limited to 1 reaction per second per viewer)
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
    const sender = safeUsername.trim() || undefined;
    spawnFloatingReaction(id, emoji, sender);
    sendReaction({ id, emoji, sender });
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
    if (!player || typeof player.getPlayerState !== 'function') return;

    const isCurrentlyPlaying = player.getPlayerState() === 1;
    if (isCurrentlyPlaying && typeof player.pauseVideo === 'function') {
      player.pauseVideo();
    } else if (!isCurrentlyPlaying && typeof player.playVideo === 'function') {
      player.playVideo();
    }
  };

  // Host-only "Start together" 3-2-1 countdown broadcast
  const handleStartTogether = () => {
    if (!isHost || !playerReady) return;
    const targetSeconds = Math.max(0, Math.floor(getCurrentPlayerTime()));

    sendCountdown(targetSeconds);
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
      addedBy: safeUsername.trim() || undefined,
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
          onClick={() => {
            saveRoomHistoryProgress(false);
            onBack();
          }}
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

          <BookmarkButton
            source={isArchive ? 'archive' : 'youtube'}
            id={isArchive ? currentRoom.video_id : video.youtubeId || currentRoom.video_id}
            videoUrl={isArchive ? archiveUrl ?? currentRoom.video_url : null}
            title={displayVideoTitle}
            thumbnail={currentThumbnail}
            variant="button"
          />

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
                    if (!e.currentTarget.ended) {
                      saveRoomHistoryProgress(false);
                    }
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
                  onEnded={() => {
                    saveRoomHistoryProgress(true);
                    void advanceQueueOnEnd();
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
                  <div
                    key={reaction.id}
                    style={{ left: `${reaction.leftPercent}%`, bottom: '12%' }}
                    className="animate-float-reaction absolute flex flex-col items-center select-none"
                  >
                    <span className="text-3xl sm:text-4xl leading-none">
                      {reaction.emoji}
                    </span>
                    {reaction.sender && (
                      <span className="mt-0.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200">
                        {reaction.sender}
                      </span>
                    )}
                  </div>
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
                messages={chatMessages}
                loading={chatLoading}
                loadError={chatError}
                username={safeUsername}
                onSendMessage={sendChatMessage}
                onRequestUsername={onRequestUsername}
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
              messages={chatMessages}
              loading={chatLoading}
              loadError={chatError}
              username={safeUsername}
              onSendMessage={sendChatMessage}
              onRequestUsername={onRequestUsername}
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
        sharedLibrary={safeLibrary}
        onClose={() => setPickerOpen(false)}
        onPlayNow={(movie) => switchRoomMovie(movie)}
        onAddToQueue={handleAddToQueue}
      />
    </section>
  );
}
