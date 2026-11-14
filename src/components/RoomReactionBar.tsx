export const ROOM_REACTION_EMOJIS = ['❤️', '😂', '😭', '😡', '😮', '🔥'] as const;

interface RoomReactionBarProps {
  onSendReaction: (emoji: string) => void;
  reactionNote?: string | null;
  compactOverlay?: boolean;
  className?: string;
}

// Row of emoji reaction buttons (horizontally scrollable on phones, compact video overlay in landscape)
export function RoomReactionBar({
  onSendReaction,
  reactionNote = null,
  compactOverlay = false,
  className = '',
}: RoomReactionBarProps) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <div
        role="group"
        aria-label="Send a reaction to the room"
        className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar ${
          compactOverlay
            ? 'rounded-full border border-[#3a322a] bg-[#14110f]/90 p-1'
            : ''
        }`}
      >
        {ROOM_REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSendReaction(emoji)}
            aria-label={`React with ${emoji}`}
            className={`inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer ${
              compactOverlay
                ? 'bg-[#1e1a16] text-base'
                : 'bg-[#1e1a16] text-lg'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {reactionNote && (
        <span className="text-xs font-medium text-[#b9aa98] whitespace-nowrap" role="status">
          {reactionNote}
        </span>
      )}
    </div>
  );
}
