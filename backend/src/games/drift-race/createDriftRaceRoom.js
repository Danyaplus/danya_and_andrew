const PHYSICS_TICK_MS = 12;
const EMIT_EVERY_MS = 48;
const COUNTDOWN_MS = 2200;
const LAPS_TO_WIN = 2;
const CAR_RADIUS = 18;
const TARGET_SPEED = 470;
const MAX_SPEED = 610;
const ENGINE_ACCEL = 1450;
const BRAKE_RECOVERY = 1700;
const TURN_RATE = 7.2;
const LATERAL_GRIP = 12.5;
const FORWARD_DRAG = 0.06;

const THEMES = {
  oasis: {
    ground: '#eadcaf', ground2: '#f3e7c1', road: '#c08a4d', roadEdge: '#fff8ed', curbA: '#ef5341', curbB: '#ffffff', dash: '#f2dec0', accent: '#27bf70', sky: '#ffe9a9', mapType: 'sand',
  },
  dune: {
    ground: '#ecdcb3', ground2: '#f4e6c2', road: '#bd8447', roadEdge: '#fff4df', curbA: '#f08a33', curbB: '#ffffff', dash: '#efd5ab', accent: '#8ba8b8', sky: '#ffdf9b', mapType: 'sand',
  },
  pipe: {
    ground: '#cf9355', ground2: '#dca86d', road: '#bd8345', roadEdge: '#f4d1a3', curbA: '#ef8b2c', curbB: '#ffffff', dash: '#eac99e', accent: '#71c86b', sky: '#ffcf8a', mapType: 'sand',
  },
  canyon: {
    ground: '#cd8a50', ground2: '#dfa065', road: '#ba7f44', roadEdge: '#f6cf98', curbA: '#ef8b2c', curbB: '#ffffff', dash: '#f1d1a6', accent: '#6f8593', sky: '#ffcf8a', mapType: 'sand',
  },
  tunnel: {
    ground: '#3f446a', ground2: '#505788', road: '#4a4d68', roadEdge: '#73ddff', curbA: '#39d9ff', curbB: '#a855f7', dash: '#cfd8ff', accent: '#ff4ec9', sky: '#7b6cff', mapType: 'neon',
  },
};

function circle(x, y, r, kind = 'rock') { return { shape: 'circle', x, y, r, kind }; }
function rect(x, y, w, h, kind = 'crate') { return { shape: 'rect', x, y, w, h, kind }; }

const TRACKS = [
  {
    id: 'oasis-box',
    name: 'Песчаный Ринг',
    subtitle: 'Большая дуга и просторная трасса как на аркадных гонках',
    theme: THEMES.oasis,
    roadWidth: 112,
    points: [
      [350, 118], [825, 118], [958, 190], [975, 535], [855, 612], [360, 612], [238, 540], [238, 192],
    ],
    checkpoints: [[350,118],[874,140],[975,430],[760,610],[275,580],[238,270]],
    arrowHints: [{x: 590, y: 162, angle: 0}, {x: 928, y: 355, angle: Math.PI / 2}, {x: 600, y: 565, angle: Math.PI}, {x: 284, y: 338, angle: -Math.PI / 2}],
    obstacles: [circle(600, 265, 28, 'palm'), circle(565, 360, 22, 'palm'), circle(642, 460, 26, 'palm')],
  },
  {
    id: 'desert-eight',
    name: 'Пустынная Восьмёрка',
    subtitle: 'Две связки подряд — лёгкий дрифт только в апексах',
    theme: THEMES.dune,
    roadWidth: 104,
    points: [
      [250, 360], [178, 255], [235, 165], [395, 125], [530, 182], [578, 282], [552, 360], [622, 440], [770, 505], [935, 465], [1012, 360], [948, 248], [795, 195], [638, 235], [565, 318], [495, 400], [365, 458], [245, 430],
    ],
    checkpoints: [[250,360],[255,170],[548,185],[560,355],[795,500],[995,360],[810,200],[520,405]],
    arrowHints: [{x: 310, y: 214, angle: -0.7}, {x: 520, y: 225, angle: 1.2}, {x: 732, y: 470, angle: 0.25}, {x: 900, y: 250, angle: -2.6}],
    obstacles: [circle(410, 292, 33, 'rock'), circle(805, 330, 33, 'rock')],
  },
  {
    id: 'pipe-spin',
    name: 'Пайп Спин',
    subtitle: 'Влетаешь в трубу снизу — вылетаешь сверху и несёшься дальше',
    theme: THEMES.pipe,
    roadWidth: 108,
    points: [
      [710, 110], [915, 140], [992, 265], [1002, 430], [925, 560], [780, 615], [515, 615], [340, 565], [270, 455], [272, 350], [332, 250], [448, 205], [618, 208], [740, 262], [790, 355], [742, 455], [628, 505], [470, 490], [392, 412], [415, 326], [512, 278], [640, 286],
    ],
    checkpoints: [[710,110],[985,250],[935,560],[590,615],[295,510],[304,270],[615,208],[735,444],[430,483]],
    arrowHints: [{x: 850, y: 152, angle: 0.25}, {x: 964, y: 360, angle: Math.PI / 2}, {x: 643, y: 580, angle: Math.PI}, {x: 348, y: 296, angle: -1.2}, {x: 562, y: 312, angle: 0.1}],
    obstacles: [circle(545, 370, 24, 'rock'), circle(675, 405, 22, 'rock'), circle(596, 338, 26, 'rock')],
    tunnel: {
      entry: { x: 600, y: 615, r: 40 },
      exit: { x: 712, y: 110, r: 40, angle: Math.PI / 2 },
      style: 'pipe',
    },
  },
  {
    id: 'canyon-bend',
    name: 'Каньон Дрифт',
    subtitle: 'Узкие змейки и камни вокруг, но дороги стало больше',
    theme: THEMES.canyon,
    roadWidth: 106,
    points: [
      [850, 110], [980, 145], [1042, 248], [1010, 360], [915, 430], [725, 456], [575, 520], [552, 615], [355, 615], [235, 540], [232, 412], [335, 330], [505, 330], [650, 278], [692, 195],
    ],
    checkpoints: [[850,110],[1012,177],[1008,360],[705,466],[552,612],[265,565],[244,382],[505,330],[690,200]],
    arrowHints: [{x: 978, y: 188, angle: 0.9}, {x: 772, y: 456, angle: 2.9}, {x: 348, y: 592, angle: Math.PI}, {x: 290, y: 360, angle: -0.55}, {x: 608, y: 286, angle: -0.25}],
    obstacles: [circle(650, 365, 26, 'rock'), circle(600, 386, 24, 'rock'), circle(595, 425, 25, 'rock'), circle(560, 410, 20, 'rock'), circle(520, 390, 23, 'rock')],
  },
  {
    id: 'violet-tunnel',
    name: 'Неоновый Тоннель',
    subtitle: 'Неоновая трасса с прыжком через портал в середине круга',
    theme: THEMES.tunnel,
    roadWidth: 102,
    points: [
      [300, 145], [585, 125], [840, 148], [1002, 245], [1020, 410], [915, 548], [700, 612], [430, 600], [245, 525], [190, 375], [235, 225],
      [350, 210], [525, 220], [770, 250], [875, 330], [860, 455], [730, 515], [475, 510], [320, 465], [275, 350], [315, 255],
    ],
    checkpoints: [[300,145],[820,148],[1010,350],[735,603],[280,540],[220,260],[575,220],[870,330],[520,510]],
    arrowHints: [{x: 470, y: 155, angle: -0.05}, {x: 910, y: 260, angle: 0.9}, {x: 805, y: 548, angle: 2.6}, {x: 330, y: 532, angle: -2.8}, {x: 300, y: 265, angle: -1.1}],
    obstacles: [circle(330, 310, 18, 'crystal'), circle(858, 332, 18, 'crystal')],
    tunnel: {
      entry: { x: 895, y: 500, r: 42 },
      exit: { x: 340, y: 310, r: 42, angle: -Math.PI / 2 },
      style: 'neon',
    },
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
    targetHeading: Math.round(car.targetHeading * 10000) / 10000,
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
  const turnBoost = 1 + Math.min(0.8, Math.abs(wantedTurn) / 0.42);
  const speedRatio = clamp(speed / TARGET_SPEED, 0.88, 1.08);
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
  const grip = LATERAL_GRIP + Math.min(8, Math.abs(wantedTurn) * 5);
  lateral *= Math.exp(-grip * dt);
  lateral += clamp(wantedTurn, -0.8, 0.8) * Math.min(30, speed * 0.06) * dt;

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

function maybeTunnel(car, track, now) {
  const tunnel = track.tunnel;
  if (!tunnel || now < car.tunnelCooldownUntil) return false;
  const entry = tunnel.entry;
  if (distanceSq(car.x, car.y, entry.x, entry.y) > entry.r * entry.r) return false;

  const speed = clamp(Math.hypot(car.vx, car.vy), 180, MAX_SPEED);
  car.x = tunnel.exit.x;
  car.y = tunnel.exit.y;
  car.heading = tunnel.exit.angle;
  car.targetHeading = tunnel.exit.angle;
  car.vx = Math.cos(car.heading) * speed;
  car.vy = Math.sin(car.heading) * speed;
  car.tunnelCooldownUntil = now + 950;
  car.bumpUntil = now + 180;
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
