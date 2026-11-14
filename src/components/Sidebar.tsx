import { Bookmark, Clapperboard, Film, Home, Users } from 'lucide-react';

export type NavSection = 'home' | 'movies' | 'watch-party' | 'my-list';

interface NavItem {
  id: NavSection;
  label: string;
  icon: typeof Home;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'watch-party', label: 'Watch Party', icon: Users },
  { id: 'my-list', label: 'My List', icon: Bookmark },
];

interface SidebarProps {
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
}

// Laptop left sidebar navigation
export function Sidebar({ activeNav, onSelectNav }: SidebarProps) {
  return (
    <aside
      aria-label="Primary sidebar navigation"
      className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:h-screen border-r border-white/10 bg-[#0A0A0E]"
    >
      <div className="flex h-16 items-center gap-2.5 border-b border-[#2a2a33] px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E50914]">
          <Clapperboard className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => onSelectNav('home')}
          className="font-display text-lg font-bold tracking-tight text-white cursor-pointer"
        >
          Movie<span className="text-[#E50914]">Nest</span>
        </button>
      </div>

      <nav className="flex-1 space-y-1.5 px-3 py-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectNav(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full min-h-[44px] items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors active:bg-[#20202b] cursor-pointer ${
                isActive
                  ? 'bg-[#E50914]/15 text-white border border-[#E50914]/50'
                  : 'text-zinc-400 border border-transparent hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-[#E50914]' : 'text-zinc-400'
                }`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="text-xs leading-relaxed text-zinc-500">
          Sync YouTube movies with friends on phones and laptops.
        </p>
      </div>
    </aside>
  );
}

// Phone bottom navigation bar
export function MobileBottomNav({ activeNav, onSelectNav }: SidebarProps) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid h-14 grid-cols-4 border-t border-[#2a2a33] bg-[#0A0A0E] lg:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeNav === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectNav(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:bg-[#1a1a24] cursor-pointer ${
              isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon
              className={`h-4 w-4 ${isActive ? 'text-[#E50914]' : 'text-zinc-400'}`}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
