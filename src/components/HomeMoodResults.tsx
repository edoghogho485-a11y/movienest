import { useState } from 'react';
import { Film, Play, RefreshCw, Users, X } from 'lucide-react';
import { MOOD_DEFINITIONS, MoodId } from '../lib/moodCatalog';
import { SharedLibraryItem } from '../lib/supabase';
import { YouTubeSearchResult } from '../lib/youtube';
import { BookmarkButton } from './BookmarkButton';
import { YouTubeMovieCard } from './YouTubeMovieCard';

interface HomeMoodResultsProps {
  selectedMood: MoodId | null;
  moodVideos: YouTubeSearchResult[];
  surpriseVideo: YouTubeSearchResult | null;
  onClose: () => void;
  onAnotherSurprise: () => void;
  onWatchTogether: (video: YouTubeSearchResult) => void;
  onWatchAlone: (video: YouTubeSearchResult) => void;
  onWatchCardChoice: (video: YouTubeSearchResult) => void;
  onShare: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
}

// Displays either the 1-card "Surprise me" pick or the cached mood row underneath the Hero
export function HomeMoodResults({
  selectedMood,
  moodVideos,
  surpriseVideo,
  onClose,
  onAnotherSurprise,
  onWatchTogether,
  onWatchAlone,
  onWatchCardChoice,
  onShare,
  onSavedToLibrary,
}: HomeMoodResultsProps) {
  const [imgError, setImgError] = useState(false);

  if (!selectedMood) return null;

  const moodMeta = MOOD_DEFINITIONS.find((m) => m.id === selectedMood);

  if (selectedMood === 'surprise') {
    if (!surpriseVideo) return null;

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
                Picked from cached movies
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
              {!imgError && surpriseVideo.thumbnail ? (
                <img
                  key={surpriseVideo.videoId}
                  src={surpriseVideo.thumbnail}
                  alt={surpriseVideo.title}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Film className="h-8 w-8 text-[#f2a33a]" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-[#f4ece1] sm:text-2xl line-clamp-2 leading-snug">
                {surpriseVideo.title}
              </h3>
              <p className="mt-1.5 text-sm text-[#b9aa98]">
                {surpriseVideo.channelTitle}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onWatchTogether(surpriseVideo)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                >
                  <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Watch together</span>
                </button>

                <button
                  type="button"
                  onClick={() => onWatchAlone(surpriseVideo)}
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
                  source="youtube"
                  id={surpriseVideo.videoId}
                  title={surpriseVideo.title}
                  thumbnail={surpriseVideo.thumbnail}
                />
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

        <div className="mt-4 flex gap-3.5 overflow-x-auto pb-2 no-scrollbar snap-x snap-mandatory">
          {moodVideos.map((video) => (
            <YouTubeMovieCard
              key={`mood-${selectedMood}-${video.videoId}`}
              video={video}
              className="w-[240px] sm:w-[270px] shrink-0 snap-start"
              onWatch={onWatchCardChoice}
              onCreateRoom={onWatchTogether}
              onShare={onShare}
              onSavedToLibrary={onSavedToLibrary}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
