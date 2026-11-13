import bigBuckBunnyImg from '../assets/images/lib_big_buck_bunny_1794597560703.jpg';
import sintelImg from '../assets/images/lib_sintel_1794597560102.jpg';
import tearsOfSteelImg from '../assets/images/lib_tears_of_steel_1794597560575.jpg';
import elephantsDreamImg from '../assets/images/lib_elephants_dream_1794597561107.jpg';
import springImg from '../assets/images/lib_spring_1794597562257.jpg';
import cosmosLaundromatImg from '../assets/images/lib_cosmos_laundromat_1794597562118.jpg';
import iMoveOnImg from '../assets/images/lib_i_move_on_1794597562151.jpg';
import makingOfSintelImg from '../assets/images/lib_making_of_sintel_1794597562588.jpg';

export type VideoCategory = 'Animation' | 'Short Film' | 'Music' | 'Documentary';

export interface LibraryVideo {
  id: string;
  title: string;
  category: VideoCategory;
  duration: string;
  youtubeId: string;
  thumbnail: string;
}

export const LIBRARY_CATEGORIES: Array<'All' | VideoCategory> = [
  'All',
  'Animation',
  'Short Film',
  'Music',
  'Documentary',
];

export const LIBRARY_VIDEOS: LibraryVideo[] = [
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    category: 'Animation',
    duration: '9:56',
    youtubeId: 'aqz-KE-bpKQ',
    thumbnail: bigBuckBunnyImg,
  },
  {
    id: 'sintel',
    title: 'Sintel',
    category: 'Animation',
    duration: '14:48',
    youtubeId: 'eRsGyueVLvQ',
    thumbnail: sintelImg,
  },
  {
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    category: 'Short Film',
    duration: '12:14',
    youtubeId: 'R6MlUcmOul8',
    thumbnail: tearsOfSteelImg,
  },
  {
    id: 'elephants-dream',
    title: 'Elephants Dream',
    category: 'Animation',
    duration: '10:53',
    youtubeId: 'TLkA0RELQ1g',
    thumbnail: elephantsDreamImg,
  },
  {
    id: 'spring',
    title: 'Spring',
    category: 'Short Film',
    duration: '7:44',
    youtubeId: 'WhWc3b3KhnY',
    thumbnail: springImg,
  },
  {
    id: 'cosmos-laundromat',
    title: 'Cosmos Laundromat',
    category: 'Short Film',
    duration: '12:10',
    youtubeId: 'Y-rmzh0PI3c',
    thumbnail: cosmosLaundromatImg,
  },
  {
    id: 'i-move-on',
    title: "I Move On (Sintel's Song)",
    category: 'Music',
    duration: '4:05',
    youtubeId: 'AeFwEnyMl8A',
    thumbnail: iMoveOnImg,
  },
  {
    id: 'making-of-sintel',
    title: 'Making of Sintel',
    category: 'Documentary',
    duration: '42:15',
    youtubeId: 'IN6w6GnN-Ic',
    thumbnail: makingOfSintelImg,
  },
];
