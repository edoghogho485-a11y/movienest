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
import { ARCHIVE_GENRE_LIST } from '../lib/archive';
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

const ARCHIVE_ICON_MAP: Record<string, typeof Film> = {
  'classic-movies': Film,
  'sci-fi-classics': Rocket,
  'horror-classics': Ghost,
  'comedy-classics': Laugh,
  cartoons: Clapperboard,
};

export interface CategoryJumpTarget {
  slug: string;
  name: string;
}

interface CategoryTilesProps {
  onSelectGenre: (genre: CategoryJumpTarget) => void;
}

export function CategoryTiles({ onSelectGenre }: CategoryTilesProps) {
  const allCategories: Array<{ slug: string; name: string; icon: typeof Film; badge?: string }> = [
    ...GENRE_LIST.map((g: GenreDefinition) => ({
      slug: g.slug,
      name: g.name,
      icon: ICON_MAP[g.icon],
    })),
    ...ARCHIVE_GENRE_LIST.map((g) => ({
      slug: g.slug,
      name: g.name,
      icon: ARCHIVE_ICON_MAP[g.slug] ?? Film,
      badge: 'Archive',
    })),
  ];

  return (
    <section
      aria-labelledby="browse-by-category-heading"
      className="px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="browse-by-category-heading"
          className="text-lg font-bold tracking-tight text-[#f4ece1] sm:text-xl"
        >
          Browse by Category
        </h2>
        <span className="text-xs text-[#b9aa98]">Jump to a genre</span>
      </div>

      {/* Flat solid cards: 2 columns on phones, 4 to 6 columns on laptops */}
      <div className="mt-3.5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {allCategories.map((category) => {
          const Icon = category.icon;
          return (
            <button
              key={category.slug}
              type="button"
              onClick={() => onSelectGenre({ slug: category.slug, name: category.name })}
              className="flex h-16 min-h-[44px] w-full items-center gap-3 rounded-2xl border border-[#3a322a] bg-[#1e1a16] px-3 text-left transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#14110f] text-[#f2a33a]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-xs sm:text-sm font-medium text-[#f4ece1] line-clamp-2 leading-tight">
                {category.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
