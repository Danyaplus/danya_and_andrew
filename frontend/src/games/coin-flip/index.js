import { lazy } from 'react';
const CoinFlipGame = lazy(() => import('./CoinFlipGame.jsx'));

export default {
  id: 'coin-flip',
  order: 41,
  title: 'Орёл или решка',
  description: 'Угадывай сторону монеты быстрее удачи! Семь раундов и один победитель. Играй против друга онлайн.',
  icon: '🪙',
  badge: '2 игрока',
  component: CoinFlipGame,
};
