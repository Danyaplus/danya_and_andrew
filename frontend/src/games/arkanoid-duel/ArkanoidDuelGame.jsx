import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './arkanoid-duel.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function viewX(x, seat, width) {
  return seat === 'b' ? width - x : x;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  let text = state.result?.message || 'Матч завершён.';
  if (state.result?.type === 'disconnect') text = won ? 'Соперник отключился.' : 'Соединение с матчем потеряно.';
  if (state.result?.type === 'resign') text = won ? 'Соперник вышел из матча.' : 'Вы покинули матч.';
  return {
    won,
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text,
  };
}

function createMotionPoint() {
  return { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, targetVx: 0, targetVy: 0, ready: false, receivedAt: 0 };
}

function feedMotion(point, next, now = performance.now()) {
  if (!point || !next) return;
  if (!point.ready) {
    point.x = next.x;
    point.y = next.y;
    point.ready = true;
  }
  point.targetX = next.x;
  point.targetY = next.y;
  point.targetVx = next.vx || 0;
  point.targetVy = next.vy || 0;
  point.receivedAt = now;
}

function smoothMotion(point, now, dt, strength, predictMs = 0) {
  if (!point?.ready) return;
  const age = Math.min(predictMs, Math.max(0, now - point.receivedAt)) / 1000;
  const tx = point.targetX + point.targetVx * age;
  const ty = point.targetY + point.targetVy * age;
  const alpha = 1 - Math.exp(-strength * dt);
  point.x += (tx - point.x) * alpha;
  point.y += (ty - point.y) * alpha;
}

function setTransform(element, x, y) {
  if (!element) return;
  element.setAttribute('transform', `translate(${x} ${y})`);
}

export default function ArkanoidDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const arenaRef = useRef(null);
  const myPaddleRef = useRef(null);
  const opponentPaddleRef = useRef(null);
  const ballRef = useRef(null);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef(null);
  const localYRef = useRef(null);
  const localTargetYRef = useRef(null);
  const lastSentRef = useRef(0);
  const lastFrameRef = useRef(0);
  const fieldRef = useRef(null);
  const seatRef = useRef(null);
  const animationRef = useRef(null);
  const motionRef = useRef({
    mine: createMotionPoint(),
    opponent: createMotionPoint(),
    ball: createMotionPoint(),
  });

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('arkanoid-duel');

  const field = state?.field;
  const mySeat = state?.playerSeat;
  const opponentSeat = state?.opponentSeat;
  const canControl = state?.status === 'playing';
  const result = resultPresentation(state);

  const myScore = mySeat ? state?.scores?.[mySeat] ?? 0 : 0;
  const opponentScore = opponentSeat ? state?.scores?.[opponentSeat] ?? 0 : 0;
  const myName = mySeat ? state?.players?.[mySeat]?.name || playerName : playerName;
  const opponentName = opponentSeat ? state?.players?.[opponentSeat]?.name || 'Соперник' : 'Соперник';
  const speedRatio = state?.ball?.speed && state?.startBallSpeed
    ? state.ball.speed / state.startBallSpeed
    : 1;

  useEffect(() => {
    fieldRef.current = field || null;
    seatRef.current = mySeat || null;
    if (!field || !mySeat || !state?.paddles || !state?.ball) return;

    const now = performance.now();
    const mine = state.paddles[mySeat];
    const opponent = state.paddles[opponentSeat];
    const ball = state.ball;

    feedMotion(motionRef.current.mine, {
      x: viewX(mine.x, mySeat, field.width),
      y: mine.y,
      vx: 0,
      vy: mine.vy,
    }, now);
    feedMotion(motionRef.current.opponent, {
      x: viewX(opponent.x, mySeat, field.width),
      y: opponent.y,
      vx: 0,
      vy: opponent.vy,
    }, now);
    feedMotion(motionRef.current.ball, {
      x: viewX(ball.x, mySeat, field.width),
      y: ball.y,
      vx: mySeat === 'b' ? -ball.vx : ball.vx,
      vy: ball.vy,
    }, now);

    if (!draggingRef.current) localYRef.current = mine.y;
  }, [field, mySeat, opponentSeat, state?.paddles, state?.ball]);

  useEffect(() => {
    function frame(now) {
      const currentField = fieldRef.current;
      let dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 1 / 60;
      lastFrameRef.current = now;
      dt = clamp(dt, 0, 0.05);

      if (currentField) {
        const motion = motionRef.current;
        smoothMotion(motion.ball, now, dt, 34, 34);
        smoothMotion(motion.opponent, now, dt, 30, 22);
        smoothMotion(motion.mine, now, dt, 30, 16);

        let myY = motion.mine.y;
        if (draggingRef.current && localTargetYRef.current != null) {
          if (localYRef.current == null) localYRef.current = motion.mine.y;
          const delta = localTargetYRef.current - localYRef.current;
          const maxMove = (currentField.paddleMaxSpeed || 1380) * dt;
          localYRef.current += clamp(delta, -maxMove, maxMove);
          myY = localYRef.current;
        } else {
          localYRef.current = motion.mine.y;
          myY = motion.mine.y;
        }

        setTransform(myPaddleRef.current, motion.mine.x, myY);
        setTransform(opponentPaddleRef.current, motion.opponent.x, motion.opponent.y);
        setTransform(ballRef.current, motion.ball.x, motion.ball.y);
      }

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  useEffect(() => {
    if (!canControl) {
      draggingRef.current = false;
      localTargetYRef.current = null;
      pointerIdRef.current = null;
    }
  }, [canControl]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function pointerToY(event) {
    const arena = arenaRef.current;
    const currentField = fieldRef.current;
    if (!arena || !currentField) return null;
    const rect = arena.getBoundingClientRect();
    const local = ((event.clientY - rect.top) / rect.height) * currentField.height;
    const half = currentField.paddleHeight / 2;
    return clamp(local, half + 16, currentField.height - half - 16);
  }

  function sendMove(y, force = false) {
    const now = performance.now();
    if (!force && now - lastSentRef.current < 32) return; // ~31 input packets/s max
    lastSentRef.current = now;
    sendAction({ type: 'move', y });
  }

  function moveLocalPaddle(event, force = false) {
    if (!canControl) return;
    const y = pointerToY(event);
    if (y == null) return;
    localTargetYRef.current = y;
    sendMove(y, force);
  }

  function pointerDown(event) {
    if (!canControl) return;
    event.preventDefault();
    draggingRef.current = true;
    localYRef.current = motionRef.current.mine.ready ? motionRef.current.mine.y : localYRef.current;
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    moveLocalPaddle(event, true);
  }

  function pointerMove(event) {
    if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    moveLocalPaddle(event, false);
  }

  function pointerUp(event) {
    if (!draggingRef.current || (event && pointerIdRef.current !== event.pointerId)) return;
    event?.preventDefault?.();
    if (event) moveLocalPaddle(event, true);
    draggingRef.current = false;
    localTargetYRef.current = null;
    pointerIdRef.current = null;
  }

  if (!state && !waiting) {
    return (
      <section className="ark-lobby">
        <div className="ark-lobby__orb">●</div>
        <span className="eyebrow">Реакция · физика движения · до 3 побед</span>
        <h1>Арканоид Дуэль</h1>
        <p>
          Веди платформу пальцем вверх и вниз. Точка контакта и скорость твоего движения меняют направление мяча.
          После каждого отбивания мяч ускоряется — розыгрыш становится всё опаснее.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="ark-waiting">
        <div className="ark-waiting__pulse">●</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Матч запустится автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="ark-game">
      <div className="ark-hud">
        <div className="ark-hud__side ark-hud__side--mine">
          <span className="ark-hud__dot" />
          <div><small>Ты</small><strong>{myName}</strong></div>
          <b>{myScore}</b>
        </div>
        <div className="ark-hud__center">
          <small>Раунд {state.round} · до {state.winsToMatch} побед</small>
          <strong>{myScore} : {opponentScore}</strong>
          <span>скорость ×{speedRatio.toFixed(2)}</span>
        </div>
        <div className="ark-hud__side ark-hud__side--opponent">
          <b>{opponentScore}</b>
          <div><small>Соперник</small><strong>{opponentName}</strong></div>
          <span className="ark-hud__dot" />
        </div>
      </div>

      <div className="ark-arena-shell">
        <svg
          ref={arenaRef}
          className="ark-arena"
          viewBox={`0 0 ${field.width} ${field.height}`}
          role="img"
          aria-label="Арена Арканоид Дуэль"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onLostPointerCapture={pointerUp}
          onContextMenu={(event) => event.preventDefault()}
        >
          <defs>
            <radialGradient id="ark-bg-glow" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#3a1858" />
              <stop offset="100%" stopColor="#160724" />
            </radialGradient>
            <linearGradient id="ark-my-paddle" x1="0" x2="1">
              <stop offset="0%" stopColor="#ff2b32" />
              <stop offset="100%" stopColor="#ff5a45" />
            </linearGradient>
            <linearGradient id="ark-op-paddle" x1="0" x2="1">
              <stop offset="0%" stopColor="#2d9cff" />
              <stop offset="100%" stopColor="#67c7ff" />
            </linearGradient>
            <filter id="ark-ball-glow" x="-300%" y="-300%" width="600%" height="600%">
              <feGaussianBlur stdDeviation="10" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="ark-soft-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect width={field.width} height={field.height} rx="34" fill="url(#ark-bg-glow)" className="ark-field" />
          <path className="ark-nebula ark-nebula--one" d="M0 120 C180 30 260 220 430 140 S760 40 920 170 S1080 250 1200 120 V0 H0 Z" />
          <path className="ark-nebula ark-nebula--two" d="M0 510 C170 420 310 620 500 520 S800 420 970 560 S1120 620 1200 520 V680 H0 Z" />

          {[90, 230, 410, 590, 760, 940, 1090].map((x, index) => (
            <circle key={x} cx={x} cy={index % 2 ? 118 : 560} r={index % 3 === 0 ? 3 : 2} className="ark-star" />
          ))}

          <line x1={field.width / 2} y1="38" x2={field.width / 2} y2={field.height - 38} className="ark-center-line" />
          <circle cx={field.width / 2} cy={field.height / 2} r="6" className="ark-center-dot" />
          <rect x="10" y="10" width={field.width - 20} height={field.height - 20} rx="28" className="ark-border" />

          <g ref={myPaddleRef} className="ark-paddle ark-paddle--mine">
            <ellipse cx="8" cy="12" rx="36" ry={field.paddleHeight * 0.39} className="ark-paddle__shadow" />
            <rect x={-field.paddleWidth / 2} y={-field.paddleHeight / 2} width={field.paddleWidth} height={field.paddleHeight} rx="17" fill="url(#ark-my-paddle)" className="ark-paddle__bar" />
            {[-58, -29, 0, 29, 58].map((y) => <circle key={y} cx="0" cy={y} r="7" className="ark-paddle__light" />)}
            <path d="M18 -42 Q62 -32 68 0 Q62 32 18 42 Z" className="ark-pod ark-pod--mine" />
            <circle cx="46" cy="0" r="8" className="ark-pod__eye" />
          </g>

          <g ref={opponentPaddleRef} className="ark-paddle ark-paddle--opponent">
            <ellipse cx="-8" cy="12" rx="36" ry={field.paddleHeight * 0.39} className="ark-paddle__shadow" />
            <rect x={-field.paddleWidth / 2} y={-field.paddleHeight / 2} width={field.paddleWidth} height={field.paddleHeight} rx="17" fill="url(#ark-op-paddle)" className="ark-paddle__bar" />
            {[-58, -29, 0, 29, 58].map((y) => <circle key={y} cx="0" cy={y} r="7" className="ark-paddle__light" />)}
            <path d="M-18 -42 Q-62 -32 -68 0 Q-62 32 -18 42 Z" className="ark-pod ark-pod--opponent" />
            <circle cx="-46" cy="0" r="8" className="ark-pod__eye" />
          </g>

          <g ref={ballRef} className="ark-ball" filter="url(#ark-ball-glow)">
            <circle r={field.ballRadius + 8} className="ark-ball__aura" />
            <circle r={field.ballRadius} className="ark-ball__core" />
            <circle cx="-5" cy="-5" r="5" className="ark-ball__shine" />
          </g>
        </svg>

        <div className="ark-touch-hint">↕ Веди пальцем по арене</div>

        {state.phase === 'serve' && state.status === 'playing' && (
          <div className="ark-banner ark-banner--serve">
            <strong>ГОТОВЬСЯ</strong>
            <small>Платформа уже слушает палец</small>
          </div>
        )}

        {state.phase === 'round-over' && state.status === 'playing' && (
          <div className="ark-banner">
            <strong>{state.roundWinner === mySeat ? 'РАУНД ТВОЙ' : 'РАУНД СОПЕРНИКА'}</strong>
            <small>{state.roundMessage}</small>
          </div>
        )}
      </div>

      <div className="ark-help">
        <span><b>Точка удара</b> меняет угол</span>
        <span><b>Движение платформы</b> направляет мяч</span>
        <span><b>Каждый отбой</b> ускоряет розыгрыш</span>
        <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти из матча</button>
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="ark-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`ark-result ${result.won ? 'is-win' : 'is-lose'}`}>
            <div className="ark-result__orb">●</div>
            <span className="eyebrow">Матч завершён · {myScore}:{opponentScore}</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="ark-result__actions">
              <button className="primary-button" onClick={onBack}>В главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Новый соперник</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
