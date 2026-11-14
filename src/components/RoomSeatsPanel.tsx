import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crown,
  Pause,
  Play,
  RefreshCw,
  Timer,
  Video,
} from 'lucide-react';
import { RoomParticipant } from './RoomPeopleList';

export interface SeatReaction {
  id: string;
  emoji: string;
  sender?: string;
  clientId?: string;
}

interface RoomSeatsPanelProps {
  participants: RoomParticipant[];
  isHost: boolean;
  playerReady: boolean;
  localIsPlaying: boolean;
  ownPace: boolean;
  hostLiveSeconds: number;
  hostAway: boolean;
  syncingToHost: boolean;
  readyClientIds: string[] | null;
  readyCheckActive: boolean;
  countdownActive: boolean;
  embedOrArchiveBlocked: boolean;
  seatReactions: SeatReaction[];
  formatTime: (seconds: number) => string;
  onTogglePlayPause: () => void;
  onSyncEveryoneToMe: () => void;
  onStartTogether: () => void;
  onSyncToHost: () => void;
  onChangeVideo: () => void;
}

interface PositionedSeatReaction {
  id: string;
  emoji: string;
  x: number;
}

// Cozy night seats strip: 1 seat per viewer with floating seat reactions + host/sync action bar
export function RoomSeatsPanel({
  participants,
  isHost,
  playerReady,
  localIsPlaying,
  ownPace,
  hostLiveSeconds,
  hostAway,
  syncingToHost,
  readyClientIds,
  readyCheckActive,
  countdownActive,
  embedOrArchiveBlocked,
  seatReactions,
  formatTime,
  onTogglePlayPause,
  onSyncEveryoneToMe,
  onStartTogether,
  onSyncToHost,
  onChangeVideo,
}: RoomSeatsPanelProps) {
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const sorted = [...safeParticipants].sort((a, b) => {
    if (Boolean(a?.isHost) !== Boolean(b?.isHost)) return a?.isHost ? -1 : 1;
    if (Boolean(a?.isSelf) !== Boolean(b?.isSelf)) return a?.isSelf ? -1 : 1;
    const nameA = typeof a?.name === 'string' ? a.name : '';
    const nameB = typeof b?.name === 'string' ? b.name : '';
    return nameA.localeCompare(nameB);
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRowRef = useRef<HTMLDivElement>(null);
  const seatElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [floatingSeatBadges, setFloatingSeatBadges] = useState<PositionedSeatReaction[]>([]);

  // Position incoming seat reactions directly above the sender's seat circle without horizontal clip
  useEffect(() => {
    if (seatReactions.length === 0) {
      setFloatingSeatBadges([]);
      return;
    }

    const panelEl = panelRef.current;
    if (!panelEl) return;
    const panelRect = panelEl.getBoundingClientRect();

    const mapped: PositionedSeatReaction[] = [];
    for (const reaction of seatReactions) {
      const targetPerson =
        sorted.find((p) => reaction.clientId && p.clientId === reaction.clientId) ??
        sorted.find((p) => reaction.sender && p.name === reaction.sender) ??
        sorted[0];

      if (!targetPerson) continue;
      const seatEl = seatElementRefs.current[targetPerson.clientId];
      if (!seatEl) continue;

      const seatRect = seatEl.getBoundingClientRect();
      const centerX = seatRect.left - panelRect.left + seatRect.width / 2;
      mapped.push({
        id: reaction.id,
        emoji: reaction.emoji,
        x: Math.max(20, Math.min(panelRect.width - 20, centerX)),
      });
    }

    setFloatingSeatBadges(mapped);
  }, [seatReactions, sorted.length]);

  const readySet = new Set(readyClientIds ?? []);

  return (
    <section
      ref={panelRef}
      aria-label="Room seats and playback sync"
      className="relative rounded-[20px] border border-[#3a322a] bg-[#1e1a16] px-3 py-2.5 sm:px-4 sm:py-3"
    >
      {/* Floating reactions anchored above each sender's seat */}
      {floatingSeatBadges.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-4 bottom-0 z-30 overflow-visible"
        >
          {floatingSeatBadges.map((item) => (
            <span
              key={item.id}
              style={{ left: `${item.x}px`, top: '12px' }}
              className="animate-float-seat-reaction absolute text-2xl sm:text-3xl leading-none select-none"
            >
              {item.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Laptop: seats row on the left + host/sync bar on the right. Phone: stacked single row of seats then bar */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        {/* Single horizontal row of seats */}
        <div
          ref={scrollRowRef}
          className="flex min-w-0 flex-1 items-start gap-3 overflow-x-auto pb-0.5 no-scrollbar"
        >
          {sorted.map((person) => {
            const displayName =
              typeof person?.name === 'string' && person.name.trim()
                ? person.name.trim()
                : 'Guest';
            const initial = (displayName.charAt(0) || 'G').toUpperCase();
            const isSeatReady = readyCheckActive && readySet.has(person.clientId);
            const statusText = person.isHost
              ? 'Host'
              : person.independentMode
                ? 'Own pace'
                : 'In sync';

            return (
              <div
                key={person.clientId}
                ref={(el) => {
                  seatElementRefs.current[person.clientId] = el;
                }}
                className="flex w-[64px] shrink-0 flex-col items-center text-center"
              >
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                      person.isHost
                        ? 'bg-[#f2a33a] text-[#1a1208]'
                        : 'border border-[#3a322a] bg-[#14110f] text-[#f4ece1]'
                    }`}
                  >
                    {initial}
                  </span>

                  {isSeatReady && (
                    <span
                      title="Ready"
                      aria-label={`${displayName} is ready`}
                      className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#1e1a16] bg-[#f2a33a] text-[#1a1208]"
                    >
                      <Check className="h-3 w-3 stroke-[3]" aria-hidden="true" />
                    </span>
                  )}
                </div>

                <span className="mt-1 w-full truncate text-xs font-medium text-[#f4ece1]">
                  {person.isSelf ? `${displayName} (you)` : displayName}
                </span>

                <span
                  className={`text-[11px] leading-tight ${
                    person.isHost
                      ? 'font-bold text-[#f2a33a]'
                      : person.independentMode
                        ? 'font-medium text-[#b9aa98]'
                        : 'font-medium text-[#f4ece1]/85'
                  }`}
                >
                  {statusText}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right end on laptop / second row on phone: Host controls OR Non-host "Host is at 42:10" + Sync to host */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#3a322a] pt-2.5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4 shrink-0">
          {isHost ? (
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between sm:justify-start lg:justify-end">
              {!embedOrArchiveBlocked && (
                <button
                  type="button"
                  onClick={onTogglePlayPause}
                  disabled={!playerReady}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-3.5 py-2 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-45 cursor-pointer"
                >
                  {localIsPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5 fill-current text-[#f2a33a]" aria-hidden="true" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current text-[#f2a33a]" aria-hidden="true" />
                      <span>Play</span>
                    </>
                  )}
                </button>
              )}

              {!embedOrArchiveBlocked && (
                <button
                  type="button"
                  onClick={onStartTogether}
                  disabled={!playerReady || countdownActive || readyCheckActive}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-3.5 py-2 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-45 cursor-pointer"
                >
                  <Timer className="h-3.5 w-3.5 text-[#f2a33a]" aria-hidden="true" />
                  <span>Start together</span>
                </button>
              )}

              <button
                type="button"
                onClick={onChangeVideo}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-3.5 py-2 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
              >
                <Video className="h-3.5 w-3.5 text-[#f2a33a]" aria-hidden="true" />
                <span>Change video</span>
              </button>

              {!embedOrArchiveBlocked && (
                <button
                  type="button"
                  onClick={onSyncEveryoneToMe}
                  disabled={!playerReady}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-4 py-2 text-xs sm:text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-45 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Sync everyone to me</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2.5 w-full lg:w-auto">
              <div className="flex items-center gap-2 min-w-0">
                <Crown className="h-3.5 w-3.5 shrink-0 text-[#f2a33a]" aria-hidden="true" />
                <span className="font-mono text-xs font-medium text-[#f4ece1] tabular-nums whitespace-nowrap">
                  Host is at {formatTime(hostLiveSeconds)}
                </span>
                {hostAway && (
                  <span className="text-[11px] text-[#b9aa98] whitespace-nowrap">
                    · Away
                  </span>
                )}
                {ownPace && (
                  <span className="text-[11px] text-[#b9aa98] whitespace-nowrap">
                    · Own pace
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!embedOrArchiveBlocked && (
                  <button
                    type="button"
                    onClick={onTogglePlayPause}
                    disabled={!playerReady}
                    aria-label={localIsPlaying ? 'Pause local player' : 'Play local player'}
                    className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-3.5 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-45 cursor-pointer"
                  >
                    {localIsPlaying ? (
                      <>
                        <Pause className="h-3.5 w-3.5 fill-current text-[#f2a33a]" aria-hidden="true" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current text-[#f2a33a]" aria-hidden="true" />
                        <span>Play</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onSyncToHost}
                  disabled={!playerReady || syncingToHost}
                  className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-4 text-xs sm:text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-45 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 shrink-0 ${syncingToHost ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{syncingToHost ? 'Syncing...' : 'Sync to host'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
