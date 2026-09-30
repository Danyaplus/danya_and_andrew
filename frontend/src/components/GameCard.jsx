export default function GameCard({ game, compact = false, onOpen }) {
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
          loading="lazy"
          decoding="async"
          draggable="false"
          onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
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
