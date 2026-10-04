const WORLD = {
  width: 1000,
  height: 620,
};

const TANK_RADIUS = 30;
const BULLET_RADIUS = 7;
const BULLET_SPEED = 500;
const BULLET_LIFETIME_MS = 8_500;
const MAX_BOUNCES = 8;
const POINTS_TO_WIN = 7;
const PHYSICS_MS = 8;     // 125 Hz authoritative physics
const EMIT_MS = 33;       // ~30 snapshots/s; client extrapolates motion
const AIM_COOLDOWN_MS = 22;
const FIRE_COOLDOWN_MS = 100;

const TANK_MIN_Y = 100;
const TANK_MAX_Y = 520;
const ROUND_RESET_MS = 900;
const ARENA_SHIFT_MIN_MS = 9_000;
const ARENA_SHIFT_MAX_MS = 13_000;

const BUMPER_RADIUS = 34;
const CORE_RADIUS = 20;
const CORE_RESPAWN_MS = 2_800;

const ARENA_LAYOUTS = [
  {
    id: 'split-gates',
    name: 'РАЗДВИЖНЫЕ ВОРОТА',
    obstacles: [
      { id: 'lt', x: 245, y: 145, width: 175, height: 28 },
      { id: 'lb', x: 245, y: 447, width: 175, height: 28 },
      { id: 'rt', x: 580, y: 145, width: 175, height: 28 },
      { id: 'rb', x: 580, y: 447, width: 175, height: 28 },
    ],
  },
  {
    id: 'pillars',
    name: 'ДВОЙНЫЕ БАШНИ',
    obstacles: [
      { id: 'l1', x: 332, y: 112, width: 34, height: 172 },
      { id: 'l2', x: 332, y: 336, width: 34, height: 172 },
      { id: 'r1', x: 634, y: 112, width: 34, height: 172 },
      { id: 'r2', x: 634, y: 336, width: 34, height: 172 },
    ],
  },
  {
    id: 'zigzag',
    name: 'ЗИГЗАГ',
    obstacles: [
      { id: 'z1', x: 245, y: 186, width: 205, height: 28 },
      { id: 'z2', x: 550, y: 406, width: 205, height: 28 },
      { id: 'z3', x: 285, y: 426, width: 128, height: 24 },
      { id: 'z4', x: 587, y: 166, width: 128, height: 24 },
    ],
  },
  {
    id: 'funnels',
    name: 'КОРИДОРЫ',
    obstacles: [
      { id: 'f1', x: 252, y: 124, width: 32, height: 200 },
      { id: 'f2', x: 252, y: 392, width: 32, height: 104 },
      { id: 'f3', x: 716, y: 124, width: 32, height: 104 },
      { id: 'f4', x: 716, y: 296, width: 32, height: 200 },
    ],
  },
];

function safeName(value) {
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

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function normalizeAngle(angle) {
  let result = Number(angle) || 0;
  result %= Math.PI * 2;
  if (result < 0) result += Math.PI * 2;
  return result;
}

function tankForSeat(seat) {
  return seat === 'a'
    ? { x: 118, y: rand(175, 445), angle: 0, vy: rand(58, 92) * (Math.random() < 0.5 ? -1 : 1) }
    : { x: WORLD.width - 118, y: rand(175, 445), angle: Math.PI, vy: rand(58, 92) * (Math.random() < 0.5 ? -1 : 1) };
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pointInsideRect(x, y, rect, padding = 0) {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  );
}

function reflectBullet(bullet, nx, ny) {
  const dot = bullet.vx * nx + bullet.vy * ny;
  if (dot >= 0) return false;

  bullet.vx -= 2 * dot * nx;
  bullet.vy -= 2 * dot * ny;
  bullet.bounces += 1;
  return true;
}

function resolveWorldBounds(bullet) {
  if (bullet.x - BULLET_RADIUS < 0) {
    bullet.x = BULLET_RADIUS;
    reflectBullet(bullet, 1, 0);
  } else if (bullet.x + BULLET_RADIUS > WORLD.width) {
    bullet.x = WORLD.width - BULLET_RADIUS;
    reflectBullet(bullet, -1, 0);
  }

  if (bullet.y - BULLET_RADIUS < 0) {
    bullet.y = BULLET_RADIUS;
    reflectBullet(bullet, 0, 1);
  } else if (bullet.y + BULLET_RADIUS > WORLD.height) {
    bullet.y = WORLD.height - BULLET_RADIUS;
    reflectBullet(bullet, 0, -1);
  }
}

function resolveObstacle(bullet, rect) {
  const closestX = clamp(bullet.x, rect.x, rect.x + rect.width);
  const closestY = clamp(bullet.y, rect.y, rect.y + rect.height);
  let dx = bullet.x - closestX;
  let dy = bullet.y - closestY;
  let distSq = dx * dx + dy * dy;

  if (distSq >= BULLET_RADIUS * BULLET_RADIUS) return false;

  let nx = 0;
  let ny = 0;
  let dist = Math.sqrt(distSq);

  if (dist > 0.0001) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    const left = Math.abs(bullet.x - rect.x);
    const right = Math.abs(rect.x + rect.width - bullet.x);
    const top = Math.abs(bullet.y - rect.y);
    const bottom = Math.abs(rect.y + rect.height - bullet.y);
    const min = Math.min(left, right, top, bottom);

    if (min === left) nx = -1;
    else if (min === right) nx = 1;
    else if (min === top) ny = -1;
    else ny = 1;

    dist = 0;
  }

  const overlap = BULLET_RADIUS - dist;
  bullet.x += nx * (overlap + 0.45);
  bullet.y += ny * (overlap + 0.45);

  return reflectBullet(bullet, nx, ny);
}

function resolveCircleBumper(bullet, bumper) {
  let dx = bullet.x - bumper.x;
  let dy = bullet.y - bumper.y;
  let distance = Math.hypot(dx, dy);
  const minimum = BULLET_RADIUS + BUMPER_RADIUS;

  if (distance >= minimum) return false;

  if (distance < 0.0001) {
    dx = 1;
    dy = 0;
    distance = 1;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimum - distance;

  bullet.x += nx * (overlap + 0.5);
  bullet.y += ny * (overlap + 0.5);

  const bounced = reflectBullet(bullet, nx, ny);
  if (bounced) {
    // The moving bumper adds a little chaos/energy instead of being a memorisable wall.
    bullet.vy += bumper.vy * 0.28;
    const speed = Math.hypot(bullet.vx, bullet.vy) || BULLET_SPEED;
    const capped = Math.min(speed, BULLET_SPEED * 1.28);
    bullet.vx = bullet.vx / speed * capped;
    bullet.vy = bullet.vy / speed * capped;
  }

  return bounced;
}

function bulletSnapshot(bullet) {
  if (!bullet) return null;
  return {
    id: bullet.id,
    owner: bullet.owner,
    x: bullet.x,
    y: bullet.y,
    vx: bullet.vx,
    vy: bullet.vy,
    bounces: bullet.bounces,
    bornAt: bullet.bornAt,
    charged: Boolean(bullet.charged),
  };
}

export function createRicochetDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();

  const tanks = {
    a: {
      socketId: shuffled[0].socketId,
      name: safeName(shuffled[0].name),
      score: 0,
      color: 'red',
      ...tankForSeat('a'),
      lastAimAt: 0,
      lastFireAt: 0,
    },
    b: {
      socketId: shuffled[1].socketId,
      name: safeName(shuffled[1].name),
      score: 0,
      color: 'blue',
      ...tankForSeat('b'),
      lastAimAt: 0,
      lastFireAt: 0,
    },
  };

  const bullets = { a: null, b: null };

  let status = 'playing';
  let result = null;
  let eventSerial = 0;
  let lastEvent = null;
  let finishedOnce = false;
  let bulletSerial = 0;
  let lastPhysicsAt = Date.now();
  let layoutIndex = Math.floor(Math.random() * ARENA_LAYOUTS.length);
  let obstacles = ARENA_LAYOUTS[layoutIndex].obstacles.map((item) => ({ ...item }));
  let arenaName = ARENA_LAYOUTS[layoutIndex].name;
  let nextArenaShiftAt = Date.now() + rand(ARENA_SHIFT_MIN_MS, ARENA_SHIFT_MAX_MS);
  let roundResetAt = 0;
  let roundNumber = 1;

  const bumper = {
    x: WORLD.width / 2,
    y: rand(180, 440),
    vy: rand(70, 105) * (Math.random() < 0.5 ? -1 : 1),
    radius: BUMPER_RADIUS,
  };

  const core = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    active: false,
    respawnAt: Date.now() + 700,
    radius: CORE_RADIUS,
  };

  function seatForSocket(socketId) {
    if (tanks.a.socketId === socketId) return 'a';
    if (tanks.b.socketId === socketId) return 'b';
    return null;
  }

  function announce(type, message, extra = {}) {
    eventSerial += 1;
    lastEvent = {
      serial: eventSerial,
      type,
      message,
      at: Date.now(),
      ...extra,
    };
  }

  function chooseNewLayout(forceDifferent = true) {
    let next = Math.floor(Math.random() * ARENA_LAYOUTS.length);
    if (forceDifferent && ARENA_LAYOUTS.length > 1 && next === layoutIndex) {
      next = (next + 1 + Math.floor(Math.random() * (ARENA_LAYOUTS.length - 1))) % ARENA_LAYOUTS.length;
    }

    layoutIndex = next;
    obstacles = ARENA_LAYOUTS[next].obstacles.map((item) => ({ ...item }));
    arenaName = ARENA_LAYOUTS[next].name;
    nextArenaShiftAt = Date.now() + rand(ARENA_SHIFT_MIN_MS, ARENA_SHIFT_MAX_MS);
  }

  function corePositionIsSafe(x, y) {
    if (distanceSquared(x, y, tanks.a.x, tanks.a.y) < 95 * 95) return false;
    if (distanceSquared(x, y, tanks.b.x, tanks.b.y) < 95 * 95) return false;
    if (distanceSquared(x, y, bumper.x, bumper.y) < 80 * 80) return false;
    return !obstacles.some((rect) => pointInsideRect(x, y, rect, CORE_RADIUS + 14));
  }

  function spawnCore() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = rand(315, 685);
      const y = rand(110, 510);
      if (!corePositionIsSafe(x, y)) continue;
      core.x = x;
      core.y = y;
      core.active = true;
      core.respawnAt = 0;
      return;
    }

    core.x = 500;
    core.y = 310;
    core.active = true;
    core.respawnAt = 0;
  }

  function resetTankMotion() {
    for (const seat of ['a', 'b']) {
      const fresh = tankForSeat(seat);
      tanks[seat].y = fresh.y;
      tanks[seat].vy = fresh.vy;
      tanks[seat].angle = seat === 'a' ? 0 : Math.PI;
    }
  }

  function resetRound() {
    bullets.a = null;
    bullets.b = null;
    chooseNewLayout(true);
    resetTankMotion();

    bumper.y = rand(165, 455);
    bumper.vy = rand(75, 110) * (Math.random() < 0.5 ? -1 : 1);

    core.active = false;
    core.respawnAt = Date.now() + 550;
    roundResetAt = 0;
    roundNumber += 1;

    announce('arena', `Арена изменилась: ${arenaName}`);
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);

    return {
      gameId: 'ricochet-duel',
      roomId,
      serverTime: now,
      world: { ...WORLD },
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      status,
      phase: roundResetAt ? 'reset' : 'playing',
      pointsToWin: POINTS_TO_WIN,
      maxBounces: MAX_BOUNCES,
      roundNumber,
      arenaName,
      obstacles,
      nextArenaShiftAt,
      bumper: { ...bumper },
      core: { ...core },
      tanks: {
        a: {
          name: tanks.a.name,
          score: tanks.a.score,
          color: tanks.a.color,
          x: tanks.a.x,
          y: tanks.a.y,
          vy: tanks.a.vy,
          angle: tanks.a.angle,
          canFire: !roundResetAt && !bullets.a,
        },
        b: {
          name: tanks.b.name,
          score: tanks.b.score,
          color: tanks.b.color,
          x: tanks.b.x,
          y: tanks.b.y,
          vy: tanks.b.vy,
          angle: tanks.b.angle,
          canFire: !roundResetAt && !bullets.b,
        },
      },
      bullets: {
        a: bulletSnapshot(bullets.a),
        b: bulletSnapshot(bullets.b),
      },
      lastEvent,
      result,
    };
  }

  function emitState() {
    const now = Date.now();
    for (const seat of ['a', 'b']) {
      io.to(tanks[seat].socketId).emit('game:state', snapshotFor(tanks[seat].socketId, now));
    }
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    bullets.a = null;
    bullets.b = null;
    roundResetAt = 0;
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(tanks) });
    }
  }

  function expireBullet(seat, reason = 'expired') {
    if (!bullets[seat]) return;
    bullets[seat] = null;

    if (reason === 'bounces') {
      announce('spent', 'Пуля исчерпала рикошеты.', { seat });
    }
  }

  function hitCore(seat, bullet, now) {
    if (!core.active || bullet.charged) return;

    const radius = CORE_RADIUS + BULLET_RADIUS;
    if (distanceSquared(bullet.x, bullet.y, core.x, core.y) > radius * radius) return;

    bullet.charged = true;
    bullet.vx *= 1.16;
    bullet.vy *= 1.16;

    core.active = false;
    core.respawnAt = now + CORE_RESPAWN_MS;
    announce('core', `${tanks[seat].name} зарядил пулю! Следующее попадание сильнее.`, { seat });
  }

  function scoreHit(owner, victim, bullet) {
    let points = 1;
    const bonuses = [];

    if (bullet.bounces >= 3) {
      points += 1;
      bonuses.push('РИКОШЕТ x3');
    }

    if (bullet.charged) {
      points += 1;
      bonuses.push('ЭНЕРГОЯДРО');
    }

    tanks[owner].score += points;
    bullets.a = null;
    bullets.b = null;

    announce(
      'hit',
      `${tanks[owner].name}: +${points} ${bonuses.length ? `(${bonuses.join(' + ')})` : ''}`,
      { seat: owner, victim, points, bonuses },
    );

    if (tanks[owner].score >= POINTS_TO_WIN) {
      finish({
        type: 'win',
        winner: owner,
        message: `${tanks[owner].name} первым набрал ${POINTS_TO_WIN} очков.`,
      });
      return;
    }

    roundResetAt = Date.now() + ROUND_RESET_MS;
  }

  function stepTank(tank, dt) {
    if (roundResetAt) return;

    tank.y += tank.vy * dt;

    if (tank.y < TANK_MIN_Y) {
      tank.y = TANK_MIN_Y;
      tank.vy = Math.abs(tank.vy);
    } else if (tank.y > TANK_MAX_Y) {
      tank.y = TANK_MAX_Y;
      tank.vy = -Math.abs(tank.vy);
    }
  }

  function stepBumper(dt) {
    if (roundResetAt) return;

    bumper.y += bumper.vy * dt;
    const min = 105 + BUMPER_RADIUS;
    const max = WORLD.height - 105 - BUMPER_RADIUS;

    if (bumper.y < min) {
      bumper.y = min;
      bumper.vy = Math.abs(bumper.vy);
    } else if (bumper.y > max) {
      bumper.y = max;
      bumper.vy = -Math.abs(bumper.vy);
    }
  }

  function stepBullet(seat, bullet, dt, now) {
    if (!bullet || status !== 'playing' || roundResetAt) return;

    if (now - bullet.bornAt >= BULLET_LIFETIME_MS) {
      expireBullet(seat, 'time');
      return;
    }

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    resolveWorldBounds(bullet);

    for (const obstacle of obstacles) {
      resolveObstacle(bullet, obstacle);
    }

    resolveCircleBumper(bullet, bumper);
    hitCore(seat, bullet, now);

    if (bullet.bounces >= MAX_BOUNCES) {
      expireBullet(seat, 'bounces');
      return;
    }

    const victimSeat = opposite(seat);
    const victim = tanks[victimSeat];
    const hitRadius = TANK_RADIUS + BULLET_RADIUS;

    if (distanceSquared(bullet.x, bullet.y, victim.x, victim.y) <= hitRadius * hitRadius) {
      scoreHit(seat, victimSeat, bullet);
    }
  }

  function physicsTick() {
    if (status !== 'playing') return;

    const now = Date.now();
    const elapsedMs = clamp(now - lastPhysicsAt, 1, 40);
    lastPhysicsAt = now;
    const dt = elapsedMs / 1000;

    if (roundResetAt && now >= roundResetAt) {
      resetRound();
    }

    stepTank(tanks.a, dt);
    stepTank(tanks.b, dt);
    stepBumper(dt);

    if (!core.active && core.respawnAt && now >= core.respawnAt && !roundResetAt) {
      spawnCore();
    }

    if (
      !roundResetAt &&
      !bullets.a &&
      !bullets.b &&
      now >= nextArenaShiftAt
    ) {
      chooseNewLayout(true);
      core.active = false;
      core.respawnAt = now + 450;
      announce('arena', `Смена арены: ${arenaName}`);
    }

    stepBullet('a', bullets.a, dt, now);
    stepBullet('b', bullets.b, dt, now);
  }

  function aim(socketId, payload = {}) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    const tank = tanks[seat];
    const now = Date.now();
    if (now - tank.lastAimAt < AIM_COOLDOWN_MS) return;
    tank.lastAimAt = now;

    const nextAngle = Number(payload.angle);
    if (!Number.isFinite(nextAngle)) return;
    tank.angle = normalizeAngle(nextAngle);
  }

  function fire(socketId) {
    if (status !== 'playing' || roundResetAt) return;

    const seat = seatForSocket(socketId);
    if (!seat || bullets[seat]) return;

    const tank = tanks[seat];
    const now = Date.now();
    if (now - tank.lastFireAt < FIRE_COOLDOWN_MS) return;
    tank.lastFireAt = now;

    const cos = Math.cos(tank.angle);
    const sin = Math.sin(tank.angle);

    bulletSerial += 1;
    bullets[seat] = {
      id: `${seat}-${bulletSerial}`,
      owner: seat,
      x: tank.x + cos * (TANK_RADIUS + BULLET_RADIUS + 8),
      y: tank.y + sin * (TANK_RADIUS + BULLET_RADIUS + 8),
      vx: cos * BULLET_SPEED,
      vy: sin * BULLET_SPEED,
      bounces: 0,
      bornAt: now,
      charged: false,
    };

    announce('fire', `${tank.name} выстрелил.`, { seat });
    emitState();
  }

  function resign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    finish({
      type: 'resign',
      winner: opposite(seat),
      message: `${tanks[seat].name} вышел из дуэли.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'aim') aim(socketId, action.payload);
    if (action.type === 'fire') fire(socketId);
    if (action.type === 'resign') resign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    finish({
      type: 'disconnect',
      winner: opposite(seat),
      message: 'Соперник отключился.',
    });
  }

  const physicsTimer = setInterval(physicsTick, PHYSICS_MS);
  const emitTimer = setInterval(() => {
    if (status === 'playing') emitState();
  }, EMIT_MS);

  physicsTimer.unref?.();
  emitTimer.unref?.();

  return {
    playerSocketIds: [tanks.a.socketId, tanks.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(physicsTimer);
      clearInterval(emitTimer);
    },
  };
}
