import { FormEvent, useEffect, useRef, useState } from 'react';
import { AtSign, Send, X } from 'lucide-react';
import { CHAT_MESSAGE_MAX_LENGTH, RoomMessage } from '../lib/supabase';

const CHAT_COOLDOWN_MS = 1000;

interface RoomChatProps {
  messages: RoomMessage[];
  loading: boolean;
  loadError?: string;
  username: string;
  onSendMessage: (body: string) => Promise<{ ok: boolean; error: string | null }>;
  onRequestUsername?: () => void;
  fillHeight?: boolean;
  onCloseDrawer?: () => void;
  className?: string;
}

function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function RoomChat({
  messages,
  loading,
  loadError = '',
  username,
  onSendMessage,
  onRequestUsername,
  fillHeight = false,
  onCloseDrawer,
  className = '',
}: RoomChatProps) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const safeUsername = typeof username === 'string' ? username.trim() : '';

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

  // Auto-scroll when message history loads or a new message arrives
  useEffect(() => {
    if (!loading) {
      window.requestAnimationFrame(() => scrollToBottom(safeMessages.length > 0));
    }
  }, [safeMessages.length, loading]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || sending) return;

    if (!safeUsername) {
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

    const { ok, error } = await onSendMessage(clipped);
    setSending(false);

    if (!ok) {
      setErrorMsg(error ?? 'Could not send your message. Please try again.');
      setMessageText(clipped);
    }
  };

  const displayedError = errorMsg || loadError;

  return (
    <aside
      aria-label="Room chat"
      className={`flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-[#3a322a] bg-[#1e1a16] ${
        fillHeight ? 'h-full' : 'h-[420px]'
      } ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#3a322a] px-4 py-2.5">
        <h2 className="text-sm font-bold text-[#f4ece1]">
          Room chat
        </h2>

        <div className="flex items-center gap-2 min-w-0">
          {safeUsername && (
            <span className="truncate text-xs text-[#b9aa98]">
              <span className="font-bold text-[#f2a33a]">@{safeUsername}</span>
            </span>
          )}
          {onCloseDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close chat"
              className="flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-xs text-[#b9aa98]">Loading messages...</p>
        ) : safeMessages.length === 0 ? (
          <p className="text-xs leading-relaxed text-[#b9aa98]">
            No messages yet. Say hello to everyone in the room.
          </p>
        ) : (
          safeMessages.map((msg) => {
            const isSelf = Boolean(safeUsername && msg.sender_name === safeUsername);
            return (
              <div key={msg.id} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-xs font-bold ${
                      isSelf ? 'text-[#f2a33a]' : 'text-[#f4ece1]'
                    }`}
                  >
                    {msg.sender_name}
                  </span>
                  <span className="font-mono text-[11px] text-[#b9aa98] tabular-nums shrink-0">
                    {formatMessageTime(msg.created_at)}
                  </span>
                </div>
                <p className="break-words text-sm leading-snug text-[#f4ece1]/95">
                  {msg.body}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-[#3a322a] bg-[#14110f] p-2.5 sm:p-3">
        {!safeUsername ? (
          <button
            type="button"
            onClick={onRequestUsername}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-4 py-2 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
          >
            <AtSign className="h-4 w-4" aria-hidden="true" />
            <span>Choose your username to chat</span>
          </button>
        ) : (
          <>
            {displayedError && (
              <p className="mb-2 text-xs font-medium text-[#f2a33a]" role="alert">
                {displayedError}
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
                className="min-w-0 flex-1 min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!messageText.trim() || sending}
                aria-label="Send message"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-4 py-2 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-50 shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>Send</span>
              </button>
            </form>

            {messageText.length >= 240 && (
              <p className="mt-1.5 text-right font-mono text-[11px] text-[#b9aa98] tabular-nums">
                {messageText.length}/{CHAT_MESSAGE_MAX_LENGTH}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
