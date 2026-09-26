import BattleshipGame from './BattleshipGame.jsx';

export default {
  id: 'battleship',
  order: 4,
  title: 'Морской бой',
  description: 'Классический морской бой 10×10 со случайным флотом и 30 секундами на ход.',
  icon: '🚢',
  badge: '2 игрока',
  component: BattleshipGame,
};
