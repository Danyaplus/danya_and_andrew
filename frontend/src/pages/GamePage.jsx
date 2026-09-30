export default function GamePage({ game, onBack }) {
  if (!game) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <h2>Игра не найдена</h2>
          <button className="primary-button" onClick={onBack}>На главную</button>
        </div>
      </main>
    );
  }

  const GameComponent = game.component;
  const imageUrl = `${import.meta.env.BASE_URL}images/games/${game.id}.webp`;

  return (
    <main className="page-shell game-page">
      <div className="game-page__backdrop" aria-hidden="true">
        <img
          src={imageUrl}
          alt=""
          draggable="false"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <div className="game-page__backdrop-shade" />
      </div>

      <div className="game-page__chrome">
        <button type="button" className="back-button game-page__back" onClick={onBack}>
          <span className="game-page__back-arrow">←</span>
          <span>Все игры</span>
        </button>

        <div className="game-page__identity">
          <div className="game-page__identity-image">
            <span className="game-page__identity-fallback">{game.icon}</span>
            <img
              src={imageUrl}
              alt=""
              draggable="false"
              onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          </div>

          <div className="game-page__identity-copy">
            <span>Сейчас играем</span>
            <strong>{game.title}</strong>
          </div>
        </div>
      </div>

      <div className="game-page__content">
        <GameComponent />
      </div>
    </main>
  );
}
