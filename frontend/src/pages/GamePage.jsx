import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { matchModeKey, stakeModeKey } from '../lib/useMultiplayerGame.js';
import { socket } from '../lib/socket.js';
import { clearMatchSession, readMatchSession, requestMatchResume, restartMatchConnection } from '../lib/matchRecovery.js';
import '../styles/match-reconnect.css';
import { useTranslation } from '../lib/i18n.jsx';
import MatchSocial from '../components/MatchSocial.jsx';

export default function GamePage({ game, onBack, party, currentUser, shop }) {
  const { t, language } = useTranslation();
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
  const [reconnecting, setReconnecting] = useState(() => Boolean(readMatchSession(game?.id)));
  const [opponentAwayAt, setOpponentAwayAt] = useState(null);
  const [technicalResult, setTechnicalResult] = useState(null);
  const [rewardNotice, setRewardNotice] = useState(null);
  const rewardRoomRef = useRef(null);
  const authenticatedPlayerRef = useRef(Boolean(currentUser?.id));
  authenticatedPlayerRef.current = Boolean(currentUser?.id);
  const currentUserRef = useRef(Boolean(currentUser?.id));
  currentUserRef.current = Boolean(currentUser?.id);
  const rewardAccountAtStartRef = useRef(Boolean(currentUser?.id));
  const [recoverTick, setRecoverTick] = useState(() => Date.now());
  const [resumeBusy, setResumeBusy] = useState(false);
  const [recoveryExpired, setRecoveryExpired] = useState(false);
  const [matchMode, setMatchMode] = useState(() => localStorage.getItem(matchModeKey) === 'party' ? 'party' : 'public');
  const [selectedStake, setSelectedStake] = useState(() => currentUser?.id && localStorage.getItem(stakeModeKey) === '25' ? 25 : 0);
  const [activeStake, setActiveStake] = useState(0);

  useEffect(() => {
    if (!currentUser?.id) {
      setSelectedStake(0);
      localStorage.setItem(stakeModeKey, '0');
    }
  }, [currentUser?.id]);

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
    setActiveStake(0);
    setWatchers(0);
    setCurrentRoomId(null);
    setReconnecting(Boolean(readMatchSession(game?.id)));
    setOpponentAwayAt(null);
    setTechnicalResult(null);
    setRewardNotice(null);
    rewardRoomRef.current = null;
    rewardAccountAtStartRef.current = currentUserRef.current;
    setResumeBusy(false);
    setRecoveryExpired(false);
    const onWaiting = (event) => { if (event?.gameId === game?.id) setMatchPhase('searching'); };
    const onStarted = (event) => {
      if (event?.gameId !== game?.id) return;
      setMatchPhase('playing');
      setActiveStake(event.stake === 25 ? 25 : 0);
      setSelectedStake(event.stake === 25 ? 25 : 0);
      setFocusPreference('auto');
      rewardRoomRef.current = event.roomId;
      rewardAccountAtStartRef.current = currentUserRef.current;
      setCurrentRoomId(event.roomId);
      setRewardNotice(null);
      setWatchers(0);
      setReconnecting(false);
      setTechnicalResult(null);
      setResumeBusy(false);
      setRecoveryExpired(false);
    };
    const onState = (event) => {
      if (event?.gameId !== game?.id) return;
      setMatchPhase(event.status === 'finished' ? 'finished' : 'playing');
      if (event.roomId) { rewardRoomRef.current = event.roomId; setCurrentRoomId(event.roomId); }
      if (event.status === 'finished' && event.roomId) {
        setRewardNotice((previous) => previous?.roomId === event.roomId
          ? previous : !rewardAccountAtStartRef.current
            ? { gameId: event.gameId, roomId: event.roomId, status: 'no_reward', reason: 'AUTH_REQUIRED' }
            : { gameId: event.gameId, roomId: event.roomId, status: 'pending' });
      }
      if (socket.connected) setReconnecting(false);
    };
    const onResumed = (event) => {
      if (event?.gameId !== game?.id) return;
      setMatchPhase('playing');
      setActiveStake(event.stake === 25 ? 25 : 0);
      rewardRoomRef.current = event.roomId;
      setCurrentRoomId(event.roomId);
      setFocusPreference('auto');
      setReconnecting(false);
      setResumeBusy(false);
      setRecoveryExpired(false);
    };
    const onDisconnect = () => {
      if (readMatchSession(game?.id)) setReconnecting(true);
    };
    const onConnectionLost = (event) => {
      if (event?.roomId !== readMatchSession(game?.id)?.roomId) return;
      setReconnecting(true);
      if (socket.connected) requestMatchResume(socket, game.id);
    };
    const onUnresponsive = () => {
      if (readMatchSession(game?.id)) setReconnecting(true);
    };
    const onResumeBusy = (event) => {
      if (event?.gameId && event.gameId !== game?.id) return;
      setResumeBusy(true);
    };
    const onResumeUnavailable = (event) => {
      if (event?.gameId && event.gameId !== game?.id) return;
      setReconnecting(false);
      setResumeBusy(false);
      setRecoveryExpired(true);
    };
    const onOpponentAway = (event) => {
      const session = readMatchSession(game?.id);
      if (event?.roomId !== (session?.roomId || currentRoomId)) return;
      setOpponentAwayAt(Number(event.deadlineAt) || Date.now() + 20_000);
    };
    const onOpponentBack = (event) => {
      const session = readMatchSession(game?.id);
      if (event?.roomId && event.roomId !== (session?.roomId || currentRoomId)) return;
      setOpponentAwayAt(null);
    };
    const onTechnicalResult = (event) => {
      if (event?.gameId && event.gameId !== game?.id) return;
      setOpponentAwayAt(null);
      setTechnicalResult(event);
      setMatchPhase('finished');
      clearMatchSession(event?.roomId);
    };
    const onRewardResult = (event) => {
      if (!event || event.gameId !== game?.id || !event.roomId) return;
      if (rewardRoomRef.current && rewardRoomRef.current !== event.roomId) return;
      setRewardNotice(event);
    };
    const onQueueLeft = (event) => { if (event?.gameId === game?.id) setMatchPhase('idle'); };
    const onMatchError = (event) => { if (!event?.gameId || event.gameId === game?.id) setMatchPhase('idle'); };
    const onViewerCount = (event) => {
      if (event?.roomId) setWatchers(event.count ?? 0);
    };
    const onClientPhase = (event) => {
      if (event.detail?.gameId === game?.id) setMatchPhase(event.detail.phase);
    };
    window.addEventListener('codumi:match-phase', onClientPhase);
    socket.on('queue:waiting', onWaiting);
    socket.on('queue:left', onQueueLeft);
    socket.on('game:error', onMatchError);
    socket.on('match:started', onStarted);
    socket.on('match:resumed', onResumed);
    socket.on('match:resume:busy', onResumeBusy);
    socket.on('match:resume:unavailable', onResumeUnavailable);
    socket.on('match:opponent:away', onOpponentAway);
    socket.on('match:opponent:back', onOpponentBack);
    socket.on('match:technical-result', onTechnicalResult);
    socket.on('match:reward:result', onRewardResult);
    socket.on('disconnect', onDisconnect);
    socket.on('match:connection:lost', onConnectionLost);
    window.addEventListener('codumi:match-link-unresponsive', onUnresponsive);
    socket.on('game:state', onState);
    socket.on('match:watchers', onViewerCount);
    return () => {
      window.removeEventListener('codumi:match-phase', onClientPhase);
      socket.off('queue:waiting', onWaiting);
      socket.off('queue:left', onQueueLeft);
      socket.off('game:error', onMatchError);
      socket.off('match:started', onStarted);
      socket.off('match:resumed', onResumed);
      socket.off('match:resume:busy', onResumeBusy);
      socket.off('match:resume:unavailable', onResumeUnavailable);
      socket.off('match:opponent:away', onOpponentAway);
      socket.off('match:opponent:back', onOpponentBack);
      socket.off('match:technical-result', onTechnicalResult);
      socket.off('match:reward:result', onRewardResult);
      socket.off('disconnect', onDisconnect);
      socket.off('match:connection:lost', onConnectionLost);
      window.removeEventListener('codumi:match-link-unresponsive', onUnresponsive);
      socket.off('game:state', onState);
      socket.off('match:watchers', onViewerCount);
    };
  }, [game?.id]);

  useEffect(() => {
    if (rewardNotice?.status !== 'pending') return undefined;
    const timer = window.setTimeout(() => {
      setRewardNotice((current) => current?.roomId === rewardNotice.roomId && current.status === 'pending'
        ? { ...current, status: 'unconfirmed' } : current);
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [rewardNotice?.roomId, rewardNotice?.status]);

  const rewardMessage = (() => {
    if (!rewardNotice) return null;
    if (rewardNotice.status === 'pending') return { title: 'Проверяем результат матча…',
      detail: 'Проверяем честность матча и начисление в базе данных.' };
    if (rewardNotice.status === 'unconfirmed') return { title: 'Нет подтверждения награды',
      detail: 'Сервер не ответил. Проверь баланс и подключение; это не означает, что награда потеряна.' };
    if (rewardNotice.status === 'awarded' || rewardNotice.status === 'partial') {
      const stake = Number(rewardNotice.stake) || 0;
      const xp = Math.max(0, Number(rewardNotice.xpEarned) || 0);
      const coins = Math.max(0, Number(rewardNotice.coinsEarned) || 0);
      if (stake > 0 && coins === stake) return { title: `🤝 ${t('Ничья — ставка возвращена')}`,
        detail: `+${xp} XP · ${t('возвращено')} ${stake} CODI. ${t('Баланс без изменений.')}` };
      if (stake > 0) return { title: `🏆 ${t('Победа — банк твой!')}`,
        detail: `+${xp} XP · ${t('получено')} ${coins} CODI (${t('твои')} ${stake} + ${t('выигрыш')} ${coins - stake}).` };
      return { title: `🏆 ${t('Награда за бесплатный матч!')}`, detail: `+${xp} XP` };
    }
    if (rewardNotice.status === 'refunded') return { title: `🪙 ${t('Ставка возвращена')}`,
      detail: `${rewardNotice.stake || 25} CODI ${t('возвращены: матч не удалось завершить корректно.')}` };
    if (rewardNotice.reason === 'LOSS' && rewardNotice.stake > 0) return { title: t('Поражение — ставка проиграна'),
      detail: `-${rewardNotice.stake} CODI · ${t('без опыта.')}` };
    const reasonText = {
      LOSS: 'За поражение XP и монеты не начисляются.',
      AUTH_REQUIRED: 'Для получения награды нужно авторизоваться.',
      ALREADY_SETTLED: 'Награда за этот матч уже была обработана.',
      UNVERIFIED_RESULT: 'Сервер не смог подтвердить итог матча.',
      TECHNICAL_RESULT: 'Игровой сервер не подтвердил результат прерванного матча.',
      SETTLEMENT_FAILED: 'Ошибка начисления на сервере. Проверь баланс и сообщи администратору.',
      INVALID_RECEIPT: 'Награда требует проверки: сервер не подтвердил корректную квитанцию.',
      ESCROW_NOT_HELD: 'Сервер не нашёл зарезервированную ставку. Обратись к администратору.',
    };
    return { title: rewardNotice.reason === 'AUTH_REQUIRED' ? 'Награды доступны после входа'
      : rewardNotice.status === 'error' ? 'Ошибка начисления' : 'Награда не начислена',
      detail: reasonText[rewardNotice.reason] || 'Матч завершён без начисления награды.' };
  })();

  // A connected WebSocket may be half-open after switching Wi-Fi to mobile
  // data. Probe the actual game server, not navigator.onLine. Restart transport
  // if acknowledgements stop, then resume the same server-side seat.
  useEffect(() => {
    let awaiting = false;
    let sentAt = 0;
    let probeGeneration = 0;
    let lastRestartAt = 0;
    let cancelled = false;
    const gameId = game?.id;

    const markUnresponsive = () => {
      if (!readMatchSession(gameId)) return;
      window.dispatchEvent(new Event('codumi:match-link-unresponsive'));
    };
    const restart = () => {
      if (!readMatchSession(gameId) || Date.now() - lastRestartAt < 4500) return;
      lastRestartAt = Date.now();
      awaiting = false;
      probeGeneration += 1;
      markUnresponsive();
      restartMatchConnection(socket);
    };
    const check = () => {
      const session = readMatchSession(gameId);
      if (!session) { awaiting = false; return; }
      if (!socket.connected) {
        markUnresponsive();
        if (navigator.onLine !== false) socket.connect();
        return;
      }
      if (awaiting) {
        if (Date.now() - sentAt > 4300) restart();
        return;
      }
      awaiting = true;
      sentAt = Date.now();
      const generation = ++probeGeneration;
      const boundSocketId = socket.id;
      socket.timeout(3000).emit('match:heartbeat', { roomId: session.roomId }, (err, reply) => {
        if (cancelled || generation !== probeGeneration || boundSocketId !== socket.id
          || session.roomId !== readMatchSession(gameId)?.roomId) return;
        // A late response from the OLD socket must not clear the status of the
        // NEW one. Only a server-verified heartbeat counts as healthy.
        awaiting = false;
        if (err) restart();
        else if (reply?.ok && socket.connected) {
          setReconnecting(false);
        } else if (socket.connected) {
          markUnresponsive();
          requestMatchResume(socket, gameId);
        }
      });
    };
    const onOffline = () => {
      if (!readMatchSession(gameId)) return;
      markUnresponsive();
      if (socket.connected) socket.disconnect();
    };
    const onOnline = () => {
      if (!readMatchSession(gameId)) return;
      markUnresponsive();
      if (!socket.connected) socket.connect();
      else restart();
    };
    const onPageShow = () => {
      if (!readMatchSession(gameId)) return;
      if (!socket.connected) socket.connect();
      else requestMatchResume(socket, gameId);
    };
    const interval = window.setInterval(check, 1600);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    check();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [game?.id]);

  useEffect(() => {
    if (!opponentAwayAt) return undefined;
    const timer = window.setInterval(() => setRecoverTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [opponentAwayAt]);

  function chooseStake(stake) {
    const value = stake === 25 && currentUser?.id ? 25 : 0;
    setSelectedStake(value);
    localStorage.setItem(stakeModeKey, String(value));
  }

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
    if (readMatchSession(game.id) || currentRoomId) {
      if (socket.connected) socket.emit('match:leave');
      clearMatchSession();
    }
    if (socket.connected) socket.emit('match:postgame:leave');
    onBack();
  }

  function retryConnection() {
    setResumeBusy(false);
    setReconnecting(true);
    // Force a fresh transport even when a half-open WebSocket still reports
    // socket.connected === true. The connect handler will send resume token.
    restartMatchConnection(socket);
  }

  const secondsLeft = opponentAwayAt ? Math.max(0, Math.ceil((opponentAwayAt - recoverTick) / 1000)) : 0;

  return (
    <main
      ref={pageRef}
      className={`page-shell game-page ${compactActive ? 'is-game-focus is-auto-game-layout' : ''} ${wideViewport ? 'game-page--wide' : 'game-page--tall'} ${matchPhase === 'playing' ? 'game-page--playing' : ''}`}
      data-game-id={game.id}
      data-viewport-orientation={wideViewport ? 'wide' : 'tall'}
      style={{ '--kd-viewport-height': `${Math.round(viewport.height)}px`, '--kd-viewport-width': `${Math.round(viewport.width)}px` }}
    >
      {rewardMessage && (
        <aside className={`kodumi-match-reward kodumi-match-reward--${rewardNotice.status}`}
          role="status" aria-live="polite" aria-atomic="true">
          <div className="kodumi-match-reward__copy">
            <strong>{rewardMessage.title}</strong>
            <span>{rewardMessage.detail}</span>
          </div>
          {rewardNotice.status !== 'pending' && <button type="button" aria-label="Закрыть сообщение о награде"
            onClick={() => setRewardNotice(null)}>×</button>}
        </aside>
      )}
      {(reconnecting || opponentAwayAt || technicalResult || recoveryExpired) && (
        <div className="kodumi-reconnect-overlay" role="dialog" aria-modal="true" aria-live="polite">
          <div className="kodumi-reconnect-card">
            <div className="kodumi-reconnect-icon" aria-hidden="true">{technicalResult ? '🏆' : opponentAwayAt ? '⏳' : '📡'}</div>
            <h2>{technicalResult ? t('Вы победили!') : recoveryExpired ? t('Матч завершён') : opponentAwayAt ? t('Ожидаем переподключения соперника') : resumeBusy ? t('Матч открыт в другой вкладке') : t('Проблемы с подключением')}</h2>
            <p>{technicalResult ? t('Соперник покинул матч. Результат и начисления проверяет игровой сервер.') : recoveryExpired ? t('Время на переподключение истекло. Матч уже завершён.') : opponentAwayAt ? `${t('Ожидание соперника')} · ${secondsLeft} ${t('сек.')}` : resumeBusy ? t('Дождись отключения предыдущей вкладки или открой эту игру там.') : t('Пытаемся вернуться в матч. У тебя есть 20 секунд после обрыва связи.')}</p>
            {technicalResult && rewardMessage && <p className="codumi-technical-award"><strong>{rewardMessage.title}</strong> {rewardMessage.detail}</p>}
            <div className="kodumi-reconnect-actions">
              {!technicalResult && !opponentAwayAt && !recoveryExpired && <button type="button" className="kodumi-reconnect-primary" onClick={retryConnection}>{t('Переподключиться')}</button>}
              <button type="button" className="kodumi-reconnect-exit" onClick={leaveGame}>{t('В главное меню')}</button>
            </div>
          </div>
        </div>
      )}
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
          <MatchSocial gameId={game.id} currentRoomId={currentRoomId} phase={matchPhase} technicalResult={technicalResult} />
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
        {matchPhase === 'idle' && !readMatchSession(game.id) && (
          <div className="codumi-stake-choice" role="group" aria-label="Выбор типа матча">
            <div className="codumi-stake-choice__heading"><strong>🎮 {t('Как будем играть?')}</strong><span>{t('Выбери режим перед поиском соперника')}</span></div>
            <div className="codumi-stake-choice__modes">
              <button type="button" className={selectedStake === 0 ? 'is-selected' : ''}
                onClick={() => chooseStake(0)} aria-pressed={selectedStake === 0}>
                <strong>🎲 {t('На интерес')}</strong><small>{t('Бесплатно · победа +75 XP, ничья +60 XP')}</small>
              </button>
              <button type="button" className={selectedStake === 25 ? 'is-selected' : ''}
                onClick={() => chooseStake(25)} disabled={!currentUser?.id || Number(shop?.coins || 0) < 25}
                aria-pressed={selectedStake === 25}>
                <strong>🪙 {t('На 25 CODI')}</strong><small>{t('Каждый вносит 25 · банк 50 CODI')}</small>
              </button>
            </div>
            <div className="codumi-stake-choice__details" role="status">
              {selectedStake === 25
                ? `${t('Твой баланс')}: ${Number(shop?.coins || 0)} CODI. ${t('Ставка 25 списывается при старте; победитель получает 50, при ничьей обоим возвращается по 25.')}`
                : !currentUser?.id ? t('Чтобы играть на CODI, нужно войти в аккаунт.')
                : Number(shop?.coins || 0) < 25 ? `${t('Для ставки нужно 25 CODI, у тебя')} ${Number(shop?.coins || 0)}.`
                : t('В бесплатном матче CODI не списываются и не начисляются. Начисляется только опыт.') }
            </div>
          </div>
        )}
        {activeStake > 0 && (matchPhase === 'playing' || matchPhase === 'finished') && (
          <div className="codumi-stake-pot" role="status"><span>🪙 {t('На кону')}</span><strong>{activeStake * 2} CODI</strong><small>{activeStake} CODI {t('от каждого игрока')}</small></div>
        )}
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
        <Suspense fallback={<div className="game-loading" role="status">Загружаем игру…</div>}>
          <GameComponent onBack={leaveGame} adminMode={canOpenChessAdmin && chessAdmin} />
        </Suspense>
      </div>
    </main>
  );
}
