const PHYSICS_TICK_MS = 12;
const EMIT_EVERY_MS = 48;
const COUNTDOWN_MS = 2200;
const LAPS_TO_WIN = 2;
const CAR_RADIUS = 18;
const TARGET_SPEED = 330;
const MAX_SPEED = 430;
const ENGINE_ACCEL = 820;
const BRAKE_RECOVERY = 980;
const TURN_RATE = 5.7;
const LATERAL_GRIP = 14.0;
const FORWARD_DRAG = 0.08;

const THEMES = {
  sand: {
    ground: '#eadcb5', ground2: '#f5e9c8', road: '#bf8649', roadEdge: '#fff8e9', curbA: '#ef8a2f', curbB: '#ffffff', dash: '#f1d8ae', accent: '#2fbd70', sky: '#ffe7a3', mapType: 'sand',
  },
  warmSand: {
    ground: '#e4cf9f', ground2: '#f2e2b6', road: '#bd8245', roadEdge: '#fff5df', curbA: '#ed7540', curbB: '#ffffff', dash: '#f2d7aa', accent: '#5fbd77', sky: '#ffd899', mapType: 'sand',
  },
  paleSand: {
    ground: '#eee0ba', ground2: '#f7ebcb', road: '#c28a4b', roadEdge: '#fff9ec', curbA: '#ef8b31', curbB: '#ffffff', dash: '#efd4a7', accent: '#7aa4b0', sky: '#ffe9ae', mapType: 'sand',
  },
};

function circle(x, y, r, kind = 'rock') { return { shape: 'circle', x, y, r, kind }; }
function rect(x, y, w, h, kind = 'crate') { return { shape: 'rect', x, y, w, h, kind }; }

const TRACKS = [
  {
    id: 'sunny-loop',
    name: 'Солнечное Кольцо',
    subtitle: 'Широкая трасса без сюрпризов — чистая гонка на руле',
    theme: THEMES.sand,
    roadWidth: 138,
    points: [
      [340, 130], [720, 118], [910, 165], [1020, 285], [1025, 450], [920, 560], [720, 610], [405, 608], [235, 550], [165, 420], [170, 285], [245, 180],
    ],
    checkpoints: [[340,130],[860,150],[1022,330],[950,535],[690,610],[300,575],[165,390],[205,230]],
    arrowHints: [
      {x: 550, y: 155, angle: 0}, {x: 960, y: 245, angle: .9}, {x: 965, y: 490, angle: 2.2},
      {x: 610, y: 565, angle: Math.PI}, {x: 230, y: 500, angle: -2.1}, {x: 210, y: 255, angle: -1.0},
    ],
    obstacles: [circle(555, 285, 30, 'palm'), circle(650, 360, 27, 'palm'), circle(530, 430, 25, 'palm')],
  },
  {
    id: 'dune-sweep',
    name: 'Дюна Свип',
    subtitle: 'Длинные дуги и одна мягкая связка поворотов',
    theme: THEMES.warmSand,
    roadWidth: 132,
    points: [
      [300, 128], [575, 105], [820, 130], [990, 220], [1035, 345], [970, 475], [820, 565], [610, 585], [430, 625], [250, 575], [155, 455], [185, 335], [150, 230],
    ],
    checkpoints: [[300,128],[765,125],[995,245],[1005,430],[780,575],[420,620],[190,520],[170,300]],
    arrowHints: [
      {x: 480, y: 135, angle: -.05}, {x: 920, y: 185, angle: .55}, {x: 1000, y: 385, angle: 1.7},
      {x: 750, y: 550, angle: 2.8}, {x: 345, y: 590, angle: -2.9}, {x: 185, y: 390, angle: -1.6},
    ],
    obstacles: [circle(560, 310, 31, 'rock'), circle(685, 360, 24, 'rock'), circle(530, 425, 25, 'rock')],
  },
  {
    id: 'rocky-oval',
    name: 'Каменный Овал',
    subtitle: 'Самая спокойная карта: быстрые прямые и понятные повороты',
    theme: THEMES.paleSand,
    roadWidth: 142,
    points: [
      [320, 150], [615, 105], [875, 135], [1020, 245], [1040, 410], [935, 545], [690, 610], [410, 595], [210, 510], [145, 360], [195, 225],
    ],
    checkpoints: [[320,150],[825,128],[1015,275],[1000,470],[700,605],[330,565],[160,410],[180,270]],
    arrowHints: [
      {x: 520, y: 145, angle: -.05}, {x: 930, y: 190, angle: .65}, {x: 1010, y: 365, angle: 1.55},
      {x: 800, y: 555, angle: 2.8}, {x: 365, y: 560, angle: -2.7}, {x: 185, y: 330, angle: -1.45},
    ],
    obstacles: [circle(590, 300, 28, 'rock'), circle(650, 365, 30, 'rock'), circle(550, 425, 24, 'palm')],
  },
];

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function opposite(seat) { return seat === 'a' ? 'b' : 'a'; }
function distanceSq(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; }

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1);
  const x = ax + abx * t;
  const y = ay + aby * t;
  const dx = px - x;
  const dy = py - y;
  return { x, y, dx, dy, distSq: dx * dx + dy * dy, t };
}

function closestOnTrack(x, y, points) {
  let best = null;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const hit = closestPointOnSegment(x, y, a[0], a[1], b[0], b[1]);
    if (!best || hit.distSq < best.distSq) best = { ...hit, segment: i };
  }
  return best;
}

function makeCar(track, seat) {
  const [sx, sy] = track.points[0];
  const [nx, ny] = track.points[1];
  const angle = Math.atan2(ny - sy, nx - sx);
  const side = seat === 'a' ? -1 : 1;
  const lateral = 23 * side;
  const behind = 48;
  const x = sx - Math.cos(angle) * behind + Math.cos(angle + Math.PI / 2) * lateral;
  const y = sy - Math.sin(angle) * behind + Math.sin(angle + Math.PI / 2) * lateral;
  return {
    seat, x, y, vx: 0, vy: 0, heading: angle, targetHeading: angle,
    lap: 0, nextCheckpoint: 1, checkpointFlashUntil: 0,
    bumpUntil: 0,
  };
}

function publicCar(car, now) {
  return {
    x: Math.round(car.x * 10) / 10,
    y: Math.round(car.y * 10) / 10,
    vx: Math.round(car.vx * 10) / 10,
    vy: Math.round(car.vy * 10) / 10,
    heading: Math.round(car.heading * 10000) / 10000,
    targetHeading: Math.round(car.targetHeading * 10000) / 10000,
    speed: Math.round(Math.hypot(car.vx, car.vy) * 10) / 10,
    lap: car.lap,
    nextCheckpoint: car.nextCheckpoint,
    checkpointFlash: now < car.checkpointFlashUntil,
    bumping: now < car.bumpUntil,
  };
}

function resolveRoadBoundary(car, track) {
  const hit = closestOnTrack(car.x, car.y, track.points);
  const dist = Math.sqrt(Math.max(hit.distSq, 0.0001));
  const limit = track.roadWidth * 0.5 - CAR_RADIUS - 4;
  if (dist <= limit) return false;

  const nx = (hit.x - car.x) / dist;
  const ny = (hit.y - car.y) / dist;
  const penetration = dist - limit;
  car.x += nx * (penetration + 1.5);
  car.y += ny * (penetration + 1.5);

  const into = car.vx * nx + car.vy * ny;
  if (into < 0) {
    car.vx -= 1.12 * into * nx;
    car.vy -= 1.12 * into * ny;
  }
  car.vx *= 0.62;
  car.vy *= 0.62;
  car.bumpUntil = Date.now() + 140;
  return true;
}

function resolveCircleObstacle(car, obstacle) {
  const dx = car.x - obstacle.x;
  const dy = car.y - obstacle.y;
  const minDist = CAR_RADIUS + obstacle.r;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return false;
  const dist = Math.sqrt(Math.max(distSq, 0.0001));
  const nx = dx / dist;
  const ny = dy / dist;
  const push = minDist - dist + 1;
  car.x += nx * push;
  car.y += ny * push;
  const vn = car.vx * nx + car.vy * ny;
  if (vn < 0) {
    car.vx -= 1.18 * vn * nx;
    car.vy -= 1.18 * vn * ny;
  }
  car.vx *= 0.53;
  car.vy *= 0.53;
  car.bumpUntil = Date.now() + 170;
  return true;
}

function resolveRectObstacle(car, obstacle) {
  const cx = clamp(car.x, obstacle.x, obstacle.x + obstacle.w);
  const cy = clamp(car.y, obstacle.y, obstacle.y + obstacle.h);
  let dx = car.x - cx;
  let dy = car.y - cy;
  let distSq = dx * dx + dy * dy;
  if (distSq >= CAR_RADIUS * CAR_RADIUS) return false;

  let nx;
  let ny;
  let penetration;
  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
    penetration = CAR_RADIUS - dist;
  } else {
    const left = Math.abs(car.x - obstacle.x);
    const right = Math.abs(obstacle.x + obstacle.w - car.x);
    const top = Math.abs(car.y - obstacle.y);
    const bottom = Math.abs(obstacle.y + obstacle.h - car.y);
    const min = Math.min(left, right, top, bottom);
    if (min === left) { nx = -1; ny = 0; penetration = CAR_RADIUS + left; }
    else if (min === right) { nx = 1; ny = 0; penetration = CAR_RADIUS + right; }
    else if (min === top) { nx = 0; ny = -1; penetration = CAR_RADIUS + top; }
    else { nx = 0; ny = 1; penetration = CAR_RADIUS + bottom; }
  }

  car.x += nx * (penetration + 1);
  car.y += ny * (penetration + 1);
  const vn = car.vx * nx + car.vy * ny;
  if (vn < 0) {
    car.vx -= 1.15 * vn * nx;
    car.vy -= 1.15 * vn * ny;
  }
  car.vx *= 0.52;
  car.vy *= 0.52;
  car.bumpUntil = Date.now() + 170;
  return true;
}

function resolveCarVsCar(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = CAR_RADIUS * 2;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return false;

  const dist = Math.sqrt(Math.max(distSq, 0.0001));
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist + 0.6;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const rel = rvx * nx + rvy * ny;
  if (rel < 0) {
    const impulse = -(1 + 0.35) * rel * 0.5;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }
  a.vx *= 0.92; a.vy *= 0.92;
  b.vx *= 0.92; b.vy *= 0.92;
  const now = Date.now();
  a.bumpUntil = now + 120;
  b.bumpUntil = now + 120;
  return true;
}

function updateDrive(car, dt) {
  const speed = Math.hypot(car.vx, car.vy);
  const wantedTurn = normalizeAngle(car.targetHeading - car.heading);
  const turnBoost = 1 + Math.min(0.55, Math.abs(wantedTurn) / 0.5);
  const speedRatio = clamp(speed / TARGET_SPEED, 0.82, 1.05);
  const maxTurn = TURN_RATE * turnBoost * speedRatio * dt;
  car.heading = normalizeAngle(car.heading + clamp(wantedTurn, -maxTurn, maxTurn));

  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  const sx = -fy;
  const sy = fx;
  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * sx + car.vy * sy;

  const delta = TARGET_SPEED - forward;
  const accel = delta >= 0 ? ENGINE_ACCEL : BRAKE_RECOVERY;
  forward += clamp(delta, -accel * dt, accel * dt);
  forward *= Math.exp(-FORWARD_DRAG * dt);
  const grip = LATERAL_GRIP + Math.min(7, Math.abs(wantedTurn) * 4.2);
  lateral *= Math.exp(-grip * dt);
  lateral += clamp(wantedTurn, -0.65, 0.65) * Math.min(16, speed * 0.035) * dt;

  car.vx = fx * forward + sx * lateral;
  car.vy = fy * forward + sy * lateral;
  const nextSpeed = Math.hypot(car.vx, car.vy);
  if (nextSpeed > MAX_SPEED) {
    const scale = MAX_SPEED / nextSpeed;
    car.vx *= scale;
    car.vy *= scale;
  }

  car.x += car.vx * dt;
  car.y += car.vy * dt;
}

function advanceCheckpoint(car, track, now) {
  const cp = track.checkpoints[car.nextCheckpoint];
  if (!cp) return false;
  const radius = Math.min(68, track.roadWidth * 0.49);
  if (distanceSq(car.x, car.y, cp[0], cp[1]) > radius * radius) return false;

  if (car.nextCheckpoint === 0) {
    car.lap += 1;
    car.nextCheckpoint = 1;
  } else {
    car.nextCheckpoint += 1;
    if (car.nextCheckpoint >= track.checkpoints.length) car.nextCheckpoint = 0;
  }
  car.checkpointFlashUntil = now + 240;
  return true;
}

export function createDriftRaceRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: '#ff3f51' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: '#2ebcff' },
  };

  const track = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  let cars = { a: makeCar(track, 'a'), b: makeCar(track, 'b') };
  let status = 'playing';
  let phase = 'countdown';
  let result = null;
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let interval = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'drift-race', roomId, serverTime: now, playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: { a: { name: bySeat.a.name, color: bySeat.a.color }, b: { name: bySeat.b.name, color: bySeat.b.color } },
      track,
      cars: { a: publicCar(cars.a, now), b: publicCar(cars.b, now) },
      lapsToWin: LAPS_TO_WIN,
      carRadius: CAR_RADIUS,
      targetSpeed: TARGET_SPEED,
      countdownEndsAt,
      phase, status, result,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_EVERY_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId, now));
    }
  }

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = { winner, type, message };
    if (interval) clearInterval(interval);
    interval = null;
    emitState(true);
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function handleAction(socketId, action = {}) {
    const seat = seatForSocket(socketId);
    if (!seat || status !== 'playing') return;

    if (action.type === 'steer') {
      const heading = Number(action.heading);
      if (!Number.isFinite(heading)) return;
      cars[seat].targetHeading = normalizeAngle(heading);
      return;
    }

    if (action.type === 'resign') {
      finishMatch(opposite(seat), 'resign', `${bySeat[seat].name} вышел из гонки.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (seat) finishMatch(opposite(seat), 'disconnect', 'Соперник отключился от гонки.');
  }

  function update(now) {
    if (status !== 'playing') return;
    const dt = clamp((now - lastTickAt) / 1000, 0, 0.05);
    lastTickAt = now;

    if (phase === 'countdown') {
      if (now >= countdownEndsAt) {
        phase = 'racing';
        emitState(true);
      } else emitState();
      return;
    }

    if (phase !== 'racing') return;

    for (const seat of ['a', 'b']) {
      const car = cars[seat];
      updateDrive(car, dt);
      resolveRoadBoundary(car, track);
      for (const obstacle of track.obstacles || []) {
        if (obstacle.shape === 'circle') resolveCircleObstacle(car, obstacle);
        else resolveRectObstacle(car, obstacle);
      }
      resolveRoadBoundary(car, track);
      advanceCheckpoint(car, track, now);
    }

    resolveCarVsCar(cars.a, cars.b);
    resolveRoadBoundary(cars.a, track);
    resolveRoadBoundary(cars.b, track);

    for (const seat of ['a', 'b']) {
      if (cars[seat].lap >= LAPS_TO_WIN) {
        finishMatch(seat, 'laps', `${bySeat[seat].name} первым проехал ${LAPS_TO_WIN} полных круга.`);
        return;
      }
    }

    emitState();
  }

  interval = setInterval(() => update(Date.now()), PHYSICS_TICK_MS);
  interval.unref?.();
  emitState(true);

  return {
    id: roomId,
    gameId: 'drift-race',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() { if (interval) clearInterval(interval); },
  };
}
