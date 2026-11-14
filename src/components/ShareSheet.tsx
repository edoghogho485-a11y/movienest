import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react';
import {
  buildShareContent,
  copyTextToClipboard,
  generateShareImageFile,
  ShareTarget,
} from '../lib/share';

interface ShareSheetProps {
  target: ShareTarget | null;
  onClose: () => void;
}

// Reusable Share bottom sheet (phones) / centered modal (laptops)
export function ShareSheet({ target, onClose }: ShareSheetProps) {
  const [sharingNative, setSharingNative] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    setCopied(false);
    setSharingNative(false);
    setStatusNote(null);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, onClose]);

  if (!target) return null;

  const { title, text, url } = buildShareContent(target);
  const canUseWebShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // Social share links using exact required URL formats
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopied(true);
      setStatusNote(null);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (!canUseWebShare) {
      await handleCopyLink();
      return;
    }

    setSharingNative(true);
    setStatusNote(null);

    try {
      // Include the 1080x1920 PNG story card when sharing a room or video if supported
      if (target.kind === 'room' || target.kind === 'video') {
        const imageFile = await generateShareImageFile({
          title: target.title,
          roomCode: target.kind === 'room' ? target.roomCode : undefined,
        });

        if (
          imageFile &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [imageFile] })
        ) {
          await navigator.share({
            title,
            text,
            url,
            files: [imageFile],
          });
          setSharingNative(false);
          return;
        }
      }

      // Fallback when files aren't supported or sharing the MovieNest site link
      await navigator.share({ title, text, url });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the native share sheet
      } else {
        const ok = await copyTextToClipboard(url);
        if (ok) {
          setCopied(true);
          setStatusNote('Link copied to clipboard');
          window.setTimeout(() => setCopied(false), 2000);
        }
      }
    } finally {
      setSharingNative(false);
    }
  };

  const headingLabel =
    target.kind === 'room'
      ? `Share Room · ${target.roomCode}`
      : target.kind === 'video'
        ? 'Share Movie'
        : 'Invite Friends to MovieNest';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-[#2a2a33] bg-[#14141a] p-5 sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-[#2a2a33] pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#E50914]">
              {headingLabel}
            </p>
            <h2
              id="share-sheet-title"
              className="mt-1 font-display text-lg font-semibold text-white line-clamp-2"
            >
              {target.kind === 'site' ? 'MovieNest: Watch Together' : target.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close share sheet"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 rounded-xl border border-[#2a2a33] bg-[#0b0b0f] p-3 text-xs leading-relaxed text-zinc-300">
          {text}
        </p>

        {/* Primary native Share… button (attaches 1080x1920 PNG card when supported) */}
        {canUseWebShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={sharingNative}
            className="mt-4 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#E50914] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] disabled:opacity-60 cursor-pointer"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{sharingNative ? 'Preparing card...' : 'Share…'}</span>
          </button>
        )}

        {/* Social app share buttons */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#2a2a33] bg-[#1b1b24] px-3 py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:border-[#E50914] active:bg-[#282834]"
          >
            <MessageCircle className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>WhatsApp</span>
          </a>

          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#2a2a33] bg-[#1b1b24] px-3 py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:border-[#E50914] active:bg-[#282834]"
          >
            <Send className="h-4 w-4 text-sky-400 shrink-0" aria-hidden="true" />
            <span>Telegram</span>
          </a>

          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#2a2a33] bg-[#1b1b24] px-3 py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:border-[#E50914] active:bg-[#282834]"
          >
            <ExternalLink className="h-4 w-4 text-zinc-200 shrink-0" aria-hidden="true" />
            <span>X</span>
          </a>

          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#2a2a33] bg-[#1b1b24] px-3 py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:border-[#E50914] active:bg-[#282834]"
          >
            <ExternalLink className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
            <span>Facebook</span>
          </a>
        </div>

        {/* Copy Link button */}
        <button
          type="button"
          onClick={handleCopyLink}
          className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#2a2a33] bg-[#0d0d12] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/30 active:bg-[#252530] cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="text-emerald-400">Link copied</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Copy Link</span>
            </>
          )}
        </button>

        {statusNote && (
          <p className="mt-2 text-center text-xs text-emerald-400" role="status">
            {statusNote}
          </p>
        )}
      </div>
    </div>
  );
}
