import { lazy } from 'react';
const DominoGame = lazy(() => import('./DominoGame.jsx'));

export default {
  id: 'domino',
  order: 47,
  title: 'Домино',
  description: 'Классическое домино на двоих: по 7 костяшек, цепочка, базар и рыба.',
  icon: '🁣',
  badge: '2 игрока',
  component: DominoGame,
};
