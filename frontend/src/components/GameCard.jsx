export default function GameCard({ game, compact = false, eager = false, priority = false, onOpen }) {
  const imageUrl = `${import.meta.env.BASE_URL}images/games/${game.id}.webp`;

  return (
    <button
      type="button"
      className={`game-card ${compact ? 'game-card--compact' : ''}`}
      onClick={() => onOpen(game.id)}
    >
      <div className="game-card__art" aria-hidden="true">
        <span className="game-card__fallback">{game.icon}</span>

        <img
          className="game-card__image"
          src={imageUrl}
          alt=""
          loading={compact || eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          draggable="false"
          onError={(event) => {
            // If a game has no image, keep the emoji fallback visible.
            event.currentTarget.hidden = true;
          }}
        />
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
