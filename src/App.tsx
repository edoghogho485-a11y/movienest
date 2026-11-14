import { FormEvent, useEffect, useRef, useState } from 'react';
import { Play, Search, Users, X } from 'lucide-react';
import { Sidebar, MobileBottomNav, NavSection } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { HeroBanner } from './components/HeroBanner';
import { CategoryJumpTarget, CategoryTiles } from './components/CategoryTiles';
import { GenreRows } from './components/GenreRows';
import { GenreGridView, SeeAllViewData } from './components/GenreGridView';
import { PasteYouTubeBar, PastedYouTubeVideo } from './components/PasteYouTubeBar';
import { VideoPlayerPage, WatchableVideo } from './components/VideoPlayerPage';
import { RoomPage } from './components/RoomPage';
import { ModalMode, RoomModal, RoomVideoOption } from './components/RoomModal';
import { WatchChoiceModal } from './components/WatchChoiceModal';
import { ShareSheet } from './components/ShareSheet';
import { YouTubeMovieCard } from './components/YouTubeMovieCard';
import { LIBRARY_VIDEOS, LibraryVideo } from './data/libraryVideos';
import { FEATURED_VIDEOS } from './data/videos';
import { ArchiveMovieItem, getArchiveThumbnail } from './lib/archive';
import {
  getArchiveWatchAloneLink,
  getSiteShareLink,
  getWatchAloneLink,
  ShareTarget,
} from './lib/share';
import {
  fetchSharedLibrary,
  findRoomByCode,
  RoomRecord,
  SharedLibraryItem,
  supabase,
} from './lib/supabase';
import {
  getYouTubeThumbnail,
  hasYouTubeApiKey,
  searchYouTubeWithCache,
  YouTubeSearchResult,
} from './lib/youtube';

const HOW_IT_WORKS = [
  {
    step: '01.',
    title: 'Open a private room',
    description: 'Pick any movie or paste a YouTube link to launch your screening room.',
  },
  {
    step: '02.',
    title: 'Invite your friends',
    description: 'Share the short room code so everyone joins from their phone or laptop.',
  },
  {
    step: '03.',
    title: 'Stay in sync',
    description: 'Play, pause, and scrub together with live chat built right beside the video.',
  },
];

function getRoomCodeFromUrl(): string | null {
  const param = new URLSearchParams(window.location.search).get('room');
  return param ? param.trim().toUpperCase() : null;
}

function getWatchIdFromUrl(): string | null {
  const param = new URLSearchParams(window.location.search).get('watch');
  return param ? param.trim() : null;
}

function getArchiveIdFromUrl(): string | null {
  const param = new URLSearchParams(window.location.search).get('archive');
  return param ? param.trim() : null;
}

function extractRoomCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes('room=')) {
    try {
      const parsed = new URL(
        trimmed.startsWith('http') ? trimmed : `https://movienest.local/${trimmed}`
      );
      const param = parsed.searchParams.get('room');
      if (param) return param.trim().toUpperCase();
    } catch {
      // Fallback to raw input below
    }
  }
  return trimmed.toUpperCase();
}

function resolveWatchableById(
  videoId: string,
  sharedLibrary: SharedLibraryItem[]
): WatchableVideo {
  const fromSample = LIBRARY_VIDEOS.find(
    (v) => v.youtubeId === videoId || v.id === videoId
  );
  if (fromSample) {
    return {
      id: fromSample.id,
      title: fromSample.title,
      category: fromSample.category,
      youtubeId: fromSample.youtubeId,
      thumbnail: fromSample.thumbnail,
      duration: fromSample.duration,
    };
  }

  const fromFeatured = FEATURED_VIDEOS.find(
    (v) => v.youtubeId === videoId || v.id === videoId
  );
  if (fromFeatured) {
    return {
      id: fromFeatured.id,
      title: fromFeatured.title,
      category: fromFeatured.genre,
      youtubeId: fromFeatured.youtubeId,
      thumbnail: fromFeatured.thumbnail,
      duration: fromFeatured.duration,
    };
  }

  const fromShared = sharedLibrary.find((v) => v.video_id === videoId);
  if (fromShared) {
    return {
      id: fromShared.id,
      title: fromShared.title,
      category: fromShared.category,
      youtubeId: fromShared.video_id,
      thumbnail: getYouTubeThumbnail(fromShared.video_id),
    };
  }

  return {
    id: videoId,
    title: `YouTube Video (${videoId})`,
    category: 'Movie',
    youtubeId: videoId,
    thumbnail: getYouTubeThumbnail(videoId),
  };
}

function resolveArchiveWatchable(identifier: string): WatchableVideo {
  return {
    id: identifier,
    title: `Archive Movie (${identifier})`,
    category: 'Internet Archive',
    youtubeId: identifier,
    thumbnail: getArchiveThumbnail(identifier),
    source: 'archive',
  };
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('home');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedVideo, setSelectedVideo] = useState<RoomVideoOption | null>(null);
  const [startSeconds, setStartSeconds] = useState<number>(0);

  // Watch Together vs Watch Alone chooser sheet
  const [choiceVideo, setChoiceVideo] = useState<RoomVideoOption | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  const [watchingVideo, setWatchingVideo] = useState<WatchableVideo | null>(() => {
    const archiveId = getArchiveIdFromUrl();
    if (archiveId) return resolveArchiveWatchable(archiveId);
    const watchId = getWatchIdFromUrl();
    return watchId ? resolveWatchableById(watchId, []) : null;
  });

  const [activeRoom, setActiveRoom] = useState<RoomRecord | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(() => Boolean(getRoomCodeFromUrl()));
  const [roomNotFoundCode, setRoomNotFoundCode] = useState<string | null>(null);

  const [sharedLibrary, setSharedLibrary] = useState<SharedLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const libraryLoadedRef = useRef(false);

  // Live lobby online count (disabled when in Watch Alone solo mode)
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const lobbyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `guest-${Math.random().toString(36).slice(2, 10)}`
  );

  // Watch Party tab inline Join Room box state
  const [partyJoinCode, setPartyJoinCode] = useState('');
  const [partyJoining, setPartyJoining] = useState(false);
  const [partyJoinError, setPartyJoinError] = useState('');

  // See-all genre grid view and jump-to-genre state
  const [seeAllData, setSeeAllData] = useState<SeeAllViewData | null>(null);
  const [forceLoadSlug, setForceLoadSlug] = useState<string | null>(null);

  // TopBar / Movies search state
  const [searchQuery, setSearchQuery] = useState('');
  const [moviesSearchInput, setMoviesSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState(false);

  const loadRoomByCode = async (code: string) => {
    setRoomLoading(true);
    setRoomNotFoundCode(null);
    const { room } = await findRoomByCode(code);
    setRoomLoading(false);

    if (room) {
      setActiveRoom(room);
      setWatchingVideo(null);
      setSeeAllData(null);
    } else {
      setActiveRoom(null);
      setRoomNotFoundCode(code);
    }
  };

  useEffect(() => {
    const initialRoomCode = getRoomCodeFromUrl();
    const initialWatchId = getWatchIdFromUrl();
    const initialArchiveId = getArchiveIdFromUrl();

    if (initialRoomCode) {
      void loadRoomByCode(initialRoomCode);
    } else if (initialWatchId || initialArchiveId) {
      setLibraryLoading(false);
    }

    const handlePopState = () => {
      const code = getRoomCodeFromUrl();
      const archiveId = getArchiveIdFromUrl();
      const watchId = getWatchIdFromUrl();
      if (code) {
        void loadRoomByCode(code);
      } else if (archiveId) {
        setActiveRoom(null);
        setRoomNotFoundCode(null);
        setRoomLoading(false);
        setSeeAllData(null);
        setChoiceVideo(null);
        setWatchingVideo(resolveArchiveWatchable(archiveId));
      } else if (watchId) {
        setActiveRoom(null);
        setRoomNotFoundCode(null);
        setRoomLoading(false);
        setSeeAllData(null);
        setChoiceVideo(null);
        setWatchingVideo(resolveWatchableById(watchId, []));
      } else {
        setActiveRoom(null);
        setWatchingVideo(null);
        setChoiceVideo(null);
        setRoomNotFoundCode(null);
        setRoomLoading(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load shared library when not in Watch Alone solo mode (defers Supabase reads if opened directly with ?watch=)
  useEffect(() => {
    if (watchingVideo || libraryLoadedRef.current) return;
    libraryLoadedRef.current = true;
    setLibraryLoading(true);
    fetchSharedLibrary().then(({ items }) => {
      setSharedLibrary(items);
      setLibraryLoading(false);
    });
  }, [watchingVideo]);

  // Join Supabase Realtime presence on channel "lobby" (skipped during Watch Alone solo playback)
  useEffect(() => {
    if (watchingVideo) return;

    const channel = supabase.channel('lobby', {
      config: {
        presence: { key: lobbyKeyRef.current },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const uniqueClients = Object.keys(state).length;
        setOnlineCount(Math.max(1, uniqueClients));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online: true });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [Boolean(watchingVideo)]);

  const openCreateRoom = (video?: RoomVideoOption, positionSeconds = 0) => {
    setSelectedVideo(video ?? null);
    setStartSeconds(positionSeconds);
    setModalMode('create');
  };

  const openCreateRoomFromPasted = (pasted: PastedYouTubeVideo) => {
    openCreateRoom({
      id: pasted.videoId,
      title: pasted.title,
      thumbnail: pasted.thumbnail,
      youtubeId: pasted.videoId,
    });
  };

  const openCreateRoomFromSearch = (video: YouTubeSearchResult) => {
    openCreateRoom({
      id: video.videoId,
      title: video.title,
      thumbnail: video.thumbnail,
      youtubeId: video.videoId,
    });
  };

  const openCreateRoomFromSample = (video: LibraryVideo) => {
    openCreateRoom({
      id: video.id,
      title: video.title,
      duration: video.duration,
      thumbnail: video.thumbnail,
      youtubeId: video.youtubeId,
    });
  };

  const openCreateRoomFromArchive = (movie: ArchiveMovieItem) => {
    openCreateRoom({
      id: movie.identifier,
      title: movie.title,
      thumbnail: movie.thumbnail,
      youtubeId: movie.identifier,
      source: 'archive',
    });
  };

  const openJoinRoom = () => {
    setSelectedVideo(null);
    setStartSeconds(0);
    setModalMode('join');
  };

  // Start Watch Alone solo mode with ?watch=VIDEO_ID or ?archive=IDENTIFIER (zero Supabase writes)
  const enterWatchAlone = (video: WatchableVideo) => {
    setChoiceVideo(null);
    setModalMode(null);
    setActiveRoom(null);
    setRoomNotFoundCode(null);
    setSeeAllData(null);
    setWatchingVideo(video);

    const url = new URL(window.location.href);
    url.search =
      video.source === 'archive'
        ? `?archive=${encodeURIComponent(video.youtubeId)}`
        : `?watch=${encodeURIComponent(video.youtubeId)}`;
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const enterWatchAloneFromOption = (option: RoomVideoOption) => {
    const youtubeId = option.youtubeId ?? option.id;
    enterWatchAlone({
      id: option.id,
      title: option.title,
      category: option.source === 'archive' ? 'Internet Archive' : 'Movie',
      youtubeId,
      thumbnail:
        option.thumbnail ||
        (option.source === 'archive'
          ? getArchiveThumbnail(youtubeId)
          : getYouTubeThumbnail(youtubeId)),
      duration: option.duration,
      source: option.source,
      videoUrl: option.videoUrl,
    });
  };

  const openChoiceForSample = (video: LibraryVideo) => {
    setChoiceVideo({
      id: video.id,
      title: video.title,
      duration: video.duration,
      thumbnail: video.thumbnail,
      youtubeId: video.youtubeId,
    });
  };

  const openChoiceForSharedLibrary = (item: SharedLibraryItem) => {
    setChoiceVideo({
      id: item.id,
      title: item.title,
      thumbnail: getYouTubeThumbnail(item.video_id),
      youtubeId: item.video_id,
    });
  };

  const openChoiceForSearch = (video: YouTubeSearchResult) => {
    setChoiceVideo({
      id: video.videoId,
      title: video.title,
      thumbnail: video.thumbnail,
      youtubeId: video.videoId,
    });
  };

  const openChoiceForArchive = (movie: ArchiveMovieItem) => {
    setChoiceVideo({
      id: movie.identifier,
      title: movie.title,
      thumbnail: movie.thumbnail,
      youtubeId: movie.identifier,
      source: 'archive',
    });
  };

  const handleSavedToLibrary = (item: SharedLibraryItem) => {
    setSharedLibrary((prev) =>
      prev.some((existing) => existing.id === item.id || existing.video_id === item.video_id)
        ? prev
        : [item, ...prev]
    );
  };

  const handleEnterRoom = (room: RoomRecord) => {
    setModalMode(null);
    setChoiceVideo(null);
    setWatchingVideo(null);
    setSeeAllData(null);
    setRoomNotFoundCode(null);
    setActiveRoom(room);

    const url = new URL(window.location.href);
    url.search = `?room=${encodeURIComponent(room.code)}`;
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openShareForVideo = (videoId: string, title: string) => {
    setShareTarget({
      kind: 'video',
      videoId,
      title,
      url: getWatchAloneLink(videoId),
    });
  };

  const openShareForArchive = (movie: ArchiveMovieItem) => {
    setShareTarget({
      kind: 'video',
      videoId: movie.identifier,
      title: movie.title,
      url: getArchiveWatchAloneLink(movie.identifier),
    });
  };

  const openShareForSite = () => {
    setShareTarget({
      kind: 'site',
      url: getSiteShareLink(),
    });
  };

  const clearRoomAndSubpages = () => {
    setActiveRoom(null);
    setWatchingVideo(null);
    setChoiceVideo(null);
    setShareTarget(null);
    setSeeAllData(null);
    setRoomNotFoundCode(null);
    setRoomLoading(false);

    if (window.location.search) {
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  const handleGoHome = () => {
    clearRoomAndSubpages();
    setSearchQuery('');
    setMoviesSearchInput('');
    setSearchResults(null);
    setSearchError(false);
    setActiveNav('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectNav = (nav: NavSection) => {
    clearRoomAndSubpages();
    setSearchQuery('');
    setMoviesSearchInput('');
    setSearchResults(null);
    setSearchError(false);
    setActiveNav(nav);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchSubmit = async (query: string) => {
    clearRoomAndSubpages();
    setSearchQuery(query);
    setMoviesSearchInput(query);
    setSearching(true);
    setSearchError(false);

    const { results, error } = await searchYouTubeWithCache(query);
    setSearching(false);
    setSearchResults(results);
    setSearchError(error && results.length === 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMoviesSearchFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = moviesSearchInput.trim();
    if (!cleaned) return;
    void handleSearchSubmit(cleaned);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setMoviesSearchInput('');
    setSearchResults(null);
    setSearchError(false);
  };

  const handleJumpToGenre = (genre: CategoryJumpTarget) => {
    setSeeAllData(null);
    setForceLoadSlug(genre.slug);
    if (activeNav === 'watch-party') {
      setActiveNav('movies');
    }

    window.setTimeout(() => {
      const target = document.getElementById(`genre-${genre.slug}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  const handleWatchPartyInlineJoin = async (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = extractRoomCode(partyJoinCode);
    if (!cleanCode) {
      setPartyJoinError('Please enter a room code (for example, NEST-7K4M2Q).');
      return;
    }

    setPartyJoinError('');
    setPartyJoining(true);
    const { room, error } = await findRoomByCode(cleanCode);
    setPartyJoining(false);

    if (error) {
      setPartyJoinError('Could not look up that room right now. Please try again.');
      return;
    }

    if (!room) {
      setPartyJoinError('Room not found. Double-check the code and try again.');
      return;
    }

    setPartyJoinCode('');
    handleEnterRoom(room);
  };

  const focusPasteBar = () => {
    handleClearSearch();
    const el = document.getElementById('home-paste-youtube-input');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  const showBrowseContent =
    !roomLoading && !roomNotFoundCode && !activeRoom && !watchingVideo && !seeAllData;

  return (
    <div id="top" className="min-h-screen bg-[#08080A] text-white flex pb-14 lg:pb-0">
      <Sidebar activeNav={activeNav} onSelectNav={handleSelectNav} />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          searchQuery={searchQuery}
          searching={searching}
          onSearchSubmit={handleSearchSubmit}
          onClearSearch={handleClearSearch}
          onCreateRoom={() => openCreateRoom()}
          onJoinRoom={openJoinRoom}
          onHomeClick={handleGoHome}
        />

        <main className="flex-1">
          {roomLoading ? (
            <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
              <p className="font-display text-lg font-semibold text-white">
                Loading screening room...
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                Checking your room code with MovieNest.
              </p>
            </section>
          ) : roomNotFoundCode ? (
            <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
              <div className="rounded-2xl border border-[#2a2a33] bg-[#14141a] p-6 sm:p-8">
                <h1 className="font-display text-2xl font-bold text-white">
                  Room not found
                </h1>
                <p className="mt-2 text-sm text-zinc-400">
                  We couldn&apos;t find a room with code{' '}
                  <span className="font-mono font-semibold text-[#E50914]">
                    {roomNotFoundCode}
                  </span>
                  . It may have a typo or hasn&apos;t been created yet.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleGoHome}
                    className="min-h-[44px] rounded-lg border border-[#2a2a33] bg-[#1b1b24] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
                  >
                    Back to Home
                  </button>
                  <button
                    type="button"
                    onClick={openJoinRoom}
                    className="min-h-[44px] rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
                  >
                    Try Another Code
                  </button>
                </div>
              </div>
            </section>
          ) : activeRoom ? (
            <RoomPage
              room={activeRoom}
              sharedLibrary={sharedLibrary}
              onBack={handleGoHome}
              onShare={setShareTarget}
            />
          ) : watchingVideo ? (
            <VideoPlayerPage
              video={watchingVideo}
              relatedVideos={LIBRARY_VIDEOS.filter((v) => v.youtubeId !== watchingVideo.youtubeId)}
              onBack={handleGoHome}
              onShare={setShareTarget}
              onInviteFriends={(video, currentSeconds) =>
                openCreateRoom(
                  {
                    id: video.id,
                    title: video.title,
                    duration: video.duration,
                    thumbnail: video.thumbnail,
                    youtubeId: video.youtubeId,
                    source: video.source,
                    videoUrl: video.videoUrl,
                  },
                  currentSeconds
                )
              }
              onSelectSampleVideo={(sample) =>
                enterWatchAlone({
                  id: sample.id,
                  title: sample.title,
                  category: sample.category,
                  youtubeId: sample.youtubeId,
                  thumbnail: sample.thumbnail,
                  duration: sample.duration,
                })
              }
            />
          ) : seeAllData ? (
            <GenreGridView
              data={seeAllData}
              onBack={() => setSeeAllData(null)}
              onWatchYouTube={openChoiceForSearch}
              onCreateRoomYouTube={openCreateRoomFromSearch}
              onShareYouTube={(video) => openShareForVideo(video.videoId, video.title)}
              onSavedToLibrary={handleSavedToLibrary}
              onWatchArchive={openChoiceForArchive}
              onCreateRoomArchive={openCreateRoomFromArchive}
              onShareArchive={openShareForArchive}
            />
          ) : null}

          {showBrowseContent && (
            <>
              {/* Search Results View (from TopBar or Movies search bar) */}
              {searchQuery && (
                <section
                  aria-label="YouTube search results"
                  className="px-4 py-6 sm:px-6 lg:px-8 border-b border-[#2a2a33]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-white">
                        Results for &ldquo;{searchQuery}&rdquo;
                      </h2>
                      {!searching && searchResults && (
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {searchResults.length}{' '}
                          {searchResults.length === 1 ? 'video' : 'videos'} found
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#2a2a33] bg-[#14141a] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-white/30 active:bg-[#252530] cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Clear search</span>
                    </button>
                  </div>

                  {searching ? (
                    <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                      {[0, 1, 2, 3].map((slot) => (
                        <div
                          key={slot}
                          className="rounded-xl border border-[#2a2a33] bg-[#14141a] p-2.5 animate-pulse"
                        >
                          <div className="aspect-video w-full rounded-lg bg-[#1d1d26]" />
                          <div className="mt-3 h-4 w-3/4 rounded bg-[#1d1d26]" />
                          <div className="mt-2 h-3 w-1/2 rounded bg-[#1d1d26]" />
                        </div>
                      ))}
                    </div>
                  ) : searchError ? (
                    <div className="mt-5 rounded-xl border border-[#2a2a33] bg-[#14141a] p-6 text-center">
                      <p className="text-sm font-medium text-white">
                        Search is resting, try again tomorrow, or paste a link
                      </p>
                      <button
                        type="button"
                        onClick={focusPasteBar}
                        className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[#E50914] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
                      >
                        Paste a YouTube link
                      </button>
                    </div>
                  ) : searchResults && searchResults.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-[#2a2a33] bg-[#14141a] p-6 text-center">
                      <p className="text-sm text-zinc-300">
                        No embeddable full-length movies matched &ldquo;{searchQuery}&rdquo;. Try
                        another title or paste a YouTube link below.
                      </p>
                    </div>
                  ) : searchResults ? (
                    <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                      {searchResults.map((video) => (
                        <YouTubeMovieCard
                          key={video.videoId}
                          video={video}
                          onWatch={openChoiceForSearch}
                          onCreateRoom={openCreateRoomFromSearch}
                          onShare={(v) => openShareForVideo(v.videoId, v.title)}
                          onSavedToLibrary={handleSavedToLibrary}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              )}

              {activeNav === 'watch-party' ? (
                <section className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
                  <div className="rounded-2xl border border-[#2a2a33] bg-[#14141a] p-5 sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-200">
                        <span className="h-2 w-2 rounded-full bg-[#E50914]" aria-hidden="true" />
                        <span className="tabular-nums">{onlineCount} online now</span>
                      </div>
                    </div>

                    <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                      Watch Party
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-300">
                      Create a private room or enter a friend&apos;s room code to watch YouTube
                      movies in sync with live chat.
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {/* Create Room card */}
                      <div className="rounded-xl border border-[#2a2a33] bg-[#0d0d12] p-4 sm:p-5 flex flex-col justify-between gap-4">
                        <div>
                          <h2 className="font-display text-base font-semibold text-white">
                            Start a new room
                          </h2>
                          <p className="mt-1 text-xs text-zinc-400">
                            Pick a movie or paste any YouTube link to generate a shareable code.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCreateRoom()}
                          className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
                        >
                          <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                          <span>Create Room</span>
                        </button>
                      </div>

                      {/* Join Room with inline code box */}
                      <form
                        onSubmit={handleWatchPartyInlineJoin}
                        className="rounded-xl border border-[#2a2a33] bg-[#0d0d12] p-4 sm:p-5 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <label
                            htmlFor="watch-party-join-input"
                            className="font-display text-base font-semibold text-white"
                          >
                            Join with a room code
                          </label>
                          <p className="mt-1 text-xs text-zinc-400">
                            Paste an invite link or type a code like NEST-7K4M2Q.
                          </p>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            id="watch-party-join-input"
                            type="text"
                            value={partyJoinCode}
                            onChange={(e) => {
                              setPartyJoinCode(e.target.value);
                              if (partyJoinError) setPartyJoinError('');
                            }}
                            placeholder="e.g. NEST-7K4M2Q"
                            className="min-w-0 flex-1 min-h-[44px] rounded-lg border border-[#2a2a33] bg-[#14141a] px-3.5 py-2 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={partyJoining}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#2a2a33] bg-[#1b1b24] px-4 py-2 text-sm font-semibold text-white whitespace-nowrap transition-colors hover:border-[#E50914] active:bg-[#282834] disabled:opacity-60 cursor-pointer"
                          >
                            <Users className="h-4 w-4 text-[#E50914]" aria-hidden="true" />
                            <span>{partyJoining ? 'Joining...' : 'Join Room'}</span>
                          </button>
                        </div>

                        {partyJoinError && (
                          <p className="text-xs text-[#F87171]" role="alert">
                            {partyJoinError}
                          </p>
                        )}
                      </form>
                    </div>
                  </div>

                  <PasteYouTubeBar
                    variant="modal"
                    inputId="home-paste-youtube-input"
                    onCreateRoomWithVideo={openCreateRoomFromPasted}
                    onSavedToLibrary={handleSavedToLibrary}
                  />

                  <div className="grid grid-cols-1 gap-6 border-t border-[#2a2a33] pt-8 md:grid-cols-3">
                    {HOW_IT_WORKS.map((item) => (
                      <div key={item.step} className="space-y-1.5">
                        <p className="font-mono text-sm font-medium text-[#E50914] tabular-nums">
                          {item.step}
                        </p>
                        <h2 className="font-display text-base font-semibold text-white">
                          {item.title}
                        </h2>
                        <p className="text-sm leading-relaxed text-zinc-400">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <>
                  {activeNav === 'home' && (
                    <>
                      <HeroBanner
                        onlineCount={onlineCount}
                        onWatchClick={(video) => setChoiceVideo(video)}
                        onShareVideoClick={(video) =>
                          openShareForVideo(video.youtubeId ?? video.id, video.title)
                        }
                        onInviteFriendsSite={openShareForSite}
                      />
                      <PasteYouTubeBar
                        variant="home"
                        inputId="home-paste-youtube-input"
                        onCreateRoomWithVideo={openCreateRoomFromPasted}
                        onSavedToLibrary={handleSavedToLibrary}
                      />
                    </>
                  )}

                  {activeNav === 'movies' && (
                    <section className="px-4 pt-6 pb-2 sm:px-6 lg:px-8 space-y-4">
                      <div>
                        <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                          Movies
                        </h1>
                        <p className="mt-1 text-sm text-zinc-400">
                          Search full movies on YouTube or browse every genre below.
                        </p>
                      </div>

                      {hasYouTubeApiKey ? (
                        <form
                          onSubmit={handleMoviesSearchFormSubmit}
                          className="flex items-center gap-2 max-w-xl"
                        >
                          <div className="relative flex-1">
                            <Search
                              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                              aria-hidden="true"
                            />
                            <input
                              type="search"
                              value={moviesSearchInput}
                              onChange={(e) => setMoviesSearchInput(e.target.value)}
                              placeholder="Search full movies on YouTube..."
                              aria-label="Search movies"
                              className="w-full min-h-[44px] rounded-xl border border-[#2a2a33] bg-[#14141a] pl-10 pr-9 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none"
                            />
                            {(moviesSearchInput || searchQuery) && (
                              <button
                                type="button"
                                onClick={handleClearSearch}
                                aria-label="Clear search"
                                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:text-white active:bg-white/10 cursor-pointer"
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <button
                            type="submit"
                            disabled={!moviesSearchInput.trim() || searching}
                            className="min-h-[44px] rounded-xl bg-[#E50914] px-4 py-2 text-sm font-semibold text-white whitespace-nowrap shrink-0 transition-colors hover:bg-[#F40612] active:bg-[#b80710] disabled:opacity-50 cursor-pointer"
                          >
                            {searching ? 'Searching...' : 'Search'}
                          </button>
                        </form>
                      ) : (
                        <PasteYouTubeBar
                          variant="modal"
                          inputId="home-paste-youtube-input"
                          onCreateRoomWithVideo={openCreateRoomFromPasted}
                          onSavedToLibrary={handleSavedToLibrary}
                        />
                      )}
                    </section>
                  )}

                  <CategoryTiles onSelectGenre={handleJumpToGenre} />

                  <GenreRows
                    forceLoadSlug={forceLoadSlug}
                    libraryItems={sharedLibrary}
                    libraryLoading={libraryLoading}
                    sampleVideos={LIBRARY_VIDEOS}
                    onSeeAllGenre={(genre, videos) => {
                      setSeeAllData({ kind: 'youtube', genre, videos });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onSeeAllArchiveGenre={(genre, movies) => {
                      setSeeAllData({ kind: 'archive', genre, movies });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onWatchYouTube={openChoiceForSearch}
                    onCreateRoomYouTube={openCreateRoomFromSearch}
                    onShareYouTube={(video) => openShareForVideo(video.videoId, video.title)}
                    onWatchArchive={openChoiceForArchive}
                    onCreateRoomArchive={openCreateRoomFromArchive}
                    onShareArchive={openShareForArchive}
                    onSavedToLibrary={handleSavedToLibrary}
                    onWatchLibraryItem={openChoiceForSharedLibrary}
                    onShareLibraryItem={(item) => openShareForVideo(item.video_id, item.title)}
                    onWatchSampleVideo={openChoiceForSample}
                    onWatchAloneSample={(sample) =>
                      enterWatchAlone({
                        id: sample.id,
                        title: sample.title,
                        category: sample.category,
                        youtubeId: sample.youtubeId,
                        thumbnail: sample.thumbnail,
                        duration: sample.duration,
                      })
                    }
                    onCreateRoomSample={openCreateRoomFromSample}
                    onShareSample={(sample) => openShareForVideo(sample.youtubeId, sample.title)}
                  />
                </>
              )}
            </>
          )}
        </main>

        <footer className="mt-10 border-t border-[#2a2a33]">
          <div className="flex flex-col items-start justify-between gap-3 px-4 py-6 text-sm text-zinc-400 sm:flex-row sm:items-center sm:px-6 lg:px-8">
            <p className="font-display font-semibold text-white">
              Movie<span className="text-[#E50914]">Nest</span>
            </p>
            <p className="text-xs text-zinc-500">
              Private screening rooms for friends · Built for phones and laptops
            </p>
          </div>
        </footer>
      </div>

      <MobileBottomNav activeNav={activeNav} onSelectNav={handleSelectNav} />

      <WatchChoiceModal
        video={choiceVideo}
        onClose={() => setChoiceVideo(null)}
        onWatchTogether={(video) => {
          setChoiceVideo(null);
          openCreateRoom(video);
        }}
        onWatchAlone={enterWatchAloneFromOption}
      />

      <RoomModal
        mode={modalMode}
        initialVideo={selectedVideo}
        initialPositionSeconds={startSeconds}
        sharedLibrary={sharedLibrary}
        onClose={() => setModalMode(null)}
        onOpenRoom={handleEnterRoom}
        onWatchAlone={(videoId, source) => {
          if (source === 'archive') {
            if (selectedVideo && (selectedVideo.youtubeId === videoId || selectedVideo.id === videoId)) {
              enterWatchAloneFromOption(selectedVideo);
              return;
            }
            enterWatchAlone(resolveArchiveWatchable(videoId));
            return;
          }
          if (selectedVideo && (selectedVideo.youtubeId === videoId || selectedVideo.id === videoId)) {
            enterWatchAloneFromOption(selectedVideo);
            return;
          }
          const resolved = resolveWatchableById(videoId, sharedLibrary);
          enterWatchAlone(resolved);
        }}
        onShareRoom={setShareTarget}
        onSavedToLibrary={handleSavedToLibrary}
      />

      <ShareSheet target={shareTarget} onClose={() => setShareTarget(null)} />
    </div>
  );
}
