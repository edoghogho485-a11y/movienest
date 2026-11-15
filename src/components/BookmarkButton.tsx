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
  tabIndex?: number;
  className?: string;
}

// Reusable Watch Later bookmark pill button with filled amber state when saved
export function BookmarkButton({
  source = 'youtube',
  id,
  videoUrl,
  title,
  thumbnail,
  variant = 'icon',
  tabIndex,
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
        tabIndex={tabIndex}
        onClick={handleToggle}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${title} from Watch Later` : `Save ${title} to Watch Later`}
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors active:bg-[#2a241e] cursor-pointer ${
          saved
            ? 'border-[#f2a33a] bg-[#f2a33a] font-bold text-[#1a1208]'
            : 'border-[#3a322a] bg-[#1e1a16] text-[#f4ece1] hover:border-[#f2a33a]'
        } ${className}`}
      >
        <Bookmark
          className={`h-4 w-4 shrink-0 ${
            saved ? 'fill-[#1a1208] text-[#1a1208]' : 'text-[#f2a33a]'
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
      tabIndex={tabIndex}
      onClick={handleToggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from Watch Later` : `Save ${title} to Watch Later`}
      title={saved ? 'Remove from Watch Later' : 'Save to Watch Later'}
      className={`inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border transition-colors active:bg-[#2a241e] cursor-pointer ${
        saved
          ? 'border-[#f2a33a] bg-[#f2a33a] text-[#1a1208]'
          : 'border-[#3a322a] bg-[#14110f] text-[#f4ece1] hover:border-[#f2a33a]'
      } ${className}`}
    >
      <Bookmark
        className={`h-4 w-4 ${
          saved ? 'fill-[#1a1208] text-[#1a1208]' : 'text-[#f2a33a]'
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
