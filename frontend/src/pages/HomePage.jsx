import { useMemo } from 'react';
import GameCard from '../components/GameCard.jsx';
import { games } from '../games/index.js';

export default function HomePage({ search, onOpenGame }) {
  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return games;
    return games.filter((game) => {
      return (
        game.title.toLowerCase().includes(query) ||
        game.description.toLowerCase().includes(query)
      );
    });
  }, [search]);

  return (
    <main className="home-page page-shell">
      <section className="hero-panel hero-panel--art" aria-label="Danya & Andrew">
        <div className="hero-copy">
          <span className="eyebrow">Играй вдвоём в реальном времени</span>
          <h1>Danya <span>&amp;</span> Andrew</h1>
          <p>
            Выбирай игру, подключайся к очереди и играй с другом прямо в браузере.
          </p>
        </div>

        <picture className="hero-art" aria-hidden="true">
          <source
            media="(max-width: 600px)"
            srcSet={`${import.meta.env.BASE_URL}images/site/home-hero-mobile.webp`}
          />
          <img
            src={`${import.meta.env.BASE_URL}images/site/home-hero-desktop.webp`}
            alt=""
            loading="eager"
            decoding="async"
            draggable="false"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        </picture>
      </section>

      <section className="catalog-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Каталог</span>
            <h2>{search.trim() ? 'Результаты поиска' : 'Все игры'}</h2>
          </div>
          <span className="result-count">{filteredGames.length}</span>
        </div>

        {filteredGames.length > 0 ? (
          <div className="games-grid">
            {filteredGames.map((game) => (
              <GameCard key={game.id} game={game} onOpen={onOpenGame} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div>⌕</div>
            <h3>Такой игры пока нет</h3>
            <p>Попробуй другое название.</p>
          </div>
        )}
      </section>
    </main>
  );
}
