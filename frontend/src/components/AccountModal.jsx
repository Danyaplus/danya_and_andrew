import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import UserAvatar from './UserAvatar.jsx';
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
  token,
  user,
  connected,
  party,
  onClose,
  onAuthenticated,
  onUserUpdated,
  onOpenDirectChat,
  onPartyChanged,
  onLogout,
}) {
  const [authMode, setAuthMode] = useState(mode === 'register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [emailSaved, setEmailSaved] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '');
  const [profileUsername, setProfileUsername] = useState(user?.username || '');
  const [loginPassword, setLoginPassword] = useState('');
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
    if (!mode) return;
    setError('');
    setEmailSaved(false);
    if (mode === 'login' || mode === 'register') setAuthMode(mode);
  }, [mode]);

  useEffect(() => {
    setEmail(user?.email || '');
    setDisplayName(user?.displayName || user?.username || '');
    setProfileUsername(user?.username || '');
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

    socket.on('presence:update', updateOnline);
    socket.on('friends:changed', refresh);
    return () => {
      socket.off('presence:update', updateOnline);
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

  async function saveLogin(event) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    setProfileSaved('');
    try {
      const payload = await apiRequest('/api/profile/login', {
        token,
        method: 'PATCH',
        body: { username: profileUsername.trim(), currentPassword: loginPassword },
      });
      onUserUpdated?.(payload.user);
      setProfileUsername(payload.user?.username || '');
      setLoginPassword('');
      setProfileSaved('login');
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
      <section className={`account-modal ${isProfile ? 'account-modal--profile' : ''}`} role="dialog" aria-modal="true">
        <button className="account-close" type="button" onClick={onClose} aria-label="Закрыть">×</button>

        {!isProfile ? (
          <>
            <div className="account-logo">T→T</div>
            <span className="account-kicker">Danya & Andrew</span>
            <h2>{authMode === 'register' ? 'Создать аккаунт' : 'Войти в профиль'}</h2>
            <p className="account-subtitle">Твой профиль, аватар, друзья и онлайн-статус будут доступны на любом устройстве.</p>

            <div className="account-auth-tabs">
              <button type="button" className={authMode === 'login' ? 'is-active' : ''} onClick={() => { setAuthMode('login'); setError(''); }}>Войти</button>
              <button type="button" className={authMode === 'register' ? 'is-active' : ''} onClick={() => { setAuthMode('register'); setError(''); }}>Регистрация</button>
            </div>

            <form className="account-form" onSubmit={submitAuth}>
              <label>
                <span>Логин</span>
                <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={20} placeholder="Например, Danya" />
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
            <div className="account-profile-head">
              <button type="button" className="account-avatar-edit" onClick={() => fileRef.current?.click()} disabled={busy}>
                <UserAvatar user={user} size={82} />
                <span className={`account-online-dot ${connected ? 'is-online' : ''}`} />
                <i>✎</i>
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={changeAvatar} />
              <div>
                <span className="account-kicker">Твой профиль</span>
                <h2>{user.displayName || user.username}</h2>
                <div className="account-login-label">@{user.username}</div>
                <p className={`account-status ${connected ? 'is-online' : ''}`}><span />{connected ? 'В сети' : 'Подключение…'}</p>
              </div>
            </div>

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

              <form className="account-setting-card" onSubmit={saveLogin}>
                <div>
                  <strong>Логин</strong>
                  <small>Уникальный логин для входа и добавления в друзья.</small>
                </div>
                <div className="account-setting-controls account-setting-controls--login">
                  <input value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} maxLength={20} autoComplete="username" placeholder="Логин" />
                  <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type={showPasswords ? 'text' : 'password'} autoComplete="current-password" placeholder="Текущий пароль" />
                  <button type="submit" disabled={busy || !loginPassword || profileUsername.trim() === user.username}>{profileSaved === 'login' ? '✓' : 'Изменить'}</button>
                </div>
              </form>

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
                        <div className="friend-row__name"><strong>{item.displayName || item.username}</strong><small>@{item.username} · {item.online ? 'В сети' : 'Не в сети'}</small></div>
                        <div className="friend-row__actions">
                          <button type="button" title="Личный чат" onClick={() => onOpenDirectChat?.(item)}>💬<span>Чат</span></button>
                          <button type="button" className={inThisParty ? 'is-active' : ''} title="Создать вечеринку" onClick={() => createParty(item)} disabled={friendsBusy || inThisParty}>🎉<span>{inThisParty ? 'В группе' : 'Вечеринка'}</span></button>
                          <button type="button" className="is-danger" title="Удалить из друзей" onClick={() => friendAction('remove', item.id)} disabled={friendsBusy}>×<span>Удалить</span></button>
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

            {error && <div className="account-error">{error}</div>}
            <div className="account-profile-actions">
              <button type="button" className="account-avatar-button" onClick={() => fileRef.current?.click()} disabled={busy}>Сменить аватар</button>
              <button type="button" className="account-logout" onClick={logout} disabled={busy}>Выйти</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
