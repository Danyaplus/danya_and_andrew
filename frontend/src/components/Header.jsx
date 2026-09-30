import { useMemo, useRef, useState } from 'react';
import { games } from '../games/index.js';
import GameCard from './GameCard.jsx';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.4 5.2h13.2c1 0 1.8.8 1.8 1.8v8.1c0 1-.8 1.8-1.8 1.8H11l-4.7 3v-3H5.4c-1 0-1.8-.8-1.8-1.8V7c0-1 .8-1.8 1.8-1.8Z" />
      <path d="M7.8 9.2h8.4M7.8 12.8h5.6" />
    </svg>
  );
}

export default function Header({
  search,
  setSearch,
  onHome,
  onOpenGame,
  connected,
  onOpenChat,
  chatUnread = 0,
}) {
  const [focused, setFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef(null);

  const suggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return games.filter((game) => game.title.toLowerCase().includes(query)).slice(0, 5);
  }, [search]);

  function toggleMobileSearch() {
    if (mobileSearchOpen) {
      setMobileSearchOpen(false);
      setFocused(false);
      return;
    }

    setMobileSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
  }

  function openGame(gameId) {
    setMobileSearchOpen(false);
    setFocused(false);
    onOpenGame(gameId);
  }

  function openChat() {
    setMobileSearchOpen(false);
    setFocused(false);
    onOpenChat?.();
  }

  return (
    <header className={`site-header ${mobileSearchOpen ? 'is-search-open' : ''}`}>
      <button type="button" className="brand" onClick={onHome} aria-label="На главную">
        <span className="brand__mark" aria-hidden="true"><span>T</span><i>→</i><span>T</span></span>
        <span className="brand__text">Today is Tomorrow</span>
      </button>

      <div className={`search-wrap ${mobileSearchOpen ? 'is-mobile-open' : ''}`}>
        <span className="search-icon"><SearchIcon /></span>
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          placeholder="Найти игру..."
          aria-label="Поиск игр"
        />
        {focused && search.trim() && (
          <div className="search-dropdown">
            {suggestions.length > 0 ? (
              suggestions.map((game) => (
                <GameCard key={game.id} game={game} compact onOpen={openGame} />
              ))
            ) : (
              <div className="search-empty">Ничего не найдено</div>
            )}
          </div>
        )}
      </div>

      <div className="header-actions">
        <button
          type="button"
          className={`header-icon-button mobile-search-toggle ${mobileSearchOpen ? 'is-active' : ''}`}
          onClick={toggleMobileSearch}
          aria-label={mobileSearchOpen ? 'Закрыть поиск' : 'Открыть поиск'}
          aria-expanded={mobileSearchOpen}
        >
          <SearchIcon />
        </button>

        <button
          type="button"
          className="header-icon-button chat-header-button"
          onClick={openChat}
          aria-label={chatUnread > 0 ? `Открыть чат, непрочитанных: ${chatUnread}` : 'Открыть глобальный чат'}
        >
          <ChatIcon />
          {chatUnread > 0 && (
            <span className="chat-unread-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>
          )}
        </button>

        <div className={`connection-pill ${connected ? 'is-online' : ''}`}>
          <span />
          {connected ? 'Онлайн' : 'Подключение'}
        </div>
      </div>
    </header>
  );
}
