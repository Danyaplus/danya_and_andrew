const ARENA = { width: 1400, height: 840 };
const PHYSICS_TICK_MS = 8;
const EMIT_EVERY_MS = 50;
const TANK_RADIUS = 28;
const TANK_SPEED = 188;
const ROTATION_SPEED = 1.72;
const BULLET_SPEED = 590;
const BULLET_RADIUS = 6;
const BULLET_TTL = 3.1;
const HOLD_DELAY_MS = 180;
const HEAT_PER_SHOT = 36;
const HEAT_COOL_PER_SECOND = 19;
const OVERHEAT_MS = 1000;
const ROUND_RESET_MS = 1700;
const WINS_TO_MATCH = 2;
const MAP_OBJECT_LIMIT = 24;
const SPAWN_CLEARANCE = 125;

const MAP_TEMPLATES = [
  {
    id: 'pine-frontier',
    name: 'Хвойный рубеж',
    theme: 'forest',
    spawns: [
      { a: { x: 150, y: 420, angle: 0 }, b: { x: 1250, y: 420, angle: Math.PI } },
      { a: { x: 210, y: 150, angle: 0.35 }, b: { x: 1190, y: 690, angle: Math.PI + 0.35 } },
      { a: { x: 210, y: 690, angle: -0.35 }, b: { x: 1190, y: 150, angle: Math.PI - 0.35 } },
    ],
    core: [
      { id: 'f-rock-center-a', type: 'circle', style: 'rock', x: 680, y: 360, r: 52 },
      { id: 'f-rock-center-b', type: 'circle', style: 'rock', x: 765, y: 500, r: 44 },
      { id: 'f-log-top', type: 'rect', style: 'log', x: 500, y: 155, w: 250, h: 28 },
      { id: 'f-log-bottom', type: 'rect', style: 'log', x: 655, y: 655, w: 250, h: 28 },
      { id: 'f-pine-left-a', type: 'circle', style: 'pine', x: 385, y: 270, r: 44 },
      { id: 'f-pine-left-b', type: 'circle', style: 'pine', x: 410, y: 575, r: 47 },
      { id: 'f-pine-right-a', type: 'circle', style: 'pine', x: 1030, y: 265, r: 46 },
      { id: 'f-pine-right-b', type: 'circle', style: 'pine', x: 1010, y: 590, r: 45 },
    ],
    optional: [
      { id: 'f-pine-1', type: 'circle', style: 'pine', x: 285, y: 385, r: 35 },
      { id: 'f-pine-2', type: 'circle', style: 'pine', x: 1125, y: 430, r: 36 },
      { id: 'f-bush-1', type: 'circle', style: 'bush', x: 540, y: 360, r: 29 },
      { id: 'f-bush-2', type: 'circle', style: 'bush', x: 875, y: 440, r: 31 },
      { id: 'f-rock-1', type: 'circle', style: 'rock', x: 520, y: 545, r: 31 },
      { id: 'f-rock-2', type: 'circle', style: 'rock', x: 900, y: 280, r: 30 },
      { id: 'f-crate-1', type: 'rect', style: 'crate', x: 310, y: 105, w: 70, h: 70 },
      { id: 'f-crate-2', type: 'rect', style: 'crate', x: 1030, y: 675, w: 74, h: 68 },
    ],
  },
  {
    id: 'old-fort',
    name: 'Старый форт',
    theme: 'fort',
    spawns: [
      { a: { x: 150, y: 245, angle: 0.2 }, b: { x: 1250, y: 595, angle: Math.PI + 0.2 } },
      { a: { x: 170, y: 620, angle: -0.15 }, b: { x: 1230, y: 220, angle: Math.PI - 0.15 } },
      { a: { x: 275, y: 420, angle: 0 }, b: { x: 1125, y: 420, angle: Math.PI } },
    ],
    core: [
      { id: 'fort-wall-l1', type: 'rect', style: 'wall', x: 350, y: 185, w: 230, h: 34 },
      { id: 'fort-wall-l2', type: 'rect', style: 'wall', x: 350, y: 219, w: 34, h: 145 },
      { id: 'fort-wall-r1', type: 'rect', style: 'wall', x: 820, y: 620, w: 230, h: 34 },
      { id: 'fort-wall-r2', type: 'rect', style: 'wall', x: 1016, y: 474, w: 34, h: 146 },
      { id: 'fort-ruin-c1', type: 'rect', style: 'ruin', x: 642, y: 320, w: 116, h: 64 },
      { id: 'fort-ruin-c2', type: 'rect', style: 'ruin', x: 642, y: 456, w: 116, h: 64 },
      { id: 'fort-sand-left', type: 'rect', style: 'sandbag', x: 470, y: 565, w: 155, h: 28 },
      { id: 'fort-sand-right', type: 'rect', style: 'sandbag', x: 775, y: 245, w: 155, h: 28 },
    ],
    optional: [
      { id: 'fort-crate-1', type: 'rect', style: 'crate', x: 255, y: 430, w: 72, h: 72 },
      { id: 'fort-crate-2', type: 'rect', style: 'crate', x: 1070, y: 335, w: 72, h: 72 },
      { id: 'fort-rock-1', type: 'circle', style: 'rock', x: 520, y: 410, r: 34 },
      { id: 'fort-rock-2', type: 'circle', style: 'rock', x: 880, y: 430, r: 34 },
      { id: 'fort-wall-optional-1', type: 'rect', style: 'wall', x: 180, y: 110, w: 140, h: 30 },
      { id: 'fort-wall-optional-2', type: 'rect', style: 'wall', x: 1080, y: 700, w: 140, h: 30 },
      { id: 'fort-bush-1', type: 'circle', style: 'bush', x: 585, y: 690, r: 28 },
      { id: 'fort-bush-2', type: 'circle', style: 'bush', x: 815, y: 145, r: 28 },
    ],
  },
  {
    id: 'stone-canyon',
    name: 'Каменный каньон',
    theme: 'canyon',
    spawns: [
      { a: { x: 170, y: 420, angle: 0 }, b: { x: 1230, y: 420, angle: Math.PI } },
      { a: { x: 240, y: 170, angle: 0.4 }, b: { x: 1160, y: 670, angle: Math.PI + 0.4 } },
      { a: { x: 240, y: 670, angle: -0.4 }, b: { x: 1160, y: 170, angle: Math.PI - 0.4 } },
    ],
    core: [
      { id: 'canyon-rock-a', type: 'circle', style: 'rock', x: 520, y: 255, r: 62 },
      { id: 'canyon-rock-b', type: 'circle', style: 'rock', x: 885, y: 585, r: 60 },
      { id: 'canyon-rock-c', type: 'circle', style: 'rock', x: 860, y: 240, r: 42 },
      { id: 'canyon-rock-d', type: 'circle', style: 'rock', x: 545, y: 600, r: 43 },
      { id: 'canyon-log-a', type: 'rect', style: 'log', x: 635, y: 160, w: 130, h: 26 },
      { id: 'canyon-log-b', type: 'rect', style: 'log', x: 635, y: 655, w: 130, h: 26 },
      { id: 'canyon-pine-a', type: 'circle', style: 'pine', x: 355, y: 445, r: 42 },
      { id: 'canyon-pine-b', type: 'circle', style: 'pine', x: 1050, y: 395, r: 42 },
    ],
    optional: [
      { id: 'canyon-rock-o1', type: 'circle', style: 'rock', x: 680, y: 420, r: 35 },
      { id: 'canyon-rock-o2', type: 'circle', style: 'rock', x: 735, y: 420, r: 31 },
      { id: 'canyon-bush-1', type: 'circle', style: 'bush', x: 390, y: 650, r: 29 },
      { id: 'canyon-bush-2', type: 'circle', style: 'bush', x: 1015, y: 185, r: 29 },
      { id: 'canyon-crate-1', type: 'rect', style: 'crate', x: 245, y: 290, w: 68, h: 68 },
      { id: 'canyon-crate-2', type: 'rect', style: 'crate', x: 1090, y: 515, w: 68, h: 68 },
      { id: 'canyon-sand-1', type: 'rect', style: 'sandbag', x: 455, y: 95, w: 135, h: 26 },
      { id: 'canyon-sand-2', type: 'rect', style: 'sandbag', x: 810, y: 720, w: 135, h: 26 },
    ],
  },
];

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle) {
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function circleRectOverlap(cx, cy, radius, rect) {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function circleCircleOverlap(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const radius = ar + br;
  return dx * dx + dy * dy < radius * radius;
}

function obstacleCollision(x, y, radius, obstacle) {
  if (obstacle.type === 'circle') {
    return circleCircleOverlap(x, y, radius, obstacle.x, obstacle.y, obstacle.r);
  }
  return circleRectOverlap(x, y, radius, obstacle);
}

function collidesArena(x, y, radius) {
  return x - radius < 12 || x + radius > ARENA.width - 12 || y - radius < 12 || y + radius > ARENA.height - 12;
}

function collidesObstacleList(x, y, radius, obstacles) {
  return obstacles.some((obstacle) => obstacleCollision(x, y, radius, obstacle));
}

function obstacleBounds(obstacle) {
  if (obstacle.type === 'circle') {
    return { x: obstacle.x - obstacle.r, y: obstacle.y - obstacle.r, w: obstacle.r * 2, h: obstacle.r * 2 };
  }
  return obstacle;
}

function obstacleTooClose(a, b, margin = 18) {
  const aa = obstacleBounds(a);
  const bb = obstacleBounds(b);
  return !(
    aa.x + aa.w + margin < bb.x
    || bb.x + bb.w + margin < aa.x
    || aa.y + aa.h + margin < bb.y
    || bb.y + bb.h + margin < aa.y
  );
}

function jitterObstacle(obstacle, amount = 24) {
  const next = { ...obstacle };
  next.x += Math.round((Math.random() * 2 - 1) * amount);
  next.y += Math.round((Math.random() * 2 - 1) * amount);
  next.variant = Math.floor(Math.random() * 4);
  return next;
}

const DESTRUCTIBLE_HP = {
  bush: 2,
  crate: 3,
  log: 4,
  sandbag: 4,
  pine: 5,
};

function prepareObstacle(obstacle) {
  const maxHp = DESTRUCTIBLE_HP[obstacle.style] || 0;
  const material = ['rock', 'wall', 'ruin'].includes(obstacle.style)
    ? 'stone'
    : (['crate', 'log', 'pine'].includes(obstacle.style) ? 'wood' : 'soft');

  return {
    ...obstacle,
    destructible: maxHp > 0,
    maxHp: maxHp || null,
    hp: maxHp || null,
    material,
  };
}

function obstacleCenter(obstacle) {
  if (obstacle.type === 'circle') return { x: obstacle.x, y: obstacle.y };
  return { x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2 };
}

function spawnIsClear(spawn, obstacles, clearance = SPAWN_CLEARANCE) {
  if (collidesArena(spawn.x, spawn.y, clearance)) return false;
  return !collidesObstacleList(spawn.x, spawn.y, clearance, obstacles);
}

function resolveSpawn(spawn, obstacles) {
  if (spawnIsClear(spawn, obstacles)) return { ...spawn };

  for (let radius = 45; radius <= 260; radius += 35) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const candidate = {
        ...spawn,
        x: clamp(spawn.x + Math.cos(angle) * radius, SPAWN_CLEARANCE, ARENA.width - SPAWN_CLEARANCE),
        y: clamp(spawn.y + Math.sin(angle) * radius, SPAWN_CLEARANCE, ARENA.height - SPAWN_CLEARANCE),
      };
      if (spawnIsClear(candidate, obstacles)) return candidate;
    }
  }

  const emergency = [
    { x: 140, y: ARENA.height / 2 },
    { x: ARENA.width - 140, y: ARENA.height / 2 },
    { x: ARENA.width / 2, y: 140 },
    { x: ARENA.width / 2, y: ARENA.height - 140 },
  ];
  const emergencyPoint = emergency.find((point) => spawnIsClear(point, obstacles));
  return emergencyPoint ? { ...spawn, ...emergencyPoint } : { ...spawn, x: 140, y: 140 };
}

function hasTraversablePath(start, end, obstacles) {
  const step = 56;
  const cols = Math.floor(ARENA.width / step);
  const rows = Math.floor(ARENA.height / step);
  const key = (col, row) => `${col}:${row}`;
  const pointFor = (col, row) => ({ x: col * step + step / 2, y: row * step + step / 2 });
  const toCell = (point) => ({
    col: clamp(Math.floor(point.x / step), 0, cols - 1),
    row: clamp(Math.floor(point.y / step), 0, rows - 1),
  });
  const free = (col, row) => {
    const point = pointFor(col, row);
    return !collidesArena(point.x, point.y, TANK_RADIUS + 10)
      && !collidesObstacleList(point.x, point.y, TANK_RADIUS + 10, obstacles);
  };

  const startCell = toCell(start);
  const endCell = toCell(end);
  const queue = [startCell];
  const seen = new Set([key(startCell.col, startCell.row)]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length > 0) {
    const current = queue.shift();
    if (Math.abs(current.col - endCell.col) <= 1 && Math.abs(current.row - endCell.row) <= 1) return true;

    for (const [dc, dr] of dirs) {
      const col = current.col + dc;
      const row = current.row + dr;
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      const id = key(col, row);
      if (seen.has(id) || !free(col, row)) continue;
      seen.add(id);
      queue.push({ col, row });
    }
  }
  return false;
}

function buildMap(template, variantSeed = 0) {
  const spawnBase = template.spawns[Math.floor(Math.random() * template.spawns.length)];

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const obstacles = template.core.map((item) => prepareObstacle({ ...item, variant: Math.floor(Math.random() * 4) }));
    const shuffledOptional = [...template.optional].sort(() => Math.random() - 0.5);
    const desiredOptional = 3 + Math.floor(Math.random() * 4);

    for (const source of shuffledOptional) {
      if (obstacles.length >= MAP_OBJECT_LIMIT || obstacles.length >= template.core.length + desiredOptional) break;
      const candidate = prepareObstacle(jitterObstacle(source, 22));
      const tooNearSpawn = [spawnBase.a, spawnBase.b].some((spawn) => obstacleCollision(spawn.x, spawn.y, SPAWN_CLEARANCE, candidate));
      const tooNearObject = obstacles.some((existing) => obstacleTooClose(candidate, existing, 10));
      if (!tooNearSpawn && !tooNearObject) obstacles.push(candidate);
    }

    const a = resolveSpawn(spawnBase.a, obstacles);
    const b = resolveSpawn(spawnBase.b, obstacles);
    const separated = Math.hypot(a.x - b.x, a.y - b.y) > TANK_RADIUS * 8;

    if (separated && hasTraversablePath(a, b, obstacles)) {
      return {
        id: template.id,
        name: template.name,
        theme: template.theme,
        variant: variantSeed,
        obstacles,
        spawns: { a, b },
      };
    }
  }

  const obstacles = template.core.map((item) => prepareObstacle({ ...item, variant: 0 }));
  return {
    id: template.id,
    name: template.name,
    theme: template.theme,
    variant: variantSeed,
    obstacles,
    spawns: {
      a: resolveSpawn(spawnBase.a, obstacles),
      b: resolveSpawn(spawnBase.b, obstacles),
    },
  };
}

function chooseRoundMap(previousId = null, round = 1) {
  const choices = MAP_TEMPLATES.filter((template) => template.id !== previousId);
  const template = choices[Math.floor(Math.random() * choices.length)] || MAP_TEMPLATES[0];
  return buildMap(template, round);
}

function publicTank(tank, now) {
  return {
    seat: tank.seat,
    color: tank.color,
    x: Math.round(tank.x * 10) / 10,
    y: Math.round(tank.y * 10) / 10,
    angle: tank.angle,
    rotationDirection: tank.rotationDirection,
    holding: tank.holding,
    heat: Math.round(tank.heat),
    overheatedMs: Math.max(0, tank.overheatedUntil - now),
  };
}

function makeTank(seat, color, spawn) {
  return {
    seat,
    color,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    rotationDirection: Math.random() < 0.5 ? -1 : 1,
    holding: false,
    pressStartedAt: 0,
    heat: 0,
    overheatedUntil: 0,
  };
}

export function createTankDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: 'red' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: 'blue' },
  };

  let scores = { a: 0, b: 0 };
  let round = 1;
  let phase = 'playing';
  let status = 'playing';
  let result = null;
  let roundWinner = null;
  let roundMessage = '';
  let bullets = [];
  let explosions = [];
  let obstacleImpacts = [];
  let bulletId = 1;
  let finishedOnce = false;
  let lastTickAt = Date.now();
  let roundResetTimer = null;
  let interval = null;
  let lastEmitAt = 0;
  let currentMap = chooseRoundMap(null, round);

  let tanks = {
    a: makeTank('a', 'red', currentMap.spawns.a),
    b: makeTank('b', 'blue', currentMap.spawns.b),
  };

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function collidesObstacle(x, y, radius) {
    return collidesObstacleList(x, y, radius, currentMap.obstacles);
  }

  function findHitObstacle(x, y, radius = 0) {
    return currentMap.obstacles.find((obstacle) => obstacleCollision(x, y, radius, obstacle)) || null;
  }

  function snapshotFor(socketId) {
    const now = Date.now();
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'tank-duel',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      arena: ARENA,
      map: {
        id: currentMap.id,
        name: currentMap.name,
        theme: currentMap.theme,
        variant: currentMap.variant,
      },
      obstacles: currentMap.obstacles,
      tanks: {
        a: publicTank(tanks.a, now),
        b: publicTank(tanks.b, now),
      },
      bullets: bullets.map((bullet) => ({ id: bullet.id, owner: bullet.owner, x: bullet.x, y: bullet.y })),
      explosions: explosions.map((explosion) => ({ id: explosion.id, x: explosion.x, y: explosion.y, life: explosion.life })),
      obstacleImpacts: obstacleImpacts.map((impact) => ({ ...impact })),
      scores,
      round,
      winsToMatch: WINS_TO_MATCH,
      phase,
      status,
      result,
      roundWinner,
      roundMessage,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_EVERY_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function addExplosion(x, y) {
    explosions.push({ id: `e${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x, y, life: 0.32 });
  }

  function addObstacleImpact(x, y, type, style) {
    obstacleImpacts.push({
      id: `oi${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x,
      y,
      type,
      style,
      life: type === 'break' ? 0.72 : 0.42,
      maxLife: type === 'break' ? 0.72 : 0.42,
    });
    if (obstacleImpacts.length > 18) obstacleImpacts = obstacleImpacts.slice(-18);
  }

  function damageObstacle(obstacle, hitX, hitY) {
    if (!obstacle) return;

    if (!obstacle.destructible || !Number.isFinite(obstacle.hp)) {
      addObstacleImpact(hitX, hitY, 'armor', obstacle.style);
      return;
    }

    obstacle.hp = Math.max(0, obstacle.hp - 1);
    if (obstacle.hp > 0) {
      addObstacleImpact(hitX, hitY, 'damage', obstacle.style);
      return;
    }

    const center = obstacleCenter(obstacle);
    currentMap.obstacles = currentMap.obstacles.filter((item) => item.id !== obstacle.id);
    addObstacleImpact(center.x, center.y, 'break', obstacle.style);
    addExplosion(center.x, center.y);
  }

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = { winner, type, message };
    roundWinner = winner;
    tanks.a.holding = false;
    tanks.b.holding = false;
    bullets = [];
    if (roundResetTimer) clearTimeout(roundResetTimer);
    if (interval) clearInterval(interval);
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resetRound() {
    if (status !== 'playing') return;
    currentMap = chooseRoundMap(currentMap.id, round);
    tanks = {
      a: makeTank('a', 'red', currentMap.spawns.a),
      b: makeTank('b', 'blue', currentMap.spawns.b),
    };
    bullets = [];
    explosions = [];
    obstacleImpacts = [];
    phase = 'playing';
    roundWinner = null;
    roundMessage = '';
    lastTickAt = Date.now();
    emitState(true);
  }

  function winRound(winner, message = 'Точный выстрел!') {
    if (status !== 'playing' || phase !== 'playing') return;
    scores = { ...scores, [winner]: scores[winner] + 1 };
    roundWinner = winner;
    roundMessage = message;
    phase = 'round-over';
    bullets = [];
    tanks.a.holding = false;
    tanks.b.holding = false;
    emitState(true);

    if (scores[winner] >= WINS_TO_MATCH) {
      finishMatch(winner, 'score', 'Первым выиграно два раунда.');
      return;
    }

    round += 1;
    roundResetTimer = setTimeout(resetRound, ROUND_RESET_MS);
    roundResetTimer.unref?.();
  }

  function tryShoot(seat, now) {
    if (status !== 'playing' || phase !== 'playing') return false;
    const tank = tanks[seat];
    if (!tank || now < tank.overheatedUntil) return false;

    const muzzleDistance = TANK_RADIUS + 15;
    const x = tank.x + Math.cos(tank.angle) * muzzleDistance;
    const y = tank.y + Math.sin(tank.angle) * muzzleDistance;

    bullets.push({
      id: `b${bulletId++}`,
      owner: seat,
      x,
      y,
      vx: Math.cos(tank.angle) * BULLET_SPEED,
      vy: Math.sin(tank.angle) * BULLET_SPEED,
      life: BULLET_TTL,
    });

    tank.heat = Math.min(100, tank.heat + HEAT_PER_SHOT);
    if (tank.heat >= 100) tank.overheatedUntil = now + OVERHEAT_MS;
    return true;
  }

  function handleControlDown(socketId) {
    if (status !== 'playing' || phase !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    const tank = tanks[seat];
    if (tank.holding) return;

    const now = Date.now();
    tank.holding = true;
    tank.pressStartedAt = now;
    tryShoot(seat, now);
    emitState(true);
  }

  function handleControlUp(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    const tank = tanks[seat];
    if (!tank.holding) return;

    tank.holding = false;
    tank.pressStartedAt = 0;
    if (phase === 'playing') tank.rotationDirection *= -1;
    emitState(true);
  }

  function moveTank(tank, dx, dy) {
    const other = tanks[opposite(tank.seat)];

    const nextX = tank.x + dx;
    const blockedX = collidesArena(nextX, tank.y, TANK_RADIUS)
      || collidesObstacle(nextX, tank.y, TANK_RADIUS)
      || circleCircleOverlap(nextX, tank.y, TANK_RADIUS, other.x, other.y, TANK_RADIUS);
    if (!blockedX) tank.x = nextX;

    const nextY = tank.y + dy;
    const blockedY = collidesArena(tank.x, nextY, TANK_RADIUS)
      || collidesObstacle(tank.x, nextY, TANK_RADIUS)
      || circleCircleOverlap(tank.x, nextY, TANK_RADIUS, other.x, other.y, TANK_RADIUS);
    if (!blockedY) tank.y = nextY;
  }

  function updateTank(tank, dt, now) {
    const isDriving = tank.holding && now - tank.pressStartedAt >= HOLD_DELAY_MS;
    if (!isDriving) tank.angle = normalizeAngle(tank.angle + ROTATION_SPEED * tank.rotationDirection * dt);

    if (tank.overheatedUntil > 0 && now >= tank.overheatedUntil) {
      tank.overheatedUntil = 0;
      tank.heat = Math.min(tank.heat, 35);
    }
    if (tank.overheatedUntil <= now) tank.heat = Math.max(0, tank.heat - HEAT_COOL_PER_SECOND * dt);

    if (isDriving) {
      const distance = TANK_SPEED * dt;
      moveTank(tank, Math.cos(tank.angle) * distance, Math.sin(tank.angle) * distance);
    }
  }

  function updateBullets(dt) {
    const remaining = [];

    for (const bullet of bullets) {
      bullet.life -= dt;
      if (bullet.life <= 0) continue;

      const travel = Math.hypot(bullet.vx, bullet.vy) * dt;
      const steps = Math.max(1, Math.ceil(travel / 6));
      let alive = true;
      for (let step = 0; step < steps && alive; step += 1) {
        bullet.x += (bullet.vx * dt) / steps;
        bullet.y += (bullet.vy * dt) / steps;

        if (collidesArena(bullet.x, bullet.y, BULLET_RADIUS)) {
          addExplosion(bullet.x, bullet.y);
          alive = false;
          break;
        }

        const hitObstacle = findHitObstacle(bullet.x, bullet.y, BULLET_RADIUS);
        if (hitObstacle) {
          damageObstacle(hitObstacle, bullet.x, bullet.y);
          alive = false;
          break;
        }

        const targetSeat = opposite(bullet.owner);
        const target = tanks[targetSeat];
        if (circleCircleOverlap(bullet.x, bullet.y, BULLET_RADIUS, target.x, target.y, TANK_RADIUS - 4)) {
          addExplosion(target.x, target.y);
          alive = false;
          winRound(bullet.owner, 'Противник подбит!');
          break;
        }
      }

      if (alive && phase === 'playing') remaining.push(bullet);
    }

    bullets = phase === 'playing' ? remaining : [];
  }

  function updateExplosions(dt) {
    explosions = explosions
      .map((explosion) => ({ ...explosion, life: explosion.life - dt }))
      .filter((explosion) => explosion.life > 0);
  }

  function updateObstacleImpacts(dt) {
    obstacleImpacts = obstacleImpacts
      .map((impact) => ({ ...impact, life: impact.life - dt }))
      .filter((impact) => impact.life > 0);
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'resign', 'Соперник покинул бой.');
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'control-down') handleControlDown(socketId);
    if (action.type === 'control-up') handleControlUp(socketId);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  interval = setInterval(() => {
    if (status !== 'playing') return;
    const now = Date.now();
    const dt = Math.min(0.025, Math.max(0.001, (now - lastTickAt) / 1000));
    lastTickAt = now;

    if (phase === 'playing') {
      updateTank(tanks.a, dt, now);
      updateTank(tanks.b, dt, now);
      updateBullets(dt);
    }
    updateExplosions(dt);
    updateObstacleImpacts(dt);
    emitState();
  }, PHYSICS_TICK_MS);
  interval.unref?.();

  return {
    id: roomId,
    gameId: 'tank-duel',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
      if (roundResetTimer) clearTimeout(roundResetTimer);
    },
  };
}
