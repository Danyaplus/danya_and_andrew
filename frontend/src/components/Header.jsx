import { useMemo, useState } from 'react';
import { games } from '../games/index.js';
import GameCard from './GameCard.jsx';

export default function Header({ search, setSearch, onHome, onOpenGame, connected }) {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return games.filter((game) => game.title.toLowerCase().includes(query)).slice(0, 5);
  }, [search]);

  return (
    <header className="site-header">
      <button type="button" className="brand" onClick={onHome} aria-label="На главную">
        <span className="brand__mark">D&A</span>
        <span className="brand__text">Danya & Andrew</span>
      </button>

      <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Найти игру..."
          aria-label="Поиск игр"
        />
        {focused && search.trim() && (
          <div className="search-dropdown">
            {suggestions.length > 0 ? (
              suggestions.map((game) => (
                <GameCard key={game.id} game={game} compact onOpen={onOpenGame} />
              ))
            ) : (
              <div className="search-empty">Ничего не найдено</div>
            )}
          </div>
        )}
      </div>

      <div className={`connection-pill ${connected ? 'is-online' : ''}`}>
        <span />
        {connected ? 'Онлайн' : 'Подключение'}
      </div>
    </header>
  );
}
