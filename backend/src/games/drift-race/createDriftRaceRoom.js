const PHYSICS_TICK_MS = 12;
const EMIT_EVERY_MS = 48;
const COUNTDOWN_MS = 2600;
const LAPS_TO_WIN = 2;
const CAR_RADIUS = 23;
const TARGET_SPEED = 248;
const MAX_SPEED = 330;
const ENGINE_ACCEL = 235;
const BRAKE_RECOVERY = 360;
const TURN_RATE = 1.9;
const LATERAL_GRIP = 3.25;
const FORWARD_DRAG = 0.16;
const STEER_STALE_MS = 450;

const THEMES = {
  oasis: {
    ground: '#eadcaf', ground2: '#f2e6bd', road: '#b9854b', roadEdge: '#f7f0df', curbA: '#ef3e38', curbB: '#ffffff', dash: '#f3dbb4', accent: '#23b86d', sky: '#ffe9a9',
  },
  harbor: {
    ground: '#8dc6d1', ground2: '#acd8df', road: '#39464f', roadEdge: '#d8edf2', curbA: '#f4c441', curbB: '#1d2e39', dash: '#e9f5f7', accent: '#ff7b3f', sky: '#b9f0ff',
  },
  forest: {
    ground: '#87b96d', ground2: '#9ecb83', road: '#5c6261', roadEdge: '#e7dfc6', curbA: '#ffffff', curbB: '#d84a43', dash: '#f0e8bf', accent: '#325f35', sky: '#d5f5b5',
  },
  tunnel: {
    ground: '#2e3153', ground2: '#383d67', road: '#4a4d68', roadEdge: '#171a2f', curbA: '#a855f7', curbB: '#39d9ff', dash: '#cfd8ff', accent: '#ff4ec9', sky: '#7b6cff',
  },
  canyon: {
    ground: '#cf8550', ground2: '#df9d64', road: '#514039', roadEdge: '#f0c690', curbA: '#f8ead8', curbB: '#d94635', dash: '#f4d8ad', accent: '#704330', sky: '#ffcf8a',
  },
};

function circle(x, y, r, kind = 'rock') { return { shape: 'circle', x, y, r, kind }; }
function rect(x, y, w, h, kind = 'crate') { return { shape: 'rect', x, y, w, h, kind }; }

const TRACKS = [
  {
    id: 'oasis-ring',
    name: 'Оазис Ринг',
    subtitle: 'Широкий трек, пальмы и два блока на апексе',
    theme: THEMES.oasis,
    roadWidth: 142,
    points: [
      [420, 112], [720, 105], [920, 165], [1045, 285], [1050, 455], [930, 575], [720, 628], [430, 620], [235, 555], [145, 415], [160, 260], [255, 155],
    ],
    checkpoints: [[420,112],[940,178],[1035,480],[700,627],[225,545],[155,300]],
    obstacles: [circle(890, 205, 25, 'tire'), rect(805, 540, 54, 54, 'crate'), circle(260, 505, 24, 'rock')],
  },
  {
    id: 'harbor-chicane',
    name: 'Портовый Шикан',
    subtitle: 'Узкие повороты между контейнерами и буями',
    theme: THEMES.harbor,
    roadWidth: 132,
    points: [
      [260, 115], [520, 95], [760, 120], [970, 190], [1040, 310], [930, 390], [1050, 520], [875, 615], [620, 590], [445, 525], [270, 625], [145, 505], [210, 365], [125, 230],
    ],
    checkpoints: [[260,115],[830,140],[1018,315],[990,500],[610,585],[260,610],[175,385]],
    obstacles: [rect(884, 325, 62, 36, 'barrier'), circle(765, 575, 22, 'buoy'), rect(260, 520, 48, 48, 'crate'), circle(175, 270, 22, 'buoy')],
  },
  {
    id: 'pine-serpent',
    name: 'Лесной Серпантин',
    subtitle: 'Повороты подряд: руль приходится перекладывать заранее',
    theme: THEMES.forest,
    roadWidth: 130,
    points: [
      [220, 145], [430, 105], [640, 165], [845, 108], [1025, 205], [925, 330], [1045, 455], [930, 590], [720, 625], [550, 545], [355, 625], [175, 545], [275, 405], [145, 300],
    ],
    checkpoints: [[220,145],[675,155],[1015,220],[950,345],[1010,490],[690,615],[350,615],[210,500],[165,300]],
    obstacles: [circle(865, 145, 24, 'stump'), circle(875, 555, 25, 'stump'), circle(305, 580, 23, 'rock'), rect(205, 340, 62, 34, 'log')],
  },
  {
    id: 'violet-tunnel',
    name: 'Неоновый Тоннель',
    subtitle: 'Въезжаешь в портал справа — вылетаешь на нижней прямой',
    theme: THEMES.tunnel,
    roadWidth: 136,
    points: [
      [350, 112], [625, 92], [865, 132], [1025, 235], [1040, 370], [930, 520], [680, 620], [420, 610], [205, 535], [135, 390], [185, 235],
    ],
    checkpoints: [[350,112],[845,128],[1025,265],[1038,370],[680,620],[280,565],[145,395],[190,230]],
    obstacles: [circle(790, 605, 21, 'crystal'), rect(330, 565, 56, 38, 'barrier'), circle(165, 335, 22, 'crystal')],
    tunnel: {
      entry: { x: 1038, y: 370, r: 48 },
      exit: { x: 680, y: 620, r: 48, angle: Math.PI },
    },
  },
  {
    id: 'red-canyon',
    name: 'Красный Каньон',
    subtitle: 'Камни, ящики и самая тесная внутренняя дуга',
    theme: THEMES.canyon,
    roadWidth: 128,
    points: [
      [300, 115], [575, 105], [835, 150], [1015, 265], [950, 405], [1040, 540], [810, 620], [600, 555], [405, 625], [205, 565], [145, 420], [250, 325], [145, 220],
    ],
    checkpoints: [[300,115],[850,155],[1005,285],[970,430],[995,555],[610,560],[385,620],[175,520],[205,330],[150,220]],
    obstacles: [circle(905, 190, 26, 'rock'), rect(890, 485, 56, 48, 'crate'), circle(510, 575, 24, 'rock'), rect(180, 380, 54, 36, 'barrier')],
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
  const lateral = 30 * side;
  const behind = 56;
  const x = sx - Math.cos(angle) * behind + Math.cos(angle + Math.PI / 2) * lateral;
  const y = sy - Math.sin(angle) * behind + Math.sin(angle + Math.PI / 2) * lateral;
  return {
    seat, x, y, vx: 0, vy: 0, heading: angle, steer: 0, steerUpdatedAt: 0,
    lap: 0, nextCheckpoint: 1, checkpointFlashUntil: 0, tunnelCooldownUntil: 0,
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
    steer: Math.round(car.steer * 1000) / 1000,
    speed: Math.round(Math.hypot(car.vx, car.vy) * 10) / 10,
    lap: car.lap,
    nextCheckpoint: car.nextCheckpoint,
    checkpointFlash: now < car.checkpointFlashUntil,
    bumping: now < car.bumpUntil,
    tunnelCooldown: now < car.tunnelCooldownUntil,
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
  car.x += nx * (penetration + 1.2);
  car.y += ny * (penetration + 1.2);

  const into = car.vx * nx + car.vy * ny;
  if (into < 0) {
    car.vx -= 1.15 * into * nx;
    car.vy -= 1.15 * into * ny;
  }
  car.vx *= 0.56;
  car.vy *= 0.56;
  car.bumpUntil = Date.now() + 150;
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
    car.vx -= 1.22 * vn * nx;
    car.vy -= 1.22 * vn * ny;
  }
  car.vx *= 0.48;
  car.vy *= 0.48;
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
    car.vx -= 1.18 * vn * nx;
    car.vy -= 1.18 * vn * ny;
  }
  car.vx *= 0.46;
  car.vy *= 0.46;
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
    const impulse = -(1 + 0.38) * rel * 0.5;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }
  a.vx *= 0.89; a.vy *= 0.89;
  b.vx *= 0.89; b.vy *= 0.89;
  const now = Date.now();
  a.bumpUntil = now + 130;
  b.bumpUntil = now + 130;
  return true;
}

function updateDrive(car, dt, now) {
  if (now - car.steerUpdatedAt > STEER_STALE_MS) car.steer *= Math.exp(-8 * dt);

  const speed = Math.hypot(car.vx, car.vy);
  const speedRatio = clamp(speed / TARGET_SPEED, 0.18, 1.15);
  car.heading = normalizeAngle(car.heading + car.steer * TURN_RATE * speedRatio * dt);

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
  lateral *= Math.exp(-LATERAL_GRIP * dt);

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
  const radius = Math.min(72, track.roadWidth * 0.48);
  if (distanceSq(car.x, car.y, cp[0], cp[1]) > radius * radius) return false;

  if (car.nextCheckpoint === 0) {
    car.lap += 1;
    car.nextCheckpoint = 1;
  } else {
    car.nextCheckpoint += 1;
    if (car.nextCheckpoint >= track.checkpoints.length) car.nextCheckpoint = 0;
  }
  car.checkpointFlashUntil = now + 280;
  return true;
}

function maybeTunnel(car, track, now) {
  const tunnel = track.tunnel;
  if (!tunnel || now < car.tunnelCooldownUntil) return false;
  const entry = tunnel.entry;
  if (distanceSq(car.x, car.y, entry.x, entry.y) > entry.r * entry.r) return false;

  const speed = clamp(Math.hypot(car.vx, car.vy), 120, MAX_SPEED);
  car.x = tunnel.exit.x;
  car.y = tunnel.exit.y;
  car.heading = tunnel.exit.angle;
  car.vx = Math.cos(car.heading) * speed;
  car.vy = Math.sin(car.heading) * speed;
  car.tunnelCooldownUntil = now + 1150;
  car.bumpUntil = now + 220;
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
    cars.a.steer = 0;
    cars.b.steer = 0;
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
      const value = Number(action.value);
      if (!Number.isFinite(value)) return;
      cars[seat].steer = clamp(value, -1, 1);
      cars[seat].steerUpdatedAt = Date.now();
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
        cars.a.steerUpdatedAt = now;
        cars.b.steerUpdatedAt = now;
        emitState(true);
      } else emitState();
      return;
    }

    if (phase !== 'racing') return;

    for (const seat of ['a', 'b']) {
      const car = cars[seat];
      updateDrive(car, dt, now);
      resolveRoadBoundary(car, track);
      for (const obstacle of track.obstacles || []) {
        if (obstacle.shape === 'circle') resolveCircleObstacle(car, obstacle);
        else resolveRectObstacle(car, obstacle);
      }
      resolveRoadBoundary(car, track);
      advanceCheckpoint(car, track, now);
      maybeTunnel(car, track, now);
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
