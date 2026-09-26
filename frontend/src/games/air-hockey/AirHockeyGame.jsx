import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './air-hockey.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const didWin = state.result?.winner === state.playerSide;
  let text = state.result?.message || 'Матч завершён.';
  if (state.result?.type === 'disconnect') text = didWin ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  if (state.result?.type === 'resign') text = didWin ? 'Соперник сдался.' : 'Вы сдались.';
  return {
    kind: didWin ? 'win' : 'lose',
    icon: didWin ? '🏆' : '🏒',
    title: didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}

function displayPoint(point, playerSide, field) {
  if (!point || !field) return { x: 0, y: 0 };
  if (playerSide === 'bottom') return point;
  return { x: field.width - point.x, y: field.height - point.y };
}

function worldPoint(display, playerSide, field) {
  if (playerSide === 'bottom') return display;
  return { x: field.width - display.x, y: field.height - display.y };
}

export default function AirHockeyGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const arenaRef = useRef(null);
  const draggingRef = useRef(false);
  const lastSentRef = useRef(0);
  const [localPaddle, setLocalPaddle] = useState(null);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('air-hockey');

  const field = state?.field;
  const mySide = state?.playerSide;
  const opponentSide = mySide === 'bottom' ? 'top' : 'bottom';

  const myServerPaddle = useMemo(
    () => (state?.paddles && mySide ? displayPoint(state.paddles[mySide], mySide, field) : null),
    [state?.paddles, mySide, field],
  );
  const opponentPaddle = useMemo(
    () => (state?.paddles && opponentSide ? displayPoint(state.paddles[opponentSide], mySide, field) : null),
    [state?.paddles, opponentSide, mySide, field],
  );
  const puck = useMemo(
    () => (state?.puck ? displayPoint(state.puck, mySide, field) : null),
    [state?.puck, mySide, field],
  );

  useEffect(() => {
    if (!draggingRef.current && myServerPaddle) setLocalPaddle(myServerPaddle);
  }, [myServerPaddle]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function resign() {
    if (state?.status === 'playing') sendAction({ type: 'resign' });
  }

  function updateFromPointer(event) {
    if (!arenaRef.current || !field || !mySide || state?.status !== 'playing') return;
    const rect = arenaRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * field.width;
    const y = ((event.clientY - rect.top) / rect.height) * field.height;
    const r = field.paddleRadius;
    const display = {
      x: Math.max(r + 26, Math.min(field.width - r - 26, x)),
      y: Math.max(field.centerY + r + 12, Math.min(field.height - r - 26, y)),
    };
    setLocalPaddle(display);
    const now = performance.now();
    if (now - lastSentRef.current < 28) return;
    lastSentRef.current = now;
    const world = worldPoint(display, mySide, field);
    sendAction({ type: 'move', payload: world });
  }

  function pointerDown(event) {
    if (state?.status !== 'playing') return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(event);
  }

  function pointerMove(event) {
    if (!draggingRef.current) return;
    updateFromPointer(event);
  }

  function pointerUp(event) {
    if (!draggingRef.current) return;
    updateFromPointer(event);
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  if (!state && !waiting) {
    return (
      <section className="ah-lobby">
        <div className="ah-lobby__icon">🏒</div>
        <span className="eyebrow">Игра в реальном времени</span>
        <h1>Аэрохоккей</h1>
        <p>Двигай биту пальцем по своей половине поля, отбивай шайбу и первым забей 7 голов.</p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="ah-waiting-card">
        <div className="ah-waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Когда второй игрок откроет аэрохоккей и нажмёт поиск, матч начнётся автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const myName = state.players?.[mySide]?.name || playerName;
  const opponentName = state.players?.[opponentSide]?.name || 'Соперник';
  const myScore = state.scores?.[mySide] ?? 0;
  const opponentScore = state.scores?.[opponentSide] ?? 0;
  const renderMyPaddle = localPaddle || myServerPaddle;
  const result = resultPresentation(state);
  const goalLeftPct = (field.goalLeft / field.width) * 100;
  const goalWidthPct = ((field.goalRight - field.goalLeft) / field.width) * 100;

  return (
    <section className="ah-match">
      <div className="ah-scoreboard">
        <div className="ah-player ah-player--opponent">
          <span className="ah-player__disc ah-player__disc--opponent" />
          <div><strong>{opponentName}</strong><small>соперник</small></div>
        </div>
        <div className="ah-score">
          <span>{opponentScore}</span><b>:</b><span>{myScore}</span>
          <small>до {state.winScore}</small>
        </div>
        <div className="ah-player ah-player--me">
          <div><strong>{myName}</strong><small>ты</small></div>
          <span className="ah-player__disc ah-player__disc--me" />
        </div>
      </div>

      <div className="ah-status-row">
        <span className={`ah-live-dot ${state.roundState === 'live' ? 'is-live' : ''}`} />
        <strong>{state.roundState === 'countdown' ? 'Приготовься…' : 'Игра идёт'}</strong>
        <span>Двигай биту пальцем</span>
      </div>

      <div
        ref={arenaRef}
        className="ah-arena"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        role="application"
        aria-label="Поле аэрохоккея"
      >
        <div className="ah-rink-lines" />
        <div className="ah-center-line" />
        <div className="ah-center-circle" />
        <div className="ah-goal ah-goal--top" style={{ left: `${goalLeftPct}%`, width: `${goalWidthPct}%` }} />
        <div className="ah-goal ah-goal--bottom" style={{ left: `${goalLeftPct}%`, width: `${goalWidthPct}%` }} />
        <div className="ah-half ah-half--mine">ТВОЯ ПОЛОВИНА</div>

        {opponentPaddle && (
          <div
            className="ah-paddle ah-paddle--opponent"
            style={{
              left: `${(opponentPaddle.x / field.width) * 100}%`,
              top: `${(opponentPaddle.y / field.height) * 100}%`,
              width: `${(field.paddleRadius * 2 / field.width) * 100}%`,
              aspectRatio: '1',
            }}
          />
        )}

        {puck && (
          <div
            className="ah-puck"
            style={{
              left: `${(puck.x / field.width) * 100}%`,
              top: `${(puck.y / field.height) * 100}%`,
              width: `${(field.puckRadius * 2 / field.width) * 100}%`,
              aspectRatio: '1',
            }}
          />
        )}

        {renderMyPaddle && (
          <div
            className="ah-paddle ah-paddle--me"
            style={{
              left: `${(renderMyPaddle.x / field.width) * 100}%`,
              top: `${(renderMyPaddle.y / field.height) * 100}%`,
              width: `${(field.paddleRadius * 2 / field.width) * 100}%`,
              aspectRatio: '1',
            }}
          >
            <span />
          </div>
        )}

        {state.roundState === 'countdown' && (
          <div className="ah-countdown">{Math.max(1, Math.ceil((state.serveInMs || 0) / 1000))}</div>
        )}
      </div>

      <div className="ah-bottom-actions">
        <div><strong>Совет:</strong> можно вести биту прямо за пальцем — сервер ограничит её твоей половиной.</div>
        {error && <div className="game-error">{error}</div>}
        {state.status === 'playing' && <button className="danger-button" onClick={resign}>Сдаться</button>}
      </div>

      {result && (
        <div className="ah-result-backdrop" role="dialog" aria-modal="true">
          <div className={`ah-result-card ah-result-card--${result.kind}`}>
            <div className="ah-result-icon">{result.icon}</div>
            <span className="eyebrow">Матч завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="ah-result-actions">
              <button className="primary-button" onClick={onBack}>Выйти в главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Новый соперник</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
