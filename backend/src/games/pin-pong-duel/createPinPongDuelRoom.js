const WORLD = {
  width: 1200,
  height: 700,
  left: 54,
  right: 1146,
  top: 74,
  bottom: 626,
  centerY: 350,
};

const BALL_RADIUS = 18;
const BALL_START_SPEED = 345;
const BALL_MAX_SPEED = 900;
const BALL_ACCEL_PER_HIT = 1.032;

const FLIPPER_LENGTH = 126;
const FLIPPER_RADIUS = 15;
const FLIPPER_SPEED = 10.5; // radians / sec
const FLIPPER_KICK = 0.68;
const FLIPPER_RESTITUTION = 1.04;

const PHYSICS_MS = 8;   // ~125Hz authoritative physics
const EMIT_MS = 55;     // ~18 network snapshots/s
const COUNTDOWN_MS = 1500;
const GOAL_PAUSE_MS = 1200;
const WINS_TO_MATCH = 2;
const INPUT_COOLDOWN_MS = 32;

const FLIPPERS = {
  aTop: {
    side: 'a',
    pivotX: 173,
    pivotY: 245,
    restAngle: -0.78,
    activeAngle: 0.18,
  },
  aBottom: {
    side: 'a',
    pivotX: 173,
    pivotY: 455,
    restAngle: 0.78,
    activeAngle: -0.18,
  },
  bTop: {
    side: 'b',
    pivotX: 1027,
    pivotY: 245,
    restAngle: Math.PI + 0.78,
    activeAngle: Math.PI - 0.18,
  },
  bBottom: {
    side: 'b',
    pivotX: 1027,
    pivotY: 455,
    restAngle: Math.PI - 0.78,
    activeAngle: Math.PI + 0.18,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const name = value.trim().slice(0, 28);
  return name || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function shortestAngleDelta(target, current) {
  return normalizeAngle(target - current);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function makeBall(direction = Math.random() < 0.5 ? -1 : 1) {
  const angle = rand(-0.52, 0.52);
  const horizontal = Math.max(0.80, Math.cos(angle));

  return {
    x: WORLD.width / 2,
    y: WORLD.height / 2 + rand(-54, 54),
    vx: direction * BALL_START_SPEED * horizontal,
    vy: BALL_START_SPEED * Math.sin(angle),
    radius: BALL_RADIUS,
    lastTouch: null,
  };
}

function makeFlipper(key) {
  const base = FLIPPERS[key];

  return {
    key,
    ...base,
    angle: base.restAngle,
    angularVelocity: 0,
  };
}

function flipperEnd(flipper) {
  return {
    x: flipper.pivotX + Math.cos(flipper.angle) * FLIPPER_LENGTH,
    y: flipper.pivotY + Math.sin(flipper.angle) * FLIPPER_LENGTH,
  };
}

function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;

  if (len2 <= 0.0001) return { x: ax, y: ay, t: 0 };

  const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);

  return {
    x: ax + abx * t,
    y: ay + aby * t,
    t,
  };
}

function capBallSpeed(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);

  if (speed > BALL_MAX_SPEED) {
    const k = BALL_MAX_SPEED / speed;
    ball.vx *= k;
    ball.vy *= k;
  }
}

function resolveFlipperBall(ball, flipper) {
  const end = flipperEnd(flipper);
  const closest = nearestPointOnSegment(
    ball.x,
    ball.y,
    flipper.pivotX,
    flipper.pivotY,
    end.x,
    end.y,
  );

  let dx = ball.x - closest.x;
  let dy = ball.y - closest.y;
  let dist = Math.hypot(dx, dy);

  const minDist = BALL_RADIUS + FLIPPER_RADIUS;

  if (dist >= minDist) return false;

  if (dist < 0.0001) {
    const nx0 = -Math.sin(flipper.angle);
    const ny0 = Math.cos(flipper.angle);
    dx = nx0;
    dy = ny0;
    dist = 1;
  }

  const nx = dx / dist;
  const ny = dy / dist;

  const overlap = minDist - dist;
  ball.x += nx * (overlap + 0.6);
  ball.y += ny * (overlap + 0.6);

  // Surface velocity of the rotating flipper at the contact point.
  const rx = closest.x - flipper.pivotX;
  const ry = closest.y - flipper.pivotY;
  const surfaceVx = -flipper.angularVelocity * ry;
  const surfaceVy = flipper.angularVelocity * rx;

  const relVx = ball.vx - surfaceVx;
  const relVy = ball.vy - surfaceVy;
  const relNormal = relVx * nx + relVy * ny;

  if (relNormal < 0) {
    const bounce = -(1 + FLIPPER_RESTITUTION) * relNormal;

    ball.vx += nx * bounce;
    ball.vy += ny * bounce;

    // Extra "feel" from a paddle moving into the ball.
    const kickNormal = surfaceVx * nx + surfaceVy * ny;
    if (kickNormal > 0) {
      ball.vx += nx * kickNormal * FLIPPER_KICK;
      ball.vy += ny * kickNormal * FLIPPER_KICK;
    }

    ball.vx *= BALL_ACCEL_PER_HIT;
    ball.vy *= BALL_ACCEL_PER_HIT;
    capBallSpeed(ball);

    ball.lastTouch = flipper.side;
  }

  return true;
}

function publicFlipper(flipper) {
  return {
    key: flipper.key,
    side: flipper.side,
    pivotX: flipper.pivotX,
    pivotY: flipper.pivotY,
    angle: Math.round(flipper.angle * 10000) / 10000,
    angularVelocity: Math.round(flipper.angularVelocity * 10000) / 10000,
  };
}

function publicBall(ball) {
  return {
    x: Math.round(ball.x * 10) / 10,
    y: Math.round(ball.y * 10) / 10,
    vx: Math.round(ball.vx * 10) / 10,
    vy: Math.round(ball.vy * 10) / 10,
    radius: ball.radius,
  };
}

export function createPinPongDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();

  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };

  let scores = { a: 0, b: 0 };
  let pressed = { a: false, b: false };
  let lastInputAt = { a: 0, b: 0 };

  let ball = makeBall();
  let flippers = {
    aTop: makeFlipper('aTop'),
    aBottom: makeFlipper('aBottom'),
    bTop: makeFlipper('bTop'),
    bBottom: makeFlipper('bBottom'),
  };

  let status = 'playing';
  let phase = 'countdown';
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let serveDirection = Math.random() < 0.5 ? -1 : 1;
  let roundMessage = 'Приготовьтесь';
  let result = null;

  let physicsTimer = null;
  let phaseTimer = null;
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);

    return {
      gameId: 'pin-pong-duel',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,

      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },

      world: WORLD,
      ball: publicBall(ball),

      flippers: {
        aTop: publicFlipper(flippers.aTop),
        aBottom: publicFlipper(flippers.aBottom),
        bTop: publicFlipper(flippers.bTop),
        bBottom: publicFlipper(flippers.bBottom),
      },

      pressed,
      scores,
      winsToMatch: WINS_TO_MATCH,
      phase,
      status,
      countdownEndsAt,
      roundMessage,
      result,
    };
  }

  function emitState(force = false) {
    const now = Date.now();

    if (!force && now - lastEmitAt < EMIT_MS) return;
    lastEmitAt = now;

    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit(
        'game:state',
        snapshotFor(bySeat[seat].socketId),
      );
    }
  }

  function clearPhaseTimer() {
    if (phaseTimer) clearTimeout(phaseTimer);
    phaseTimer = null;
  }

  function stopPhysics() {
    if (physicsTimer) clearInterval(physicsTimer);
    physicsTimer = null;
  }

  function finishMatch(winner, message) {
    if (status === 'finished') return;

    status = 'finished';
    phase = 'finished';
    pressed = { a: false, b: false };

    result = {
      winner,
      draw: false,
      message,
    };

    emitState(true);
    clearPhaseTimer();
    stopPhysics();

    if (!finishedOnce) {
      finishedOnce = true;

      // Release Matchmaker room immediately so rematch works instantly.
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resetServe(direction) {
    ball = makeBall(direction);
    flippers = {
      aTop: makeFlipper('aTop'),
      aBottom: makeFlipper('aBottom'),
      bTop: makeFlipper('bTop'),
      bBottom: makeFlipper('bBottom'),
    };
    pressed = { a: false, b: false };

    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    roundMessage = direction < 0 ? 'Подача влево' : 'Подача вправо';

    emitState(true);

    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      if (status !== 'playing') return;

      phase = 'playing';
      roundMessage = '';
      lastTickAt = Date.now();
      emitState(true);
    }, COUNTDOWN_MS);

    phaseTimer.unref?.();
  }

  function scoreGoal(winner) {
    if (phase !== 'playing' || status !== 'playing') return;

    scores = {
      ...scores,
      [winner]: scores[winner] + 1,
    };

    phase = 'goal';
    pressed = { a: false, b: false };
    roundMessage = `Гол! ${bySeat[winner].name}`;
    emitState(true);

    if (scores[winner] >= WINS_TO_MATCH) {
      clearPhaseTimer();
      phaseTimer = setTimeout(() => {
        finishMatch(
          winner,
          `${bySeat[winner].name} первым забил ${WINS_TO_MATCH} гола.`,
        );
      }, GOAL_PAUSE_MS);

      phaseTimer.unref?.();
      return;
    }

    // Serve toward the player who just conceded.
    serveDirection = winner === 'a' ? 1 : -1;

    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      resetServe(serveDirection);
    }, GOAL_PAUSE_MS);

    phaseTimer.unref?.();
  }

  function updateFlipper(flipper, active, dt) {
    const target = active ? flipper.activeAngle : flipper.restAngle;
    const delta = shortestAngleDelta(target, flipper.angle);
    const maxStep = FLIPPER_SPEED * dt;
    const step = clamp(delta, -maxStep, maxStep);

    flipper.angularVelocity = dt > 0 ? step / dt : 0;
    flipper.angle = normalizeAngle(flipper.angle + step);

    if (Math.abs(delta) < 0.002) {
      flipper.angle = target;
      flipper.angularVelocity = 0;
    }
  }

  function stepBall(dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Top/bottom cushions.
    if (ball.y - BALL_RADIUS < WORLD.top) {
      ball.y = WORLD.top + BALL_RADIUS;
      ball.vy = Math.abs(ball.vy) * 0.995;
    }

    if (ball.y + BALL_RADIUS > WORLD.bottom) {
      ball.y = WORLD.bottom - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy) * 0.995;
    }

    // Small back walls outside the central goal mouth.
    const goalTop = 270;
    const goalBottom = 430;

    if (ball.x - BALL_RADIUS < WORLD.left && (ball.y < goalTop || ball.y > goalBottom)) {
      ball.x = WORLD.left + BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 0.985;
    }

    if (ball.x + BALL_RADIUS > WORLD.right && (ball.y < goalTop || ball.y > goalBottom)) {
      ball.x = WORLD.right - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 0.985;
    }

    // Flipper collision iterations keep fast balls from tunnelling.
    for (let i = 0; i < 2; i += 1) {
      resolveFlipperBall(ball, flippers.aTop);
      resolveFlipperBall(ball, flippers.aBottom);
      resolveFlipperBall(ball, flippers.bTop);
      resolveFlipperBall(ball, flippers.bBottom);
    }

    // A goal counts only through the central opening.
    if (ball.x < WORLD.left - BALL_RADIUS * 2) {
      scoreGoal('b');
      return;
    }

    if (ball.x > WORLD.right + BALL_RADIUS * 2) {
      scoreGoal('a');
    }
  }

  function simulationStep(dt) {
    if (phase !== 'playing' || status !== 'playing') return;

    updateFlipper(flippers.aTop, pressed.a, dt);
    updateFlipper(flippers.aBottom, pressed.a, dt);
    updateFlipper(flippers.bTop, pressed.b, dt);
    updateFlipper(flippers.bBottom, pressed.b, dt);

    stepBall(dt);
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || status !== 'playing') return;

    if (action.type === 'paddle') {
      if (phase !== 'playing') return;

      const now = Date.now();
      if (now - lastInputAt[seat] < INPUT_COOLDOWN_MS) return;
      lastInputAt[seat] = now;

      const active = !!action.active;
      if (pressed[seat] === active) return;

      pressed = {
        ...pressed,
        [seat]: active,
      };

      emitState(true);
      return;
    }

    if (action.type === 'resign') {
      finishMatch(opposite(seat), `${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;

    const seat = seatForSocket(socketId);
    if (!seat) return;

    finishMatch(
      opposite(seat),
      `${bySeat[seat].name} отключился.`,
    );
  }

  physicsTimer = setInterval(() => {
    if (phase !== 'playing' || status !== 'playing') return;

    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.04);

    const substeps = clamp(Math.ceil(dt / (1 / 260)), 1, 10);
    const stepDt = dt / substeps;

    for (let i = 0; i < substeps; i += 1) {
      simulationStep(stepDt);

      if (phase !== 'playing' || status !== 'playing') break;
    }

    emitState(false);
  }, PHYSICS_MS);

  physicsTimer.unref?.();

  resetServe(serveDirection);

  return {
    playerSocketIds: Object.values(bySeat).map((player) => player.socketId),
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      clearPhaseTimer();
      stopPhysics();
    },
  };
}
