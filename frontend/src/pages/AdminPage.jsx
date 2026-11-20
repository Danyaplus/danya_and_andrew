// Admin-only CSS stays in the admin route's chunk. Keep the original order:
// shared styles are loaded from main.jsx, then these panel-specific styles.
import './admin-page.css';
import './admin-dashboard.css';
import './admin-platform.css';
import './admin-ops.css';
import './admin-market-premium.css';
import './admin-products-tab.css';
import { useEffect, useState } from 'react';
import adminBrand from '../assets/admin-brand.webp';
import AdminDashboard from './AdminDashboard.jsx';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import adminCrest from '../assets/admin-crest.webp';

const TOKEN_KEY = 'kodumi-admin-session';
const SITE_URL = import.meta.env.BASE_URL || '/';
function errorMessage(error) {
  return adminErrorText(error);
}

function AdminIcon({ name, size = 22 }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'user') return <svg {...shared}><circle cx="12" cy="7.5" r="4" /><path d="M4.5 20v-2a7.5 7.5 0 0 1 15 0v2H4.5Z" /></svg>;
  if (name === 'lock') return <svg {...shared}><rect x="5" y="10.5" width="14" height="10.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 15.5v1.7" /></svg>;
  if (name === 'eye') return <svg {...shared}><path d="M2.5 12s3.5-5.5 9.5-5.5S21.5 12 21.5 12s-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>;
  if (name === 'eye-off') return <svg {...shared}><path d="m3 3 18 18M10.6 6.6A11.3 11.3 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a15 15 0 0 1-3 3.4M6.8 7.5C4 9.1 2.5 12 2.5 12s3.5 5.5 9.5 5.5a10 10 0 0 0 2.9-.4" /><path d="M10 10a2.8 2.8 0 0 0 4 4" /></svg>;
  if (name === 'sign-in') return <svg {...shared}><path d="M10 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-9M3 12h13m-4-4 4 4-4 4" /></svg>;
  if (name === 'arrow-left') return <svg {...shared}><path d="m13.5 5-7 7 7 7M7 12h14" /></svg>;
  return null;
}

export default function AdminPage() {
  const [status, setStatus] = useState('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Kodumi Games — Admin Panel';
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { setStatus('login'); return; }
    let active = true;
    adminRequest('session', { token })
      .then(() => { if (active) setStatus('ready'); })
      .catch((cause) => {
        if (cause?.status === 401) sessionStorage.removeItem(TOKEN_KEY);
        if (active) {
          setError(errorMessage(cause));
          setStatus('login');
        }
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
      setPasswordVisible(false);
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
    setPasswordVisible(false);
    setError('');
    if (token) {
      try { await adminRequest('logout', { token, body: {} }); } catch { /* Session will expire. */ }
    }
  }

  if (status === 'ready') {
    return <AdminDashboard token={sessionStorage.getItem(TOKEN_KEY) || ''} onSignOut={signOut} />;
  }

  return (
    <main className={`admin-portal admin-portal--${status}`}>
      <div className="admin-portal__environment" aria-hidden="true" />
      <section className="admin-portal__login-layout" aria-label="Kodumi Games administrator sign in">
          <a className="admin-portal__wordmark" href={SITE_URL} aria-label="Kodumi Games — back to site">
            <img src={adminBrand} alt="Kodumi Games" />
          </a>
          <div className="admin-portal__card">
            <div className="admin-portal__eyebrow"><span className="admin-portal__eyebrow-light" /> PRIVATE ADMINISTRATOR ACCESS</div>
            <img className="admin-portal__crest" src={adminCrest} alt="" aria-hidden="true" />
            <h1 id="admin-login-heading">Admin <span>Panel</span></h1>
            <p className="admin-portal__subtitle">Secure access for administrators</p>
            {status === 'checking' ? (
              <div className="admin-portal__checking" role="status">Checking access…</div>
            ) : (
              <form className="admin-portal__form" onSubmit={signIn} aria-labelledby="admin-login-heading">
                <div className="admin-portal__field">
                  <label htmlFor="admin-username">Username</label>
                  <div className="admin-portal__input-wrap">
                    <span className="admin-portal__field-icon"><AdminIcon name="user" size={24} /></span>
                    <input
                      id="admin-username" name="username" type="text"
                      placeholder="Enter username" autoComplete="username"
                      value={username} onChange={e => setUsername(e.target.value)}
                      maxLength={128} required autoFocus
                    />
                  </div>
                </div>
                <div className="admin-portal__field">
                  <label htmlFor="admin-password">Password</label>
                  <div className="admin-portal__input-wrap">
                    <span className="admin-portal__field-icon"><AdminIcon name="lock" size={23} /></span>
                    <input
                      id="admin-password" name="password"
                      type={passwordVisible ? 'text' : 'password'}
                      placeholder="Enter password" autoComplete="current-password"
                      value={password} onChange={e => setPassword(e.target.value)}
                      maxLength={256} required
                    />
                    <button
                      className="admin-portal__visibility" type="button"
                      onClick={() => setPasswordVisible(visible => !visible)}
                      aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                      aria-pressed={passwordVisible}
                    >
                      <AdminIcon name={passwordVisible ? 'eye-off' : 'eye'} size={25} />
                    </button>
                  </div>
                </div>
                {error && <p className="admin-portal__error" role="alert">{error}</p>}
                <button className="admin-portal__submit" type="submit" disabled={busy}>
                  <AdminIcon name="sign-in" size={27} />
                  <span>{busy ? 'Signing In…' : 'Sign In'}</span>
                </button>
              </form>
            )}
            <div className="admin-portal__back">
              <a href={SITE_URL}><AdminIcon name="arrow-left" size={20} />Back to site</a>
            </div>
            <div className="admin-portal__footer-note">Protected access · Kodumi Games</div>
          </div>
        </section>
    </main>
  );
}
