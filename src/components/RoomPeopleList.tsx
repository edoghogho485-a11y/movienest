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
      className={`flex flex-col overflow-hidden rounded-[20px] border border-[#3a322a] bg-[#1e1a16] ${
        compact ? '' : 'h-[380px] lg:h-auto'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#3a322a] px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
          <h2 className="text-sm font-bold text-[#f4ece1]">
            Who&apos;s Here
          </h2>
        </div>
        <span className="font-mono text-xs font-medium text-[#b9aa98] tabular-nums">
          {safeParticipants.length}
        </span>
      </div>

      <ul
        className={`divide-y divide-[#3a322a]/60 overflow-y-auto px-4 py-1 ${
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
                      ? 'bg-[#f2a33a] text-[#1a1208]'
                      : 'border border-[#3a322a] bg-[#14110f] text-[#f4ece1]'
                  }`}
                >
                  {initial}
                </span>
                <span className="truncate text-sm font-medium text-[#f4ece1]">
                  {displayName}
                  {person.isSelf && (
                    <span className="ml-1.5 text-xs font-normal text-[#b9aa98]">(you)</span>
                  )}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2 text-xs">
                {person.independentMode && (
                  <span className="text-[11px] font-medium text-[#b9aa98]">
                    Own pace
                  </span>
                )}
                {person.isHost && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#f2a33a]">
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
