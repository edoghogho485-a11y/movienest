import { Check, Play, X } from 'lucide-react';

interface ReadyCheckPromptProps {
  isHost: boolean;
  hasMarkedReady: boolean;
  readyCount: number;
  totalCount: number;
  secondsRemaining: number;
  onMarkReady: () => void;
  onHostStartNow: () => void;
  onHostCancel: () => void;
}

// Cozy night "Ready?" prompt shown during a host-initiated Ready Check
export function ReadyCheckPrompt({
  isHost,
  hasMarkedReady,
  readyCount,
  totalCount,
  secondsRemaining,
  onMarkReady,
  onHostStartNow,
  onHostCancel,
}: ReadyCheckPromptProps) {
  return (
    <div
      role="dialog"
      aria-label="Ready check"
      className="pointer-events-auto flex flex-col gap-3 rounded-[20px] border border-[#f2a33a] bg-[#1e1a16] p-4 sm:p-5 w-full max-w-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#f4ece1]">Ready?</h2>
          <p className="mt-0.5 font-mono text-xs text-[#b9aa98] tabular-nums">
            {readyCount}/{totalCount} ready · Starting in {secondsRemaining}s
          </p>
        </div>

        {isHost && (
          <button
            type="button"
            onClick={onHostCancel}
            aria-label="Cancel ready check"
            className="flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {!hasMarkedReady ? (
        <button
          type="button"
          onClick={onMarkReady}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
        >
          <Check className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
          <span>I&apos;m ready</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-[#f2a33a]">
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>{isHost ? 'Waiting for everyone...' : "You're ready"}</span>
          </span>

          {isHost && (
            <button
              type="button"
              onClick={onHostStartNow}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-4 py-2 text-xs font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Start now</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
