import { memo, useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './pin-pong-duel.css';

const WORLD_W = 1200;

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

function angleDelta(target, current) {
  let delta = target - current;

  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  return delta;
}

function createBallMotion() {
  return {
    x: 600,
    y: 350,
    vx: 0,
    vy: 0,
    targetX: 600,
    targetY: 350,
    targetVx: 0,
    targetVy: 0,
    gravitySide: 1,
    receivedAt: 0,
    ready: false,
  };
}

function createFlipperMotion() {
  return {
    angle: 0,
    targetAngle: 0,
    angularVelocity: 0,
    receivedAt: 0,
    ready: false,
  };
}

function feedBall(point, ball, stamp) {
  if (!point.ready) {
    point.x = ball.x;
    point.y = ball.y;
    point.ready = true;
  }

  point.targetX = ball.x;
  point.targetY = ball.y;
  point.targetVx = ball.vx || 0;
  point.targetVy = ball.vy || 0;
  point.gravitySide = ball.gravitySide || 1;
  point.receivedAt = stamp;
}

function feedFlipper(point, flipper, stamp) {
  if (!point.ready) {
    point.angle = flipper.angle;
    point.ready = true;
  }

  point.targetAngle = flipper.angle;
  point.angularVelocity = flipper.angularVelocity || 0;
  point.receivedAt = stamp;
}

function smoothBall(point, stamp, dt, sideGravity = 0) {
  if (!point.ready) return;

  const age = Math.min(120, Math.max(0, stamp - point.receivedAt)) / 1000;
  const ax = point.gravitySide * sideGravity;
  const predictedX = point.targetX + point.targetVx * age + 0.5 * ax * age * age;
  const predictedY = point.targetY + point.targetVy * age;
  const alpha = 1 - Math.exp(-25 * dt);

  point.x += (predictedX - point.x) * alpha;
  point.y += (predictedY - point.y) * alpha;
}

function smoothFlipper(point, stamp, dt) {
  if (!point.ready) return;

  const age = Math.min(110, Math.max(0, stamp - point.receivedAt)) / 1000;
  const predictedAngle = point.targetAngle + point.angularVelocity * age;
  const alpha = 1 - Math.exp(-27 * dt);

  point.angle += angleDelta(predictedAngle, point.angle) * alpha;
}

const StaticArena = memo(function StaticArena() {
  return (
    <>
      <defs>
        <linearGradient id="ppTable" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c02dc1" />
          <stop offset="55%" stopColor="#8f37b9" />
          <stop offset="100%" stopColor="#b93e97" />
        </linearGradient>

        <linearGradient id="ppFrame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4d55" />
          <stop offset="100%" stopColor="#24262d" />
        </linearGradient>

        <linearGradient id="ppGuide" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#79d34f" />
          <stop offset="100%" stopColor="#3d8c1b" />
        </linearGradient>

        <radialGradient id="ppBall" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff8d9" />
          <stop offset="55%" stopColor="#ffd888" />
          <stop offset="100%" stopColor="#f1a95a" />
        </radialGradient>
      </defs>

      <rect width="1200" height="700" fill="#3c3d43" />

      <path
        d="M210 68 H990 L1138 172 V528 L990 632 H210 L62 528 V172 Z"
        fill="url(#ppFrame)"
        stroke="#18191d"
        strokeWidth="18"
      />

      <path
        d="M210 86 H990 L1134 184 V516 L990 614 H210 L66 516 V184 Z"
        fill="url(#ppTable)"
        stroke="#1f1f24"
        strokeWidth="8"
      />

      <path d="M210 86 L600 350 L210 614" fill="rgba(255,255,255,0.07)" />
      <path d="M990 86 L600 350 L990 614" fill="rgba(255,255,255,0.06)" />

      <circle cx="600" cy="350" r="22" fill="#ffffff" opacity="0.16" />
      <circle cx="600" cy="350" r="9" fill="#fff1f8" opacity="0.92" />
      <circle cx="600" cy="86" r="30" fill="#f7e4ff" stroke="#c427be" strokeWidth="8" />
      <circle cx="600" cy="614" r="30" fill="#f7e4ff" stroke="#c427be" strokeWidth="8" />
      <circle cx="600" cy="86" r="11" fill="#a11397" />
      <circle cx="600" cy="614" r="11" fill="#a11397" />

      <path d="M66 298 H20 V402 H66" fill="#202127" stroke="#0e0f11" strokeWidth="8" />
      <path d="M1134 298 H1180 V402 H1134" fill="#202127" stroke="#0e0f11" strokeWidth="8" />

      <path d="M90 150 L175 249" fill="none" stroke="url(#ppGuide)" strokeWidth="18" strokeLinecap="round" />
      <path d="M90 550 L175 451" fill="none" stroke="url(#ppGuide)" strokeWidth="18" strokeLinecap="round" />
      <path d="M1110 150 L1025 249" fill="none" stroke="url(#ppGuide)" strokeWidth="18" strokeLinecap="round" />
      <path d="M1110 550 L1025 451" fill="none" stroke="url(#ppGuide)" strokeWidth="18" strokeLinecap="round" />

      <path d="M88 162 L167 256" fill="none" stroke="#244a16" strokeWidth="4" strokeLinecap="round" />
      <path d="M88 538 L167 444" fill="none" stroke="#244a16" strokeWidth="4" strokeLinecap="round" />
      <path d="M1112 162 L1033 256" fill="none" stroke="#244a16" strokeWidth="4" strokeLinecap="round" />
      <path d="M1112 538 L1033 444" fill="none" stroke="#244a16" strokeWidth="4" strokeLinecap="round" />

      <g opacity="0.18" stroke="#fff" strokeWidth="7" strokeLinecap="round">
        <path d="M600 350 L780 215" />
        <path d="M600 350 L770 300" />
        <path d="M600 350 L785 435" />
        <path d="M600 350 L420 215" />
        <path d="M600 350 L430 300" />
        <path d="M600 350 L415 435" />
      </g>
    </>
  );
});

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  const won = state.result?.winner === state.playerSeat;

  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || '',
  };
}

function FlipperShape({ mine, fighterRef }) {
  const stroke = mine ? '#f0505f' : '#46bee9';
  const pivot = mine ? '#cf102f' : '#168bb8';

  return (
    <g ref={fighterRef}>
      <rect
        x="0"
        y="-15"
        width="128"
        height="30"
        rx="15"
        fill="#f9fbff"
        stroke={stroke}
        strokeWidth="6"
      />
      <path d="M100 -12 L128 0 L100 12 Z" fill="#ffffff" stroke={stroke} strokeWidth="6" strokeLinejoin="round" />
      <circle cx="12" cy="0" r="11" fill="#ffffff" stroke={stroke} strokeWidth="6" />
      <circle cx="12" cy="0" r="4.5" fill={pivot} />
    </g>
  );
}

export default function PinPongDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const [pressedVisual, setPressedVisual] = useState(false);

  const stateRef = useRef(null);
  const sendActionRef = useRef(null);
  const canPressRef = useRef(false);
  const pressedRef = useRef(false);

  const ballRef = useRef(null);
  const flipperRefs = {
    aTop: useRef(null),
    aBottom: useRef(null),
    bTop: useRef(null),
    bBottom: useRef(null),
  };

  const ballMotion = useRef(createBallMotion());
  const flipperMotion = useRef({
    aTop: createFlipperMotion(),
    aBottom: createFlipperMotion(),
    bTop: createFlipperMotion(),
    bBottom: createFlipperMotion(),
  });

  const animationRef = useRef(null);
  const lastFrameRef = useRef(0);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('pin-pong-duel');

  stateRef.current = state;
  sendActionRef.current = sendAction;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const canPress = state?.status === 'playing' && state?.phase === 'playing';
  const mirrored = me === 'b';
  const result = resultPresentation(state);

  canPressRef.current = canPress;

  useEffect(() => {
    if (!state?.ball || !state?.flippers) return;

    const stamp = performance.now();

    feedBall(ballMotion.current, state.ball, stamp);

    for (const key of Object.keys(flipperMotion.current)) {
      feedFlipper(
        flipperMotion.current[key],
        state.flippers[key],
        stamp,
      );
    }
  }, [state?.ball, state?.flippers]);

  useEffect(() => {
    if (!state) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 150);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    function frame(stamp) {
      const dt = lastFrameRef.current
        ? clamp((stamp - lastFrameRef.current) / 1000, 0, 0.05)
        : 1 / 60;

      lastFrameRef.current = stamp;

      const snapshot = stateRef.current;

      smoothBall(ballMotion.current, stamp, dt, snapshot?.sideGravity || 0);

      for (const key of Object.keys(flipperMotion.current)) {
        smoothFlipper(flipperMotion.current[key], stamp, dt);
      }

      if (snapshot) {
        const flipX = snapshot.playerSeat === 'b';

        if (ballRef.current && ballMotion.current.ready) {
          const x = flipX ? WORLD_W - ballMotion.current.x : ballMotion.current.x;
          ballRef.current.setAttribute(
            'transform',
            `translate(${x.toFixed(2)} ${ballMotion.current.y.toFixed(2)})`,
          );
        }

        for (const [key, ref] of Object.entries(flipperRefs)) {
          const server = snapshot.flippers?.[key];
          const motion = flipperMotion.current[key];
          if (!server || !motion.ready || !ref.current) continue;

          const pivotX = flipX ? WORLD_W - server.pivotX : server.pivotX;
          const angle = flipX ? Math.PI - motion.angle : motion.angle;
          const rotation = (angle * 180) / Math.PI;

          ref.current.setAttribute(
            'transform',
            `translate(${pivotX.toFixed(2)} ${server.pivotY.toFixed(2)}) rotate(${rotation.toFixed(2)})`,
          );
        }
      }

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    function release() {
      if (!pressedRef.current) return;

      pressedRef.current = false;
      setPressedVisual(false);
      sendActionRef.current?.({ type: 'paddle', active: false });
    }

    function visibilityChange() {
      if (document.hidden) release();
    }

    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibilityChange);

    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibilityChange);
    };
  }, []);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space') return;
      if (event.repeat) return;
      if (event.target?.matches?.('input, textarea, select, button')) return;

      event.preventDefault();
      startPress();
    }

    function keyUp(event) {
      if (event.code !== 'Space') return;

      event.preventDefault();
      stopPress();
    }

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  });

  useEffect(() => {
    if (!canPress && pressedRef.current) {
      pressedRef.current = false;
      setPressedVisual(false);
    }
  }, [canPress]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function startPress() {
    if (!canPressRef.current || pressedRef.current) return;

    pressedRef.current = true;
    setPressedVisual(true);
    sendActionRef.current?.({ type: 'paddle', active: true });
  }

  function stopPress() {
    if (!pressedRef.current) return;

    pressedRef.current = false;
    setPressedVisual(false);
    sendActionRef.current?.({ type: 'paddle', active: false });
  }

  if (!state && !waiting) {
    return (
      <section className="pp-lobby">
        <div className="pp-lobby__icon">🏓⚡🏓</div>
        <span className="eyebrow">Физика · одна кнопка · до 2 голов</span>
        <h1>Пин-понг дуэль</h1>

        <p>
          Лопатки по умолчанию почти закрыты. Зажми кнопку — они раскрываются,
          и именно это движение отбивает мяч. Чем ближе попадание к кончику,
          тем сильнее удар.
        </p>

        <div className="pp-rules">
          <span>🏓 одна кнопка раскрывает две лопатки</span>
          <span>↔ каждая половина тянет мяч к своим воротам</span>
          <span>🥅 первым забей 2 гола</span>
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
      <section className="pp-waiting">
        <div className="pp-waiting__ball">●</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем соперника…</h2>
        <p>Подача начнётся автоматически.</p>

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

  const myScore = me ? state.scores?.[me] ?? 0 : 0;
  const foeScore = foe ? state.scores?.[foe] ?? 0 : 0;
  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';

  const countdown = state.phase === 'countdown'
    ? Math.max(1, Math.ceil((state.countdownEndsAt - now) / 500))
    : null;

  return (
    <section className="pp-shell">
      <header className="pp-scorebar">
        <div className="pp-player">
          <span className="pp-player__dot pp-player__dot--me" />
          <div>
            <small>{myName}</small>
            <strong>{myScore}</strong>
          </div>
        </div>

        <div className="pp-target">
          <small>ДО</small>
          <strong>{state.winsToMatch}</strong>
          <span>ГОЛОВ</span>
        </div>

        <div className="pp-player pp-player--right">
          <div>
            <small>{foeName}</small>
            <strong>{foeScore}</strong>
          </div>
          <span className="pp-player__dot pp-player__dot--foe" />
        </div>
      </header>

      <div className="pp-arena">
        <svg
          viewBox="0 0 1200 700"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <StaticArena />

          <g ref={ballRef} transform={`translate(${state.ball.x} ${state.ball.y})`}>
            <circle r="25" className="pp-ball-glow" />
            <circle r="18" fill="url(#ppBall)" className="pp-ball" />
            <circle cx="-5" cy="-5" r="5" className="pp-ball-highlight" />
          </g>

          <FlipperShape mine={me === 'a'} fighterRef={flipperRefs.aTop} />
          <FlipperShape mine={me === 'a'} fighterRef={flipperRefs.aBottom} />
          <FlipperShape mine={me === 'b'} fighterRef={flipperRefs.bTop} />
          <FlipperShape mine={me === 'b'} fighterRef={flipperRefs.bBottom} />
        </svg>

        {state.phase === 'countdown' && (
          <div className="pp-overlay">
            <span>ПОДАЧА</span>
            <strong>{countdown}</strong>
            <small>{state.roundMessage}</small>
          </div>
        )}

        {state.phase === 'goal' && (
          <div className="pp-overlay pp-overlay--goal">
            <span>ГОЛ!</span>
            <strong>{state.roundMessage}</strong>
            <small>{myScore}:{foeScore}</small>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`pp-hit ${pressedVisual ? 'is-active' : ''}`}
        disabled={!canPress}
        onPointerDown={(event) => {
          event.preventDefault();

          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // no-op
          }

          startPress();
        }}
        onPointerUp={(event) => {
          event.preventDefault();
          stopPress();
        }}
        onPointerCancel={stopPress}
        onLostPointerCapture={stopPress}
      >
        <span>✋</span>
        <b>{canPress ? 'ЗАЖМИ — РАСКРОЙ' : 'ПОДАЧА…'}</b>
        <small>отпусти — лопатки снова закроются</small>
      </button>

      <p className="pp-tip">
        Слабый удар не пересёк центр — гравитация утянет мяч назад. Кончик лопатки бьёт сильнее.
      </p>

      {result && (
        <div className="pp-result">
          <div className="pp-result__card">
            <span>Пин-понг дуэль</span>
            <div className="pp-result__icon">🏓</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>

            <div className="pp-result__score">
              <strong>{myScore}</strong>
              <span>:</span>
              <strong>{foeScore}</strong>
            </div>

            <div className="pp-result__actions">
              <button
                type="button"
                className="primary-button"
                onClick={findMatch}
              >
                Новый соперник
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={onBack}
              >
                Все игры
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
