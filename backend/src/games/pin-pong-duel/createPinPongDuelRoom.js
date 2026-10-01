const WORLD = {
  width: 1200,
  height: 700,
  cx: 600,
  cy: 350,
  leftX: 96,
  rightX: 1104,
  topY: 108,
  bottomY: 592,
  goalTop: 238,
  goalBottom: 462,
};

const BALL_RADIUS = 18;
const BALL_START_X_SPEED = 230;
const BALL_START_Y_MIN = 165;
const BALL_START_Y_MAX = 255;
const SIDE_GRAVITY = 152;
const CENTER_DEADBAND = 10;
const BALL_MAX_SPEED = 920;
const BALL_ACCEL_PER_HIT = 1.018;

const FLIPPER_LENGTH = 132;
const FLIPPER_RADIUS = 15;
const FLIPPER_SPEED = 10.8;
const FLIPPER_RESTITUTION = 1.03;
const FLIPPER_KICK = 0.96;

const PHYSICS_MS = 10;       // 100 Hz authoritative loop
const EMIT_MS = 66;          // ~15 snapshots/s; client interpolates
const COUNTDOWN_MS = 1450;
const GOAL_PAUSE_MS = 1150;
const WINS_TO_MATCH = 3;
const INPUT_COOLDOWN_MS = 28;
const HEAT_PER_OPEN = 34;
const HEAT_COOL_PER_SEC = 25;
const HEAT_LIMIT = 100;
const OVERHEAT_MS = 1000;

// Goal mouth behind the two resting paddles.
const GOAL_TRIGGER_LEFT = 145;
const GOAL_TRIGGER_RIGHT = WORLD.width - GOAL_TRIGGER_LEFT;
const GOAL_MOUTH_TOP = 304;
const GOAL_MOUTH_BOTTOM = 396;
const FUNNEL_MIN_SLIDE_SPEED = 150;

const FLIPPERS = {
  // IMPORTANT: the pivot is on the INNER side of the table.
  // Resting paddles point BACK toward their own goal and almost meet there.
  // Holding the button swings them INWARD into the table, exactly like the reference.
  aTop: {
    side: 'a',
    pivotX: 235,
    pivotY: 205,
    restAngle: 2.15,          // down-left -> toward own goal
    activeAngle: 0.90,       // down-right -> opens into the table
  },
  aBottom: {
    side: 'a',
    pivotX: 235,
    pivotY: 495,
    restAngle: -2.15,         // up-left -> toward own goal
    activeAngle: -0.90,       // up-right -> opens into the table
  },
  bTop: {
    side: 'b',
    pivotX: 965,
    pivotY: 205,
    restAngle: Math.PI - 2.15, // down-right -> toward own goal
    activeAngle: Math.PI - 0.90,// down-left -> opens into the table
  },
  bBottom: {
    side: 'b',
    pivotX: 965,
    pivotY: 495,
    restAngle: -(Math.PI - 2.15), // up-right -> toward own goal
    activeAngle: -(Math.PI - 0.90),// up-left -> opens into the table
  },
};

const WALL_SEGMENTS = [
  [220, 108, 980, 108],
  [1094, 194, 1094, 235],
  [1094, 465, 1094, 506],
  [980, 592, 220, 592],
  [106, 506, 106, 465],
  [106, 235, 106, 194],
  [0, 108, 106, 108],
  [0, 592, 106, 592],
  [1094, 108, 1200, 108],
  [1094, 592, 1200, 592],
];

const GUIDE_SEGMENTS = [
  // Black chutes. Point A is on the arena wall, point B is exactly the
  // matching flipper pivot, so the visible rail and collision are identical.
  { ax: 350, ay: 108, bx: 235, by: 205 }, // left top
  { ax: 350, ay: 592, bx: 235, by: 495 }, // left bottom
  { ax: 850, ay: 108, bx: 965, by: 205 }, // right top
  { ax: 850, ay: 592, bx: 965, by: 495 }, // right bottom
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
  const verticalSide = Math.random() < 0.5 ? -1 : 1;
  return {
    x: WORLD.cx,
    y: WORLD.cy,
    vx: direction * rand(BALL_START_X_SPEED * 0.9, BALL_START_X_SPEED * 1.06),
    vy: verticalSide * rand(BALL_START_Y_MIN, BALL_START_Y_MAX),
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

function resolveCircleSegment(ball, ax, ay, bx, by, restitution = 0.92, wallRadius = 0) {
  const closest = nearestPointOnSegment(ball.x, ball.y, ax, ay, bx, by);
  let dx = ball.x - closest.x;
  let dy = ball.y - closest.y;
  let dist = Math.hypot(dx, dy);
  const minimum = BALL_RADIUS + wallRadius;
  if (dist >= minimum) return false;
  if (dist < 0.0001) {
    const sx = bx - ax, sy = by - ay;
    dx = -sy; dy = sx; dist = Math.hypot(dx, dy) || 1;
  }
  const nx = dx / dist, ny = dy / dist;
  const overlap = minimum - dist;
  ball.x += nx * (overlap + 0.35);
  ball.y += ny * (overlap + 0.35);
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + restitution) * vn * nx;
    ball.vy -= (1 + restitution) * vn * ny;
  }
  return true;
}

function resolveGuide(ball, wall) {
  const closest = nearestPointOnSegment(
    ball.x,
    ball.y,
    wall.ax,
    wall.ay,
    wall.bx,
    wall.by,
  );

  let dx = ball.x - closest.x;
  let dy = ball.y - closest.y;
  let dist = Math.hypot(dx, dy);

  const minimum = BALL_RADIUS + 9;
  if (dist >= minimum) return false;

  const segX = wall.bx - wall.ax;
  const segY = wall.by - wall.ay;
  const segLen = Math.hypot(segX, segY) || 1;
  const tx = segX / segLen;
  const ty = segY / segLen;

  if (dist < 0.0001) {
    dx = -ty;
    dy = tx;
    dist = 1;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minimum - dist;

  ball.x += nx * (overlap + 0.35);
  ball.y += ny * (overlap + 0.35);

  // No pinball-like bounce here.  The wall behaves like a chute:
  // remove almost all normal velocity and keep / add motion along the wall
  // TOWARD the paddle (wall.a -> wall.b).
  const tangentSpeed = ball.vx * tx + ball.vy * ty;
  const normalSpeed = ball.vx * nx + ball.vy * ny;
  const slideSpeed = Math.max(
    FUNNEL_MIN_SLIDE_SPEED,
    tangentSpeed > 0 ? tangentSpeed * 0.96 : FUNNEL_MIN_SLIDE_SPEED,
  );
  const softNormal = normalSpeed > 0 ? normalSpeed * 0.04 : 0;

  ball.vx = tx * slideSpeed + nx * softNormal;
  ball.vy = ty * slideSpeed + ny * softNormal;

  return true;
}

function resolveWalls(ball) {
  for (const [ax, ay, bx, by] of WALL_SEGMENTS) {
    // Main frame is firm but deliberately not bouncy.
    resolveCircleSegment(ball, ax, ay, bx, by, 0.06, 10);
  }

  for (const wall of GUIDE_SEGMENTS) {
    resolveGuide(ball, wall);
  }
}

function resolveFlipperBall(ball, flipper) {
  const end = flipperEnd(flipper);
  const closest = nearestPointOnSegment(
    ball.x, ball.y,
    flipper.pivotX, flipper.pivotY,
    end.x, end.y,
  );

  // Keep the hinge area free so the ball cannot get pinched into the pivot.
  if (closest.t < 0.16) return false;

  let dx = ball.x - closest.x;
  let dy = ball.y - closest.y;
  let dist = Math.hypot(dx, dy);
  const minimum = BALL_RADIUS + FLIPPER_RADIUS;
  if (dist >= minimum) return false;

  const tx = Math.cos(flipper.angle);
  const ty = Math.sin(flipper.angle);

  if (dist < 0.0001) {
    dx = -ty;
    dy = tx;
    dist = 1;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minimum - dist;

  // Positional correction only: being in contact with a resting paddle must
  // NEVER create a bounce by itself.
  ball.x += nx * (overlap + 0.35);
  ball.y += ny * (overlap + 0.35);

  const rx = closest.x - flipper.pivotX;
  const ry = closest.y - flipper.pivotY;
  const surfaceVx = -flipper.angularVelocity * ry;
  const surfaceVy = flipper.angularVelocity * rx;

  const isOpeningStrike =
    flipper.isOpening &&
    Math.abs(flipper.angularVelocity) > 0.35;

  if (isOpeningStrike) {
    // Only the deliberate OPENING motion is allowed to hit the ball.
    // Resolve velocity relative to the moving paddle surface.
    const relVx = ball.vx - surfaceVx;
    const relVy = ball.vy - surfaceVy;
    const relNormal = relVx * nx + relVy * ny;

    if (relNormal < 0) {
      const strikeRestitution = 0.30;
      const impulse = -(1 + strikeRestitution) * relNormal;
      ball.vx += nx * impulse;
      ball.vy += ny * impulse;

      const leverage = 0.18 + closest.t * 0.82;
      const surfaceNormal = surfaceVx * nx + surfaceVy * ny;

      if (surfaceNormal > 0) {
        ball.vx += nx * surfaceNormal * FLIPPER_KICK * leverage;
        ball.vy += ny * surfaceNormal * FLIPPER_KICK * leverage;
      }

      // The farther from the hinge the contact is, the stronger the shot
      // toward the opponent.
      const dir = flipper.side === 'a' ? 1 : -1;
      const directionalKick =
        Math.abs(flipper.angularVelocity) *
        FLIPPER_LENGTH *
        0.20 *
        leverage;

      ball.vx += dir * directionalKick;
      ball.vx *= BALL_ACCEL_PER_HIT;
      ball.vy *= BALL_ACCEL_PER_HIT;
      capBallSpeed(ball);
      ball.lastTouch = flipper.side;
    }

    return true;
  }

  // Resting / held / returning paddle = smooth rail, not a bumper.
  // Remove velocity INTO the paddle and keep motion ALONG it.
  let tangentSpeed = ball.vx * tx + ball.vy * ty;
  const normalSpeed = ball.vx * nx + ball.vy * ny;

  const nearRest =
    Math.abs(shortestAngleDelta(flipper.restAngle, flipper.angle)) < 0.22;

  if (nearRest) {
    // In the resting geometry pivot -> tip points toward the gap/goal.
    // Give only a gentle "rolling" bias so the ball can naturally slide
    // all the way between the two paddles instead of bouncing off the tip.
    const slideTarget = 72 + closest.t * 34;
    if (tangentSpeed < slideTarget) {
      tangentSpeed = tangentSpeed * 0.55 + slideTarget * 0.45;
    }
  }

  // Keep only a tiny amount of already-outward normal motion.
  // Incoming normal speed is fully absorbed: no passive rebound.
  const outwardNormal = normalSpeed > 0 ? normalSpeed * 0.06 : 0;

  ball.vx = tx * tangentSpeed + nx * outwardNormal;
  ball.vy = ty * tangentSpeed + ny * outwardNormal;

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
  let heat = { a: 0, b: 0 };
  let overheatedUntil = { a: 0, b: 0 };
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
      heat: {
        a: Math.round(heat.a),
        b: Math.round(heat.b),
      },
      overheatedUntil,
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
    heat = { a: 0, b: 0 };
    overheatedUntil = { a: 0, b: 0 };
    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    roundMessage = direction < 0 ? 'Подача влево, под углом' : 'Подача вправо, под углом';
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

    // Only motion TOWARD the active/open position is an attacking swing.
    // Returning to rest is passive and cannot kick the ball.
    flipper.isOpening = active && Math.abs(step) > 0.0001;
    flipper.angularVelocity = dt > 0 ? step / dt : 0;
    flipper.angle = normalizeAngle(flipper.angle + step);

    if (Math.abs(delta) < 0.0015) {
      flipper.angle = normalizeAngle(target);
      flipper.angularVelocity = 0;
      flipper.isOpening = false;
    }
  }

  function stepBall(dt) {
    applySideGravity(ball, dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    resolveWalls(ball);
    for (let i = 0; i < 2; i += 1) {
      resolveFlipperBall(ball, flippers.aTop);
      resolveFlipperBall(ball, flippers.aBottom);
      resolveFlipperBall(ball, flippers.bTop);
      resolveFlipperBall(ball, flippers.bBottom);
    }
    capBallSpeed(ball);

    // As soon as the ball actually passes through the central gap behind
    // the paddles, count the goal. It does not need to travel off-screen.
    if (
      ball.x < GOAL_TRIGGER_LEFT &&
      ball.y > GOAL_MOUTH_TOP &&
      ball.y < GOAL_MOUTH_BOTTOM
    ) {
      scoreGoal('b');
      return;
    }

    if (
      ball.x > GOAL_TRIGGER_RIGHT &&
      ball.y > GOAL_MOUTH_TOP &&
      ball.y < GOAL_MOUTH_BOTTOM
    ) {
      scoreGoal('a');
      return;
    }
  }

  function simulationStep(dt) {
    if (phase !== 'playing' || status !== 'playing') return;

    const now = Date.now();
    for (const seat of ['a', 'b']) {
      if (overheatedUntil[seat] > now) {
        pressed[seat] = false;
        heat[seat] = Math.max(0, heat[seat] - HEAT_COOL_PER_SEC * 1.7 * dt);
      } else {
        if (overheatedUntil[seat]) overheatedUntil[seat] = 0;
        heat[seat] = Math.max(0, heat[seat] - HEAT_COOL_PER_SEC * dt);
      }
    }
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
      if (overheatedUntil[seat] > now) {
        if (pressed[seat]) pressed = { ...pressed, [seat]: false };
        emitState(true);
        return;
      }
      if (pressed[seat] === active) return;

      if (active) {
        heat[seat] = Math.min(HEAT_LIMIT, heat[seat] + HEAT_PER_OPEN);
        if (heat[seat] >= HEAT_LIMIT) {
          overheatedUntil[seat] = now + OVERHEAT_MS;
          pressed = { ...pressed, [seat]: false };
          emitState(true);
          return;
        }
      }

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
    // Adaptive collision substeps based on actual travel distance.
    // Keeps fast ball/flipper contacts solid without burning CPU every tick.
    const speed = Math.hypot(ball.vx, ball.vy);
    const maxTravel = speed * dt + FLIPPER_SPEED * FLIPPER_LENGTH * dt;
    const substeps = clamp(Math.ceil(maxTravel / 14), 1, 6);
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
