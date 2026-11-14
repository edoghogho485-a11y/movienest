import { useEffect, useState } from 'react';
import { ArrowRight, Play, Users, X } from 'lucide-react';
import { Sidebar, MobileBottomNav, NavSection } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { HeroBanner } from './components/HeroBanner';
import { CategoryTiles } from './components/CategoryTiles';
import { GenreRows } from './components/GenreRows';
import { GenreGridView } from './components/GenreGridView';
import { PasteYouTubeBar, PastedYouTubeVideo } from './components/PasteYouTubeBar';
import { VideoPlayerPage, WatchableVideo } from './components/VideoPlayerPage';
import { RoomPage } from './components/RoomPage';
import { ModalMode, RoomModal, RoomVideoOption } from './components/RoomModal';
import { YouTubeMovieCard } from './components/YouTubeMovieCard';
import { GenreDefinition } from './data/genres';
import { LIBRARY_VIDEOS, LibraryVideo } from './data/libraryVideos';
import {
  fetchSharedLibrary,
  findRoomByCode,
  RoomRecord,
  SharedLibraryItem,
} from './lib/supabase';
import {
  getYouTubeThumbnail,
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

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSection>('home');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedVideo, setSelectedVideo] = useState<RoomVideoOption | null>(null);
  const [watchingVideo, setWatchingVideo] = useState<WatchableVideo | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomRecord | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(() => Boolean(getRoomCodeFromUrl()));
  const [roomNotFoundCode, setRoomNotFoundCode] = useState<string | null>(null);

  const [sharedLibrary, setSharedLibrary] = useState<SharedLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  // See-all genre grid view and jump-to-genre state
  const [seeAllData, setSeeAllData] = useState<{
    genre: GenreDefinition;
    videos: YouTubeSearchResult[];
  } | null>(null);
  const [forceLoadSlug, setForceLoadSlug] = useState<string | null>(null);

  // TopBar YouTube search state
  const [searchQuery, setSearchQuery] = useState('');
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
    fetchSharedLibrary().then(({ items }) => {
      setSharedLibrary(items);
      setLibraryLoading(false);
    });

    const initialCode = getRoomCodeFromUrl();
    if (initialCode) {
      void loadRoomByCode(initialCode);
    }

    const handlePopState = () => {
      const code = getRoomCodeFromUrl();
      if (code) {
        void loadRoomByCode(code);
      } else {
        setActiveRoom(null);
        setRoomNotFoundCode(null);
        setRoomLoading(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openCreateRoom = (video?: RoomVideoOption) => {
    setSelectedVideo(video ?? null);
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

  const openJoinRoom = () => {
    setSelectedVideo(null);
    setModalMode('join');
  };

  const openSampleVideoPage = (video: LibraryVideo) => {
    setWatchingVideo({
      id: video.id,
      title: video.title,
      category: video.category,
      youtubeId: video.youtubeId,
      thumbnail: video.thumbnail,
      duration: video.duration,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openSharedLibraryVideoPage = (item: SharedLibraryItem) => {
    setWatchingVideo({
      id: item.id,
      title: item.title,
      category: item.category,
      youtubeId: item.video_id,
      thumbnail: getYouTubeThumbnail(item.video_id),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openSearchVideoPage = (video: YouTubeSearchResult) => {
    setWatchingVideo({
      id: video.videoId,
      title: video.title,
      category: video.channelTitle,
      youtubeId: video.videoId,
      thumbnail: video.thumbnail,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    setWatchingVideo(null);
    setSeeAllData(null);
    setRoomNotFoundCode(null);
    setActiveRoom(room);

    const url = new URL(window.location.href);
    url.search = `?room=${encodeURIComponent(room.code)}`;
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearRoomAndSubpages = () => {
    setActiveRoom(null);
    setWatchingVideo(null);
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
    setSearchResults(null);
    setSearchError(false);
    setActiveNav('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectNav = (nav: NavSection) => {
    clearRoomAndSubpages();
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(false);
    setActiveNav(nav);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchSubmit = async (query: string) => {
    clearRoomAndSubpages();
    setSearchQuery(query);
    setSearching(true);
    setSearchError(false);

    const { results, error } = await searchYouTubeWithCache(query);
    setSearching(false);
    setSearchResults(results);
    setSearchError(error && results.length === 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(false);
  };

  const handleJumpToGenre = (genre: GenreDefinition) => {
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
              <div className="rounded-2xl border border-white/10 bg-[#111116] p-6 sm:p-8">
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
                    className="min-h-[44px] rounded-lg border border-white/15 bg-[#181820] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/30 cursor-pointer"
                  >
                    Back to Home
                  </button>
                  <button
                    type="button"
                    onClick={openJoinRoom}
                    className="min-h-[44px] rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] cursor-pointer"
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
            />
          ) : watchingVideo ? (
            <VideoPlayerPage
              video={watchingVideo}
              relatedVideos={LIBRARY_VIDEOS.filter((v) => v.youtubeId !== watchingVideo.youtubeId)}
              onBack={() => setWatchingVideo(null)}
              onCreateRoomWithVideo={(video) => openCreateRoom(video)}
              onSelectSampleVideo={openSampleVideoPage}
            />
          ) : seeAllData ? (
            <GenreGridView
              genre={seeAllData.genre}
              videos={seeAllData.videos}
              onBack={() => setSeeAllData(null)}
              onWatch={openSearchVideoPage}
              onCreateRoom={openCreateRoomFromSearch}
              onSavedToLibrary={handleSavedToLibrary}
            />
          ) : null}

          {showBrowseContent && (
            <>
              {/* TopBar Search Results View */}
              {searchQuery && (
                <section
                  aria-label="YouTube search results"
                  className="px-4 py-6 sm:px-6 lg:px-8 border-b border-white/10"
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
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#111116] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-white/30 cursor-pointer"
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
                          className="rounded-xl border border-white/10 bg-[#111116] p-2.5 animate-pulse"
                        >
                          <div className="aspect-video w-full rounded-lg bg-[#1A1A22]" />
                          <div className="mt-3 h-4 w-3/4 rounded bg-[#1A1A22]" />
                          <div className="mt-2 h-3 w-1/2 rounded bg-[#1A1A22]" />
                        </div>
                      ))}
                    </div>
                  ) : searchError ? (
                    <div className="mt-5 rounded-xl border border-white/10 bg-[#111116] p-6 text-center">
                      <p className="text-sm font-medium text-white">
                        Search is resting, try again tomorrow, or paste a link
                      </p>
                      <button
                        type="button"
                        onClick={focusPasteBar}
                        className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[#E50914] px-4 py-2 text-xs font-semibold text-white hover:bg-[#F40612] cursor-pointer"
                      >
                        Paste a YouTube link
                      </button>
                    </div>
                  ) : searchResults && searchResults.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-white/10 bg-[#111116] p-6 text-center">
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
                          onWatch={openSearchVideoPage}
                          onCreateRoom={openCreateRoomFromSearch}
                          onSavedToLibrary={handleSavedToLibrary}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              )}

              {activeNav === 'watch-party' ? (
                <section className="px-4 py-8 sm:px-6 lg:px-8 space-y-8">
                  <div className="rounded-2xl border border-[#2a2a33] bg-[#14141a] p-6 sm:p-8">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                      Start a MovieNest Watch Party
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-300">
                      Create a room, share your 6-character code, and watch YouTube movies in sync
                      with live chat on phones and laptops.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => openCreateRoom()}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] cursor-pointer"
                      >
                        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                        <span>Create Room</span>
                      </button>
                      <button
                        type="button"
                        onClick={openJoinRoom}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#181820] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/30 cursor-pointer"
                      >
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span>Join with Room Code</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <PasteYouTubeBar
                    variant="modal"
                    inputId="home-paste-youtube-input"
                    onCreateRoomWithVideo={openCreateRoomFromPasted}
                    onSavedToLibrary={handleSavedToLibrary}
                  />

                  <div className="grid grid-cols-1 gap-6 border-t border-white/10 pt-8 md:grid-cols-3">
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
                      <HeroBanner onWatchTogether={(video) => openCreateRoom(video)} />
                      <PasteYouTubeBar
                        variant="home"
                        inputId="home-paste-youtube-input"
                        onCreateRoomWithVideo={openCreateRoomFromPasted}
                        onSavedToLibrary={handleSavedToLibrary}
                      />
                    </>
                  )}

                  {activeNav === 'movies' && (
                    <div className="px-4 pt-6 sm:px-6 lg:px-8">
                      <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                        Movies
                      </h1>
                      <p className="mt-1 text-sm text-zinc-400">
                        Browse full movies by genre and launch a synced room in one click.
                      </p>
                    </div>
                  )}

                  <CategoryTiles onSelectGenre={handleJumpToGenre} />

                  <GenreRows
                    forceLoadSlug={forceLoadSlug}
                    libraryItems={sharedLibrary}
                    libraryLoading={libraryLoading}
                    sampleVideos={LIBRARY_VIDEOS}
                    onSeeAllGenre={(genre, videos) => {
                      setSeeAllData({ genre, videos });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onWatchYouTube={openSearchVideoPage}
                    onCreateRoomYouTube={openCreateRoomFromSearch}
                    onSavedToLibrary={handleSavedToLibrary}
                    onWatchLibraryItem={openSharedLibraryVideoPage}
                    onWatchSampleVideo={openSampleVideoPage}
                    onCreateRoomSample={openCreateRoomFromSample}
                  />
                </>
              )}
            </>
          )}
        </main>

        <footer className="mt-10 border-t border-white/10">
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

      <RoomModal
        mode={modalMode}
        initialVideo={selectedVideo}
        sharedLibrary={sharedLibrary}
        onClose={() => setModalMode(null)}
        onOpenRoom={handleEnterRoom}
        onSavedToLibrary={handleSavedToLibrary}
      />
    </div>
  );
}
