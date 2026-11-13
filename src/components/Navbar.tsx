interface NavbarProps {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onHomeClick?: () => void;
}

export function Navbar({ onCreateRoom, onJoinRoom, onHomeClick }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07090F]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          onClick={(e) => {
            if (onHomeClick) {
              e.preventDefault();
              onHomeClick();
            }
          }}
          className="font-display text-xl font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-md px-1 -ml-1"
        >
          Movie<span className="text-amber-400">Nest</span>
        </a>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onJoinRoom}
            className="min-h-[44px] sm:min-h-[40px] rounded-lg border border-white/15 bg-transparent px-3.5 sm:px-4 py-2 text-sm font-medium text-slate-100 whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/30 hover:bg-white/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
          >
            Join Room
          </button>
          <button
            type="button"
            onClick={onCreateRoom}
            className="min-h-[44px] sm:min-h-[40px] rounded-lg bg-amber-500 px-3.5 sm:px-4 py-2 text-sm font-semibold text-slate-950 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-amber-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090F] cursor-pointer"
          >
            Create Room
          </button>
        </div>
      </div>
    </header>
  );
}
