import { lazy } from 'react';
const KnifeWheelDuelGame = lazy(() => import('./KnifeWheelDuelGame.jsx'));

export default {
  id: 'knife-wheel-duel',
  order: 92,
  title: 'Кинжалы',
  description: 'Метай кинжалы во вращающуюся мишень и не попади в уже застрявший клинок. Три раунда на точность.',
  icon: '🗡️',
  badge: '2 игрока',
  component: KnifeWheelDuelGame,
};
