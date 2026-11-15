import {
  Clock,
  Clapperboard,
  Drama,
  Film,
  Flame,
  Ghost,
  Globe,
  Heart,
  Laugh,
  Rocket,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { LegalCatalogState, TRUSTED_GENRE_DEFINITIONS } from '../lib/legalSources';

const SLUG_ICON_MAP: Record<string, typeof Film> = {
  nollywood: Film,
  action: Flame,
  thriller: Zap,
  comedy: Laugh,
  drama: Drama,
  romance: Heart,
  horror: Ghost,
  'sci-fi': Rocket,
  family: Users,
  'official-channels': Clapperboard,
  'our-picks': Sparkles,
  'creative-commons': Globe,
  'archive-new': Clock,
  'archive-classics': Film,
};

export interface CategoryJumpTarget {
  slug: string;
  name: string;
}

interface CategoryTilesProps {
  catalog: LegalCatalogState;
  onSelectGenre: (genre: CategoryJumpTarget) => void;
}

export function CategoryTiles({ catalog, onSelectGenre }: CategoryTilesProps) {
  const categories: Array<{ slug: string; name: string; icon: typeof Film }> = [];

  for (const genre of TRUSTED_GENRE_DEFINITIONS) {
    if ((catalog.trustedByGenre[genre.slug]?.length ?? 0) > 0) {
      categories.push({
        slug: genre.slug,
        name: genre.name,
        icon: SLUG_ICON_MAP[genre.slug] ?? Film,
      });
    }
  }

  if (catalog.ourPicks.length > 0) {
    categories.push({
      slug: 'our-picks',
      name: 'Our picks',
      icon: SLUG_ICON_MAP['our-picks'],
    });
  }

  if (catalog.creativeCommons.length > 0) {
    categories.push({
      slug: 'creative-commons',
      name: 'Creative Commons',
      icon: SLUG_ICON_MAP['creative-commons'],
    });
  }

  if (catalog.archiveNew.length > 0) {
    categories.push({
      slug: 'archive-new',
      name: 'Recently added',
      icon: SLUG_ICON_MAP['archive-new'],
    });
  }

  if (catalog.archiveClassics.length > 0) {
    categories.push({
      slug: 'archive-classics',
      name: 'Classics',
      icon: SLUG_ICON_MAP['archive-classics'],
    });
  }

  if (categories.length === 0) return null;

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
        <span className="text-xs text-[#b9aa98]">Jump to a row</span>
      </div>

      {/* Flat solid cards: 2 columns on phones, 4 to 6 columns on laptops */}
      <div className="mt-3.5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {categories.map((category) => {
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
