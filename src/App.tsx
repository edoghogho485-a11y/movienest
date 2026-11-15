import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bookmark, Play, Search, Users, X } from 'lucide-react';
import { Sidebar, MobileBottomNav, NavSection } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { HeroBanner } from './components/HeroBanner';
import { HomeMoodResults } from './components/HomeMoodResults';
import { TonightsPicksRow } from './components/TonightsPicksRow';
import { MovieNestLogo } from './components/MovieNestLogo';
import { NewThisWeekRow } from './components/NewThisWeekRow';
import { ContinueWatchingRow } from './components/ContinueWatchingRow';
import { MyListPage } from './components/MyListPage';
import { CategoryJumpTarget, CategoryTiles } from './components/CategoryTiles';
import { GenreRows } from './components/GenreRows';
import { GenreGridView, SeeAllViewData } from './components/GenreGridView';
import { PasteYouTubeBar, PastedYouTubeVideo } from './components/PasteYouTubeBar';
import { VideoPlayerPage, WatchableVideo } from './components/VideoPlayerPage';
import { RoomPage } from './components/RoomPage';
import { RoomErrorBoundary } from './components/RoomErrorBoundary';
import { ModalMode, RoomModal, RoomVideoOption } from './components/RoomModal';
import { WatchChoiceModal } from './components/WatchChoiceModal';
import { ShareSheet } from './components/ShareSheet';
import { UsernameModal, UsernameModalMode } from './components/UsernameModal';
import { ArchiveMovieCard } from './components/ArchiveMovieCard';
import { YouTubeMovieCard } from './components/YouTubeMovieCard';
import { useLocalLists, useWatchLaterToast } from './hooks/useLocalLists';
import { LIBRARY_VIDEOS } from './data/libraryVideos';
import { FEATURED_VIDEOS } from './data/videos';
import { ArchiveMovieItem, getArchiveThumbnail } from './lib/archive';
import {
  BROKEN_VIDEOS_UPDATED_EVENT,
  makeBrokenVideoKey,
  readBrokenVideoKeys,
} from './lib/brokenVideos';
import {
  EMPTY_LEGAL_CATALOG,
  filterCatalogByBrokenVideos,
  getNewThisWeekItems,
  getVideoSourceLabel,
  LegalCatalogState,
  loadAllLegalSources,
  ourPickToYouTubeResult,
  searchLegalCatalog,
} from './lib/legalSources';
import { WatchHistoryItem, WatchLaterItem } from './lib/localLists';
import {
  getHeroFeaturedMoviesFromCatalog,
  getMoodVideosFromCatalog,
  getTonightsPicksFromCatalog,
  LegalPickItem,
  MoodId,
  pickSurpriseFromCatalog,
} from './lib/moodCatalog';
import {
  getArchiveWatchAloneLink,
  getWatchAloneLink,
  ShareTarget,
} from './lib/share';
import {
  findRoomByCode,
  getMyUsername,
  getOrCreateDeviceId,
  isRoomHost,
  isValidRoomCode,
  normalizeRoomRecord,
  RoomRecord,
  SharedLibraryItem,
  supabase,
  UserProfile,
} from './lib/supabase';
import {
  getYouTubeThumbnail,
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
      sourceLabel: 'Our picks',
    };
  }

  return {
    id: videoId,
    title: `YouTube Video (${videoId})`,
    category: 'Movie',
    youtubeId: videoId,
    thumbnail: getYouTubeThumbnail(videoId),
    sourceLabel: 'YouTube',
  };
}

function resolveArchiveWatchable(identifier: string): WatchableVideo {
  return {
    id: identifier,
    title: `Archive Movie (${identifier})`,
    category: 'Public domain',
    youtubeId: identifier,
    thumbnail: getArchiveThumbnail(identifier),
    source: 'archive',
    sourceLabel: 'Public domain',
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

  // Device-only Watch Later & Continue Watching / History lists
  const {
    watchLater,
    history,
    continueWatching,
    removeFromWatchLater,
    removeFromHistory,
    clearAllHistory,
  } = useLocalLists();
  const watchLaterToast = useWatchLaterToast();

  const [watchingVideo, setWatchingVideo] = useState<WatchableVideo | null>(() => {
    const archiveId = getArchiveIdFromUrl();
    if (archiveId) return resolveArchiveWatchable(archiveId);
    const watchId = getWatchIdFromUrl();
    return watchId ? resolveWatchableById(watchId, []) : null;
  });

  const [activeRoom, setActiveRoom] = useState<RoomRecord | null>(null);
  const [justCreatedRoomCode, setJustCreatedRoomCode] = useState<string | null>(null);
  const [roomLoading, setRoomLoading] = useState<boolean>(() => Boolean(getRoomCodeFromUrl()));
  const [roomNotFoundCode, setRoomNotFoundCode] = useState<string | null>(null);
  const [roomLockedCode, setRoomLockedCode] = useState<string | null>(null);

  // Unique persistent device username state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(true);
  const [usernameModalMode, setUsernameModalMode] = useState<UsernameModalMode>(null);
  const [usernameModalDismissible, setUsernameModalDismissible] = useState(true);
  const pendingRoomAfterUsernameRef = useRef<RoomRecord | null>(null);
  const pendingActionAfterUsernameRef = useRef<(() => void) | null>(null);
  const userProfileRef = useRef<UserProfile | null>(null);
  userProfileRef.current = userProfile;

  // 4 legal movie sources state (Trusted Channels, Creative Commons, Internet Archive, Our picks)
  const [legalCatalog, setLegalCatalog] = useState<LegalCatalogState>(EMPTY_LEGAL_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [heroMoviesReady, setHeroMoviesReady] = useState(false);
  const [brokenVideoKeys, setBrokenVideoKeys] = useState<Set<string>>(() =>
    readBrokenVideoKeys()
  );
  const catalogLoadedRef = useRef(false);
  const visibleCatalog = filterCatalogByBrokenVideos(legalCatalog, brokenVideoKeys);
  const sharedLibrary = visibleCatalog.ourPicks;

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

  // See-all genre grid view state
  const [seeAllData, setSeeAllData] = useState<SeeAllViewData | null>(null);

  // Home mood filters & Surprise Me pick
  const [selectedMood, setSelectedMood] = useState<MoodId | null>(null);
  const [surpriseItem, setSurpriseItem] = useState<LegalPickItem | null>(null);

  // TopBar / Movies search state (searches strictly across the 4 legal sources)
  const [searchQuery, setSearchQuery] = useState('');
  const [moviesSearchInput, setMoviesSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    youtube: YouTubeSearchResult[];
    archive: ArchiveMovieItem[];
  } | null>(null);

  const loadRoomByCode = async (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!isValidRoomCode(normalized)) {
      setRoomLoading(false);
      setActiveRoom(null);
      setRoomLockedCode(null);
      setRoomNotFoundCode(normalized || 'INVALID');
      return;
    }

    setRoomLoading(true);
    setRoomNotFoundCode(null);
    setRoomLockedCode(null);
    const { room } = await findRoomByCode(normalized);
    setRoomLoading(false);

    if (room) {
      if (room.locked && !isRoomHost(room)) {
        setActiveRoom(null);
        setRoomLockedCode(normalized);
        return;
      }
      if (!userProfileRef.current) {
        // Hold room entry until the visitor chooses a unique username
        pendingRoomAfterUsernameRef.current = room;
        setActiveRoom(null);
        setUsernameModalDismissible(false);
        setUsernameModalMode('claim');
        return;
      }
      setJustCreatedRoomCode(null);
      setActiveRoom(room);
      setWatchingVideo(null);
      setSeeAllData(null);
    } else {
      setActiveRoom(null);
      setRoomNotFoundCode(normalized);
    }
  };

  useEffect(() => {
    const initialRoomCode = getRoomCodeFromUrl();
    const initialWatchId = getWatchIdFromUrl();
    const initialArchiveId = getArchiveIdFromUrl();

    const bootstrapApp = async () => {
      // Create or read persistent device ID ("movienest_device") and restore username on every load
      const deviceId = getOrCreateDeviceId();
      const restoredProfile = await getMyUsername(deviceId);
      userProfileRef.current = restoredProfile;
      setUserProfile(restoredProfile);
      setUsernameLoading(false);

      if (initialRoomCode) {
        await loadRoomByCode(initialRoomCode);
      } else if (initialWatchId || initialArchiveId) {
        setCatalogLoading(false);
      } else if (!restoredProfile) {
        // First visit on browse page: show "Choose your username" pop-up
        setUsernameModalDismissible(true);
        setUsernameModalMode('claim');
      }
    };

    void bootstrapApp();

    const handlePopState = () => {
      const code = getRoomCodeFromUrl();
      const archiveId = getArchiveIdFromUrl();
      const watchId = getWatchIdFromUrl();
      if (code) {
        void loadRoomByCode(code);
      } else if (archiveId) {
        setActiveRoom(null);
        setRoomNotFoundCode(null);
        setRoomLockedCode(null);
        setRoomLoading(false);
        setSeeAllData(null);
        setChoiceVideo(null);
        setWatchingVideo(resolveArchiveWatchable(archiveId));
      } else if (watchId) {
        setActiveRoom(null);
        setRoomNotFoundCode(null);
        setRoomLockedCode(null);
        setRoomLoading(false);
        setSeeAllData(null);
        setChoiceVideo(null);
        setWatchingVideo(resolveWatchableById(watchId, []));
      } else {
        setActiveRoom(null);
        setWatchingVideo(null);
        setChoiceVideo(null);
        setRoomNotFoundCode(null);
        setRoomLockedCode(null);
        setRoomLoading(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Hide any videos that failed playback on this device immediately across all views
  useEffect(() => {
    const handleBrokenUpdated = () => {
      setBrokenVideoKeys(readBrokenVideoKeys());
    };
    window.addEventListener(BROKEN_VIDEOS_UPDATED_EVENT, handleBrokenUpdated);
    return () => {
      window.removeEventListener(BROKEN_VIDEOS_UPDATED_EVENT, handleBrokenUpdated);
    };
  }, []);

  // Load the 4 legal movie sources with automatic caching (24h Trusted Channels/Archive, 72h CC)
  useEffect(() => {
    if (watchingVideo || catalogLoadedRef.current) return;
    catalogLoadedRef.current = true;
    setCatalogLoading(true);
    void loadAllLegalSources()
      .then((loaded) => {
        setLegalCatalog(loaded);
      })
      .finally(() => {
        setCatalogLoading(false);
        setHeroMoviesReady(true);
      });
  }, [watchingVideo]);

  // Join Supabase Realtime presence on channel "lobby" ONLY when on the home page
  const isHomePage =
    !roomLoading &&
    !roomNotFoundCode &&
    !roomLockedCode &&
    !activeRoom &&
    !watchingVideo &&
    !seeAllData &&
    activeNav === 'home';
  const lobbyChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!isHomePage) return;

    let isEffectActive = true;

    const setupLobby = async () => {
      // Remove any stale "lobby" channel first (handles StrictMode double-mount cleanly)
      const existingLobby = supabase
        .getChannels()
        .filter((c) => c.topic === 'realtime:lobby');
      if (existingLobby.length > 0) {
        await Promise.all(
          existingLobby.map(async (c) => {
            try {
              await supabase.removeChannel(c);
            } catch {
              // Ignore unsubscribe error and force teardown below
            }
            if (supabase.getChannels().includes(c)) {
              try {
                (c as unknown as { teardown?: () => void }).teardown?.();
              } catch {
                // Ignore teardown error
              }
            }
          })
        );
      }

      if (!isEffectActive) return;

      const channel = supabase.channel('lobby', {
        config: {
          presence: { key: lobbyKeyRef.current },
        },
      });
      lobbyChannelRef.current = channel;

      // Register all listeners BEFORE calling .subscribe()
      channel
        .on('presence', { event: 'sync' }, () => {
          if (!isEffectActive) return;
          const state = channel.presenceState();
          const uniqueClients = Object.keys(state).length;
          setOnlineCount(Math.max(1, uniqueClients));
        })
        .subscribe(async (status) => {
          if (!isEffectActive) return;
          if (status === 'SUBSCRIBED') {
            try {
              await channel.track({ online: true });
            } catch {
              // Ignore transient track errors
            }
          }
        });
    };

    void setupLobby();

    return () => {
      isEffectActive = false;
      const channel = lobbyChannelRef.current;
      lobbyChannelRef.current = null;
      if (channel) {
        void channel.untrack().catch(() => {});
        void supabase.removeChannel(channel);
      }
    };
  }, [isHomePage]);

  const requireUsernameBefore = (action: () => void, dismissible = true) => {
    if (userProfileRef.current) {
      action();
      return;
    }
    pendingActionAfterUsernameRef.current = action;
    setUsernameModalDismissible(dismissible);
    setUsernameModalMode('claim');
  };

  const openCreateRoom = (video?: RoomVideoOption, positionSeconds = 0) => {
    requireUsernameBefore(() => {
      setSelectedVideo(video ?? null);
      setStartSeconds(positionSeconds);
      setModalMode('create');
    });
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
    requireUsernameBefore(() => {
      setSelectedVideo(null);
      setStartSeconds(0);
      setModalMode('join');
    });
  };

  // Start Watch Alone solo mode with ?watch=VIDEO_ID or ?archive=IDENTIFIER (zero Supabase writes)
  const enterWatchAlone = (video: WatchableVideo) => {
    setChoiceVideo(null);
    setModalMode(null);
    setActiveRoom(null);
    setRoomNotFoundCode(null);
    setRoomLockedCode(null);
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
    const sourceType = option.source === 'archive' ? 'archive' : 'youtube';
    const sourceLabel = getVideoSourceLabel(youtubeId, sourceType, legalCatalog);
    enterWatchAlone({
      id: option.id,
      title: option.title,
      category: sourceType === 'archive' ? 'Public domain' : sourceLabel,
      youtubeId,
      thumbnail:
        option.thumbnail ||
        (option.source === 'archive'
          ? getArchiveThumbnail(youtubeId)
          : getYouTubeThumbnail(youtubeId)),
      duration: option.duration,
      source: option.source,
      sourceLabel,
      videoUrl: option.videoUrl,
      initialPositionSeconds: option.positionSeconds,
    });
  };

  const openChoiceForLocalItem = (
    item: WatchLaterItem | WatchHistoryItem,
    resumeSeconds = 0
  ) => {
    const safeResume = resumeSeconds > 0 ? Math.floor(resumeSeconds) : 0;
    setChoiceVideo({
      id: item.id,
      title: item.title,
      thumbnail:
        item.thumbnail ||
        (item.source === 'archive'
          ? getArchiveThumbnail(item.id)
          : getYouTubeThumbnail(item.id)),
      youtubeId: item.id,
      source: item.source,
      videoUrl: item.video_url,
      positionSeconds: safeResume > 0 ? safeResume : undefined,
    });
  };

  const openCreateRoomForLocalItem = (
    item: WatchLaterItem | WatchHistoryItem,
    resumeSeconds = 0
  ) => {
    openCreateRoom(
      {
        id: item.id,
        title: item.title,
        thumbnail:
          item.thumbnail ||
          (item.source === 'archive'
            ? getArchiveThumbnail(item.id)
            : getYouTubeThumbnail(item.id)),
        youtubeId: item.id,
        source: item.source,
        videoUrl: item.video_url,
        positionSeconds: resumeSeconds > 0 ? Math.floor(resumeSeconds) : undefined,
      },
      resumeSeconds > 0 ? Math.floor(resumeSeconds) : 0
    );
  };

  const openShareForLocalItem = (item: WatchLaterItem | WatchHistoryItem) => {
    if (item.source === 'archive') {
      openShareForArchive({
        identifier: item.id,
        title: item.title,
        thumbnail: item.thumbnail,
      });
    } else {
      openShareForVideo(item.id, item.title);
    }
  };

  const openChoiceForOurPick = (item: SharedLibraryItem) => {
    setChoiceVideo({
      id: item.video_id,
      title: item.title,
      thumbnail: getYouTubeThumbnail(item.video_id),
      youtubeId: item.video_id,
    });
  };

  const openCreateRoomFromOurPick = (item: SharedLibraryItem) => {
    openCreateRoom({
      id: item.video_id,
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

  const handleEnterRoom = (rawRoom: RoomRecord) => {
    const room = normalizeRoomRecord(rawRoom);
    if (!room) {
      setModalMode(null);
      setActiveRoom(null);
      setRoomNotFoundCode('INVALID');
      return;
    }

    if (room.locked && !isRoomHost(room)) {
      setModalMode(null);
      setActiveRoom(null);
      setRoomLockedCode(room.code);
      return;
    }

    if (!userProfileRef.current) {
      pendingRoomAfterUsernameRef.current = room;
      setModalMode(null);
      setUsernameModalDismissible(false);
      setUsernameModalMode('claim');
      return;
    }

    setModalMode(null);
    setChoiceVideo(null);
    setWatchingVideo(null);
    setSeeAllData(null);
    setRoomNotFoundCode(null);
    setRoomLockedCode(null);
    setJustCreatedRoomCode(modalMode === 'create' ? room.code : null);
    setActiveRoom(room);

    try {
      const url = new URL(window.location.href);
      url.search = `?room=${encodeURIComponent(room.code)}`;
      window.history.pushState({}, '', url.toString());
    } catch {
      // Ignore history errors in restricted environments
    }
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

  const clearRoomAndSubpages = () => {
    setActiveRoom(null);
    setWatchingVideo(null);
    setChoiceVideo(null);
    setShareTarget(null);
    setSeeAllData(null);
    setRoomNotFoundCode(null);
    setRoomLockedCode(null);
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
    setActiveNav('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectNav = (nav: NavSection) => {
    clearRoomAndSubpages();
    setSearchQuery('');
    setMoviesSearchInput('');
    setSearchResults(null);
    setActiveNav(nav);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchSubmit = async (query: string) => {
    clearRoomAndSubpages();
    setSearchQuery(query);
    setMoviesSearchInput(query);
    setSearching(true);

    // Search strictly across our 4 legal movie sources
    let catalogToSearch = legalCatalog;
    if (!catalogLoadedRef.current) {
      catalogLoadedRef.current = true;
      catalogToSearch = await loadAllLegalSources();
      setLegalCatalog(catalogToSearch);
      setCatalogLoading(false);
      setHeroMoviesReady(true);
    }

    const filteredCatalog = filterCatalogByBrokenVideos(
      catalogToSearch,
      readBrokenVideoKeys()
    );
    setSearchResults(searchLegalCatalog(filteredCatalog, query));
    setSearching(false);
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
  };

  const handleJumpToGenre = (genre: CategoryJumpTarget) => {
    setSeeAllData(null);
    if (activeNav !== 'movies') {
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
    if (!userProfileRef.current) {
      setUsernameModalDismissible(true);
      setUsernameModalMode('claim');
      return;
    }

    const cleanCode = extractRoomCode(partyJoinCode);
    if (!isValidRoomCode(cleanCode)) {
      setPartyJoinError('Please enter a valid room code like NEST-7K4M2Q.');
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

    if (room.locked && !isRoomHost(room)) {
      setPartyJoinError('This room is locked.');
      return;
    }

    setPartyJoinCode('');
    handleEnterRoom(room);
  };

  const focusPasteBar = () => {
    handleClearSearch();
    const existing = document.getElementById('home-paste-youtube-input');
    if (existing) {
      existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      existing.focus();
      return;
    }
    setActiveNav('watch-party');
    window.setTimeout(() => {
      const el = document.getElementById('home-paste-youtube-input');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }, 80);
  };

  const moodItems =
    selectedMood && selectedMood !== 'surprise'
      ? getMoodVideosFromCatalog(selectedMood, visibleCatalog)
      : [];
  const heroFeaturedMovies = getHeroFeaturedMoviesFromCatalog(visibleCatalog);
  const tonightsPicks = getTonightsPicksFromCatalog(visibleCatalog);
  const newThisWeekItems = getNewThisWeekItems(visibleCatalog);
  const visibleContinueWatching = continueWatching.filter(
    (item) => !brokenVideoKeys.has(makeBrokenVideoKey(item.source, item.id))
  );

  const visibleSurpriseItem =
    surpriseItem &&
    !brokenVideoKeys.has(
      makeBrokenVideoKey(
        surpriseItem.kind === 'archive' ? 'archive' : 'youtube',
        surpriseItem.kind === 'archive'
          ? surpriseItem.movie.identifier
          : surpriseItem.video.videoId
      )
    )
      ? surpriseItem
      : null;

  const getCurrentSurpriseKey = (item: LegalPickItem | null) =>
    item ? (item.kind === 'youtube' ? item.video.videoId : item.movie.identifier) : undefined;

  const handleSelectMood = (moodId: MoodId) => {
    if (moodId === 'surprise') {
      setSelectedMood('surprise');
      setSurpriseItem((current) =>
        pickSurpriseFromCatalog(visibleCatalog, getCurrentSurpriseKey(current))
      );
      return;
    }
    setSelectedMood((prev) => (prev === moodId ? null : moodId));
  };

  const handleAnotherSurprise = () => {
    setSurpriseItem((current) =>
      pickSurpriseFromCatalog(visibleCatalog, getCurrentSurpriseKey(current))
    );
  };

  const handleHeroWatchAlone = () => {
    const firstPick = tonightsPicks[0];
    if (firstPick?.kind === 'youtube') {
      enterWatchAlone({
        id: firstPick.video.videoId,
        title: firstPick.video.title,
        category: firstPick.video.sourceLabel || firstPick.video.channelTitle || 'Movie',
        youtubeId: firstPick.video.videoId,
        thumbnail: firstPick.video.thumbnail,
        duration: firstPick.video.duration,
        sourceLabel:
          firstPick.video.sourceLabel ??
          getVideoSourceLabel(firstPick.video.videoId, 'youtube', legalCatalog),
      });
      return;
    }
    if (firstPick?.kind === 'archive') {
      enterWatchAlone({
        id: firstPick.movie.identifier,
        title: firstPick.movie.title,
        category: 'Public domain',
        youtubeId: firstPick.movie.identifier,
        thumbnail: firstPick.movie.thumbnail,
        source: 'archive',
        sourceLabel: 'Public domain',
      });
      return;
    }
    handleSelectNav('movies');
  };

  // Related legal picks shown below the Watch Alone player
  const relatedWatchables: WatchableVideo[] = watchingVideo
    ? [
        ...visibleCatalog.ourPicks.map(ourPickToYouTubeResult),
        ...visibleCatalog.trustedVideos,
        ...visibleCatalog.creativeCommons,
      ]
        .filter((v) => v.videoId !== watchingVideo.youtubeId)
        .slice(0, 4)
        .map((v) => ({
          id: v.videoId,
          title: v.title,
          category: v.sourceLabel || v.channelTitle,
          youtubeId: v.videoId,
          thumbnail: v.thumbnail,
          duration: v.duration,
          sourceLabel:
            v.sourceLabel ?? getVideoSourceLabel(v.videoId, 'youtube', legalCatalog),
        }))
    : [];

  const filteredSearchResults = searchResults
    ? {
        youtube: searchResults.youtube.filter(
          (v) => !brokenVideoKeys.has(makeBrokenVideoKey('youtube', v.videoId))
        ),
        archive: searchResults.archive.filter(
          (m) => !brokenVideoKeys.has(makeBrokenVideoKey('archive', m.identifier))
        ),
      }
    : null;

  const filteredSeeAllData: SeeAllViewData | null = seeAllData
    ? seeAllData.kind === 'youtube'
      ? {
          ...seeAllData,
          videos: seeAllData.videos.filter(
            (v) => !brokenVideoKeys.has(makeBrokenVideoKey('youtube', v.videoId))
          ),
        }
      : seeAllData.kind === 'archive'
        ? {
            ...seeAllData,
            movies: seeAllData.movies.filter(
              (m) => !brokenVideoKeys.has(makeBrokenVideoKey('archive', m.identifier))
            ),
          }
        : {
            ...seeAllData,
            items: seeAllData.items.filter(
              (item) => !brokenVideoKeys.has(makeBrokenVideoKey('youtube', item.video_id))
            ),
          }
    : null;

  const isRoomView = Boolean(
    activeRoom && !roomLoading && !roomNotFoundCode && !roomLockedCode
  );

  const showBrowseContent =
    !roomLoading &&
    !roomNotFoundCode &&
    !roomLockedCode &&
    !activeRoom &&
    !watchingVideo &&
    !seeAllData;

  return (
    <div
      id="top"
      className={`min-h-screen bg-[#14110f] text-[#f4ece1] flex ${
        isRoomView ? '' : 'pb-16 lg:pb-0'
      }`}
    >
      {!isRoomView && <Sidebar activeNav={activeNav} onSelectNav={handleSelectNav} />}

      <div className="flex-1 min-w-0 flex flex-col">
        {!isRoomView && (
          <TopBar
            searchQuery={searchQuery}
            searching={searching}
            userProfile={userProfile}
            usernameLoading={usernameLoading}
            onSearchSubmit={handleSearchSubmit}
            onClearSearch={handleClearSearch}
            onCreateRoom={() => openCreateRoom()}
            onJoinRoom={openJoinRoom}
            onHomeClick={handleGoHome}
            onOpenClaimUsername={() => {
              setUsernameModalDismissible(true);
              setUsernameModalMode('claim');
            }}
            onOpenChangeUsername={() => {
              setUsernameModalDismissible(true);
              setUsernameModalMode('change');
            }}
          />
        )}

        <main className="flex-1">
          {roomLoading ? (
            <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
              <p className="text-lg font-bold text-[#f4ece1]">
                Loading screening room...
              </p>
              <p className="mt-2 text-sm text-[#b9aa98]">
                Checking your room code with MovieNest.
              </p>
            </section>
          ) : roomNotFoundCode ? (
            <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
              <div className="rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-6 sm:p-8">
                <h1 className="text-2xl font-bold text-[#f4ece1]">
                  Room not found
                </h1>
                <p className="mt-2 text-sm text-[#b9aa98]">
                  We couldn&apos;t find a room with code{' '}
                  <span className="font-mono font-bold text-[#f2a33a]">
                    {roomNotFoundCode}
                  </span>
                  . It may have a typo or hasn&apos;t been created yet.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleGoHome}
                    className="min-h-[44px] rounded-full border border-[#3a322a] bg-[#14110f] px-5 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                  >
                    Back to Home
                  </button>
                  <button
                    type="button"
                    onClick={openJoinRoom}
                    className="min-h-[44px] rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                  >
                    Try Another Code
                  </button>
                </div>
              </div>
            </section>
          ) : roomLockedCode ? (
            <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
              <div className="rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-6 sm:p-8">
                <h1 className="text-2xl font-bold text-[#f4ece1]">
                  This room is locked
                </h1>
                <p className="mt-2 text-sm text-[#b9aa98]">
                  The host has locked room{' '}
                  <span className="font-mono font-bold text-[#f2a33a]">
                    {roomLockedCode}
                  </span>{' '}
                  so new guests cannot join right now.
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleGoHome}
                    className="min-h-[44px] rounded-full border border-[#3a322a] bg-[#14110f] px-5 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                  >
                    Back to Home
                  </button>
                  <button
                    type="button"
                    onClick={openJoinRoom}
                    className="min-h-[44px] rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                  >
                    Try Another Code
                  </button>
                </div>
              </div>
            </section>
          ) : activeRoom ? (
            <RoomErrorBoundary roomCode={activeRoom.code} onBack={handleGoHome}>
              <RoomPage
                room={activeRoom}
                username={userProfile?.username ?? ''}
                sharedLibrary={legalCatalog.ourPicks}
                legalCatalog={legalCatalog}
                justCreated={justCreatedRoomCode === activeRoom.code}
                onBack={handleGoHome}
                onShare={setShareTarget}
                onRequestUsername={() => {
                  setUsernameModalDismissible(true);
                  setUsernameModalMode('claim');
                }}
              />
            </RoomErrorBoundary>
          ) : watchingVideo ? (
            <VideoPlayerPage
              video={{
                ...watchingVideo,
                sourceLabel:
                  watchingVideo.sourceLabel ??
                  getVideoSourceLabel(
                    watchingVideo.youtubeId,
                    watchingVideo.source === 'archive' ? 'archive' : 'youtube',
                    legalCatalog
                  ),
              }}
              relatedVideos={relatedWatchables}
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
              onSelectRelatedVideo={enterWatchAlone}
            />
          ) : filteredSeeAllData ? (
            <GenreGridView
              data={filteredSeeAllData}
              onBack={() => setSeeAllData(null)}
              onWatchYouTube={openChoiceForSearch}
              onCreateRoomYouTube={openCreateRoomFromSearch}
              onShareYouTube={(video) => openShareForVideo(video.videoId, video.title)}
              onWatchArchive={openChoiceForArchive}
              onCreateRoomArchive={openCreateRoomFromArchive}
              onShareArchive={openShareForArchive}
              onWatchOurPick={openChoiceForOurPick}
              onCreateRoomOurPick={openCreateRoomFromOurPick}
              onShareOurPick={(item) => openShareForVideo(item.video_id, item.title)}
            />
          ) : null}

          {showBrowseContent && (
            <>
              {/* Search Results View (from TopBar or Movies search bar — searches only the 4 legal sources) */}
              {searchQuery && (
                <section
                  aria-label="Legal movie search results"
                  className="px-4 py-6 sm:px-6 lg:px-8 border-b border-[#3a322a]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-[#f4ece1]">
                        Results for &ldquo;{searchQuery}&rdquo;
                      </h2>
                      {!searching && filteredSearchResults && (
                        <p className="mt-0.5 text-xs text-[#b9aa98]">
                          {filteredSearchResults.youtube.length +
                            filteredSearchResults.archive.length}{' '}
                          {filteredSearchResults.youtube.length +
                            filteredSearchResults.archive.length ===
                          1
                            ? 'movie'
                            : 'movies'}{' '}
                          found
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 text-xs font-medium text-[#f4ece1] hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span>Clear search</span>
                    </button>
                  </div>

                  {searching ? (
                    <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                      {[0, 1, 2, 3].map((slot) => (
                        <div
                          key={slot}
                          className="rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3"
                        >
                          <div className="aspect-video w-full rounded-xl bg-[#2a241e]" />
                          <div className="mt-3 h-4 w-3/4 rounded bg-[#2a241e]" />
                          <div className="mt-2 h-3 w-1/2 rounded bg-[#2a241e]" />
                        </div>
                      ))}
                    </div>
                  ) : filteredSearchResults &&
                    filteredSearchResults.youtube.length === 0 &&
                    filteredSearchResults.archive.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-6 text-center">
                      <p className="text-sm text-[#b9aa98]">
                        No movies in our legal sources matched &ldquo;{searchQuery}&rdquo;. Try
                        another keyword or paste a YouTube link.
                      </p>
                      <button
                        type="button"
                        onClick={focusPasteBar}
                        className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#f2a33a] px-5 py-2 text-xs font-bold text-[#1a1208] hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                      >
                        Paste a YouTube link
                      </button>
                    </div>
                  ) : filteredSearchResults ? (
                    <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                      {filteredSearchResults.youtube.map((video) => (
                        <YouTubeMovieCard
                          key={`search-yt-${video.videoId}`}
                          video={video}
                          onWatch={openChoiceForSearch}
                          onCreateRoom={openCreateRoomFromSearch}
                          onShare={(v) => openShareForVideo(v.videoId, v.title)}
                        />
                      ))}
                      {filteredSearchResults.archive.map((movie) => (
                        <ArchiveMovieCard
                          key={`search-ar-${movie.identifier}`}
                          movie={movie}
                          onWatch={openChoiceForArchive}
                          onCreateRoom={openCreateRoomFromArchive}
                          onShare={openShareForArchive}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              )}

              {activeNav === 'watch-party' ? (
                <section className="px-4 py-6 sm:px-6 lg:px-8 space-y-6">
                  <div className="rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:p-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 text-xs font-medium text-[#b9aa98]">
                        <span className="h-2 w-2 rounded-full bg-[#f2a33a]" aria-hidden="true" />
                        <span className="tabular-nums">{onlineCount} online now</span>
                      </div>
                    </div>

                    <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#f4ece1] sm:text-3xl">
                      Watch Party
                    </h1>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#b9aa98]">
                      Create a private room or enter a friend&apos;s room code to watch YouTube
                      movies in sync with live chat.
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {/* Create Room card */}
                      <div className="rounded-2xl border border-[#3a322a] bg-[#14110f] p-4 sm:p-5 flex flex-col justify-between gap-4">
                        <div>
                          <h2 className="text-base font-bold text-[#f4ece1]">
                            Start a new room
                          </h2>
                          <p className="mt-1 text-xs text-[#b9aa98]">
                            Pick a movie or paste any YouTube link to generate a shareable code.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCreateRoom()}
                          className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                        >
                          <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                          <span>Start a room</span>
                        </button>
                      </div>

                      {/* Join Room with inline code box */}
                      <form
                        onSubmit={handleWatchPartyInlineJoin}
                        className="rounded-2xl border border-[#3a322a] bg-[#14110f] p-4 sm:p-5 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <label
                            htmlFor="watch-party-join-input"
                            className="text-base font-bold text-[#f4ece1]"
                          >
                            Join with a room code
                          </label>
                          <p className="mt-1 text-xs text-[#b9aa98]">
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
                            className="min-w-0 flex-1 min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] px-4 py-2 font-mono text-sm text-[#f4ece1] placeholder:font-sans placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={partyJoining}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#1e1a16] px-5 py-2 text-sm font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] disabled:opacity-60 cursor-pointer"
                          >
                            <Users className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
                            <span>{partyJoining ? 'Joining...' : 'Join room'}</span>
                          </button>
                        </div>

                        {partyJoinError && (
                          <p className="text-xs text-[#f2a33a]" role="alert">
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
                  />

                  <div className="grid grid-cols-1 gap-6 border-t border-[#3a322a] pt-8 md:grid-cols-3">
                    {HOW_IT_WORKS.map((item) => (
                      <div key={item.step} className="space-y-1.5">
                        <p className="font-mono text-sm font-bold text-[#f2a33a] tabular-nums">
                          {item.step}
                        </p>
                        <h2 className="text-base font-bold text-[#f4ece1]">
                          {item.title}
                        </h2>
                        <p className="text-sm leading-relaxed text-[#b9aa98]">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : activeNav === 'my-list' ? (
                <MyListPage
                  watchLater={watchLater}
                  history={history}
                  getSourceLabel={(source, id) =>
                    getVideoSourceLabel(id, source, legalCatalog)
                  }
                  onWatchWatchLater={(item) => openChoiceForLocalItem(item, 0)}
                  onCreateRoomWatchLater={(item) => openCreateRoomForLocalItem(item, 0)}
                  onShareWatchLater={openShareForLocalItem}
                  onRemoveWatchLater={removeFromWatchLater}
                  onWatchHistory={(item) =>
                    openChoiceForLocalItem(item, item.finished ? 0 : item.position)
                  }
                  onCreateRoomHistory={(item) =>
                    openCreateRoomForLocalItem(item, item.finished ? 0 : item.position)
                  }
                  onShareHistory={openShareForLocalItem}
                  onRemoveHistory={removeFromHistory}
                  onClearHistory={clearAllHistory}
                />
              ) : activeNav === 'movies' ? (
                <>
                  <section className="px-4 pt-6 pb-2 sm:px-6 lg:px-8 space-y-4">
                    <div>
                      <h1 className="text-2xl font-bold tracking-tight text-[#f4ece1] sm:text-3xl">
                        Movies
                      </h1>
                      <p className="mt-1 text-sm text-[#b9aa98]">
                        Browse legal movies across curated picks, Creative Commons, and the Internet Archive.
                      </p>
                    </div>

                    <form
                      onSubmit={handleMoviesSearchFormSubmit}
                      className="flex items-center gap-2 max-w-xl"
                    >
                      <div className="relative flex-1">
                        <Search
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b9aa98]"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={moviesSearchInput}
                          onChange={(e) => setMoviesSearchInput(e.target.value)}
                          placeholder="Search movies..."
                          aria-label="Search movies"
                          className="w-full min-h-[44px] rounded-full border border-[#3a322a] bg-[#1e1a16] pl-10 pr-10 py-2 text-sm text-[#f4ece1] placeholder:text-[#b9aa98] focus:border-[#f2a33a] focus:outline-none"
                        />
                        {(moviesSearchInput || searchQuery) && (
                          <button
                            type="button"
                            onClick={handleClearSearch}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#b9aa98] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={!moviesSearchInput.trim() || searching}
                        className="min-h-[44px] rounded-full bg-[#f2a33a] px-5 py-2 text-sm font-bold text-[#1a1208] whitespace-nowrap shrink-0 transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-50 cursor-pointer"
                      >
                        {searching ? 'Searching...' : 'Search'}
                      </button>
                    </form>

                    <PasteYouTubeBar
                      variant="home"
                      inputId="home-paste-youtube-input"
                      onCreateRoomWithVideo={openCreateRoomFromPasted}
                    />
                  </section>

                  <CategoryTiles catalog={visibleCatalog} onSelectGenre={handleJumpToGenre} />

                  <GenreRows
                    catalog={visibleCatalog}
                    catalogLoading={catalogLoading}
                    onSeeAllYouTube={(genre, videos) => {
                      setSeeAllData({ kind: 'youtube', genre, videos });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onSeeAllArchive={(genre, movies) => {
                      setSeeAllData({ kind: 'archive', genre, movies });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onSeeAllOurPicks={(items) => {
                      setSeeAllData({ kind: 'our-picks', items });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onWatchYouTube={openChoiceForSearch}
                    onCreateRoomYouTube={openCreateRoomFromSearch}
                    onShareYouTube={(video) => openShareForVideo(video.videoId, video.title)}
                    onWatchArchive={openChoiceForArchive}
                    onCreateRoomArchive={openCreateRoomFromArchive}
                    onShareArchive={openShareForArchive}
                    onWatchOurPick={openChoiceForOurPick}
                    onCreateRoomOurPick={openCreateRoomFromOurPick}
                    onShareOurPick={(item) => openShareForVideo(item.video_id, item.title)}
                  />
                </>
              ) : (
                <>
                  {/* Home page order: TopBar (above), 2-panel Hero Carousel + Moods, Mood Results, Continue Watching, New this week, Tonight's picks, Footer (below) */}
                  <HeroBanner
                    onlineCount={onlineCount}
                    selectedMood={selectedMood}
                    featuredMovies={heroFeaturedMovies}
                    featuredMoviesReady={heroMoviesReady}
                    onStartRoom={() => openCreateRoom()}
                    onWatchAlone={handleHeroWatchAlone}
                    onWatchMovieTogether={openCreateRoomFromSearch}
                    onWatchMovieAlone={(video) =>
                      enterWatchAlone({
                        id: video.videoId,
                        title: video.title,
                        category: video.sourceLabel || video.channelTitle || 'Movie',
                        youtubeId: video.videoId,
                        thumbnail: video.thumbnail,
                        duration: video.duration,
                        sourceLabel:
                          video.sourceLabel ??
                          getVideoSourceLabel(video.videoId, 'youtube', legalCatalog),
                      })
                    }
                    onSelectMood={handleSelectMood}
                  />

                  <HomeMoodResults
                    selectedMood={selectedMood}
                    moodItems={moodItems}
                    surpriseItem={visibleSurpriseItem}
                    onClose={() => setSelectedMood(null)}
                    onAnotherSurprise={handleAnotherSurprise}
                    onWatchTogetherYouTube={openCreateRoomFromSearch}
                    onWatchAloneYouTube={(video) =>
                      enterWatchAlone({
                        id: video.videoId,
                        title: video.title,
                        category: video.sourceLabel || video.channelTitle || 'Movie',
                        youtubeId: video.videoId,
                        thumbnail: video.thumbnail,
                        duration: video.duration,
                        sourceLabel:
                          video.sourceLabel ??
                          getVideoSourceLabel(video.videoId, 'youtube', legalCatalog),
                      })
                    }
                    onWatchChoiceYouTube={openChoiceForSearch}
                    onShareYouTube={(v) => openShareForVideo(v.videoId, v.title)}
                    onWatchTogetherArchive={openCreateRoomFromArchive}
                    onWatchAloneArchive={(movie) =>
                      enterWatchAlone({
                        id: movie.identifier,
                        title: movie.title,
                        category: 'Public domain',
                        youtubeId: movie.identifier,
                        thumbnail: movie.thumbnail,
                        source: 'archive',
                        sourceLabel: 'Public domain',
                      })
                    }
                    onWatchChoiceArchive={openChoiceForArchive}
                    onShareArchive={openShareForArchive}
                  />

                  <ContinueWatchingRow
                    items={visibleContinueWatching}
                    getSourceLabel={(source, id) =>
                      getVideoSourceLabel(id, source, legalCatalog)
                    }
                    onWatch={(item) => openChoiceForLocalItem(item, item.position)}
                    onCreateRoom={(item) => openCreateRoomForLocalItem(item, item.position)}
                    onShare={openShareForLocalItem}
                  />

                  <NewThisWeekRow
                    items={newThisWeekItems}
                    onWatchYouTube={openChoiceForSearch}
                    onCreateRoomYouTube={openCreateRoomFromSearch}
                    onShareYouTube={(v) => openShareForVideo(v.videoId, v.title)}
                    onWatchArchive={openChoiceForArchive}
                    onCreateRoomArchive={openCreateRoomFromArchive}
                    onShareArchive={openShareForArchive}
                  />

                  <TonightsPicksRow
                    items={tonightsPicks}
                    onWatchYouTube={openChoiceForSearch}
                    onCreateRoomYouTube={openCreateRoomFromSearch}
                    onShareYouTube={(v) => openShareForVideo(v.videoId, v.title)}
                    onWatchArchive={openChoiceForArchive}
                    onCreateRoomArchive={openCreateRoomFromArchive}
                    onShareArchive={openShareForArchive}
                    onBrowseAllMovies={() => handleSelectNav('movies')}
                  />
                </>
              )}
            </>
          )}
        </main>

        {!isRoomView && (
          <footer className="mt-10 border-t border-[#3a322a]">
            <div className="space-y-4 px-4 py-6 text-sm text-[#b9aa98] sm:px-6 lg:px-8">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex flex-col gap-1.5">
                  <MovieNestLogo />
                  <p className="text-xs text-[#b9aa98]">
                    MovieNest doesn&apos;t host any videos. Videos stream from YouTube and the Internet Archive.
                  </p>
                </div>

                <nav aria-label="Footer links" className="flex flex-wrap items-center gap-5">
                  <a
                    href="/about.html"
                    className="inline-flex min-h-[44px] items-center text-xs font-medium text-[#b9aa98] transition-colors hover:text-[#f2a33a] hover:underline underline-offset-4"
                  >
                    About
                  </a>
                  <a
                    href="/terms.html"
                    className="inline-flex min-h-[44px] items-center text-xs font-medium text-[#b9aa98] transition-colors hover:text-[#f2a33a] hover:underline underline-offset-4"
                  >
                    Terms
                  </a>
                  <a
                    href="/privacy.html"
                    className="inline-flex min-h-[44px] items-center text-xs font-medium text-[#b9aa98] transition-colors hover:text-[#f2a33a] hover:underline underline-offset-4"
                  >
                    Privacy
                  </a>
                </nav>
              </div>

              <p className="border-t border-[#3a322a] pt-3 text-xs leading-relaxed text-[#b9aa98]">
                Videos come from official channels, Creative Commons sources, the Internet Archive
                and permissions we&apos;ve been given. Report anything that shouldn&apos;t be here.
              </p>
            </div>
          </footer>
        )}
      </div>

      {!isRoomView && <MobileBottomNav activeNav={activeNav} onSelectNav={handleSelectNav} />}

      <WatchChoiceModal
        video={choiceVideo}
        onClose={() => setChoiceVideo(null)}
        onWatchTogether={(video) => {
          setChoiceVideo(null);
          openCreateRoom(video, video.positionSeconds ?? 0);
        }}
        onWatchAlone={enterWatchAloneFromOption}
      />

      <RoomModal
        mode={modalMode}
        initialVideo={selectedVideo}
        initialPositionSeconds={startSeconds}
        sharedLibrary={sharedLibrary}
        legalCatalog={visibleCatalog}
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
      />

      <ShareSheet target={shareTarget} onClose={() => setShareTarget(null)} />

      <UsernameModal
        mode={usernameModalMode}
        currentUsername={userProfile?.username ?? null}
        dismissible={usernameModalDismissible}
        onClose={() => {
          pendingActionAfterUsernameRef.current = null;
          setUsernameModalMode(null);
        }}
        onSuccess={(profile) => {
          userProfileRef.current = profile;
          setUserProfile(profile);
          setUsernameModalMode(null);

          const pendingRoom = pendingRoomAfterUsernameRef.current;
          pendingRoomAfterUsernameRef.current = null;
          if (pendingRoom) {
            handleEnterRoom(pendingRoom);
          }

          const pendingAction = pendingActionAfterUsernameRef.current;
          pendingActionAfterUsernameRef.current = null;
          if (pendingAction) {
            pendingAction();
          }
        }}
      />

      {watchLaterToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 lg:bottom-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f2a33a] bg-[#1e1a16] px-4 py-2.5 text-xs font-bold text-[#f4ece1]">
            <Bookmark className="h-3.5 w-3.5 fill-[#f2a33a] text-[#f2a33a]" aria-hidden="true" />
            <span>{watchLaterToast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
