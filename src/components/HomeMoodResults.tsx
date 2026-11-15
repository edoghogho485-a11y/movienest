import { useState } from 'react';
import { Film, Flag, Play, RefreshCw, Users, X } from 'lucide-react';
import { ArchiveMovieItem } from '../lib/archive';
import { isNewVideo } from '../lib/freshness';
import { LegalPickItem, MOOD_DEFINITIONS, MoodId } from '../lib/moodCatalog';
import { buildReportVideoMailto } from '../lib/report';
import { YouTubeSearchResult } from '../lib/youtube';
import { ArchiveMovieCard } from './ArchiveMovieCard';
import { BookmarkButton } from './BookmarkButton';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface HomeMoodResultsProps {
  selectedMood: MoodId | null;
  moodItems: LegalPickItem[];
  surpriseItem: LegalPickItem | null;
  onClose: () => void;
  onAnotherSurprise: () => void;
  onWatchTogetherYouTube: (video: YouTubeSearchResult) => void;
  onWatchAloneYouTube: (video: YouTubeSearchResult) => void;
  onWatchChoiceYouTube: (video: YouTubeSearchResult) => void;
  onShareYouTube: (video: YouTubeSearchResult) => void;
  onWatchTogetherArchive: (movie: ArchiveMovieItem) => void;
  onWatchAloneArchive: (movie: ArchiveMovieItem) => void;
  onWatchChoiceArchive: (movie: ArchiveMovieItem) => void;
  onShareArchive: (movie: ArchiveMovieItem) => void;
}

// Displays either the 1-card "Surprise me" pick or the matching mood row underneath the Hero
export function HomeMoodResults({
  selectedMood,
  moodItems,
  surpriseItem,
  onClose,
  onAnotherSurprise,
  onWatchTogetherYouTube,
  onWatchAloneYouTube,
  onWatchChoiceYouTube,
  onShareYouTube,
  onWatchTogetherArchive,
  onWatchAloneArchive,
  onWatchChoiceArchive,
  onShareArchive,
}: HomeMoodResultsProps) {
  const [imgError, setImgError] = useState(false);

  if (!selectedMood) return null;

  const moodMeta = MOOD_DEFINITIONS.find((m) => m.id === selectedMood);

  if (selectedMood === 'surprise') {
    if (!surpriseItem) {
      return (
        <section
          aria-label="Surprise movie pick"
          className="px-4 pt-5 sm:px-6 lg:px-8"
        >
          <div className="rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 flex items-center justify-between gap-3">
            <p className="text-sm text-[#b9aa98]">
              No movies are loaded for Surprise me right now.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-4 text-xs font-medium text-[#b9aa98] hover:border-[#f2a33a] hover:text-[#f4ece1] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Close</span>
            </button>
          </div>
        </section>
      );
    }

    const isArchive = surpriseItem.kind === 'archive';
    const itemId = isArchive ? surpriseItem.movie.identifier : surpriseItem.video.videoId;
    const itemTitle = isArchive ? surpriseItem.movie.title : surpriseItem.video.title;
    const itemThumb = isArchive ? surpriseItem.movie.thumbnail : surpriseItem.video.thumbnail;
    const itemSourceLabel = isArchive
      ? 'Public domain'
      : surpriseItem.video.sourceLabel ?? 'YouTube';
    const itemAddedAt = isArchive
      ? surpriseItem.movie.addedAt ?? surpriseItem.movie.addeddate
      : surpriseItem.video.addedAt;
    const itemIsNew = isNewVideo(itemAddedAt);
    const reportMailto = buildReportVideoMailto({
      title: itemTitle,
      videoId: itemId,
      sourceType: isArchive ? 'archive' : 'youtube',
      sourceLabel: itemSourceLabel,
    });
    const itemSubtitle = isArchive
      ? surpriseItem.movie.year
        ? `${surpriseItem.movie.year} · Public domain`
        : 'Public domain'
      : surpriseItem.video.sourceLabel
        ? `${surpriseItem.video.sourceLabel} · ${surpriseItem.video.channelTitle}`
        : surpriseItem.video.channelTitle;

    return (
      <section
        aria-label="Surprise movie pick"
        className="px-4 pt-5 sm:px-6 lg:px-8"
      >
        <div className="rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#f2a33a]">
                Surprise pick
              </p>
              <h2 className="mt-1 text-lg font-bold text-[#f4ece1]">
                Picked from legal movie sources
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close surprise pick"
              className="inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-4 text-xs font-medium text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Close</span>
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-center">
            <div className="relative aspect-video w-full md:w-80 shrink-0 overflow-hidden rounded-2xl border border-[#3a322a] bg-[#14110f]">
              {!imgError && itemThumb ? (
                <img
                  key={itemId}
                  src={itemThumb}
                  alt={itemTitle}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Film className="h-8 w-8 text-[#f2a33a]" aria-hidden="true" />
                </div>
              )}

              <span className="absolute left-2.5 top-2.5 rounded-full border border-[#3a322a] bg-[#14110f] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f4ece1]">
                {itemSourceLabel}
              </span>

              {itemIsNew && (
                <span className="absolute right-2.5 top-2.5 rounded-full bg-[#f2a33a] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1208]">
                  New
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-[#f4ece1] sm:text-2xl line-clamp-2 leading-snug">
                {itemTitle}
              </h3>
              <p className="mt-1.5 text-sm text-[#b9aa98]">{itemSubtitle}</p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    isArchive
                      ? onWatchTogetherArchive(surpriseItem.movie)
                      : onWatchTogetherYouTube(surpriseItem.video)
                  }
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                >
                  <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Watch together</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    isArchive
                      ? onWatchAloneArchive(surpriseItem.movie)
                      : onWatchAloneYouTube(surpriseItem.video)
                  }
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-5 py-2.5 text-sm font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current text-[#f2a33a] shrink-0" aria-hidden="true" />
                  <span>Watch alone</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImgError(false);
                    onAnotherSurprise();
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2.5 text-sm font-medium text-[#b9aa98] whitespace-nowrap transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Another one</span>
                </button>

                <BookmarkButton
                  source={isArchive ? 'archive' : 'youtube'}
                  id={itemId}
                  title={itemTitle}
                  thumbnail={itemThumb}
                />

                <a
                  href={reportMailto}
                  aria-label={`Report ${itemTitle}`}
                  title="Report this video"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-3.5 py-2 text-xs font-medium text-[#b9aa98] whitespace-nowrap transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1]"
                >
                  <Flag className="h-3.5 w-3.5 text-[#f2a33a] shrink-0" aria-hidden="true" />
                  <span>Report this video</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={`${moodMeta?.label ?? 'Mood'} movies`}
      className="px-4 pt-6 sm:px-6 lg:px-8"
    >
      <div className="rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#f4ece1] sm:text-xl">
              {moodMeta?.label} picks
            </h2>
            {moodMeta?.description && (
              <p className="mt-0.5 text-xs text-[#b9aa98]">
                {moodMeta.description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2 text-xs font-medium text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>Clear mood</span>
          </button>
        </div>

        {moodItems.length === 0 ? (
          <p className="mt-4 text-sm text-[#b9aa98]">
            No movies matched this mood yet. Try another mood or browse all legal sources.
          </p>
        ) : (
          <div className="mt-4 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
            {moodItems.map((entry) =>
              entry.kind === 'youtube' ? (
                <YouTubeMovieCard
                  key={`mood-yt-${selectedMood}-${entry.video.videoId}`}
                  video={entry.video}
                  className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                  onWatch={onWatchChoiceYouTube}
                  onCreateRoom={onWatchTogetherYouTube}
                  onShare={onShareYouTube}
                />
              ) : (
                <ArchiveMovieCard
                  key={`mood-ar-${selectedMood}-${entry.movie.identifier}`}
                  movie={entry.movie}
                  className="w-[260px] sm:w-[276px] shrink-0 snap-start"
                  onWatch={onWatchChoiceArchive}
                  onCreateRoom={onWatchTogetherArchive}
                  onShare={onShareArchive}
                />
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
