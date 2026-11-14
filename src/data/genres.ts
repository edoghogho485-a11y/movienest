import { SharedLibraryCategory } from '../lib/supabase';

export type GenreIconKey =
  | 'film'
  | 'sparkles'
  | 'laugh'
  | 'heart'
  | 'flame'
  | 'drama'
  | 'droplets'
  | 'rocket'
  | 'ghost'
  | 'zap'
  | 'shield'
  | 'wand'
  | 'compass'
  | 'users'
  | 'clapperboard'
  | 'globe';

export interface GenreDefinition {
  slug: string;
  name: string;
  query: string;
  icon: GenreIconKey;
  defaultCategory: SharedLibraryCategory;
}

// Ordered list of genres for home page rows and Browse by Category tiles
export const GENRE_LIST: GenreDefinition[] = [
  {
    slug: 'nollywood-movies',
    name: 'Nollywood Movies',
    query: 'full Nollywood movie 2026',
    icon: 'film',
    defaultCategory: 'Nollywood',
  },
  {
    slug: 'new-nollywood',
    name: 'New Nollywood',
    query: 'new Nollywood movie',
    icon: 'sparkles',
    defaultCategory: 'Nollywood',
  },
  {
    slug: 'nollywood-comedy',
    name: 'Nollywood Comedy',
    query: 'full Nollywood comedy movie',
    icon: 'laugh',
    defaultCategory: 'Nollywood',
  },
  {
    slug: 'nollywood-romance',
    name: 'Nollywood Romance',
    query: 'full Nollywood romance movie',
    icon: 'heart',
    defaultCategory: 'Nollywood',
  },
  {
    slug: 'action',
    name: 'Action',
    query: 'full action movie',
    icon: 'flame',
    defaultCategory: 'Movies',
  },
  {
    slug: 'comedy',
    name: 'Comedy',
    query: 'full comedy movie',
    icon: 'laugh',
    defaultCategory: 'Movies',
  },
  {
    slug: 'drama',
    name: 'Drama',
    query: 'full drama movie',
    icon: 'drama',
    defaultCategory: 'Movies',
  },
  {
    slug: 'sad-emotional',
    name: 'Sad & Emotional',
    query: 'full emotional sad drama movie',
    icon: 'droplets',
    defaultCategory: 'Movies',
  },
  {
    slug: 'sci-fi',
    name: 'Sci-Fi',
    query: 'full sci-fi movie',
    icon: 'rocket',
    defaultCategory: 'Movies',
  },
  {
    slug: 'horror',
    name: 'Horror',
    query: 'full horror movie',
    icon: 'ghost',
    defaultCategory: 'Movies',
  },
  {
    slug: 'thriller',
    name: 'Thriller',
    query: 'full thriller movie',
    icon: 'zap',
    defaultCategory: 'Movies',
  },
  {
    slug: 'romance',
    name: 'Romance',
    query: 'full romance movie',
    icon: 'heart',
    defaultCategory: 'Movies',
  },
  {
    slug: 'crime',
    name: 'Crime',
    query: 'full crime movie',
    icon: 'shield',
    defaultCategory: 'Movies',
  },
  {
    slug: 'fantasy',
    name: 'Fantasy',
    query: 'full fantasy movie',
    icon: 'wand',
    defaultCategory: 'Movies',
  },
  {
    slug: 'adventure',
    name: 'Adventure',
    query: 'full adventure movie',
    icon: 'compass',
    defaultCategory: 'Movies',
  },
  {
    slug: 'family',
    name: 'Family',
    query: 'full family movie',
    icon: 'users',
    defaultCategory: 'Movies',
  },
  {
    slug: 'animation',
    name: 'Animation',
    query: 'full animated movie',
    icon: 'clapperboard',
    defaultCategory: 'Animation',
  },
  {
    slug: 'documentary',
    name: 'Documentary',
    query: 'full documentary',
    icon: 'globe',
    defaultCategory: 'Documentary',
  },
];
