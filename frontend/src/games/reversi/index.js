import { lazy } from 'react';
const ReversiGame = lazy(() => import('./ReversiGame.jsx'));

export default {
  id: 'reversi',
  order: 47,
  title: 'Реверси',
  description: 'Окружай фишки соперника и переворачивай их на свою сторону. Побеждает тот, у кого больше фишек.',
  icon: '⚫⚪',
  badge: '2 игрока',
  component: ReversiGame,
};
