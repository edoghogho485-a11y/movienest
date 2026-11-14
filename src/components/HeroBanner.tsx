import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  MessageSquare,
  Play,
  Share2,
  Smartphone,
  Tv,
} from 'lucide-react';
import { LIBRARY_VIDEOS } from '../data/libraryVideos';
import { getSearchCache, supabase } from '../lib/supabase';
import {
  getYouTubeThumbnail,
  hasYouTubeApiKey,
  searchYouTubeWithCache,
  YouTubeSearchResult,
} from '../lib/youtube';
import { RoomVideoOption } from './RoomModal';

interface HeroSlide {
  videoId: string;
  title: string;
  sourceLabel: string;
  thumbnail: string;
}

interface HeroBannerProps {
  onWatchTogether: (video: RoomVideoOption) => void;
}

const SLIDE_INTERVAL_MS = 6000;

const FEATURE_STRIP = [
  { icon: Tv, label: 'Sync Playback' },
  { icon: MessageSquare, label: 'Live Chat' },
  { icon: Share2, label: 'Invite Friends' },
  { icon: Smartphone, label: 'On All Devices' },
];

// Fallback slides from our open-licensed sample library while cache warms
function getSampleFallbackSlides(): HeroSlide[] {
  return LIBRARY_VIDEOS.slice(0, 4).map((v) => ({
    videoId: v.youtubeId,
    title: v.title,
    sourceLabel: v.category,
    thumbnail: getYouTubeThumbnail(v.youtubeId),
  }));
}

export function HeroBanner({ onWatchTogether }: HeroBannerProps) {
  const [slides, setSlides] = useState<HeroSlide[]>(() => getSampleFallbackSlides());
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  // Unique presence key for this visitor in the global "lobby" channel
  const lobbyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `guest-${Math.random().toString(36).slice(2, 10)}`
  );

  // 1. Load up to 4 featured slides from cached Nollywood & Full Movies results
  useEffect(() => {
    let cancelled = false;

    const loadHeroSlides = async () => {
      // Check Supabase search_cache first so we don't burn YouTube quota unnecessarily
      const [nollywoodCache, fullMoviesCache] = await Promise.all([
        getSearchCache<YouTubeSearchResult>('full nollywood movie 2026'),
        getSearchCache<YouTubeSearchResult>('full movie'),
      ]);

      let nollywood = nollywoodCache?.results ?? [];
      let fullMovies = fullMoviesCache?.results ?? [];

      // If cache is completely empty and an API key exists, warm these two hero feeds
      if (nollywood.length === 0 && hasYouTubeApiKey) {
        const res = await searchYouTubeWithCache('full Nollywood movie 2026');
        nollywood = res.results;
      }
      if (fullMovies.length === 0 && hasYouTubeApiKey) {
        const res = await searchYouTubeWithCache('full movie');
        fullMovies = res.results;
      }

      if (cancelled) return;

      const combined: HeroSlide[] = [];
      const seenIds = new Set<string>();

      const pushSlide = (item: YouTubeSearchResult, label: string) => {
        if (seenIds.has(item.videoId) || combined.length >= 4) return;
        seenIds.add(item.videoId);
        combined.push({
          videoId: item.videoId,
          title: item.title,
          sourceLabel: label,
          thumbnail: getYouTubeThumbnail(item.videoId),
        });
      };

      // Alternate Nollywood & Full Movies up to 4 slides
      for (let i = 0; i < 4; i++) {
        if (nollywood[i]) pushSlide(nollywood[i], 'Nollywood Movies');
        if (fullMovies[i]) pushSlide(fullMovies[i], 'Full Movies');
      }

      if (combined.length > 0) {
        setSlides(combined.slice(0, 4));
        setActiveIndex(0);
      }
    };

    void loadHeroSlides();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Join Supabase Realtime presence on channel "lobby" for live online count
  useEffect(() => {
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
  }, []);

  // 3. Auto-advance slides every 6 seconds unless paused or reduced-motion is requested
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  const currentSlide = slides[activeIndex] ?? slides[0];
  const hasImgError = Boolean(imgErrors[currentSlide.videoId]);

  const handleWatchTogether = () => {
    onWatchTogether({
      id: currentSlide.videoId,
      youtubeId: currentSlide.videoId,
      title: currentSlide.title,
      thumbnail: currentSlide.thumbnail,
    });
  };

  return (
    <section
      aria-label="Featured watch party movies"
      className="px-4 pt-4 sm:px-6 lg:px-8"
    >
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className="relative overflow-hidden rounded-2xl border border-[#2a2a33] bg-[#14141a]"
      >
        <div className="relative min-h-[260px] sm:min-h-[340px] lg:min-h-[400px] w-full">
          {/* Backdrop YouTube thumbnail */}
          {!hasImgError ? (
            <img
              key={currentSlide.videoId}
              src={currentSlide.thumbnail}
              alt={currentSlide.title}
              referrerPolicy="no-referrer"
              onError={() =>
                setImgErrors((prev) => ({ ...prev, [currentSlide.videoId]: true }))
              }
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#14141a]">
              <Film className="h-12 w-12 text-[#E50914]/60" aria-hidden="true" />
            </div>
          )}

          {/* Dark gradient scrim for text legibility */}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08080A] via-[#08080A]/80 to-[#08080A]/30"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08080A] via-transparent to-[#08080A]/45"
            aria-hidden="true"
          />

          {/* Slide content */}
          <div className="relative z-10 flex min-h-[260px] sm:min-h-[340px] lg:min-h-[400px] flex-col justify-between p-5 sm:p-8 lg:p-10">
            {/* Top row: Live lobby presence count */}
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-200">
                <span className="h-2 w-2 rounded-full bg-[#E50914]" aria-hidden="true" />
                <span className="tabular-nums">{onlineCount} online now</span>
                <span className="text-zinc-500" aria-hidden="true">
                  ·
                </span>
                <span className="text-zinc-300">{currentSlide.sourceLabel}</span>
              </div>

              {slides.length > 1 && (
                <div className="hidden sm:flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length)
                    }
                    aria-label="Previous featured movie"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2a2a33] bg-[#14141a] text-white transition-colors hover:border-white/40 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveIndex((prev) => (prev + 1) % slides.length)}
                    aria-label="Next featured movie"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#2a2a33] bg-[#14141a] text-white transition-colors hover:border-white/40 cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {/* Bottom row: Title + Watch Together CTA + Slide dots */}
            <div className="max-w-2xl">
              <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl line-clamp-2 leading-[1.15]">
                {currentSlide.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handleWatchTogether}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#E50914] px-6 py-2.5 text-sm font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#F40612] cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Watch Together</span>
                </button>

                {/* Slide indicator dots */}
                {slides.length > 1 && (
                  <div className="flex items-center gap-2" role="tablist" aria-label="Hero slides">
                    {slides.map((slide, index) => {
                      const isActive = index === activeIndex;
                      return (
                        <button
                          key={slide.videoId}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          aria-label={`Show slide ${index + 1}: ${slide.title}`}
                          onClick={() => setActiveIndex(index)}
                          className={`h-2 rounded-full transition-colors cursor-pointer ${
                            isActive
                              ? 'w-7 bg-[#E50914]'
                              : 'w-2 bg-white/35 hover:bg-white/60'
                          }`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compact 4-item capability strip underneath hero */}
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-[#2a2a33] bg-[#14141a] px-4 py-3 sm:grid-cols-4 sm:gap-4">
        {FEATURE_STRIP.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-2.5 text-xs sm:text-sm text-zinc-200">
              <Icon className="h-4 w-4 text-[#E50914] shrink-0" aria-hidden="true" />
              <span className="font-medium truncate">{item.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
