import { useEffect, useMemo, useRef, useState } from 'react';
import GameCard from '../components/GameCard.jsx';
import { games } from '../games/index.js';

const PAGE_SIZE = 12;

export default function HomePage({ search, onOpenGame }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef(null);
  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return games;
    return games.filter((game) =>
      game.title.toLowerCase().includes(query) ||
      game.description.toLowerCase().includes(query)
    );
  }, [search]);

  // Reset to the first batch whenever the search changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search]);

  const shownGames = filteredGames.slice(0, visibleCount);
  const hasMore = shownGames.length < filteredGames.length;

  // Begin the next batch before the visitor reaches the bottom.
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!hasMore || !target || !('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredGames.length));
      }
    }, { rootMargin: '600px 0px', threshold: 0 });

    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleCount, filteredGames.length, hasMore]);

  function scrollToCatalog() {
    document.getElementById('games-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="home-page page-shell">
      <section className="kodumi-hero" aria-label="Kodumi Games — игры на двоих онлайн">
        <div className="kodumi-hero__glow" aria-hidden="true" />
        <div className="kodumi-hero__content">
          <div className="kodumi-hero__label"><span className="kodumi-hero__signal" /> KODUMI GAMES <span className="kodumi-hero__label-separator">/</span> ИГРЫ ОНЛАЙН</div>
          <h1>Играй <span>вдвоём.</span><br />Побеждай <span>онлайн.</span></h1>
          <p>Выбирай игру, находи соперника и соревнуйся в реальном времени. Прямо в браузере — без скачивания.</p>
          <div className="kodumi-hero__actions">
            <button className="kodumi-hero__cta" type="button" onClick={scrollToCatalog}>
              Выбрать игру <span aria-hidden="true">↗</span>
            </button>
            <span className="kodumi-hero__instant"><span className="kodumi-hero__instant-dot" /> Игры для двух игроков</span>
          </div>
        </div>
        <div className="kodumi-hero__scene" aria-hidden="true">
          <div className="kodumi-arena">
            <span className="kodumi-arena__orbit kodumi-arena__orbit--one" />
            <span className="kodumi-arena__orbit kodumi-arena__orbit--two" />
            <div className="kodumi-arena__player kodumi-arena__player--blue"><span>1</span><small>ИГРОК</small></div>
            <div className="kodumi-arena__versus">VS</div>
            <div className="kodumi-arena__player kodumi-arena__player--violet"><span>2</span><small>ИГРОК</small></div>
            <div className="kodumi-arena__status"><span /> МАТЧ В РЕАЛЬНОМ ВРЕМЕНИ</div>
          </div>
        </div>
      </section>

      <section className="catalog-section" id="games-catalog">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Выбирай свой матч</span>
            <h2>{search.trim() ? 'Результаты поиска' : 'Все игры'}</h2>
          </div>
          <span className="result-count">{filteredGames.length}</span>
        </div>

        {filteredGames.length > 0 ? (
          <>
            <div className="games-grid">
              {shownGames.map((game, index) => (
                <GameCard key={game.id} game={game} eager={index < PAGE_SIZE} priority={index < 4} onOpen={onOpenGame} />
              ))}
            </div>
            {hasMore && (
              <div className="catalog-load-more" ref={loadMoreRef}>
                <span>Показано {shownGames.length} из {filteredGames.length} игр</span>
                <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredGames.length))}>
                  Показать ещё 12 игр ↓
                </button>
              </div>
            )}
          </>
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
