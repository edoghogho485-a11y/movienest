import { useState } from 'react';
import { BookmarkPlus, Check, Film, Users } from 'lucide-react';
import {
  saveToSharedLibrary,
  SHARED_LIBRARY_CATEGORIES,
  SharedLibraryCategory,
  SharedLibraryItem,
} from '../lib/supabase';
import { YouTubeSearchResult } from '../lib/youtube';

interface YouTubeMovieCardProps {
  video: YouTubeSearchResult;
  defaultCategory?: SharedLibraryCategory;
  className?: string;
  onWatch: (video: YouTubeSearchResult) => void;
  onCreateRoom: (video: YouTubeSearchResult) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
}

export function YouTubeMovieCard({
  video,
  defaultCategory = 'Movies',
  className = '',
  onWatch,
  onCreateRoom,
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
      className={`flex flex-col rounded-xl border border-white/10 bg-[#0D121F] p-2.5 transition-colors hover:border-white/20 ${className}`}
    >
      <button
        type="button"
        onClick={() => onWatch(video)}
        className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg cursor-pointer"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#111625]">
          {!imgError ? (
            <img
              src={video.thumbnail}
              alt={video.title}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#0F172A] via-[#111625] to-[#1C1917] p-3">
              <Film className="h-6 w-6 text-amber-400/80" aria-hidden="true" />
              <span className="text-xs text-slate-300 text-center line-clamp-1">
                {video.title}
              </span>
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"
            aria-hidden="true"
          />
        </div>

        <h3 className="mt-2.5 font-display text-sm font-semibold text-slate-100 line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-slate-400 truncate">{video.channelTitle}</p>
      </button>

      <div className="mt-auto pt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCreateRoom(video)}
          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 whitespace-nowrap transition-colors hover:bg-amber-400 cursor-pointer"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Create Room</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setPickingCategory((prev) => !prev);
            setStatusMsg(null);
          }}
          className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-[#111625] px-3 py-1.5 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors hover:border-white/30 cursor-pointer"
        >
          <BookmarkPlus className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span>Save to Library</span>
        </button>
      </div>

      {pickingCategory && (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          <p className="text-[11px] text-slate-400">Save under:</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SHARED_LIBRARY_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                disabled={saving}
                onClick={() => void handleSaveCategory(category)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                  category === defaultCategory
                    ? 'border border-amber-400/50 bg-[#161D30] text-amber-300 hover:bg-amber-500 hover:text-slate-950'
                    : 'border border-white/15 bg-[#07090F] text-slate-300 hover:border-white/30'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      )}

      {statusMsg && (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-emerald-400">
          <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{statusMsg}</span>
        </p>
      )}
    </article>
  );
}
