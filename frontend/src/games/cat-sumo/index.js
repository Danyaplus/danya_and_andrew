import { lazy } from 'react';
const CatSumoGame = lazy(() => import('./CatSumoGame.jsx'));

export default {
  id: 'cat-sumo',
  order: 19,
  title: 'Кошачий ринг',
  description: 'Крутись, выбирай момент и вытолкни соперника из круглого ринга.',
  icon: '🐱',
  badge: '2 игрока',
  component: CatSumoGame,
};
