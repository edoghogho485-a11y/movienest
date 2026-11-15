import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, Film, Link2, Play, Plus, Search, X } from 'lucide-react';
import {
  fetchArchiveMovieDetails,
  isValidArchiveDownloadUrl,
} from '../lib/archive';
import {
  BROKEN_VIDEOS_UPDATED_EVENT,
  makeBrokenVideoKey,
  readBrokenVideoKeys,
} from '../lib/brokenVideos';
import { isNewVideo } from '../lib/freshness';
import {
  EMPTY_LEGAL_CATALOG,
  filterCatalogByBrokenVideos,
  LegalCatalogState,
  loadAllLegalSources,
  searchLegalCatalog,
  TRUSTED_GENRE_DEFINITIONS,
} from '../lib/legalSources';
import {
  QUEUE_MAX_ITEMS,
  QueueItem,
  SharedLibraryItem,
} from '../lib/supabase';
import {
  extractYouTubeId,
  fetchYouTubeTitle,
  getYouTubeThumbnail,
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

interface PickerTab {
  slug: string;
  name: string;
}

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

  // Paste-a-link bar inside picker so rooms can always load a pasted YouTube link
  const [pasteInput, setPasteInput] = useState('');
  const [pastedId, setPastedId] = useState<string | null>(null);
  const [pastedTitle, setPastedTitle] = useState('');

  const [catalog, setCatalog] = useState<LegalCatalogState>(EMPTY_LEGAL_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [brokenKeys, setBrokenKeys] = useState<Set<string>>(() => readBrokenVideoKeys());

  const [activeSlug, setActiveSlug] = useState<string>('our-picks');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  useEffect(() => {
    const syncBroken = () => setBrokenKeys(readBrokenVideoKeys());
    syncBroken();
    window.addEventListener(BROKEN_VIDEOS_UPDATED_EVENT, syncBroken);
    return () => window.removeEventListener(BROKEN_VIDEOS_UPDATED_EVENT, syncBroken);
  }, []);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setBrokenKeys(readBrokenVideoKeys());
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Load cached legal sources the first time the picker opens
  useEffect(() => {
    if (!open || catalogLoaded) return;
    let cancelled = false;
    setCatalogLoading(true);
    void loadAllLegalSources()
      .then((loaded) => {
        if (cancelled) return;
        setCatalog({
          ...loaded,
          ourPicks: loaded.ourPicks.length > 0 ? loaded.ourPicks : safeLibrary,
        });
        setCatalogLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalogLoaded, safeLibrary]);

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

  const visibleCatalog = useMemo(
    () => filterCatalogByBrokenVideos(catalog, brokenKeys),
    [catalog, brokenKeys]
  );

  const visibleLibrary = useMemo(
    () =>
      safeLibrary.filter(
        (item) => !brokenKeys.has(makeBrokenVideoKey('youtube', item.video_id))
      ),
    [safeLibrary, brokenKeys]
  );

  // Build visible tabs strictly from non-empty legal sources
  const tabs = useMemo<PickerTab[]>(() => {
    const list: PickerTab[] = [];
    const ourPicksList =
      visibleCatalog.ourPicks.length > 0 ? visibleCatalog.ourPicks : visibleLibrary;

    if (ourPicksList.length > 0) {
      list.push({ slug: 'our-picks', name: 'Our picks' });
    }
    for (const genre of TRUSTED_GENRE_DEFINITIONS) {
      if ((visibleCatalog.trustedByGenre[genre.slug]?.length ?? 0) > 0) {
        list.push({ slug: genre.slug, name: genre.name });
      }
    }
    if (visibleCatalog.trustedVideos.length > 0) {
      list.push({ slug: 'official-channels', name: 'Official channels' });
    }
    if (visibleCatalog.creativeCommons.length > 0) {
      list.push({ slug: 'creative-commons', name: 'Creative Commons' });
    }
    if (visibleCatalog.archiveNew.length > 0) {
      list.push({ slug: 'archive-new', name: 'Recently added' });
    }
    if (visibleCatalog.archiveClassics.length > 0) {
      list.push({ slug: 'archive-classics', name: 'Classics' });
    }
    return list;
  }, [visibleCatalog, visibleLibrary]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.slug === activeSlug)) {
      setActiveSlug(tabs[0].slug);
    }
  }, [tabs, activeSlug]);

  if (!open) return null;

  const isQueueFull = safeQueue.length >= QUEUE_MAX_ITEMS;

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (!q) return;
    setActiveSearchQuery(q);
    setFeedback(null);
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

  const renderCard = (
    movie: PickerMovieSelection,
    subtitle: string,
    badge?: string,
    isNew?: boolean
  ) => {
    const inQueue = safeQueue.some(
      (q) => q.videoId === movie.videoId && q.source === movie.source
    );
    const playBusy = busyKey === `play-${movie.source}-${movie.videoId}`;
    const queueBusy = busyKey === `queue-${movie.source}-${movie.videoId}`;

    return (
      <div
        key={`${movie.source}-${movie.videoId}`}
        className="flex flex-col rounded-2xl border border-[#3a322a] bg-[#14110f] p-2.5"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#1e1a16]">
          {movie.thumbnail ? (
            <img
              src={movie.thumbnail}
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
            </div>
          )}
          {badge && (
            <span className="absolute left-1.5 top-1.5 rounded-full border border-[#3a322a] bg-[#14110f] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f4ece1]">
              {badge}
            </span>
          )}
          {isNew && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-[#f2a33a] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1a1208]">
              New
            </span>
          )}
        </div>

        <h3 className="mt-2 text-xs sm:text-sm font-bold text-[#f4ece1] line-clamp-2 leading-snug">
          {movie.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-[#b9aa98] truncate">{subtitle}</p>

        <div className="mt-auto pt-2.5 flex flex-wrap items-center gap-1.5">
          {canChangeVideo && (
            <button
              type="button"
              disabled={Boolean(busyKey)}
              onClick={() => void resolveAndRun('play', movie)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full bg-[#f2a33a] px-3 py-1.5 text-xs font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-50 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current shrink-0" aria-hidden="true" />
              <span>{playBusy ? 'Loading...' : 'Play now'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={Boolean(busyKey) || isQueueFull}
            onClick={() => void resolveAndRun('queue', movie)}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-full border border-[#3a322a] bg-[#1e1a16] px-3 py-1.5 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-50 cursor-pointer"
          >
            {inQueue ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#f2a33a] shrink-0" aria-hidden="true" />
                <span>Add again</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 text-[#f2a33a] shrink-0" aria-hidden="true" />
                <span>{queueBusy ? 'Adding...' : 'Add to queue'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const searchMatches = activeSearchQuery
    ? searchLegalCatalog(
        {
          ...visibleCatalog,
          ourPicks:
            visibleCatalog.ourPicks.length > 0 ? visibleCatalog.ourPicks : visibleLibrary,
        },
        activeSearchQuery
      )
    : null;

  const ourPicksList =
    visibleCatalog.ourPicks.length > 0 ? visibleCatalog.ourPicks : visibleLibrary;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/90 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-picker-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[20px] border border-[#3a322a] bg-[#1e1a16] sm:rounded-[20px]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#3a322a] px-5 py-4">
          <div>
            <h2
              id="room-picker-title"
              className="text-lg font-bold text-[#f4ece1]"
            >
              Change Video or Add to Queue
            </h2>
            <p className="text-xs text-[#b9aa98]">
              Pick from legal movie sources or paste any YouTube link ({safeQueue.length}/
              {QUEUE_MAX_ITEMS} queued)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video picker"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] active:bg-[#3a322a] cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search & Paste Controls */}
        <div className="border-b border-[#3a322a] bg-[#14110f] px-5 py-3.5 space-y-2.5">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b9aa98]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInput(val);
                  if (!val.trim()) setActiveSearchQuery('');
                }}
                placeholder="Search movies..."
                aria-label="Search movies for room"
                className="w-full min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] pl-10 pr-10 py-2 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
              />
              {(searchInput || activeSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setActiveSearchQuery('');
                  }}
                  aria-label="Clear room search"
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#b9aa98] hover:text-[#f4ece1] cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!searchInput.trim()}
              className="min-h-[44px] rounded-full bg-[#f2a33a] px-5 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-50 cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* Paste a YouTube URL */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Link2
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#f2a33a]"
                aria-hidden="true"
              />
              <input
                type="url"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                placeholder="Or paste a YouTube link (youtube.com/watch or youtu.be)..."
                aria-label="Paste YouTube link"
                className="w-full min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] pl-10 pr-4 py-2 text-xs text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
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
                    className="min-h-[44px] rounded-full bg-[#f2a33a] px-4 py-2 text-xs font-bold text-[#1a1208] hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
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
                  className="min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-xs font-medium text-[#f4ece1] hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-50 cursor-pointer"
                >
                  Add link to queue
                </button>
              </div>
            )}
          </div>

          {feedback && (
            <p role="status" className="text-xs font-medium text-[#f2a33a]">
              {feedback.text}
            </p>
          )}
        </div>

        {/* Legal source tabs */}
        {!activeSearchQuery && tabs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-[#3a322a] px-5 py-2.5 no-scrollbar">
            {tabs.map((tab) => {
              const selected = tab.slug === activeSlug;
              return (
                <button
                  key={tab.slug}
                  type="button"
                  onClick={() => setActiveSlug(tab.slug)}
                  className={`shrink-0 min-h-[44px] rounded-full px-4 py-2 text-xs transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#f2a33a] text-[#1a1208] font-bold'
                      : 'border border-[#3a322a] bg-[#14110f] text-[#b9aa98] font-medium hover:border-[#f2a33a] hover:text-[#f4ece1]'
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
          {searchMatches ? (
            searchMatches.youtube.length === 0 && searchMatches.archive.length === 0 ? (
              <p className="text-sm text-[#b9aa98]">
                No movies matched &ldquo;{activeSearchQuery}&rdquo;. Try another search or paste a
                YouTube link above.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                {searchMatches.youtube.map((video) =>
                  renderCard(
                    {
                      videoId: video.videoId,
                      title: video.title,
                      thumbnail: video.thumbnail,
                      source: 'youtube',
                    },
                    video.channelTitle,
                    video.sourceLabel ?? 'YouTube',
                    isNewVideo(video.addedAt)
                  )
                )}
                {searchMatches.archive.map((movie) =>
                  renderCard(
                    {
                      videoId: movie.identifier,
                      title: movie.title,
                      thumbnail: movie.thumbnail,
                      source: 'archive',
                    },
                    movie.year ? `${movie.year} · Public domain` : 'Public domain',
                    'Public domain',
                    isNewVideo(movie.addedAt ?? movie.addeddate)
                  )
                )}
              </div>
            )
          ) : catalogLoading ? (
            <p className="text-sm text-[#b9aa98]">Loading movies...</p>
          ) : tabs.length === 0 ? (
            <p className="text-sm text-[#b9aa98]">
              No catalog movies are available right now. Paste a YouTube link above to watch.
            </p>
          ) : activeSlug === 'our-picks' ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {ourPicksList.map((item) =>
                renderCard(
                  {
                    videoId: item.video_id,
                    title: item.title,
                    thumbnail: getYouTubeThumbnail(item.video_id),
                    source: 'youtube',
                  },
                  item.credit?.trim() || item.category,
                  'Our picks',
                  isNewVideo(item.addedAt ?? item.created_at)
                )
              )}
            </div>
          ) : activeSlug === 'creative-commons' ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {visibleCatalog.creativeCommons.map((video) =>
                renderCard(
                  {
                    videoId: video.videoId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    source: 'youtube',
                  },
                  video.channelTitle,
                  'Creative Commons',
                  isNewVideo(video.addedAt)
                )
              )}
            </div>
          ) : activeSlug === 'archive-new' ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {visibleCatalog.archiveNew.map((movie) =>
                renderCard(
                  {
                    videoId: movie.identifier,
                    title: movie.title,
                    thumbnail: movie.thumbnail,
                    source: 'archive',
                  },
                  movie.year ? `${movie.year} · Public domain` : 'Public domain',
                  'Public domain',
                  isNewVideo(movie.addedAt ?? movie.addeddate)
                )
              )}
            </div>
          ) : activeSlug === 'archive-classics' ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {visibleCatalog.archiveClassics.map((movie) =>
                renderCard(
                  {
                    videoId: movie.identifier,
                    title: movie.title,
                    thumbnail: movie.thumbnail,
                    source: 'archive',
                  },
                  movie.year ? `${movie.year} · Public domain` : 'Public domain',
                  'Public domain',
                  isNewVideo(movie.addedAt ?? movie.addeddate)
                )
              )}
            </div>
          ) : activeSlug === 'official-channels' ? (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {visibleCatalog.trustedVideos.map((video) =>
                renderCard(
                  {
                    videoId: video.videoId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    source: 'youtube',
                  },
                  video.channelTitle,
                  'Official channel',
                  isNewVideo(video.addedAt)
                )
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {(visibleCatalog.trustedByGenre[activeSlug] ?? []).map((video) =>
                renderCard(
                  {
                    videoId: video.videoId,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    source: 'youtube',
                  },
                  video.channelTitle,
                  'Official channel',
                  isNewVideo(video.addedAt)
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
