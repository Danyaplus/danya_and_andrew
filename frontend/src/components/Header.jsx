import { useEffect, useMemo, useRef, useState } from 'react';
import { games } from '../games/index.js';
import GameCard from './GameCard.jsx';
import UserAvatar from './UserAvatar.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import { searchGames } from '../lib/gameSearch.js';
import { translateText } from '../lib/translations.js';

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
  language = 'uk',
  onLanguageChange,
}) {
  const [focused, setFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const guestMenuRef = useRef(null);
  const searchInputRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const searchWrapRef = useRef(null);
  const [visibleSearchHeight, setVisibleSearchHeight] = useState(() => typeof window !== 'undefined' ? (window.visualViewport?.height || window.innerHeight) : 600);

  const suggestions = useMemo(() => search.trim() ? searchGames(games, search).slice(0, 5) : [], [search]);

  // The guest menu stays within the viewport and is dismissible by keyboard or tap.
  useEffect(() => {
    if (!guestMenuOpen) return undefined;
    const outside = (event) => {
      if (!guestMenuRef.current?.contains(event.target)) setGuestMenuOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') setGuestMenuOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [guestMenuOpen]);

  // Opening navigation closes keyboard/search suggestions, regardless of device width.
  useEffect(() => {
    if (!sidebarOpen) return;
    setGuestMenuOpen(false);
    setMobileSearchOpen(false);
    setFocused(false);
    setSearch('');
    searchInputRef.current?.blur();
  }, [sidebarOpen]);

  // iOS closes the keyboard by blurring the input. That is NOT a request to
  // dismiss the search: results stay visible until the toggle or outside tap.
  function closeMobileSearch() {
    setMobileSearchOpen(false);
    setFocused(false);
    setSearch('');
    searchInputRef.current?.blur();
  }

  function toggleMobileSearch() {
    setGuestMenuOpen(false);
    if (mobileSearchOpen) {
      closeMobileSearch();
      return;
    }
    setSearch('');
    setMobileSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus({ preventScroll: true }), 60);
  }

  useEffect(() => {
    if (!mobileSearchOpen) return undefined;
    const onOutsidePress = (event) => {
      if (searchWrapRef.current?.contains(event.target) || mobileToggleRef.current?.contains(event.target)) return;
      closeMobileSearch();
    };
    const onEscape = (event) => {
      if (event.key === 'Escape') closeMobileSearch();
    };
    const updateHeight = () => setVisibleSearchHeight(Math.round(window.visualViewport?.height || window.innerHeight));
    updateHeight();
    document.addEventListener('pointerdown', onOutsidePress);
    document.addEventListener('keydown', onEscape);
    window.addEventListener('resize', updateHeight, { passive: true });
    window.addEventListener('orientationchange', updateHeight, { passive: true });
    window.visualViewport?.addEventListener('resize', updateHeight, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onOutsidePress);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
    };
  }, [mobileSearchOpen]);

  function openGame(gameId) {
    closeMobileSearch();
    onOpenGame(gameId);
  }

  function openChat() {
    closeMobileSearch();
    onOpenChat?.();
  }

  return (
    <header
      className={`site-header ${mobileSearchOpen ? 'is-search-open' : ''} ${user ? 'site-header--authenticated' : 'site-header--guest'}`}
      style={{ '--kd-search-visible-height': `${visibleSearchHeight}px` }}
    >
      <div className="site-header__left">
        <button type="button" className={`site-menu-toggle ${sidebarOpen ? 'is-open' : ''}`} onClick={onToggleSidebar} aria-label={sidebarOpen ? 'Закрыть боковое меню' : 'Открыть боковое меню'} aria-controls="codumi-sidebar" aria-expanded={sidebarOpen}><span/><span/><span/></button>
      <button type="button" className="brand" onClick={onHome} aria-label="Kodumi Games — на главную">
        <span className="brand__mark" aria-hidden="true">
          <img className="brand__logo" src={`${import.meta.env.BASE_URL}images/site/kodumi-mark.svg`} alt="" />
        </span>
        <span className="brand__text"><strong>KODUMI</strong><small>GAMES</small></span>
      </button>
      </div>

      <div ref={searchWrapRef} className={`search-wrap ${mobileSearchOpen ? 'is-mobile-open' : ''}`}>
        <span className="search-icon"><SearchIcon /></span>
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { if (!mobileSearchOpen) window.setTimeout(() => setFocused(false), 140); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && mobileSearchOpen) closeMobileSearch();
            else if (event.key === 'Enter' && mobileSearchOpen) {
              // The iOS keyboard's Done/Search button must not launch a game.
              event.preventDefault();
              searchInputRef.current?.blur();
            } else if (event.key === 'Enter' && suggestions[0]) {
              event.preventDefault();
              openGame(suggestions[0].id);
            }
          }}
          placeholder="Найти игру..."
          aria-label="Поиск игр"
        />
        {(focused || mobileSearchOpen) && search.trim() && (
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
        <label className="codumi-language-header" aria-label="Мова / Язык / Language">
          <span aria-hidden="true">🌐</span>
          <select value={language} onChange={(event) => onLanguageChange?.(event.target.value)} aria-label="Мова / Язык / Language">
            <option value="uk">УКР</option>
            <option value="ru">РУС</option>
            <option value="en">ENG</option>
          </select>
        </label>
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
          ref={mobileToggleRef}
          className={`header-icon-button mobile-search-toggle ${mobileSearchOpen ? 'is-active' : ''}`}
          onClick={toggleMobileSearch}
          aria-label={mobileSearchOpen ? 'Закрыть поиск' : 'Открыть поиск'}
          aria-expanded={mobileSearchOpen}
        >
          <SearchIcon />
        </button>

        {!authLoading && !user && (
          <>
            <button type="button" className="header-auth-button header-auth-button--ghost header-auth-button--desktop" onClick={onLogin}>{translateText('Войти', language)}</button>
            <button type="button" className="header-auth-button header-auth-button--desktop" onClick={onRegister}>{translateText('Регистрация', language)}</button>
            <div className="header-guest-menu" ref={guestMenuRef}>
              <button
                type="button"
                className="header-icon-button header-guest-menu__toggle"
                aria-label={translateText('Войти', language)}
                aria-expanded={guestMenuOpen}
                aria-controls="kodumi-mobile-auth-menu"
                onClick={() => { setMobileSearchOpen(false); setFocused(false); setGuestMenuOpen((open) => !open); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>
              </button>
              <div id="kodumi-mobile-auth-menu" className="header-guest-menu__panel" hidden={!guestMenuOpen}>
                <button type="button" onClick={() => { setGuestMenuOpen(false); onLogin(); }}>{translateText('Войти', language)}</button>
                <button type="button" className="header-guest-menu__register" onClick={() => { setGuestMenuOpen(false); onRegister(); }}>{translateText('Регистрация', language)}</button>
              </div>
            </div>
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
