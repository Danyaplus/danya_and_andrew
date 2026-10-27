import { useEffect, useMemo, useRef, useState } from 'react';
import { matchModeKey } from '../lib/useMultiplayerGame.js';
import { socket } from '../lib/socket.js';
import { useTranslation } from '../lib/i18n.jsx';

export default function GamePage({ game, onBack, party, currentUser }) {
  const { t } = useTranslation();
  const pageRef = useRef(null);
  // 'auto' concentrates on the match; 'normal' lets a player inspect the full page.
  const [focusPreference, setFocusPreference] = useState('auto');
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.visualViewport?.width || window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.visualViewport?.height || window.innerHeight,
  }));
  const [chessAdmin, setChessAdmin] = useState(false);
  const [matchPhase, setMatchPhase] = useState('idle');
  const [watchers, setWatchers] = useState(0);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [matchMode, setMatchMode] = useState(() => localStorage.getItem(matchModeKey) === 'party' ? 'party' : 'public');

  const partyFriend = useMemo(() => {
    if (!party?.members || !currentUser?.id) return null;
    return party.members.find((member) => member.id !== currentUser.id) || null;
  }, [party, currentUser?.id]);

  const compactActive = focusPreference === 'compact' || (['playing', 'finished'].includes(matchPhase) && focusPreference !== 'normal');
  const wideViewport = viewport.width >= viewport.height * 1.14;

  // Measure the actual usable viewport, including window resize and mobile browser bars.
  // CSS only changes layout: the game component/socket are never remounted on rotation.
  useEffect(() => {
    const updateViewport = () => {
      const view = window.visualViewport;
      const width = view?.width || window.innerWidth;
      const height = view?.height || window.innerHeight;
      setViewport((previous) => Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1
        ? previous : { width, height });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport, { passive: true });
    window.addEventListener('orientationchange', updateViewport, { passive: true });
    window.visualViewport?.addEventListener('resize', updateViewport, { passive: true });
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('game-focus-mode', compactActive);
    return () => document.body.classList.remove('game-focus-mode');
  }, [compactActive]);

  useEffect(() => { setFocusPreference('auto'); }, [game?.id]);

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
      setFocusPreference('auto');
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
    setFocusPreference('compact');
    // Fullscreen is opt-in. Browsers may refuse it on iOS; compact CSS still works.
    try {
      if (pageRef.current?.requestFullscreen && !document.fullscreenElement) {
        await pageRef.current.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch { /* CSS viewport mode remains available. */ }
  }

  async function exitFocusMode() {
    setFocusPreference('normal');
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch { /* CSS normal mode still works. */ }
  }

  function leaveGame() {
    if (matchPhase === 'playing' && !window.confirm(t('Покинуть матч? Это будет считаться выходом из игры.'))) return;
    onBack();
  }

  return (
    <main
      ref={pageRef}
      className={`page-shell game-page ${compactActive ? 'is-game-focus is-auto-game-layout' : ''} ${wideViewport ? 'game-page--wide' : 'game-page--tall'} ${matchPhase === 'playing' ? 'game-page--playing' : ''}`}
      data-game-id={game.id}
      data-viewport-orientation={wideViewport ? 'wide' : 'tall'}
      style={{ '--kd-viewport-height': `${Math.round(viewport.height)}px`, '--kd-viewport-width': `${Math.round(viewport.width)}px` }}
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
        <button type="button" className="back-button game-page__back" onClick={leaveGame}>
          <span className="game-page__back-arrow">←</span>
          <span>{matchPhase === 'playing' ? t('Покинуть матч') : t('Все игры')}</span>
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
                <strong>{t(game.title)}</strong>
              </div>
            </IdentityTag>
          </div>

          <button
            type="button"
            className="game-page__fullscreen"
            onClick={compactActive ? exitFocusMode : enterFocusMode}
            aria-label={compactActive ? t('Обычный вид') : t('Игровой режим')}
          >
            <span aria-hidden="true">{compactActive ? '↙' : '⛶'}</span>
            <b>{compactActive ? t('Обычный вид') : t('Игровой режим')}</b>
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
        <GameComponent onBack={leaveGame} adminMode={canOpenChessAdmin && chessAdmin} />
      </div>
    </main>
  );
}
