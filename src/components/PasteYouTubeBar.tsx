import { useEffect, useState } from 'react';
import { BookmarkPlus, Check, Film, Link2, Users, X } from 'lucide-react';
import {
  saveToSharedLibrary,
  SHARED_LIBRARY_CATEGORIES,
  SharedLibraryCategory,
  SharedLibraryItem,
} from '../lib/supabase';
import {
  extractYouTubeId,
  fetchYouTubeTitle,
  getYouTubeThumbnail,
} from '../lib/youtube';

export interface PastedYouTubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
}

interface PasteYouTubeBarProps {
  variant?: 'home' | 'modal';
  inputId?: string;
  onCreateRoomWithVideo: (video: PastedYouTubeVideo) => void;
  onSavedToLibrary: (item: SharedLibraryItem) => void;
}

// Category order shown when saving to the shared library
const SAVE_CATEGORIES: SharedLibraryCategory[] = [
  'Movies',
  'Nollywood',
  'Animation',
  'Documentary',
  'Music',
  'Other',
];

export function PasteYouTubeBar({
  variant = 'home',
  inputId = 'paste-youtube-input',
  onCreateRoomWithVideo,
  onSavedToLibrary,
}: PasteYouTubeBarProps) {
  const [urlInput, setUrlInput] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  // Category picker state for "Save to Library"
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<SharedLibraryCategory>('Movies');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    text: string;
    tone: 'success' | 'info' | 'error';
  } | null>(null);

  // Parse pasted YouTube URL and fetch its title via oEmbed whenever ID changes
  useEffect(() => {
    const parsedId = extractYouTubeId(urlInput);
    setVideoId(parsedId);
    setThumbError(false);
    setShowCategoryPicker(false);
    setSaveMessage(null);

    if (!parsedId) {
      setTitle('');
      setLoadingTitle(false);
      return;
    }

    let cancelled = false;
    setLoadingTitle(true);
    setTitle('Loading video title...');

    fetchYouTubeTitle(parsedId).then((fetchedTitle) => {
      if (cancelled) return;
      setTitle(fetchedTitle);
      setLoadingTitle(false);
    });

    return () => {
      cancelled = true;
    };
  }, [urlInput]);

  const handleSaveToLibrary = async (categoryToSave: SharedLibraryCategory) => {
    if (!videoId || saving) return;

    setSaving(true);
    setSaveMessage(null);

    // Ensure we have a clean title even if user clicked fast while oEmbed was loading
    const finalTitle =
      loadingTitle || !title ? await fetchYouTubeTitle(videoId) : title;

    const { item, duplicate, error } = await saveToSharedLibrary({
      videoId,
      title: finalTitle,
      category: categoryToSave,
    });

    setSaving(false);

    if (error) {
      setSaveMessage({
        text: 'Could not save right now. Please try again.',
        tone: 'error',
      });
      return;
    }

    if (duplicate) {
      setShowCategoryPicker(false);
      setSaveMessage({
        text: item
          ? `Already in library under ${item.category}.`
          : 'Already saved in the shared library.',
        tone: 'info',
      });
      return;
    }

    if (item) {
      onSavedToLibrary(item);
      setShowCategoryPicker(false);
      setSaveMessage({
        text: `Saved to ${item.category}.`,
        tone: 'success',
      });
    }
  };

  const thumbnailUrl = videoId ? getYouTubeThumbnail(videoId) : '';
  const hasInvalidText = urlInput.trim().length > 0 && !videoId;
  const isHome = variant === 'home';

  const content = (
    <div
      className={
        isHome
          ? 'rounded-2xl border border-[#2a2a33] bg-[#14141a] p-4 sm:p-5'
          : 'rounded-xl border border-[#2a2a33] bg-[#14141a] p-3.5'
      }
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <label
          htmlFor={inputId}
          className="font-display text-sm sm:text-base font-semibold text-white"
        >
          {isHome ? 'Paste any YouTube link' : 'Or paste any YouTube link'}
        </label>
        <span className="text-xs text-zinc-400">
          Supports watch, youtu.be, and Shorts links
        </span>
      </div>

      <div className="relative mt-2.5">
        <Link2
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#E50914]"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
          className="w-full min-h-[44px] rounded-lg border border-white/15 bg-[#08080A] pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#E50914] focus:outline-none focus:ring-1 focus:ring-[#E50914]"
        />
        {urlInput && (
          <button
            type="button"
            onClick={() => setUrlInput('')}
            aria-label="Clear YouTube link"
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 hover:text-white active:bg-white/10 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {hasInvalidText && (
        <p className="mt-2 text-xs text-zinc-400">
          Paste a full YouTube link (youtube.com/watch, youtu.be, or /shorts/).
        </p>
      )}

      {videoId && (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#181820] p-3.5 sm:p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative aspect-video w-full sm:w-44 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#08080A]">
              {!thumbError ? (
                <img
                  src={thumbnailUrl}
                  alt={title || 'YouTube video thumbnail'}
                  referrerPolicy="no-referrer"
                  onError={() => setThumbError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#111116]">
                  <Film className="h-6 w-6 text-[#E50914]" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-display text-sm sm:text-base font-semibold text-white line-clamp-2">
                {title}
              </p>
              <p className="mt-1 font-mono text-xs text-zinc-400">
                ID: {videoId}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onCreateRoomWithVideo({
                      videoId,
                      title: loadingTitle ? `YouTube Video (${videoId})` : title,
                      thumbnail: thumbnailUrl,
                    })
                  }
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E50914] px-4 py-2 text-sm font-semibold text-white whitespace-nowrap transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span>Create Room with this</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowCategoryPicker((prev) => !prev);
                    setSaveMessage(null);
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#111116] px-4 py-2 text-sm font-medium text-white whitespace-nowrap transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
                >
                  <BookmarkPlus className="h-4 w-4 text-[#E50914]" aria-hidden="true" />
                  <span>Save to Library</span>
                </button>
              </div>
            </div>
          </div>

          {showCategoryPicker && (
            <div className="mt-4 border-t border-white/10 pt-3.5">
              <p className="text-xs font-medium text-zinc-300">
                Choose a category to save this video:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SAVE_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setSelectedCategory(category);
                      void handleSaveToLibrary(category);
                    }}
                    className={`min-h-[40px] rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors active:bg-[#b80710] cursor-pointer disabled:opacity-50 ${
                      selectedCategory === category && saving
                        ? 'bg-[#E50914] text-white font-semibold'
                        : 'border border-white/15 bg-[#08080A] text-zinc-200 hover:border-[#E50914]/60 hover:text-white'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
              {saving && (
                <p className="mt-2 text-xs text-zinc-400">Saving to shared library...</p>
              )}
            </div>
          )}

          {saveMessage && (
            <p
              className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${
                saveMessage.tone === 'error'
                  ? 'text-[#F87171]'
                  : saveMessage.tone === 'success'
                    ? 'text-emerald-400'
                    : 'text-zinc-300'
              }`}
              role="status"
            >
              {saveMessage.tone === 'success' && (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{saveMessage.text}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (!isHome) {
    return content;
  }

  return (
    <section
      aria-label="Paste a YouTube link"
      className="px-4 pt-5 pb-2 sm:px-6 lg:px-8"
    >
      {content}
    </section>
  );
}

// Keep unused export check clean if callers inspect categories
export { SHARED_LIBRARY_CATEGORIES };
