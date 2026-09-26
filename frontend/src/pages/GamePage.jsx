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

  return (
    <main className="page-shell game-page">
      <button type="button" className="back-button" onClick={onBack}>
        ← Все игры
      </button>
      <GameComponent />
    </main>
  );
}
