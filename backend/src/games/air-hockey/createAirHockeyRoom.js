const FIELD_W = 1000;
const FIELD_H = 1600;
const PADDLE_R = 78;
const PUCK_R = 42;

// Чуть шире прежних ворот, но всё ещё достаточно узко для нормальной игры.
const GOAL_W = 420;
const GOAL_LEFT = (FIELD_W - GOAL_W) / 2;
const GOAL_RIGHT = GOAL_LEFT + GOAL_W;
const CENTER_Y = FIELD_H / 2;
const EDGE_PAD = 26;
const WIN_SCORE = 7;

// Физика считается чаще, чем отправляются сетевые кадры.
const LOOP_MS = 1000 / 60;
const PHYSICS_HZ = 300;
const MAX_SUBSTEPS = 10;
const EMIT_MS = 1000 / 20;

const MAX_PUCK_SPEED = 1650;
const MIN_HIT_SPEED = 220;
const PADDLE_MAX_SPEED = 2250;
const RESET_DELAY_MS = 1050;
const COLLISION_EPSILON = 2.5;
const PUCK_DRAG_PER_SECOND = 0.965;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function other(side) {
  return side === 'bottom' ? 'top' : 'bottom';
}

function playerBounds(side) {
  return side === 'bottom'
    ? { minY: CENTER_Y + PADDLE_R + 12, maxY: FIELD_H - PADDLE_R - EDGE_PAD }
    : { minY: PADDLE_R + EDGE_PAD, maxY: CENTER_Y - PADDLE_R - 12 };
}

function createPaddle(side) {
  const y = side === 'bottom' ? FIELD_H - 250 : 250;
  return {
    x: FIELD_W / 2,
    y,
    vx: 0,
    vy: 0,
    targetX: FIELD_W / 2,
    targetY: y,
  };
}

function solveSweptCircle(startX, startY, deltaX, deltaY, radius) {
  const a = deltaX * deltaX + deltaY * deltaY;
  const c = startX * startX + startY * startY - radius * radius;

  if (c <= 0) return 0;
  if (a < 1e-9) return null;

  const b = 2 * (startX * deltaX + startY * deltaY);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

export function createAirHockeyRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySide = {
    bottom: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    top: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  const paddles = {
    bottom: createPaddle('bottom'),
    top: createPaddle('top'),
  };

  const puck = { x: FIELD_W / 2, y: FIELD_H / 2, vx: 0, vy: 0 };
  const scores = { bottom: 0, top: 0 };
  let status = 'playing';
  let result = null;
  let roundState = 'countdown';
  let serveAt = Date.now() + 700;
  let nextServeToward = Math.random() < 0.5 ? 'bottom' : 'top';
  let finishedOnce = false;
  let lastTick = Date.now();
  let lastEmit = 0;
  let interval = null;

  function sideForSocket(socketId) {
    if (bySide.bottom.socketId === socketId) return 'bottom';
    if (bySide.top.socketId === socketId) return 'top';
    return null;
  }

  function resetPaddles() {
    for (const side of ['bottom', 'top']) {
      Object.assign(paddles[side], createPaddle(side));
    }
  }

  function resetPuck(toward = Math.random() < 0.5 ? 'bottom' : 'top') {
    puck.x = FIELD_W / 2;
    puck.y = FIELD_H / 2;
    puck.vx = 0;
    puck.vy = 0;
    nextServeToward = toward;
    roundState = 'countdown';
    serveAt = Date.now() + RESET_DELAY_MS;
    resetPaddles();
  }

  function launchPuck() {
    const angle = Math.random() * 0.72 - 0.36;
    const base = 640;
    puck.vx = Math.sin(angle) * base;
    puck.vy = (nextServeToward === 'bottom' ? 1 : -1) * Math.cos(angle) * base;
    roundState = 'live';
  }

  function snapshotFor(socketId) {
    const playerSide = sideForSocket(socketId);
    return {
      gameId: 'air-hockey',
      roomId,
      status,
      result,
      playerSide,
      serverTime: Date.now(),
      field: {
        width: FIELD_W,
        height: FIELD_H,
        paddleRadius: PADDLE_R,
        puckRadius: PUCK_R,
        goalLeft: GOAL_LEFT,
        goalRight: GOAL_RIGHT,
        centerY: CENTER_Y,
      },
      players: {
        bottom: { name: bySide.bottom.name },
        top: { name: bySide.top.name },
      },
      scores: { ...scores },
      paddles: {
        bottom: { x: paddles.bottom.x, y: paddles.bottom.y, vx: paddles.bottom.vx, vy: paddles.bottom.vy },
        top: { x: paddles.top.x, y: paddles.top.y, vx: paddles.top.vx, vy: paddles.top.vy },
      },
      puck: { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy },
      roundState,
      serveInMs: roundState === 'countdown' ? Math.max(0, serveAt - Date.now()) : 0,
      winScore: WIN_SCORE,
    };
  }

  function emitState() {
    for (const side of ['bottom', 'top']) {
      io.to(bySide[side].socketId).emit('game:state', snapshotFor(bySide[side].socketId));
    }
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    emitState();

    if (interval) {
      clearInterval(interval);
      interval = null;
    }

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySide) });
    }
  }

  function scoreGoal(scoringSide) {
    scores[scoringSide] += 1;
    if (scores[scoringSide] >= WIN_SCORE) {
      finish({
        type: 'score',
        winner: scoringSide,
        message: `${bySide[scoringSide].name} первым забил ${WIN_SCORE} голов.`,
      });
      return;
    }
    resetPuck(other(scoringSide));
  }

  function updatePaddle(side, dt) {
    const p = paddles[side];
    const bounds = playerBounds(side);
    const oldX = p.x;
    const oldY = p.y;
    const maxStep = PADDLE_MAX_SPEED * dt;
    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const dist = Math.hypot(dx, dy);

    let nx = p.targetX;
    let ny = p.targetY;
    if (dist > maxStep && dist > 0) {
      nx = p.x + (dx / dist) * maxStep;
      ny = p.y + (dy / dist) * maxStep;
    }

    nx = clamp(nx, PADDLE_R + EDGE_PAD, FIELD_W - PADDLE_R - EDGE_PAD);
    ny = clamp(ny, bounds.minY, bounds.maxY);

    p.x = nx;
    p.y = ny;
    p.vx = (nx - oldX) / Math.max(dt, 0.0001);
    p.vy = (ny - oldY) / Math.max(dt, 0.0001);

    return { x: oldX, y: oldY };
  }

  function limitPuckSpeed() {
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed <= MAX_PUCK_SPEED || speed <= 0) return;
    const scale = MAX_PUCK_SPEED / speed;
    puck.vx *= scale;
    puck.vy *= scale;
  }

  function collisionNormal(side, previousPuck, previousPaddle, allowSweep = true) {
    const p = paddles[side];
    const minDist = PADDLE_R + PUCK_R;
    const dx = puck.x - p.x;
    const dy = puck.y - p.y;
    const dist = Math.hypot(dx, dy);

    if (dist < minDist) {
      if (dist > 0.0001) return { nx: dx / dist, ny: dy / dist };
      const paddleSpeed = Math.hypot(p.vx, p.vy);
      if (paddleSpeed > 0.5) return { nx: p.vx / paddleSpeed, ny: p.vy / paddleSpeed };
      return { nx: 0, ny: side === 'bottom' ? -1 : 1 };
    }

    if (!allowSweep) return null;

    // Continuous collision detection: даже если за один подшаг тела успели
    // пересечься и снова разойтись, ищем момент касания по траекториям центров.
    const startRx = previousPuck.x - previousPaddle.x;
    const startRy = previousPuck.y - previousPaddle.y;
    const puckDx = puck.x - previousPuck.x;
    const puckDy = puck.y - previousPuck.y;
    const paddleDx = p.x - previousPaddle.x;
    const paddleDy = p.y - previousPaddle.y;
    const hitT = solveSweptCircle(
      startRx,
      startRy,
      puckDx - paddleDx,
      puckDy - paddleDy,
      minDist,
    );

    if (hitT === null) return null;
    const hitX = startRx + (puckDx - paddleDx) * hitT;
    const hitY = startRy + (puckDy - paddleDy) * hitT;
    const hitDist = Math.hypot(hitX, hitY);
    if (hitDist < 0.0001) return null;
    return { nx: hitX / hitDist, ny: hitY / hitDist };
  }

  function resolvePaddleCollision(side, previousPuck, previousPaddle, allowSweep = true) {
    const p = paddles[side];
    const normal = collisionNormal(side, previousPuck, previousPaddle, allowSweep);
    if (!normal) return false;

    const { nx, ny } = normal;
    const minDist = PADDLE_R + PUCK_R + COLLISION_EPSILON;

    // Жёстко ставим шайбу СНАРУЖИ клюшки. После этой строки центры
    // физически не могут оказаться ближе суммы радиусов.
    puck.x = p.x + nx * minDist;
    puck.y = p.y + ny * minDist;

    // Отражение в системе отсчёта движущейся клюшки.
    const relativeVx = puck.vx - p.vx;
    const relativeVy = puck.vy - p.vy;
    const normalRelativeSpeed = relativeVx * nx + relativeVy * ny;

    if (normalRelativeSpeed < 0) {
      const restitution = 0.98;
      const impulse = -(1 + restitution) * normalRelativeSpeed;
      puck.vx += impulse * nx;
      puck.vy += impulse * ny;
    }

    // Даже медленное касание должно ощущаться как удар, а быстрый свайп
    // передаёт шайбе скорость клюшки по нормали столкновения.
    const paddleNormalSpeed = Math.max(0, p.vx * nx + p.vy * ny);
    const currentNormalSpeed = puck.vx * nx + puck.vy * ny;
    const desiredNormalSpeed = Math.max(MIN_HIT_SPEED, paddleNormalSpeed * 1.72 + 80);
    if (currentNormalSpeed < desiredNormalSpeed) {
      const extra = desiredNormalSpeed - currentNormalSpeed;
      puck.vx += nx * extra;
      puck.vy += ny * extra;
    }

    // Немного переносим тангенциальную скорость движущейся клюшки — это
    // делает косые удары естественными, без магнитного движения строго по нормали.
    const tx = -ny;
    const ty = nx;
    const paddleTangent = p.vx * tx + p.vy * ty;
    const puckTangent = puck.vx * tx + puck.vy * ty;
    const tangentTransfer = (paddleTangent - puckTangent) * 0.08;
    puck.vx += tx * tangentTransfer;
    puck.vy += ty * tangentTransfer;

    limitPuckSpeed();
    return true;
  }

  function movePuckAndWalls(dt) {
    if (roundState !== 'live') return false;

    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    const minX = PUCK_R + EDGE_PAD;
    const maxX = FIELD_W - PUCK_R - EDGE_PAD;
    if (puck.x < minX) {
      puck.x = minX;
      puck.vx = Math.abs(puck.vx);
    } else if (puck.x > maxX) {
      puck.x = maxX;
      puck.vx = -Math.abs(puck.vx);
    }

    const goalSafety = PUCK_R * 0.12;
    const inGoalMouth = puck.x > GOAL_LEFT + goalSafety && puck.x < GOAL_RIGHT - goalSafety;
    const topWall = PUCK_R + EDGE_PAD;
    const bottomWall = FIELD_H - PUCK_R - EDGE_PAD;

    if (!inGoalMouth) {
      if (puck.y < topWall) {
        puck.y = topWall;
        puck.vy = Math.abs(puck.vy);
      } else if (puck.y > bottomWall) {
        puck.y = bottomWall;
        puck.vy = -Math.abs(puck.vy);
      }
    } else {
      if (puck.y < -PUCK_R * 0.45) {
        scoreGoal('bottom');
        return true;
      }
      if (puck.y > FIELD_H + PUCK_R * 0.45) {
        scoreGoal('top');
        return true;
      }
    }

    return false;
  }

  function physicsStep(dt) {
    const previousPuck = { x: puck.x, y: puck.y };
    const previousBottom = updatePaddle('bottom', dt);
    const previousTop = updatePaddle('top', dt);

    if (roundState !== 'live') return;
    if (movePuckAndWalls(dt)) return;

    // Две итерации нужны на редкий случай, когда шайба одновременно зажата
    // между двумя клюшками. После каждой итерации она снова выталкивается наружу.
    resolvePaddleCollision('bottom', previousPuck, previousBottom, true);
    resolvePaddleCollision('top', previousPuck, previousTop, true);

    // Второй проход только устраняет возможное остаточное перекрытие после
    // двойного контакта. Swept-импульс повторно не применяется.
    resolvePaddleCollision('bottom', previousPuck, previousBottom, false);
    resolvePaddleCollision('top', previousPuck, previousTop, false);

    limitPuckSpeed();
    const drag = Math.pow(PUCK_DRAG_PER_SECOND, dt);
    puck.vx *= drag;
    puck.vy *= drag;
  }

  function handleMove(socketId, payload = {}) {
    if (status !== 'playing') return;
    const side = sideForSocket(socketId);
    if (!side) return;
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const bounds = playerBounds(side);
    paddles[side].targetX = clamp(x, PADDLE_R + EDGE_PAD, FIELD_W - PADDLE_R - EDGE_PAD);
    paddles[side].targetY = clamp(y, bounds.minY, bounds.maxY);
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const side = sideForSocket(socketId);
    if (!side) return;
    finish({ type: 'resign', winner: other(side), message: 'Соперник сдался.' });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'move') handleMove(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const side = sideForSocket(socketId);
    if (!side) return;
    finish({ type: 'disconnect', winner: other(side), message: 'Соперник отключился от игры.' });
  }

  interval = setInterval(() => {
    const now = Date.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    dt = clamp(dt, 0, 0.05);

    if (status === 'playing') {
      if (roundState === 'countdown' && now >= serveAt) launchPuck();

      const steps = Math.max(1, Math.min(MAX_SUBSTEPS, Math.ceil(dt * PHYSICS_HZ)));
      const stepDt = dt / steps;
      for (let i = 0; i < steps; i += 1) physicsStep(stepDt);
    }

    if (status === 'playing' && now - lastEmit >= EMIT_MS) {
      lastEmit = now;
      emitState();
    }
  }, LOOP_MS);
  interval.unref?.();

  emitState();

  return {
    id: roomId,
    gameId: 'air-hockey',
    playerSocketIds: [bySide.bottom.socketId, bySide.top.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
      interval = null;
    },
  };
}
