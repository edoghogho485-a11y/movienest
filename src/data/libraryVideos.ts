// Sample open-source Creative Commons videos using YouTube thumbnails as posters
export type VideoCategory = 'Animation' | 'Short Film' | 'Music' | 'Documentary';

export interface LibraryVideo {
  id: string;
  title: string;
  category: VideoCategory;
  duration: string;
  youtubeId: string;
  thumbnail: string;
}

export const LIBRARY_VIDEOS: LibraryVideo[] = [
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    category: 'Animation',
    duration: '9:56',
    youtubeId: 'aqz-KE-bpKQ',
    thumbnail: 'https://img.youtube.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
  },
  {
    id: 'sintel',
    title: 'Sintel',
    category: 'Animation',
    duration: '14:48',
    youtubeId: 'eRsGyueVLvQ',
    thumbnail: 'https://img.youtube.com/vi/eRsGyueVLvQ/hqdefault.jpg',
  },
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    category: 'Short Film',
    duration: '12:14',
    youtubeId: 'R6MlUcmOul8',
    thumbnail: 'https://img.youtube.com/vi/R6MlUcmOul8/hqdefault.jpg',
  },
  {
    id: 'elephants-dream',
    title: 'Elephants Dream',
    category: 'Animation',
    duration: '10:53',
    youtubeId: 'TLkA0RELQ1g',
    thumbnail: 'https://img.youtube.com/vi/TLkA0RELQ1g/hqdefault.jpg',
  },
  {
    id: 'spring',
    title: 'Spring',
    category: 'Short Film',
    duration: '7:44',
    youtubeId: 'WhWc3b3KhnY',
    thumbnail: 'https://img.youtube.com/vi/WhWc3b3KhnY/hqdefault.jpg',
  },
  {
    id: 'cosmos-laundromat',
    title: 'Cosmos Laundromat',
    category: 'Short Film',
    duration: '12:10',
    youtubeId: 'Y-rmzh0PI3c',
    thumbnail: 'https://img.youtube.com/vi/Y-rmzh0PI3c/hqdefault.jpg',
  },
  {
    id: 'i-move-on',
    title: "I Move On (Sintel's Song)",
    category: 'Music',
    duration: '4:05',
    youtubeId: 'AeFwEnyMl8A',
    thumbnail: 'https://img.youtube.com/vi/AeFwEnyMl8A/hqdefault.jpg',
  },
  {
    id: 'making-of-sintel',
    title: 'Making of Sintel',
    category: 'Documentary',
    duration: '42:15',
    youtubeId: 'IN6w6GnN-Ic',
    thumbnail: 'https://img.youtube.com/vi/IN6w6GnN-Ic/hqdefault.jpg',
  },
];
