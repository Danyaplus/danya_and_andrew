import { lazy } from 'react';
const SequenceDuelGame = lazy(() => import('./SequenceDuelGame.jsx'));

export default {
  id: 'sequence-duel',
  order: 98,
  title: 'Повтори последовательность',
  description: 'Запоминай вспышки четырёх цветов и повторяй их в точном порядке. С каждым раундом цепочка длиннее!',
  icon: '🧠',
  badge: '2 игрока',
  component: SequenceDuelGame,
};
