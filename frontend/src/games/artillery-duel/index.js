import ArtilleryDuelGame from './ArtilleryDuelGame.jsx';
import './artillery-duel.css';

export default {
  id: 'artillery-duel',
  order: 30,
  title: 'Tank Artillery',
  description: 'Пошаговая дуэль танков: разрушаемая земля, ящики, спецоружие и разные классы.',
  icon: '💥',
  badge: '2 игрока',
  component: ArtilleryDuelGame,
};
