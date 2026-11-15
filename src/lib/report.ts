// Helper for building "Report this video" mailto links using contactEmail from siteConfig
import { contactEmail } from '../config/siteConfig';

export interface ReportVideoInput {
  title: string;
  videoId: string;
  sourceType: 'youtube' | 'archive';
  sourceLabel: string;
}

export function getExternalVideoUrl(sourceType: 'youtube' | 'archive', videoId: string): string {
  const safeId = videoId.trim();
  if (sourceType === 'archive') {
    return `https://archive.org/details/${encodeURIComponent(safeId)}`;
  }
  return `https://www.youtube.com/watch?v=${encodeURIComponent(safeId)}`;
}

// Build a mailto: URL with "Report: TITLE" as subject and the video link & source in the body
export function buildReportVideoMailto(input: ReportVideoInput): string {
  const cleanTitle = input.title.trim() || input.videoId;
  const videoLink = getExternalVideoUrl(input.sourceType, input.videoId);
  const subject = `Report: ${cleanTitle}`;
  const body = [
    'I would like to report this video on MovieNest:',
    '',
    `Title: ${cleanTitle}`,
    `Source: ${input.sourceLabel}`,
    `Link: ${videoLink}`,
    '',
    'Reason:',
  ].join('\n');

  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
