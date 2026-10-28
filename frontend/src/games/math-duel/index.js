import { lazy } from 'react';
const MathDuelGame = lazy(() => import('./MathDuelGame.jsx'));

export default {
  id: 'math-duel',
  order: 26,
  title: 'Математическая дуэль',
  description: 'Решайте одинаковые примеры на скорость! Десять раундов, четыре ответа, очко за самый быстрый правильный.',
  icon: '🧮',
  badge: '2 игрока',
  component: MathDuelGame,
};
