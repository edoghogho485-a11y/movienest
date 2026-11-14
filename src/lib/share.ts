// Share, clipboard, and 1080x1920 canvas share card helpers for MovieNest

export type ShareTarget =
  | {
      kind: 'room';
      title: string;
      roomCode: string;
      url: string;
    }
  | {
      kind: 'video';
      title: string;
      videoId: string;
      url: string;
    }
  | {
      kind: 'site';
      url: string;
    };

export function getWatchAloneLink(videoId: string): string {
  const url = new URL(window.location.href);
  url.search = `?watch=${encodeURIComponent(videoId)}`;
  url.hash = '';
  return url.toString();
}

export function getArchiveWatchAloneLink(identifier: string): string {
  const url = new URL(window.location.href);
  url.search = `?archive=${encodeURIComponent(identifier)}`;
  url.hash = '';
  return url.toString();
}

export function getSiteShareLink(): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

// Build exact share copy for rooms, videos, or the MovieNest site
export function buildShareContent(target: ShareTarget): {
  title: string;
  text: string;
  url: string;
} {
  if (target.kind === 'room') {
    return {
      title: 'MovieNest: Watch Together',
      text: `Join my watch party on MovieNest 🍿 ${target.title}. Code: ${target.roomCode}`,
      url: target.url,
    };
  }

  if (target.kind === 'video') {
    return {
      title: `${target.title} — MovieNest`,
      text: `Watch ${target.title} together on MovieNest 🍿`,
      url: target.url,
    };
  }

  return {
    title: 'MovieNest: Watch Together',
    text: 'Watch movies together with friends on MovieNest 🍿',
    url: target.url,
  };
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
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  const copied = await copyTextToClipboard(params.url);
  return copied ? 'copied' : 'failed';
}

// Wrap text into at most maxLines lines for canvas drawing
function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Movie Night'];

  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      } else {
        lines.push(word);
      }
      currentLine = word === lines[lines.length - 1] ? '' : word;

      // Stop if we reached maxLines and append ellipsis to the last visible line
      if (lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = `${last}…`;
        return lines;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
}

// Draw a rounded rectangle path using standard canvas arcs
function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Generate a 1080x1920 PNG story card using pure canvas drawing (zero external images)
export async function generateShareImageFile(params: {
  title: string;
  roomCode?: string;
}): Promise<File | null> {
  if (typeof document === 'undefined') return null;

  const width = 1080;
  const height = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 1. Red-black cinematic gradient background
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#2a0508');
  bgGradient.addColorStop(0.38, '#0b0b0f');
  bgGradient.addColorStop(1, '#08080A');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // Subtle top crimson spotlight gradient (purely drawn, no external images)
  const glow = ctx.createRadialGradient(width / 2, 340, 40, width / 2, 340, 680);
  glow.addColorStop(0, 'rgba(229, 9, 20, 0.36)');
  glow.addColorStop(1, 'rgba(229, 9, 20, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Outer card frame
  fillRoundedRect(ctx, 72, 110, width - 144, height - 220, 44);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Top accent bar inside frame
  fillRoundedRect(ctx, 130, 180, 110, 10, 5);
  ctx.fillStyle = '#E50914';
  ctx.fill();

  // 2. MovieNest logo mark + wordmark
  fillRoundedRect(ctx, 130, 240, 76, 76, 18);
  ctx.fillStyle = '#E50914';
  ctx.fill();

  // Play triangle inside logo badge
  ctx.beginPath();
  ctx.moveTo(157, 260);
  ctx.lineTo(157, 296);
  ctx.lineTo(188, 278);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.font = '700 62px "Outfit", system-ui, -apple-system, sans-serif';
  const movieText = 'Movie';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(movieText, 228, 280);
  const movieWidth = ctx.measureText(movieText).width;
  ctx.fillStyle = '#E50914';
  ctx.fillText('Nest', 228 + movieWidth, 280);

  // 3. "Join my watch party" eyebrow badge
  ctx.textBaseline = 'alphabetic';
  fillRoundedRect(ctx, 130, 520, 420, 68, 34);
  ctx.fillStyle = 'rgba(229, 9, 20, 0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(229, 9, 20, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '600 30px "DM Sans", system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('JOIN MY WATCH PARTY', 168, 565);

  // 4. Video title wrapped over up to 3 lines
  ctx.font = '700 74px "Outfit", system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  const titleLines = wrapCanvasLines(ctx, params.title, width - 260, 3);
  const startY = 720;
  const lineHeight = 96;
  titleLines.forEach((line, index) => {
    ctx.fillText(line, 130, startY + index * lineHeight);
  });

  // Subtitle line
  const afterTitleY = startY + titleLines.length * lineHeight + 56;
  ctx.font = '400 36px "DM Sans", system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#B3B3C0';
  ctx.fillText('Synced playback & live chat on any device', 130, afterTitleY);

  // 5. Room code panel (shown when sharing a room)
  if (params.roomCode) {
    const boxY = 1220;
    fillRoundedRect(ctx, 130, boxY, width - 260, 260, 32);
    ctx.fillStyle = '#14141A';
    ctx.fill();
    ctx.strokeStyle = '#E50914';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '600 28px "DM Sans", system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#A1A1AA';
    ctx.fillText('ROOM CODE', 180, boxY + 82);

    ctx.font = '700 84px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(params.roomCode, 180, boxY + 190);
  }

  // Bottom footer bar
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(130, 1630);
  ctx.lineTo(width - 130, 1630);
  ctx.stroke();

  ctx.font = '600 32px "DM Sans", system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#E50914';
  ctx.fillText('Join my watch party', 130, 1710);

  ctx.font = '400 28px "DM Sans", system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#A1A1AA';
  ctx.fillText('Tap the link to watch together on MovieNest', 130, 1762);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });

  if (!blob) return null;
  return new File([blob], 'movienest-share.png', { type: 'image/png' });
}
