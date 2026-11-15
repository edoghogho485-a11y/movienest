import { useEffect, useRef, useState } from 'react';
import { Flag, MoreVertical, Share2, Trash2 } from 'lucide-react';
import { buildReportVideoMailto } from '../lib/report';

interface CardActionMenuProps {
  title: string;
  videoId: string;
  sourceType: 'youtube' | 'archive';
  sourceLabel: string;
  onShare?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}

// Per-card menu button ("...") containing Share / Remove (optional) and "Report this video"
export function CardActionMenu({
  title,
  videoId,
  sourceType,
  sourceLabel,
  onShare,
  onRemove,
  removeLabel = 'Remove',
}: CardActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const mailtoUrl = buildReportVideoMailto({
    title,
    videoId,
    sourceType,
    sourceLabel,
  });

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More options for ${title}`}
        className="inline-flex h-11 w-11 min-h-[44px] items-center justify-center rounded-full border border-[#3a322a] bg-[#14110f] text-[#b9aa98] transition-colors hover:border-[#f2a33a] hover:text-[#f4ece1] active:bg-[#2a241e] cursor-pointer"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Options for ${title}`}
          className="absolute bottom-full right-0 z-30 mb-1.5 min-w-[196px] overflow-hidden rounded-xl border border-[#3a322a] bg-[#14110f] py-1"
        >
          {onShare && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onShare();
              }}
              className="flex min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#f4ece1] transition-colors hover:bg-[#2a241e] cursor-pointer"
            >
              <Share2 className="h-4 w-4 text-[#f2a33a] shrink-0" aria-hidden="true" />
              <span>Share</span>
            </button>
          )}

          <a
            role="menuitem"
            href={mailtoUrl}
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-[#f4ece1] transition-colors hover:bg-[#2a241e]"
          >
            <Flag className="h-4 w-4 text-[#f2a33a] shrink-0" aria-hidden="true" />
            <span>Report this video</span>
          </a>

          {onRemove && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="flex min-h-[44px] w-full items-center gap-2.5 border-t border-[#3a322a] px-3.5 py-2 text-left text-xs font-medium text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] cursor-pointer"
            >
              <Trash2 className="h-4 w-4 text-[#b9aa98] shrink-0" aria-hidden="true" />
              <span>{removeLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
