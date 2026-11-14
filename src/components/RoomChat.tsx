import { FormEvent, useEffect, useRef, useState } from 'react';
import { AtSign, Send } from 'lucide-react';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  fetchRoomMessages,
  RoomMessage,
  sendRoomMessage,
  supabase,
} from '../lib/supabase';

const CHAT_COOLDOWN_MS = 1000;

interface RoomChatProps {
  roomCode: string;
  username: string;
  onRequestUsername?: () => void;
  inMobileTab?: boolean;
}

function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function RoomChat({
  roomCode,
  username,
  onRequestUsername,
  inMobileTab = false,
}: RoomChatProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const lastMessageSentAtRef = useRef<number>(0);

  // Scroll smoothly to the newest message at the bottom
  const scrollToBottom = (smooth = true) => {
    const container = listRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // Load message history and subscribe to new messages for this room only
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg('');

    fetchRoomMessages(roomCode).then(({ messages: initial, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) {
        setErrorMsg('Could not load chat messages.');
        return;
      }
      setMessages(initial);
      window.requestAnimationFrame(() => scrollToBottom(false));
    });

    const channel = supabase
      .channel(`chat:${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const incoming = payload.new as RoomMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) {
              return prev;
            }
            return [...prev, incoming];
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [roomCode]);

  // Auto-scroll whenever a new message arrives
  useEffect(() => {
    if (!loading) {
      scrollToBottom(true);
    }
  }, [messages.length, loading]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || sending) return;

    if (!username) {
      onRequestUsername?.();
      return;
    }

    // Limit each person to one chat message per second
    const now = Date.now();
    if (now - lastMessageSentAtRef.current < CHAT_COOLDOWN_MS) {
      setErrorMsg('Slow down a little');
      return;
    }

    const clipped = trimmed.slice(0, CHAT_MESSAGE_MAX_LENGTH);
    lastMessageSentAtRef.current = now;
    setSending(true);
    setErrorMsg('');
    setMessageText('');

    const { message, error } = await sendRoomMessage({
      roomCode,
      senderName: username,
      body: clipped,
    });

    setSending(false);

    if (error || !message) {
      setErrorMsg(error ?? 'Could not send your message. Please try again.');
      setMessageText(clipped);
      return;
    }

    // Add immediately (Realtime INSERT deduplicates by id)
    setMessages((prev) =>
      prev.some((m) => m.id === message.id) ? prev : [...prev, message]
    );
  };

  return (
    <aside
      aria-label="Room chat"
      className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111116] ${
        inMobileTab ? 'h-[380px]' : 'h-[380px] lg:h-[460px]'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-white">
          Room Chat
        </h2>
        {username && (
          <span className="truncate text-xs text-zinc-400">
            Chatting as <span className="font-medium text-[#E50914]">@{username}</span>
          </span>
        )}
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
        {loading ? (
          <p className="text-xs text-zinc-400">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs leading-relaxed text-zinc-400">
            No messages yet. Say hello to everyone in the room.
          </p>
        ) : (
          messages.map((msg) => {
            const isSelf = Boolean(username && msg.sender_name === username);
            return (
              <div key={msg.id} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      isSelf ? 'text-[#E50914]' : 'text-zinc-200'
                    }`}
                  >
                    {msg.sender_name}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums shrink-0">
                    {formatMessageTime(msg.created_at)}
                  </span>
                </div>
                <p className="break-words text-sm leading-snug text-zinc-300">
                  {msg.body}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-white/10 bg-[#181820] p-3">
        {!username ? (
          <button
            type="button"
            onClick={onRequestUsername}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E50914] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
          >
            <AtSign className="h-4 w-4" aria-hidden="true" />
            <span>Choose your username to chat</span>
          </button>
        ) : (
          <>
            {errorMsg && (
              <p className="mb-2 text-xs text-[#F87171]" role="alert">
                {errorMsg}
              </p>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value.slice(0, CHAT_MESSAGE_MAX_LENGTH))}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                placeholder="Write a message..."
                aria-label="Chat message"
                className="min-w-0 flex-1 min-h-[44px] rounded-lg border border-white/15 bg-[#08080A] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none focus:ring-1 focus:ring-[#E50914]"
              />
              <button
                type="submit"
                disabled={!messageText.trim() || sending}
                aria-label="Send message"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#E50914] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] disabled:opacity-50 shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>Send</span>
              </button>
            </form>

            {messageText.length >= 240 && (
              <p className="mt-1.5 text-right font-mono text-[11px] text-zinc-400 tabular-nums">
                {messageText.length}/{CHAT_MESSAGE_MAX_LENGTH}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
