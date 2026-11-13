import { useState } from 'react';
import { Film, Play } from 'lucide-react';
import { HERO_IMAGE } from '../data/videos';

interface HeroProps {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export function Hero({ onCreateRoom, onJoinRoom }: HeroProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <section className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:px-6 sm:pt-12 sm:pb-14 lg:px-8 lg:pt-16 lg:pb-16">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <h1
            className="font-display font-bold tracking-tight text-slate-50 text-balance leading-[1.08]"
            style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)' }}
          >
            Watch together, anywhere
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Start a private screening room in seconds, share the invite code with friends, and stay
            perfectly in sync across phones, tablets, and laptops.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onCreateRoom}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-amber-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090F] cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>Start a Private Room</span>
            </button>

            <button
              type="button"
              onClick={onJoinRoom}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 bg-[#111625] px-5 py-2.5 text-sm font-medium text-slate-100 whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/30 hover:bg-[#161D30] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
            >
              Enter Room Code
            </button>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-[#111625]">
            {!imageError ? (
              <img
                src={HERO_IMAGE}
                alt="Cozy dark home screening room illuminated by warm amber light"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0F172A] via-[#111625] to-[#1E1B18] p-6 text-center">
                <Film className="h-10 w-10 text-amber-400" aria-hidden="true" />
                <p className="font-display text-base font-semibold text-slate-200">
                  Private Screening Room
                </p>
              </div>
            )}

            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07090F]/80 via-[#07090F]/20 to-transparent"
              aria-hidden="true"
            />

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold text-slate-100">
                  Friday Night Screening
                </p>
                <p className="text-xs text-slate-300">Synced playback · Private invite only</p>
              </div>
              <span className="font-mono text-xs text-amber-400 tabular-nums shrink-0">
                4 watching
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
