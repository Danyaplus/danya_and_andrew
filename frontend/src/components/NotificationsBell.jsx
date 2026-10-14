import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import '../styles/notifications.css';

const ICONS = { friend_request: '👥', friend_accepted: '🤝', party_invite: '🎮', achievement: '🏅', match: '🎯', level_up: '⭐', tournament: '🏆' };

export default function NotificationsBell({ token, user, sidebarOpen = false, onProfileSection, onOpenGame, onDuelInvite }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const container = useRef(null);
  const currentUserId = user?.id;
  const readInFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token || !currentUserId) return;
    try {
      const data = await apiRequest('/api/notifications', { token });
      setItems(data.notifications || []);
      setError('');
    } catch {
      setError('Не удалось получить уведомления.');
    }
  }, [token, currentUserId]);

  useEffect(() => {
    setItems([]);
    setOpen(false);
    if (!currentUserId) return undefined;
    void load();
    const onNew = (notification) => setItems((old) => [notification, ...old.filter((item) => item.id !== notification.id)].slice(0, 100));
    const refresh = () => { void load(); };
    const onFocus = () => { void load(); };
    socket.on('notifications:new', onNew);
    socket.on('connect', refresh);
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(load, 60_000);
    return () => {
      socket.off('notifications:new', onNew);
      socket.off('connect', refresh);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [currentUserId, load]);

  useEffect(() => {
    if (sidebarOpen) setOpen(false);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(event) {
      if (!container.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = items.filter((item) => new Date(item.expires_at).getTime() > Date.now());
  const unread = active.filter((item) => !item.is_read).length;

  async function openNotifications() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    // Seeing the list marks all currently delivered notices as read at once.
    setItems((old) => old.map((item) => ({ ...item, is_read: true })));
    if (!token || readInFlight.current) return;
    readInFlight.current = true;
    try {
      await apiRequest('/api/notifications/read-all', { token, method: 'PATCH' });
      await load();
    } catch {
      await load(); // Restore actual read states if the request failed.
    } finally {
      readInFlight.current = false;
    }
  }

  async function clickNotification(item) {
    if (!item.is_read) {
      setItems((old) => old.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry));
      try { await apiRequest(`/api/notifications/${encodeURIComponent(item.id)}/read`, { token, method: 'PATCH' }); }
      catch { void load(); }
    }
    setOpen(false);
    if (item.link?.startsWith('duel:')) onDuelInvite?.(item.link.slice(5));
    else if (item.link === 'quests') window.location.hash = '#/quests';
    else if (item.link?.startsWith('profile:')) onProfileSection?.(item.link.slice(8));
    else if (item.link?.startsWith('#/game/')) onOpenGame?.(item.link.slice('#/game/'.length));
  }

  return (
    <div className="codumi-notification-wrap" ref={container}>
      <button type="button" className={`header-icon-button codumi-bell ${open ? 'is-open' : ''}`} onClick={openNotifications} aria-label={`Уведомления. Непрочитанных: ${unread}`} aria-expanded={open} aria-haspopup="dialog" title="Уведомления">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>
        {unread > 0 && <span className="codumi-bell__count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <section className="codumi-notification-popover" role="dialog" aria-label="Уведомления">
          <div className="codumi-notification-head"><div><strong>Уведомления</strong><small>За сегодняшний день · по Киеву</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Закрыть">×</button></div>
          <div className="codumi-notification-feed">
            {error && <div className="codumi-notification-empty">{error}</div>}
            {!error && active.length === 0 && <div className="codumi-notification-empty">🔔 Пока всё спокойно. Здесь появятся результаты матчей, заявки и новые награды.</div>}
            {!error && active.map((item) => (
              <button type="button" className={`codumi-notification-row ${item.is_read ? '' : 'is-unread'}`} key={item.id} onClick={() => clickNotification(item)}>
                <span className="codumi-notification-icon">{ICONS[item.kind] || '🔔'}</span>
                <span><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' })}</time></span>
              </button>
            ))}
          </div>
          <div className="codumi-notification-foot">Записи исчезают в 00:00 по Киеву. Турниры подключим позже.</div>
        </section>
      )}
    </div>
  );
}
