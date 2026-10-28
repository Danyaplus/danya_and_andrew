import { lazy } from 'react';
const PinPongDuelGame = lazy(() => import('./PinPongDuelGame.jsx'));

export default {
  id: 'pin-pong-duel',
  order: 20,
  title: 'Пин-понг дуэль',
  description: 'Одна кнопка, две лопатки и быстрая физика: первым забей 2 гола.',
  icon: '🏓',
  badge: '2 игрока',
  component: PinPongDuelGame,
};
