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
        <linearGradient id="ppBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4b54" />
          <stop offset="100%" stopColor="#34353d" />
        </linearGradient>
        <linearGradient id="ppSide" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#990a95" />
          <stop offset="100%" stopColor="#b314aa" />
        </linearGradient>
        <linearGradient id="ppTable" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ab4aa7" />
          <stop offset="100%" stopColor="#b54db0" />
        </linearGradient>
        <linearGradient id="ppDarkTri" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a50895" />
          <stop offset="100%" stopColor="#b91dba" />
        </linearGradient>
        <radialGradient id="ppBall" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff8d9" />
          <stop offset="60%" stopColor="#ffe6bd" />
          <stop offset="100%" stopColor="#f1bc9c" />
        </radialGradient>
      </defs>
      <rect width="1200" height="700" fill="url(#ppBg)" />
      <rect x="0" y="221" width="1200" height="258" fill="url(#ppSide)" />
      <path d="M240 108 H960 L1090 196 V504 L960 592 H240 L110 504 V196 Z" fill="#101015" opacity="0.92" />
      <path d="M242 111 H958 L1083 197 V503 L958 589 H242 L117 503 V197 Z" fill="url(#ppTable)" />
      <path d="M243 111 L538 350 L243 589" fill="url(#ppDarkTri)" opacity="0.86" />
      <path d="M957 111 L662 350 L957 589" fill="url(#ppDarkTri)" opacity="0.86" />

      {/* Funnel walls are part of the table, not debug/green lines. */}
      <path d="M106 220 L180 292" className="pp-funnel-wall pp-funnel-wall--left" />
      <path d="M106 480 L180 408" className="pp-funnel-wall pp-funnel-wall--left" />
      <path d="M1094 220 L1020 292" className="pp-funnel-wall pp-funnel-wall--right" />
      <path d="M1094 480 L1020 408" className="pp-funnel-wall pp-funnel-wall--right" />
      <circle cx="600" cy="350" r="22" fill="#ffedd8" stroke="#c12b84" strokeWidth="10" opacity="0.98" />
      <circle cx="594" cy="344" r="5" fill="#ffffff" opacity="0.95" />
      <path d="M600 278 l16 34 h-32 z" fill="#f5a4ff" stroke="#9b2f95" strokeWidth="4" opacity="0.9" />
      <circle cx="600" cy="110" r="34" fill="#f7ebff" stroke="#c825c6" strokeWidth="7" />
      <circle cx="600" cy="590" r="34" fill="#f7ebff" stroke="#c825c6" strokeWidth="7" />
      <path d="M600 90 m-12 0 l8 -10 l8 10 l12 -4 l-2 12 l10 8 l-12 2 l-4 12 l-10 -8 l-10 8 l-4 -12 l-12 -2 l10 -8 l-2 -12 z" fill="#a61aa2" />
      <path d="M600 570 m-12 0 l8 -10 l8 10 l12 -4 l-2 12 l10 8 l-12 2 l-4 12 l-10 -8 l-10 8 l-4 -12 l-12 -2 l10 -8 l-2 -12 z" fill="#a61aa2" />
    </>
  );
});

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  if (state.result?.draw) {
    return {
      title: 'НИЧЬЯ',
      text: state.result?.message || 'Матч завершён вничью.',
    };
  }

  const won = state.result?.winner === state.playerSeat;

  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || '',
  };
}

function FlipperShape({ mine, fighterRef, initialTransform }) {
  const stroke = mine ? '#dd1d22' : '#2eaad4';
  const innerStroke = mine ? '#b91718' : '#2190b5';
  const pivotFill = mine ? '#ffebed' : '#effaff';

  return (
    <g ref={fighterRef} transform={initialTransform}>
      {/* SVG origin is the REAL hinge. This keeps visual and server physics identical. */}
      <path
        d="M8 -17 C28 -18, 62 -15, 116 -10 L132 0 L116 10 C62 15, 28 18, 8 17 Z"
        fill="#ffffff"
        stroke={stroke}
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <circle cx="0" cy="0" r="18" fill={pivotFill} stroke={stroke} strokeWidth="7" />
      <circle cx="0" cy="0" r="7" fill={innerStroke} />
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
  const aTopRef = useRef(null);
  const aBottomRef = useRef(null);
  const bTopRef = useRef(null);
  const bBottomRef = useRef(null);
  const flipperRefs = useRef({
    aTop: aTopRef,
    aBottom: aBottomRef,
    bTop: bTopRef,
    bBottom: bBottomRef,
  });

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
  const overheated = !!(me && state?.overheatedUntil?.[me] > Date.now());
  const canPress = state?.status === 'playing' && state?.phase === 'playing' && !overheated;
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
    if (!state || state.phase !== 'countdown') return undefined;

    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [state?.phase, state?.countdownEndsAt]);

  useEffect(() => {
    if (!state || state.status !== 'playing' || state.phase !== 'playing') {
      lastFrameRef.current = 0;
      return undefined;
    }

    let cancelled = false;

    function frame(stamp) {
      if (cancelled) return;

      // Safari/iPhone may throttle background tabs. Do no animation work there.
      if (document.hidden) {
        lastFrameRef.current = stamp;
        animationRef.current = requestAnimationFrame(frame);
        return;
      }

      const dt = lastFrameRef.current
        ? clamp((stamp - lastFrameRef.current) / 1000, 0, 0.034)
        : 1 / 60;

      lastFrameRef.current = stamp;
      const snapshot = stateRef.current;

      if (!snapshot || snapshot.status !== 'playing' || snapshot.phase !== 'playing') {
        animationRef.current = requestAnimationFrame(frame);
        return;
      }

      smoothBall(ballMotion.current, stamp, dt, snapshot.sideGravity || 0);

      for (const key of Object.keys(flipperMotion.current)) {
        smoothFlipper(flipperMotion.current[key], stamp, dt);
      }

      const flipX = snapshot.playerSeat === 'b';

      if (ballRef.current && ballMotion.current.ready) {
        const x = flipX ? WORLD_W - ballMotion.current.x : ballMotion.current.x;
        ballRef.current.setAttribute(
          'transform',
          `translate(${x.toFixed(2)} ${ballMotion.current.y.toFixed(2)})`,
        );
      }

      for (const [key, ref] of Object.entries(flipperRefs.current)) {
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

      animationRef.current = requestAnimationFrame(frame);
    }

    lastFrameRef.current = 0;
    animationRef.current = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      lastFrameRef.current = 0;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [state?.status, state?.phase]);

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
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target?.matches?.('input, textarea, select, button')) return;
      event.preventDefault();

      if (!canPressRef.current || pressedRef.current) return;
      pressedRef.current = true;
      setPressedVisual(true);
      sendActionRef.current?.({ type: 'paddle', active: true });
    }

    function keyUp(event) {
      if (event.code !== 'Space') return;
      event.preventDefault();

      if (!pressedRef.current) return;
      pressedRef.current = false;
      setPressedVisual(false);
      sendActionRef.current?.({ type: 'paddle', active: false });
    }

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, []);

  useEffect(() => {
    if (!canPress && pressedRef.current) {
      pressedRef.current = false;
      setPressedVisual(false);
    }
  }, [canPress]);

  useEffect(() => {
    return () => {
      if (pressedRef.current) {
        pressedRef.current = false;
        sendActionRef.current?.({ type: 'paddle', active: false });
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, []);

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
        <span className="eyebrow">Физика · одна кнопка · до 3 голов</span>
        <h1>Пин-понг дуэль</h1>

        <p>
          Лопатки по умолчанию почти закрыты. Зажми кнопку — они раскрываются,
          и именно это движение отбивает мяч. Чем ближе попадание к кончику,
          тем сильнее удар.
        </p>

        <div className="pp-rules">
          <span>🏓 одна кнопка раскрывает две лопатки</span>
          <span>↔ каждая половина тянет мяч к своим воротам</span>
          <span>🥅 первым забей 3 гола</span>
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

          <FlipperShape mine={me === 'a'} fighterRef={aTopRef} initialTransform={`translate(${mirrored ? WORLD_W - state.flippers.aTop.pivotX : state.flippers.aTop.pivotX} ${state.flippers.aTop.pivotY}) rotate(${((mirrored ? Math.PI - state.flippers.aTop.angle : state.flippers.aTop.angle) * 180) / Math.PI})`} />
          <FlipperShape mine={me === 'a'} fighterRef={aBottomRef} initialTransform={`translate(${mirrored ? WORLD_W - state.flippers.aBottom.pivotX : state.flippers.aBottom.pivotX} ${state.flippers.aBottom.pivotY}) rotate(${((mirrored ? Math.PI - state.flippers.aBottom.angle : state.flippers.aBottom.angle) * 180) / Math.PI})`} />
          <FlipperShape mine={me === 'b'} fighterRef={bTopRef} initialTransform={`translate(${mirrored ? WORLD_W - state.flippers.bTop.pivotX : state.flippers.bTop.pivotX} ${state.flippers.bTop.pivotY}) rotate(${((mirrored ? Math.PI - state.flippers.bTop.angle : state.flippers.bTop.angle) * 180) / Math.PI})`} />
          <FlipperShape mine={me === 'b'} fighterRef={bBottomRef} initialTransform={`translate(${mirrored ? WORLD_W - state.flippers.bBottom.pivotX : state.flippers.bBottom.pivotX} ${state.flippers.bBottom.pivotY}) rotate(${((mirrored ? Math.PI - state.flippers.bBottom.angle : state.flippers.bBottom.angle) * 180) / Math.PI})`} />
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
        <b>{overheated ? 'ПЕРЕГРЕВ — ВОРОТА ЗАКРЫТЫ' : canPress ? 'ЗАЖМИ — РАСКРОЙ' : 'ПОДАЧА…'}</b>
        <small>{overheated ? 'секунда на охлаждение' : `нагрев ${me ? state.heat?.[me] ?? 0 : 0}% · отпусти — закроются`}</small>
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
