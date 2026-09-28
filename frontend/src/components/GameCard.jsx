export default function GameCard({ game, compact = false, onOpen }) {
  return (
    <button
      type="button"
      className={`game-card ${compact ? 'game-card--compact' : ''}`}
      onClick={() => onOpen(game.id)}
    >
      <div className="game-card__art" aria-hidden="true">
        <span>{game.icon}</span>
      </div>
      <div className="game-card__body">
        <div className="game-card__title-row">
          <h3>{game.title}</h3>
          <span className="game-card__badge">{game.badge}</span>
        </div>
        {!compact && <p>{game.description}</p>}
      </div>
    </button>
  );
}
