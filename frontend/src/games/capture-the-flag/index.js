import CaptureTheFlagGame from './CaptureTheFlagGame.jsx';

export default {
  id: 'capture-the-flag',
  order: 35,
  title: 'Укради флаг',
  description: 'Проберись на вражескую базу, укради флаг и вернись к своему. Заморозь преследователя и первым захвати 3 флага!',
  icon: '🚩',
  badge: '2 игрока',
  component: CaptureTheFlagGame,
};
