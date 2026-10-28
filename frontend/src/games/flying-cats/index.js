import { lazy } from 'react';
const FlyingCatsGame = lazy(() => import('./FlyingCatsGame.jsx'));

export default {
  id: 'flying-cats',
  order: 17,
  title: 'Летающие котики',
  description: 'Зеркальная дуэль на реакцию: прыгай между трубами, переживи зелёный, синий и красный уровни.',
  icon: '🐱',
  badge: '2 игрока',
  component: FlyingCatsGame,
};
