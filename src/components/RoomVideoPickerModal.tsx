import { FormEvent, useEffect, useState } from 'react';
import { Check, Film, Link2, Play, Plus, Search, X } from 'lucide-react';
import { GENRE_LIST } from '../data/genres';
import {
  ARCHIVE_GENRE_LIST,
  ArchiveMovieItem,
  fetchArchiveMovieDetails,
  isValidArchiveDownloadUrl,
  searchArchiveWithCache,
} from '../lib/archive';
import {
  QUEUE_MAX_ITEMS,
  QueueItem,
  SharedLibraryItem,
} from '../lib/supabase';
import {
  extractYouTubeId,
  fetchYouTubeTitle,
  getYouTubeThumbnail,
  hasYouTubeApiKey,
  searchYouTubeWithCache,
  YouTubeSearchResult,
} from '../lib/youtube';

export interface PickerMovieSelection {
  videoId: string;
  title: string;
  thumbnail: string;
  source: 'youtube' | 'archive';
  videoUrl?: string | null;
}

interface RoomVideoPickerModalProps {
  open: boolean;
  canChangeVideo: boolean;
  queue: QueueItem[];
  sharedLibrary: SharedLibraryItem[];
  onClose: () => void;
  onPlayNow: (movie: PickerMovieSelection) => Promise<string | null>;
  onAddToQueue: (movie: PickerMovieSelection) => Promise<string | null>;
}

type PickerTab =
  | { kind: 'youtube-genre'; slug: string; name: string; query: string }
  | { kind: 'archive-genre'; slug: string; name: string; query: string }
  | { kind: 'library'; slug: 'saved-library'; name: string };

const PICKER_TABS: PickerTab[] = [
  ...GENRE_LIST.map((g) => ({
    kind: 'youtube-genre' as const,
    slug: g.slug,
    name: g.name,
    query: g.query,
  })),
  ...ARCHIVE_GENRE_LIST.map((g) => ({
    kind: 'archive-genre' as const,
    slug: g.slug,
    name: `${g.name} (Archive)`,
    query: g.query,
  })),
  { kind: 'library', slug: 'saved-library', name: 'Saved Library' },
];

export function RoomVideoPickerModal({
  open,
  canChangeVideo,
  queue,
  sharedLibrary,
  onClose,
  onPlayNow,
  onAddToQueue,
}: RoomVideoPickerModalProps) {
  const safeQueue = Array.isArray(queue) ? queue : [];
  const safeLibrary = Array.isArray(sharedLibrary) ? sharedLibrary : [];
  const [searchInput, setSearchInput] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);

  // Paste-a-link bar inside picker so rooms can always load any YouTube link
  const [pasteInput, setPasteInput] = useState('');
  const [pastedId, setPastedId] = useState<string | null>(null);
  const [pastedTitle, setPastedTitle] = useState('');

  const [activeSlug, setActiveSlug] = useState<string>(PICKER_TABS[0].slug);
  const [tabLoading, setTabLoading] = useState(false);
  const [youtubeBySlug, setYoutubeBySlug] = useState<Record<string, YouTubeSearchResult[]>>({});
  const [archiveBySlug, setArchiveBySlug] = useState<Record<string, ArchiveMovieItem[]>>({});

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Parse pasted YouTube URL and fetch title via oEmbed
  useEffect(() => {
    const id = extractYouTubeId(pasteInput);
    setPastedId(id);
    if (!id) {
      setPastedTitle('');
      return;
    }
    let cancelled = false;
    setPastedTitle('Loading title...');
    fetchYouTubeTitle(id).then((t) => {
      if (!cancelled) setPastedTitle(t);
    });
    return () => {
      cancelled = true;
    };
  }, [pasteInput]);

  // Lazy-load the selected genre tab when opened
  useEffect(() => {
    if (!open || activeSearchQuery) return;
    const currentTab = PICKER_TABS.find((t) => t.slug === activeSlug);
    if (!currentTab || currentTab.kind === 'library') return;

    if (currentTab.kind === 'youtube-genre') {
      if (youtubeBySlug[currentTab.slug]) return;
      let cancelled = false;
      setTabLoading(true);
      searchYouTubeWithCache(currentTab.query).then(({ results }) => {
        if (cancelled) return;
        setYoutubeBySlug((prev) => ({ ...prev, [currentTab.slug]: results }));
        setTabLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    if (currentTab.kind === 'archive-genre') {
      if (archiveBySlug[currentTab.slug]) return;
      let cancelled = false;
      setTabLoading(true);
      searchArchiveWithCache(currentTab.query, currentTab.slug).then(({ results }) => {
        if (cancelled) return;
        setArchiveBySlug((prev) => ({ ...prev, [currentTab.slug]: results }));
        setTabLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [open, activeSlug, activeSearchQuery, youtubeBySlug, archiveBySlug]);

  if (!open) return null;

  const isQueueFull = safeQueue.length >= QUEUE_MAX_ITEMS;

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q || !hasYouTubeApiKey) return;
    setActiveSearchQuery(q);
    setSearching(true);
    setFeedback(null);
    const { results } = await searchYouTubeWithCache(q);
    setSearching(false);
    setSearchResults(results);
  };

  const resolveAndRun = async (
    action: 'play' | 'queue',
    candidate: PickerMovieSelection
  ) => {
    if (busyKey) return;
    if (action === 'queue' && isQueueFull) {
      setFeedback({ text: `Queue is full (max ${QUEUE_MAX_ITEMS} movies).`, tone: 'error' });
      return;
    }

    setBusyKey(`${action}-${candidate.source}-${candidate.videoId}`);
    setFeedback(null);

    let finalSelection = candidate;
    if (candidate.source === 'archive' && !candidate.videoUrl) {
      const details = await fetchArchiveMovieDetails(candidate.videoId);
      if (!details.mp4Url || !isValidArchiveDownloadUrl(details.mp4Url)) {
        setBusyKey(null);
        setFeedback({
          text: "This Archive movie doesn't have a playable MP4 file.",
          tone: 'error',
        });
        return;
      }
      finalSelection = {
        ...candidate,
        title: details.title || candidate.title,
        videoUrl: details.mp4Url,
      };
    }

    const err =
      action === 'play'
        ? await onPlayNow(finalSelection)
        : await onAddToQueue(finalSelection);

    setBusyKey(null);
    if (err) {
      setFeedback({ text: err, tone: 'error' });
      return;
    }

    if (action === 'play') {
      onClose();
    } else {
      setFeedback({ text: `Added "${finalSelection.title}" to queue`, tone: 'ok' });
    }
  };

  const renderCard = (movie: PickerMovieSelection, subtitle: string) => {
    const inQueue = safeQueue.some(
      (q) => q.videoId === movie.videoId && q.source === movie.source
    );
    const playBusy = busyKey === `play-${movie.source}-${movie.videoId}`;
    const queueBusy = busyKey === `queue-${movie.source}-${movie.videoId}`;

    return (
      <div
        key={`${movie.source}-${movie.videoId}`}
        className="flex flex-col rounded-xl border border-[#2a2a33] bg-[#0d0d12] p-2.5"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#181820]">
          {movie.thumbnail ? (
            <img
              src={movie.thumbnail}
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film className="h-6 w-6 text-[#E50914]" aria-hidden="true" />
            </div>
          )}
          {movie.source === 'archive' && (
            <span className="absolute left-2 top-2 rounded-md border border-[#2a2a33] bg-[#14141a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-100">
              Archive
            </span>
          )}
        </div>

        <h3 className="mt-2 font-display text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug">
          {movie.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-zinc-400 truncate">{subtitle}</p>

        <div className="mt-auto pt-2.5 flex items-center gap-1.5">
          {canChangeVideo && (
            <button
              type="button"
              disabled={Boolean(busyKey)}
              onClick={() => void resolveAndRun('play', movie)}
              className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg bg-[#E50914] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current shrink-0" aria-hidden="true" />
              <span>{playBusy ? 'Loading...' : 'Play now'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={Boolean(busyKey) || isQueueFull}
            onClick={() => void resolveAndRun('queue', movie)}
            className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1 rounded-lg border border-[#2a2a33] bg-[#181820] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/30 active:bg-[#252530] disabled:opacity-50 cursor-pointer"
          >
            {inQueue ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>Add again</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 text-[#E50914] shrink-0" aria-hidden="true" />
                <span>{queueBusy ? 'Adding...' : 'Add to queue'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const currentTab = PICKER_TABS.find((t) => t.slug === activeSlug) ?? PICKER_TABS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-picker-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[#2a2a33] bg-[#14141a] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#2a2a33] px-5 py-4">
          <div>
            <h2
              id="room-picker-title"
              className="font-display text-lg font-semibold text-white"
            >
              Change Video or Add to Queue
            </h2>
            <p className="text-xs text-zinc-400">
              Pick from YouTube, Internet Archive, or paste any YouTube link ({safeQueue.length}/
              {QUEUE_MAX_ITEMS} queued)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video picker"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search & Paste Controls */}
        <div className="border-b border-[#2a2a33] bg-[#101015] px-5 py-3.5 space-y-2.5">
          {hasYouTubeApiKey && (
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search movies on YouTube..."
                  aria-label="Search movies for room"
                  className="w-full min-h-[42px] rounded-lg border border-[#2a2a33] bg-[#08080A] pl-9 pr-8 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none"
                />
                {(searchInput || activeSearchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setActiveSearchQuery('');
                      setSearchResults([]);
                    }}
                    aria-label="Clear room search"
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!searchInput.trim() || searching}
                className="min-h-[42px] rounded-lg bg-[#E50914] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap hover:bg-[#F40612] active:bg-[#b80710] disabled:opacity-50 cursor-pointer"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </form>
          )}

          {/* Paste a YouTube URL */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Link2
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#E50914]"
                aria-hidden="true"
              />
              <input
                type="url"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                placeholder="Or paste a YouTube link (youtube.com/watch or youtu.be)..."
                aria-label="Paste YouTube link"
                className="w-full min-h-[40px] rounded-lg border border-[#2a2a33] bg-[#08080A] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none"
              />
            </div>

            {pastedId && (
              <div className="flex items-center gap-2 shrink-0">
                {canChangeVideo && (
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() =>
                      void resolveAndRun('play', {
                        videoId: pastedId,
                        title: pastedTitle || `YouTube Video (${pastedId})`,
                        thumbnail: getYouTubeThumbnail(pastedId),
                        source: 'youtube',
                      })
                    }
                    className="min-h-[40px] rounded-lg bg-[#E50914] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
                  >
                    Play link
                  </button>
                )}
                <button
                  type="button"
                  disabled={Boolean(busyKey) || isQueueFull}
                  onClick={() =>
                    void resolveAndRun('queue', {
                      videoId: pastedId,
                      title: pastedTitle || `YouTube Video (${pastedId})`,
                      thumbnail: getYouTubeThumbnail(pastedId),
                      source: 'youtube',
                    })
                  }
                  className="min-h-[40px] rounded-lg border border-[#2a2a33] bg-[#181820] px-3 py-1.5 text-xs font-medium text-white hover:border-white/30 active:bg-[#252530] disabled:opacity-50 cursor-pointer"
                >
                  Add link to queue
                </button>
              </div>
            )}
          </div>

          {feedback && (
            <p
              role="status"
              className={`text-xs font-medium ${
                feedback.tone === 'error' ? 'text-[#F87171]' : 'text-emerald-400'
              }`}
            >
              {feedback.text}
            </p>
          )}
        </div>

        {/* Genre row tabs */}
        {!activeSearchQuery && (
          <div className="flex gap-2 overflow-x-auto border-b border-[#2a2a33] px-5 py-2.5 no-scrollbar">
            {PICKER_TABS.map((tab) => {
              const selected = tab.slug === activeSlug;
              return (
                <button
                  key={tab.slug}
                  type="button"
                  onClick={() => setActiveSlug(tab.slug)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#E50914] text-white font-semibold'
                      : 'border border-[#2a2a33] bg-[#0d0d12] text-zinc-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {tab.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Movie grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeSearchQuery ? (
            searching ? (
              <p className="text-sm text-zinc-400">Searching YouTube...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No embeddable movies found for &ldquo;{activeSearchQuery}&rdquo;. Try another
                search or paste a YouTube link above.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                {searchResults.map((video) =>
                  renderCard(
                    {
                      videoId: video.videoId,
                      title: video.title,
                      thumbnail: video.thumbnail,
                      source: 'youtube',
                    },
                    video.channelTitle
                  )
                )}
              </div>
            )
          ) : currentTab.kind === 'library' ? (
            safeLibrary.length === 0 ? (
              <p className="text-sm text-zinc-400">No saved videos in your shared library yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                {safeLibrary.map((item) =>
                  renderCard(
                    {
                      videoId: item.video_id,
                      title: item.title,
                      thumbnail: getYouTubeThumbnail(item.video_id),
                      source: 'youtube',
                    },
                    item.category
                  )
                )}
              </div>
            )
          ) : tabLoading ? (
            <p className="text-sm text-zinc-400">Loading movies...</p>
          ) : currentTab.kind === 'youtube-genre' ? (
            (youtubeBySlug[currentTab.slug]?.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-400">
                No YouTube videos loaded for this row right now. Try an Archive tab or paste a link
                above.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                {youtubeBySlug[currentTab.slug].map((video) =>
                  renderCard(
                    {
                      videoId: video.videoId,
                      title: video.title,
                      thumbnail: video.thumbnail,
                      source: 'youtube',
                    },
                    video.channelTitle
                  )
                )}
              </div>
            )
          ) : (archiveBySlug[currentTab.slug]?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-400">
              No Archive movies loaded for this category right now.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {archiveBySlug[currentTab.slug].map((movie) =>
                renderCard(
                  {
                    videoId: movie.identifier,
                    title: movie.title,
                    thumbnail: movie.thumbnail,
                    source: 'archive',
                  },
                  movie.year ? `${movie.year} · Internet Archive` : 'Internet Archive'
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
