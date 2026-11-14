// Share & clipboard helpers for room invite links and solo watch links

export function getWatchAloneLink(videoId: string): string {
  const url = new URL(window.location.href);
  url.search = `?watch=${encodeURIComponent(videoId)}`;
  url.hash = '';
  return url.toString();
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to textarea fallback below
  }

  // Fallback for mobile browsers or contexts where Clipboard API is restricted
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function shareOrCopyLink(params: {
  title: string;
  text?: string;
  url: string;
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: params.title,
        text: params.text,
        url: params.url,
      });
      return 'shared';
    } catch (err) {
      // User dismissed the native share sheet
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
      // Otherwise fall back to copying the link
    }
  }

  const copied = await copyTextToClipboard(params.url);
  return copied ? 'copied' : 'failed';
}
