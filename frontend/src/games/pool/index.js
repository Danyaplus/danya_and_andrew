import { lazy } from 'react';
const PoolGame = lazy(() => import('./PoolGame.jsx'));

export default {
  id: 'pool',
  order: 5,
  title: 'Бильярд',
  description: 'Упрощённый 8-ball: разбивка, однотонные и полосатые, кий и 30 секунд на ход.',
  icon: '🎱',
  badge: '2 игрока',
  component: PoolGame,
};
