import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import GlobalChat from './components/GlobalChat.jsx';
import HomePage from './pages/HomePage.jsx';
import GamePage from './pages/GamePage.jsx';
import { getGameById } from './games/index.js';
import { socket } from './lib/socket.js';

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

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    const handleConnect = () => setConnected(true);
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
    if (command === 'open') {
      setChatOpen(true);
      setChatUnread(0);
      return;
    }
    setChatOpen(false);
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
          setChatOpen(true);
          setChatUnread(0);
        }}
        chatUnread={chatUnread}
      />

      {route.type === 'home' ? (
        <HomePage search={search} onOpenGame={openGame} />
      ) : (
        <GamePage game={activeGame} onBack={goHome} />
      )}

      <GlobalChat
        open={chatOpen}
        onClose={closeChat}
        onUnreadChange={setChatUnread}
      />
    </div>
  );
}
