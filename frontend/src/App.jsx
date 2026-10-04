import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import GlobalChat from './components/GlobalChat.jsx';
import AccountModal from './components/AccountModal.jsx';
import HomePage from './pages/HomePage.jsx';
import GamePage from './pages/GamePage.jsx';
import { getGameById } from './games/index.js';
import { apiRequest, authTokenKey, setSocketAuthToken, socket } from './lib/socket.js';

function readRoute() {
  const hash = window.location.hash || '#/';
  const match = hash.match(/^#\/game\/([^/]+)$/);
  return match ? { type: 'game', gameId: match[1] } : { type: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState('');
  const [connected, setConnected] = useState(socket.connected);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [accountMode, setAccountMode] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(authTokenKey) || '');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(localStorage.getItem(authTokenKey)));

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    const handleConnect = () => {
      setConnected(true);
      const savedToken = localStorage.getItem(authTokenKey);
      if (savedToken) setSocketAuthToken(savedToken);
    };
    const handleDisconnect = () => setConnected(false);

    window.addEventListener('hashchange', handleHashChange);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const savedToken = localStorage.getItem(authTokenKey);
    if (!savedToken) {
      setAuthLoading(false);
      return undefined;
    }

    (async () => {
      try {
        const payload = await apiRequest('/api/auth/me', { token: savedToken });
        if (cancelled) return;
        setToken(savedToken);
        setUser(payload.user);
        localStorage.setItem('danya-andrew-player-name', payload.user.username);
        setSocketAuthToken(savedToken);
      } catch {
        if (cancelled) return;
        localStorage.removeItem(authTokenKey);
        setToken('');
        setUser(null);
        setSocketAuthToken(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onProfileUpdated(payload) {
      if (!payload?.user) return;
      setUser((current) => current?.id === payload.user.id ? payload.user : current);
    }

    function onAuthUser(payload) {
      if (!payload?.user) return;
      setUser((current) => current?.id === payload.user.id ? payload.user : current);
    }

    socket.on('profile:updated', onProfileUpdated);
    socket.on('auth:user', onAuthUser);
    return () => {
      socket.off('profile:updated', onProfileUpdated);
      socket.off('auth:user', onAuthUser);
    };
  }, []);

  const activeGame = useMemo(() => {
    return route.type === 'game' ? getGameById(route.gameId) : null;
  }, [route]);

  function navigate(path) {
    window.location.hash = path;
  }

  function openGame(gameId) {
    setSearch('');
    navigate(`/game/${gameId}`);
  }

  function goHome() {
    setSearch('');
    navigate('/');
  }

  function closeChat(command) {
    if (command === 'open' && user) {
      setChatOpen(true);
      setChatUnread(0);
      return;
    }
    setChatOpen(false);
  }

  function authenticated(payload) {
    if (!payload?.token || !payload?.user) return;
    localStorage.setItem(authTokenKey, payload.token);
    localStorage.setItem('danya-andrew-player-name', payload.user.username);
    setToken(payload.token);
    setUser(payload.user);
    setAuthLoading(false);
    setSocketAuthToken(payload.token);
  }

  function userUpdated(nextUser) {
    if (!nextUser) return;
    setUser(nextUser);
    localStorage.setItem('danya-andrew-player-name', nextUser.username);
  }

  function logout() {
    localStorage.removeItem(authTokenKey);
    localStorage.removeItem('danya-andrew-player-name');
    setToken('');
    setUser(null);
    setChatOpen(false);
    setChatUnread(0);
    setSocketAuthToken(null);
  }

  return (
    <div className="app-shell">
      <Header
        search={search}
        setSearch={setSearch}
        onHome={goHome}
        onOpenGame={openGame}
        connected={connected}
        onOpenChat={() => {
          if (!user) return;
          setChatOpen(true);
          setChatUnread(0);
        }}
        chatUnread={chatUnread}
        user={user}
        authLoading={authLoading}
        onLogin={() => setAccountMode('login')}
        onRegister={() => setAccountMode('register')}
        onProfile={() => setAccountMode('profile')}
      />

      {route.type === 'home' ? (
        <HomePage search={search} onOpenGame={openGame} />
      ) : (
        <GamePage game={activeGame} onBack={goHome} />
      )}

      <GlobalChat
        open={chatOpen && Boolean(user)}
        onClose={closeChat}
        onUnreadChange={setChatUnread}
        currentUser={user}
      />

      <AccountModal
        mode={accountMode}
        token={token}
        user={user}
        connected={connected}
        onClose={() => setAccountMode(null)}
        onAuthenticated={authenticated}
        onUserUpdated={userUpdated}
        onLogout={logout}
      />
    </div>
  );
}
