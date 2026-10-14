import { useEffect, useRef } from 'react';
import UserAvatar from './UserAvatar.jsx';
import '../styles/sidebar.css';

function NavIcon({ name }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></>,
    games: <><rect x="3" y="7" width="18" height="11" rx="5"/><path d="M7 12h6M10 9v6M16.5 11h.01M18 14h.01"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    friends: <><circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 4 5"/></>,
    chat: <><path d="M20 12a8 8 0 0 1-8 8c-2 0-3.5-.4-5-1.5L3 20l1.5-4a8 8 0 1 1 15.5-4Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9.5 2.7 5 0 .5 2.4 2 .9 2-.9 3 4-1.7 1.7.1 2.2 1.6 1.6-3 4-2.1-.8-1.9.9-.5 2.3h-5l-.5-2.3-1.9-.9-2.1.8-3-4 1.6-1.6.1-2.2L2 9.1l3-4 2 .9 2-.9z"/></>,
    awards: <><path d="M7 3h10v9a5 5 0 0 1-10 0V3Z"/><path d="M7 5H3v3c0 3 2 5 5 5M17 5h4v3c0 3-2 5-5 5M12 17v4M7 22h10"/></>,
    shield: <><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function Sidebar({ open, onClose, user, onHome, onCatalog, onProfileSection, onChat, onLogin, density, setDensity, currentPage }) {
  const asideRef = useRef(null);
  const move = (callback) => { callback(); onClose(); };
  useEffect(() => {
    if (!open || !asideRef.current) return undefined;
    const drawer = asideRef.current;
    let previousY = 0;
    const onStart = (event) => { previousY = event.touches[0]?.clientY ?? previousY; };
    const onMove = (event) => {
      if (event.touches.length !== 1) return;
      const currentY = event.touches[0].clientY;
      const movingDown = currentY > previousY;
      const atTop = drawer.scrollTop <= 0;
      const atBottom = drawer.scrollTop + drawer.clientHeight >= drawer.scrollHeight - 1;
      if ((movingDown && atTop) || (!movingDown && atBottom)) event.preventDefault();
      previousY = currentY;
    };
    drawer.addEventListener('touchstart', onStart, { passive: true });
    drawer.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      drawer.removeEventListener('touchstart', onStart);
      drawer.removeEventListener('touchmove', onMove);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const handleOutsideClick = (event) => {
      if (asideRef.current?.contains(event.target) || event.target.closest?.('.site-menu-toggle')) return;
      onClose();
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [open, onClose]);
  return (
    <>
      {open && <button className="codumi-sidebar-scrim" aria-label="Закрыть меню" type="button" onClick={onClose} />}
      <aside ref={asideRef} className={`codumi-sidebar ${open ? 'is-open' : ''}`} id="codumi-sidebar" aria-label="Главное меню" aria-hidden={!open}>
        <div className="codumi-sidebar__top"><span>НАВИГАЦИЯ</span><button type="button" className="codumi-sidebar__close" onClick={onClose} aria-label="Закрыть меню">×</button></div>
        <nav className="codumi-sidebar__nav" aria-label="Разделы сайта">
          <button className={currentPage === 'home' ? 'is-active' : ''} type="button" onClick={() => move(onHome)}><NavIcon name="home"/><span>Главная</span></button>
          <button type="button" onClick={() => move(onCatalog)}><NavIcon name="games"/><span>Все игры</span></button>
        </nav>
        <div className="codumi-sidebar__divider" />
        <span className="codumi-sidebar__label">АККАУНТ</span>
        {user ? (
          <>
            <button type="button" className="codumi-sidebar__user" onClick={() => move(() => onProfileSection('overview'))}>
              <UserAvatar user={user} size={38}/>
              <span><strong>{user.displayName || user.username}</strong><small>@{user.username}</small></span><b>›</b>
            </button>
            <nav className="codumi-sidebar__nav" aria-label="Личный кабинет">
              <button type="button" onClick={() => move(() => onProfileSection('awards'))}><NavIcon name="awards"/><span>Мои награды</span></button>
              <button type="button" onClick={() => move(() => onProfileSection('friends'))}><NavIcon name="friends"/><span>Друзья</span></button>
              <button type="button" onClick={() => move(onChat)}><NavIcon name="chat"/><span>Чат</span></button>
              <button type="button" onClick={() => move(() => onProfileSection('settings'))}><NavIcon name="settings"/><span>Настройки</span></button>
              <button type="button" onClick={() => move(() => onProfileSection('security'))}><NavIcon name="shield"/><span>Безопасность</span></button>
            </nav>
          </>
        ) : (
          <div className="codumi-sidebar__guest"><p>Войди, чтобы открыть профиль, друзей и чат.</p><button type="button" onClick={() => move(onLogin)}>Войти в аккаунт →</button></div>
        )}
        <div className="codumi-sidebar__spacer" />
        <div className="codumi-sidebar__density"><span>ВИД КАТАЛОГА</span><div role="group" aria-label="Размер карточек"><button type="button" className={density === 'compact' ? 'is-active' : ''} aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>Компактно</button><button type="button" className={density === 'comfortable' ? 'is-active' : ''} aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}>Крупнее</button></div></div>
        <div className="codumi-sidebar__footer"><span className="codumi-sidebar__signal"/>CODUMI GAMES <small>Играем вместе</small></div>
      </aside>
    </>
  );
}
