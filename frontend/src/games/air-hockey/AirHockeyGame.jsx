import { useEffect, useRef, useState } from 'react';
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
  if (!point || !field) return null;
  if (playerSide === 'bottom') return { x: point.x, y: point.y };
  return { x: field.width - point.x, y: field.height - point.y };
}

function worldPoint(display, playerSide, field) {
  if (playerSide === 'bottom') return display;
  return { x: field.width - display.x, y: field.height - display.y };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function keepPaddleOutsidePuck(candidate, puck, fallbackPaddle, field) {
  if (!candidate || !puck || !field) return candidate;

  const minDistance = field.paddleRadius + field.puckRadius + 5;
  let dx = candidate.x - puck.x;
  let dy = candidate.y - puck.y;
  let distance = Math.hypot(dx, dy);

  if (distance >= minDistance) return candidate;

  if (distance < 0.001 && fallbackPaddle) {
    dx = fallbackPaddle.x - puck.x;
    dy = fallbackPaddle.y - puck.y;
    distance = Math.hypot(dx, dy);
  }

  if (distance < 0.001) {
    dx = 0;
    dy = 1;
    distance = 1;
  }

  return {
    x: puck.x + (dx / distance) * minDistance,
    y: puck.y + (dy / distance) * minDistance,
  };
}

function keepPuckOutsidePaddle(puck, paddle, field) {
  if (!puck || !paddle || !field) return puck;
  const minDistance = field.paddleRadius + field.puckRadius + 2;
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= minDistance) return puck;

  if (distance < 0.001) {
    return { x: puck.x, y: paddle.y - minDistance };
  }

  return {
    x: paddle.x + (dx / distance) * minDistance,
    y: paddle.y + (dy / distance) * minDistance,
  };
}

function createMotionPoint() {
  return { x: 0, y: 0, targetX: 0, targetY: 0, ready: false };
}

function feedMotion(point, next) {
  if (!point || !next) return;
  if (!point.ready) {
    point.x = next.x;
    point.y = next.y;
    point.ready = true;
  }
  point.targetX = next.x;
  point.targetY = next.y;
}

function smoothMotion(point, dt, strength = 24) {
  if (!point?.ready) return;
  const alpha = 1 - Math.exp(-strength * dt);
  point.x += (point.targetX - point.x) * alpha;
  point.y += (point.targetY - point.y) * alpha;
}

function setElementPoint(element, point, field) {
  if (!element || !point || !field) return;
  element.style.left = `${(point.x / field.width) * 100}%`;
  element.style.top = `${(point.y / field.height) * 100}%`;
}

export default function AirHockeyGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const arenaRef = useRef(null);
  const myPaddleElRef = useRef(null);
  const opponentPaddleElRef = useRef(null);
  const puckElRef = useRef(null);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const localPaddleRef = useRef(null);
  const fieldRef = useRef(null);
  const sideRef = useRef(null);
  const animationRef = useRef(null);
  const lastFrameRef = useRef(0);
  const motionRef = useRef({
    puck: createMotionPoint(),
    opponent: createMotionPoint(),
    mine: createMotionPoint(),
  });

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

  useEffect(() => {
    fieldRef.current = field || null;
    sideRef.current = mySide || null;
    if (!field || !mySide || !state?.paddles || !state?.puck) return;

    const myServer = displayPoint(state.paddles[mySide], mySide, field);
    const opponent = displayPoint(state.paddles[opponentSide], mySide, field);
    const puck = displayPoint(state.puck, mySide, field);

    feedMotion(motionRef.current.mine, myServer);
    feedMotion(motionRef.current.opponent, opponent);
    feedMotion(motionRef.current.puck, puck);

    if (!draggingRef.current && !localPaddleRef.current) {
      localPaddleRef.current = { ...myServer };
    }
  }, [field, mySide, opponentSide, state?.paddles, state?.puck]);

  useEffect(() => {
    function frame(now) {
      const currentField = fieldRef.current;
      const motion = motionRef.current;
      let dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 1 / 60;
      lastFrameRef.current = now;
      dt = clamp(dt, 0, 0.05);

      if (currentField) {
        smoothMotion(motion.puck, dt, 27);
        smoothMotion(motion.opponent, dt, 25);
        smoothMotion(motion.mine, dt, 28);

        let myPoint;
        if (draggingRef.current && localPaddleRef.current) {
          myPoint = localPaddleRef.current;
        } else if (motion.mine.ready) {
          myPoint = { x: motion.mine.x, y: motion.mine.y };
          localPaddleRef.current = { ...myPoint };
        }

        const opponentPoint = motion.opponent.ready
          ? { x: motion.opponent.x, y: motion.opponent.y }
          : null;

        let puckPoint = motion.puck.ready
          ? { x: motion.puck.x, y: motion.puck.y }
          : null;

        // Последняя визуальная страховка: даже между двумя сетевыми кадрами
        // шайба никогда не рисуется внутри одной из клюшек.
        if (puckPoint && myPoint) puckPoint = keepPuckOutsidePaddle(puckPoint, myPoint, currentField);
        if (puckPoint && opponentPoint) puckPoint = keepPuckOutsidePaddle(puckPoint, opponentPoint, currentField);

        setElementPoint(myPaddleElRef.current, myPoint, currentField);
        setElementPoint(opponentPaddleElRef.current, opponentPoint, currentField);
        setElementPoint(puckElRef.current, puckPoint, currentField);
      }

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      lastFrameRef.current = 0;
    };
  }, []);

  function findMatch() {
    draggingRef.current = false;
    pointerIdRef.current = null;
    localPaddleRef.current = null;
    motionRef.current = {
      puck: createMotionPoint(),
      opponent: createMotionPoint(),
      mine: createMotionPoint(),
    };
    setError('');
    startMatch(playerName);
  }

  function resign() {
    if (state?.status === 'playing') sendAction({ type: 'resign' });
  }

  function updateFromPointer(event, forceSend = false) {
    const arena = arenaRef.current;
    const currentField = fieldRef.current;
    const currentSide = sideRef.current;
    if (!arena || !currentField || !currentSide || state?.status !== 'playing') return;

    const rect = arena.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * currentField.width;
    const y = ((event.clientY - rect.top) / rect.height) * currentField.height;
    const r = currentField.paddleRadius;

    // Сервер получает настоящее положение пальца (куда игрок ХОЧЕТ вести биту),
    // а локально мы рисуем биту остановленной ровно у поверхности шайбы.
    // Благодаря этому удар не теряет силу, но визуально тела никогда не пересекаются.
    const rawDisplay = {
      x: clamp(x, r + 26, currentField.width - r - 26),
      y: clamp(y, currentField.centerY + r + 12, currentField.height - r - 26),
    };

    const displayPuck = motionRef.current.puck.ready
      ? { x: motionRef.current.puck.x, y: motionRef.current.puck.y }
      : null;

    let visualDisplay = keepPaddleOutsidePuck(
      rawDisplay,
      displayPuck,
      localPaddleRef.current || (motionRef.current.mine.ready
        ? { x: motionRef.current.mine.x, y: motionRef.current.mine.y }
        : null),
      currentField,
    );

    visualDisplay = {
      x: clamp(visualDisplay.x, r + 26, currentField.width - r - 26),
      y: clamp(visualDisplay.y, currentField.centerY + r + 12, currentField.height - r - 26),
    };

    localPaddleRef.current = visualDisplay;
    setElementPoint(myPaddleElRef.current, visualDisplay, currentField);

    const now = performance.now();
    if (!forceSend && now - lastSentRef.current < 32) return;
    lastSentRef.current = now;
    const world = worldPoint(rawDisplay, currentSide, currentField);
    sendAction({ type: 'move', payload: world });
  }

  function pointerDown(event) {
    if (state?.status !== 'playing') return;
    draggingRef.current = true;
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(event, true);
  }

  function pointerMove(event) {
    if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
    updateFromPointer(event, false);
  }

  function pointerUp(event) {
    if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
    updateFromPointer(event, true);
    draggingRef.current = false;
    pointerIdRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  if (!state && !waiting) {
    return (
      <section className="ah-lobby">
        <div className="ah-lobby__icon">🏒</div>
        <span className="eyebrow">Игра в реальном времени</span>
        <h1>Аэрохоккей</h1>
        <p>Веди биту пальцем, жёстко отбивай шайбу и первым забей 7 голов.</p>
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
  const result = resultPresentation(state);
  const goalLeftPct = (field.goalLeft / field.width) * 100;
  const goalWidthPct = ((field.goalRight - field.goalLeft) / field.width) * 100;
  const paddleWidthPct = (field.paddleRadius * 2 / field.width) * 100;
  const puckWidthPct = (field.puckRadius * 2 / field.width) * 100;

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
        <span>Бита следует за пальцем без задержки</span>
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

        <div
          ref={opponentPaddleElRef}
          className="ah-paddle ah-paddle--opponent"
          style={{ width: `${paddleWidthPct}%`, aspectRatio: '1' }}
        />

        <div
          ref={puckElRef}
          className="ah-puck"
          style={{ width: `${puckWidthPct}%`, aspectRatio: '1' }}
        />

        <div
          ref={myPaddleElRef}
          className="ah-paddle ah-paddle--me"
          style={{ width: `${paddleWidthPct}%`, aspectRatio: '1' }}
        >
          <span />
        </div>

        {state.roundState === 'countdown' && (
          <div className="ah-countdown">{Math.max(1, Math.ceil((state.serveInMs || 0) / 1000))}</div>
        )}
      </div>

      <div className="ah-bottom-actions">
        <div><strong>Физика:</strong> шайба не может войти внутрь биты — столкновение считается жёстко на сервере.</div>
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
