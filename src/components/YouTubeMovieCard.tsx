import { useState } from 'react';
import { BookmarkPlus, Check, Film, Share2, Users } from 'lucide-react';
import {
  saveToSharedLibrary,
  SHARED_LIBRARY_CATEGORIES,
  SharedLibraryCategory,
  SharedLibraryItem,
} from '../lib/supabase';
import { YouTubeSearchResult } from '../lib/youtube';
import { BookmarkButton } from './BookmarkButton';

interface YouTubeMovieCardProps {
  video: YouTubeSearchResult;
  defaultCategory?: SharedLibraryCategory;
  className?: string;
  onWatch: (video: YouTubeSearchResult) => void;
  onCreateRoom: (video: YouTubeSearchResult) => void;
  onShare: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
}

export function YouTubeMovieCard({
  video,
  defaultCategory = 'Movies',
  className = '',
  onWatch,
  onCreateRoom,
  onShare,
  onSavedToLibrary,
}: YouTubeMovieCardProps) {
  const [imgError, setImgError] = useState(false);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSaveCategory = async (category: SharedLibraryCategory) => {
    if (saving) return;
    setSaving(true);
    setStatusMsg(null);

    const { item, duplicate, error } = await saveToSharedLibrary({
      videoId: video.videoId,
      title: video.title,
      category,
    });

    setSaving(false);
    setPickingCategory(false);

    if (error) {
      setStatusMsg('Could not save right now.');
      return;
    }

    if (duplicate) {
      setStatusMsg(item ? `Already in ${item.category}` : 'Already in library');
      return;
    }

    if (item) {
      onSavedToLibrary(item);
      setStatusMsg(`Saved to ${item.category}`);
    }
  };

  return (
    <article
      className={`flex flex-col rounded-2xl border border-[#3a322a] bg-[#1e1a16] p-3 transition-colors hover:border-[#f2a33a] ${className}`}
    >
      <button
        type="button"
        onClick={() => onWatch(video)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2a33a] active:opacity-80 rounded-xl cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#14110f]">
          {!imgError ? (
            <img
              src={video.thumbnail}
              alt={video.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#14110f] p-3">
              <Film className="h-6 w-6 text-[#f2a33a]" aria-hidden="true" />
              <span className="text-xs text-[#f4ece1] text-center line-clamp-1">
                {video.title}
              </span>
            </div>
          )}
        </div>

        <h3 className="mt-2.5 text-sm font-bold text-[#f4ece1] line-clamp-2 leading-snug group-hover:text-[#f2a33a] transition-colors">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-[#b9aa98] truncate">{video.channelTitle}</p>
      </button>

      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCreateRoom(video)}
          className="inline-flex min-h-[44px] flex-1 min-w-0 items-center justify-center gap-1.5 rounded-full bg-[#f2a33a] px-3 py-2 text-xs font-bold text-[#1a1208] whitespace-nowrap transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] cursor-pointer"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Room</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setPickingCategory((prev) => !prev);
            setStatusMsg(null);
          }}
          aria-label={`Save ${video.title} to shared library`}
          title="Save to Library"
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-[#3a322a] bg-[#14110f] px-3 py-2 text-xs font-medium text-[#f4ece1] whitespace-nowrap transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          <BookmarkPlus className="h-3.5 w-3.5 text-[#f2a33a] shrink-0" aria-hidden="true" />
          <span>Save</span>
        </button>

        <BookmarkButton
          source="youtube"
          id={video.videoId}
          title={video.title}
          thumbnail={video.thumbnail}
        />

        <button
          type="button"
          onClick={() => onShare(video)}
          aria-label={`Share ${video.title}`}
          className="inline-flex h-11 w-11 min-h-[44px] shrink-0 items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          <Share2 className="h-4 w-4 text-[#f2a33a]" aria-hidden="true" />
        </button>
      </div>

      {pickingCategory && (
        <div className="mt-3 border-t border-[#3a322a] pt-3">
          <p className="text-xs text-[#b9aa98]">Save to Library:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SHARED_LIBRARY_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                disabled={saving}
                onClick={() => void handleSaveCategory(category)}
                className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                  category === defaultCategory
                    ? 'bg-[#f2a33a] font-bold text-[#1a1208] hover:bg-[#e5952b]'
                    : 'border border-[#3a322a] bg-[#14110f] text-[#f4ece1] hover:border-[#f2a33a]'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {statusMsg && (
        <p className="mt-2.5 flex items-center gap-1 text-xs font-medium text-[#f2a33a]">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusMsg}</span>
        </p>
      )}
    </article>
  );
}
