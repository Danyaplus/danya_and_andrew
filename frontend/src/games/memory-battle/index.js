import MemoryBattleGame from './MemoryBattleGame.jsx';

export default {
  id: 'memory-battle',
  order: 24,
  title: 'Memory Battle',
  description: 'Открывай карточки по две. Нашёл пару — забираешь её себе и ходишь ещё раз.',
  icon: '🃏',
  badge: '2 игрока',
  component: MemoryBattleGame,
};
