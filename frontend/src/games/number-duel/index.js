import NumberDuelGame from './NumberDuelGame.jsx';

export default {
  id: 'number-duel',
  order: 105,
  title: 'Угадай число',
  description: 'Загадай число от 1 до 100, а затем поменяйся с соперником. Кто угадает за меньшее число попыток?',
  icon: '🔢',
  badge: '2 игрока',
  component: NumberDuelGame,
};
