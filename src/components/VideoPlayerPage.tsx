import { useState } from 'react';
import { ArrowLeft, Film, Users } from 'lucide-react';
import { LibraryVideo } from '../data/libraryVideos';

interface VideoPlayerPageProps {
  video: LibraryVideo;
  relatedVideos: LibraryVideo[];
  onBack: () => void;
  onCreateRoomWithVideo: (video: LibraryVideo) => void;
  onSelectVideo: (video: LibraryVideo) => void;
}

function RelatedVideoCard({
  item,
  onSelect,
}: {
  item: LibraryVideo;
  onSelect: (video: LibraryVideo) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-xl cursor-pointer"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#111625] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:border-amber-400/50">
        {!imgError ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#0F172A] via-[#111625] to-[#1C1917] p-3">
            <Film className="h-6 w-6 text-amber-400/80" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-300 text-center line-clamp-1">
              {item.title}
            </span>
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
          aria-hidden="true"
        />
        <span className="absolute right-2.5 bottom-2 font-mono text-xs font-medium text-slate-100 tabular-nums">
          {item.duration}
        </span>
      </div>
      <p className="mt-2 font-display text-sm font-semibold text-slate-100 line-clamp-1 group-hover:text-amber-300">
        {item.title}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{item.category}</p>
    </button>
  );
}

export function VideoPlayerPage({
  video,
  relatedVideos,
  onBack,
  onCreateRoomWithVideo,
  onSelectVideo,
}: VideoPlayerPageProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-2 -ml-2 text-sm font-medium text-slate-300 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>Back to MovieNest</span>
      </button>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
        <div className="relative aspect-video w-full">
          <iframe
            key={video.youtubeId}
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            {video.title}
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            <span>{video.category}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span className="font-mono tabular-nums">{video.duration}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>Free Creative Commons License</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCreateRoomWithVideo(video)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-amber-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090F] cursor-pointer"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>Create Room with this video</span>
        </button>
      </div>

      {relatedVideos.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-semibold text-slate-100">
            More from the Video Library
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {relatedVideos.slice(0, 4).map((item) => (
              <RelatedVideoCard key={item.id} item={item} onSelect={onSelectVideo} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
