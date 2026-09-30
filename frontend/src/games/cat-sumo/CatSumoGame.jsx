import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './cat-sumo.css';

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

function formatTime(ms) {
  const safe = Math.max(0, ms);
  const total = Math.ceil(safe / 1000);
  const min = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

function createMotionPoint() {
  return {
    x: 0,
    y: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    targetX: 0,
    targetY: 0,
    targetAngle: 0,
    targetVx: 0,
    targetVy: 0,
    receivedAt: 0,
    ready: false,
  };
}

function angleDelta(target, current) {
  let delta = target - current;

  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  return delta;
}

function feedMotion(point, player, now = performance.now()) {
  if (!point || !player) return;

  if (!point.ready) {
    point.x = player.x;
    point.y = player.y;
    point.angle = player.angle;
    point.ready = true;
  }

  point.targetX = player.x;
  point.targetY = player.y;
  point.targetAngle = player.angle;
  point.targetVx = player.vx || 0;
  point.targetVy = player.vy || 0;
  point.receivedAt = now;
}

function smoothMotion(point, now, dt) {
  if (!point.ready) return;

  const age = Math.min(85, Math.max(0, now - point.receivedAt)) / 1000;
  const predictedX = point.targetX + point.targetVx * age;
  const predictedY = point.targetY + point.targetVy * age;

  const positionAlpha = 1 - Math.exp(-28 * dt);
  const angleAlpha = 1 - Math.exp(-24 * dt);

  point.x += (predictedX - point.x) * positionAlpha;
  point.y += (predictedY - point.y) * positionAlpha;
  point.angle += angleDelta(point.targetAngle, point.angle) * angleAlpha;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  if (state.result?.draw) {
    return {
      title: 'НИЧЬЯ',
      text: state.result.message || 'После двух раундов ничья.',
    };
  }

  const won = state.result?.winner === state.playerSeat;

  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || '',
  };
}

function Fighter({ motion, mine, mirrored }) {
  if (!motion?.ready) return null;

  const worldX = mirrored ? 1000 - motion.x : motion.x;
  const worldAngle = mirrored ? Math.PI - motion.angle : motion.angle;
  const rotation = (worldAngle * 180) / Math.PI;

  return (
    <g
      transform={`translate(${worldX} ${motion.y}) rotate(${rotation})`}
      className={`cs-fighter ${mine ? 'is-mine' : 'is-foe'}`}
    >
      <circle r="40" className="cs-fighter__shadow" />
      <circle r="36" className="cs-fighter__body" />

      <path d="M22 -12 L49 0 L22 12 Z" className="cs-fighter__nose" />

      <circle cx="8" cy="0" r="22" className="cs-fighter__face" />
      <path d="M-4 -16 L1 -32 L10 -17 M18 -16 L24 -31 L30 -14" className="cs-fighter__ears" />

      <circle cx="13" cy="-6" r="3.5" className="cs-fighter__eye" />
      <circle cx="13" cy="7" r="3.5" className="cs-fighter__eye" />
      <path d="M23 -2 Q29 0 23 3" className="cs-fighter__mouth" />

      <g transform="rotate(90)">
        <rect x="-18" y="-9" width="36" height="18" rx="9" className="cs-fighter__tag" />
        <text x="0" y="4" textAnchor="middle" className="cs-fighter__tag-text">
          {mine ? 'ТЫ' : 'ОН'}
        </text>
      </g>
    </g>
  );
}

export default function CatSumoGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());

  const stateRef = useRef(null);
  const animationRef = useRef(null);
  const lastFrameRef = useRef(0);
  const runningRef = useRef(false);

  const motionRef = useRef({
    a: createMotionPoint(),
    b: createMotionPoint(),
  });

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('cat-sumo');

  stateRef.current = state;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const canRun = state?.status === 'playing' && state?.phase === 'playing';
  const result = resultPresentation(state);

  useEffect(() => {
    if (!state?.fighters) return;

    const stamp = performance.now();
    feedMotion(motionRef.current.a, state.fighters.a, stamp);
    feedMotion(motionRef.current.b, state.fighters.b, stamp);
  }, [state?.fighters]);

  useEffect(() => {
    if (!state) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    function frame(stamp) {
      const dt = lastFrameRef.current
        ? clamp((stamp - lastFrameRef.current) / 1000, 0, 0.05)
        : 1 / 60;

      lastFrameRef.current = stamp;

      smoothMotion(motionRef.current.a, stamp, dt);
      smoothMotion(motionRef.current.b, stamp, dt);

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function releaseRun() {
      if (!runningRef.current) return;

      runningRef.current = false;
      sendAction({ type: 'run', active: false });
    }

    function visibilityChange() {
      if (document.hidden) releaseRun();
    }

    window.addEventListener('blur', releaseRun);
    document.addEventListener('visibilitychange', visibilityChange);

    return () => {
      window.removeEventListener('blur', releaseRun);
      document.removeEventListener('visibilitychange', visibilityChange);
    };
  }, [sendAction]);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space') return;
      if (event.repeat) return;
      if (event.target?.matches?.('input, textarea, select, button')) return;

      event.preventDefault();
      startRunning();
    }

    function keyUp(event) {
      if (event.code !== 'Space') return;

      event.preventDefault();
      stopRunning();
    }

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  });

  useEffect(() => {
    if (!canRun && runningRef.current) {
      runningRef.current = false;
    }
  }, [canRun]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function startRunning() {
    if (!canRun || runningRef.current) return;

    runningRef.current = true;
    sendAction({ type: 'run', active: true });
  }

  function stopRunning() {
    if (!runningRef.current) return;

    runningRef.current = false;
    sendAction({ type: 'run', active: false });
  }

  if (!state && !waiting) {
    return (
      <section className="cs-lobby">
        <div className="cs-lobby__icon">🐱⚔️🐱</div>
        <span className="eyebrow">Физика · один круг · 2 раунда</span>
        <h1>Кошачий ринг</h1>

        <p>
          Пока стоишь — твой кот вращается по часовой стрелке. Зажми кнопку,
          и он побежит туда, куда смотрит. Попади сопернику в бок и вытолкни его
          из круга.
        </p>

        <div className="cs-rules">
          <span>⟳ ты вращаешься по часовой</span>
          <span>⟲ соперник — против</span>
          <span>⏱ 2:30 на раунд</span>
          <span>⭕ последний в круге побеждает</span>
        </div>

        {error && <div className="game-error">{error}</div>}

        <button
          type="button"
          className="primary-button primary-button--large"
          onClick={findMatch}
        >
          Найти соперника
        </button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="cs-waiting">
        <div className="cs-waiting__icon">🐱</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго борца…</h2>
        <p>Ринг откроется автоматически.</p>

        <button
          type="button"
          className="secondary-button"
          onClick={cancelSearch}
        >
          Отменить поиск
        </button>
      </section>
    );
  }

  if (!state) return null;

  const mirrored = me === 'b';
  const ownMotion = motionRef.current[me];
  const foeMotion = motionRef.current[foe];

  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';

  const myWins = me ? state.roundWins?.[me] ?? 0 : 0;
  const foeWins = foe ? state.roundWins?.[foe] ?? 0 : 0;

  const countdown = state.phase === 'countdown'
    ? Math.max(1, Math.ceil((state.countdownEndsAt - now) / 800))
    : null;

  const remaining = state.phase === 'playing' && state.roundStartedAt
    ? state.roundDurationMs - (now - state.roundStartedAt)
    : state.roundDurationMs;

  return (
    <section className="cs-shell">
      <header className="cs-scorebar">
        <div className="cs-player">
          <span className="cs-player__color cs-player__color--mine" />
          <div>
            <small>{myName}</small>
            <strong>{myWins}</strong>
          </div>
        </div>

        <div className="cs-round">
          <small>РАУНД {state.round}/{state.totalRounds}</small>
          <strong>{formatTime(remaining)}</strong>
        </div>

        <div className="cs-player cs-player--right">
          <div>
            <small>{foeName}</small>
            <strong>{foeWins}</strong>
          </div>
          <span className="cs-player__color cs-player__color--foe" />
        </div>
      </header>

      <div className="cs-arena">
        <svg viewBox="0 0 1000 650" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <radialGradient id="csFloor" cx="50%" cy="44%" r="65%">
              <stop offset="0%" stopColor="#ffe9a6" />
              <stop offset="100%" stopColor="#e8bd62" />
            </radialGradient>

            <radialGradient id="csRing" cx="48%" cy="42%" r="68%">
              <stop offset="0%" stopColor="#d8a34d" />
              <stop offset="100%" stopColor="#b77a2f" />
            </radialGradient>
          </defs>

          <rect width="1000" height="650" fill="url(#csFloor)" />

          <g className="cs-stands">
            <rect x="20" y="35" width="190" height="580" rx="24" />
            <rect x="790" y="35" width="190" height="580" rx="24" />
            <rect x="245" y="18" width="510" height="80" rx="20" />
            <rect x="245" y="552" width="510" height="80" rx="20" />
          </g>

          <g className="cs-crowd">
            {Array.from({ length: 11 }, (_, i) => (
              <circle key={`l-${i}`} cx={65 + (i % 2) * 74} cy={82 + i * 46} r="13" />
            ))}
            {Array.from({ length: 11 }, (_, i) => (
              <circle key={`r-${i}`} cx={862 + (i % 2) * 74} cy={82 + i * 46} r="13" />
            ))}
            {Array.from({ length: 8 }, (_, i) => (
              <circle key={`t-${i}`} cx={292 + i * 60} cy={57} r="12" />
            ))}
            {Array.from({ length: 8 }, (_, i) => (
              <circle key={`b-${i}`} cx={292 + i * 60} cy={593} r="12" />
            ))}
          </g>

          <rect x="220" y="88" width="560" height="474" rx="44" className="cs-mat" />
          <circle cx="500" cy="325" r="262" className="cs-ring-outer" />
          <circle cx="500" cy="325" r="248" fill="url(#csRing)" className="cs-ring" />
          <circle cx="500" cy="325" r="216" className="cs-ring-inner" />

          <path d="M480 297 L480 353 M520 297 L520 353" className="cs-start-lines" />

          <Fighter motion={ownMotion} mine mirrored={mirrored} />
          <Fighter motion={foeMotion} mine={false} mirrored={mirrored} />
        </svg>

        {state.phase === 'countdown' && (
          <div className="cs-overlay">
            <span>РАУНД {state.round}</span>
            <strong>{countdown}</strong>
            <small>ВЫБЕРИ МОМЕНТ И ЗАЖМИ КНОПКУ</small>
          </div>
        )}

        {state.phase === 'round-over' && (
          <div className="cs-overlay cs-overlay--round">
            <span>РАУНД ЗАВЕРШЁН</span>
            <strong>
              {state.roundWinner
                ? state.roundWinner === me
                  ? 'ТВОЙ!'
                  : 'СОПЕРНИКА'
                : 'НИЧЬЯ'}
            </strong>
            <small>{state.roundMessage}</small>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`cs-run ${runningRef.current ? 'is-running' : ''}`}
        disabled={!canRun}
        onPointerDown={(event) => {
          event.preventDefault();

          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // no-op
          }

          startRunning();
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          stopRunning();
        }}
        onPointerCancel={stopRunning}
        onLostPointerCapture={stopRunning}
      >
        <span>🐾</span>
        <b>{canRun ? 'ЗАЖМИ И БЕГИ' : 'ЖДЁМ…'}</b>
        <small>отпустишь — снова начнёшь вращаться</small>
      </button>

      <p className="cs-tip">
        Лоб в лоб силы почти гасятся · боковой удар сдвигает соперника по касательной
      </p>

      {result && (
        <div className="cs-result">
          <div className="cs-result__card">
            <span>Кошачий ринг</span>
            <div className="cs-result__icon">🐱⭕🐱</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>

            <div className="cs-result__score">
              <strong>{myWins}</strong>
              <span>:</span>
              <strong>{foeWins}</strong>
            </div>

            <div className="cs-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>
                Новый соперник
              </button>

              <button type="button" className="secondary-button" onClick={onBack}>
                Все игры
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
