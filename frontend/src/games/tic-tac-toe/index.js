import TicTacToeGame from './TicTacToeGame.jsx';

export default {
  id: 'tic-tac-toe',
  order: 3,
  title: 'Крестики-нолики',
  description: 'Только 3 знака на поле: на четвёртом ходу самый старый исчезает.',
  icon: '❌⭕',
  badge: '2 игрока',
  component: TicTacToeGame,
};
