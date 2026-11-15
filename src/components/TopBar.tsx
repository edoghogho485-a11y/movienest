import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AtSign,
  ChevronDown,
  Plus,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { UserProfile } from '../lib/supabase';
import { MovieNestLogo } from './MovieNestLogo';

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
    <header className="sticky top-0 z-30 border-b border-[#3a322a] bg-[#14110f]">
      <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Brand logo (always visible in TopBar, compact sizing on 360px phones) */}
        <button
          type="button"
          onClick={onHomeClick}
          aria-label="MovieNest home"
          className="inline-flex min-h-[44px] items-center rounded-full px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 cursor-pointer shrink-0"
        >
          <MovieNestLogo compact />
        </button>

        {/* Desktop & tablet search box (hidden on phones, expands via search icon button) */}
        <form
          onSubmit={handleSubmit}
          className="hidden md:flex flex-1 max-w-md items-center gap-2 mx-2"
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b9aa98]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search movies..."
              aria-label="Search movies"
              className="w-full min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] pl-10 pr-10 py-2 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
            />
            {(input || searchQuery) && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#b9aa98] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!input.trim() || searching}
            className="min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-xs font-medium text-[#f4ece1] whitespace-nowrap shrink-0 transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-50 cursor-pointer"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Right actions: phone search toggle, Join room outline pill, Start a room amber pill, profile */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((prev) => !prev)}
            aria-label="Toggle movie search"
            aria-expanded={mobileSearchOpen}
            className="flex h-11 w-11 min-h-[44px] items-center justify-center rounded-full border border-[#3a322a] bg-[#1e1a16] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] md:hidden cursor-pointer"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onJoinRoom}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-[#f4ece1] whitespace-nowrap shrink-0 transition-colors hover:border-[#f2a33a] hover:bg-[#1e1a16] active:bg-[#2a241e] cursor-pointer"
          >
            <Users className="h-3.5 w-3.5 text-[#b9aa98] hidden sm:block" aria-hidden="true" />
            <span className="sm:hidden">Join</span>
            <span className="hidden sm:inline">Join room</span>
          </button>

          <button
            type="button"
            onClick={onCreateRoom}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#1a1208] whitespace-nowrap shrink-0 transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Start a room</span>
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
                  className="inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-2 sm:px-3 py-1.5 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f2a33a] text-[11px] font-bold text-[#1a1208]">
                    {initial}
                  </span>
                  <span className="hidden sm:inline max-w-[110px] truncate text-[#f4ece1]">
                    @{userProfile.username}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#b9aa98] hidden sm:block" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenClaimUsername}
                  aria-label="Set username"
                  className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                >
                  <User className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                  <span className="hidden sm:inline">Set username</span>
                </button>
              )}

              {profileOpen && userProfile && (
                <div
                  role="menu"
                  aria-label="Username profile menu"
                  className="absolute right-0 mt-2 w-64 rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-4 z-40"
                >
                  <div className="flex items-center gap-2.5 border-b border-[#3a322a] pb-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2a33a] text-sm font-bold text-[#1a1208]">
                      {initial}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-[#b9aa98]">Signed in as</p>
                      <p className="truncate font-mono text-sm font-bold text-[#f4ece1]">
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
                      className="flex w-full min-h-[44px] items-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-3.5 py-2 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <AtSign className="h-3.5 w-3.5 text-[#f2a33a]" aria-hidden="true" />
                      <span>Change username</span>
                    </button>

                    {hasUsedChange && (
                      <p className="text-[11px] leading-snug text-[#b9aa98]">
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
      {mobileSearchOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-[#3a322a] bg-[#14110f] px-3 py-2.5 md:hidden"
        >
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search movies..."
            aria-label="Search movies"
            autoFocus
            className="min-w-0 flex-1 min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || searching}
            className="min-h-[44px] rounded-full bg-[#f2a33a] px-4 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap shrink-0 active:bg-[#d6861f] disabled:opacity-50 cursor-pointer"
          >
            {searching ? '...' : 'Search'}
          </button>
        </form>
      )}
    </header>
  );
}
