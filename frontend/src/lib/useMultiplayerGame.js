import { useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';

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
      setWaiting(false);
      setError('');
    };

    const onState = (payload) => {
      if (payload.gameId !== gameId) return;
      setState(payload);
      setWaiting(false);
    };

    const onError = (payload) => {
      if (payload.gameId && payload.gameId !== gameId) return;
      setError(payload.message || 'Произошла ошибка');
      setWaiting(false);
    };

    socket.on('queue:waiting', onWaiting);
    socket.on('queue:left', onLeft);
    socket.on('match:started', onStarted);
    socket.on('game:state', onState);
    socket.on('game:error', onError);

    return () => {
      socket.off('queue:waiting', onWaiting);
      socket.off('queue:left', onLeft);
      socket.off('match:started', onStarted);
      socket.off('game:state', onState);
      socket.off('game:error', onError);

      socket.emit('queue:leave', { gameId });
      if (stateRef.current?.status === 'playing') {
        socket.emit('match:leave');
      }
    };
  }, [gameId]);

  function findMatch(playerName) {
    setError('');
    setState(null);

    const selectedMode = localStorage.getItem(matchModeKey) === 'party' ? 'party' : 'public';
    const partyId = localStorage.getItem(activePartyKey) || '';
    const mode = selectedMode === 'party' && partyId ? 'party' : 'public';

    socket.emit('queue:join', {
      gameId,
      playerName,
      mode,
      ...(mode === 'party' ? { partyId } : {}),
    });
  }

  function cancelSearch() {
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
