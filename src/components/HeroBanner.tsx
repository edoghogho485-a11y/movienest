import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Pause,
  Play,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  HeroFeaturedMovie,
  MOOD_DEFINITIONS,
  MoodId,
} from '../lib/moodCatalog';
import {
  getYouTubeMaxResThumbnail,
  getYouTubeThumbnail,
  loadYouTubeIframeAPI,
  YouTubeSearchResult,
  YTPlayer,
} from '../lib/youtube';
import { BookmarkButton } from './BookmarkButton';

interface HeroBannerProps {
  onlineCount: number;
  selectedMood: MoodId | null;
  featuredMovies: HeroFeaturedMovie[];
  featuredMoviesReady: boolean;
  onStartRoom: () => void;
  onWatchAlone: () => void;
  onWatchMovieTogether: (video: YouTubeSearchResult) => void;
  onWatchMovieAlone: (video: YouTubeSearchResult) => void;
  onSelectMood: (moodId: MoodId) => void;
}

interface NetworkInfoLike {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
}

type HeroSlide =
  | { kind: 'intro'; key: string }
  | { kind: 'movie'; key: string; video: YouTubeSearchResult; categoryLabel: string };

const AUTO_ADVANCE_MS = 7000;
const PREVIEW_DELAY_MS = 2000;
const PREVIEW_SEGMENT_SECONDS = 20;

// Format seconds (e.g. 6138 -> "1:42:18") for movie length display
function formatVideoLength(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

// Check if device network allows background preview playback (never on Save-Data or 2G/3G)
function isPreviewConnectionAllowed(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { connection?: NetworkInfoLike };
  const conn = nav.connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  const netType = (conn.effectiveType || conn.type || '').toLowerCase();
  if (netType === 'slow-2g' || netType === '2g' || netType === '3g') {
    return false;
  }
  return true;
}

// Cozy night home hero: cinematic 1-to-5 slide carousel on the left, mood selector on the right
export function HeroBanner({
  onlineCount,
  selectedMood,
  featuredMovies,
  featuredMoviesReady,
  onStartRoom,
  onWatchAlone,
  onWatchMovieTogether,
  onWatchMovieAlone,
  onSelectMood,
}: HeroBannerProps) {
  const slides = useMemo<HeroSlide[]>(() => {
    const base: HeroSlide[] = [{ kind: 'intro', key: 'hero-intro' }];
    for (const item of featuredMovies.slice(0, 4)) {
      base.push({
        kind: 'movie',
        key: `hero-movie-${item.video.videoId}`,
        video: item.video,
        categoryLabel: item.categoryLabel,
      });
    }
    return base;
  }, [featuredMovies]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPointerOver, setIsPointerOver] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const [isTabHidden, setIsTabHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hidden : false
  );
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const [connectionAllowed, setConnectionAllowed] = useState<boolean>(isPreviewConnectionAllowed);

  // Thumbnail fallback tracking: 'maxres' -> 'hq' -> 'failed'
  const [thumbFallback, setThumbFallback] = useState<Record<string, 'hq' | 'failed'>>({});
  const [durationsById, setDurationsById] = useState<Record<string, string>>({});
  const [failedEmbedIds, setFailedEmbedIds] = useState<Record<string, boolean>>({});

  // Background preview clip controls (laptops only)
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const [previewPaused, setPreviewPaused] = useState(false);

  const previewMountRef = useRef<HTMLDivElement | null>(null);
  const previewPlayerRef = useRef<YTPlayer | null>(null);
  const previewMutedRef = useRef(previewMuted);
  previewMutedRef.current = previewMuted;

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Keep activeIndex in bounds if the slide count changes
  const safeIndex = activeIndex < slides.length ? activeIndex : 0;
  const activeSlide = slides[safeIndex] ?? slides[0];
  const activeMovieId = activeSlide.kind === 'movie' ? activeSlide.video.videoId : null;

  // Watch screen size, reduced motion preference, tab visibility, and Save-Data/connection changes
  useEffect(() => {
    const desktopMq = window.matchMedia('(min-width: 1024px)');
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const onDesktopChange = () => setIsDesktop(desktopMq.matches);
    const onMotionChange = () => setPrefersReducedMotion(motionMq.matches);
    const onVisibilityChange = () => setIsTabHidden(document.hidden);
    const onConnectionChange = () => setConnectionAllowed(isPreviewConnectionAllowed());

    onDesktopChange();
    onMotionChange();
    onVisibilityChange();
    onConnectionChange();

    desktopMq.addEventListener('change', onDesktopChange);
    motionMq.addEventListener('change', onMotionChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const nav = navigator as Navigator & {
      connection?: {
        addEventListener?: (type: string, fn: () => void) => void;
        removeEventListener?: (type: string, fn: () => void) => void;
      };
    };
    nav.connection?.addEventListener?.('change', onConnectionChange);

    return () => {
      desktopMq.removeEventListener('change', onDesktopChange);
      motionMq.removeEventListener('change', onMotionChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      nav.connection?.removeEventListener?.('change', onConnectionChange);
    };
  }, []);

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (slides.length <= 1) return;
      const wrapped = ((nextIndex % slides.length) + slides.length) % slides.length;
      setActiveIndex(wrapped);
      // Reset preview toggles cleanly on every slide change
      setPreviewVisible(false);
      setPreviewMuted(true);
      setPreviewPaused(false);
    },
    [slides.length]
  );

  // Auto-advance every 7s unless reduced motion is set or the user is hovering/touching/away
  useEffect(() => {
    if (
      !featuredMoviesReady ||
      slides.length <= 1 ||
      prefersReducedMotion ||
      isPointerOver ||
      isTouching ||
      isTabHidden
    ) {
      return;
    }

    const timerId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
      setPreviewVisible(false);
      setPreviewMuted(true);
      setPreviewPaused(false);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timerId);
  }, [
    featuredMoviesReady,
    slides.length,
    prefersReducedMotion,
    isPointerOver,
    isTouching,
    isTabHidden,
  ]);

  // Laptop-only preview clip: loads muted YouTube player after 2s and loops a short segment near 15%
  const canPlayPreviewForActiveSlide = Boolean(
    featuredMoviesReady &&
      activeMovieId &&
      isDesktop &&
      connectionAllowed &&
      !isTabHidden &&
      !previewPaused &&
      !failedEmbedIds[activeMovieId]
  );

  useEffect(() => {
    if (!canPlayPreviewForActiveSlide || !activeMovieId) {
      setPreviewVisible(false);
      return;
    }

    let cancelled = false;
    let loopIntervalId: number | null = null;
    let segmentStart = 0;
    let segmentEnd = PREVIEW_SEGMENT_SECONDS;
    let initialSeekDone = false;

    const cleanupPlayer = () => {
      if (loopIntervalId !== null) {
        window.clearInterval(loopIntervalId);
        loopIntervalId = null;
      }
      if (previewPlayerRef.current) {
        try {
          previewPlayerRef.current.destroy();
        } catch {
          // Ignore YouTube iframe destroy errors
        }
        previewPlayerRef.current = null;
      }
      if (previewMountRef.current) {
        previewMountRef.current.replaceChildren();
      }
    };

    const delayTimerId = window.setTimeout(() => {
      if (cancelled) return;

      void loadYouTubeIframeAPI().then((YT) => {
        if (cancelled || !previewMountRef.current || !YT?.Player) return;

        previewMountRef.current.replaceChildren();
        const playerDiv = document.createElement('div');
        playerDiv.className = 'h-full w-full';
        previewMountRef.current.appendChild(playerDiv);

        const player = new YT.Player(playerDiv, {
          width: '100%',
          height: '100%',
          videoId: activeMovieId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            disablekb: 1,
            fs: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              previewPlayerRef.current = event.target;
              if (previewMutedRef.current) {
                event.target.mute?.();
              } else {
                event.target.unMute?.();
              }

              const dur = typeof event.target.getDuration === 'function' ? event.target.getDuration() : 0;
              if (dur > 10) {
                setDurationsById((prev) =>
                  prev[activeMovieId] ? prev : { ...prev, [activeMovieId]: formatVideoLength(dur) }
                );
                segmentStart = dur > 30 ? Math.floor(dur * 0.15) : 0;
                segmentEnd = Math.min(dur - 2, segmentStart + PREVIEW_SEGMENT_SECONDS);
                if (segmentStart > 0) {
                  initialSeekDone = true;
                  event.target.seekTo(segmentStart, true);
                }
              }

              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (cancelled) return;
              if (event.data === YT.PlayerState.PLAYING) {
                const dur =
                  typeof event.target.getDuration === 'function' ? event.target.getDuration() : 0;
                if (dur > 10) {
                  setDurationsById((prev) =>
                    prev[activeMovieId] ? prev : { ...prev, [activeMovieId]: formatVideoLength(dur) }
                  );
                  if (!initialSeekDone && dur > 30) {
                    initialSeekDone = true;
                    segmentStart = Math.floor(dur * 0.15);
                    segmentEnd = Math.min(dur - 2, segmentStart + PREVIEW_SEGMENT_SECONDS);
                    event.target.seekTo(segmentStart, true);
                  }
                }

                setPreviewVisible(true);

                // Loop back to the 15% mark after playing the short preview segment
                if (loopIntervalId === null) {
                  loopIntervalId = window.setInterval(() => {
                    try {
                      const t = event.target.getCurrentTime();
                      if (typeof t === 'number' && segmentEnd > segmentStart + 3 && t >= segmentEnd) {
                        event.target.seekTo(segmentStart, true);
                      }
                    } catch {
                      // Ignore transient player polling errors
                    }
                  }, 500);
                }
              } else if (event.data === YT.PlayerState.ENDED) {
                event.target.seekTo(segmentStart, true);
                event.target.playVideo();
              }
            },
            onError: () => {
              if (cancelled) return;
              // Keep the full-bleed thumbnail when an embedded preview is blocked
              setPreviewVisible(false);
              setFailedEmbedIds((prev) => ({ ...prev, [activeMovieId]: true }));
              cleanupPlayer();
            },
          },
        });

        previewPlayerRef.current = player;
      });
    }, PREVIEW_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(delayTimerId);
      setPreviewVisible(false);
      cleanupPlayer();
    };
  }, [canPlayPreviewForActiveSlide, activeMovieId]);

  const handleTogglePreviewMute = () => {
    setPreviewMuted((prev) => {
      const next = !prev;
      const player = previewPlayerRef.current;
      if (player) {
        try {
          if (next) player.mute?.();
          else player.unMute?.();
        } catch {
          // Ignore transient player mute error
        }
      }
      return next;
    });
  };

  const handleTogglePreviewPause = () => {
    setPreviewPaused((prev) => !prev);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsTouching(true);
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsTouching(false);
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || slides.length <= 1 || e.changedTouches.length === 0) return;

    const deltaX = e.changedTouches[0].clientX - start.x;
    const deltaY = e.changedTouches[0].clientY - start.y;

    // Swipe horizontally across the hero on phones
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        goToSlide(safeIndex + 1);
      } else {
        goToSlide(safeIndex - 1);
      }
    }
  };

  const handleTouchCancel = () => {
    setIsTouching(false);
    touchStartRef.current = null;
  };

  const showPreviewToggleButtons = Boolean(
    activeMovieId && isDesktop && connectionAllowed && !failedEmbedIds[activeMovieId]
  );

  return (
    <section
      aria-label="Tonight on MovieNest"
      className="px-4 pt-5 sm:px-6 lg:px-8"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5 lg:items-stretch">
        {/* LEFT panel: plain amber skeleton while loading, otherwise 1-to-5 slide cinematic carousel */}
        <div className="lg:col-span-8 min-w-0">
          {!featuredMoviesReady ? (
            <div
              role="status"
              aria-label="Loading featured movies"
              className="relative flex h-[70vh] min-h-[420px] lg:h-[460px] w-full flex-col justify-between overflow-hidden rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:p-7 lg:p-8"
            >
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-3 py-1.5 text-xs font-medium text-[#b9aa98]">
                <span className="h-2 w-2 rounded-full bg-[#f2a33a]" aria-hidden="true" />
                <span className="tabular-nums">{onlineCount} online now</span>
              </div>

              <div className={`space-y-3 ${prefersReducedMotion ? '' : 'animate-pulse'}`}>
                <div className="h-9 w-3/4 max-w-md rounded-xl bg-[#f2a33a]/20" />
                <div className="h-4 w-2/3 max-w-lg rounded-lg bg-[#f2a33a]/15" />
                <div className="h-4 w-1/2 max-w-sm rounded-lg bg-[#f2a33a]/15" />
                <div className="pt-3 flex flex-wrap gap-3">
                  <div className="h-11 w-36 rounded-full bg-[#f2a33a]/30" />
                  <div className="h-11 w-36 rounded-full bg-[#f2a33a]/15" />
                </div>
              </div>

              <div className="flex justify-center gap-2">
                <span className="h-2 w-6 rounded-full bg-[#f2a33a]/35" />
                <span className="h-2 w-2 rounded-full bg-[#f2a33a]/20" />
                <span className="h-2 w-2 rounded-full bg-[#f2a33a]/20" />
              </div>
            </div>
          ) : (
            <div
              role="region"
              aria-roledescription="carousel"
              aria-label="Featured movies"
              onMouseEnter={() => setIsPointerOver(true)}
              onMouseLeave={() => setIsPointerOver(false)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              className="relative h-[70vh] min-h-[420px] lg:h-[460px] w-full overflow-hidden rounded-[20px] border border-[#3a322a] bg-[#1e1a16]"
            >
              {/* Slide track */}
              <div
                className={`flex h-full w-full ${
                  prefersReducedMotion ? 'transition-none' : 'transition-transform duration-500 ease-out'
                }`}
                style={{ transform: `translateX(-${safeIndex * 100}%)` }}
              >
                {slides.map((slide, index) => {
                  const isActive = index === safeIndex;

                  if (slide.kind === 'intro') {
                    return (
                      <div
                        key={slide.key}
                        aria-hidden={!isActive}
                        className="relative flex h-full w-full shrink-0 flex-col justify-between bg-[#1e1a16] p-5 sm:p-7 lg:p-8"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-3 py-1.5 text-xs font-medium text-[#f4ece1]">
                            <span
                              className="h-2 w-2 rounded-full bg-[#f2a33a]"
                              aria-hidden="true"
                            />
                            <span className="tabular-nums">{onlineCount} online now</span>
                          </div>
                        </div>

                        <div className="min-w-0 max-w-2xl lg:px-10">
                          <h1 className="text-3xl font-bold tracking-tight text-[#f4ece1] sm:text-4xl lg:text-5xl leading-[1.12] break-words">
                            Tonight, together.
                          </h1>
                          <p className="mt-3 text-sm leading-relaxed text-[#b9aa98] sm:text-base break-words">
                            Pick a movie, start a room, and watch in sync with friends. Or press
                            play and watch alone.
                          </p>

                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              tabIndex={isActive ? undefined : -1}
                              onClick={onStartRoom}
                              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                            >
                              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>Start a room</span>
                            </button>

                            <button
                              type="button"
                              tabIndex={isActive ? undefined : -1}
                              onClick={onWatchAlone}
                              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-6 py-2.5 text-sm font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                            >
                              <Play
                                className="h-4 w-4 fill-current text-[#f2a33a] shrink-0"
                                aria-hidden="true"
                              />
                              <span>Watch alone</span>
                            </button>
                          </div>
                        </div>

                        {/* Reserve spacing for bottom dots */}
                        <div className="h-11 shrink-0" aria-hidden="true" />
                      </div>
                    );
                  }

                  const { video, categoryLabel } = slide;
                  const thumbState = thumbFallback[video.videoId];
                  const thumbSrc =
                    thumbState === 'hq'
                      ? video.thumbnail || getYouTubeThumbnail(video.videoId)
                      : getYouTubeMaxResThumbnail(video.videoId);
                  const lengthText = durationsById[video.videoId] || video.duration || categoryLabel;

                  return (
                    <div
                      key={slide.key}
                      aria-hidden={!isActive}
                      className="relative flex h-full w-full shrink-0 flex-col justify-between overflow-hidden bg-[#14110f] p-5 sm:p-7 lg:p-8"
                    >
                      {/* Full-bleed thumbnail background with maxresdefault -> hqdefault fallback */}
                      {thumbState !== 'failed' ? (
                        <img
                          src={thumbSrc}
                          alt={video.title}
                          referrerPolicy="no-referrer"
                          onLoad={(e) => {
                            // YouTube returns a 120x90 stub image instead of 404 when maxresdefault is missing
                            if (thumbState !== 'hq' && e.currentTarget.naturalWidth <= 120) {
                              setThumbFallback((prev) => ({ ...prev, [video.videoId]: 'hq' }));
                            }
                          }}
                          onError={() => {
                            setThumbFallback((prev) => ({
                              ...prev,
                              [video.videoId]: prev[video.videoId] === 'hq' ? 'failed' : 'hq',
                            }));
                          }}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 flex items-center justify-center bg-[#1e1a16]"
                        >
                          <Film className="h-12 w-12 text-[#3a322a]" />
                        </div>
                      )}

                      {/* Laptop-only muted preview clip fading in over thumbnail after 2s */}
                      {isActive && canPlayPreviewForActiveSlide && (
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-0 overflow-hidden ${
                            prefersReducedMotion
                              ? ''
                              : 'transition-opacity duration-500 ease-out'
                          } ${previewVisible ? 'opacity-100' : 'opacity-0'}`}
                        >
                          <div
                            ref={previewMountRef}
                            className="absolute left-1/2 top-1/2 min-w-[820px] w-full aspect-video -translate-x-1/2 -translate-y-1/2"
                          />
                        </div>
                      )}

                      {/* Flat dark overlay for readable foreground copy (rgba(20, 17, 15, 0.6)) */}
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 z-10"
                        style={{ backgroundColor: 'rgba(20, 17, 15, 0.6)' }}
                      />

                      {/* Top row: X online now pill + Laptop preview Sound / Pause controls */}
                      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f]/90 px-3 py-1.5 text-xs font-medium text-[#f4ece1]">
                          <span
                            className="h-2 w-2 rounded-full bg-[#f2a33a]"
                            aria-hidden="true"
                          />
                          <span className="tabular-nums">{onlineCount} online now</span>
                        </div>

                        {isActive && showPreviewToggleButtons && (
                          <div className="hidden lg:flex items-center gap-2">
                            <button
                              type="button"
                              tabIndex={isActive ? undefined : -1}
                              onClick={handleTogglePreviewMute}
                              aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f]/90 px-3.5 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] cursor-pointer"
                            >
                              {previewMuted ? (
                                <>
                                  <VolumeX
                                    className="h-4 w-4 text-[#f2a33a] shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>Sound off</span>
                                </>
                              ) : (
                                <>
                                  <Volume2
                                    className="h-4 w-4 text-[#f2a33a] shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>Sound on</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              tabIndex={isActive ? undefined : -1}
                              onClick={handleTogglePreviewPause}
                              aria-label={previewPaused ? 'Play preview' : 'Pause preview'}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#3a322a] bg-[#14110f]/90 px-3.5 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] cursor-pointer"
                            >
                              {previewPaused ? (
                                <>
                                  <Play
                                    className="h-3.5 w-3.5 fill-current text-[#f2a33a] shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>Play preview</span>
                                </>
                              ) : (
                                <>
                                  <Pause
                                    className="h-3.5 w-3.5 text-[#f2a33a] shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>Pause preview</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Main movie details & action buttons */}
                      <div className="relative z-20 min-w-0 max-w-2xl lg:px-10">
                        <h2 className="text-2xl font-bold tracking-tight text-[#f4ece1] sm:text-3xl lg:text-4xl leading-[1.18] line-clamp-2 break-words">
                          {video.title}
                        </h2>

                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-[#f4ece1]/85 break-words">
                          <span className="font-mono font-medium text-[#f2a33a] tabular-nums">
                            {lengthText}
                          </span>
                          <span className="text-[#b9aa98]" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-[#f4ece1]">{video.channelTitle || 'YouTube'}</span>
                        </p>

                        <div className="mt-5 flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            tabIndex={isActive ? undefined : -1}
                            onClick={() => onWatchMovieTogether(video)}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
                          >
                            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>Watch together</span>
                          </button>

                          <button
                            type="button"
                            tabIndex={isActive ? undefined : -1}
                            onClick={() => onWatchMovieAlone(video)}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f]/90 px-5 py-2.5 text-sm font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
                          >
                            <Play
                              className="h-4 w-4 fill-current text-[#f2a33a] shrink-0"
                              aria-hidden="true"
                            />
                            <span>Watch alone</span>
                          </button>

                          <div className={isActive ? '' : 'pointer-events-none'}>
                            <BookmarkButton
                              source="youtube"
                              id={video.videoId}
                              title={video.title}
                              thumbnail={video.thumbnail || getYouTubeThumbnail(video.videoId)}
                              tabIndex={isActive ? undefined : -1}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Reserve spacing for bottom dots */}
                      <div className="h-11 shrink-0" aria-hidden="true" />
                    </div>
                  );
                })}
              </div>

              {/* Laptop left/right navigation arrows */}
              {slides.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => goToSlide(safeIndex - 1)}
                    aria-label="Previous slide"
                    className="hidden lg:inline-flex absolute left-3 top-1/2 z-30 h-11 w-11 min-h-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f]/90 text-[#f4ece1] transition-colors hover:border-[#f2a33a] hover:text-[#f2a33a] cursor-pointer"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => goToSlide(safeIndex + 1)}
                    aria-label="Next slide"
                    className="hidden lg:inline-flex absolute right-3 top-1/2 z-30 h-11 w-11 min-h-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f]/90 text-[#f4ece1] transition-colors hover:border-[#f2a33a] hover:text-[#f2a33a] cursor-pointer"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </>
              )}

              {/* Bottom pagination dots */}
              {slides.length > 1 && (
                <div
                  role="tablist"
                  aria-label="Hero slides"
                  className="absolute inset-x-0 bottom-2 z-30 flex items-center justify-center gap-1"
                >
                  {slides.map((slide, index) => {
                    const isCurrent = index === safeIndex;
                    return (
                      <button
                        key={`dot-${slide.key}`}
                        type="button"
                        role="tab"
                        aria-selected={isCurrent}
                        aria-label={`Go to slide ${index + 1}`}
                        onClick={() => goToSlide(index)}
                        className="inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] rounded-full"
                      >
                        <span
                          aria-hidden="true"
                          className={`block h-2 rounded-full ${
                            prefersReducedMotion ? '' : 'transition-all duration-200'
                          } ${
                            isCurrent
                              ? 'w-6 bg-[#f2a33a]'
                              : 'w-2 bg-[#b9aa98]/55 hover:bg-[#f4ece1]'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT panel: What's the mood? chips */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:p-7 lg:p-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[#f4ece1] sm:text-2xl">
              What&apos;s the mood?
            </h2>
            <p className="mt-1.5 text-sm text-[#b9aa98]">
              We&apos;ll line up movies to match.
            </p>
          </div>

          <div
            role="group"
            aria-label="Choose a movie mood"
            className="mt-5 flex flex-wrap gap-2.5"
          >
            {MOOD_DEFINITIONS.map((mood) => {
              const isSelected = selectedMood === mood.id;
              const isSurprise = mood.id === 'surprise';
              return (
                <button
                  key={mood.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectMood(mood.id)}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#f2a33a] bg-[#f2a33a] font-bold text-[#1a1208]'
                      : 'border-[#3a322a] bg-[#14110f] font-medium text-[#f4ece1] hover:border-[#f2a33a] active:bg-[#2a241e]'
                  }`}
                >
                  {isSurprise && (
                    <Sparkles
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isSelected ? 'text-[#1a1208]' : 'text-[#f2a33a]'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span>{mood.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
