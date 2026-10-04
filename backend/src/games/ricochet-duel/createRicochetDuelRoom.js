const WORLD = {
  width: 1000,
  height: 620,
};

const TANK_RADIUS = 30;
const BULLET_RADIUS = 7;
const BULLET_SPEED = 470;
const BULLET_LIFETIME_MS = 7_500;
const MAX_BOUNCES = 7;
const HITS_TO_WIN = 3;
const PHYSICS_MS = 8;     // 125 Hz physics
const EMIT_MS = 33;       // ~30 network snapshots/s
const AIM_COOLDOWN_MS = 22;
const FIRE_COOLDOWN_MS = 100;

const OBSTACLES = [
  { id: 'center', x: 470, y: 178, width: 60, height: 264 },
  { id: 'lt', x: 255, y: 108, width: 155, height: 26 },
  { id: 'lb', x: 255, y: 486, width: 155, height: 26 },
  { id: 'rt', x: 590, y: 108, width: 155, height: 26 },
  { id: 'rb', x: 590, y: 486, width: 155, height: 26 },
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

function normalizeAngle(angle) {
  let result = Number(angle) || 0;
  result %= Math.PI * 2;
  if (result < 0) result += Math.PI * 2;
  return result;
}

function tankForSeat(seat) {
  return seat === 'a'
    ? { x: 120, y: WORLD.height / 2, angle: 0 }
    : { x: WORLD.width - 120, y: WORLD.height / 2, angle: Math.PI };
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
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
  let bounced = false;

  if (bullet.x - BULLET_RADIUS < 0) {
    bullet.x = BULLET_RADIUS;
    bounced = reflectBullet(bullet, 1, 0) || bounced;
  } else if (bullet.x + BULLET_RADIUS > WORLD.width) {
    bullet.x = WORLD.width - BULLET_RADIUS;
    bounced = reflectBullet(bullet, -1, 0) || bounced;
  }

  if (bullet.y - BULLET_RADIUS < 0) {
    bullet.y = BULLET_RADIUS;
    bounced = reflectBullet(bullet, 0, 1) || bounced;
  } else if (bullet.y + BULLET_RADIUS > WORLD.height) {
    bullet.y = WORLD.height - BULLET_RADIUS;
    bounced = reflectBullet(bullet, 0, -1) || bounced;
  }

  return bounced;
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
    // Bullet centre is inside the rectangle. Push it out through the nearest side.
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

  function seatForSocket(socketId) {
    if (tanks.a.socketId === socketId) return 'a';
    if (tanks.b.socketId === socketId) return 'b';
    return null;
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
      hitsToWin: HITS_TO_WIN,
      maxBounces: MAX_BOUNCES,
      obstacles: OBSTACLES,
      tanks: {
        a: {
          name: tanks.a.name,
          score: tanks.a.score,
          color: tanks.a.color,
          x: tanks.a.x,
          y: tanks.a.y,
          angle: tanks.a.angle,
          canFire: !bullets.a,
        },
        b: {
          name: tanks.b.name,
          score: tanks.b.score,
          color: tanks.b.color,
          x: tanks.b.x,
          y: tanks.b.y,
          angle: tanks.b.angle,
          canFire: !bullets.b,
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
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(tanks) });
    }
  }

  function expireBullet(seat, reason = 'expired') {
    const bullet = bullets[seat];
    if (!bullet) return;
    bullets[seat] = null;

    if (reason === 'bounces') {
      eventSerial += 1;
      lastEvent = {
        serial: eventSerial,
        type: 'spent',
        seat,
        message: 'Пуля исчерпала рикошеты.',
        at: Date.now(),
      };
    }
  }

  function scoreHit(owner, victim) {
    tanks[owner].score += 1;
    bullets[owner] = null;

    eventSerial += 1;
    lastEvent = {
      serial: eventSerial,
      type: 'hit',
      seat: owner,
      victim,
      message: `${tanks[owner].name} попал рикошетом!`,
      at: Date.now(),
    };

    if (tanks[owner].score >= HITS_TO_WIN) {
      finish({
        type: 'win',
        winner: owner,
        message: `${tanks[owner].name} первым сделал ${HITS_TO_WIN} попадания.`,
      });
    }
  }

  function stepBullet(seat, bullet, dt, now) {
    if (!bullet || status !== 'playing') return;

    if (now - bullet.bornAt >= BULLET_LIFETIME_MS) {
      expireBullet(seat, 'time');
      return;
    }

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    resolveWorldBounds(bullet);

    for (const obstacle of OBSTACLES) {
      resolveObstacle(bullet, obstacle);
    }

    if (bullet.bounces >= MAX_BOUNCES) {
      expireBullet(seat, 'bounces');
      return;
    }

    const victimSeat = opposite(seat);
    const victim = tanks[victimSeat];
    const hitRadius = TANK_RADIUS + BULLET_RADIUS;

    if (
      distanceSquared(bullet.x, bullet.y, victim.x, victim.y) <= hitRadius * hitRadius
    ) {
      scoreHit(seat, victimSeat);
    }
  }

  function physicsTick() {
    if (status !== 'playing') return;
    const now = Date.now();
    const elapsedMs = clamp(now - lastPhysicsAt, 1, 40);
    lastPhysicsAt = now;
    const dt = elapsedMs / 1000;

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
    if (status !== 'playing') return;
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
    };

    eventSerial += 1;
    lastEvent = {
      serial: eventSerial,
      type: 'fire',
      seat,
      message: `${tank.name} выстрелил.`,
      at: now,
    };

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
