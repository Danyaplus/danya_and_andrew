import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import UserAvatar from './UserAvatar.jsx';
import AchievementsPanel from './AchievementsPanel.jsx';
import LevelBar from './LevelBar.jsx';
import MatchStatsPanel from './MatchStatsPanel.jsx';
import CosmeticsShop from './CosmeticsShop.jsx';
import '../styles/account.css';

const ERROR_TEXT = {
  USERNAME_INVALID: 'Логин: 3–20 символов, буквы, цифры, _ или -.',
  PASSWORD_INVALID: 'Пароль должен быть от 6 символов.',
  USERNAME_TAKEN: 'Такой логин уже занят.',
  AUTH_INVALID: 'Неверный логин или пароль.',
  CURRENT_PASSWORD_INVALID: 'Текущий пароль введён неверно.',
  AVATAR_TOO_LARGE: 'Картинка слишком большая.',
  AVATAR_INVALID: 'Не удалось сохранить эту картинку.',
  EMAIL_INVALID: 'Проверь адрес электронной почты.',
  EMAIL_TAKEN: 'Эта почта уже привязана к другому профилю.',
  AUTH_REQUIRED: 'Сессия закончилась. Войди снова.',
  SERVER_UNAVAILABLE: 'Не удаётся связаться с сервером. Проверь интернет и состояние Render.',
  REQUEST_TIMEOUT: 'Сервер долго не отвечает. Попробуй ещё раз через минуту.',
  PARTY_FRIEND_REQUIRED: 'В вечеринку можно добавить только друга.',
  DISPLAY_NAME_INVALID: 'Игровое имя должно быть от 1 до 28 символов.',
};

function friendlyError(error) {
  return ERROR_TEXT[error?.message] || 'Что-то пошло не так. Попробуй ещё раз.';
}

async function imageToAvatar(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('AVATAR_INVALID');
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.max(size / image.width, size / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    ctx.drawImage(image, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function RelationButton({ item, onAction, busy }) {
  if (item.relation === 'friend') {
    return <button className="account-mini-button is-muted" type="button" disabled>Друзья</button>;
  }
  if (item.relation === 'outgoing') {
    return <button className="account-mini-button is-muted" type="button" onClick={() => onAction('remove', item.id)} disabled={busy}>Отменить</button>;
  }
  if (item.relation === 'incoming') {
    return <button className="account-mini-button" type="button" onClick={() => onAction('accept', item.id)} disabled={busy}>Принять</button>;
  }
  return <button className="account-mini-button" type="button" onClick={() => onAction('request', item.id)} disabled={busy}>+ Друг</button>;
}

export default function AccountModal({
  mode,
  initialSection = 'overview',
  token,
  user,
  connected,
  party,
  onClose,
  onAuthenticated,
  onUserUpdated,
  onOpenDirectChat,
  onInviteFriend,
  onWatchFriend,
  onPartyChanged,
  onLogout,
  shop,
  onShopChange,
}) {
  const [authMode, setAuthMode] = useState(mode === 'register' ? 'register' : 'login');
  const [section, setSection] = useState(initialSection);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [emailSaved, setEmailSaved] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [profileSaved, setProfileSaved] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [friendsBusy, setFriendsBusy] = useState(false);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const fileRef = useRef(null);

  const isProfile = mode === 'profile' && Boolean(user && token);

  useEffect(() => {
    if (!mode) return undefined;
    // Lock the document, not the inner modal. Safari otherwise scrolls both.
    const y = window.scrollY;
    const previous = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      Object.assign(document.body.style, previous);
      window.scrollTo(0, y);
    };
  }, [Boolean(mode)]);

  useEffect(() => {
    if (!mode) return undefined;
    const onEscape = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mode, onClose]);

  useEffect(() => {
    if (!mode) return;
    setError('');
    setEmailSaved(false);
    if (mode === 'login' || mode === 'register') setAuthMode(mode);
    if (mode === 'profile') setSection(initialSection);
  }, [mode, initialSection]);

  useEffect(() => {
    setEmail(user?.email || '');
    setDisplayName(user?.displayName || user?.username || '');
  }, [user?.email, user?.displayName, user?.username]);

  async function loadFriends() {
    if (!token || !isProfile) return;
    try {
      const payload = await apiRequest('/api/friends', { token });
      setFriends(payload.friends || []);
      setIncoming(payload.incoming || []);
      setOutgoing(payload.outgoing || []);
    } catch (nextError) {
      setError(friendlyError(nextError));
    }
  }

  useEffect(() => {
    if (!isProfile) return undefined;
    loadFriends();
    socket.emit('presence:request');

    const updateOnline = ({ userId, online }) => {
      const update = (items) => items.map((item) => item.id === userId ? { ...item, online } : item);
      setFriends(update);
      setIncoming(update);
      setOutgoing(update);
      setResults(update);
    };
    const refresh = () => loadFriends();

    const updateMatch = ({ userId, gameId }) => {
      setFriends((items) => items.map((item) => item.id === userId ? { ...item, playingGameId: gameId } : item));
    };
    socket.on('presence:match', updateMatch);
    socket.on('presence:update', updateOnline);
    socket.on('friends:changed', refresh);
    return () => {
      socket.off('presence:update', updateOnline);
      socket.off('presence:match', updateMatch);
      socket.off('friends:changed', refresh);
    };
  }, [isProfile, token]);

  useEffect(() => {
    if (!isProfile || query.trim().length < 2) {
      setResults([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const payload = await apiRequest(`/api/users/search?q=${encodeURIComponent(query.trim())}`, { token });
        if (!cancelled) setResults(payload.users || []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, token, isProfile]);

  const outgoingIds = useMemo(() => new Set(outgoing.map((item) => item.id)), [outgoing]);
  const incomingIds = useMemo(() => new Set(incoming.map((item) => item.id)), [incoming]);
  const friendIds = useMemo(() => new Set(friends.map((item) => item.id)), [friends]);
  const decoratedResults = useMemo(() => results.map((item) => ({
    ...item,
    relation: friendIds.has(item.id) ? 'friend' : incomingIds.has(item.id) ? 'incoming' : outgoingIds.has(item.id) ? 'outgoing' : item.relation,
  })), [results, friendIds, incomingIds, outgoingIds]);

  const partyFriend = useMemo(() => {
    if (!party?.members || !user?.id) return null;
    return party.members.find((member) => member.id !== user.id) || null;
  }, [party, user?.id]);

  if (!mode) return null;

  async function submitAuth(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = await apiRequest(`/api/auth/${authMode}`, {
        method: 'POST',
        body: { username, password },
      });
      onAuthenticated?.(payload);
      setUsername('');
      setPassword('');
      onClose?.();
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function changeAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !token) return;
    setBusy(true);
    setError('');
    try {
      const avatar = await imageToAvatar(file);
      const payload = await apiRequest('/api/profile/avatar', {
        token,
        method: 'PATCH',
        body: { avatar },
      });
      onUserUpdated?.(payload.user);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function saveEmail(event) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    setEmailSaved(false);
    try {
      const payload = await apiRequest('/api/profile/email', {
        token,
        method: 'PATCH',
        body: { email: email.trim() },
      });
      onUserUpdated?.(payload.user);
      setEmail(payload.user?.email || '');
      setEmailSaved(true);
      window.setTimeout(() => setEmailSaved(false), 1800);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function saveDisplayName(event) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    setProfileSaved('');
    try {
      const payload = await apiRequest('/api/profile/display-name', {
        token,
        method: 'PATCH',
        body: { displayName: displayName.trim() },
      });
      onUserUpdated?.(payload.user);
      setDisplayName(payload.user?.displayName || '');
      setProfileSaved('name');
      window.setTimeout(() => setProfileSaved(''), 1800);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    setProfileSaved('');
    try {
      const payload = await apiRequest('/api/profile/password', {
        token,
        method: 'PATCH',
        body: { currentPassword, newPassword },
      });
      onUserUpdated?.(payload.user);
      setCurrentPassword('');
      setNewPassword('');
      setProfileSaved('password');
      window.setTimeout(() => setProfileSaved(''), 1800);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function friendAction(action, userId) {
    if (!token) return;
    setFriendsBusy(true);
    setError('');
    try {
      await apiRequest(`/api/friends/${action}`, {
        token,
        method: 'POST',
        body: { userId },
      });
      await loadFriends();
      if (query.trim().length >= 2) {
        const payload = await apiRequest(`/api/users/search?q=${encodeURIComponent(query.trim())}`, { token });
        setResults(payload.users || []);
      }
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setFriendsBusy(false);
    }
  }

  async function createParty(friend) {
    if (!token || !friend?.id) return;
    setFriendsBusy(true);
    setError('');
    try {
      const payload = await apiRequest('/api/party/create', {
        token,
        method: 'POST',
        body: { userId: friend.id },
      });
      onPartyChanged?.(payload.party || null);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setFriendsBusy(false);
    }
  }

  async function leaveParty() {
    if (!token) return;
    setFriendsBusy(true);
    setError('');
    try {
      await apiRequest('/api/party/leave', { token, method: 'POST' });
      onPartyChanged?.(null);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setFriendsBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await apiRequest('/api/auth/logout', { token, method: 'POST' });
    } catch {
      // Локальный выход всё равно выполняется, если сервер временно недоступен.
    } finally {
      setBusy(false);
      onLogout?.();
      onClose?.();
    }
  }

  return (
    <div className="account-layer" role="presentation">
      <button type="button" className="account-backdrop" aria-label="Закрыть" onClick={onClose} />
      <section className={`account-modal ${isProfile ? 'account-modal--profile' : ''}`} role="dialog" aria-modal="true" aria-label={isProfile ? "Личный кабинет" : "Вход в аккаунт"}>
        <button className="account-close" type="button" onClick={onClose} aria-label="Закрыть">×</button>

        {!isProfile ? (
          <>
            <div className="account-logo"><img src={`${import.meta.env.BASE_URL}images/site/kodumi-mark.svg`} alt="" /></div>
            <span className="account-kicker">Kodumi Games</span>
            <h2>{authMode === 'register' ? 'Создать аккаунт' : 'Войти в профиль'}</h2>
            <p className="account-subtitle">Твой профиль, аватар, друзья и онлайн-статус будут доступны на любом устройстве.</p>

            <div className="account-auth-tabs">
              <button type="button" className={authMode === 'login' ? 'is-active' : ''} onClick={() => { setAuthMode('login'); setError(''); }}>Войти</button>
              <button type="button" className={authMode === 'register' ? 'is-active' : ''} onClick={() => { setAuthMode('register'); setError(''); }}>Регистрация</button>
            </div>

            <form className="account-form" onSubmit={submitAuth}>
              <label>
                <span>Логин</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={20} placeholder="Например, PlayerOne" />
              </label>
              <label>
                <span>Пароль</span>
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} maxLength={128} placeholder="Минимум 6 символов" />
              </label>
              {error && <div className="account-error">{error}</div>}
              <button className="account-primary" type="submit" disabled={busy || !username.trim() || password.length < 6}>
                {busy ? 'Подождите…' : authMode === 'register' ? 'Создать аккаунт' : 'Войти'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className={`account-profile-head codumi-profile-banner codumi-background--${shop?.equipped?.backgroundId || 'sky'}`} style={{'--codumi-nickname-color':shop?.equipped?.nicknameColor||'#FFFFFF'}}>
              <button type="button" className="account-avatar-edit" onClick={() => fileRef.current?.click()} disabled={busy}>
                <UserAvatar user={user} size={82} />
                <span className={`account-online-dot ${connected ? 'is-online' : ''}`} />
                <i>✎</i>
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={changeAvatar} />
              <div className="codumi-profile-coins" title="Баланс CODI"><span aria-hidden="true">🪙</span><b>{(shop?.coins ?? 0).toLocaleString('ru-RU')}</b><small>CODI</small></div>
              <div className="codumi-profile-info">
                <span className="account-kicker">Твой профиль</span>
                <h2 className="codumi-profile-name">{user.displayName || user.username}</h2>
                <div className="account-login-label">@{user.username}</div>
                <p className={`account-status ${connected ? 'is-online' : ''}`}><span />{connected ? 'В сети' : 'Подключение…'}</p>
              </div>
            </div>

            {shop?.equipped?.emblemId && shop?.equipped?.emblemId !== 'emoji-none' && <div className="codumi-profile-emblem" aria-hidden="true">{{'emoji-star':'🌟','emoji-rocket':'🚀','emoji-bolt':'⚡','emoji-heart':'💜','emoji-crown':'👑','emoji-diamond':'💎','emoji-fire':'🔥','emoji-dragon':'🐉','emoji-game':'🎮'}[shop?.equipped?.emblemId] || '🌟'}</div>}

            <div className="account-profile-tabs" role="tablist" aria-label="Разделы профиля">
              {[
                ['overview', '◈', 'Обзор'],
                ['awards', '♛', 'Награды'],
                ['shop', '🪙', 'Магазин'],
                ['statistics', '▤', 'Статистика'],
                ['friends', '♧', 'Друзья'],
                ['settings', '⚙', 'Настройки'],
                ['security', '♢', 'Безопасность'],
              ].map(([id, icon, title]) => (
                <button key={id} type="button" role="tab" aria-selected={section === id} className={section === id ? 'is-active' : ''} onClick={() => { setSection(id); setError(''); }}>
                  <span aria-hidden="true">{icon}</span>{title}{id === 'friends' && incoming.length > 0 && <i>{incoming.length}</i>}
                </button>
              ))}
            </div>

            {section === 'overview' && (
              <div className="account-profile-pane" role="tabpanel">
                <LevelBar token={token} userId={user.id} />
                <div className="account-overview-grid">
                  <button type="button" onClick={() => setSection('awards')}><span className="account-overview-icon">🏅</span><strong>Мои награды</strong><small>Медали и будущие кубки</small><b>→</b></button>
                  <button type="button" onClick={() => setSection('shop')}><span className="account-overview-icon">🪙</span><strong>Магазин · {shop?.coins ?? 0} CODI</strong><small>Фоны, рамки и карточки</small><b>→</b></button>
                  <button type="button" onClick={() => setSection('statistics')}><span className="account-overview-icon">📊</span><strong>Статистика</strong><small>Победы, соперники и любимые игры</small><b>→</b></button>
                  <button type="button" onClick={() => setSection('friends')}><span className="account-overview-icon">♧</span><strong>Друзья</strong><small>{friends.length} в списке</small><b>→</b></button>
                  <button type="button" onClick={() => setSection('settings')}><span className="account-overview-icon">⚙</span><strong>Настройки</strong><small>Аватар, имя и почта</small><b>→</b></button>
                  <button type="button" onClick={() => setSection('security')}><span className="account-overview-icon">◇</span><strong>Безопасность</strong><small>Постоянный логин и пароль</small><b>→</b></button>
                </div>
                <div className="account-overview-note">Твой аккаунт готов к онлайн-играм. Выбери раздел выше, чтобы изменить данные или найти друзей.</div>
                <button type="button" className="account-avatar-button" onClick={() => fileRef.current?.click()} disabled={busy}>Сменить аватар</button>
              </div>
            )}

            {section === 'shop' && (
              <div className="account-profile-pane"><CosmeticsShop token={token} shop={shop} user={user} onChanged={onShopChange}/></div>
            )}

            {section === 'statistics' && (
              <div className="account-profile-pane" role="tabpanel"><MatchStatsPanel token={token} /></div>
            )}

            {section === 'awards' && (
              <div className="account-profile-pane" role="tabpanel">
                <AchievementsPanel token={token} />
              </div>
            )}

            {section === 'settings' && (
              <div className="account-profile-pane" role="tabpanel">
                <div className="account-pane-heading"><h3>Настройки профиля</h3><p>Здесь только внешний вид аккаунта и контактные данные.</p></div>
                <div className="account-profile-settings">
                  <form className="account-setting-card" onSubmit={saveDisplayName}>
                <div>
                  <strong>Игровое имя</strong>
                  <small>Именно это имя видно в играх и чатах. Его можно менять.</small>
                </div>
                <div className="account-setting-controls">
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={28} placeholder="Игровое имя" />
                  <button type="submit" disabled={busy || !displayName.trim() || displayName.trim() === (user.displayName || user.username)}>{profileSaved === 'name' ? '✓ Сохранено' : 'Сохранить'}</button>
                </div>
              </form>
                  <form className="account-email-card" onSubmit={saveEmail}>
              <div>
                <strong>Электронная почта</strong>
                <small>Заполняется уже в профиле — при регистрации она не нужна.</small>
              </div>
              <div className="account-email-controls">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setEmailSaved(false); }}
                  maxLength={254}
                  autoComplete="email"
                  placeholder="name@example.com"
                />
                <button type="submit" disabled={busy || email.trim() === (user.email || '')}>{emailSaved ? '✓ Сохранено' : 'Сохранить'}</button>
              </div>
            </form>
                </div>
              </div>
            )}

            {section === 'security' && (
              <div className="account-profile-pane" role="tabpanel">
                <div className="account-pane-heading"><h3>Безопасность</h3><p>Логин неизменяемый. Здесь можно поменять только пароль.</p></div>
                <div className="account-profile-settings">
                  <div className="account-setting-card account-login-locked">
                    <div><strong>Логин</strong><small>Закреплён при регистрации и не меняется. Менять можно только игровое имя и пароль.</small></div>
                    <div className="account-setting-controls"><input value={user.username} readOnly aria-label="Постоянный логин" autoComplete="username" /><span aria-label="Заблокировано">🔒</span></div>
                  </div>
                  <form className="account-setting-card" onSubmit={savePassword}>
                <div>
                  <strong>Пароль</strong>
                  <small>•••••••••• · сервер хранит только защищённый хеш, поэтому старый пароль нельзя прочитать обратно.</small>
                </div>
                <div className="account-setting-controls account-setting-controls--password">
                  <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type={showPasswords ? 'text' : 'password'} autoComplete="current-password" placeholder="Текущий пароль" />
                  <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type={showPasswords ? 'text' : 'password'} autoComplete="new-password" placeholder="Новый пароль" />
                  <button type="button" className="account-eye-button" onClick={() => setShowPasswords((value) => !value)}>{showPasswords ? '🙈' : '👁'}</button>
                  <button type="submit" disabled={busy || !currentPassword || newPassword.length < 6}>{profileSaved === 'password' ? '✓ Сохранено' : 'Сменить'}</button>
                </div>
              </form>
                </div>
                <button type="button" className="account-logout" onClick={logout} disabled={busy}>Выйти из аккаунта</button>
              </div>
            )}

            {section === 'friends' && (
              <div className="account-profile-pane" role="tabpanel">
                <div className="account-pane-heading"><h3>Друзья и приглашения</h3><p>Ищи игроков, общайся и приглашай в совместную игру.</p></div>
                {party && partyFriend && (
              <div className="account-party-card">
                <span className="account-party-icon">🎉</span>
                <div>
                  <small>Текущая вечеринка</small>
                  <strong>Ты + {partyFriend.displayName || partyFriend.username}</strong>
                  <p>В играх можно выбрать режим «С вечеринкой» и попасть только друг к другу.</p>
                </div>
                <button type="button" onClick={leaveParty} disabled={friendsBusy}>Покинуть</button>
              </div>
            )}
                <div className="account-profile-grid">
              <div className="account-friends-column">
                <div className="account-section-title"><strong>Друзья</strong><span>{friends.length}</span></div>

                {incoming.length > 0 && (
                  <div className="account-request-box">
                    <b>Заявки</b>
                    {incoming.map((item) => (
                      <div className="friend-row" key={item.id}>
                        <UserAvatar user={item} size={38} />
                        <div className="friend-row__name"><strong>{item.displayName || item.username}</strong><small>@{item.username} · хочет в друзья</small></div>
                        <button type="button" className="account-mini-button" onClick={() => friendAction('accept', item.id)} disabled={friendsBusy}>✓</button>
                        <button type="button" className="account-mini-button is-muted" onClick={() => friendAction('remove', item.id)} disabled={friendsBusy}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="friend-list">
                  {friends.length === 0 ? (
                    <div className="account-empty">Пока друзей нет. Найди человека по логину справа.</div>
                  ) : friends.map((item) => {
                    const inThisParty = party?.members?.some((member) => member.id === item.id);
                    return (
                      <div className="friend-row friend-row--actions" key={item.id}>
                        <span className="friend-avatar-wrap"><UserAvatar user={item} size={40} /><i className={item.online ? 'is-online' : ''} /></span>
                        <div className="friend-row__name"><strong>{item.displayName || item.username}</strong><small>@{item.username} · {item.online ? (item.playingGameId ? 'В матче' : 'В сети') : 'Не в сети'}</small></div>
                        <div className="friend-row__actions">
                          <button type="button" title="Вызвать на дуэль" onClick={() => onInviteFriend?.(item)}>⚔️ Дуэль</button>
                          <button type="button" title="Личный чат" onClick={() => onOpenDirectChat?.(item)}>💬 Чат</button>
                          <details className="friend-more">
                            <summary title="Ещё действия">⋯ <span>Ещё</span></summary>
                            <div className="friend-more__menu">
                              <button type="button" onClick={() => onWatchFriend?.(item)} disabled={!item.online || !item.playingGameId}>👁 Смотреть матч</button>
                              <button type="button" onClick={() => createParty(item)} disabled={friendsBusy || inThisParty}>🎉 {inThisParty ? 'В группе' : 'Создать вечеринку'}</button>
                              <button type="button" className="is-danger" onClick={() => friendAction('remove', item.id)} disabled={friendsBusy}>Удалить из друзей</button>
                            </div>
                          </details>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="account-search-column">
                <div className="account-section-title"><strong>Найти друга</strong></div>
                <input className="account-friend-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Логин пользователя…" />
                <div className="friend-list account-search-results">
                  {query.trim().length < 2 ? (
                    <div className="account-empty">Введи хотя бы 2 символа.</div>
                  ) : decoratedResults.length === 0 ? (
                    <div className="account-empty">Никого не найдено.</div>
                  ) : decoratedResults.map((item) => (
                    <div className="friend-row" key={item.id}>
                      <span className="friend-avatar-wrap"><UserAvatar user={item} size={40} /><i className={item.online ? 'is-online' : ''} /></span>
                      <div className="friend-row__name"><strong>{item.displayName || item.username}</strong><small>@{item.username} · {item.online ? 'В сети' : 'Не в сети'}</small></div>
                      <RelationButton item={item} onAction={friendAction} busy={friendsBusy} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
              </div>
            )}

            {error && <div className="account-error">{error}</div>}
          </>
        )}
      </section>
    </div>
  );
}
