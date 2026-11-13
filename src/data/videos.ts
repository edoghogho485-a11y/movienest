import heroCinemaRoom from '../assets/images/hero_cinema_room_1794596451612.jpg';
import midnightHarbor from '../assets/images/thumb_midnight_harbor_1794596451882.jpg';
import solarDrift from '../assets/images/thumb_solar_drift_1794596452614.jpg';
import kyotoRain from '../assets/images/thumb_kyoto_rain_1794596452645.jpg';
import alpineAscent from '../assets/images/thumb_alpine_ascent_1794596453094.jpg';
import vinylSessions from '../assets/images/thumb_vinyl_sessions_1794596453713.jpg';
import oceanDepths from '../assets/images/thumb_ocean_depths_1794596453702.jpg';

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

export const HERO_IMAGE = heroCinemaRoom;

export const FEATURED_VIDEOS: VideoItem[] = [
  {
    id: 'midnight-harbor',
    title: 'Midnight at Iron Harbor',
    duration: '1:42:18',
    genre: 'Mystery',
    year: '2025',
    thumbnail: midnightHarbor,
    youtubeId: 'TLkA0RELQ1g',
    description: 'A quiet dockside watchman uncovers a drifting vessel with its logbook still warm.',
  },
  {
    id: 'solar-drift',
    title: 'Solar Drift',
    duration: '1:58:04',
    genre: 'Sci-Fi',
    year: '2026',
    thumbnail: solarDrift,
    youtubeId: 'R6MlUcmOul8',
    description: 'Two surveyors cross an endless amber desert to restart a distant relay station.',
  },
  {
    id: 'kyoto-rain',
    title: 'Rain Over Kamogawa',
    duration: '24:35',
    genre: 'Short Film',
    year: '2025',
    thumbnail: kyotoRain,
    youtubeId: 'WhWc3b3KhnY',
    description: 'Late-evening stories told by lantern light along a rain-soaked neighborhood alley.',
  },
  {
    id: 'alpine-ascent',
    title: 'Above the Snowline',
    duration: '52:10',
    genre: 'Documentary',
    year: '2024',
    thumbnail: alpineAscent,
    youtubeId: 'eRsGyueVLvQ',
    description: 'Following high-altitude winter photographers waiting out a week-long storm.',
  },
  {
    id: 'vinyl-sessions',
    title: 'Late Night Tape Sessions',
    duration: '38:45',
    genre: 'Music Doc',
    year: '2025',
    thumbnail: vinylSessions,
    youtubeId: 'AeFwEnyMl8A',
    description: 'An intimate look inside an analog studio recording a full album before dawn.',
  },
  {
    id: 'ocean-depths',
    title: 'Beneath the Trench',
    duration: '1:14:50',
    genre: 'Nature',
    year: '2026',
    thumbnail: oceanDepths,
    youtubeId: 'Y-rmzh0PI3c',
    description: 'Deep-water researchers map glowing reefs three thousand meters below the surface.',
  },
];
