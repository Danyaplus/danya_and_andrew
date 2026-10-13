import ConnectFourGame from './ConnectFourGame.jsx';

export default {
  id: 'connect-four',
  order: 43,
  title: 'Четыре в ряд',
  description: 'Бросай фишки по очереди! Собери четыре подряд по горизонтали, вертикали или диагонали.',
  icon: '🔴🟡',
  badge: '2 игрока',
  component: ConnectFourGame,
};
