import { useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';
import { clearMatchSession, readMatchSession, requestMatchResume, saveMatchSession } from './matchRecovery.js';

export const matchModeKey = 'danya-andrew-match-mode';
export const activePartyKey = 'danya-andrew-party-id';

// Универсальный клиентский контракт для любой игры платформы.
// Конкретная игра работает только с state/action, а очередь и комнаты общие.
export function useMultiplayerGame(gameId) {
  const [waiting, setWaiting] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const stateRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const onWaiting = (payload) => {
      if (payload.gameId !== gameId) return;
      setWaiting(true);
      setState(null);
      setError('');
    };

    const onLeft = (payload) => {
      if (payload.gameId !== gameId) return;
      setWaiting(false);
    };

    const onStarted = (payload) => {
      if (payload.gameId !== gameId) return;
      saveMatchSession(payload);
      setWaiting(false);
      setError('');
    };

    const onResumed = (payload) => {
      if (payload.gameId !== gameId) return;
      window.clearTimeout(resumeRetry);
      retryCount = 0;
      saveMatchSession(payload);
      setWaiting(false);
      setError('');
    };

    const onResumeUnavailable = (payload) => {
      if (payload.gameId && payload.gameId !== gameId) return;
      if (!readMatchSession(gameId)) return;
      window.clearTimeout(resumeRetry);
      clearMatchSession();
      setWaiting(false);
      setError('Не удалось восстановить матч. Время на возвращение истекло.');
    };

    let resumeRetry = null;
    let retryCount = 0;
    const onConnect = () => {
      retryCount = 0;
      requestMatchResume(socket, gameId);
    };
    const onResumeBusy = (payload) => {
      if (payload.gameId !== gameId || !readMatchSession(gameId)) return;
      retryCount += 1;
      window.clearTimeout(resumeRetry);
      // Mobile network handover may establish a NEW socket before the server
      // notices that the OLD one is dead. Keep retrying while a saved session
      // exists; heartbeat watchdog will release that stale socket shortly.
      resumeRetry = window.setTimeout(() => requestMatchResume(socket, gameId),
        Math.min(450 + retryCount * 250, 1700));
    };

    const onState = (payload) => {
      if (payload.gameId !== gameId) return;
      setState(payload);
      setWaiting(false);
      if (payload.status === 'finished') clearMatchSession(payload.roomId);
    };

    const onError = (payload) => {
      if (payload.gameId && payload.gameId !== gameId) return;
      setError(payload.message || 'Произошла ошибка');
      setWaiting(false);
    };

    // Accepted private duel: join the specified game's party queue without a second click.
    let reconnectHandler = null;
    const autoJoinDuel = () => {
      let pending;
      try { pending = JSON.parse(localStorage.getItem('codumi-duel-join') || 'null'); } catch { pending = null; }
      if (readMatchSession(gameId)) return;
      if (!pending || pending.gameId !== gameId || Date.now() - pending.at > 90000) return;
      if (!socket.connected) {
        if (!reconnectHandler) { reconnectHandler = autoJoinDuel; socket.once('connect', reconnectHandler); }
        return;
      }
      localStorage.removeItem('codumi-duel-join');
      localStorage.setItem(matchModeKey,'party');
      localStorage.setItem(activePartyKey,pending.partyId);
      socket.emit('queue:join', { gameId,mode:'party',partyId:pending.partyId,
        playerName:localStorage.getItem('danya-andrew-player-name') || 'Игрок' });
    };
    window.addEventListener('codumi-duel-ready',autoJoinDuel);
    const enterTimer=window.setTimeout(autoJoinDuel,120);

    const onDisconnect = () => {
      setWaiting(false);
      setError(readMatchSession(gameId)
        ? 'Проблемы с подключением. Пытаемся вернуться в матч…'
        : 'Соединение с игровым сервером потеряно. Повтори поиск после подключения.');
    };
    const onConnectionError = () => {
      if (!socket.connected) setError('Игровой сервер пока недоступен. Проверь соединение и повтори попытку.');
      setWaiting(false);
    };

    socket.on('connect', onConnect);
    socket.on('match:resumed', onResumed);
    socket.on('match:resume:unavailable', onResumeUnavailable);
    socket.on('match:resume:busy', onResumeBusy);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectionError);
    socket.on('queue:waiting', onWaiting);
    socket.on('queue:left', onLeft);
    socket.on('match:started', onStarted);
    socket.on('game:state', onState);
    socket.on('game:error', onError);

    // Also recover after a full reload when the socket connected before this hook mounted.
    const resumeTimer = window.setTimeout(onConnect, 70);
    return () => {
      window.clearTimeout(resumeRetry);
      window.clearTimeout(resumeTimer);
      window.clearTimeout(enterTimer);
      window.removeEventListener('codumi-duel-ready',autoJoinDuel);
      if (reconnectHandler) socket.off('connect',reconnectHandler);
      socket.off('connect', onConnect);
      socket.off('match:resumed', onResumed);
      socket.off('match:resume:unavailable', onResumeUnavailable);
      socket.off('match:resume:busy', onResumeBusy);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectionError);
      socket.off('queue:waiting', onWaiting);
      socket.off('queue:left', onLeft);
      socket.off('match:started', onStarted);
      socket.off('game:state', onState);
      socket.off('game:error', onError);

      socket.emit('queue:leave', { gameId });
      // Do NOT leave the match on unmount: reloads, orientation changes and
      // React StrictMode cleanup must allow the 20-second resume window.
    };
  }, [gameId]);

  function findMatch(playerName) {
    setError('');
    setState(null);
    if (!socket.connected) {
      setWaiting(false);
      setError('Нет соединения с игровым сервером. Подожди немного и попробуй снова.');
      socket.connect();
      return;
    }

    const selectedMode = localStorage.getItem(matchModeKey) === 'party' ? 'party' : 'public';
    const partyId = localStorage.getItem(activePartyKey) || '';
    const mode = selectedMode === 'party' && partyId ? 'party' : 'public';

    window.dispatchEvent(new CustomEvent('codumi:match-phase', { detail: { gameId, phase: 'searching' } }));
    socket.emit('queue:join', {
      gameId,
      playerName,
      mode,
      ...(mode === 'party' ? { partyId } : {}),
    });
  }

  function cancelSearch() {
    window.dispatchEvent(new CustomEvent('codumi:match-phase', { detail: { gameId, phase: 'idle' } }));
    socket.emit('queue:leave', { gameId });
    setWaiting(false);
  }

  function sendAction(action) {
    if (!stateRef.current?.roomId) return;
    socket.emit('game:action', {
      roomId: stateRef.current.roomId,
      action,
    });
  }

  return {
    waiting,
    state,
    error,
    setError,
    findMatch,
    cancelSearch,
    sendAction,
  };
}
