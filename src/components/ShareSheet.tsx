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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#14110f]/90 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-[20px] border border-[#3a322a] bg-[#1e1a16] p-5 sm:rounded-[20px] sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-[#3a322a] pb-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#f2a33a]">
              {headingLabel}
            </p>
            <h2
              id="share-sheet-title"
              className="mt-1 text-lg font-bold text-[#f4ece1] line-clamp-2"
            >
              {target.kind === 'site' ? 'MovieNest: Watch Together' : target.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close share sheet"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#b9aa98] transition-colors hover:bg-[#2a241e] hover:text-[#f4ece1] active:bg-[#3a322a] cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 rounded-2xl border border-[#3a322a] bg-[#14110f] p-3.5 text-xs leading-relaxed text-[#b9aa98]">
          {text}
        </p>

        {/* Primary native Share… button (attaches 1080x1920 PNG card when supported) */}
        {canUseWebShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={sharingNative}
            className="mt-4 flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#f2a33a] px-5 py-2.5 text-sm font-bold text-[#1a1208] transition-colors hover:bg-[#e5952b] active:bg-[#d6861f] disabled:opacity-60 cursor-pointer"
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
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-3 py-2 text-xs sm:text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e]"
          >
            <MessageCircle className="h-4 w-4 text-[#f2a33a] shrink-0" aria-hidden="true" />
            <span>WhatsApp</span>
          </a>

          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-3 py-2 text-xs sm:text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e]"
          >
            <Send className="h-4 w-4 text-[#f2a33a] shrink-0" aria-hidden="true" />
            <span>Telegram</span>
          </a>

          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-3 py-2 text-xs sm:text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e]"
          >
            <ExternalLink className="h-4 w-4 text-[#b9aa98] shrink-0" aria-hidden="true" />
            <span>X</span>
          </a>

          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-3 py-2 text-xs sm:text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e]"
          >
            <ExternalLink className="h-4 w-4 text-[#b9aa98] shrink-0" aria-hidden="true" />
            <span>Facebook</span>
          </a>
        </div>

        {/* Copy Link button */}
        <button
          type="button"
          onClick={handleCopyLink}
          className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#3a322a] bg-[#14110f] px-4 py-2.5 text-sm font-medium text-[#f4ece1] transition-colors hover:border-[#f2a33a] active:bg-[#2a241e] cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-[#f2a33a] shrink-0" aria-hidden="true" />
              <span className="text-[#f2a33a] font-bold">Link copied</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Copy Link</span>
            </>
          )}
        </button>

        {statusNote && (
          <p className="mt-2 text-center text-xs text-[#f2a33a]" role="status">
            {statusNote}
          </p>
        )}
      </div>
    </div>
  );
}
