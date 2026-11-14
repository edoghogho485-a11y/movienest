import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Film,
  ListVideo,
  Lock,
  MessageSquare,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { FEATURED_VIDEOS } from '../data/videos';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import {
  ReadyCheckEventPayload,
  useRoomChannels,
} from '../hooks/useRoomChannels';
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
import { ReadyCheckPrompt } from './ReadyCheckPrompt';
import { RoomChat } from './RoomChat';
import { RoomQueuePanel } from './RoomQueuePanel';
import { RoomReactionBar } from './RoomReactionBar';
import { RoomSeatsPanel, SeatReaction } from './RoomSeatsPanel';
import { RoomSettingsModal } from './RoomSettingsModal';
import { RoomTopBar } from './RoomTopBar';
import {
  PickerMovieSelection,
  RoomVideoPickerModal,
} from './RoomVideoPickerModal';

const REACTION_COOLDOWN_MS = 1000;
const DIM_LIGHTS_STORAGE_KEY = 'movienest_dim_lights';
const READY_CHECK_TIMEOUT_MS = 20_000;
const EMPTY_LIBRARY: SharedLibraryItem[] = [];

function readSavedDimLights(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(DIM_LIGHTS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSavedDimLights(enabled: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(DIM_LIGHTS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function detectPhoneLandscape(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth > window.innerHeight &&
    window.innerHeight <= 540 &&
    window.innerWidth <= 960
  );
}

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

interface ActiveReadyCheck {
  checkId: string;
  positionSeconds: number;
  startedAt: number;
  readyClientIds: string[];
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
  justCreated?: boolean;
  onBack: () => void;
  onShare: (target: ShareTarget) => void;
  onRequestUsername: () => void;
}

const HOST_AWAY_THRESHOLD_SECONDS = 15;

interface HostLiveState {
  positionSeconds: number;
  isPlaying: boolean;
  hostAway: boolean;
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
      controls: 'host',
      locked: Boolean(rawRoom?.locked),
      queue: normalizeQueueItems(rawRoom?.queue),
      updated_at: rawRoom?.updated_at || new Date().toISOString(),
      created_at: rawRoom?.created_at || new Date().toISOString(),
    }
  );
}

// Compute host's live timestamp from updated_at; treat host as away if heartbeat is older than 15s while playing
function getHostLiveState(roomRecord: RoomRecord): HostLiveState {
  const baseSeconds =
    typeof roomRecord.position_seconds === 'number' &&
    Number.isFinite(roomRecord.position_seconds)
      ? Math.max(0, Math.floor(roomRecord.position_seconds))
      : 0;
  const isPlaying = Boolean(roomRecord.is_playing);

  if (!isPlaying) {
    return { positionSeconds: baseSeconds, isPlaying: false, hostAway: false };
  }

  const updatedMs = Date.parse(roomRecord.updated_at);
  if (Number.isNaN(updatedMs)) {
    return { positionSeconds: baseSeconds, isPlaying: true, hostAway: false };
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - updatedMs) / 1000));
  if (elapsedSeconds > HOST_AWAY_THRESHOLD_SECONDS) {
    return { positionSeconds: baseSeconds, isPlaying: true, hostAway: true };
  }

  return {
    positionSeconds: baseSeconds + elapsedSeconds,
    isPlaying: true,
    hostAway: false,
  };
}

// Non-hosts see Join Choice before playback starts if the room is already playing or past 10 seconds
function shouldPromptLateJoiner(
  roomRecord: RoomRecord,
  isHost: boolean,
  justCreated: boolean
): boolean {
  if (isHost || justCreated) return false;
  const pos =
    typeof roomRecord.position_seconds === 'number' &&
    Number.isFinite(roomRecord.position_seconds)
      ? roomRecord.position_seconds
      : 0;
  return Boolean(roomRecord.is_playing) || pos > 10;
}

export function RoomPage({
  room,
  username,
  sharedLibrary,
  justCreated = false,
  onBack,
  onShare,
  onRequestUsername,
}: RoomPageProps) {
  const safeLibrary = Array.isArray(sharedLibrary) ? sharedLibrary : EMPTY_LIBRARY;
  const safeUsername = typeof username === 'string' ? username : '';

  const [currentRoom, setCurrentRoom] = useState<RoomRecord>(() => buildSafeRoomFallback(room));
  const isHost = isRoomHost(currentRoom);

  const [joinChoicePending, setJoinChoicePending] = useState<boolean>(() => {
    const safe = buildSafeRoomFallback(room);
    return shouldPromptLateJoiner(safe, isRoomHost(safe), justCreated);
  });
  // Non-hosts follow the host by default (ownPace = false); manual interaction switches to ownPace = true
  const [ownPace, setOwnPace] = useState<boolean>(false);
  const [joinModalState, setJoinModalState] = useState<{
    positionSeconds: number;
    hostAway: boolean;
  }>(() => {
    const live = getHostLiveState(buildSafeRoomFallback(room));
    return { positionSeconds: live.positionSeconds, hostAway: live.hostAway };
  });
  const [syncingToHost, setSyncingToHost] = useState<boolean>(false);

  const isArchive = (currentRoom.source ?? 'youtube') === 'archive';
  const isLocked = Boolean(currentRoom.locked);
  const queue = normalizeQueueItems(currentRoom.queue);

  const [copied, setCopied] = useState(false);
  const [roomState, setRoomState] = useState<{
    isPlaying: boolean;
    positionSeconds: number;
  }>(() => {
    const safeInitial = buildSafeRoomFallback(room);
    const live = getHostLiveState(safeInitial);
    return {
      isPlaying: live.isPlaying,
      positionSeconds: live.positionSeconds,
    };
  });

  // Track the local player's current play state separately so Own pace works cleanly
  const [localIsPlaying, setLocalIsPlaying] = useState<boolean>(() => {
    const safeInitial = buildSafeRoomFallback(room);
    const promptNeeded = shouldPromptLateJoiner(safeInitial, isRoomHost(safeInitial), justCreated);
    return promptNeeded ? false : Boolean(safeInitial.is_playing);
  });

  // Live host clock shown in non-host "Host is at 42:10" bar (ticks every second from server timestamp)
  const [hostDisplayState, setHostDisplayState] = useState<{
    positionSeconds: number;
    hostAway: boolean;
  }>(() => {
    const live = getHostLiveState(buildSafeRoomFallback(room));
    return { positionSeconds: live.positionSeconds, hostAway: live.hostAway };
  });

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

  // Floating reactions (both seat-anchored and video overlay for landscape/dimmed), toasts, Ready Check, countdown, Dim the Lights & overlays
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [seatReactions, setSeatReactions] = useState<SeatReaction[]>([]);
  const [reactionNote, setReactionNote] = useState<string | null>(null);
  const [toasts, setToasts] = useState<RoomToast[]>([]);
  const [readyCheck, setReadyCheck] = useState<ActiveReadyCheck | null>(null);
  const [readySecondsLeft, setReadySecondsLeft] = useState<number>(20);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);

  const [dimLights, setDimLights] = useState<boolean>(readSavedDimLights);
  const [dimOverlayTab, setDimOverlayTab] = useState<'chat' | 'seats' | null>(null);
  const [isPhoneLandscape, setIsPhoneLandscape] = useState<boolean>(detectPhoneLandscape);
  const [landscapeChatOpen, setLandscapeChatOpen] = useState<boolean>(false);
  const [mobileQueueOpen, setMobileQueueOpen] = useState<boolean>(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null);

  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastReactionAtRef = useRef<number>(0);

  // Latest state refs so async callbacks avoid stale closures
  const latestRoomRef = useRef(currentRoom);
  latestRoomRef.current = currentRoom;
  const latestServerRoomRef = useRef(currentRoom);
  const latestRoomStateRef = useRef(roomState);
  latestRoomStateRef.current = roomState;
  const latestIsHostRef = useRef(isHost);
  latestIsHostRef.current = isHost;
  const joinChoicePendingRef = useRef(joinChoicePending);
  joinChoicePendingRef.current = joinChoicePending;
  const ownPaceRef = useRef(ownPace);
  ownPaceRef.current = ownPace;

  // Target position & play state applied once when the player loads (without writing to room)
  const initialHostLive = getHostLiveState(currentRoom);
  const initialJoinTargetRef = useRef<{ isPlaying: boolean; positionSeconds: number }>({
    isPlaying: initialHostLive.isPlaying,
    positionSeconds: initialHostLive.positionSeconds,
  });

  // Programmatic change flag + loop-prevention and debounce timer refs
  const isProgrammaticChangeRef = useRef(true);
  const isApplyingRemoteRef = useRef(false);
  const remoteResetTimerRef = useRef<number | null>(null);
  const pushDebounceTimerRef = useRef<number | null>(null);
  const recentSentTimestampsRef = useRef<Set<number>>(new Set());
  const countdownTimersRef = useRef<number[]>([]);
  const readyCheckRef = useRef<ActiveReadyCheck | null>(null);
  readyCheckRef.current = readyCheck;
  const readyTriggeredCheckIdRef = useRef<string | null>(null);
  const applyRemoteStateRef = useRef<
    (isPlaying: boolean, targetSeconds: number, forceSeek?: boolean) => void
  >(() => {});
  const runSyncedCountdownRef = useRef<(targetSeconds: number, initiatedByHost: boolean) => void>(
    () => {}
  );

  // Track last observed playback position to detect timeline seeks (YouTube)
  const lastTimeCheckRef = useRef<{ time: number; wallMs: number; wasPlaying: boolean }>({
    time: currentRoom.position_seconds ?? 0,
    wallMs: Date.now(),
    wasPlaying: Boolean(currentRoom.is_playing),
  });

  // Reset room join-choice state cleanly when switching to a different room ID
  const lastRoomIdRef = useRef(currentRoom.id);
  useEffect(() => {
    if (lastRoomIdRef.current === room.id) return;
    lastRoomIdRef.current = room.id;

    const safe = buildSafeRoomFallback(room);
    const hostCheck = isRoomHost(safe);
    const shouldPrompt = shouldPromptLateJoiner(safe, hostCheck, justCreated);
    const hostLive = getHostLiveState(safe);

    setCurrentRoom(safe);
    latestServerRoomRef.current = safe;
    setJoinChoicePending(shouldPrompt);
    joinChoicePendingRef.current = shouldPrompt;
    setOwnPace(false);
    ownPaceRef.current = false;
    setJoinModalState({
      positionSeconds: hostLive.positionSeconds,
      hostAway: hostLive.hostAway,
    });
    setRoomState({ isPlaying: hostLive.isPlaying, positionSeconds: hostLive.positionSeconds });
    setHostDisplayState({
      positionSeconds: hostLive.positionSeconds,
      hostAway: hostLive.hostAway,
    });
    setLocalIsPlaying(shouldPrompt ? false : hostLive.isPlaying);
    setReadyCheck(null);
    readyTriggeredCheckIdRef.current = null;
    initialJoinTargetRef.current = {
      isPlaying: hostLive.isPlaying,
      positionSeconds: hostLive.positionSeconds,
    };
    isProgrammaticChangeRef.current = true;
    isApplyingRemoteRef.current = true;
  }, [room, justCreated]);

  // Keep the Join Choice timestamp and host-away status live while the newcomer decides
  useEffect(() => {
    if (!joinChoicePending) return;
    const refreshModal = () => {
      const hostLive = getHostLiveState(latestServerRoomRef.current);
      setJoinModalState({
        positionSeconds: hostLive.positionSeconds,
        hostAway: hostLive.hostAway,
      });
    };
    refreshModal();
    const timer = window.setInterval(refreshModal, 1000);
    return () => window.clearInterval(timer);
  }, [joinChoicePending]);

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

  const getLocalPlayerIsPlaying = useCallback((): boolean => {
    try {
      if ((latestRoomRef.current.source ?? 'youtube') === 'archive') {
        const el = htmlVideoRef.current;
        return Boolean(el && !el.paused && !el.ended);
      }
      const player = playerRef.current;
      if (player && typeof player.getPlayerState === 'function') {
        return player.getPlayerState() === 1;
      }
    } catch {
      // Ignore player read errors
    }
    return false;
  }, []);

  // Mark player changes triggered by initial load, join seek, or remote room sync
  const markProgrammaticChange = useCallback((durationMs = 2000) => {
    isProgrammaticChangeRef.current = true;
    isApplyingRemoteRef.current = true;
    if (remoteResetTimerRef.current) {
      window.clearTimeout(remoteResetTimerRef.current);
    }
    remoteResetTimerRef.current = window.setTimeout(() => {
      isProgrammaticChangeRef.current = false;
      isApplyingRemoteRef.current = false;
      remoteResetTimerRef.current = null;
    }, durationMs);
  }, []);

  const clearProgrammaticChange = useCallback(() => {
    if (remoteResetTimerRef.current) {
      window.clearTimeout(remoteResetTimerRef.current);
      remoteResetTimerRef.current = null;
    }
    isProgrammaticChangeRef.current = false;
    isApplyingRemoteRef.current = false;
  }, []);

  // Spawn an emoji on the sender's seat AND on the video overlay (used in landscape / dim lights)
  const spawnReaction = useCallback(
    (id: string, emoji: string, sender?: string, clientId?: string) => {
      const leftPercent = 14 + Math.floor(Math.random() * 72);
      setFloatingReactions((prev) => {
        if (prev.some((item) => item.id === id)) return prev;
        return [...prev.slice(-18), { id, emoji, sender, leftPercent }];
      });
      setSeatReactions((prev) => {
        if (prev.some((item) => item.id === id)) return prev;
        return [...prev.slice(-18), { id, emoji, sender, clientId }];
      });

      window.setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
      }, 2300);
      window.setTimeout(() => {
        setSeatReactions((prev) => prev.filter((item) => item.id !== id));
      }, 2100);
    },
    []
  );

  // Single shared hook managing "room-db:CODE" and "room-live:CODE" channels for this room
  const {
    myClientId,
    syncStatus,
    participants,
    messages: chatMessages,
    chatLoading,
    chatError,
    sendChatMessage,
    sendReaction,
    sendActivity: broadcastActivity,
    sendCountdown,
    sendHostSync,
    sendReadyCheck,
  } = useRoomChannels({
    roomId: currentRoom.id,
    roomCode: currentRoom.code,
    username: safeUsername,
    isHost,
    independentMode: !isHost && ownPace,
    onRoomUpdated: (updated) => {
      latestServerRoomRef.current = updated;
      const hostLive = getHostLiveState(updated);
      setHostDisplayState({
        positionSeconds: hostLive.positionSeconds,
        hostAway: hostLive.hostAway,
      });

      const prevRoom = latestRoomRef.current;
      const videoChanged =
        updated.video_id !== prevRoom.video_id ||
        (updated.source ?? 'youtube') !== (prevRoom.source ?? 'youtube') ||
        (updated.video_url ?? null) !== (prevRoom.video_url ?? null);

      // While a non-host hasn't chosen how to join yet, update metadata silently without touching playback
      if (joinChoicePendingRef.current) {
        setCurrentRoom(updated);
        setJoinModalState({
          positionSeconds: hostLive.positionSeconds,
          hostAway: hostLive.hostAway,
        });
        return;
      }

      // Host is the sole controller of playback: never let DB rows seek or pause the host's own player
      if (latestIsHostRef.current) {
        setCurrentRoom((prev) => ({
          ...prev,
          locked: updated.locked,
          queue: updated.queue,
          host_id: updated.host_id,
        }));
        return;
      }

      // When a non-host is on their own pace, ignore host playback and video changes
      if (ownPaceRef.current) {
        setCurrentRoom((prev) => ({
          ...prev,
          locked: updated.locked,
          queue: updated.queue,
          host_id: updated.host_id,
        }));
        return;
      }

      // Non-host in Following mode: apply host video/playback updates
      setCurrentRoom(updated);

      if (videoChanged) {
        initialJoinTargetRef.current = {
          isPlaying: hostLive.isPlaying,
          positionSeconds: hostLive.positionSeconds,
        };
        markProgrammaticChange(2500);
        setRoomState({
          isPlaying: hostLive.isPlaying,
          positionSeconds: hostLive.positionSeconds,
        });
        setLocalIsPlaying(hostLive.isPlaying);
        return;
      }

      setRoomState({
        isPlaying: hostLive.isPlaying,
        positionSeconds: hostLive.positionSeconds,
      });

      // Only seek/update player if play state differs OR drift exceeds 2 seconds (ignores 5s heartbeats)
      const localTime = getCurrentPlayerTime();
      const localPlaying = getLocalPlayerIsPlaying();
      const needsPlayChange = localPlaying !== hostLive.isPlaying;
      const needsSeek = Math.abs(localTime - hostLive.positionSeconds) > 2;

      if (!needsPlayChange && !needsSeek) {
        return;
      }

      setLocalIsPlaying(hostLive.isPlaying);
      applyRemoteStateRef.current(hostLive.isPlaying, hostLive.positionSeconds, false);
    },
    onReactionReceived: (payload) => {
      spawnReaction(payload.id, payload.emoji, payload.sender, payload.clientId);
    },
    onActivityReceived: ({ actor, action, positionSeconds }) => {
      if (joinChoicePendingRef.current) return;
      if (ownPaceRef.current && action !== 'video') return;
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
      if (latestIsHostRef.current || joinChoicePendingRef.current || ownPaceRef.current) return;
      setReadyCheck(null);
      runSyncedCountdownRef.current(positionSeconds, false);
    },
    onHostSyncReceived: ({ positionSeconds, isPlaying }) => {
      if (latestIsHostRef.current || joinChoicePendingRef.current) return;

      // Return every non-host back to Following mode and jump to the host's timestamp
      ownPaceRef.current = false;
      setOwnPace(false);
      setReadyCheck(null);

      const serverRoom = latestServerRoomRef.current ?? latestRoomRef.current;
      const prevRoom = latestRoomRef.current;
      const videoChanged =
        serverRoom.video_id !== prevRoom.video_id ||
        (serverRoom.source ?? 'youtube') !== (prevRoom.source ?? 'youtube') ||
        (serverRoom.video_url ?? null) !== (prevRoom.video_url ?? null);

      setRoomState({ isPlaying, positionSeconds });
      setHostDisplayState({ positionSeconds, hostAway: false });
      setLocalIsPlaying(isPlaying);

      if (videoChanged) {
        initialJoinTargetRef.current = { isPlaying, positionSeconds };
        markProgrammaticChange(2500);
        setCurrentRoom(serverRoom);
      } else {
        applyRemoteStateRef.current(isPlaying, positionSeconds, true);
      }

      showToast('Host synced everyone');
    },
    onReadyCheckReceived: (payload: ReadyCheckEventPayload) => {
      if (joinChoicePendingRef.current) return;

      if (payload.action === 'cancel') {
        setReadyCheck((prev) => (prev?.checkId === payload.checkId ? null : prev));
        return;
      }

      if (payload.action === 'start') {
        if (latestIsHostRef.current || ownPaceRef.current) return;
        const pos = payload.positionSeconds ?? 0;
        applyRemoteStateRef.current(false, pos, true);
        setLocalIsPlaying(false);
        setReadySecondsLeft(20);
        setReadyCheck({
          checkId: payload.checkId,
          positionSeconds: pos,
          startedAt: Date.now(),
          readyClientIds: [payload.clientId],
        });
        return;
      }

      if (payload.action === 'ready') {
        setReadyCheck((prev) => {
          if (!prev || prev.checkId !== payload.checkId) return prev;
          if (prev.readyClientIds.includes(payload.clientId)) return prev;
          return {
            ...prev,
            readyClientIds: [...prev.readyClientIds, payload.clientId],
          };
        });
      }
    },
    onPresenceNotice: (text) => {
      showToast(text);
    },
  });

  // Clean up local countdown, debounce, and programmatic timers when leaving the room
  useEffect(() => {
    return () => {
      for (const timerId of countdownTimersRef.current) {
        window.clearTimeout(timerId);
      }
      countdownTimersRef.current = [];
      if (pushDebounceTimerRef.current) {
        window.clearTimeout(pushDebounceTimerRef.current);
        pushDebounceTimerRef.current = null;
      }
      if (remoteResetTimerRef.current) {
        window.clearTimeout(remoteResetTimerRef.current);
        remoteResetTimerRef.current = null;
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

  // Apply host playback state to the local player (passive sync seeks only when drift > 2s)
  const applyRemoteStateToPlayer = useCallback(
    (isPlaying: boolean, targetSeconds: number, forceSeek = false) => {
      const seekThreshold = forceSeek ? 0.5 : 2;

      if ((latestRoomRef.current.source ?? 'youtube') === 'archive') {
        const videoEl = htmlVideoRef.current;
        if (!videoEl) return;

        markProgrammaticChange(1400);

        if (Math.abs(videoEl.currentTime - targetSeconds) > seekThreshold) {
          videoEl.currentTime = targetSeconds;
        }

        if (isPlaying && videoEl.paused) {
          void videoEl.play().catch(() => {
            // Browser autoplay policies may pause unmuted playback until user taps Play/Sync
          });
        } else if (!isPlaying && !videoEl.paused) {
          videoEl.pause();
        }
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
        markProgrammaticChange(1500);

        const currentTime = player.getCurrentTime();
        const currentState = player.getPlayerState();

        if (
          Math.abs(currentTime - targetSeconds) > seekThreshold &&
          typeof player.seekTo === 'function'
        ) {
          player.seekTo(targetSeconds, true);
        }

        if (isPlaying && currentState !== 1 && typeof player.playVideo === 'function') {
          player.playVideo();
        } else if (!isPlaying && typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }

        lastTimeCheckRef.current = {
          time: targetSeconds,
          wallMs: Date.now(),
          wasPlaying: isPlaying,
        };
      } catch {
        clearProgrammaticChange();
      }
    },
    [markProgrammaticChange, clearProgrammaticChange]
  );

  // Switch a non-host viewer into Own pace when they manually play, pause, or seek
  const enterOwnPace = useCallback(() => {
    if (latestIsHostRef.current || ownPaceRef.current) return;
    ownPaceRef.current = true;
    setOwnPace(true);
  }, []);

  // Host-only: write playback state to Supabase + broadcast activity (non-hosts never write)
  const commitHostPlaybackUpdate = useCallback(
    async (
      isPlaying: boolean,
      positionSeconds: number,
      action: 'play' | 'pause' | 'seek',
      skipActivityBroadcast = false
    ) => {
      if (!latestIsHostRef.current) return;

      const updatedAt = new Date().toISOString();
      const sentMs = Date.parse(updatedAt);
      recentSentTimestampsRef.current.add(sentMs);
      window.setTimeout(() => {
        recentSentTimestampsRef.current.delete(sentMs);
      }, 10000);

      const safePos = Math.max(0, Math.floor(positionSeconds));
      latestRoomRef.current = {
        ...latestRoomRef.current,
        is_playing: isPlaying,
        position_seconds: safePos,
        updated_at: updatedAt,
      };
      latestServerRoomRef.current = latestRoomRef.current;
      setRoomState({ isPlaying, positionSeconds: safePos });
      setHostDisplayState({ positionSeconds: safePos, hostAway: false });

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
    [broadcastActivity]
  );

  // Host-only debounced seek push (avoids spamming Supabase while scrubbing)
  const pushHostSeek = useCallback(
    (isPlaying: boolean, positionSeconds: number) => {
      if (
        !latestIsHostRef.current ||
        isProgrammaticChangeRef.current ||
        isApplyingRemoteRef.current
      ) {
        return;
      }

      const safePos = Math.max(0, Math.floor(positionSeconds));
      if (pushDebounceTimerRef.current) {
        window.clearTimeout(pushDebounceTimerRef.current);
      }

      pushDebounceTimerRef.current = window.setTimeout(() => {
        pushDebounceTimerRef.current = null;
        if (
          !latestIsHostRef.current ||
          isProgrammaticChangeRef.current ||
          isApplyingRemoteRef.current
        ) {
          return;
        }
        void commitHostPlaybackUpdate(isPlaying, safePos, 'seek', false);
      }, 250);
    },
    [commitHostPlaybackUpdate]
  );

  // Host-only: play a specific queued or picked movie across the whole room
  const switchRoomMovie = useCallback(
    async (movie: PickerMovieSelection, nextQueue?: QueueItem[]): Promise<string | null> => {
      if (!latestIsHostRef.current) {
        return 'Only the host can change the room movie.';
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

      initialJoinTargetRef.current = { isPlaying: shouldAutoPlay, positionSeconds: 0 };
      markProgrammaticChange(2500);
      setCurrentRoom((prev) => {
        const nextRoom: RoomRecord = {
          ...prev,
          video_id: movie.videoId,
          source: movie.source,
          video_url: movie.source === 'archive' ? movie.videoUrl ?? null : null,
          is_playing: shouldAutoPlay,
          position_seconds: 0,
          queue: nextQueue ?? prev.queue,
          updated_at: updatedAt,
        };
        latestServerRoomRef.current = nextRoom;
        return nextRoom;
      });
      setRoomState({ isPlaying: shouldAutoPlay, positionSeconds: 0 });
      setHostDisplayState({ positionSeconds: 0, hostAway: false });
      setLocalIsPlaying(shouldAutoPlay);
      broadcastActivity('video', 0);
      return null;
    },
    [broadcastActivity, markProgrammaticChange]
  );

  // Host-only: advance to the next movie in the Up Next queue when the current video ends
  const advanceQueueOnEnd = useCallback(async () => {
    if (!latestIsHostRef.current) return;

    const active = latestRoomRef.current;
    const currentQueue = normalizeQueueItems(active.queue);
    if (currentQueue.length === 0) return;

    const endedVideoId = active.video_id;
    const [nextItem, ...rest] = currentQueue;
    if (latestRoomRef.current.video_id !== endedVideoId) return;

    let resolvedUrl = nextItem.videoUrl ?? null;
    if (nextItem.source === 'archive' && !resolvedUrl) {
      const details = await fetchArchiveMovieDetails(nextItem.videoId);
      if (!details.mp4Url || !isValidArchiveDownloadUrl(details.mp4Url)) {
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
  }, [switchRoomMovie]);

  // Run the synchronized 3 -> 2 -> 1 countdown overlay then begin playback together
  const runSyncedCountdown = useCallback(
    (targetSeconds: number, initiatedByHost: boolean) => {
      for (const timerId of countdownTimersRef.current) {
        window.clearTimeout(timerId);
      }
      countdownTimersRef.current = [];

      // Pause and seek everyone to the exact starting timestamp before 3-2-1
      applyRemoteStateToPlayer(false, targetSeconds, true);
      setLocalIsPlaying(false);
      setCountdownValue(3);

      const t1 = window.setTimeout(() => setCountdownValue(2), 1000);
      const t2 = window.setTimeout(() => setCountdownValue(1), 2000);
      const t3 = window.setTimeout(() => {
        setCountdownValue(null);
        applyRemoteStateToPlayer(true, targetSeconds, true);
        setLocalIsPlaying(true);
        if (initiatedByHost && latestIsHostRef.current) {
          void commitHostPlaybackUpdate(true, targetSeconds, 'play', true);
        }
      }, 3000);

      countdownTimersRef.current = [t1, t2, t3];
    },
    [applyRemoteStateToPlayer, commitHostPlaybackUpdate]
  );

  applyRemoteStateRef.current = applyRemoteStateToPlayer;
  runSyncedCountdownRef.current = runSyncedCountdown;

  // 1. Initialize YouTube IFrame Player API when source is YouTube (waits until Join Choice is resolved)
  useEffect(() => {
    if (isArchive || !video.youtubeId || joinChoicePending) return;

    let cancelled = false;
    setPlayerReady(false);
    setEmbedBlocked(false);
    markProgrammaticChange(2500);

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

            // Compute start target cleanly without ever writing back to the room
            const target =
              !latestIsHostRef.current && ownPaceRef.current
                ? initialJoinTargetRef.current
                : getHostLiveState(latestServerRoomRef.current);

            const needsSeekOrPlay = target.positionSeconds > 1 || target.isPlaying;
            markProgrammaticChange(needsSeekOrPlay ? 2200 : 600);
            setLocalIsPlaying(target.isPlaying);
            lastTimeCheckRef.current = {
              time: target.positionSeconds,
              wallMs: Date.now(),
              wasPlaying: target.isPlaying,
            };

            if (target.positionSeconds > 1 && typeof player.seekTo === 'function') {
              player.seekTo(target.positionSeconds, true);
            }
            if (target.isPlaying && typeof player.playVideo === 'function') {
              player.playVideo();
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === YT.PlayerState.PLAYING) {
              setLocalIsPlaying(true);
            } else if (
              event.data === YT.PlayerState.PAUSED ||
              event.data === YT.PlayerState.ENDED
            ) {
              setLocalIsPlaying(false);
            }

            if (event.data === YT.PlayerState.PAUSED) {
              saveRoomHistoryProgress(false);
            } else if (event.data === YT.PlayerState.ENDED) {
              saveRoomHistoryProgress(true);
            }

            // Ignore automatic load/seek events and pending join modal state
            if (
              isProgrammaticChangeRef.current ||
              isApplyingRemoteRef.current ||
              joinChoicePendingRef.current
            ) {
              return;
            }
            if (typeof event?.target?.getCurrentTime !== 'function') return;

            const currentTime = event.target.getCurrentTime();
            if (event.data === YT.PlayerState.PLAYING) {
              lastTimeCheckRef.current = {
                time: currentTime,
                wallMs: Date.now(),
                wasPlaying: true,
              };
              if (latestIsHostRef.current) {
                if (pushDebounceTimerRef.current) {
                  window.clearTimeout(pushDebounceTimerRef.current);
                  pushDebounceTimerRef.current = null;
                }
                void commitHostPlaybackUpdate(true, currentTime, 'play', false);
              } else {
                enterOwnPace();
              }
            } else if (event.data === YT.PlayerState.PAUSED) {
              lastTimeCheckRef.current = {
                time: currentTime,
                wallMs: Date.now(),
                wasPlaying: false,
              };
              if (latestIsHostRef.current) {
                if (pushDebounceTimerRef.current) {
                  window.clearTimeout(pushDebounceTimerRef.current);
                  pushDebounceTimerRef.current = null;
                }
                void commitHostPlaybackUpdate(false, currentTime, 'pause', false);
              } else {
                enterOwnPace();
              }
            } else if (event.data === YT.PlayerState.ENDED) {
              if (latestIsHostRef.current) {
                void advanceQueueOnEnd();
              }
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
    joinChoicePending,
    markProgrammaticChange,
    commitHostPlaybackUpdate,
    enterOwnPace,
    advanceQueueOnEnd,
    saveRoomHistoryProgress,
  ]);

  // 2. Detect YouTube timeline seeks
  useEffect(() => {
    if (isArchive || !playerReady || embedBlocked || joinChoicePending) return;

    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (
        !player ||
        isProgrammaticChangeRef.current ||
        isApplyingRemoteRef.current ||
        joinChoicePendingRef.current ||
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

        lastTimeCheckRef.current = {
          time: actualTime,
          wallMs: now,
          wasPlaying: isPlaying,
        };

        if (Math.abs(actualTime - expectedTime) > 2) {
          if (latestIsHostRef.current) {
            pushHostSeek(isPlaying, actualTime);
          } else {
            enterOwnPace();
          }
        }
      } catch {
        // Ignore transient YouTube IFrame API errors
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [
    isArchive,
    playerReady,
    embedBlocked,
    joinChoicePending,
    currentRoom.id,
    pushHostSeek,
    enterOwnPace,
  ]);

  // 3a. Detect phone landscape orientation for fullscreen video + slide-in chat drawer
  useEffect(() => {
    const syncOrientation = () => {
      const next = detectPhoneLandscape();
      setIsPhoneLandscape(next);
      if (!next) {
        setLandscapeChatOpen(false);
      }
    };
    syncOrientation();
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    return () => {
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
    };
  }, []);

  // 3b. Keep non-host "Host is at 42:10" display ticking every 2 seconds from the server timestamp
  useEffect(() => {
    if (isHost) return;
    const refreshHostClock = () => {
      const live = getHostLiveState(latestServerRoomRef.current);
      setHostDisplayState({ positionSeconds: live.positionSeconds, hostAway: live.hostAway });
    };
    refreshHostClock();
    const timer = window.setInterval(refreshHostClock, 2000);
    return () => window.clearInterval(timer);
  }, [isHost, currentRoom.id]);

  // 3c. Ready Check countdown timer & host auto-start when everyone is ready or 20s expires
  useEffect(() => {
    if (!readyCheck) return;

    const triggerCountdownFromCheck = (check: ActiveReadyCheck) => {
      if (readyTriggeredCheckIdRef.current === check.checkId) return;
      readyTriggeredCheckIdRef.current = check.checkId;
      setReadyCheck(null);
      sendCountdown(check.positionSeconds);
      runSyncedCountdown(check.positionSeconds, true);
    };

    const tick = () => {
      const currentCheck = readyCheckRef.current;
      if (!currentCheck) return;

      const elapsedMs = Date.now() - currentCheck.startedAt;
      const secsLeft = Math.max(0, Math.ceil((READY_CHECK_TIMEOUT_MS - elapsedMs) / 1000));
      setReadySecondsLeft(secsLeft);

      if (!latestIsHostRef.current) return;

      const expectedParticipants = participants.filter((p) => !p.independentMode);
      const everyoneReady =
        expectedParticipants.length > 0 &&
        expectedParticipants.every((p) => currentCheck.readyClientIds.includes(p.clientId));

      if (everyoneReady || elapsedMs >= READY_CHECK_TIMEOUT_MS) {
        triggerCountdownFromCheck(currentCheck);
      }
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [readyCheck, participants, sendCountdown, runSyncedCountdown]);

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

  // 5. Host-only 5-second heartbeat: writes position_seconds and updated_at silently while playing
  useEffect(() => {
    if (
      !isHost ||
      !localIsPlaying ||
      !playerReady ||
      embedBlocked ||
      archiveError ||
      countdownValue !== null
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!latestIsHostRef.current || !getLocalPlayerIsPlaying()) return;
      const pos = Math.max(0, Math.floor(getCurrentPlayerTime()));
      const updatedAt = new Date().toISOString();
      const sentMs = Date.parse(updatedAt);
      recentSentTimestampsRef.current.add(sentMs);
      window.setTimeout(() => {
        recentSentTimestampsRef.current.delete(sentMs);
      }, 10000);

      latestRoomRef.current = {
        ...latestRoomRef.current,
        is_playing: true,
        position_seconds: pos,
        updated_at: updatedAt,
      };
      latestServerRoomRef.current = latestRoomRef.current;
      setRoomState({ isPlaying: true, positionSeconds: pos });

      void updateRoomPlayback({
        roomId: latestRoomRef.current.id,
        isPlaying: true,
        positionSeconds: pos,
        updatedAt,
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [
    isHost,
    localIsPlaying,
    playerReady,
    embedBlocked,
    archiveError,
    countdownValue,
    getCurrentPlayerTime,
    getLocalPlayerIsPlaying,
  ]);

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

  // Broadcast emoji reaction with username & seat clientId (limited to 1 reaction per second per viewer)
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
    spawnReaction(id, emoji, sender, myClientId);
    sendReaction({ id, emoji, sender, clientId: myClientId });
  };

  // Manual touch-friendly play/pause control (host controls room; non-host controls local player)
  const handleTogglePlayPause = () => {
    clearProgrammaticChange();
    if (!isHost) {
      enterOwnPace();
    }

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

  // Host-only "Start together": opens Ready? check for multi-person rooms, or starts 3-2-1 immediately solo
  const handleStartTogether = () => {
    if (!isHost || !playerReady || countdownValue !== null || readyCheck) return;
    const targetSeconds = Math.max(0, Math.floor(getCurrentPlayerTime()));

    if (participants.length <= 1) {
      sendCountdown(targetSeconds);
      runSyncedCountdown(targetSeconds, true);
      return;
    }

    if (getLocalPlayerIsPlaying()) {
      void commitHostPlaybackUpdate(false, targetSeconds, 'pause', true);
    }
    applyRemoteStateToPlayer(false, targetSeconds, true);
    setLocalIsPlaying(false);

    const checkId = makeClientOrEventId('ready');
    readyTriggeredCheckIdRef.current = null;
    setReadySecondsLeft(20);
    setReadyCheck({
      checkId,
      positionSeconds: targetSeconds,
      startedAt: Date.now(),
      readyClientIds: [myClientId],
    });
    sendReadyCheck('start', checkId, targetSeconds);
  };

  const handleMarkReady = () => {
    if (!readyCheck) return;
    setReadyCheck((prev) => {
      if (!prev || prev.readyClientIds.includes(myClientId)) return prev;
      return {
        ...prev,
        readyClientIds: [...prev.readyClientIds, myClientId],
      };
    });
    sendReadyCheck('ready', readyCheck.checkId);
  };

  const handleHostStartNow = () => {
    if (!isHost || !readyCheck) return;
    if (readyTriggeredCheckIdRef.current === readyCheck.checkId) return;
    readyTriggeredCheckIdRef.current = readyCheck.checkId;
    const targetSeconds = readyCheck.positionSeconds;
    setReadyCheck(null);
    sendCountdown(targetSeconds);
    runSyncedCountdown(targetSeconds, true);
  };

  const handleHostCancelReadyCheck = () => {
    if (!isHost || !readyCheck) return;
    const checkId = readyCheck.checkId;
    setReadyCheck(null);
    sendReadyCheck('cancel', checkId);
  };

  const handleToggleDimLights = () => {
    setDimLights((prev) => {
      const next = !prev;
      writeSavedDimLights(next);
      if (!next) setDimOverlayTab(null);
      return next;
    });
  };

  // Host-only "Sync everyone to me": broadcasts host position/play state without altering host's own playback
  const handleSyncEveryoneToMe = () => {
    if (!isHost || !playerReady) return;
    const pos = Math.max(0, Math.floor(getCurrentPlayerTime()));
    const playing = getLocalPlayerIsPlaying();

    sendHostSync(pos, playing);

    const updatedAt = new Date().toISOString();
    const sentMs = Date.parse(updatedAt);
    recentSentTimestampsRef.current.add(sentMs);
    window.setTimeout(() => {
      recentSentTimestampsRef.current.delete(sentMs);
    }, 10000);

    latestRoomRef.current = {
      ...latestRoomRef.current,
      is_playing: playing,
      position_seconds: pos,
      updated_at: updatedAt,
    };
    latestServerRoomRef.current = latestRoomRef.current;
    setRoomState({ isPlaying: playing, positionSeconds: pos });
    setHostDisplayState({ positionSeconds: pos, hostAway: false });

    void updateRoomPlayback({
      roomId: latestRoomRef.current.id,
      isPlaying: playing,
      positionSeconds: pos,
      updatedAt,
    });

    showToast(`Synced everyone to ${formatSeconds(pos)}`);
  };

  // Non-host Join Choice handlers (never write to rooms on join)
  const handleStartFromBeginning = () => {
    ownPaceRef.current = true;
    setOwnPace(true);
    initialJoinTargetRef.current = { isPlaying: true, positionSeconds: 0 };
    setLocalIsPlaying(true);
    markProgrammaticChange(2500);
    joinChoicePendingRef.current = false;
    setJoinChoicePending(false);
  };

  const handleContinueWithHost = () => {
    const targetRoom = latestServerRoomRef.current ?? latestRoomRef.current;
    const hostLive = getHostLiveState(targetRoom);
    ownPaceRef.current = false;
    setOwnPace(false);
    initialJoinTargetRef.current = {
      isPlaying: hostLive.isPlaying,
      positionSeconds: hostLive.positionSeconds,
    };
    setCurrentRoom(targetRoom);
    setRoomState({ isPlaying: hostLive.isPlaying, positionSeconds: hostLive.positionSeconds });
    setHostDisplayState({
      positionSeconds: hostLive.positionSeconds,
      hostAway: hostLive.hostAway,
    });
    setLocalIsPlaying(hostLive.isPlaying);
    markProgrammaticChange(2500);
    joinChoicePendingRef.current = false;
    setJoinChoicePending(false);
  };

  // Non-host "Sync to host" (one-way: jumps local player to host's position/play state and returns to Following)
  const handleSyncToHost = async () => {
    if (isHost || syncingToHost) return;
    setSyncingToHost(true);

    const { room: fetched } = await findRoomByCode(latestRoomRef.current.code);
    const targetRoom = fetched ?? latestServerRoomRef.current ?? latestRoomRef.current;
    const hostLive = getHostLiveState(targetRoom);

    const prevRoom = latestRoomRef.current;
    const videoChanged =
      targetRoom.video_id !== prevRoom.video_id ||
      (targetRoom.source ?? 'youtube') !== (prevRoom.source ?? 'youtube') ||
      (targetRoom.video_url ?? null) !== (prevRoom.video_url ?? null);

    latestServerRoomRef.current = targetRoom;
    ownPaceRef.current = false;
    setOwnPace(false);
    setRoomState({ isPlaying: hostLive.isPlaying, positionSeconds: hostLive.positionSeconds });
    setHostDisplayState({
      positionSeconds: hostLive.positionSeconds,
      hostAway: hostLive.hostAway,
    });
    setLocalIsPlaying(hostLive.isPlaying);

    if (videoChanged) {
      initialJoinTargetRef.current = {
        isPlaying: hostLive.isPlaying,
        positionSeconds: hostLive.positionSeconds,
      };
      markProgrammaticChange(2500);
      setCurrentRoom(targetRoom);
    } else {
      setCurrentRoom(targetRoom);
      applyRemoteStateToPlayer(hostLive.isPlaying, hostLive.positionSeconds, true);
    }

    setSyncingToHost(false);
    showToast(
      hostLive.hostAway
        ? 'Host seems to be away'
        : `Synced to host (${formatSeconds(hostLive.positionSeconds)})`
    );
  };

  const handleSaveRoomSettings = async (next: { locked: boolean }): Promise<string | null> => {
    if (!isHost) return 'Only the host can change room settings.';
    const { error } = await updateRoomSettings({
      roomId: currentRoom.id,
      locked: next.locked,
    });
    if (!error) {
      setCurrentRoom((prev) => ({
        ...prev,
        locked: next.locked,
      }));
    }
    return error;
  };

  const handleAddToQueue = async (movie: PickerMovieSelection): Promise<string | null> => {
    if (!isHost) return 'Only the host can add movies to the queue.';
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
    if (!isHost || queueBusyId) return;
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

  const outerSectionClass = isPhoneLandscape
    ? 'fixed inset-0 z-40 bg-[#070605] overflow-hidden'
    : dimLights
      ? 'min-h-screen bg-[#070605] px-3 py-3 sm:px-6 sm:py-5 lg:px-8'
      : 'h-[100dvh] lg:h-auto lg:min-h-screen flex flex-col lg:block overflow-hidden lg:overflow-visible bg-[#14110f] px-3 py-2 sm:px-5 sm:py-4 lg:px-8 lg:py-5';

  const innerLayoutClass = isPhoneLandscape
    ? 'relative h-full w-full'
    : dimLights
      ? 'mx-auto flex w-full max-w-[1280px] flex-col gap-3'
      : 'mx-auto flex flex-1 min-h-0 w-full max-w-[1440px] flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-5 lg:gap-y-3';

  const videoAndSeatsColClass = isPhoneLandscape
    ? 'h-full w-full'
    : dimLights
      ? 'w-full'
      : 'shrink-0 flex flex-col gap-2 lg:col-start-1 lg:row-start-2 lg:gap-3';

  const videoFrameClass = isPhoneLandscape
    ? 'relative h-full w-full overflow-hidden bg-[#070605]'
    : dimLights
      ? 'relative overflow-hidden rounded-[20px] border border-[#3a322a] bg-[#070605]'
      : 'relative overflow-hidden rounded-[16px] sm:rounded-[20px] border border-[#3a322a] bg-[#1e1a16]';

  const chatWrapperClass = isPhoneLandscape
    ? `fixed inset-y-0 right-0 z-50 w-[min(88vw,340px)] p-2 transition-transform duration-200 ${
        landscapeChatOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`
    : dimLights
      ? dimOverlayTab === 'chat'
        ? 'fixed bottom-16 right-4 z-40 h-[min(68vh,480px)] w-[min(92vw,340px)]'
        : 'hidden'
      : 'flex-1 min-h-0 lg:flex-none lg:col-start-2 lg:row-start-2 lg:relative';

  const currentBookmarkId = isArchive
    ? currentRoom.video_id
    : video.youtubeId || currentRoom.video_id;

  return (
    <section className={outerSectionClass}>
      <div className={innerLayoutClass}>
        {/* Slim top bar (hidden in phone landscape fullscreen) */}
        {!isPhoneLandscape && (
          <div className={dimLights ? 'shrink-0' : 'shrink-0 lg:col-start-1 lg:row-start-1'}>
            <RoomTopBar
              roomName={currentRoom.name}
              roomCode={currentRoom.code}
              isLocked={isLocked}
              syncStatus={syncStatus}
              dimLights={dimLights}
              copied={copied}
              onBack={() => {
                saveRoomHistoryProgress(false);
                onBack();
              }}
              onToggleDimLights={handleToggleDimLights}
              onCopyCode={handleCopyInvite}
              onInvite={handleShareRoom}
            />
          </div>
        )}

        {/* Laptop right top strip aligned with RoomTopBar (hidden on phone, dimLights, and landscape) */}
        {!isPhoneLandscape && !dimLights && (
          <div className="hidden lg:flex lg:col-start-2 lg:row-start-1 items-center justify-between gap-2 min-w-0">
            <BookmarkButton
              source={isArchive ? 'archive' : 'youtube'}
              id={currentBookmarkId}
              videoUrl={isArchive ? archiveUrl ?? currentRoom.video_url : null}
              title={displayVideoTitle}
              thumbnail={currentThumbnail}
              variant="button"
            />

            {isHost ? (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
              >
                <Settings className="h-4 w-4 text-[#f2a33a] shrink-0" aria-hidden="true" />
                <span>Room Settings</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#b9aa98] tabular-nums truncate">
                <Users className="h-3.5 w-3.5 text-[#f2a33a] shrink-0" aria-hidden="true" />
                <span>{peopleCount} watching</span>
              </span>
            )}
          </div>
        )}

        {/* Single mounted Video + Seats column (never conditionally unmounts the player across modes) */}
        <div className={videoAndSeatsColClass}>
          <div className={videoFrameClass}>
            {joinChoicePending ? (
              <div
                className={`flex w-full flex-col items-center justify-center gap-2 bg-[#14110f] p-6 text-center ${
                  isPhoneLandscape ? 'h-full' : 'aspect-video'
                }`}
              >
                <Film className="h-8 w-8 text-[#f2a33a]" aria-hidden="true" />
                <p className="text-sm font-bold text-[#f4ece1]">{displayVideoTitle}</p>
                <p className="text-xs text-[#b9aa98]">
                  Choose how you&apos;d like to start watching
                </p>
              </div>
            ) : isArchive ? (
              archiveLoading ? (
                <div
                  className={`flex w-full flex-col items-center justify-center gap-2 bg-[#14110f] p-6 text-center ${
                    isPhoneLandscape ? 'h-full' : 'aspect-video'
                  }`}
                >
                  <Film className="h-8 w-8 text-[#f2a33a] animate-pulse" aria-hidden="true" />
                  <p className="text-sm font-medium text-[#f4ece1]">
                    Loading movie from Internet Archive...
                  </p>
                </div>
              ) : archiveError || !archiveUrl ? (
                <div
                  className={`flex w-full flex-col items-center justify-center gap-4 bg-[#14110f] p-6 text-center ${
                    isPhoneLandscape ? 'h-full' : 'aspect-video'
                  }`}
                >
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
                    onClick={isHost ? () => setPickerOpen(true) : onBack}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                  >
                    <span>{isHost ? 'Pick another movie' : 'Back to MovieNest'}</span>
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
                    const target =
                      !latestIsHostRef.current && ownPaceRef.current
                        ? initialJoinTargetRef.current
                        : getHostLiveState(latestServerRoomRef.current);

                    const needsSeekOrPlay = target.positionSeconds > 1 || target.isPlaying;
                    markProgrammaticChange(needsSeekOrPlay ? 2000 : 600);
                    setLocalIsPlaying(target.isPlaying);

                    if (target.positionSeconds > 1) {
                      e.currentTarget.currentTime = target.positionSeconds;
                    }
                    if (target.isPlaying) {
                      void e.currentTarget.play().catch(() => {
                        setLocalIsPlaying(false);
                      });
                    }
                  }}
                  onPlay={(e) => {
                    setLocalIsPlaying(true);
                    if (
                      isProgrammaticChangeRef.current ||
                      isApplyingRemoteRef.current ||
                      joinChoicePendingRef.current
                    ) {
                      return;
                    }
                    if (latestIsHostRef.current) {
                      if (pushDebounceTimerRef.current) {
                        window.clearTimeout(pushDebounceTimerRef.current);
                        pushDebounceTimerRef.current = null;
                      }
                      void commitHostPlaybackUpdate(true, e.currentTarget.currentTime, 'play', false);
                    } else {
                      enterOwnPace();
                    }
                  }}
                  onPause={(e) => {
                    setLocalIsPlaying(false);
                    if (!e.currentTarget.ended) {
                      saveRoomHistoryProgress(false);
                    }
                    if (
                      isProgrammaticChangeRef.current ||
                      isApplyingRemoteRef.current ||
                      joinChoicePendingRef.current ||
                      e.currentTarget.ended
                    ) {
                      return;
                    }
                    if (latestIsHostRef.current) {
                      if (pushDebounceTimerRef.current) {
                        window.clearTimeout(pushDebounceTimerRef.current);
                        pushDebounceTimerRef.current = null;
                      }
                      void commitHostPlaybackUpdate(
                        false,
                        e.currentTarget.currentTime,
                        'pause',
                        false
                      );
                    } else {
                      enterOwnPace();
                    }
                  }}
                  onSeeked={(e) => {
                    if (
                      isProgrammaticChangeRef.current ||
                      isApplyingRemoteRef.current ||
                      joinChoicePendingRef.current
                    ) {
                      return;
                    }
                    if (latestIsHostRef.current) {
                      pushHostSeek(!e.currentTarget.paused, e.currentTarget.currentTime);
                    } else {
                      enterOwnPace();
                    }
                  }}
                  onEnded={() => {
                    setLocalIsPlaying(false);
                    saveRoomHistoryProgress(true);
                    if (latestIsHostRef.current) {
                      void advanceQueueOnEnd();
                    }
                  }}
                  onError={() => setArchiveError(true)}
                  className={
                    isPhoneLandscape
                      ? 'h-full w-full bg-[#070605] object-contain'
                      : 'aspect-video w-full bg-[#14110f]'
                  }
                />
              )
            ) : embedBlocked ? (
              <div
                className={`flex w-full flex-col items-center justify-center gap-4 bg-[#14110f] p-6 text-center ${
                  isPhoneLandscape ? 'h-full' : 'aspect-video'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#3a322a] bg-[#1e1a16]">
                  <Lock className="h-5 w-5 text-[#f2a33a]" aria-hidden="true" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <p className="text-lg font-bold text-[#f4ece1]">
                    This video&apos;s owner blocks embedding
                  </p>
                  <p className="text-sm text-[#b9aa98]">
                    YouTube doesn&apos;t allow this video to play inside external apps. You can
                    open it directly on YouTube or switch to another movie.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <a
                    href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.youtubeId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f]"
                  >
                    <span>Open on YouTube</span>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#3a322a] bg-[#1e1a16] px-5 py-2.5 text-sm font-medium text-[#f4ece1] hover:border-[#f2a33a] cursor-pointer"
                    >
                      <span>Change video</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                ref={playerMountRef}
                className={
                  isPhoneLandscape
                    ? 'relative h-full w-full bg-[#070605]'
                    : 'relative aspect-video w-full bg-[#14110f]'
                }
              />
            )}

            {/* Activity & presence toast notices */}
            {toasts.length > 0 && (
              <div
                aria-live="polite"
                className={`pointer-events-none absolute left-3 z-20 flex flex-col gap-1.5 ${
                  isPhoneLandscape ? 'top-16' : 'top-3'
                }`}
              >
                {toasts.map((toast) => (
                  <div
                    key={toast.id}
                    className="rounded-xl border border-[#3a322a] bg-[#14110f]/95 px-3 py-1.5 text-xs font-medium text-[#f4ece1]"
                  >
                    {toast.text}
                  </div>
                ))}
              </div>
            )}

            {/* Floating reactions overlay on video when seats strip is collapsed (landscape or Dim the Lights) */}
            {(isPhoneLandscape || dimLights) && floatingReactions.length > 0 && (
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
                      <span className="mt-0.5 rounded bg-[#14110f]/90 px-1.5 py-0.5 text-[10px] font-medium text-[#f4ece1]">
                        {reaction.sender}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Ready Check ("Ready?") prompt overlay */}
            {readyCheck && !joinChoicePending && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#14110f]/80 p-3">
                <ReadyCheckPrompt
                  isHost={isHost}
                  hasMarkedReady={readyCheck.readyClientIds.includes(myClientId)}
                  readyCount={readyCheck.readyClientIds.length}
                  totalCount={Math.max(1, participants.filter((p) => !p.independentMode).length)}
                  secondsRemaining={readySecondsLeft}
                  onMarkReady={handleMarkReady}
                  onHostStartNow={handleHostStartNow}
                  onHostCancel={handleHostCancelReadyCheck}
                />
              </div>
            )}

            {/* 3, 2, 1 synchronized countdown overlay */}
            {countdownValue !== null && (
              <div
                aria-live="assertive"
                className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#14110f]/85"
              >
                <p className="text-xs font-bold uppercase tracking-widest text-[#f4ece1]">
                  Starting together in
                </p>
                <span className="mt-1 text-7xl sm:text-8xl font-bold text-[#f2a33a] tabular-nums">
                  {countdownValue}
                </span>
              </div>
            )}

            {/* Phone landscape overlay controls: compact reaction row top-left + Chat drawer trigger top-right */}
            {isPhoneLandscape && (
              <>
                <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-116px)]">
                  <RoomReactionBar
                    compactOverlay
                    onSendReaction={handleSendReaction}
                    reactionNote={reactionNote}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setLandscapeChatOpen((open) => !open)}
                  aria-expanded={landscapeChatOpen}
                  className="absolute right-3 top-3 z-30 inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f]/95 px-4 text-xs font-bold text-[#f4ece1] transition-colors hover:border-[#f2a33a] cursor-pointer"
                >
                  <MessageSquare className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                  <span>Chat</span>
                </button>
              </>
            )}
          </div>

          {/* Seats panel under the video (visible in normal portrait & laptop mode) */}
          {!isPhoneLandscape && !dimLights && (
            <RoomSeatsPanel
              participants={participants}
              isHost={isHost}
              playerReady={playerReady}
              localIsPlaying={localIsPlaying}
              ownPace={ownPace}
              hostLiveSeconds={hostDisplayState.positionSeconds}
              hostAway={hostDisplayState.hostAway}
              syncingToHost={syncingToHost}
              readyClientIds={readyCheck ? readyCheck.readyClientIds : null}
              readyCheckActive={Boolean(readyCheck)}
              countdownActive={countdownValue !== null}
              embedOrArchiveBlocked={embedBlocked || archiveError}
              seatReactions={seatReactions}
              formatTime={formatSeconds}
              onTogglePlayPause={handleTogglePlayPause}
              onSyncEveryoneToMe={handleSyncEveryoneToMe}
              onStartTogether={handleStartTogether}
              onSyncToHost={handleSyncToHost}
              onChangeVideo={() => setPickerOpen(true)}
            />
          )}
        </div>

        {/* Phone portrait reactions row + compact Bookmark, Queue & Host Settings triggers */}
        {!isPhoneLandscape && !dimLights && (
          <div className="flex shrink-0 items-center justify-between gap-2 lg:hidden">
            <RoomReactionBar
              className="flex-1 min-w-0"
              onSendReaction={handleSendReaction}
              reactionNote={reactionNote}
            />

            <div className="flex shrink-0 items-center gap-1.5">
              <BookmarkButton
                source={isArchive ? 'archive' : 'youtube'}
                id={currentBookmarkId}
                videoUrl={isArchive ? archiveUrl ?? currentRoom.video_url : null}
                title={displayVideoTitle}
                thumbnail={currentThumbnail}
                variant="icon"
              />

              <button
                type="button"
                onClick={() => setMobileQueueOpen(true)}
                aria-label={`Open Up Next queue (${queue.length})`}
                className="inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-2.5 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
              >
                <ListVideo className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                {queue.length > 0 && (
                  <span className="font-mono text-xs tabular-nums">{queue.length}</span>
                )}
              </button>

              {isHost && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Room Settings"
                  className="inline-flex h-11 w-11 min-h-[44px] items-center justify-center rounded-full border border-[#3a322a] bg-[#1e1a16] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                >
                  <Settings className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Single mounted Room Chat panel (matches Video+Seats height on laptop, fills remaining portrait screen, slides in on landscape, overlays on Dim the Lights) */}
        <div className={chatWrapperClass}>
          <div className={!isPhoneLandscape && !dimLights ? 'h-full lg:absolute lg:inset-0' : 'h-full'}>
            <RoomChat
              fillHeight
              messages={chatMessages}
              loading={chatLoading}
              loadError={chatError}
              username={safeUsername}
              onSendMessage={sendChatMessage}
              onRequestUsername={onRequestUsername}
              onCloseDrawer={
                isPhoneLandscape
                  ? () => setLandscapeChatOpen(false)
                  : dimLights
                    ? () => setDimOverlayTab(null)
                    : undefined
              }
            />
          </div>
        </div>

        {/* Dim the Lights reaction bar under the wide video */}
        {dimLights && !isPhoneLandscape && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RoomReactionBar
              onSendReaction={handleSendReaction}
              reactionNote={reactionNote}
            />
            <p className="truncate text-xs text-[#b9aa98]">
              Now playing: <span className="font-medium text-[#f4ece1]">{displayVideoTitle}</span>
            </p>
          </div>
        )}

        {/* Laptop left column row 3: reaction bar + Now playing + Up Next queue */}
        {!isPhoneLandscape && !dimLights && (
          <div className="hidden lg:flex lg:col-start-1 lg:row-start-3 flex-col gap-4 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <RoomReactionBar
                onSendReaction={handleSendReaction}
                reactionNote={reactionNote}
              />
              <p className="truncate text-xs text-[#b9aa98]">
                Now playing: <span className="font-medium text-[#f4ece1]">{displayVideoTitle}</span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span>{isArchive ? 'Internet Archive' : video.meta}</span>
              </p>
            </div>

            <RoomQueuePanel
              queue={queue}
              isHost={isHost}
              canControlPlayback={isHost}
              busyItemId={queueBusyId}
              onOpenPicker={() => setPickerOpen(true)}
              onPlayQueuedItem={handlePlayQueuedItem}
              onRemoveItem={handleRemoveQueuedItem}
            />
          </div>
        )}
      </div>

      {/* Dim the Lights corner peek buttons + Seats overlay */}
      {dimLights && !isPhoneLandscape && (
        <>
          <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDimOverlayTab((tab) => (tab === 'seats' ? null : 'seats'))}
              aria-expanded={dimOverlayTab === 'seats'}
              className={`inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-xs font-bold transition-colors cursor-pointer ${
                dimOverlayTab === 'seats'
                  ? 'border-[#f2a33a] bg-[#f2a33a] text-[#1a1208]'
                  : 'border-[#3a322a] bg-[#1e1a16] text-[#f4ece1] hover:border-[#f2a33a]'
              }`}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>Seats ({peopleCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setDimOverlayTab((tab) => (tab === 'chat' ? null : 'chat'))}
              aria-expanded={dimOverlayTab === 'chat'}
              className={`inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-xs font-bold transition-colors cursor-pointer ${
                dimOverlayTab === 'chat'
                  ? 'border-[#f2a33a] bg-[#f2a33a] text-[#1a1208]'
                  : 'border-[#3a322a] bg-[#1e1a16] text-[#f4ece1] hover:border-[#f2a33a]'
              }`}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>Chat</span>
            </button>
          </div>

          {dimOverlayTab === 'seats' && (
            <div className="fixed bottom-16 right-4 z-40 w-[min(94vw,760px)] space-y-2">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setDimOverlayTab(null)}
                  aria-label="Close seats"
                  className="inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] hover:border-[#f2a33a] cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span>Close seats</span>
                </button>
              </div>
              <RoomSeatsPanel
                participants={participants}
                isHost={isHost}
                playerReady={playerReady}
                localIsPlaying={localIsPlaying}
                ownPace={ownPace}
                hostLiveSeconds={hostDisplayState.positionSeconds}
                hostAway={hostDisplayState.hostAway}
                syncingToHost={syncingToHost}
                readyClientIds={readyCheck ? readyCheck.readyClientIds : null}
                readyCheckActive={Boolean(readyCheck)}
                countdownActive={countdownValue !== null}
                embedOrArchiveBlocked={embedBlocked || archiveError}
                seatReactions={seatReactions}
                formatTime={formatSeconds}
                onTogglePlayPause={handleTogglePlayPause}
                onSyncEveryoneToMe={handleSyncEveryoneToMe}
                onStartTogether={handleStartTogether}
                onSyncToHost={handleSyncToHost}
                onChangeVideo={() => setPickerOpen(true)}
              />
            </div>
          )}
        </>
      )}

      {/* Mobile Portrait Up Next Queue modal sheet */}
      {mobileQueueOpen && !isPhoneLandscape && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Up Next queue"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/85 p-3 lg:hidden"
        >
          <div className="w-full max-w-md space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMobileQueueOpen(false)}
                aria-label="Close queue"
                className="inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] hover:border-[#f2a33a] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>
            <RoomQueuePanel
              queue={queue}
              isHost={isHost}
              canControlPlayback={isHost}
              busyItemId={queueBusyId}
              onOpenPicker={() => {
                setMobileQueueOpen(false);
                setPickerOpen(true);
              }}
              onPlayQueuedItem={(item) => {
                setMobileQueueOpen(false);
                void handlePlayQueuedItem(item);
              }}
              onRemoveItem={handleRemoveQueuedItem}
              inMobileTab
            />
          </div>
        </div>
      )}

      <RoomSettingsModal
        open={settingsOpen && isHost}
        locked={isLocked}
        onClose={() => setSettingsOpen(false)}
        onSaveSettings={handleSaveRoomSettings}
      />

      <RoomVideoPickerModal
        open={pickerOpen && isHost}
        canChangeVideo={isHost}
        queue={queue}
        sharedLibrary={safeLibrary}
        onClose={() => setPickerOpen(false)}
        onPlayNow={(movie) => switchRoomMovie(movie)}
        onAddToQueue={handleAddToQueue}
      />

      {/* Non-host late-joiner bottom sheet (phones) / centered modal (laptops) */}
      {joinChoicePending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-choice-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/85 p-0 sm:items-center sm:p-4"
        >
          <div className="w-full max-w-md rounded-t-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:rounded-[20px] sm:p-6">
            <h2
              id="join-choice-title"
              className="text-xl font-bold text-[#f4ece1] tabular-nums"
            >
              The movie is already at {formatSeconds(joinModalState.positionSeconds)}
            </h2>

            {joinModalState.hostAway ? (
              <p className="mt-1.5 text-sm font-medium text-[#f2a33a]">
                Host seems to be away
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-[#b9aa98]">
                Continue watching with the host or start from 0:00 at your own pace.
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleContinueWithHost}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
              >
                Continue with host
              </button>
              <button
                type="button"
                onClick={handleStartFromBeginning}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] px-5 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
              >
                Start from the beginning
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
