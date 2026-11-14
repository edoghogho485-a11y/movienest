import { ArrowLeft, Check, Lock, Moon, Share2, Sun } from 'lucide-react';
import { MovieNestLogo } from './MovieNestLogo';

interface RoomTopBarProps {
  roomName: string;
  roomCode: string;
  isLocked: boolean;
  syncStatus: 'connecting' | 'synced' | 'reconnecting';
  dimLights: boolean;
  copied: boolean;
  onBack: () => void;
  onToggleDimLights: () => void;
  onCopyCode: () => void;
  onInvite: () => void;
}

// Slim room header row: two-triangle logo, room name, code (NEST-XXXXXX), Dim the lights, Invite
export function RoomTopBar({
  roomName,
  roomCode,
  isLocked,
  syncStatus,
  dimLights,
  copied,
  onBack,
  onToggleDimLights,
  onCopyCode,
  onInvite,
}: RoomTopBarProps) {
  return (
    <header className="flex items-center justify-between gap-2 min-w-0">
      {/* Left: Back + two-triangle logo, room name, and code */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to MovieNest"
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-2.5 sm:px-3 text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-[#b9aa98]" aria-hidden="true" />
          <MovieNestLogo compact hideWordmarkOnMobile />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="truncate text-sm sm:text-base font-bold text-[#f4ece1]">
              {roomName}
            </h1>
            {isLocked && (
              <Lock
                className="h-3.5 w-3.5 shrink-0 text-[#f2a33a]"
                aria-label="Room is locked"
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs leading-tight min-w-0">
            <button
              type="button"
              onClick={onCopyCode}
              title="Copy invite link"
              aria-label={`Room code ${roomCode}. Tap to copy invite link`}
              className="inline-flex items-center gap-1 font-mono text-xs font-bold tracking-wider text-[#f2a33a] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{roomCode}</span>
              {copied && <Check className="h-3 w-3" aria-hidden="true" />}
            </button>
            <span className="text-[#3a322a] shrink-0" aria-hidden="true">
              ·
            </span>
            <span className="text-[#b9aa98] truncate">
              {syncStatus === 'synced'
                ? 'Synced'
                : syncStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Connecting'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Dim the lights (or Lights on) and Invite */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onToggleDimLights}
          aria-pressed={dimLights}
          aria-label={dimLights ? 'Lights on' : 'Dim the lights'}
          className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-3 sm:px-4 text-xs sm:text-sm font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          {dimLights ? (
            <>
              <Sun className="h-4 w-4 text-[#f2a33a] shrink-0" aria-hidden="true" />
              <span>Lights on</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4 text-[#b9aa98] shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Dim the lights</span>
              <span className="sm:hidden">Dim</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onInvite}
          className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-3.5 sm:px-4 text-xs sm:text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
        >
          <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Invite</span>
        </button>
      </div>
    </header>
  );
}
