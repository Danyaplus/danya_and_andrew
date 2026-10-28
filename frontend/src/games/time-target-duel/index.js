import { lazy } from 'react';
const TimeTargetDuelGame = lazy(() => import('./TimeTargetDuelGame.jsx'));

export default {
  id: 'time-target-duel',
  order: 91,
  title: 'Поймай время',
  description: 'Запомни цель, следи за секундомером только первые 3 секунды и останови его как можно ближе к нужному времени.',
  icon: '⏱️',
  badge: '2 игрока',
  component: TimeTargetDuelGame,
};
