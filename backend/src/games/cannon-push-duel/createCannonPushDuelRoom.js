const WORLD = { width: 1200, height: 720 };

const RED_ZONE_END = 410;
const BLUE_ZONE_START = 790;

const CANNON_X = { a: 180, b: WORLD.width - 180 };
const CANNON_Y = WORLD.height / 2;
const CANNON_ROTATION_SPEED = 1.92;
const RELOAD_ANGLE = { a: Math.PI, b: 0 };
const RELOAD_WINDOW = 0.105;

const BALL_RADIUS = 38;
const BALL_IMPULSE = 120;
const BALL_DRAG_PER_SEC = 1.55;
const BALL_MAX_SPEED = 270;

const BULLET_RADIUS = 8;
const BULLET_SPEED = 610;
const BULLET_LIFETIME_MS = 4_800;

const MATCH_MS = 90_000;
const GOAL_RESET_MS = 1_050;
const PHYSICS_MS = 8;
const EMIT_MS = 33;

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const clean = value.trim().slice(0, 28);
  return clean || 'Игрок';
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

function angularDistance(a, b) {
  const raw = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(raw, Math.PI * 2 - raw);
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function capBall(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= BALL_MAX_SPEED || speed <= 0.0001) return;
  const scale = BALL_MAX_SPEED / speed;
  ball.vx *= scale;
  ball.vy *= scale;
}

function reflectBulletFromWorld(bullet) {
  if (bullet.x - BULLET_RADIUS < 18) {
    bullet.x = 18 + BULLET_RADIUS;
    bullet.vx = Math.abs(bullet.vx);
  } else if (bullet.x + BULLET_RADIUS > WORLD.width - 18) {
    bullet.x = WORLD.width - 18 - BULLET_RADIUS;
    bullet.vx = -Math.abs(bullet.vx);
  }

  if (bullet.y - BULLET_RADIUS < 18) {
    bullet.y = 18 + BULLET_RADIUS;
    bullet.vy = Math.abs(bullet.vy);
  } else if (bullet.y + BULLET_RADIUS > WORLD.height - 18) {
    bullet.y = WORLD.height - 18 - BULLET_RADIUS;
    bullet.vy = -Math.abs(bullet.vy);
  }
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
    bornAt: bullet.bornAt,
  };
}

export function createCannonPushDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const now = Date.now();

  const playersBySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name), score: 0 },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name), score: 0 },
  };

  const cannons = {
    a: { angle: 0, loaded: true, hasLeftReloadZone: true },
    b: { angle: Math.PI, loaded: true, hasLeftReloadZone: true },
  };

  const bullets = { a: null, b: null };

  const ball = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    vx: 0,
    vy: 0,
  };

  let bulletSerial = 0;
  let status = 'playing';
  let result = null;
  let startedAt = now;
  let endsAt = now + MATCH_MS;
  let lastPhysicsAt = now;
  let lastEvent = null;
  let eventSerial = 0;
  let goalResetAt = 0;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (playersBySeat.a.socketId === socketId) return 'a';
    if (playersBySeat.b.socketId === socketId) return 'b';
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

  function snapshotFor(socketId, timestamp = Date.now()) {
    const playerSeat = seatForSocket(socketId);

    return {
      gameId: 'cannon-push-duel',
      roomId,
      serverTime: timestamp,
      world: { ...WORLD },
      redZoneEnd: RED_ZONE_END,
      blueZoneStart: BLUE_ZONE_START,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      status,
      phase: goalResetAt ? 'goal-reset' : 'playing',
      startedAt,
      endsAt,
      timeLeftMs: Math.max(0, endsAt - timestamp),
      players: {
        a: { name: playersBySeat.a.name, score: playersBySeat.a.score },
        b: { name: playersBySeat.b.name, score: playersBySeat.b.score },
      },
      cannons: {
        a: { x: CANNON_X.a, y: CANNON_Y, angle: cannons.a.angle, loaded: cannons.a.loaded },
        b: { x: CANNON_X.b, y: CANNON_Y, angle: cannons.b.angle, loaded: cannons.b.loaded },
      },
      bullets: {
        a: bulletSnapshot(bullets.a),
        b: bulletSnapshot(bullets.b),
      },
      ball: { ...ball },
      lastEvent,
      result,
    };
  }

  function emitState() {
    const timestamp = Date.now();
    io.to(playersBySeat.a.socketId).emit('game:state', snapshotFor(playersBySeat.a.socketId, timestamp));
    io.to(playersBySeat.b.socketId).emit('game:state', snapshotFor(playersBySeat.b.socketId, timestamp));
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    bullets.a = null;
    bullets.b = null;
    goalResetAt = 0;
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(playersBySeat) });
    }
  }

  function finishByTime() {
    const aScore = playersBySeat.a.score;
    const bScore = playersBySeat.b.score;

    if (aScore === bScore) {
      finish({ type: 'draw', winner: null, message: `Ничья ${aScore}:${bScore}.` });
      return;
    }

    const winner = aScore > bScore ? 'a' : 'b';
    finish({
      type: 'win',
      winner,
      message: `${playersBySeat[winner].name} победил ${Math.max(aScore, bScore)}:${Math.min(aScore, bScore)}.`,
    });
  }

  function resetAfterGoal() {
    ball.x = WORLD.width / 2;
    ball.y = WORLD.height / 2;
    ball.vx = 0;
    ball.vy = 0;
    bullets.a = null;
    bullets.b = null;
    cannons.a.loaded = true;
    cannons.b.loaded = true;
    cannons.a.hasLeftReloadZone = true;
    cannons.b.hasLeftReloadZone = true;
    goalResetAt = 0;
  }

  function scoreGoal(scoringSeat) {
    playersBySeat[scoringSeat].score += 1;
    const concededSeat = opposite(scoringSeat);

    announce('goal', `${playersBySeat[scoringSeat].name} забивает!`, {
      seat: scoringSeat,
      concededSeat,
    });

    ball.vx = 0;
    ball.vy = 0;
    bullets.a = null;
    bullets.b = null;
    goalResetAt = Date.now() + GOAL_RESET_MS;
  }

  function stepCannons(dt) {
    // Left cannon rotates visually counter-clockwise.
    // Right cannon rotates the opposite way in world-space; the client mirrors
    // the board for player B, so each player sees THEIR OWN cannon rotating CCW.
    cannons.a.angle = normalizeAngle(cannons.a.angle - CANNON_ROTATION_SPEED * dt);
    cannons.b.angle = normalizeAngle(cannons.b.angle + CANNON_ROTATION_SPEED * dt);

    for (const seat of ['a', 'b']) {
      const cannon = cannons[seat];
      if (cannon.loaded) continue;

      const insideReloadZone =
        angularDistance(cannon.angle, RELOAD_ANGLE[seat]) <= RELOAD_WINDOW;

      if (!cannon.hasLeftReloadZone) {
        if (!insideReloadZone) cannon.hasLeftReloadZone = true;
        continue;
      }

      if (insideReloadZone && !bullets[seat]) {
        cannon.loaded = true;
        cannon.hasLeftReloadZone = false;
        announce('reload', `${playersBySeat[seat].name}: патрон заряжен.`, { seat });
      }
    }
  }

  function stepBall(dt) {
    if (goalResetAt) return;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    const drag = Math.exp(-BALL_DRAG_PER_SEC * dt);
    ball.vx *= drag;
    ball.vy *= drag;

    if (Math.abs(ball.vx) < 0.15) ball.vx = 0;
    if (Math.abs(ball.vy) < 0.15) ball.vy = 0;

    const minY = 24 + BALL_RADIUS;
    const maxY = WORLD.height - 24 - BALL_RADIUS;

    if (ball.y < minY) {
      ball.y = minY;
      ball.vy = Math.abs(ball.vy) * 0.72;
    } else if (ball.y > maxY) {
      ball.y = maxY;
      ball.vy = -Math.abs(ball.vy) * 0.72;
    }

    // Goal only when the ENTIRE ball is in the coloured territory.
    if (ball.x + BALL_RADIUS <= RED_ZONE_END) {
      scoreGoal('b');
      return;
    }

    if (ball.x - BALL_RADIUS >= BLUE_ZONE_START) {
      scoreGoal('a');
      return;
    }

    ball.x = clamp(ball.x, BALL_RADIUS + 22, WORLD.width - BALL_RADIUS - 22);
  }

  function applyBulletToBall(seat, bullet) {
    let dx = ball.x - bullet.x;
    let dy = ball.y - bullet.y;
    let distance = Math.hypot(dx, dy);

    if (distance < 0.0001) {
      dx = bullet.vx;
      dy = bullet.vy;
      distance = Math.hypot(dx, dy) || 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;

    // Off-centre hits naturally create sideways motion.
    ball.vx += nx * BALL_IMPULSE;
    ball.vy += ny * BALL_IMPULSE;
    capBall(ball);

    bullets[seat] = null;
    announce('hit', `${playersBySeat[seat].name} толкает мяч.`, { seat });
  }

  function stepBullet(seat, bullet, dt, timestamp) {
    if (!bullet || goalResetAt) return;

    if (timestamp - bullet.bornAt >= BULLET_LIFETIME_MS) {
      bullets[seat] = null;
      return;
    }

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    reflectBulletFromWorld(bullet);

    const collisionRadius = BALL_RADIUS + BULLET_RADIUS;
    if (distanceSquared(bullet.x, bullet.y, ball.x, ball.y) <= collisionRadius * collisionRadius) {
      applyBulletToBall(seat, bullet);
      return;
    }

    // Missed bullets disappear as soon as they reach enemy territory.
    if (seat === 'a' && bullet.x - BULLET_RADIUS >= BLUE_ZONE_START) {
      bullets.a = null;
      return;
    }

    if (seat === 'b' && bullet.x + BULLET_RADIUS <= RED_ZONE_END) {
      bullets.b = null;
    }
  }

  function physicsTick() {
    if (status !== 'playing') return;

    const timestamp = Date.now();
    const elapsedMs = clamp(timestamp - lastPhysicsAt, 1, 40);
    lastPhysicsAt = timestamp;
    const dt = elapsedMs / 1000;

    if (timestamp >= endsAt) {
      finishByTime();
      return;
    }

    stepCannons(dt);

    if (goalResetAt && timestamp >= goalResetAt) {
      resetAfterGoal();
      announce('reset', 'Мяч снова в центре.');
    }

    stepBall(dt);
    stepBullet('a', bullets.a, dt, timestamp);
    stepBullet('b', bullets.b, dt, timestamp);
  }

  function fire(socketId) {
    if (status !== 'playing' || goalResetAt) return;

    const seat = seatForSocket(socketId);
    if (!seat) return;

    const cannon = cannons[seat];
    if (!cannon.loaded || bullets[seat]) return;

    const cos = Math.cos(cannon.angle);
    const sin = Math.sin(cannon.angle);

    bulletSerial += 1;
    bullets[seat] = {
      id: `${seat}-${bulletSerial}`,
      owner: seat,
      x: CANNON_X[seat] + cos * 60,
      y: CANNON_Y + sin * 60,
      vx: cos * BULLET_SPEED,
      vy: sin * BULLET_SPEED,
      bornAt: Date.now(),
    };

    cannon.loaded = false;
    cannon.hasLeftReloadZone =
      angularDistance(cannon.angle, RELOAD_ANGLE[seat]) > RELOAD_WINDOW;

    announce('fire', `${playersBySeat[seat].name} стреляет.`, { seat });
    emitState();
  }

  function resign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    finish({
      type: 'resign',
      winner: opposite(seat),
      message: `${playersBySeat[seat].name} вышел из матча.`,
    });
  }

  function handleAction(socketId, action = {}) {
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
    playerSocketIds: [playersBySeat.a.socketId, playersBySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(physicsTimer);
      clearInterval(emitTimer);
    },
  };
}
