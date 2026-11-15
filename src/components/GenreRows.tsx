import { useState } from 'react';
import { ChevronRight, Film, Share2, Users } from 'lucide-react';
import {
  ARCHIVE_GENRE_LIST,
  ArchiveGenreDefinition,
  ArchiveMovieItem,
} from '../lib/archive';
import { isNewVideo } from '../lib/freshness';
import {
  LegalCatalogState,
  TRUSTED_GENRE_DEFINITIONS,
} from '../lib/legalSources';
import { SharedLibraryItem } from '../lib/supabase';
import { getYouTubeThumbnail, YouTubeSearchResult } from '../lib/youtube';
import { ArchiveMovieCard } from './ArchiveMovieCard';
import { BookmarkButton } from './BookmarkButton';
import { CardActionMenu } from './CardActionMenu';
import { YouTubeMovieCard } from './YouTubeMovieCard';

export interface YouTubeRowMeta {
  slug: string;
  name: string;
  sourceLabel?: string;
}

interface GenreRowsProps {
  catalog: LegalCatalogState;
  catalogLoading: boolean;
  onSeeAllYouTube: (meta: YouTubeRowMeta, videos: YouTubeSearchResult[]) => void;
  onSeeAllArchive: (genre: ArchiveGenreDefinition, movies: ArchiveMovieItem[]) => void;
  onSeeAllOurPicks: (items: SharedLibraryItem[]) => void;
  onWatchYouTube: (video: YouTubeSearchResult) => void;
  onCreateRoomYouTube: (video: YouTubeSearchResult) => void;
  onShareYouTube: (video: YouTubeSearchResult) => void;
  onWatchArchive: (movie: ArchiveMovieItem) => void;
  onCreateRoomArchive: (movie: ArchiveMovieItem) => void;
  onShareArchive: (movie: ArchiveMovieItem) => void;
  onWatchOurPick: (item: SharedLibraryItem) => void;
  onCreateRoomOurPick: (item: SharedLibraryItem) => void;
  onShareOurPick: (item: SharedLibraryItem) => void;
}

// Card for an approved row from the Supabase "library" table ("Our picks")
export function OurPickCard({
  item,
  className = '',
  onWatch,
  onCreateRoom,
  onShare,
}: {
  item: SharedLibraryItem;
  className?: string;
  onWatch: (item: SharedLibraryItem) => void;
  onCreateRoom: (item: SharedLibraryItem) => void;
  onShare: (item: SharedLibraryItem) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const thumbnail = getYouTubeThumbnail(item.video_id);
  const creditLine = item.credit?.trim() || item.category;
  const isNew = isNewVideo(item.addedAt ?? item.created_at);

  return (
    <article
      className={`flex flex-col rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3 transition-colors hover:border-[#f2a33a] ${className}`}
    >
      <button
        type="button"
        onClick={() => onWatch(item)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 rounded-xl cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#14110f]">
          {!imgError ? (
            <img
              src={thumbnail}
              alt={item.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14110f] p-3">
              <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
              <span className="text-xs font-medium text-[#f4ece1] text-center line-clamp-1">
                {item.title}
              </span>
            </div>
          )}

          <span className="absolute left-2 top-2 rounded-full border border-[#3a322a] bg-[#14110f] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f4ece1]">
            Our picks
          </span>

          {isNew && (
            <span className="absolute right-2 top-2 rounded-full bg-[#f2a33a] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1208]">
              New
            </span>
          )}
        </div>

        <h3 className="mt-2.5 text-sm font-bold text-[#f4ece1] line-clamp-2 leading-snug group-hover:text-[#f2a33a] transition-colors">
          {item.title}
        </h3>
        <p
          className="mt-1 text-xs text-[#b9aa98] truncate"
          title={item.permission_note || creditLine}
        >
          {creditLine}
        </p>
      </button>

      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCreateRoom(item)}
          className="inline-flex min-h-[44px] flex-1 min-w-0 items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-2.5 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Room</span>
        </button>

        <BookmarkButton
          source="youtube"
          id={item.video_id}
          title={item.title}
          thumbnail={thumbnail}
        />

        <button
          type="button"
          onClick={() => onShare(item)}
          aria-label={`Share ${item.title}`}
          className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
        </button>

        <CardActionMenu
          title={item.title}
          videoId={item.video_id}
          sourceType="youtube"
          sourceLabel="Our picks"
        />
      </div>
    </article>
  );
}

function RowSkeleton({ title }: { title: string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[#f4ece1]">{title}</h3>
      <div className="mt-3 flex gap-3.5 overflow-hidden">
        {[0, 1, 2, 3].map((slot) => (
          <div
            key={slot}
            className="w-[260px] sm:w-[276px] shrink-0 rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3"
          >
            <div className="aspect-video w-full rounded-xl bg-[#2a241e]" />
            <div className="mt-3 h-4 w-3/4 rounded bg-[#2a241e]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[#2a241e]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GenreRows({
  catalog,
  catalogLoading,
  onSeeAllYouTube,
  onSeeAllArchive,
  onSeeAllOurPicks,
  onWatchYouTube,
  onCreateRoomYouTube,
  onShareYouTube,
  onWatchArchive,
  onCreateRoomArchive,
  onShareArchive,
  onWatchOurPick,
  onCreateRoomOurPick,
  onShareOurPick,
}: GenreRowsProps) {
  if (catalogLoading) {
    return (
      <section aria-label="Loading movies" className="space-y-8 px-4 py-4 sm:px-6 lg:px-8">
        <RowSkeleton title="Our picks" />
        <RowSkeleton title="Recently added" />
        <RowSkeleton title="Classics" />
      </section>
    );
  }

  // Build non-empty Trusted Channel genre rows (hidden automatically when trustedChannels is empty)
  const nonEmptyTrustedGenres = TRUSTED_GENRE_DEFINITIONS.map((genre) => ({
    genre,
    videos: catalog.trustedByGenre[genre.slug] ?? [],
  })).filter((entry) => entry.videos.length > 0);

  // Any trusted-channel videos that did not match a genre keyword stay discoverable in Official channels
  const matchedIds = new Set(
    nonEmptyTrustedGenres.flatMap((entry) => entry.videos.map((v) => v.videoId))
  );
  const unmatchedTrusted = catalog.trustedVideos.filter((v) => !matchedIds.has(v.videoId));

  const archiveNewDef = ARCHIVE_GENRE_LIST[0];
  const archiveClassicsDef = ARCHIVE_GENRE_LIST[1];

  const hasAnyRows =
    nonEmptyTrustedGenres.length > 0 ||
    unmatchedTrusted.length > 0 ||
    catalog.ourPicks.length > 0 ||
    catalog.creativeCommons.length > 0 ||
    catalog.archiveNew.length > 0 ||
    catalog.archiveClassics.length > 0;

  if (!hasAnyRows) {
    return (
      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-6 text-center">
          <p className="text-sm font-medium text-[#f4ece1]">
            No movies are loaded right now.
          </p>
          <p className="mt-1 text-xs text-[#b9aa98]">
            Paste any YouTube link above to start watching right away.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Browse legal movie sources"
      className="space-y-8 px-4 py-4 sm:px-6 lg:px-8"
    >
      {/* 1. Trusted Channel genre rows (empty rows & empty source automatically hidden) */}
      {nonEmptyTrustedGenres.map(({ genre, videos }) => (
        <div key={genre.slug} id={`genre-${genre.slug}`} className="scroll-mt-20">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-[#f4ece1]">{genre.name}</h3>

            <button
              type="button"
              onClick={() =>
                onSeeAllYouTube(
                  { slug: genre.slug, name: genre.name, sourceLabel: 'Official channel' },
                  videos
                )
              }
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>See all</span>
              <ChevronRight className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
            {videos.map((video) => (
              <YouTubeMovieCard
                key={`${genre.slug}-${video.videoId}`}
                video={video}
                sourceLabel="Official channel"
                className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                onWatch={onWatchYouTube}
                onCreateRoom={onCreateRoomYouTube}
                onShare={onShareYouTube}
              />
            ))}
          </div>
        </div>
      ))}

      {unmatchedTrusted.length > 0 && (
        <div id="genre-official-channels" className="scroll-mt-20">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-[#f4ece1]">Official channels</h3>
            <button
              type="button"
              onClick={() =>
                onSeeAllYouTube(
                  {
                    slug: 'official-channels',
                    name: 'Official channels',
                    sourceLabel: 'Official channel',
                  },
                  unmatchedTrusted
                )
              }
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>See all</span>
              <ChevronRight className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
            {unmatchedTrusted.map((video) => (
              <YouTubeMovieCard
                key={`official-${video.videoId}`}
                video={video}
                sourceLabel="Official channel"
                className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                onWatch={onWatchYouTube}
                onCreateRoom={onCreateRoomYouTube}
                onShare={onShareYouTube}
              />
            ))}
          </div>
        </div>
      )}

      {/* 2. Our picks (approved rows from Supabase "library" table) */}
      {catalog.ourPicks.length > 0 && (
        <div id="genre-our-picks" className="scroll-mt-20">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-[#f4ece1]">Our picks</h3>

            <button
              type="button"
              onClick={() => onSeeAllOurPicks(catalog.ourPicks)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>See all</span>
              <ChevronRight className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
            {catalog.ourPicks.map((item) => (
              <OurPickCard
                key={`our-pick-${item.video_id}`}
                item={item}
                className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                onWatch={onWatchOurPick}
                onCreateRoom={onCreateRoomOurPick}
                onShare={onShareOurPick}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. Creative Commons (one YouTube CC search cached 72h under "cc") */}
      {catalog.creativeCommons.length > 0 && (
        <div id="genre-creative-commons" className="scroll-mt-20">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-[#f4ece1]">Creative Commons</h3>

            <button
              type="button"
              onClick={() =>
                onSeeAllYouTube(
                  {
                    slug: 'creative-commons',
                    name: 'Creative Commons',
                    sourceLabel: 'Creative Commons',
                  },
                  catalog.creativeCommons
                )
              }
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>See all</span>
              <ChevronRight className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
            {catalog.creativeCommons.map((video) => (
              <YouTubeMovieCard
                key={`cc-${video.videoId}`}
                video={video}
                sourceLabel="Creative Commons"
                className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                onWatch={onWatchYouTube}
                onCreateRoom={onCreateRoomYouTube}
                onShare={onShareYouTube}
              />
            ))}
          </div>
        </div>
      )}

      {/* 4. Internet Archive: Recently added & Classics (labeled "Public domain") */}
      {catalog.archiveNew.length > 0 && (
        <div id={`genre-${archiveNewDef.slug}`} className="scroll-mt-20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-[#f4ece1]">
                {archiveNewDef.name}
              </h3>
              <span className="text-xs font-medium text-[#b9aa98]">
                · Public domain
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSeeAllArchive(archiveNewDef, catalog.archiveNew)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>See all</span>
              <ChevronRight className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
            {catalog.archiveNew.map((movie) => (
              <ArchiveMovieCard
                key={`${archiveNewDef.slug}-${movie.identifier}`}
                movie={movie}
                className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                onWatch={onWatchArchive}
                onCreateRoom={onCreateRoomArchive}
                onShare={onShareArchive}
              />
            ))}
          </div>
        </div>
      )}

      {catalog.archiveClassics.length > 0 && (
        <div id={`genre-${archiveClassicsDef.slug}`} className="scroll-mt-20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-[#f4ece1]">
                {archiveClassicsDef.name}
              </h3>
              <span className="text-xs font-medium text-[#b9aa98]">
                · Public domain
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSeeAllArchive(archiveClassicsDef, catalog.archiveClassics)}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 text-xs font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>See all</span>
              <ChevronRight className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
            {catalog.archiveClassics.map((movie) => (
              <ArchiveMovieCard
                key={`${archiveClassicsDef.slug}-${movie.identifier}`}
                movie={movie}
                className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                onWatch={onWatchArchive}
                onCreateRoom={onCreateRoomArchive}
                onShare={onShareArchive}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
