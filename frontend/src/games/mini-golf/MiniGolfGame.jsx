import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './mini-golf.css';

const CLIENT_BALL_RADIUS = 16;
const MIN_SHOT_SPEED = 120;
const MAX_SHOT_SPEED = 930;
const STOP_SPEED = 18;
const GRASS_DECEL = 132;
const SAND_DECEL = 520;

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

function createMotionPoint() {
  return { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, tvx: 0, tvy: 0, ready: false, receivedAt: 0 };
}

function feedMotion(point, next, now = performance.now()) {
  if (!point || !next) return;
  if (!point.ready) {
    point.x = next.x;
    point.y = next.y;
    point.ready = true;
  }
  point.tx = next.x;
  point.ty = next.y;
  point.tvx = next.vx || 0;
  point.tvy = next.vy || 0;
  point.receivedAt = now;
}

function smoothMotion(point, now, dt, strength = 30, predictMs = 42) {
  if (!point?.ready) return;
  const age = Math.min(predictMs, Math.max(0, now - point.receivedAt)) / 1000;
  const tx = point.tx + point.tvx * age;
  const ty = point.ty + point.tvy * age;
  const alpha = 1 - Math.exp(-strength * dt);
  point.x += (tx - point.x) * alpha;
  point.y += (ty - point.y) * alpha;
}

function pointInZone(point, zone) {
  return point.x >= zone.x && point.x <= zone.x + zone.w && point.y >= zone.y && point.y <= zone.y + zone.h;
}

function collideRect(ball, obstacle, radius) {
  const closestX = clamp(ball.x, obstacle.x, obstacle.x + obstacle.w);
  const closestY = clamp(ball.y, obstacle.y, obstacle.y + obstacle.h);
  let dx = ball.x - closestX;
  let dy = ball.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= radius * radius) return;

  let nx = 0;
  let ny = 0;
  let penetration = 0;
  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
    penetration = radius - dist;
  } else {
    const left = Math.abs(ball.x - obstacle.x);
    const right = Math.abs(obstacle.x + obstacle.w - ball.x);
    const top = Math.abs(ball.y - obstacle.y);
    const bottom = Math.abs(obstacle.y + obstacle.h - ball.y);
    const min = Math.min(left, right, top, bottom);
    if (min === left) { nx = -1; penetration = radius + left; }
    else if (min === right) { nx = 1; penetration = radius + right; }
    else if (min === top) { ny = -1; penetration = radius + top; }
    else { ny = 1; penetration = radius + bottom; }
  }

  ball.x += nx * (penetration + 0.5);
  ball.y += ny * (penetration + 0.5);
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    const restitution = obstacle.restitution ?? 0.78;
    ball.vx -= (1 + restitution) * vn * nx;
    ball.vy -= (1 + restitution) * vn * ny;
  }
}

function collideCircle(ball, obstacle, radius) {
  const dx = ball.x - obstacle.x;
  const dy = ball.y - obstacle.y;
  const minDist = radius + obstacle.r;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return;
  const dist = Math.sqrt(Math.max(distSq, 1e-9));
  const nx = distSq < 1e-9 ? 1 : dx / dist;
  const ny = distSq < 1e-9 ? 0 : dy / dist;
  ball.x += nx * (minDist - dist + 0.5);
  ball.y += ny * (minDist - dist + 0.5);
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    const restitution = obstacle.restitution ?? 0.94;
    ball.vx -= (1 + restitution) * vn * nx;
    ball.vy -= (1 + restitution) * vn * ny;
    if (obstacle.kind === 'bumper') {
      const speed = Math.hypot(ball.vx, ball.vy);
      const target = Math.min(1020, Math.max(speed + 35, speed * 1.065));
      if (speed > 1) {
        const scale = target / speed;
        ball.vx *= scale;
        ball.vy *= scale;
      }
    }
  }
}

function predictShot(course, field, ball, angle, power) {
  if (!course || !field || !ball || power <= 0) return [];
  const radius = field.ballRadius || CLIENT_BALL_RADIUS;
  const speed = MIN_SHOT_SPEED + (MAX_SHOT_SPEED - MIN_SHOT_SPEED) * Math.pow(clamp(power, 0.08, 1), 1.08);
  const sim = { x: ball.x, y: ball.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  const points = [{ x: sim.x, y: sim.y }];
  const dt = 0.025;

  for (let step = 0; step < 74; step += 1) {
    sim.x += sim.vx * dt;
    sim.y += sim.vy * dt;

    const minX = 20 + radius;
    const maxX = field.width - 20 - radius;
    const minY = 20 + radius;
    const maxY = field.height - 20 - radius;
    if (sim.x < minX) { sim.x = minX + (minX - sim.x); sim.vx = Math.abs(sim.vx) * 0.78; }
    if (sim.x > maxX) { sim.x = maxX - (sim.x - maxX); sim.vx = -Math.abs(sim.vx) * 0.78; }
    if (sim.y < minY) { sim.y = minY + (minY - sim.y); sim.vy = Math.abs(sim.vy) * 0.78; }
    if (sim.y > maxY) { sim.y = maxY - (sim.y - maxY); sim.vy = -Math.abs(sim.vy) * 0.78; }

    for (const obstacle of course.obstacles || []) {
      if (obstacle.shape === 'circle') collideCircle(sim, obstacle, radius);
      else collideRect(sim, obstacle, radius);
    }

    let currentSpeed = Math.hypot(sim.vx, sim.vy);
    const inSand = (course.sand || []).some((zone) => pointInZone(sim, zone));
    currentSpeed = Math.max(0, currentSpeed - (inSand ? SAND_DECEL : GRASS_DECEL) * dt);
    if (currentSpeed <= STOP_SPEED) break;
    const raw = Math.hypot(sim.vx, sim.vy) || 1;
    sim.vx *= currentSpeed / raw;
    sim.vy *= currentSpeed / raw;

    if (step % 3 === 2) points.push({ x: sim.x, y: sim.y });
  }

  return points;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const winner = state.result?.winner ?? null;
  const won = winner && winner === state.playerSeat;
  const draw = !winner;
  return {
    won,
    draw,
    title: draw ? 'НИЧЬЯ' : won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || 'Матч завершён.',
  };
}

function Obstacle({ obstacle }) {
  if (obstacle.shape === 'circle') {
    return (
      <g className="mg-bumper">
        <circle cx={obstacle.x} cy={obstacle.y + 6} r={obstacle.r + 4} className="mg-bumper__shadow" />
        <circle cx={obstacle.x} cy={obstacle.y} r={obstacle.r} className="mg-bumper__outer" />
        <circle cx={obstacle.x} cy={obstacle.y} r={obstacle.r - 11} className="mg-bumper__inner" />
        <circle cx={obstacle.x - 10} cy={obstacle.y - 11} r="8" className="mg-bumper__shine" />
      </g>
    );
  }

  const { x, y, w, h, kind } = obstacle;
  if (kind === 'hedge') {
    const bulbs = Math.max(2, Math.floor(w > h ? w / 42 : h / 42));
    return (
      <g className="mg-hedge">
        <rect x={x} y={y + 7} width={w} height={h} rx={Math.min(18, Math.min(w, h) / 2)} className="mg-obstacle-shadow" />
        <rect x={x} y={y} width={w} height={h} rx={Math.min(18, Math.min(w, h) / 2)} className="mg-hedge__body" />
        {Array.from({ length: bulbs }).map((_, index) => {
          const horizontal = w > h;
          const cx = horizontal ? x + ((index + .5) / bulbs) * w : x + w * .5;
          const cy = horizontal ? y + h * .5 : y + ((index + .5) / bulbs) * h;
          return <circle key={index} cx={cx} cy={cy} r={Math.min(18, Math.min(w, h) * .34)} className="mg-hedge__leaf" />;
        })}
      </g>
    );
  }

  if (kind === 'wall' || kind === 'fort') {
    const isFort = kind === 'fort';
    return (
      <g className={isFort ? 'mg-fort' : 'mg-wall'}>
        <rect x={x} y={y + 7} width={w} height={h} rx="10" className="mg-obstacle-shadow" />
        <rect x={x} y={y} width={w} height={h} rx="9" className={isFort ? 'mg-fort__body' : 'mg-wall__body'} />
        <path d={`M${x + 10} ${y + h * .35} H${x + w - 10} M${x + 10} ${y + h * .68} H${x + w - 10}`} className={isFort ? 'mg-fort__mortar' : 'mg-wall__mortar'} />
      </g>
    );
  }

  if (kind === 'crate') {
    return (
      <g className="mg-crate">
        <rect x={x} y={y + 7} width={w} height={h} rx="9" className="mg-obstacle-shadow" />
        <rect x={x} y={y} width={w} height={h} rx="8" className="mg-crate__body" />
        <path d={`M${x + 12} ${y + 10} L${x + w - 12} ${y + h - 10} M${x + w - 12} ${y + 10} L${x + 12} ${y + h - 10}`} className="mg-crate__x" />
      </g>
    );
  }

  if (kind === 'log') {
    return (
      <g className="mg-log">
        <rect x={x} y={y + 7} width={w} height={h} rx={Math.min(22, h / 2)} className="mg-obstacle-shadow" />
        <rect x={x} y={y} width={w} height={h} rx={Math.min(22, h / 2)} className="mg-log__body" />
        <path d={`M${x + 20} ${y + 8} L${x + w - 20} ${y + h - 8}`} className="mg-log__grain" />
      </g>
    );
  }

  return (
    <g className="mg-stone">
      <rect x={x} y={y + 7} width={w} height={h} rx="16" className="mg-obstacle-shadow" />
      <rect x={x} y={y} width={w} height={h} rx="16" className="mg-stone__body" />
      <path d={`M${x + 14} ${y + h * .35} Q${x + w * .5} ${y + h * .12} ${x + w - 16} ${y + h * .45}`} className="mg-stone__shine" />
    </g>
  );
}

function Decoration({ item }) {
  if (item.type === 'tree') {
    return (
      <g transform={`translate(${item.x} ${item.y}) scale(${item.s || 1})`} className="mg-tree">
        <ellipse cx="3" cy="18" rx="34" ry="13" className="mg-deco-shadow" />
        <rect x="-5" y="4" width="10" height="28" rx="4" className="mg-tree__trunk" />
        <circle cx="0" cy="-14" r="28" className="mg-tree__crown" />
        <circle cx="-18" cy="-1" r="18" className="mg-tree__crown mg-tree__crown--dark" />
        <circle cx="18" cy="-3" r="17" className="mg-tree__crown mg-tree__crown--light" />
      </g>
    );
  }
  if (item.type === 'rock') {
    return <ellipse cx={item.x} cy={item.y} rx={27 * (item.s || 1)} ry={19 * (item.s || 1)} className="mg-deco-rock" />;
  }
  return (
    <g transform={`translate(${item.x} ${item.y}) scale(${item.s || 1})`} className="mg-flower">
      <circle cx="0" cy="0" r="5" />
      <circle cx="8" cy="0" r="5" />
      <circle cx="4" cy="-7" r="5" />
      <circle cx="4" cy="7" r="5" />
      <circle cx="4" cy="0" r="3" className="mg-flower__center" />
    </g>
  );
}

export default function MiniGolfGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [aim, setAim] = useState(null);
  const arenaRef = useRef(null);
  const mineRef = useRef(null);
  const opponentRef = useRef(null);
  const lastFrameRef = useRef(0);
  const rafRef = useRef(null);
  const stateRef = useRef(null);
  const motionRef = useRef({ a: createMotionPoint(), b: createMotionPoint() });
  const pointerIdRef = useRef(null);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('mini-golf');

  const field = state?.field;
  const course = state?.course;
  const mySeat = state?.playerSeat;
  const opponentSeat = state?.opponentSeat;
  const mine = mySeat ? state?.balls?.[mySeat] : null;
  const opponent = opponentSeat ? state?.balls?.[opponentSeat] : null;
  const myTurn = state?.status === 'playing' && state?.phase === 'aim' && state?.currentTurn === mySeat && mine && !mine.done;
  const result = resultPresentation(state);

  useEffect(() => {
    stateRef.current = state || null;
    if (!state?.balls) return;
    const now = performance.now();
    for (const seat of ['a', 'b']) {
      const ball = state.balls[seat];
      if (ball) feedMotion(motionRef.current[seat], ball, now);
    }
  }, [state]);

  useEffect(() => {
    function frame(now) {
      let dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 1 / 60;
      lastFrameRef.current = now;
      dt = clamp(dt, 0, 0.05);
      const current = stateRef.current;
      if (current?.balls) {
        smoothMotion(motionRef.current.a, now, dt, 31, 42);
        smoothMotion(motionRef.current.b, now, dt, 31, 42);
        if (mineRef.current && current.playerSeat) {
          const p = motionRef.current[current.playerSeat];
          mineRef.current.setAttribute('transform', `translate(${p.x} ${p.y})`);
        }
        if (opponentRef.current && current.opponentSeat) {
          const p = motionRef.current[current.opponentSeat];
          opponentRef.current.setAttribute('transform', `translate(${p.x} ${p.y})`);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (!myTurn) {
      pointerIdRef.current = null;
      setAim(null);
    }
  }, [myTurn, state?.courseNumber]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function pointerToField(event) {
    const arena = arenaRef.current;
    if (!arena || !field) return null;
    const rect = arena.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * field.width, 0, field.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * field.height, 0, field.height),
    };
  }

  function buildAim(event) {
    const arena = arenaRef.current;
    if (!mine || !arena || !field) return null;
    const rect = arena.getBoundingClientRect();
    const ballX = rect.left + (mine.x / field.width) * rect.width;
    const ballY = rect.top + (mine.y / field.height) * rect.height;
    const dxPx = event.clientX - ballX;
    const dyPx = event.clientY - ballY;
    const distancePx = Math.hypot(dxPx, dyPx);
    const maxDragPx = clamp(rect.width * 0.30, 92, 132);
    const normalized = clamp(distancePx / maxDragPx, 0, 1);
    const power = Math.pow(normalized, 0.86);
    const angle = Math.atan2(dyPx, dxPx);
    const shownPx = Math.min(distancePx, maxDragPx);
    const shownFieldX = (Math.cos(angle) * shownPx / rect.width) * field.width;
    const shownFieldY = (Math.sin(angle) * shownPx / rect.height) * field.height;
    return {
      pointerX: mine.x + shownFieldX,
      pointerY: mine.y + shownFieldY,
      angle,
      power,
    };
  }

  function pointerDown(event) {
    if (!myTurn || !mine || !arenaRef.current || !field) return;
    const rect = arenaRef.current.getBoundingClientRect();
    const ballX = rect.left + (mine.x / field.width) * rect.width;
    const ballY = rect.top + (mine.y / field.height) * rect.height;
    const distancePx = Math.hypot(event.clientX - ballX, event.clientY - ballY);
    if (distancePx > 46) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setAim(buildAim(event));
  }

  function pointerMove(event) {
    if (pointerIdRef.current !== event.pointerId || !myTurn) return;
    event.preventDefault();
    setAim(buildAim(event));
  }

  function pointerUp(event) {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const currentAim = aim;
    pointerIdRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setAim(null);
    if (!currentAim || currentAim.power < 0.08) return;
    sendAction({ type: 'shoot', angle: currentAim.angle, power: currentAim.power });
  }

  function pointerCancel(event) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    setAim(null);
  }

  const prediction = useMemo(() => {
    if (!aim || !mine || !course || !field) return [];
    return predictShot(course, field, mine, aim.angle, aim.power);
  }, [aim, mine, course, field]);

  if (!state && !waiting) {
    return (
      <section className="mg-lobby">
        <div className="mg-lobby__icon">⛳</div>
        <span className="eyebrow">5 лунок · коридоры · физика рикошетов · игра по очереди</span>
        <h1>Мини-гольф</h1>
        <p>
          Зажми свой мяч и веди палец прямо в сторону удара. Чем дальше ведёшь — тем сильнее удар.
          Теперь это пять настоящих дорожек-лабиринтов: коридоры, стены, песок и отбойные стойки.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="mg-waiting">
        <div className="mg-waiting__ball">●</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго гольфиста…</h2>
        <p>Матч начнётся автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const myName = state.players?.[mySeat]?.name || playerName;
  const opponentName = state.players?.[opponentSeat]?.name || 'Соперник';
  const myHoleWins = state.holeWins?.[mySeat] ?? 0;
  const opponentHoleWins = state.holeWins?.[opponentSeat] ?? 0;
  const myTotal = state.totalStrokes?.[mySeat] ?? 0;
  const opponentTotal = state.totalStrokes?.[opponentSeat] ?? 0;
  const myLiveTotal = myTotal + (state.phase === 'hole-over' ? 0 : (mine?.scoreForHole ?? mine?.strokes ?? 0));
  const opponentLiveTotal = opponentTotal + (state.phase === 'hole-over' ? 0 : (opponent?.scoreForHole ?? opponent?.strokes ?? 0));
  const turnText = state.phase === 'moving'
    ? (state.movingSeat === mySeat ? 'ТВОЙ МЯЧ В ДВИЖЕНИИ' : 'МЯЧ СОПЕРНИКА В ДВИЖЕНИИ')
    : myTurn ? 'ТВОЙ ХОД' : 'ХОД СОПЕРНИКА';

  return (
    <section className="mg-game">
      <div className="mg-topbar">
        <div className="mg-player-card mg-player-card--mine">
          <span className="mg-player-dot" />
          <div><small>Ты</small><strong>{myName}</strong></div>
          <b>{myHoleWins}</b>
        </div>
        <div className="mg-course-title">
          <small>Лунка {state.courseNumber}/{state.courseCount} · PAR {course.par}</small>
          <strong>{course.name}</strong>
          <span>{course.subtitle}</span>
        </div>
        <div className="mg-player-card mg-player-card--opponent">
          <b>{opponentHoleWins}</b>
          <div><small>Соперник</small><strong>{opponentName}</strong></div>
          <span className="mg-player-dot" />
        </div>
      </div>

      <div className={`mg-turn ${myTurn ? 'is-mine' : ''}`}>{turnText}</div>

      <div className="mg-course-shell">
        <svg
          ref={arenaRef}
          className="mg-course"
          viewBox={`0 0 ${field.width} ${field.height}`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerCancel}
          onLostPointerCapture={pointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          role="img"
          aria-label={`Мини-гольф: ${course.name}`}
        >
          <defs>
            <linearGradient id="mg-grass" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#56a84b" />
              <stop offset="1" stopColor="#2f7a39" />
            </linearGradient>
            <linearGradient id="mg-fairway" x1="0" x2="1">
              <stop offset="0" stopColor="#82c967" />
              <stop offset=".5" stopColor="#72bd5c" />
              <stop offset="1" stopColor="#8bd06c" />
            </linearGradient>
            <radialGradient id="mg-my-ball" cx="35%" cy="30%" r="70%">
              <stop offset="0" stopColor="#fff6ce" />
              <stop offset=".4" stopColor="#ffdb54" />
              <stop offset="1" stopColor="#e89013" />
            </radialGradient>
            <radialGradient id="mg-op-ball" cx="35%" cy="30%" r="70%">
              <stop offset="0" stopColor="#e7f8ff" />
              <stop offset=".42" stopColor="#69c9ff" />
              <stop offset="1" stopColor="#2570c9" />
            </radialGradient>
            <filter id="mg-ball-shadow" x="-150%" y="-150%" width="400%" height="400%">
              <feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity=".32" />
            </filter>
          </defs>

          <rect x="0" y="0" width={field.width} height={field.height} rx="35" fill="url(#mg-grass)" />
          <g className="mg-mow-lines">
            {Array.from({ length: 12 }).map((_, index) => (
              <rect key={index} x={index * 100} y="0" width="50" height={field.height} />
            ))}
          </g>

          <path d={course.fairway} className="mg-fairway" />
          <path d={course.fairway} className="mg-fairway-highlight" />

          {(course.sand || []).map((zone, index) => (
            <g key={`sand-${index}`} className="mg-sand">
              <rect x={zone.x} y={zone.y + 7} width={zone.w} height={zone.h} rx={zone.rx || 30} className="mg-sand__shadow" />
              <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx={zone.rx || 30} className="mg-sand__body" />
              <path d={`M${zone.x + 18} ${zone.y + zone.h * .34} Q${zone.x + zone.w * .5} ${zone.y + zone.h * .08} ${zone.x + zone.w - 18} ${zone.y + zone.h * .42}`} className="mg-sand__ripple" />
            </g>
          ))}

          {(course.decorations || []).map((item, index) => <Decoration key={`deco-${index}`} item={item} />)}
          {(course.obstacles || []).map((obstacle, index) => <Obstacle key={`ob-${index}`} obstacle={obstacle} />)}

          <g className="mg-hole" transform={`translate(${course.hole.x} ${course.hole.y})`}>
            <ellipse cx="0" cy="4" rx={field.holeRadius + 6} ry={field.holeRadius * .55} className="mg-hole__rim" />
            <ellipse cx="0" cy="4" rx={field.holeRadius} ry={field.holeRadius * .46} className="mg-hole__dark" />
            <line x1="0" y1="1" x2="0" y2="-102" className="mg-flagpole" />
            <path d="M2 -100 L62 -82 L2 -64 Z" className="mg-flag" />
          </g>

          {aim && (
            <g className="mg-aim" pointerEvents="none">
              <line x1={mine.x} y1={mine.y} x2={aim.pointerX} y2={aim.pointerY} className="mg-pull-line" />
              {prediction.map((point, index) => (
                <circle
                  key={`prediction-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={index === 0 ? 4 : Math.max(2.6, 5 - index * .08)}
                  className="mg-prediction-dot"
                  opacity={Math.max(.16, 1 - index / Math.max(1, prediction.length))}
                />
              ))}
              <g transform={`translate(${mine.x} ${mine.y}) rotate(${aim.angle * 180 / Math.PI})`}>
                <path d={`M24 0 L${74 + aim.power * 150} 0`} className="mg-direction-line" />
                <path d={`M${70 + aim.power * 150} -14 L${98 + aim.power * 150} 0 L${70 + aim.power * 150} 14 Z`} className="mg-direction-arrow" />
              </g>
            </g>
          )}

          <g ref={opponentRef} className={`mg-ball mg-ball--opponent ${opponent?.sunk ? 'is-sunk' : ''}`} filter="url(#mg-ball-shadow)">
            <circle r={field.ballRadius + 4} className="mg-ball__outline" />
            <circle r={field.ballRadius} fill="url(#mg-op-ball)" />
            <circle cx="-5" cy="-6" r="4.5" className="mg-ball__shine" />
          </g>

          <g ref={mineRef} className={`mg-ball mg-ball--mine ${mine?.sunk ? 'is-sunk' : ''}`} filter="url(#mg-ball-shadow)">
            <circle r={field.ballRadius + 5} className="mg-ball__outline" />
            <circle r={field.ballRadius} fill="url(#mg-my-ball)" />
            <circle cx="-5" cy="-6" r="4.5" className="mg-ball__shine" />
          </g>

          <rect x="12" y="12" width={field.width - 24} height={field.height - 24} rx="30" className="mg-edge" />
        </svg>

        {myTurn && !aim && <div className="mg-hint">Зажми жёлтый мяч и веди палец в сторону удара</div>}

        {state.phase === 'hole-over' && state.holeResult && (
          <div className="mg-hole-banner">
            <strong>{state.holeResult.winner === mySeat ? 'ЛУНКА ТВОЯ' : state.holeResult.winner ? 'ЛУНКА СОПЕРНИКА' : 'ЛУНКА ВНИЧЬЮ'}</strong>
            <small>{state.holeResult.message}</small>
          </div>
        )}
      </div>

      <div className="mg-stats">
        <div><small>Твои удары</small><strong>{mine?.strokes ?? 0}/{state.maxStrokes}</strong></div>
        <div><small>Всего ударов</small><strong>{myLiveTotal} : {opponentLiveTotal}</strong></div>
        <div><small>Удары соперника</small><strong>{opponent?.strokes ?? 0}/{state.maxStrokes}</strong></div>
      </div>

      <div className="mg-legend">
        <span><i className="mg-legend__sand" />Песок сильно тормозит</span>
        <span><i className="mg-legend__bumper" />Стойка даёт жёсткий рикошет</span>
        <span><i className="mg-legend__wall" />Ящики, камни и брёвна — твёрдые</span>
        <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти из матча</button>
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="mg-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`mg-result ${result.won ? 'is-win' : result.draw ? 'is-draw' : 'is-lose'}`}>
            <div className="mg-result__cup">🏆</div>
            <span className="eyebrow">{state.courseCount} лунок завершены · {myHoleWins}:{opponentHoleWins}</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="mg-result__score">Удары: <b>{myTotal}</b> — <b>{opponentTotal}</b></div>
            <div className="mg-result__actions">
              <button className="primary-button" onClick={onBack}>В главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Новый соперник</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
