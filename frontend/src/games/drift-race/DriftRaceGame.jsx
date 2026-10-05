import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './drift-race.css';

const WORLD_W = 1200;
const WORLD_H = 720;
const MAX_WHEEL_DEG = 128;

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

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

function drawObstacle(ctx, obstacle) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 6;

  if (obstacle.shape === 'circle') {
    const { x, y, r, kind } = obstacle;
    if (kind === 'tire') {
      ctx.fillStyle = '#15171c'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#555b64'; ctx.beginPath(); ctx.arc(x, y, r * .52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#242830'; ctx.beginPath(); ctx.arc(x, y, r * .25, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'buoy') {
      ctx.fillStyle = '#ff7a3b'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f7f7f4'; ctx.fillRect(x - r, y - 5, r * 2, 10);
    } else if (kind === 'stump') {
      ctx.fillStyle = '#76502f'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a6784e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r * .55, 0, Math.PI * 2); ctx.stroke();
    } else if (kind === 'crystal') {
      ctx.fillStyle = '#5ae7ff';
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .7, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff66dc'; ctx.beginPath(); ctx.moveTo(x, y - r * .72); ctx.lineTo(x + r * .25, y); ctx.lineTo(x, y + r * .2); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#776459'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .3, r * .35, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    const { x, y, w, h, kind } = obstacle;
    roundedRect(ctx, x, y, w, h, Math.min(9, h * .2));
    if (kind === 'barrier') {
      ctx.fillStyle = '#f2f2ed'; ctx.fill();
      ctx.save(); roundedRect(ctx, x, y, w, h, Math.min(9, h * .2)); ctx.clip();
      ctx.strokeStyle = '#e84843'; ctx.lineWidth = 10;
      for (let ix = x - h; ix < x + w + h; ix += 24) {
        ctx.beginPath(); ctx.moveTo(ix, y + h); ctx.lineTo(ix + h, y); ctx.stroke();
      }
      ctx.restore();
    } else if (kind === 'log') {
      ctx.fillStyle = '#80532f'; ctx.fill();
      ctx.strokeStyle = '#b67f4e'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 12, y + 5); ctx.lineTo(x + 12, y + h - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w - 12, y + 5); ctx.lineTo(x + w - 12, y + h - 5); ctx.stroke();
    } else {
      ctx.fillStyle = '#a86c31'; ctx.fill();
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
  const width = track.roadWidth * .9;
  const cells = 10;
  const cellW = width / cells;
  const cellH = 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      ctx.fillStyle = (row + col) % 2 ? '#101218' : '#f8f7f0';
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

  const random = seeded(track.id);
  for (let i = 0; i < 95; i += 1) {
    const x = 18 + random() * (WORLD_W - 36);
    const y = 18 + random() * (WORLD_H - 36);
    if (closestDistance(x, y, track.points) < track.roadWidth * .72) continue;
    const s = 15 + random() * 22;
    ctx.fillStyle = `rgba(255,255,255,${0.025 + random() * .045})`;
    ctx.beginPath(); ctx.arc(x, y, s * .75, 0, Math.PI * 2); ctx.fill();
    if (i % 3 === 0) drawDecoration(ctx, x, y, s, track.id, t.accent);
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trackPath(ctx, track.points);
  ctx.strokeStyle = t.roadEdge;
  ctx.lineWidth = track.roadWidth + 30;
  ctx.stroke();

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.curbA;
  ctx.lineWidth = track.roadWidth + 22;
  ctx.stroke();

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.curbB;
  ctx.lineWidth = track.roadWidth + 22;
  ctx.setLineDash([24, 24]);
  ctx.lineDashOffset = 10;
  ctx.stroke();
  ctx.setLineDash([]);

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.road;
  ctx.lineWidth = track.roadWidth;
  ctx.stroke();

  trackPath(ctx, track.points);
  ctx.strokeStyle = t.dash;
  ctx.globalAlpha = .52;
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 30]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.restore();

  if (track.tunnel) {
    const portals = [track.tunnel.entry, track.tunnel.exit];
    portals.forEach((portal, index) => {
      const glow = ctx.createRadialGradient(portal.x, portal.y, 7, portal.x, portal.y, portal.r + 20);
      glow.addColorStop(0, index === 0 ? 'rgba(255,79,210,.95)' : 'rgba(61,222,255,.95)');
      glow.addColorStop(.55, index === 0 ? 'rgba(168,85,247,.48)' : 'rgba(61,222,255,.40)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(portal.x, portal.y, portal.r + 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = index === 0 ? '#ff62d7' : '#5ce7ff';
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.arc(portal.x, portal.y, portal.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(10,12,30,.62)';
      ctx.beginPath(); ctx.arc(portal.x, portal.y, portal.r - 10, 0, Math.PI * 2); ctx.fill();
    });
  }

  for (const obstacle of track.obstacles || []) drawObstacle(ctx, obstacle);
  drawFinish(ctx, track);

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.font = '900 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(track.name.toUpperCase(), WORLD_W / 2, WORLD_H / 2 - 8);
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('DANYA & ANDREW RACING', WORLD_W / 2, WORLD_H / 2 + 20);
  ctx.restore();
}

function drawCar(ctx, car, color, label, isMine, bumping) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);

  const speed = Math.hypot(car.vx || 0, car.vy || 0);
  if (speed > 150) {
    ctx.strokeStyle = 'rgba(25,24,26,.18)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-27, -12); ctx.lineTo(-48, -12);
    ctx.moveTo(-27, 12); ctx.lineTo(-48, 12);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0,0,0,.28)';
  roundedRect(ctx, -29, -19 + 6, 58, 38, 11); ctx.fill();

  ctx.shadowColor = bumping ? 'rgba(255,218,91,.95)' : 'rgba(0,0,0,.25)';
  ctx.shadowBlur = bumping ? 18 : 7;
  ctx.fillStyle = color;
  roundedRect(ctx, -30, -20, 60, 40, 11); ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#172330';
  roundedRect(ctx, -7, -14, 23, 28, 7); ctx.fill();
  ctx.fillStyle = 'rgba(181,236,255,.92)';
  roundedRect(ctx, -3, -11, 14, 22, 5); ctx.fill();

  ctx.fillStyle = '#131419';
  ctx.fillRect(-19, -24, 13, 6); ctx.fillRect(8, -24, 13, 6);
  ctx.fillRect(-19, 18, 13, 6); ctx.fillRect(8, 18, 13, 6);

  ctx.fillStyle = '#fff7bd';
  ctx.beginPath(); ctx.arc(24, -11, 4, 0, Math.PI * 2); ctx.arc(24, 11, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 13px system-ui, sans-serif';
  ctx.fillStyle = isMine ? '#ffffff' : 'rgba(255,255,255,.92)';
  ctx.strokeStyle = 'rgba(0,0,0,.66)';
  ctx.lineWidth = 4;
  ctx.strokeText(label, car.x, car.y - 36);
  ctx.fillText(label, car.x, car.y - 36);
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

  function sendSteer(value, force = false) {
    const now = performance.now();
    if (!force && now - lastSendRef.current < 34) return;
    lastSendRef.current = now;
    sendActionRef.current?.({ type: 'steer', value: clamp(value, -1, 1) });
  }

  function setWheelAndSteer(deg, force = false) {
    const safe = clamp(deg, -MAX_WHEEL_DEG, MAX_WHEEL_DEG);
    setWheelDeg(safe);
    if (canSteer) sendSteer(safe / MAX_WHEEL_DEG, force);
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
    dragRef.current = { pointerId: event.pointerId, startAngle: pointerAngle(event), startDeg: wheelDeg };
  }

  function onWheelMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const angle = pointerAngle(event);
    let delta = angle - drag.startAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    setWheelAndSteer(drag.startDeg + delta * 180 / Math.PI);
  }

  function releaseWheel(event) {
    const drag = dragRef.current;
    if (event && drag && drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setWheelDeg(0);
    sendSteer(0, true);
  }

  useEffect(() => {
    function applyKeys() {
      const left = keyRef.current.left;
      const right = keyRef.current.right;
      const value = left === right ? 0 : left ? -0.72 : 0.72;
      setWheelDeg(value * MAX_WHEEL_DEG);
      if (canSteer) sendSteer(value, true);
    }
    function keyDown(event) {
      if (event.target?.matches?.('input,textarea,select,button')) return;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') { event.preventDefault(); keyRef.current.left = true; applyKeys(); }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') { event.preventDefault(); keyRef.current.right = true; applyKeys(); }
    }
    function keyUp(event) {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') { keyRef.current.left = false; applyKeys(); }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') { keyRef.current.right = false; applyKeys(); }
    }
    function blur() {
      keyRef.current = { left: false, right: false };
      dragRef.current = null;
      setWheelDeg(0);
      sendSteer(0, true);
    }
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
    };
  }, [canSteer]);

  useEffect(() => {
    if (!canSteer) {
      dragRef.current = null;
      keyRef.current = { left: false, right: false };
      setWheelDeg(0);
    }
  }, [canSteer]);

  useEffect(() => () => sendActionRef.current?.({ type: 'steer', value: 0 }), []);

  function findMatch() {
    setError('');
    motionsRef.current = { a: motionPoint(), b: motionPoint() };
    setWheelDeg(0);
    startMatch(playerName);
  }

  if (!state && !waiting) {
    return (
      <section className="dr-lobby">
        <div className="dr-lobby__icon">🏎️</div>
        <span className="eyebrow">2 игрока · физика · настоящий руль</span>
        <h1>Drift Race</h1>
        <p>Машина сама держит скорость. Ты хватаешь руль пальцем и реально крутишь его. Поворот не приклеен к дороге — машина сохраняет инерцию и слегка дрифтует.</p>
        <div className="dr-rules">
          <span>🏁 первым проедь 2 полных круга</span>
          <span>✅ круг считается только после всех точек трассы</span>
          <span>💥 соперника можно толкать корпусом</span>
          <span>🌀 5 трасс, препятствия и тоннель</span>
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
        <p>Трасса выберется случайно из пяти.</p>
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

        <div className={`dr-wheel-wrap ${canSteer ? '' : 'is-disabled'}`}>
          <div className="dr-wheel-caption"><b>РУЛЬ</b><span>тяни и крути</span></div>
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
            <div className="dr-wheel__hub" style={{ boxShadow: `0 0 0 8px ${myColor}35, 0 8px 24px rgba(0,0,0,.55)` }} />
            <div className="dr-wheel__mark" />
          </div>
          <div className="dr-wheel-keys">A / D или ← / →</div>
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
