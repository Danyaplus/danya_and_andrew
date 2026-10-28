import { lazy } from 'react';
const TugOfWarGame = lazy(() => import('./TugOfWarGame.jsx'));

export default {
  id: 'tug-of-war',
  order: 12,
  title: 'Перетягивание каната',
  description: 'Перетяни канат на свою сторону! Жми быстрее соперника, выигрывай раунды и стань чемпионом.',
  icon: '🪢',
  badge: '2 игрока',
  component: TugOfWarGame,
};
