import { lazy } from 'react';
const ReactionDuelGame = lazy(() => import('./ReactionDuelGame.jsx'));

export default {
  id: 'reaction-duel',
  order: 90,
  title: 'Реакция: Старт',
  description: 'Зажми кнопку, дождись, пока погаснут пять огней, и отпусти быстрее соперника.',
  icon: '🚦',
  badge: '2 игрока',
  component: ReactionDuelGame,
};
