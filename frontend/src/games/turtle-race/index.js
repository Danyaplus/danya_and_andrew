import { lazy } from 'react';
const TurtleRaceGame = lazy(() => import('./TurtleRaceGame.jsx'));

export default {
  id: 'turtle-race',
  order: 92,
  title: 'Гонка черепах',
  description: 'Поймай зелёную зону, разгоняй черепаху и обгони соперника! Три заезда онлайн.',
  icon: '🐢',
  badge: '2 игрока',
  component: TurtleRaceGame,
};
