import { lazy } from 'react';
const OrbitHitGame = lazy(() => import('./OrbitHitGame.jsx'));

export default {
  id: 'orbit-hit',
  order: 23,
  title: 'Орбита',
  description: 'Лови серую зону, собирай серию до ×5 и набери больше очков за 60 секунд.',
  icon: '🎯',
  badge: '2 игрока',
  component: OrbitHitGame,
};
