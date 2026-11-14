// Legacy featured video IDs kept so previously created rooms continue to resolve cleanly
export interface VideoItem {
  id: string;
  title: string;
  duration: string;
  genre: string;
  year: string;
  thumbnail: string;
  youtubeId: string;
  description: string;
}

export const FEATURED_VIDEOS: VideoItem[] = [
  {
    id: 'midnight-harbor',
    title: 'Midnight at Iron Harbor',
    duration: '1:42:18',
    genre: 'Mystery',
    year: '2025',
    thumbnail: 'https://img.youtube.com/vi/TLkA0RELQ1g/hqdefault.jpg',
    youtubeId: 'TLkA0RELQ1g',
    description: 'A quiet dockside watchman uncovers a drifting vessel with its logbook still warm.',
  },
  {
    id: 'solar-drift',
    title: 'Solar Drift',
    duration: '1:58:04',
    genre: 'Sci-Fi',
    year: '2026',
    thumbnail: 'https://img.youtube.com/vi/R6MlUcmOul8/hqdefault.jpg',
    youtubeId: 'R6MlUcmOul8',
    description: 'Two surveyors cross an endless desert to restart a distant relay station.',
  },
  {
    id: 'kyoto-rain',
    title: 'Rain Over Kamogawa',
    duration: '24:35',
    genre: 'Short Film',
    year: '2025',
    thumbnail: 'https://img.youtube.com/vi/WhWc3b3KhnY/hqdefault.jpg',
    youtubeId: 'WhWc3b3KhnY',
    description: 'Late-evening stories told by lantern light along a rain-soaked neighborhood alley.',
  },
  {
    id: 'alpine-ascent',
    title: 'Above the Snowline',
    duration: '52:10',
    genre: 'Documentary',
    year: '2024',
    thumbnail: 'https://img.youtube.com/vi/eRsGyueVLvQ/hqdefault.jpg',
    youtubeId: 'eRsGyueVLvQ',
    description: 'Following high-altitude winter photographers waiting out a week-long storm.',
  },
  {
    id: 'vinyl-sessions',
    title: 'Late Night Tape Sessions',
    duration: '38:45',
    genre: 'Music Doc',
    year: '2025',
    thumbnail: 'https://img.youtube.com/vi/AeFwEnyMl8A/hqdefault.jpg',
    youtubeId: 'AeFwEnyMl8A',
    description: 'An intimate look inside an analog studio recording a full album before dawn.',
  },
  {
    id: 'ocean-depths',
    title: 'Beneath the Trench',
    duration: '1:14:50',
    genre: 'Nature',
    year: '2026',
    thumbnail: 'https://img.youtube.com/vi/Y-rmzh0PI3c/hqdefault.jpg',
    youtubeId: 'Y-rmzh0PI3c',
    description: 'Deep-water researchers map glowing reefs three thousand meters below the surface.',
  },
];
