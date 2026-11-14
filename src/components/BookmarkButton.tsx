import { Bookmark } from 'lucide-react';
import { useLocalLists } from '../hooks/useLocalLists';
import { LocalMediaSource } from '../lib/localLists';

interface BookmarkButtonProps {
  source?: LocalMediaSource;
  id: string;
  videoUrl?: string | null;
  title: string;
  thumbnail: string;
  variant?: 'icon' | 'button';
  className?: string;
}

// Reusable Watch Later bookmark button with filled crimson state when saved
export function BookmarkButton({
  source = 'youtube',
  id,
  videoUrl,
  title,
  thumbnail,
  variant = 'icon',
  className = '',
}: BookmarkButtonProps) {
  const { isSaved, toggleWatchLater } = useLocalLists();
  const saved = isSaved(source, id);

  const handleToggle = () => {
    toggleWatchLater({
      source,
      id,
      video_url: videoUrl,
      title,
      thumbnail,
    });
  };

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${title} from Watch Later` : `Save ${title} to Watch Later`}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors active:bg-[#252530] cursor-pointer ${
          saved
            ? 'border-[#E50914] bg-[#1b1013] text-white'
            : 'border-[#2a2a33] bg-[#14141a] text-white hover:border-white/40'
        } ${className}`}
      >
        <Bookmark
          className={`h-4 w-4 shrink-0 ${
            saved ? 'fill-[#E50914] text-[#E50914]' : 'text-[#E50914]'
          }`}
          aria-hidden="true"
        />
        <span>{saved ? 'In Watch Later' : 'Watch Later'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from Watch Later` : `Save ${title} to Watch Later`}
      title={saved ? 'Remove from Watch Later' : 'Save to Watch Later'}
      className={`inline-flex min-h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border transition-colors active:bg-[#252530] cursor-pointer ${
        saved
          ? 'border-[#E50914] bg-[#1b1013] text-[#E50914]'
          : 'border-white/15 bg-[#181820] text-zinc-200 hover:border-white/30'
      } ${className}`}
    >
      <Bookmark
        className={`h-3.5 w-3.5 ${
          saved ? 'fill-[#E50914] text-[#E50914]' : 'text-[#E50914]'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
