import { useEffect, useMemo, useRef, useState } from 'react';
import { matchModeKey } from '../lib/useMultiplayerGame.js';
import { socket } from '../lib/socket.js';

export default function GamePage({ game, onBack, party, currentUser }) {
  const pageRef = useRef(null);
  const [focusMode, setFocusMode] = useState(false);
  const [chessAdmin, setChessAdmin] = useState(false);
  const [matchPhase, setMatchPhase] = useState('idle');
  const [watchers, setWatchers] = useState(0);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [matchMode, setMatchMode] = useState(() => localStorage.getItem(matchModeKey) === 'party' ? 'party' : 'public');

  const partyFriend = useMemo(() => {
    if (!party?.members || !currentUser?.id) return null;
    return party.members.find((member) => member.id !== currentUser.id) || null;
  }, [party, currentUser?.id]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && focusMode) {
        setFocusMode(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [focusMode]);

  useEffect(() => {
    document.body.classList.toggle('game-focus-mode', focusMode);
    return () => document.body.classList.remove('game-focus-mode');
  }, [focusMode]);

  useEffect(() => {
    setChessAdmin(false);
  }, [game?.id, currentUser?.id, currentUser?.username]);


  useEffect(() => {
    if (!party?.id) {
      setMatchMode('public');
      localStorage.setItem(matchModeKey, 'public');
      return;
    }
    const saved = localStorage.getItem(matchModeKey) === 'public' ? 'public' : 'party';
    setMatchMode(saved);
  }, [party?.id]);

  useEffect(() => {
    setMatchPhase('idle');
    setWatchers(0);
    setCurrentRoomId(null);
    const onWaiting = (event) => { if (event?.gameId === game?.id) setMatchPhase('searching'); };
    const onStarted = (event) => {
      if (event?.gameId !== game?.id) return;
      setMatchPhase('playing');
      setCurrentRoomId(event.roomId);
      setWatchers(0);
    };
    const onState = (event) => {
      if (event?.gameId !== game?.id) return;
      setMatchPhase(event.status === 'finished' ? 'finished' : 'playing');
      if (event.roomId) setCurrentRoomId(event.roomId);
    };
    const onQueueLeft = (event) => { if (event?.gameId === game?.id) setMatchPhase('idle'); };
    const onViewerCount = (event) => {
      if (event?.roomId) setWatchers(event.count ?? 0);
    };
    const onClientPhase = (event) => {
      if (event.detail?.gameId === game?.id) setMatchPhase(event.detail.phase);
    };
    window.addEventListener('codumi:match-phase', onClientPhase);
    socket.on('queue:waiting', onWaiting);
    socket.on('queue:left', onQueueLeft);
    socket.on('match:started', onStarted);
    socket.on('game:state', onState);
    socket.on('match:watchers', onViewerCount);
    return () => {
      window.removeEventListener('codumi:match-phase', onClientPhase);
      socket.off('queue:waiting', onWaiting);
      socket.off('queue:left', onQueueLeft);
      socket.off('match:started', onStarted);
      socket.off('game:state', onState);
      socket.off('match:watchers', onViewerCount);
    };
  }, [game?.id]);

  function chooseMatchMode(nextMode) {
    const safeMode = nextMode === 'party' && party?.id ? 'party' : 'public';
    setMatchMode(safeMode);
    localStorage.setItem(matchModeKey, safeMode);
  }

  if (!game) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <h2>Игра не найдена</h2>
          <button className="primary-button" onClick={onBack}>На главную</button>
        </div>
      </main>
    );
  }

  const GameComponent = game.component;
  const imageUrl = `${import.meta.env.BASE_URL}images/games/${game.id}.webp`;
  const isChess = game.id === 'chess';
  const canOpenChessAdmin = (isChess || game.id === 'reversi') && currentUser?.username?.trim().toLocaleLowerCase('ru-RU') === 'danyatest1';
  // Only the signed-in administrator gets an interactive game title.
  const IdentityTag = canOpenChessAdmin ? 'button' : 'div';

  async function enterFocusMode() {
    setFocusMode(true);
    const node = pageRef.current;

    try {
      if (node?.requestFullscreen && !document.fullscreenElement) {
        await node.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // iPhone/Safari may reject element fullscreen. CSS focus mode still works.
    }

    try {
      if (screen.orientation?.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // The layout still adapts when the user rotates the phone manually.
    }
  }

  async function exitFocusMode() {
    setFocusMode(false);

    try {
      if (screen.orientation?.unlock) screen.orientation.unlock();
    } catch {
      // no-op
    }

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // no-op
    }
  }

  return (
    <main
      ref={pageRef}
      className={`page-shell game-page ${focusMode ? 'is-game-focus' : ''}`}
      data-game-id={game.id}
    >
      <div className="game-page__backdrop" aria-hidden="true">
        <img
          src={imageUrl}
          alt=""
          draggable="false"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <div className="game-page__backdrop-shade" />
      </div>

      <div className="game-page__chrome">
        <button type="button" className="back-button game-page__back" onClick={onBack}>
          <span className="game-page__back-arrow">←</span>
          <span>Все игры</span>
        </button>

        <div className="game-page__chrome-right">
          {matchPhase === 'playing' && <span className="game-spectators-count" aria-label={`Зрителей: ${watchers}`}>👁 {watchers}</span>}
          <div className="game-page__identity-wrap">
            <IdentityTag
              type={canOpenChessAdmin ? 'button' : undefined}
              className={`game-page__identity ${canOpenChessAdmin ? 'game-page__identity--secret' : ''} ${canOpenChessAdmin && chessAdmin ? 'is-admin' : ''}`}
              onClick={canOpenChessAdmin ? () => setChessAdmin((opened) => !opened) : undefined}
              aria-pressed={canOpenChessAdmin ? chessAdmin : undefined}
              title={canOpenChessAdmin ? (chessAdmin ? 'Закрыть админ-панель игры' : 'Открыть админ-панель игры') : undefined}
            >
              <div className="game-page__identity-image">
                <span className="game-page__identity-fallback">{game.icon}</span>
                <img
                  src={imageUrl}
                  alt=""
                  draggable="false"
                  onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </div>

              <div className="game-page__identity-copy">
                <span>{canOpenChessAdmin && chessAdmin ? 'SECRET MODE' : 'Сейчас играем'}</span>
                <strong>{game.title}</strong>
              </div>
            </IdentityTag>
          </div>

          <button
            type="button"
            className="game-page__fullscreen"
            onClick={focusMode ? exitFocusMode : enterFocusMode}
            aria-label={focusMode ? 'Выйти из полноэкранного режима' : 'Открыть игру на весь экран'}
          >
            <span aria-hidden="true">{focusMode ? '↙' : '⛶'}</span>
            <b>{focusMode ? 'Свернуть' : 'На весь экран'}</b>
          </button>
        </div>
      </div>

      <div className="game-page__content">
        {party?.id && partyFriend && matchPhase === 'idle' && (
          <div className="game-match-mode" role="group" aria-label="Режим поиска соперника">
            <div className="game-match-mode__copy">
              <span>С кем играть</span>
              <strong>{matchMode === 'party' ? `Только с ${partyFriend.username}` : 'Со случайным игроком'}</strong>
            </div>
            <div className="game-match-mode__buttons">
              <button type="button" className={matchMode === 'public' ? 'is-active' : ''} onClick={() => chooseMatchMode('public')}>🌐 Случайный игрок</button>
              <button type="button" className={matchMode === 'party' ? 'is-active' : ''} onClick={() => chooseMatchMode('party')}>🎉 С вечеринкой</button>
            </div>
          </div>
        )}
        <GameComponent onBack={onBack} adminMode={canOpenChessAdmin && chessAdmin} />
      </div>
    </main>
  );
}
