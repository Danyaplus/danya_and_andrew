import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './drift-race.css';

const WORLD_W = 1200;
const WORLD_H = 720;
const TAU = Math.PI * 2;
const KEY_TURN_DEG_PER_SEC = 260;

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= TAU;
  while (value < -Math.PI) value += TAU;
  return value;
}

function nearestEquivalentDeg(angleRad, currentDeg) {
  const base = angleRad * 180 / Math.PI;
  return base + Math.round((currentDeg - base) / 360) * 360;
}

function angleDelta(target, current) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function motionPoint() {
  return { x: 0, y: 0, heading: 0, vx: 0, vy: 0, tx: 0, ty: 0, th: 0, tvx: 0, tvy: 0, receivedAt: 0, ready: false };
}

function feedMotion(motion, car, stamp) {
  if (!motion.ready) {
    motion.x = car.x;
    motion.y = car.y;
    motion.heading = car.heading;
    motion.ready = true;
  }
  motion.tx = car.x;
  motion.ty = car.y;
  motion.th = car.heading;
  motion.tvx = car.vx || 0;
  motion.tvy = car.vy || 0;
  motion.receivedAt = stamp;
}

function smoothMotion(motion, stamp, dt) {
  if (!motion.ready) return;
  const age = Math.min(72, Math.max(0, stamp - motion.receivedAt)) / 1000;
  const px = motion.tx + motion.tvx * age;
  const py = motion.ty + motion.tvy * age;
  const alpha = 1 - Math.exp(-24 * dt);
  motion.x += (px - motion.x) * alpha;
  motion.y += (py - motion.y) * alpha;
  motion.heading += angleDelta(motion.th, motion.heading) * (1 - Math.exp(-20 * dt));
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function trackPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

function closestDistance(x, y, points) {
  let best = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby || 1;
    const t = clamp(((x - a[0]) * abx + (y - a[1]) * aby) / lenSq, 0, 1);
    const px = a[0] + abx * t;
    const py = a[1] + aby * t;
    best = Math.min(best, Math.hypot(x - px, y - py));
  }
  return best;
}

function seeded(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawDecoration(ctx, x, y, size, themeId, accent) {
  ctx.save();
  ctx.translate(x, y);
  if (themeId === 'violet-tunnel') {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(113,221,255,.45)';
    ctx.fillRect(-size * .16, -size * .55, size * .32, size * 1.1);
    ctx.fillStyle = 'rgba(255,78,201,.34)';
    ctx.fillRect(-size * .5, -size * .13, size, size * .26);
  } else if (themeId === 'harbor-chicane') {
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.beginPath(); ctx.arc(0, 0, size * .26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-size * .34, 0); ctx.lineTo(size * .34, 0); ctx.stroke();
  } else if (themeId === 'red-canyon') {
    ctx.fillStyle = 'rgba(111,64,42,.48)';
    ctx.beginPath();
    ctx.moveTo(-size * .48, size * .28); ctx.lineTo(-size * .1, -size * .45); ctx.lineTo(size * .46, size * .12); ctx.lineTo(size * .18, size * .42); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(3, size * .12);
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size * .43, Math.sin(a) * size * .43);
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(0, 0, size * .13, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTrackArrow(ctx, x, y, angle, alpha = .12) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff7ed';
  ctx.beginPath();
  ctx.moveTo(-24, -12);
  ctx.lineTo(8, -12);
  ctx.lineTo(8, -22);
  ctx.lineTo(32, 0);
  ctx.lineTo(8, 22);
  ctx.lineTo(8, 12);
  ctx.lineTo(-24, 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSandWaves(ctx) {
  ctx.save();
  ctx.strokeStyle = 'rgba(146,123,86,.13)';
  ctx.lineWidth = 3;
  for (let y = -25; y <= WORLD_H + 25; y += 26) {
    ctx.beginPath();
    for (let x = -30; x <= WORLD_W + 30; x += 12) {
      const yy = y + Math.sin((x * .065) + y * .018) * 6;
      if (x === -30) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawObstacle(ctx, obstacle) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.18)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;

  if (obstacle.shape === 'circle') {
    const { x, y, r, kind } = obstacle;
    if (kind === 'palm') {
      ctx.translate(x, y);
      for (let i = 0; i < 6; i += 1) {
        ctx.rotate(Math.PI / 3);
        ctx.fillStyle = i % 2 ? '#2dcc70' : '#22b861';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(r * .15, -r * .85, 0, -r * 1.22);
        ctx.quadraticCurveTo(-r * .2, -r * .85, 0, 0);
        ctx.fill();
      }
      ctx.fillStyle = '#94d6a8';
      ctx.beginPath(); ctx.arc(0, 0, r * .23, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'crystal') {
      ctx.fillStyle = '#5ae7ff';
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .72, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .72, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff66dc';
      ctx.beginPath(); ctx.moveTo(x, y - r * .68); ctx.lineTo(x + r * .22, y - 1); ctx.lineTo(x - 1, y + r * .18); ctx.closePath(); ctx.fill();
    } else if (kind === 'tire') {
      ctx.fillStyle = '#15171c'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#555b64'; ctx.beginPath(); ctx.arc(x, y, r * .52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#242830'; ctx.beginPath(); ctx.arc(x, y, r * .25, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#9db2bc';
      ctx.beginPath();
      ctx.moveTo(x - r * .95, y + r * .15);
      ctx.lineTo(x - r * .3, y - r * .95);
      ctx.lineTo(x + r * .8, y - r * .6);
      ctx.lineTo(x + r, y + r * .2);
      ctx.lineTo(x + r * .15, y + r * .95);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.arc(x - r * .15, y - r * .22, r * .33, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const { x, y, w, h, kind } = obstacle;
    roundedRect(ctx, x, y, w, h, Math.min(9, h * .2));
    if (kind === 'barrier') {
      ctx.fillStyle = '#f2f2ed'; ctx.fill();
      ctx.save(); roundedRect(ctx, x, y, w, h, Math.min(9, h * .2)); ctx.clip();
      ctx.strokeStyle = '#ef8b2c'; ctx.lineWidth = 10;
      for (let ix = x - h; ix < x + w + h; ix += 22) {
        ctx.beginPath(); ctx.moveTo(ix, y + h); ctx.lineTo(ix + h, y); ctx.stroke();
      }
      ctx.restore();
    } else if (kind === 'log') {
      ctx.fillStyle = '#80532f'; ctx.fill();
      ctx.strokeStyle = '#b67f4e'; ctx.lineWidth = 4; ctx.stroke();
    } else {
      ctx.fillStyle = '#b47a39'; ctx.fill();
      ctx.strokeStyle = '#70431f'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + w - 7, y + h - 7); ctx.moveTo(x + w - 7, y + 7); ctx.lineTo(x + 7, y + h - 7); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFinish(ctx, track) {
  const [x, y] = track.checkpoints[0];
  const [nx, ny] = track.points[1];
  const [sx, sy] = track.points[0];
  const angle = Math.atan2(ny - sy, nx - sx) + Math.PI / 2;
  const width = track.roadWidth * .88;
  const cells = 10;
  const cellW = width / cells;
  const cellH = 12;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = .92;
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      ctx.fillStyle = (row + col) % 2 ? '#11131a' : '#fff8ef';
      ctx.fillRect(-width / 2 + col * cellW, -cellH + row * cellH, cellW + .7, cellH + .7);
    }
  }
  ctx.restore();
}

function drawStaticTrack(canvas, track) {
  const ctx = canvas.getContext('2d');
  const t = track.theme;
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);

  const grd = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
  grd.addColorStop(0, t.ground2);
  grd.addColorStop(1, t.ground);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  if (t.mapType === 'neon') {
    const random = seeded(track.id);
    for (let i = 0; i < 55; i += 1) {
      const x = 20 + random() * (WORLD_W - 40);
      const y = 20 + random() * (WORLD_H - 40);
      const s = 5 + random() * 14;
      ctx.fillStyle = `rgba(255,255,255,${0.03 + random() * .08})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      if (i % 4 === 0) drawDecoration(ctx, x, y, 16 + random() * 12, track.id, random() > .5 ? '#5ae7ff' : '#ff62d7');
    }
  } else {
    drawSandWaves(ctx);
    const random = seeded(track.id);
    for (let i = 0; i < 52; i += 1) {
      const x = 20 + random() * (WORLD_W - 40);
      const y = 20 + random() * (WORLD_H - 40);
      if (closestDistance(x, y, track.points) < track.roadWidth * .7) continue;
      const s = 5 + random() * 13;
      ctx.fillStyle = 'rgba(177,146,104,.18)';
      ctx.beginPath(); ctx.arc(x, y, s * .22, 0, Math.PI * 2); ctx.fill();
      if (i % 9 === 0) drawDecoration(ctx, x, y, 18 + random() * 8, track.id, t.accent);
    }
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.roadEdge;
  ctx.lineWidth = track.roadWidth + 18;
  ctx.stroke();

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.curbA;
  ctx.lineWidth = track.roadWidth + 16;
  ctx.stroke();

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.curbB;
  ctx.lineWidth = track.roadWidth + 16;
  ctx.setLineDash([24, 24]);
  ctx.lineDashOffset = 10;
  ctx.stroke();
  ctx.setLineDash([]);

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.road;
  ctx.lineWidth = track.roadWidth;
  ctx.stroke();

  trackPath(ctx, track.points);
  ctx.strokeStyle = 'rgba(255,255,255,.38)';
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 24]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  for (const arrow of track.arrowHints || []) drawTrackArrow(ctx, arrow.x, arrow.y, arrow.angle, t.mapType === 'neon' ? .18 : .14);


  for (const obstacle of track.obstacles || []) drawObstacle(ctx, obstacle);
  drawFinish(ctx, track);

  ctx.save();
  ctx.fillStyle = t.mapType === 'neon' ? 'rgba(255,255,255,.08)' : 'rgba(98,71,42,.12)';
  ctx.font = '900 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(track.name.toUpperCase(), WORLD_W / 2, WORLD_H / 2 + 2);
  ctx.restore();
}

function drawCar(ctx, car, color, label, isMine, bumping) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);

  const speed = Math.hypot(car.vx || 0, car.vy || 0);
  if (speed > 230) {
    ctx.strokeStyle = 'rgba(90,62,34,.18)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, -8); ctx.lineTo(-39, -8);
    ctx.moveTo(-22, 8); ctx.lineTo(-39, 8);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0,0,0,.20)';
  roundedRect(ctx, -22, -13 + 4, 44, 26, 9); ctx.fill();

  ctx.shadowColor = bumping ? 'rgba(255,218,91,.95)' : 'rgba(0,0,0,.18)';
  ctx.shadowBlur = bumping ? 16 : 6;
  ctx.fillStyle = color;
  roundedRect(ctx, -22, -13, 44, 26, 10); ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4, -12, 8, 24);
  ctx.fillStyle = '#243146';
  roundedRect(ctx, -6, -9, 14, 18, 4); ctx.fill();
  ctx.fillStyle = 'rgba(185,230,255,.95)';
  roundedRect(ctx, -4.4, -7.5, 10.8, 15, 4); ctx.fill();

  ctx.fillStyle = '#15171d';
  ctx.fillRect(-16, -16, 9, 4); ctx.fillRect(7, -16, 9, 4);
  ctx.fillRect(-16, 12, 9, 4); ctx.fillRect(7, 12, 9, 4);

  ctx.fillStyle = '#fff0a8';
  ctx.beginPath(); ctx.arc(17, -7, 2.6, 0, Math.PI * 2); ctx.arc(17, 7, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 11px system-ui, sans-serif';
  ctx.fillStyle = isMine ? '#ffffff' : 'rgba(255,255,255,.95)';
  ctx.strokeStyle = 'rgba(0,0,0,.64)';
  ctx.lineWidth = 4;
  ctx.strokeText(label, car.x, car.y - 25);
  ctx.fillText(label, car.x, car.y - 25);
  ctx.restore();
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || 'Гонка завершена.',
  };
}

export default function DriftRaceGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(Date.now());
  const [wheelDeg, setWheelDeg] = useState(0);

  const canvasRef = useRef(null);
  const staticCanvasRef = useRef(null);
  const stateRef = useRef(null);
  const sendActionRef = useRef(null);
  const animationRef = useRef(null);
  const lastFrameRef = useRef(0);
  const wheelRef = useRef(null);
  const dragRef = useRef(null);
  const wheelDegRef = useRef(0);
  const lastSendRef = useRef(0);
  const keyRef = useRef({ left: false, right: false });
  const motionsRef = useRef({ a: motionPoint(), b: motionPoint() });

  const { waiting, state, error, setError, findMatch: startMatch, cancelSearch, sendAction } = useMultiplayerGame('drift-race');
  stateRef.current = state;
  sendActionRef.current = sendAction;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myName = me ? state?.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state?.players?.[foe]?.name || 'Соперник' : 'Соперник';
  const myLap = me ? state?.cars?.[me]?.lap ?? 0 : 0;
  const foeLap = foe ? state?.cars?.[foe]?.lap ?? 0 : 0;
  const canSteer = state?.status === 'playing' && state?.phase === 'racing';
  const result = resultPresentation(state);

  useEffect(() => {
    if (!state?.cars) return;
    const stamp = performance.now();
    for (const seat of ['a', 'b']) {
      if (state.cars[seat]) feedMotion(motionsRef.current[seat], state.cars[seat], stamp);
    }
  }, [state?.cars]);

  useEffect(() => {
    if (!state?.track) return;
    const staticCanvas = document.createElement('canvas');
    staticCanvas.width = WORLD_W;
    staticCanvas.height = WORLD_H;
    drawStaticTrack(staticCanvas, state.track);
    staticCanvasRef.current = staticCanvas;
  }, [state?.track?.id]);

  useEffect(() => {
    if (!state) return undefined;
    let cancelled = false;

    function frame(stamp) {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const snapshot = stateRef.current;
      if (!canvas || !snapshot?.track) {
        animationRef.current = requestAnimationFrame(frame);
        return;
      }

      const dt = lastFrameRef.current ? clamp((stamp - lastFrameRef.current) / 1000, 0, .034) : 1 / 60;
      lastFrameRef.current = stamp;
      smoothMotion(motionsRef.current.a, stamp, dt);
      smoothMotion(motionsRef.current.b, stamp, dt);

      const ctx = canvas.getContext('2d');
      if (staticCanvasRef.current) ctx.drawImage(staticCanvasRef.current, 0, 0);
      else drawStaticTrack(canvas, snapshot.track);

      const order = snapshot.playerSeat === 'a' ? ['b', 'a'] : ['a', 'b'];
      for (const seat of order) {
        const motion = motionsRef.current[seat];
        if (!motion.ready) continue;
        const p = snapshot.players?.[seat];
        drawCar(ctx, motion, p?.color || (seat === 'a' ? '#ff4054' : '#32bfff'), p?.name || 'Игрок', seat === snapshot.playerSeat, !!snapshot.cars?.[seat]?.bumping);
      }

      animationRef.current = requestAnimationFrame(frame);
    }

    lastFrameRef.current = 0;
    animationRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      lastFrameRef.current = 0;
    };
  }, [!!state, state?.track?.id]);

  useEffect(() => {
    if (!state || state.phase !== 'countdown') return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 90);
    return () => window.clearInterval(timer);
  }, [state?.phase, state?.countdownEndsAt]);

  function setWheelVisual(deg) {
    wheelDegRef.current = deg;
    setWheelDeg(deg);
  }

  function sendHeadingDeg(deg, force = false) {
    const now = performance.now();
    if (!force && now - lastSendRef.current < 30) return;
    lastSendRef.current = now;
    const heading = normalizeAngle(deg * Math.PI / 180);
    sendActionRef.current?.({ type: 'steer', heading });
  }

  function setWheelAndHeading(deg, force = false) {
    setWheelVisual(deg);
    if (canSteer) sendHeadingDeg(deg, force);
  }

  function pointerAngle(event) {
    const box = wheelRef.current?.getBoundingClientRect();
    if (!box) return 0;
    return Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2));
  }

  function onWheelDown(event) {
    if (!canSteer) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* no-op */ }
    dragRef.current = { pointerId: event.pointerId, lastAngle: pointerAngle(event) };
  }

  function onWheelMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const angle = pointerAngle(event);
    let delta = angle - drag.lastAngle;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    drag.lastAngle = angle;
    setWheelAndHeading(wheelDegRef.current + delta * 180 / Math.PI);
  }

  function releaseWheel(event) {
    const drag = dragRef.current;
    if (event && drag && drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (canSteer) sendHeadingDeg(wheelDegRef.current, true);
  }

  useEffect(() => {
    function keyDown(event) {
      if (event.target?.matches?.('input,textarea,select,button')) return;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        event.preventDefault();
        keyRef.current.left = true;
      }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        event.preventDefault();
        keyRef.current.right = true;
      }
    }
    function keyUp(event) {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') keyRef.current.left = false;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') keyRef.current.right = false;
    }
    function blur() {
      keyRef.current = { left: false, right: false };
      dragRef.current = null;
    }
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    if (!canSteer) return undefined;
    let frameId = 0;
    let last = performance.now();
    function tick(now) {
      const dt = clamp((now - last) / 1000, 0, .04);
      last = now;
      const dir = (keyRef.current.right ? 1 : 0) - (keyRef.current.left ? 1 : 0);
      if (dir) setWheelAndHeading(wheelDegRef.current + dir * KEY_TURN_DEG_PER_SEC * dt);
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [canSteer]);

  useEffect(() => {
    if (!me) return;
    const serverHeading = state?.cars?.[me]?.targetHeading;
    if (!Number.isFinite(serverHeading) || dragRef.current) return;
    const aligned = nearestEquivalentDeg(serverHeading, wheelDegRef.current);
    if (Math.abs(aligned - wheelDegRef.current) > .15) setWheelVisual(aligned);
  }, [me, state?.cars?.[me]?.targetHeading, state?.track?.id]);

  useEffect(() => {
    if (!canSteer) {
      dragRef.current = null;
      keyRef.current = { left: false, right: false };
    }
  }, [canSteer]);

  function findMatch() {
    setError('');
    motionsRef.current = { a: motionPoint(), b: motionPoint() };
    setWheelVisual(0);
    startMatch(playerName);
  }

  if (!state && !waiting) {
    return (
      <section className="dr-lobby">
        <div className="dr-lobby__icon">🏎️</div>
        <span className="eyebrow">2 игрока · физика · настоящий руль</span>
        <h1>Drift Race</h1>
        <p>Машина сама держит скорость. Ты хватаешь руль пальцем и реально крутишь его. Машины стали быстрее, слушаются руля почти сразу, а дрифт остался только лёгким — на красивых поворотах.</p>
        <div className="dr-rules">
          <span>🏁 первым проедь 2 полных круга</span>
          <span>✅ круг считается только после всех точек трассы</span>
          <span>💥 соперника можно толкать корпусом</span>
          <span>🏜️ 3 большие понятные трассы без туннелей</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="dr-waiting">
        <div className="dr-waiting__car">🏎️</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго гонщика…</h2>
        <p>Трасса выберется случайно из трёх.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;

  const countdown = state.phase === 'countdown' ? Math.max(1, Math.ceil((state.countdownEndsAt - clock) / 1000)) : null;
  const myColor = me ? state.players?.[me]?.color : '#ff4054';
  const foeColor = foe ? state.players?.[foe]?.color : '#32bfff';

  return (
    <section className="dr-shell">
      <header className="dr-hud">
        <div className="dr-driver">
          <span className="dr-driver__dot" style={{ background: myColor }} />
          <div><small>{myName}</small><strong>{myLap}<i>/{state.lapsToWin}</i></strong></div>
        </div>
        <div className="dr-track-title">
          <small>ТРАССА</small>
          <strong>{state.track?.name}</strong>
          <span>{state.track?.subtitle}</span>
        </div>
        <div className="dr-driver dr-driver--right">
          <div><small>{foeName}</small><strong>{foeLap}<i>/{state.lapsToWin}</i></strong></div>
          <span className="dr-driver__dot" style={{ background: foeColor }} />
        </div>
      </header>

      <div className="dr-stage">
        <canvas ref={canvasRef} width={WORLD_W} height={WORLD_H} className="dr-canvas" />

        {state.phase === 'countdown' && (
          <div className="dr-countdown">
            <span>ПРИГОТОВЬСЯ</span>
            <strong>{countdown}</strong>
            <small>Машина поедет сама</small>
          </div>
        )}
      </div>

      <div className="dr-controls">
        <div className={`dr-wheel-wrap ${canSteer ? '' : 'is-disabled'}`}>
          <div className="dr-wheel-caption"><b>НАПРАВЛЕНИЕ</b><span>крути сколько угодно</span></div>
          <div
            ref={wheelRef}
            className={`dr-wheel ${dragRef.current ? 'is-grabbed' : ''}`}
            style={{ transform: `rotate(${wheelDeg}deg)` }}
            onPointerDown={onWheelDown}
            onPointerMove={onWheelMove}
            onPointerUp={releaseWheel}
            onPointerCancel={releaseWheel}
            onLostPointerCapture={releaseWheel}
          >
            <div className="dr-wheel__rim" />
            <div className="dr-wheel__spoke dr-wheel__spoke--a" />
            <div className="dr-wheel__spoke dr-wheel__spoke--b" />
            <div className="dr-wheel__spoke dr-wheel__spoke--c" />
            <div className="dr-wheel__direction" style={{ '--dr-player': myColor }} />
            <div className="dr-wheel__hub" style={{ boxShadow: `0 0 0 8px ${myColor}35, 0 8px 24px rgba(0,0,0,.55)` }} />
          </div>
          <div className="dr-wheel-keys">стрелка показывает, куда поедет машина</div>
        </div>
      </div>

      <div className="dr-statusline">
        <span>🏁 Полный круг = все контрольные точки по порядку</span>
        <span>💥 Врезался — потерял скорость, разворачивайся рулём</span>
      </div>

      {result && (
        <div className="dr-result">
          <div className="dr-result__card">
            <span>DRIFT RACE</span>
            <div className="dr-result__icon">🏁</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="dr-result__score"><strong>{myLap}</strong><span>:</span><strong>{foeLap}</strong></div>
            <div className="dr-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Новая гонка</button>
              <button type="button" className="secondary-button" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
