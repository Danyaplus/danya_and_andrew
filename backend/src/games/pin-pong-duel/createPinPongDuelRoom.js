const WORLD = {
  width: 1200,
  height: 700,
  cx: 600,
  cy: 350,
  leftX: 66,
  rightX: 1134,
  topY: 86,
  bottomY: 614,
  goalTop: 298,
  goalBottom: 402,
};

const BALL_RADIUS = 18;
const BALL_START_X_SPEED = 245;
const BALL_START_Y_MIN = 185;
const BALL_START_Y_MAX = 275;
const SIDE_GRAVITY = 138;
const CENTER_DEADBAND = 8;
const BALL_MAX_SPEED = 960;
const BALL_ACCEL_PER_HIT = 1.018;

const FLIPPER_LENGTH = 128;
const FLIPPER_RADIUS = 15;
const FLIPPER_SPEED = 11.2;
const FLIPPER_RESTITUTION = 1.02;
const FLIPPER_KICK = 0.92;

const PHYSICS_MS = 8;
const EMIT_MS = 55;
const COUNTDOWN_MS = 1450;
const GOAL_PAUSE_MS = 1150;
const WINS_TO_MATCH = 2;
const INPUT_COOLDOWN_MS = 28;

// Closed state: paddles almost face each other with a tiny gap.
// Active state: paddles open outward about ~52-55 degrees.
const FLIPPERS = {
  aTop: { side: 'a', pivotX: 166, pivotY: 286, restAngle: 0.56, activeAngle: -0.36 },
  aBottom: { side: 'a', pivotX: 166, pivotY: 414, restAngle: -0.56, activeAngle: 0.36 },
  bTop: { side: 'b', pivotX: 1034, pivotY: 286, restAngle: Math.PI - 0.56, activeAngle: Math.PI + 0.36 },
  bBottom: { side: 'b', pivotX: 1034, pivotY: 414, restAngle: Math.PI + 0.56, activeAngle: Math.PI - 0.36 },
};

// Outer octagon walls, with a small side opening for the goal.
const WALL_SEGMENTS = [
  [210, 86, 990, 86],
  [990, 86, 1134, 184],
  [1134, 184, 1134, WORLD.goalTop],
  [1134, WORLD.goalBottom, 1134, 516],
  [1134, 516, 990, 614],
  [990, 614, 210, 614],
  [210, 614, 66, 516],
  [66, 516, 66, WORLD.goalBottom],
  [66, WORLD.goalTop, 66, 184],
  [66, 184, 210, 86],
];

// Inner guide rails near each gate: if the ball rides the wall,
// it is funnelled downward/upward toward the flippers instead of sticking flat.
const GUIDE_SEGMENTS = [
  [94, 150, 176, 248],
  [94, 550, 176, 452],
  [1106, 150, 1024, 248],
  [1106, 550, 1024, 452],
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function safeName(v) {
  if (typeof v !== 'string') return 'Игрок';
  const name = v.trim().slice(0, 28);
  return name || 'Игрок';
}
function opposite(seat) { return seat === 'a' ? 'b' : 'a'; }
function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function shortestAngleDelta(target, current) { return normalizeAngle(target - current); }
function rand(min, max) { return min + Math.random() * (max - min); }

function makeBall(direction = Math.random() < 0.5 ? -1 : 1) {
  const ySign = Math.random() < 0.5 ? -1 : 1;
  return {
    x: WORLD.cx,
    y: WORLD.cy,
    vx: direction * rand(BALL_START_X_SPEED * 0.92, BALL_START_X_SPEED * 1.08),
    vy: ySign * rand(BALL_START_Y_MIN, BALL_START_Y_MAX),
    radius: BALL_RADIUS,
    gravitySide: direction,
    lastTouch: null,
  };
}

function makeFlipper(key) {
  const base = FLIPPERS[key];
  return { key, ...base, angle: base.restAngle, angularVelocity: 0 };
}

function flipperEnd(f) {
  return {
    x: f.pivotX + Math.cos(f.angle) * FLIPPER_LENGTH,
    y: f.pivotY + Math.sin(f.angle) * FLIPPER_LENGTH,
  };
}

function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 <= 0.0001) return { x: ax, y: ay, t: 0 };
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  return { x: ax + abx * t, y: ay + aby * t, t };
}

function capBallSpeed(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= BALL_MAX_SPEED) return;
  const k = BALL_MAX_SPEED / speed;
  ball.vx *= k;
  ball.vy *= k;
}

function gravityDirectionForBall(ball) {
  if (ball.x < WORLD.cx - CENTER_DEADBAND) return -1;
  if (ball.x > WORLD.cx + CENTER_DEADBAND) return 1;
  if (Math.abs(ball.vx) > 10) return Math.sign(ball.vx);
  return ball.gravitySide || 1;
}

function applySideGravity(ball, dt) {
  const direction = gravityDirectionForBall(ball);
  ball.gravitySide = direction;
  ball.vx += direction * SIDE_GRAVITY * dt;
}

function resolveCircleSegment(ball, ax, ay, bx, by, restitution = 0.92) {
  const closest = nearestPointOnSegment(ball.x, ball.y, ax, ay, bx, by);
  let dx = ball.x - closest.x;
  let dy = ball.y - closest.y;
  let dist = Math.hypot(dx, dy);
  if (dist >= BALL_RADIUS) return false;
  if (dist < 0.0001) {
    const sx = bx - ax, sy = by - ay;
    dx = -sy; dy = sx; dist = Math.hypot(dx, dy) || 1;
  }
  const nx = dx / dist, ny = dy / dist;
  const overlap = BALL_RADIUS - dist;
  ball.x += nx * (overlap + 0.35);
  ball.y += ny * (overlap + 0.35);
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + restitution) * vn * nx;
    ball.vy -= (1 + restitution) * vn * ny;
  }
  return true;
}

function resolveWalls(ball) {
  for (const [ax, ay, bx, by] of WALL_SEGMENTS) {
    resolveCircleSegment(ball, ax, ay, bx, by, 0.90);
  }
  for (const [ax, ay, bx, by] of GUIDE_SEGMENTS) {
    resolveCircleSegment(ball, ax, ay, bx, by, 0.92);
  }
}

function resolveFlipperBall(ball, flipper) {
  const end = flipperEnd(flipper);
  const closest = nearestPointOnSegment(
    ball.x, ball.y,
    flipper.pivotX, flipper.pivotY,
    end.x, end.y,
  );

  let dx = ball.x - closest.x;
  let dy = ball.y - closest.y;
  let dist = Math.hypot(dx, dy);
  const minimum = BALL_RADIUS + FLIPPER_RADIUS;
  if (dist >= minimum) return false;

  if (dist < 0.0001) {
    dx = -Math.sin(flipper.angle);
    dy = Math.cos(flipper.angle);
    dist = 1;
  }

  const nx = dx / dist, ny = dy / dist;
  const overlap = minimum - dist;
  ball.x += nx * (overlap + 0.55);
  ball.y += ny * (overlap + 0.55);

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

    const leverage = 0.22 + closest.t * 0.78;
    const kickNormal = surfaceVx * nx + surfaceVy * ny;
    if (kickNormal > 0) {
      ball.vx += nx * kickNormal * FLIPPER_KICK * leverage;
      ball.vy += ny * kickNormal * FLIPPER_KICK * leverage;
    }

    if (Math.abs(flipper.angularVelocity) > 0.5) {
      const dir = flipper.side === 'a' ? 1 : -1;
      const directionalKick = Math.abs(flipper.angularVelocity) * FLIPPER_LENGTH * 0.19 * leverage;
      ball.vx += dir * directionalKick;
    }

    ball.vx *= BALL_ACCEL_PER_HIT;
    ball.vy *= BALL_ACCEL_PER_HIT;
    capBallSpeed(ball);
    ball.lastTouch = flipper.side;
  }

  return true;
}

function publicFlipper(f) {
  return {
    key: f.key,
    side: f.side,
    pivotX: f.pivotX,
    pivotY: f.pivotY,
    angle: Math.round(f.angle * 10000) / 10000,
    angularVelocity: Math.round(f.angularVelocity * 10000) / 10000,
  };
}

function publicBall(ball) {
  return {
    x: Math.round(ball.x * 10) / 10,
    y: Math.round(ball.y * 10) / 10,
    vx: Math.round(ball.vx * 10) / 10,
    vy: Math.round(ball.vy * 10) / 10,
    gravitySide: ball.gravitySide,
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
  let serveDirection = Math.random() < 0.5 ? -1 : 1;
  let ball = makeBall(serveDirection);
  let flippers = {
    aTop: makeFlipper('aTop'), aBottom: makeFlipper('aBottom'),
    bTop: makeFlipper('bTop'), bBottom: makeFlipper('bBottom'),
  };

  let status = 'playing';
  let phase = 'countdown';
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
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
      gameId: 'pin-pong-duel', roomId, serverTime: Date.now(),
      playerSeat, opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: { a: { name: bySeat.a.name }, b: { name: bySeat.b.name } },
      world: WORLD, sideGravity: SIDE_GRAVITY, ball: publicBall(ball),
      flippers: {
        aTop: publicFlipper(flippers.aTop), aBottom: publicFlipper(flippers.aBottom),
        bTop: publicFlipper(flippers.bTop), bBottom: publicFlipper(flippers.bBottom),
      },
      pressed, scores, winsToMatch: WINS_TO_MATCH,
      phase, status, countdownEndsAt, roundMessage, result,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function clearPhaseTimer() { if (phaseTimer) clearTimeout(phaseTimer); phaseTimer = null; }
  function stopPhysics() { if (physicsTimer) clearInterval(physicsTimer); physicsTimer = null; }

  function finishMatch(winner, message) {
    if (status === 'finished') return;
    status = 'finished'; phase = 'finished'; pressed = { a: false, b: false };
    result = { winner, draw: false, message };
    emitState(true); clearPhaseTimer(); stopPhysics();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resetServe(direction) {
    serveDirection = direction;
    ball = makeBall(direction);
    flippers = {
      aTop: makeFlipper('aTop'), aBottom: makeFlipper('aBottom'),
      bTop: makeFlipper('bTop'), bBottom: makeFlipper('bBottom'),
    };
    pressed = { a: false, b: false };
    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    roundMessage = direction < 0 ? 'Мяч падает на левую половину' : 'Мяч падает на правую половину';
    emitState(true);
    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      if (status !== 'playing') return;
      phase = 'playing'; roundMessage = ''; lastTickAt = Date.now(); emitState(true);
    }, COUNTDOWN_MS);
    phaseTimer.unref?.();
  }

  function scoreGoal(winner) {
    if (phase !== 'playing' || status !== 'playing') return;
    scores = { ...scores, [winner]: scores[winner] + 1 };
    phase = 'goal'; pressed = { a: false, b: false };
    roundMessage = `Гол! ${bySeat[winner].name}`;
    emitState(true);

    if (scores[winner] >= WINS_TO_MATCH) {
      clearPhaseTimer();
      phaseTimer = setTimeout(() => {
        finishMatch(winner, `${bySeat[winner].name} первым забил ${WINS_TO_MATCH} гола.`);
      }, GOAL_PAUSE_MS);
      phaseTimer.unref?.();
      return;
    }

    const nextDirection = winner === 'a' ? 1 : -1;
    clearPhaseTimer();
    phaseTimer = setTimeout(() => resetServe(nextDirection), GOAL_PAUSE_MS);
    phaseTimer.unref?.();
  }

  function updateFlipper(flipper, active, dt) {
    const target = active ? flipper.activeAngle : flipper.restAngle;
    const delta = shortestAngleDelta(target, flipper.angle);
    const maxStep = FLIPPER_SPEED * dt;
    const step = clamp(delta, -maxStep, maxStep);
    flipper.angularVelocity = dt > 0 ? step / dt : 0;
    flipper.angle = normalizeAngle(flipper.angle + step);
    if (Math.abs(delta) < 0.0015) {
      flipper.angle = normalizeAngle(target);
      flipper.angularVelocity = 0;
    }
  }

  function stepBall(dt) {
    applySideGravity(ball, dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    for (let i = 0; i < 2; i += 1) resolveWalls(ball);
    for (let i = 0; i < 3; i += 1) {
      resolveFlipperBall(ball, flippers.aTop);
      resolveFlipperBall(ball, flippers.aBottom);
      resolveFlipperBall(ball, flippers.bTop);
      resolveFlipperBall(ball, flippers.bBottom);
    }
    capBallSpeed(ball);

    if (ball.x < WORLD.leftX - BALL_RADIUS * 2 && ball.y > WORLD.goalTop && ball.y < WORLD.goalBottom) {
      scoreGoal('b'); return;
    }
    if (ball.x > WORLD.rightX + BALL_RADIUS * 2 && ball.y > WORLD.goalTop && ball.y < WORLD.goalBottom) {
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
      pressed = { ...pressed, [seat]: active };
      emitState(true);
      return;
    }
    if (action.type === 'resign') finishMatch(opposite(seat), `${bySeat[seat].name} покинул матч.`);
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), `${bySeat[seat].name} отключился.`);
  }

  physicsTimer = setInterval(() => {
    if (phase !== 'playing' || status !== 'playing') return;
    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.04);
    const substeps = clamp(Math.ceil(dt / (1 / 280)), 1, 12);
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
    playerSocketIds: Object.values(bySeat).map((p) => p.socketId),
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() { clearPhaseTimer(); stopPhysics(); },
  };
}
