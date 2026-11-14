import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AtSign,
  ChevronDown,
  Clapperboard,
  Plus,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { UserProfile } from '../lib/supabase';
import { hasYouTubeApiKey } from '../lib/youtube';

interface TopBarProps {
  searchQuery: string;
  searching: boolean;
  userProfile: UserProfile | null;
  usernameLoading: boolean;
  onSearchSubmit: (query: string) => void;
  onClearSearch: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onHomeClick: () => void;
  onOpenClaimUsername: () => void;
  onOpenChangeUsername: () => void;
}

export function TopBar({
  searchQuery,
  searching,
  userProfile,
  usernameLoading,
  onSearchSubmit,
  onClearSearch,
  onCreateRoom,
  onJoinRoom,
  onHomeClick,
  onOpenClaimUsername,
  onOpenChangeUsername,
}: TopBarProps) {
  const [input, setInput] = useState(searchQuery);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = input.trim();
    if (!cleaned) return;
    onSearchSubmit(cleaned);
    setMobileSearchOpen(false);
  };

  const handleClear = () => {
    setInput('');
    onClearSearch();
  };

  const initial = userProfile?.username.charAt(0).toUpperCase() ?? '';
  const hasUsedChange = (userProfile?.changes ?? 0) >= 1;

  return (
    <header className="sticky top-0 z-30 border-b border-[#2a2a33] bg-[#0A0A0E]">
      <div className="flex h-14 lg:h-16 items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Phone logo (hidden on laptop because Sidebar renders the brand) */}
        <button
          type="button"
          onClick={onHomeClick}
          className="flex items-center gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50914] active:opacity-75 lg:hidden cursor-pointer shrink-0"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#E50914]">
            <Clapperboard className="h-3.5 w-3.5 text-white" aria-hidden="true" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
            Movie<span className="text-[#E50914]">Nest</span>
          </span>
        </button>

        {/* Desktop & tablet search bar (hidden when VITE_YOUTUBE_API_KEY is missing) */}
        {hasYouTubeApiKey ? (
          <form
            onSubmit={handleSubmit}
            className="hidden md:flex flex-1 max-w-md items-center gap-2"
          >
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search full movies on YouTube..."
                aria-label="Search full movies on YouTube"
                className="w-full min-h-[40px] rounded-lg border border-white/10 bg-[#111116] pl-9 pr-8 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none focus:ring-1 focus:ring-[#E50914]"
              />
              {(input || searchQuery) && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:text-white active:bg-white/10 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || searching}
              className="min-h-[40px] rounded-lg border border-white/15 bg-[#14141B] px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:border-white/30 active:bg-[#252530] disabled:opacity-50 cursor-pointer"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
        ) : (
          <div className="hidden lg:block flex-1" />
        )}

        {/* Right actions: mobile search toggle, Join / Create Room, and Profile Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          {hasYouTubeApiKey && (
            <button
              type="button"
              onClick={() => setMobileSearchOpen((prev) => !prev)}
              aria-label="Toggle movie search"
              aria-expanded={mobileSearchOpen}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2a2a33] bg-[#14141a] text-zinc-200 transition-colors hover:text-white active:bg-[#252530] md:hidden cursor-pointer"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={onJoinRoom}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#14141a] px-2.5 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors hover:border-white/30 hover:bg-[#1b1b24] active:bg-[#252530] cursor-pointer"
          >
            <Users className="h-3.5 w-3.5 text-zinc-300 hidden sm:block" aria-hidden="true" />
            <span>Join Room</span>
          </button>

          <button
            type="button"
            onClick={onCreateRoom}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-[#E50914] px-2.5 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Create Room</span>
          </button>

          {/* Profile / Username Menu */}
          {!usernameLoading && (
            <div ref={profileMenuRef} className="relative">
              {userProfile ? (
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                  aria-label={`Profile menu for @${userProfile.username}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#14141a] px-2 sm:px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E50914] text-[11px] font-bold text-white">
                    {initial}
                  </span>
                  <span className="hidden sm:inline max-w-[110px] truncate text-zinc-100">
                    @{userProfile.username}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenClaimUsername}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#14141a] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-[#E50914] hover:text-white active:bg-[#252530] cursor-pointer"
                >
                  <User className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
                  <span className="hidden sm:inline">Set username</span>
                </button>
              )}

              {profileOpen && userProfile && (
                <div
                  role="menu"
                  aria-label="Username profile menu"
                  className="absolute right-0 mt-2 w-64 rounded-xl border border-[#2a2a33] bg-[#14141a] p-3.5 shadow-2xl z-40"
                >
                  <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E50914] text-sm font-bold text-white">
                      {initial}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-400">Signed in as</p>
                      <p className="truncate font-mono text-sm font-semibold text-white">
                        @{userProfile.username}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={hasUsedChange}
                      onClick={() => {
                        if (hasUsedChange) return;
                        setProfileOpen(false);
                        onOpenChangeUsername();
                      }}
                      className="flex w-full min-h-[40px] items-center gap-2 rounded-lg border border-[#2a2a33] bg-[#181820] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-[#E50914] active:bg-[#252530] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <AtSign className="h-3.5 w-3.5 text-[#E50914]" aria-hidden="true" />
                      <span>Change username</span>
                    </button>

                    {hasUsedChange && (
                      <p className="text-[11px] leading-snug text-zinc-400">
                        You&apos;ve already used your one username change
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expandable search row for phones */}
      {hasYouTubeApiKey && mobileSearchOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-[#2a2a33] bg-[#0A0A0E] px-4 py-2.5 md:hidden"
        >
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search full movies on YouTube..."
            aria-label="Search full movies on YouTube"
            autoFocus
            className="min-w-0 flex-1 min-h-[40px] rounded-lg border border-[#2a2a33] bg-[#14141a] px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || searching}
            className="min-h-[40px] rounded-lg bg-[#E50914] px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 active:bg-[#b80710] disabled:opacity-50 cursor-pointer"
          >
            {searching ? '...' : 'Go'}
          </button>
        </form>
      )}
    </header>
  );
}
