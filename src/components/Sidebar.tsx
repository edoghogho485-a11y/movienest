import { Bookmark, Film, Home, Users } from 'lucide-react';

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
      className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:h-screen border-r border-[#3a322a] bg-[#14110f]"
    >
      <div className="flex h-16 items-center border-b border-[#3a322a] px-5">
        <span className="text-xs font-bold uppercase tracking-wider text-[#b9aa98]">
          Browse
        </span>
      </div>

      <nav className="flex-1 space-y-2 px-3 py-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectNav(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full min-h-[44px] items-center gap-3 rounded-full px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                isActive
                  ? 'border border-[#f2a33a] bg-[#1e1a16] font-bold text-[#f4ece1]'
                  : 'border border-transparent font-medium text-[#b9aa98] hover:bg-[#1e1a16] hover:text-[#f4ece1]'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-[#f2a33a]' : 'text-[#b9aa98]'
                }`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[#3a322a] p-4">
        <p className="text-xs leading-relaxed text-[#b9aa98]">
          Watch synced movies with friends or press play on your own.
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
      className="fixed inset-x-0 bottom-0 z-30 grid h-14 grid-cols-4 border-t border-[#3a322a] bg-[#14110f] lg:hidden"
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
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:bg-[#1e1a16] cursor-pointer ${
              isActive ? 'text-[#f4ece1]' : 'text-[#b9aa98] hover:text-[#f4ece1]'
            }`}
          >
            <Icon
              className={`h-4 w-4 ${isActive ? 'text-[#f2a33a]' : 'text-[#b9aa98]'}`}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
