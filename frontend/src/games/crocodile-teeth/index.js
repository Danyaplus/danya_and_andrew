import { lazy } from 'react';
const CrocodileTeethGame = lazy(() => import('./CrocodileTeethGame.jsx'));

export default {
  id: 'crocodile-teeth',
  order: 36,
  title: 'Зубы крокодила',
  description: 'По очереди нажимайте зубы. Один из них опасный — кто его выберет, того крокодил укусит.',
  icon: '🐊',
  badge: '2 игрока',
  component: CrocodileTeethGame,
};
