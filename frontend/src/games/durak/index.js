import { lazy } from 'react';
const DurakGame = lazy(() => import('./DurakGame.jsx'));

export default {
  id: 'durak',
  order: 52,
  title: 'Дурак',
  description: 'Подкидной дурак на двоих: 36 карт, козыри, подкидывание и отбивание. Не останься с картами последним!',
  icon: '🃏',
  badge: '2 игрока',
  component: DurakGame,
};
