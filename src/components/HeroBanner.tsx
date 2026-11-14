import { Play, Sparkles, Users } from 'lucide-react';
import { MOOD_DEFINITIONS, MoodId } from '../lib/moodCatalog';

interface HeroBannerProps {
  onlineCount: number;
  selectedMood: MoodId | null;
  onStartRoom: () => void;
  onWatchAlone: () => void;
  onSelectMood: (moodId: MoodId) => void;
}

// Two-panel cozy night hero: left panel for primary room/solo actions, right panel for mood chips
export function HeroBanner({
  onlineCount,
  selectedMood,
  onStartRoom,
  onWatchAlone,
  onSelectMood,
}: HeroBannerProps) {
  return (
    <section
      aria-label="Tonight on MovieNest"
      className="px-4 pt-5 sm:px-6 lg:px-8"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        {/* LEFT panel: headline, description, Start a room & Watch alone pills */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-6 sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#b9aa98]">
              <span
                className="h-2 w-2 rounded-full bg-[#f2a33a]"
                aria-hidden="true"
              />
              <span className="tabular-nums">{onlineCount} online now</span>
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#f4ece1] sm:text-4xl leading-[1.15]">
              Tonight, together.
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#b9aa98] sm:text-base">
              Pick a movie, start a room, and watch in sync with friends. Or press
              play and watch alone.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStartRoom}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-6 py-2.5 text-sm font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
            >
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Start a room</span>
            </button>

            <button
              type="button"
              onClick={onWatchAlone}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-6 py-2.5 text-sm font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current text-[#f2a33a] shrink-0" aria-hidden="true" />
              <span>Watch alone</span>
            </button>
          </div>
        </div>

        {/* RIGHT panel: What's the mood? chips */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-[20px] border border-[#3a322a] bg-[#1e1a16] p-6 sm:p-8">
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
