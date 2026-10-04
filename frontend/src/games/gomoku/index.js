import GomokuGame from './GomokuGame.jsx';

export default {
  id: 'gomoku',
  order: 22,
  title: 'Гомоку',
  description: 'Поле 10×10. Поставь пять своих фишек подряд по горизонтали, вертикали или диагонали.',
  icon: '⚫⚪',
  badge: '2 игрока',
  component: GomokuGame,
};
