import { Crown, Users } from 'lucide-react';

export interface RoomParticipant {
  clientId: string;
  name: string;
  isHost: boolean;
  isSelf: boolean;
  independentMode?: boolean;
  joinedAt: string;
}

interface RoomPeopleListProps {
  participants: RoomParticipant[];
  compact?: boolean;
}

export function RoomPeopleList({ participants, compact = false }: RoomPeopleListProps) {
  const safeParticipants = Array.isArray(participants) ? participants : [];

  // Sort host first, then current viewer, then alphabetically by name
  const sorted = [...safeParticipants].sort((a, b) => {
    if (Boolean(a?.isHost) !== Boolean(b?.isHost)) return a?.isHost ? -1 : 1;
    if (Boolean(a?.isSelf) !== Boolean(b?.isSelf)) return a?.isSelf ? -1 : 1;
    const nameA = typeof a?.name === 'string' ? a.name : '';
    const nameB = typeof b?.name === 'string' ? b.name : '';
    return nameA.localeCompare(nameB);
  });

  return (
    <section
      aria-label="People in this room"
      className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111116] ${
        compact ? '' : 'h-[380px] lg:h-auto'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#E50914]" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-white">
            Who&apos;s Here
          </h2>
        </div>
        <span className="rounded-md border border-[#2a2a33] bg-[#181820] px-2 py-0.5 font-mono text-xs text-zinc-200 tabular-nums">
          {safeParticipants.length}
        </span>
      </div>

      <ul
        className={`divide-y divide-white/5 overflow-y-auto px-4 py-1 ${
          compact ? 'max-h-44' : 'flex-1'
        }`}
      >
        {sorted.map((person) => {
          const displayName =
            typeof person?.name === 'string' && person.name.trim()
              ? person.name.trim()
              : 'Guest';
          const initial = (displayName.charAt(0) || 'G').toUpperCase();
          return (
            <li
              key={person.clientId}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    person.isHost
                      ? 'bg-[#E50914] text-white'
                      : 'border border-[#2a2a33] bg-[#1b1b24] text-zinc-200'
                  }`}
                >
                  {initial}
                </span>
                <span className="truncate text-sm font-medium text-zinc-100">
                  {displayName}
                  {person.isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>
                  )}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {person.independentMode && (
                  <span className="inline-flex items-center rounded-md border border-white/15 bg-[#1b1b24] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
                    Own pace
                  </span>
                )}
                {person.isHost && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[#E50914]/40 bg-[#1b1013] px-2 py-0.5 text-[11px] font-semibold text-[#E50914]">
                    <Crown className="h-3 w-3" aria-hidden="true" />
                    <span>Host</span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
