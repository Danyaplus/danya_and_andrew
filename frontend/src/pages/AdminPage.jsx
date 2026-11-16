import { useEffect, useState } from 'react';
import './admin-page.css';

const TOKEN_KEY = 'kodumi-admin-session';
const API_BASE = (import.meta.env.VITE_SERVER_URL?.trim() || (import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://danya-and-andrew-backend.onrender.com')).replace(/\/$/u, '');

async function adminRequest(path, { token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_BASE}/api/admin/${path}`, {
      method: body ? 'POST' : 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error || 'SERVER_UNAVAILABLE');
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error) {
  if (error?.message === 'ADMIN_NOT_CONFIGURED') return 'Админка не настроена на сервере. Добавь ADMIN_USERNAME и ADMIN_PASSWORD в переменные окружения.';
  if (error?.message === 'INVALID_CREDENTIALS') return 'Неверный логин или пароль.';
  if (error?.status === 429) return 'Слишком много попыток входа. Повтори через 15 минут.';
  return 'Не удалось связаться с сервером. Попробуй ещё раз.';
}

export default function AdminPage() {
  const [status, setStatus] = useState('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Kodumi Games — Admin';
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { setStatus('login'); return; }
    let active = true;
    adminRequest('session', { token })
      .then(() => { if (active) setStatus('ready'); })
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        if (active) setStatus('login');
      });
    return () => { active = false; };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const result = await adminRequest('login', { body: { username: username.trim(), password } });
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setPassword('');
      setStatus('ready');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setStatus('login');
    setPassword('');
    if (token) {
      try { await adminRequest('logout', { token, body: {} }); } catch { /* Session will expire. */ }
    }
  }

  return (
    <main className="admin-portal">
      {status === 'checking' ? (
        <div className="admin-portal__checking" role="status">Проверка доступа…</div>
      ) : status === 'ready' ? (
        <section className="admin-portal__workspace" aria-label="Панель администратора">
          <header className="admin-portal__topbar">
            <div className="admin-portal__brand"><span className="admin-portal__logo">K</span><span>Kodumi Games <small>Управление</small></span></div>
            <button type="button" className="admin-portal__logout" onClick={signOut}>Выйти</button>
          </header>
          <div className="admin-portal__empty">
            <div className="admin-portal__empty-icon">◈</div>
            <h1>Панель администратора</h1>
            <p>Пока здесь пусто. Позже добавим статистику и инструменты управления.</p>
          </div>
        </section>
      ) : (
        <section className="admin-portal__card" aria-labelledby="admin-login-heading">
          <span className="admin-portal__logo admin-portal__logo--large">K</span>
          <p className="admin-portal__eyebrow">KODUMI GAMES</p>
          <h1 id="admin-login-heading">Вход в панель</h1>
          <p className="admin-portal__subtitle">Доступ только для администратора</p>
          <form onSubmit={signIn}>
            <label htmlFor="admin-username">Логин</label>
            <input id="admin-username" autoComplete="username" name="username" value={username} onChange={e => setUsername(e.target.value)} maxLength={128} required autoFocus />
            <label htmlFor="admin-password">Пароль</label>
            <input id="admin-password" type="password" autoComplete="current-password" name="password" value={password} onChange={e => setPassword(e.target.value)} maxLength={256} required />
            {error && <p className="admin-portal__error" role="alert">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Проверяем…' : 'Войти'}</button>
          </form>
        </section>
      )}
    </main>
  );
}
