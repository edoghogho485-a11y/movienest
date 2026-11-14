import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RoomParticipant } from '../components/RoomPeopleList';
import {
  fetchRoomMessages,
  normalizeRoomRecord,
  RoomMessage,
  RoomRecord,
  sendRoomMessage,
  supabase,
} from '../lib/supabase';

export type RoomSyncStatus = 'connecting' | 'synced' | 'reconnecting';
export type RoomActivityAction = 'play' | 'pause' | 'seek' | 'video';
export type ReadyCheckAction = 'start' | 'ready' | 'cancel';

export interface ReadyCheckEventPayload {
  action: ReadyCheckAction;
  checkId: string;
  clientId: string;
  name?: string;
  positionSeconds?: number;
}

interface UseRoomChannelsParams {
  roomId: string;
  roomCode: string;
  username: string;
  isHost: boolean;
  independentMode: boolean;
  onRoomUpdated: (updated: RoomRecord) => void;
  onReactionReceived: (payload: {
    id: string;
    emoji: string;
    sender?: string;
    clientId?: string;
  }) => void;
  onActivityReceived: (payload: {
    actor: string;
    action: RoomActivityAction;
    positionSeconds: number;
  }) => void;
  onCountdownReceived: (positionSeconds: number) => void;
  onHostSyncReceived: (payload: { positionSeconds: number; isPlaying: boolean }) => void;
  onReadyCheckReceived: (payload: ReadyCheckEventPayload) => void;
  onPresenceNotice: (text: string) => void;
}

function makeClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `viewer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Single hook managing all Realtime channels for a room ("room-db:CODE" and "room-live:CODE")
export function useRoomChannels({
  roomId,
  roomCode,
  username,
  isHost,
  independentMode,
  onRoomUpdated,
  onReactionReceived,
  onActivityReceived,
  onCountdownReceived,
  onHostSyncReceived,
  onReadyCheckReceived,
  onPresenceNotice,
}: UseRoomChannelsParams) {
  const cleanRoomCode = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
  const cleanRoomId = typeof roomId === 'string' ? roomId.trim() : '';
  const cleanUsername = typeof username === 'string' ? username.trim() : '';

  const [syncStatus, setSyncStatus] = useState<RoomSyncStatus>('connecting');
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatError, setChatError] = useState('');

  // Store channels and per-tab viewer identity in refs
  const dbChannelRef = useRef<RealtimeChannel | null>(null);
  const liveChannelRef = useRef<RealtimeChannel | null>(null);
  const clientIdRef = useRef<string>(makeClientId());

  // Track presence names so metadata updates don't fire false join/leave toasts
  const hasInitialPresenceSyncRef = useRef(false);
  const knownPresenceNamesRef = useRef<Map<string, string>>(new Map());
  const pendingLeaveTimersRef = useRef<Map<string, number>>(new Map());

  // Latest state & callback refs so channel setup only depends on the room code
  const roomIdRef = useRef(cleanRoomId);
  roomIdRef.current = cleanRoomId;
  const usernameRef = useRef(cleanUsername);
  usernameRef.current = cleanUsername;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const independentModeRef = useRef(independentMode);
  independentModeRef.current = independentMode;

  const onRoomUpdatedRef = useRef(onRoomUpdated);
  onRoomUpdatedRef.current = onRoomUpdated;
  const onReactionReceivedRef = useRef(onReactionReceived);
  onReactionReceivedRef.current = onReactionReceived;
  const onActivityReceivedRef = useRef(onActivityReceived);
  onActivityReceivedRef.current = onActivityReceived;
  const onCountdownReceivedRef = useRef(onCountdownReceived);
  onCountdownReceivedRef.current = onCountdownReceived;
  const onHostSyncReceivedRef = useRef(onHostSyncReceived);
  onHostSyncReceivedRef.current = onHostSyncReceived;
  const onReadyCheckReceivedRef = useRef(onReadyCheckReceived);
  onReadyCheckReceivedRef.current = onReadyCheckReceived;
  const onPresenceNoticeRef = useRef(onPresenceNotice);
  onPresenceNoticeRef.current = onPresenceNotice;

  // Create "room-db:CODE" and "room-live:CODE" once per room visit, keyed on roomCode
  useEffect(() => {
    const activeRoomId = roomIdRef.current;
    if (!cleanRoomCode || !activeRoomId) return;

    let isEffectActive = true;
    setSyncStatus('connecting');
    setChatLoading(true);
    setChatError('');
    setMessages([]);
    hasInitialPresenceSyncRef.current = false;
    knownPresenceNamesRef.current.clear();

    const dbChannelName = `room-db:${cleanRoomCode}`;
    const liveChannelName = `room-live:${cleanRoomCode}`;

    // 1. Load existing chat history once for this room
    fetchRoomMessages(cleanRoomCode).then(({ messages: initial, error }) => {
      if (!isEffectActive) return;
      setChatLoading(false);
      if (error) {
        setChatError('Could not load chat messages.');
        return;
      }
      setMessages(Array.isArray(initial) ? initial : []);
    });

    const setupChannels = async () => {
      // Remove any existing channels with these topics first (handles StrictMode double-mount cleanly)
      const existingChannels = supabase
        .getChannels()
        .filter(
          (c) =>
            c.topic === `realtime:${dbChannelName}` ||
            c.topic === `realtime:${liveChannelName}` ||
            c.topic.startsWith('realtime:chat:')
        );
      if (existingChannels.length > 0) {
        await Promise.all(
          existingChannels.map(async (c) => {
            try {
              await supabase.removeChannel(c);
            } catch {
              // Ignore unsubscribe error and force teardown below
            }
            if (supabase.getChannels().includes(c)) {
              try {
                (c as unknown as { teardown?: () => void }).teardown?.();
              } catch {
                // Ignore teardown error
              }
            }
          })
        );
      }

      if (!isEffectActive) return;

      // 2. Database channel ("room-db:CODE"): all postgres_changes listeners attached BEFORE .subscribe()
      const dbChannel = supabase.channel(dbChannelName);
      dbChannelRef.current = dbChannel;

      let dbSubscribed = false;
      let liveSubscribed = false;
      const updateCombinedStatus = () => {
        if (!isEffectActive) return;
        if (dbSubscribed && liveSubscribed) {
          setSyncStatus('synced');
        }
      };

      dbChannel
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${activeRoomId}`,
          },
          (payload) => {
            if (!isEffectActive) return;
            const updated = normalizeRoomRecord(payload?.new);
            if (!updated) return;
            onRoomUpdatedRef.current(updated);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_code=eq.${cleanRoomCode}`,
          },
          (payload) => {
            if (!isEffectActive) return;
            const incoming = payload?.new as Partial<RoomMessage> | undefined;
            if (!incoming?.id || typeof incoming.body !== 'string') return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev;
              return [...prev, incoming as RoomMessage];
            });
          }
        )
        .subscribe((status) => {
          if (!isEffectActive) return;
          if (status === 'SUBSCRIBED') {
            dbSubscribed = true;
            updateCombinedStatus();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setSyncStatus('reconnecting');
          }
        });

      // 3. Live channel ("room-live:CODE"): all presence & broadcast listeners attached BEFORE .subscribe()
      const liveChannel = supabase.channel(liveChannelName, {
        config: {
          presence: { key: clientIdRef.current },
        },
      });
      liveChannelRef.current = liveChannel;

      const syncPresenceList = () => {
        if (!isEffectActive) return;

        let rawState: Record<string, unknown> = {};
        try {
          rawState = (liveChannel.presenceState() as Record<string, unknown>) ?? {};
        } catch {
          rawState = {};
        }

        const list: RoomParticipant[] = Object.entries(rawState).map(([key, rawEntries]) => {
          const entries = Array.isArray(rawEntries) ? rawEntries : [];
          const latest = (entries.length > 0 ? entries[entries.length - 1] : {}) as {
            name?: unknown;
            isHost?: unknown;
            independentMode?: unknown;
            joinedAt?: unknown;
          } | null;
          const name =
            typeof latest?.name === 'string' && latest.name.trim()
              ? latest.name.trim()
              : 'Guest';
          knownPresenceNamesRef.current.set(key, name);
          return {
            clientId: key,
            name,
            isHost: Boolean(latest?.isHost),
            isSelf: key === clientIdRef.current,
            independentMode: Boolean(latest?.independentMode),
            joinedAt: typeof latest?.joinedAt === 'string' ? latest.joinedAt : '',
          };
        });

        if (list.length === 0) {
          list.push({
            clientId: clientIdRef.current,
            name: usernameRef.current || 'Guest',
            isHost: isHostRef.current,
            isSelf: true,
            independentMode: independentModeRef.current,
            joinedAt: '',
          });
        }

        setParticipants(list);
        hasInitialPresenceSyncRef.current = true;
      };

      liveChannel
        .on('broadcast', { event: 'reaction' }, ({ payload }) => {
          if (!isEffectActive) return;
          const data = payload as {
            id?: string;
            emoji?: string;
            sender?: string;
            clientId?: string;
          } | null;
          if (data?.id && data?.emoji) {
            onReactionReceivedRef.current({
              id: data.id,
              emoji: data.emoji,
              sender: data.sender,
              clientId: data.clientId,
            });
          }
        })
        .on('broadcast', { event: 'activity' }, ({ payload }) => {
          if (!isEffectActive) return;
          const data = payload as {
            clientId?: string;
            actor?: string;
            action?: RoomActivityAction;
            positionSeconds?: number;
          } | null;
          if (!data || data.clientId === clientIdRef.current || !data.action) return;

          const actor = (typeof data.actor === 'string' ? data.actor.trim() : '') || 'Someone';
          onActivityReceivedRef.current({
            actor,
            action: data.action,
            positionSeconds: Math.max(0, data.positionSeconds ?? 0),
          });
        })
        .on('broadcast', { event: 'countdown' }, ({ payload }) => {
          if (!isEffectActive) return;
          const data = payload as {
            clientId?: string;
            positionSeconds?: number;
          } | null;
          if (!data || data.clientId === clientIdRef.current) return;
          onCountdownReceivedRef.current(Math.max(0, data.positionSeconds ?? 0));
        })
        .on('broadcast', { event: 'host_sync' }, ({ payload }) => {
          if (!isEffectActive) return;
          const data = payload as {
            clientId?: string;
            positionSeconds?: number;
            isPlaying?: boolean;
          } | null;
          if (!data || data.clientId === clientIdRef.current) return;
          onHostSyncReceivedRef.current({
            positionSeconds: Math.max(0, data.positionSeconds ?? 0),
            isPlaying: Boolean(data.isPlaying),
          });
        })
        .on('broadcast', { event: 'ready_check' }, ({ payload }) => {
          if (!isEffectActive) return;
          const data = payload as Partial<ReadyCheckEventPayload> | null;
          if (!data || !data.action || !data.checkId || !data.clientId) return;
          if (data.clientId === clientIdRef.current) return;
          onReadyCheckReceivedRef.current({
            action: data.action,
            checkId: data.checkId,
            clientId: data.clientId,
            name: typeof data.name === 'string' ? data.name : undefined,
            positionSeconds:
              typeof data.positionSeconds === 'number'
                ? Math.max(0, data.positionSeconds)
                : undefined,
          });
        })
        .on('presence', { event: 'sync' }, () => {
          syncPresenceList();
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          if (!isEffectActive || !hasInitialPresenceSyncRef.current || key === clientIdRef.current) {
            return;
          }

          // Cancel any pending leave notice if the same client refreshed metadata
          const pendingLeave = pendingLeaveTimersRef.current.get(key);
          if (pendingLeave) {
            window.clearTimeout(pendingLeave);
            pendingLeaveTimersRef.current.delete(key);
            syncPresenceList();
            return;
          }

          const wasKnown = knownPresenceNamesRef.current.has(key);
          const entry = (Array.isArray(newPresences) ? newPresences[0] : {}) as { name?: string };
          const name = (typeof entry?.name === 'string' ? entry.name.trim() : '') || 'Guest';
          knownPresenceNamesRef.current.set(key, name);

          if (!wasKnown && name !== 'Guest') {
            onPresenceNoticeRef.current(`${name} joined`);
          }
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          if (!isEffectActive || !hasInitialPresenceSyncRef.current || key === clientIdRef.current) {
            return;
          }

          const entry = (Array.isArray(leftPresences) ? leftPresences[0] : {}) as { name?: string };
          const leftName =
            (typeof entry?.name === 'string' ? entry.name.trim() : '') ||
            knownPresenceNamesRef.current.get(key) ||
            'Guest';

          const timerId = window.setTimeout(() => {
            pendingLeaveTimersRef.current.delete(key);
            if (!isEffectActive) return;
            try {
              const currentState = (liveChannel.presenceState() as Record<string, unknown>) ?? {};
              if (currentState[key]) return;
            } catch {
              return;
            }
            knownPresenceNamesRef.current.delete(key);
            if (leftName !== 'Guest') {
              onPresenceNoticeRef.current(`${leftName} left`);
            }
            syncPresenceList();
          }, 450);

          pendingLeaveTimersRef.current.set(key, timerId);
        })
        .subscribe(async (status) => {
          if (!isEffectActive) return;
          if (status === 'SUBSCRIBED') {
            liveSubscribed = true;
            updateCombinedStatus();
            try {
              await liveChannel.track({
                name: usernameRef.current || 'Guest',
                isHost: isHostRef.current,
                independentMode: independentModeRef.current,
                joinedAt: new Date().toISOString(),
              });
            } catch {
              // Ignore transient presence track errors
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setSyncStatus('reconnecting');
          }
        });
    };

    void setupChannels();

    // Cleanup removes both channels so leaving the room or StrictMode remount starts fresh
    return () => {
      isEffectActive = false;

      for (const timerId of pendingLeaveTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      pendingLeaveTimersRef.current.clear();

      const teardownSafely = async (ch: RealtimeChannel) => {
        try {
          await supabase.removeChannel(ch);
        } catch {
          // Ignore unsubscribe error and force teardown below
        }
        if (supabase.getChannels().includes(ch)) {
          try {
            (ch as unknown as { teardown?: () => void }).teardown?.();
          } catch {
            // Ignore teardown error
          }
        }
      };

      const dbChannel = dbChannelRef.current;
      dbChannelRef.current = null;
      if (dbChannel) {
        void teardownSafely(dbChannel);
      }

      const liveChannel = liveChannelRef.current;
      liveChannelRef.current = null;
      if (liveChannel) {
        void liveChannel.untrack().catch(() => {});
        void teardownSafely(liveChannel);
      }
    };
  }, [cleanRoomCode]);

  // Update presence metadata when username, host status, or independent mode changes while subscribed
  useEffect(() => {
    const liveChannel = liveChannelRef.current;
    if (!liveChannel || syncStatus !== 'synced') return;

    void liveChannel
      .track({
        name: cleanUsername || 'Guest',
        isHost,
        independentMode,
        joinedAt: new Date().toISOString(),
      })
      .catch(() => {});
  }, [cleanUsername, isHost, independentMode, syncStatus]);

  const sendChatMessage = useCallback(
    async (body: string): Promise<{ ok: boolean; error: string | null }> => {
      if (!cleanRoomCode || !cleanUsername) {
        return { ok: false, error: 'Please choose a username first.' };
      }

      const { message, error } = await sendRoomMessage({
        roomCode: cleanRoomCode,
        senderName: cleanUsername,
        body,
      });

      if (error || !message) {
        return { ok: false, error: error ?? 'Could not send your message. Please try again.' };
      }

      // Append immediately; Realtime INSERT on room-db deduplicates by message ID
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message]
      );
      return { ok: true, error: null };
    },
    [cleanRoomCode, cleanUsername]
  );

  const sendReaction = useCallback(
    (payload: { id: string; emoji: string; sender?: string; clientId?: string }) => {
      void liveChannelRef.current?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: {
          ...payload,
          clientId: payload.clientId ?? clientIdRef.current,
        },
      });
    },
    []
  );

  const sendActivity = useCallback(
    (action: RoomActivityAction, positionSeconds = 0) => {
      const actor = usernameRef.current || 'Someone';
      void liveChannelRef.current?.send({
        type: 'broadcast',
        event: 'activity',
        payload: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          clientId: clientIdRef.current,
          actor,
          action,
          positionSeconds: Math.max(0, Math.floor(positionSeconds)),
        },
      });
    },
    []
  );

  const sendCountdown = useCallback((positionSeconds: number) => {
    void liveChannelRef.current?.send({
      type: 'broadcast',
      event: 'countdown',
      payload: {
        clientId: clientIdRef.current,
        positionSeconds: Math.max(0, Math.floor(positionSeconds)),
      },
    });
  }, []);

  const sendHostSync = useCallback((positionSeconds: number, isPlaying: boolean) => {
    void liveChannelRef.current?.send({
      type: 'broadcast',
      event: 'host_sync',
      payload: {
        clientId: clientIdRef.current,
        positionSeconds: Math.max(0, Math.floor(positionSeconds)),
        isPlaying: Boolean(isPlaying),
      },
    });
  }, []);

  const sendReadyCheck = useCallback(
    (action: ReadyCheckAction, checkId: string, positionSeconds?: number) => {
      void liveChannelRef.current?.send({
        type: 'broadcast',
        event: 'ready_check',
        payload: {
          action,
          checkId,
          clientId: clientIdRef.current,
          name: usernameRef.current || 'Guest',
          positionSeconds:
            typeof positionSeconds === 'number'
              ? Math.max(0, Math.floor(positionSeconds))
              : undefined,
        },
      });
    },
    []
  );

  return {
    myClientId: clientIdRef.current,
    syncStatus,
    participants,
    messages,
    chatLoading,
    chatError,
    sendChatMessage,
    sendReaction,
    sendActivity,
    sendCountdown,
    sendHostSync,
    sendReadyCheck,
  };
}
