import {
  Clapperboard,
  Compass,
  Drama,
  Droplets,
  Film,
  Flame,
  Ghost,
  Globe,
  Heart,
  Laugh,
  Rocket,
  Shield,
  Sparkles,
  Users,
  Wand2,
  Zap,
} from 'lucide-react';
import { GENRE_LIST, GenreDefinition, GenreIconKey } from '../data/genres';

const ICON_MAP: Record<GenreIconKey, typeof Film> = {
  film: Film,
  sparkles: Sparkles,
  laugh: Laugh,
  heart: Heart,
  flame: Flame,
  drama: Drama,
  droplets: Droplets,
  rocket: Rocket,
  ghost: Ghost,
  zap: Zap,
  shield: Shield,
  wand: Wand2,
  compass: Compass,
  users: Users,
  clapperboard: Clapperboard,
  globe: Globe,
};

interface CategoryTilesProps {
  onSelectGenre: (genre: GenreDefinition) => void;
}

export function CategoryTiles({ onSelectGenre }: CategoryTilesProps) {
  return (
    <section
      aria-labelledby="browse-by-category-heading"
      className="px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="browse-by-category-heading"
          className="font-display text-lg font-semibold tracking-tight text-white sm:text-xl"
        >
          Browse by Category
        </h2>
        <span className="text-xs text-zinc-400">Jump to a genre</span>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {GENRE_LIST.map((genre) => {
          const Icon = ICON_MAP[genre.icon];
          return (
            <button
              key={genre.slug}
              type="button"
              onClick={() => onSelectGenre(genre)}
              className="group flex min-h-[48px] items-center gap-2.5 rounded-xl border border-white/10 bg-[#111116] px-3 py-2.5 text-left transition-all hover:border-[#E50914]/50 hover:bg-[#181820] hover:shadow-[0_0_18px_rgba(229,9,20,0.14)] cursor-pointer"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A1A24] text-[#E50914] transition-colors group-hover:bg-[#E50914] group-hover:text-white">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="text-xs sm:text-sm font-medium text-zinc-100 line-clamp-1">
                {genre.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
