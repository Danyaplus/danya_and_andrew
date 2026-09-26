import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import HomePage from './pages/HomePage.jsx';
import GamePage from './pages/GamePage.jsx';
import { getGameById } from './games/index.js';
import { socket } from './lib/socket.js';

function readRoute() {
  const match = window.location.pathname.match(/^\/game\/([^/]+)$/);
  return match ? { type: 'game', gameId: match[1] } : { type: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [search, setSearch] = useState('');
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const handlePopState = () => setRoute(readRoute());
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    window.addEventListener('popstate', handlePopState);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const activeGame = useMemo(() => {
    return route.type === 'game' ? getGameById(route.gameId) : null;
  }, [route]);

  function navigate(path) {
    window.history.pushState({}, '', path);
    setRoute(readRoute());
  }

  function openGame(gameId) {
    setSearch('');
    navigate(`/game/${gameId}`);
  }

  function goHome() {
    setSearch('');
    navigate('/');
  }

  return (
    <div className="app-shell">
      <Header
        search={search}
        setSearch={setSearch}
        onHome={goHome}
        onOpenGame={openGame}
        connected={connected}
      />

      {route.type === 'home' ? (
        <HomePage search={search} onOpenGame={openGame} />
      ) : (
        <GamePage game={activeGame} onBack={goHome} />
      )}
    </div>
  );
}
