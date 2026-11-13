import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import {
  fetchRoomMessages,
  RoomMessage,
  sendRoomMessage,
  supabase,
} from '../lib/supabase';

const DISPLAY_NAME_STORAGE_KEY = 'movienest_display_name';
const MAX_MESSAGE_LENGTH = 300;

interface RoomChatProps {
  roomCode: string;
}

function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function RoomChat({ roomCode }: RoomChatProps) {
  // Remember the viewer's display name on this device
  const [displayName, setDisplayName] = useState<string>(() => {
    try {
      return localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)?.trim() ?? '';
    } catch {
      return '';
    }
  });
  const [nameInput, setNameInput] = useState('');

  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const listRef = useRef<HTMLDivElement>(null);

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
      // Jump to bottom once initial messages render
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
          // Deduplicate by message id so optimistic inserts never appear twice
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

  const handleSaveName = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.trim().slice(0, 40);
    if (!cleaned) return;
    try {
      localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, cleaned);
    } catch {
      // Ignore storage quota errors
    }
    setDisplayName(cleaned);
    setNameInput('');
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || !displayName || sending) return;

    const clipped = trimmed.slice(0, MAX_MESSAGE_LENGTH);
    setSending(true);
    setErrorMsg('');
    setMessageText('');

    const { message, error } = await sendRoomMessage({
      roomCode,
      senderName: displayName,
      body: clipped,
    });

    setSending(false);

    if (error || !message) {
      setErrorMsg('Message failed to send. Please try again.');
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
      className="flex h-[380px] lg:h-full lg:min-h-[460px] lg:max-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0D121F]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-slate-100">
          Room Chat
        </h2>
        {displayName && (
          <span className="truncate text-xs text-slate-400">
            Chatting as <span className="font-medium text-amber-400">{displayName}</span>
          </span>
        )}
      </div>

      {!displayName ? (
        <div className="flex flex-1 flex-col justify-center p-5">
          <p className="font-display text-base font-semibold text-slate-100">
            Pick a display name
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Friends in this room will see this name next to your messages. Remembered on this
            device.
          </p>
          <form onSubmit={handleSaveName} className="mt-4 space-y-3">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={40}
              placeholder="Your name..."
              aria-label="Display name"
              className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#111625] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="w-full min-h-[44px] rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              Join Chat
            </button>
          </form>
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5"
          >
            {loading ? (
              <p className="text-xs text-slate-400">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-xs leading-relaxed text-slate-400">
                No messages yet. Say hello to everyone in the room.
              </p>
            ) : (
              messages.map((msg) => {
                const isSelf = msg.sender_name === displayName;
                return (
                  <div key={msg.id} className="space-y-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          isSelf ? 'text-amber-400' : 'text-slate-200'
                        }`}
                      >
                        {msg.sender_name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                        {formatMessageTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="break-words text-sm leading-snug text-slate-300">
                      {msg.body}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-white/10 bg-[#111625] p-3">
            {errorMsg && (
              <p className="mb-2 text-xs text-amber-400" role="alert">
                {errorMsg}
              </p>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="Write a message..."
                aria-label="Chat message"
                className="min-w-0 flex-1 min-h-[44px] rounded-lg border border-white/15 bg-[#07090F] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <button
                type="submit"
                disabled={!messageText.trim() || sending}
                aria-label="Send message"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50 shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>Send</span>
              </button>
            </form>

            {messageText.length >= 240 && (
              <p className="mt-1.5 text-right font-mono text-[11px] text-slate-400 tabular-nums">
                {messageText.length}/{MAX_MESSAGE_LENGTH}
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
