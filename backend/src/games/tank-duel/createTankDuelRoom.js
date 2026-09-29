const ARENA = { width: 1000, height: 620 };
const PHYSICS_TICK_MS = 8;
const EMIT_EVERY_MS = 50;
const TANK_RADIUS = 27;
const TANK_SPEED = 165;
const ROTATION_SPEED = 1.72;
const BULLET_SPEED = 560;
const BULLET_RADIUS = 6;
const BULLET_TTL = 2.8;
const HOLD_DELAY_MS = 180;
const TAP_MAX_MS = 230;
const HEAT_PER_SHOT = 36;
const HEAT_COOL_PER_SECOND = 19;
const OVERHEAT_MS = 1000;
const ROUND_RESET_MS = 1600;
const WINS_TO_MATCH = 2;

const OBSTACLES = [
  { id: 'lt-top', type: 'rect', style: 'wood', x: 178, y: 94, w: 215, h: 24 },
  { id: 'lt-left', type: 'rect', style: 'wood', x: 178, y: 94, w: 24, h: 110 },
  { id: 'lt-right', type: 'rect', style: 'wood', x: 369, y: 94, w: 24, h: 110 },
  { id: 'lt-bottom', type: 'rect', style: 'wood', x: 178, y: 204, w: 215, h: 24 },

  { id: 'rb-top', type: 'rect', style: 'wood', x: 607, y: 401, w: 215, h: 24 },
  { id: 'rb-left', type: 'rect', style: 'wood', x: 607, y: 401, w: 24, h: 112 },
  { id: 'rb-right', type: 'rect', style: 'wood', x: 798, y: 401, w: 24, h: 112 },
  { id: 'rb-bottom', type: 'rect', style: 'wood', x: 607, y: 489, w: 215, h: 24 },

  { id: 'rt-top', type: 'rect', style: 'wood', x: 650, y: 92, w: 185, h: 24 },
  { id: 'rt-left', type: 'rect', style: 'wood', x: 650, y: 92, w: 24, h: 105 },
  { id: 'rt-right', type: 'rect', style: 'wood', x: 811, y: 92, w: 24, h: 105 },

  { id: 'lb-top', type: 'rect', style: 'wood', x: 164, y: 430, w: 190, h: 24 },
  { id: 'lb-left', type: 'rect', style: 'wood', x: 164, y: 430, w: 24, h: 90 },
  { id: 'lb-right', type: 'rect', style: 'wood', x: 330, y: 430, w: 24, h: 90 },

  { id: 'center-h', type: 'rect', style: 'stone', x: 425, y: 278, w: 150, h: 62 },
  { id: 'center-v', type: 'rect', style: 'stone', x: 469, y: 232, w: 62, h: 154 },

  { id: 'bush-a', type: 'circle', style: 'bush', x: 434, y: 145, r: 28 },
  { id: 'bush-b', type: 'circle', style: 'bush', x: 648, y: 244, r: 29 },
  { id: 'bush-c', type: 'circle', style: 'bush', x: 444, y: 486, r: 28 },
];

const SPAWN_SETS = [
  {
    a: { x: 250, y: 325, angle: -0.2 },
    b: { x: 748, y: 310, angle: Math.PI + 0.25 },
  },
  {
    a: { x: 115, y: 320, angle: 0.15 },
    b: { x: 885, y: 300, angle: Math.PI - 0.1 },
  },
  {
    a: { x: 405, y: 555, angle: -Math.PI / 2 },
    b: { x: 590, y: 66, angle: Math.PI / 2 },
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

function collidesObstacle(x, y, radius) {
  return OBSTACLES.some((obstacle) => {
    if (obstacle.type === 'circle') {
      return circleCircleOverlap(x, y, radius, obstacle.x, obstacle.y, obstacle.r);
    }
    return circleRectOverlap(x, y, radius, obstacle);
  });
}

function collidesArena(x, y, radius) {
  return x - radius < 8 || x + radius > ARENA.width - 8 || y - radius < 8 || y + radius > ARENA.height - 8;
}

function pointHitsObstacle(x, y, radius = 0) {
  return collidesArena(x, y, radius) || collidesObstacle(x, y, radius);
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
  let bulletId = 1;
  let finishedOnce = false;
  let lastTickAt = Date.now();
  let roundResetTimer = null;
  let interval = null;
  let lastEmitAt = 0;

  const firstSpawns = SPAWN_SETS[Math.floor(Math.random() * SPAWN_SETS.length)];
  let tanks = {
    a: makeTank('a', 'red', firstSpawns.a),
    b: makeTank('b', 'blue', firstSpawns.b),
  };

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
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
      obstacles: OBSTACLES,
      tanks: {
        a: publicTank(tanks.a, now),
        b: publicTank(tanks.b, now),
      },
      bullets: bullets.map((bullet) => ({
        id: bullet.id,
        owner: bullet.owner,
        x: bullet.x,
        y: bullet.y,
      })),
      explosions: explosions.map((explosion) => ({
        id: explosion.id,
        x: explosion.x,
        y: explosion.y,
        life: explosion.life,
      })),
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

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: 'tank-duel', roomId, message });
  }

  function addExplosion(x, y) {
    explosions.push({
      id: `e${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x,
      y,
      life: 0.32,
    });
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
    const spawns = SPAWN_SETS[(round - 1) % SPAWN_SETS.length];
    tanks = {
      a: makeTank('a', 'red', spawns.a),
      b: makeTank('b', 'blue', spawns.b),
    };
    bullets = [];
    explosions = [];
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
    if (tank.heat >= 100) {
      tank.overheatedUntil = now + OVERHEAT_MS;
    }
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

    const now = Date.now();
    const duration = now - tank.pressStartedAt;
    tank.holding = false;
    tank.pressStartedAt = 0;

    // Любое завершение нажатия меняет направление вращения:
    // короткий тап — как и раньше, а после поездки танк останавливается
    // и начинает крутиться в противоположную сторону.
    if (phase === 'playing') {
      tank.rotationDirection *= -1;
    }
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

    // Пока танк стоит, он постоянно вращается.
    // Во время движения направление фиксируется, поэтому танк едет строго прямо.
    if (!isDriving) {
      tank.angle = normalizeAngle(tank.angle + ROTATION_SPEED * tank.rotationDirection * dt);
    }

    if (tank.overheatedUntil > 0 && now >= tank.overheatedUntil) {
      tank.overheatedUntil = 0;
      tank.heat = Math.min(tank.heat, 35);
    }

    if (tank.overheatedUntil <= now) {
      tank.heat = Math.max(0, tank.heat - HEAT_COOL_PER_SECOND * dt);
    }

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
      const steps = Math.max(1, Math.ceil(travel / 7));
      let alive = true;
      for (let step = 0; step < steps && alive; step += 1) {
        bullet.x += (bullet.vx * dt) / steps;
        bullet.y += (bullet.vy * dt) / steps;

        if (pointHitsObstacle(bullet.x, bullet.y, BULLET_RADIUS)) {
          addExplosion(bullet.x, bullet.y);
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
