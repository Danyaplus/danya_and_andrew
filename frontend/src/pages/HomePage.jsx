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
      <section className="hero-panel hero-panel--live" aria-label="Danya & Andrew">
        <div className="hero-copy">
          <span className="eyebrow">Играй вдвоём в реальном времени</span>
          <h1>Danya <span>&amp;</span> Andrew</h1>
          <p>Выбирай игру, подключайся к очереди и играй с другом прямо в браузере.</p>

          <div className="hero-chips" aria-hidden="true">
            <span><i className="hero-chip-dot hero-chip-dot--blue" />Мгновенный матч</span>
            <span><i className="hero-chip-dot hero-chip-dot--violet" />Только 2 игрока</span>
          </div>
        </div>

        <div className="hero-scene" aria-hidden="true">
          <div className="hero-scene__glow hero-scene__glow--blue" />
          <div className="hero-scene__glow hero-scene__glow--violet" />
          <div className="hero-scene__spark hero-scene__spark--a">✦</div>
          <div className="hero-scene__spark hero-scene__spark--b">✦</div>
          <div className="hero-scene__spark hero-scene__spark--c">✦</div>

          <div className="hero-ribbon hero-ribbon--blue" />
          <div className="hero-ribbon hero-ribbon--violet" />

          <div className="hero-symbol hero-symbol--cross">✕</div>
          <div className="hero-symbol hero-symbol--cube" />
          <div className="hero-symbol hero-symbol--token" />

          <div className="hero-card hero-card--spade"><span>A</span><b>♠</b></div>
          <div className="hero-card hero-card--heart"><span>A</span><b>♥</b></div>

          <div className="hero-piece hero-piece--king">♚</div>
          <div className="hero-piece hero-piece--knight">♞</div>

          <div className="hero-floor" />
          <div className="hero-orbit hero-orbit--outer" />
          <div className="hero-orbit hero-orbit--inner" />

          <div className="hero-gamepad">
            <span className="hero-gamepad__dpad">+</span>
            <span className="hero-gamepad__stick hero-gamepad__stick--left" />
            <span className="hero-gamepad__stick hero-gamepad__stick--right" />
            <span className="hero-gamepad__button hero-gamepad__button--a" />
            <span className="hero-gamepad__button hero-gamepad__button--b" />
          </div>

          <div className="hero-disc hero-disc--red"><i>♛</i></div>
          <div className="hero-disc hero-disc--dark"><i>♛</i></div>

          <div className="hero-player hero-player--blue">
            <span className="hero-player__head" />
            <span className="hero-player__body"><i>♛</i></span>
          </div>
          <div className="hero-player hero-player--violet">
            <span className="hero-player__head" />
            <span className="hero-player__body"><i>♛</i></span>
          </div>
        </div>
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
