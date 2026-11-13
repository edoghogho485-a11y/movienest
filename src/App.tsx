import { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { YouTubeSearchBar } from './components/YouTubeSearchBar';
import { YouTubeBrowseRows } from './components/YouTubeBrowseRows';
import { PasteYouTubeBar, PastedYouTubeVideo } from './components/PasteYouTubeBar';
import { SharedLibraryRows } from './components/SharedLibraryRows';
import { VideoPlayerPage, WatchableVideo } from './components/VideoPlayerPage';
import { RoomPage } from './components/RoomPage';
import { ModalMode, RoomModal, RoomVideoOption } from './components/RoomModal';
import { LIBRARY_VIDEOS, LibraryVideo } from './data/libraryVideos';
import {
  fetchSharedLibrary,
  findRoomByCode,
  RoomRecord,
  SharedLibraryItem,
} from './lib/supabase';
import {
  getYouTubeThumbnail,
  hasYouTubeApiKey,
  YouTubeSearchResult,
} from './lib/youtube';

const HOW_IT_WORKS = [
  {
    step: '01.',
    title: 'Open a private room',
    description: 'Pick any video from your library or paste a YouTube link to launch a private room.',
  },
  {
    step: '02.',
    title: 'Invite your friends',
    description: 'Share the short room code so everyone joins from their phone or laptop.',
  },
  {
    step: '03.',
    title: 'Stay in sync',
    description: 'Play, pause, and scrub together without counting down on a voice call.',
  },
];

function getRoomCodeFromUrl(): string | null {
  const param = new URLSearchParams(window.location.search).get('room');
  return param ? param.trim().toUpperCase() : null;
}

export default function App() {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedVideo, setSelectedVideo] = useState<RoomVideoOption | null>(null);
  const [watchingVideo, setWatchingVideo] = useState<WatchableVideo | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomRecord | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(() => Boolean(getRoomCodeFromUrl()));
  const [roomNotFoundCode, setRoomNotFoundCode] = useState<string | null>(null);

  const [sharedLibrary, setSharedLibrary] = useState<SharedLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);

  const loadRoomByCode = async (code: string) => {
    setRoomLoading(true);
    setRoomNotFoundCode(null);
    const { room } = await findRoomByCode(code);
    setRoomLoading(false);

    if (room) {
      setActiveRoom(room);
      setWatchingVideo(null);
    } else {
      setActiveRoom(null);
      setRoomNotFoundCode(code);
    }
  };

  useEffect(() => {
    // Load shared Supabase library
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
    setRoomNotFoundCode(null);
    setActiveRoom(room);

    const url = new URL(window.location.href);
    url.search = `?room=${encodeURIComponent(room.code)}`;
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoHome = () => {
    setActiveRoom(null);
    setWatchingVideo(null);
    setRoomNotFoundCode(null);
    setRoomLoading(false);

    if (window.location.search) {
      window.history.pushState({}, '', window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const focusPasteBar = () => {
    const el = document.getElementById('home-paste-youtube-input');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  return (
    <div id="top" className="min-h-screen bg-[#07090F] text-slate-50 flex flex-col">
      <Navbar
        onCreateRoom={() => openCreateRoom()}
        onJoinRoom={openJoinRoom}
        onHomeClick={handleGoHome}
      />

      <main className="flex-1">
        {roomLoading ? (
          <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
            <p className="font-display text-lg font-semibold text-slate-100">
              Loading screening room...
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Checking your room code with MovieNest.
            </p>
          </section>
        ) : roomNotFoundCode ? (
          <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
            <div className="rounded-2xl border border-white/10 bg-[#111625] p-6 sm:p-8">
              <h1 className="font-display text-2xl font-bold text-slate-50">
                Room not found
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                We couldn&apos;t find a room with code{' '}
                <span className="font-mono font-semibold text-amber-400">
                  {roomNotFoundCode}
                </span>
                . It may have a typo or hasn&apos;t been created yet.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleGoHome}
                  className="min-h-[44px] rounded-lg border border-white/15 bg-[#161D30] px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-white/30 cursor-pointer"
                >
                  Back to Home
                </button>
                <button
                  type="button"
                  onClick={openJoinRoom}
                  className="min-h-[44px] rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 cursor-pointer"
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
        ) : (
          <>
            <Hero onCreateRoom={() => openCreateRoom()} onJoinRoom={openJoinRoom} />

            {/* Show YouTube Search Bar only when VITE_YOUTUBE_API_KEY is configured */}
            {hasYouTubeApiKey && (
              <div className="border-t border-white/10">
                <YouTubeSearchBar
                  onWatch={openSearchVideoPage}
                  onCreateRoom={openCreateRoomFromSearch}
                  onSavedToLibrary={handleSavedToLibrary}
                  onFocusPasteBar={focusPasteBar}
                />
              </div>
            )}

            {/* Paste-a-Link bar on the home page (always visible) */}
            <div className={hasYouTubeApiKey ? '' : 'border-t border-white/10'}>
              <PasteYouTubeBar
                variant="home"
                inputId="home-paste-youtube-input"
                onCreateRoomWithVideo={openCreateRoomFromPasted}
                onSavedToLibrary={handleSavedToLibrary}
              />
            </div>

            {/* Sideways-scrolling YouTube movie rows (hidden when API key is missing) */}
            {hasYouTubeApiKey && (
              <div className="border-t border-white/10">
                <YouTubeBrowseRows
                  onWatch={openSearchVideoPage}
                  onCreateRoom={openCreateRoomFromSearch}
                  onSavedToLibrary={handleSavedToLibrary}
                  onFocusPasteBar={focusPasteBar}
                />
              </div>
            )}

            {/* Shared Library rows (when API key is present) + Sample Videos row */}
            <div className="border-t border-white/10">
              <SharedLibraryRows
                libraryItems={sharedLibrary}
                loading={libraryLoading}
                sampleVideos={LIBRARY_VIDEOS}
                showCategoryRows={hasYouTubeApiKey}
                onWatchLibraryItem={openSharedLibraryVideoPage}
                onWatchSampleVideo={openSampleVideoPage}
                onFocusPasteBar={focusPasteBar}
              />
            </div>

            <section
              aria-labelledby="how-it-works-heading"
              className="mx-auto max-w-6xl border-t border-white/10 px-4 py-12 sm:px-6 sm:py-14 lg:px-8"
            >
              <h2
                id="how-it-works-heading"
                className="font-display text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
              >
                Simple private watch parties
              </h2>

              <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
                {HOW_IT_WORKS.map((item) => (
                  <div key={item.step} className="space-y-2">
                    <p className="font-mono text-sm font-medium text-amber-400 tabular-nums">
                      {item.step}
                    </p>
                    <h3 className="font-display text-base font-semibold text-slate-100">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-400">{item.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p className="font-display font-semibold text-slate-200">
            Movie<span className="text-amber-400">Nest</span>
          </p>
          <p className="text-xs text-slate-500">
            Private screening rooms for friends · Built for phones and laptops
          </p>
        </div>
      </footer>

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
