import { Crown, Users } from 'lucide-react';

export interface RoomParticipant {
  clientId: string;
  name: string;
  isHost: boolean;
  isSelf: boolean;
  joinedAt: string;
}

interface RoomPeopleListProps {
  participants: RoomParticipant[];
  compact?: boolean;
}

export function RoomPeopleList({ participants, compact = false }: RoomPeopleListProps) {
  // Sort host first, then current viewer, then alphabetically by name
  const sorted = [...participants].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
    return a.name.localeCompare(b.name);
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
          {participants.length}
        </span>
      </div>

      <ul
        className={`divide-y divide-white/5 overflow-y-auto px-4 py-1 ${
          compact ? 'max-h-44' : 'flex-1'
        }`}
      >
        {sorted.map((person) => {
          const initial = (person.name.trim().charAt(0) || 'G').toUpperCase();
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
                  {person.name}
                  {person.isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">(you)</span>
                  )}
                </span>
              </div>

              {person.isHost && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#E50914]/40 bg-[#1b1013] px-2 py-0.5 text-[11px] font-semibold text-[#E50914]">
                  <Crown className="h-3 w-3" aria-hidden="true" />
                  <span>Host</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
