import { useEffect, useMemo, useRef, useState } from 'react';
import { games } from '../games/index.js';
import GameCard from './GameCard.jsx';
import UserAvatar from './UserAvatar.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import { searchGames } from '../lib/gameSearch.js';

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
  user,
  authLoading = false,
  onLogin,
  onRegister,
  onProfile,
  onToggleSidebar,
  sidebarOpen = false,
  effectiveTheme = 'dark',
  appearanceMode = 'auto',
  onToggleTheme,
  token,
  onProfileSection,
  onDuelInvite,
}) {
  const [focused, setFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef(null);

  const suggestions = useMemo(() => search.trim() ? searchGames(games, search).slice(0, 5) : [], [search]);

  // Opening navigation closes keyboard/search suggestions, regardless of device width.
  useEffect(() => {
    if (!sidebarOpen) return;
    setMobileSearchOpen(false);
    setFocused(false);
    searchInputRef.current?.blur();
  }, [sidebarOpen]);

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
      <div className="site-header__left">
        <button type="button" className={`site-menu-toggle ${sidebarOpen ? 'is-open' : ''}`} onClick={onToggleSidebar} aria-label={sidebarOpen ? 'Закрыть боковое меню' : 'Открыть боковое меню'} aria-controls="codumi-sidebar" aria-expanded={sidebarOpen}><span/><span/><span/></button>
      <button type="button" className="brand" onClick={onHome} aria-label="Kodumi Games — на главную">
        <span className="brand__mark" aria-hidden="true">
          <img className="brand__logo" src={`${import.meta.env.BASE_URL}images/site/kodumi-mark.svg`} alt="" />
        </span>
        <span className="brand__text"><strong>KODUMI</strong><small>GAMES</small></span>
      </button>
      </div>

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
          className={`header-icon-button codumi-theme-toggle ${effectiveTheme === 'light' ? 'is-day' : 'is-night'}`}
          onClick={onToggleTheme}
          aria-label={`${effectiveTheme === 'light' ? 'Сейчас дневная тема. Включить ночную' : 'Сейчас ночная тема. Включить дневную'}${appearanceMode === 'auto' ? ' (автоматический режим)' : ''}`}
          title={`${effectiveTheme === 'light' ? 'Дневная тема' : 'Ночная тема'} · нажми, чтобы переключить`}
        >
          {effectiveTheme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z"/></svg>
          )}
        </button>
        <button
          type="button"
          className={`header-icon-button mobile-search-toggle ${mobileSearchOpen ? 'is-active' : ''}`}
          onClick={toggleMobileSearch}
          aria-label={mobileSearchOpen ? 'Закрыть поиск' : 'Открыть поиск'}
          aria-expanded={mobileSearchOpen}
        >
          <SearchIcon />
        </button>

        {!authLoading && !user && (
          <>
            <button type="button" className="header-auth-button header-auth-button--ghost" onClick={onLogin}>Войти</button>
            <button type="button" className="header-auth-button" onClick={onRegister}>Регистрация</button>
          </>
        )}

        {user && (
          <>
            <NotificationsBell token={token} user={user} sidebarOpen={sidebarOpen} onProfileSection={onProfileSection} onOpenGame={openGame} onDuelInvite={onDuelInvite} />
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

            <button type="button" className="header-profile-button" onClick={onProfile} aria-label={`Профиль ${user.username}`}>
              <UserAvatar user={user} size={44} />
              <span className={`header-profile-status ${connected ? 'is-online' : ''}`} />
            </button>
          </>
        )}

        {authLoading && <span className="header-auth-loading" aria-label="Загрузка профиля" />}
      </div>
    </header>
  );
}
