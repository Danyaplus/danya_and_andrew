const FIELD_W = 1000;
const FIELD_H = 1600;
const PADDLE_R = 78;
const PUCK_R = 42;
const GOAL_W = 370;
const GOAL_LEFT = (FIELD_W - GOAL_W) / 2;
const GOAL_RIGHT = GOAL_LEFT + GOAL_W;
const CENTER_Y = FIELD_H / 2;
const EDGE_PAD = 26;
const WIN_SCORE = 7;
const TICK_MS = 1000 / 60;
const EMIT_MS = 1000 / 30;
const MAX_PUCK_SPEED = 1550;
const MIN_HIT_SPEED = 260;
const PADDLE_MAX_SPEED = 2200;
const RESET_DELAY_MS = 1050;

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
  return {
    x: FIELD_W / 2,
    y: side === 'bottom' ? FIELD_H - 250 : 250,
    vx: 0,
    vy: 0,
    targetX: FIELD_W / 2,
    targetY: side === 'bottom' ? FIELD_H - 250 : 250,
  };
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
      const fresh = createPaddle(side);
      Object.assign(paddles[side], fresh);
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
    const angle = (Math.random() * 0.72 - 0.36);
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
        bottom: { x: paddles.bottom.x, y: paddles.bottom.y },
        top: { x: paddles.top.x, y: paddles.top.y },
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

    // В завершённой комнате больше не шлём старое состояние каждые 33 мс.
    // Иначе при поиске нового матча старый экран результата мог появляться снова.
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
    p.vx = (nx - p.x) / Math.max(dt, 0.001);
    p.vy = (ny - p.y) / Math.max(dt, 0.001);
    p.x = nx;
    p.y = ny;
  }

  function resolvePaddleCollision(side) {
    const p = paddles[side];
    let dx = puck.x - p.x;
    let dy = puck.y - p.y;
    let dist = Math.hypot(dx, dy);
    const minDist = PADDLE_R + PUCK_R;
    if (dist >= minDist) return false;

    // Даже если центры почти совпали, выбираем устойчивую нормаль столкновения.
    // Это не даёт бите «пройти сквозь» шайбу.
    let nx;
    let ny;
    if (dist > 0.001) {
      nx = dx / dist;
      ny = dy / dist;
    } else {
      const paddleSpeed = Math.hypot(p.vx, p.vy);
      if (paddleSpeed > 1) {
        nx = p.vx / paddleSpeed;
        ny = p.vy / paddleSpeed;
      } else {
        nx = 0;
        ny = side === 'bottom' ? -1 : 1;
      }
      dist = 0;
    }

    // Сначала физически раздвигаем тела до касания с небольшим запасом.
    const overlap = minDist - dist + 1.5;
    puck.x += nx * overlap;
    puck.y += ny * overlap;

    // Считаем столкновение в системе отсчёта движущейся биты.
    const relativeVx = puck.vx - p.vx;
    const relativeVy = puck.vy - p.vy;
    const closing = relativeVx * nx + relativeVy * ny;

    if (closing < 0) {
      const restitution = 1.08;
      puck.vx -= (1 + restitution) * closing * nx;
      puck.vy -= (1 + restitution) * closing * ny;
    }

    // Быстро двигающаяся бита должна действительно отбивать шайбу,
    // а не просто визуально проталкиваться сквозь неё.
    const paddleNormalSpeed = Math.max(0, p.vx * nx + p.vy * ny);
    const puckNormalSpeed = puck.vx * nx + puck.vy * ny;
    const desiredNormalSpeed = Math.max(
      puckNormalSpeed,
      MIN_HIT_SPEED,
      paddleNormalSpeed * 1.08 + 90,
    );

    if (desiredNormalSpeed > puckNormalSpeed) {
      const extra = desiredNormalSpeed - puckNormalSpeed;
      puck.vx += nx * extra;
      puck.vy += ny * extra;
    }

    limitPuckSpeed();
    return true;
  }

  function limitPuckSpeed() {
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed <= MAX_PUCK_SPEED || speed <= 0) return;
    const scale = MAX_PUCK_SPEED / speed;
    puck.vx *= scale;
    puck.vy *= scale;
  }

  function updatePuck(dt) {
    if (roundState !== 'live') return;

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

    const inGoalMouth = puck.x > GOAL_LEFT + PUCK_R * 0.18 && puck.x < GOAL_RIGHT - PUCK_R * 0.18;
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
      if (puck.y < -PUCK_R * 0.4) {
        scoreGoal('bottom');
        return;
      }
      if (puck.y > FIELD_H + PUCK_R * 0.4) {
        scoreGoal('top');
        return;
      }
    }

    resolvePaddleCollision('bottom');
    resolvePaddleCollision('top');
    limitPuckSpeed();
    puck.vx *= 0.9994;
    puck.vy *= 0.9994;
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

      // Несколько маленьких физических шагов вместо одного большого.
      // На быстрых движениях телефона это сильно уменьшает проникновение биты в шайбу.
      const steps = Math.max(1, Math.min(6, Math.ceil(dt / (1 / 180))));
      const stepDt = dt / steps;

      for (let i = 0; i < steps; i += 1) {
        updatePaddle('bottom', stepDt);
        updatePaddle('top', stepDt);

        if (roundState === 'live') {
          resolvePaddleCollision('bottom');
          resolvePaddleCollision('top');
          updatePuck(stepDt);
        }
      }
    }

    if (status === 'playing' && now - lastEmit >= EMIT_MS) {
      lastEmit = now;
      emitState();
    }
  }, TICK_MS);
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
