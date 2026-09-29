const FIELD_W = 1000;
const FIELD_H = 1600;
const PADDLE_R = 78;
const PUCK_R = 42;
const GOAL_W = 420;
const GOAL_LEFT = (FIELD_W - GOAL_W) / 2;
const GOAL_RIGHT = GOAL_LEFT + GOAL_W;
const CENTER_Y = FIELD_H / 2;
const EDGE_PAD = 26;
const WIN_SCORE = 7;

// Physics runs much faster than network snapshots. This keeps contacts precise
// without flooding the phones with Socket.IO updates.
const LOOP_MS = 1000 / 60;
const PHYSICS_HZ = 360;
const MAX_SUBSTEPS = 14;
const EMIT_MS = 1000 / 30;

const MAX_PUCK_SPEED = 2300;
const PADDLE_MAX_SPEED = 3000;
const MIN_HIT_SPEED = 280;
const RESET_DELAY_MS = 1050;
const COLLISION_EPSILON = 3.5;
const PUCK_DRAG_PER_SECOND = 0.968;
const CONTACT_RESTITUTION = 0.985;

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
  if (a < 1e-10) return null;

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

  function planPaddleMove(side, dt) {
    const p = paddles[side];
    const bounds = playerBounds(side);
    const startX = p.x;
    const startY = p.y;
    const maxStep = PADDLE_MAX_SPEED * dt;
    const dx = p.targetX - startX;
    const dy = p.targetY - startY;
    const dist = Math.hypot(dx, dy);

    let endX = p.targetX;
    let endY = p.targetY;
    if (dist > maxStep && dist > 0) {
      endX = startX + (dx / dist) * maxStep;
      endY = startY + (dy / dist) * maxStep;
    }

    endX = clamp(endX, PADDLE_R + EDGE_PAD, FIELD_W - PADDLE_R - EDGE_PAD);
    endY = clamp(endY, bounds.minY, bounds.maxY);

    const moveX = endX - startX;
    const moveY = endY - startY;
    const vx = moveX / Math.max(dt, 0.000001);
    const vy = moveY / Math.max(dt, 0.000001);

    // Tentatively move to the requested point. If a swept contact occurs,
    // physicsStep clamps this paddle back to the exact contact point.
    p.x = endX;
    p.y = endY;
    p.vx = vx;
    p.vy = vy;

    return { side, startX, startY, endX, endY, moveX, moveY, vx, vy };
  }

  function findSweptPaddleHit(move, puckStart, puckDelta) {
    const minDist = PADDLE_R + PUCK_R;
    const startRx = puckStart.x - move.startX;
    const startRy = puckStart.y - move.startY;
    const relativeDx = puckDelta.x - move.moveX;
    const relativeDy = puckDelta.y - move.moveY;
    const t = solveSweptCircle(startRx, startRy, relativeDx, relativeDy, minDist);
    if (t === null) return null;

    const paddleX = move.startX + move.moveX * t;
    const paddleY = move.startY + move.moveY * t;
    const puckX = puckStart.x + puckDelta.x * t;
    const puckY = puckStart.y + puckDelta.y * t;
    let nx = puckX - paddleX;
    let ny = puckY - paddleY;
    let d = Math.hypot(nx, ny);

    if (d < 0.0001) {
      // Exact centre hit: choose the normal from the relative approach speed.
      nx = puck.vx - move.vx;
      ny = puck.vy - move.vy;
      d = Math.hypot(nx, ny);
      if (d < 0.0001) {
        nx = 0;
        ny = move.side === 'bottom' ? -1 : 1;
        d = 1;
      }
      nx = -nx / d;
      ny = -ny / d;
    } else {
      nx /= d;
      ny /= d;
    }

    return { t, paddleX, paddleY, puckX, puckY, nx, ny, move };
  }

  function limitPuckSpeed() {
    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed <= MAX_PUCK_SPEED || speed <= 0) return;
    const scale = MAX_PUCK_SPEED / speed;
    puck.vx *= scale;
    puck.vy *= scale;
  }

  function applyContactImpulse(hit) {
    const { nx, ny, move } = hit;
    const tx = -ny;
    const ty = nx;

    const puckNormal = puck.vx * nx + puck.vy * ny;
    const paddleNormal = move.vx * nx + move.vy * ny;
    const relativeNormal = puckNormal - paddleNormal;

    // Infinite-mass moving striker. This handles all three important cases:
    // 1) fast puck coming toward the paddle -> immediate hard reflection;
    // 2) paddle catches an already outgoing puck -> it gets accelerated again;
    // 3) held paddle keeps pushing the puck instead of slipping around it.
    let outgoingNormal = puckNormal;
    if (relativeNormal < 0) {
      outgoingNormal = paddleNormal - CONTACT_RESTITUTION * relativeNormal;
    }

    if (paddleNormal > 20) {
      outgoingNormal = Math.max(outgoingNormal, paddleNormal + 110);
    }

    // A real touch always produces a small separating speed, so numerical
    // jitter can never leave the puck glued inside the striker.
    outgoingNormal = Math.max(outgoingNormal, MIN_HIT_SPEED);

    const puckTangent = puck.vx * tx + puck.vy * ty;
    const paddleTangent = move.vx * tx + move.vy * ty;
    const outgoingTangent = puckTangent * 0.94 + paddleTangent * 0.12;

    puck.vx = nx * outgoingNormal + tx * outgoingTangent;
    puck.vy = ny * outgoingNormal + ty * outgoingTangent;
    limitPuckSpeed();
  }

  function hardSeparateFromPaddle(side) {
    const p = paddles[side];
    const minDist = PADDLE_R + PUCK_R + COLLISION_EPSILON;
    let dx = puck.x - p.x;
    let dy = puck.y - p.y;
    let dist = Math.hypot(dx, dy);
    if (dist >= minDist) return false;

    const minX = PUCK_R + EDGE_PAD;
    const maxX = FIELD_W - PUCK_R - EDGE_PAD;
    const topWall = PUCK_R + EDGE_PAD;
    const bottomWall = FIELD_H - PUCK_R - EDGE_PAD;
    const atLeftWall = puck.x <= minX + 0.5;
    const atRightWall = puck.x >= maxX - 0.5;
    const goalSafety = PUCK_R * 0.12;
    const inGoalMouth = puck.x > GOAL_LEFT + goalSafety && puck.x < GOAL_RIGHT - goalSafety;
    const atTopWall = !inGoalMouth && puck.y <= topWall + 0.5;
    const atBottomWall = !inGoalMouth && puck.y >= bottomWall - 0.5;

    // When the puck is squeezed between a striker and a rail, radial separation
    // could push it through the rail. Resolve tangentially ALONG that rail instead.
    if ((atLeftWall || atRightWall) && Math.abs(dx) < minDist) {
      const needed = Math.sqrt(Math.max(0, minDist * minDist - dx * dx));
      let sign = Math.sign(dy);
      if (!sign) sign = side === 'bottom' ? -1 : 1;
      puck.y = p.y + sign * needed;
      dy = puck.y - p.y;
      dist = Math.hypot(dx, dy);
    } else if ((atTopWall || atBottomWall) && Math.abs(dy) < minDist) {
      const needed = Math.sqrt(Math.max(0, minDist * minDist - dy * dy));
      let sign = Math.sign(dx);
      if (!sign) sign = puck.vx >= 0 ? 1 : -1;
      puck.x = p.x + sign * needed;
      dx = puck.x - p.x;
      dist = Math.hypot(dx, dy);
    }

    if (dist < minDist) {
      if (dist < 0.0001) {
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 0.01) {
          dx = -p.vx / speed;
          dy = -p.vy / speed;
        } else {
          dx = 0;
          dy = side === 'bottom' ? -1 : 1;
        }
        dist = 1;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      puck.x = p.x + nx * minDist;
      puck.y = p.y + ny * minDist;
      dx = puck.x - p.x;
      dy = puck.y - p.y;
      dist = minDist;
    }

    const nx = dx / Math.max(dist, 0.0001);
    const ny = dy / Math.max(dist, 0.0001);
    const puckNormal = puck.vx * nx + puck.vy * ny;
    const paddleNormal = p.vx * nx + p.vy * ny;
    if (puckNormal < paddleNormal) {
      applyContactImpulse({ nx, ny, move: { vx: p.vx, vy: p.vy } });
    }
    return true;
  }

  function separateFromBothPaddlesIfSqueezed() {
    const a = paddles.bottom;
    const b = paddles.top;
    const radius = PADDLE_R + PUCK_R + COLLISION_EPSILON;
    const da = Math.hypot(puck.x - a.x, puck.y - a.y);
    const db = Math.hypot(puck.x - b.x, puck.y - b.y);
    if (da >= radius || db >= radius) return false;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.0001 || d >= radius * 2) return false;

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const h = Math.sqrt(Math.max(0, radius * radius - (d * d) / 4));
    const px = -dy / d;
    const py = dx / d;
    const candidates = [
      { x: mx + px * h, y: my + py * h },
      { x: mx - px * h, y: my - py * h },
    ];

    const minX = PUCK_R + EDGE_PAD;
    const maxX = FIELD_W - PUCK_R - EDGE_PAD;
    const minY = PUCK_R + EDGE_PAD;
    const maxY = FIELD_H - PUCK_R - EDGE_PAD;
    const valid = candidates.filter((c) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY);
    const pool = valid.length ? valid : candidates;
    pool.sort((u, v) => (
      Math.hypot(u.x - puck.x, u.y - puck.y) - Math.hypot(v.x - puck.x, v.y - puck.y)
    ));

    puck.x = clamp(pool[0].x, minX, maxX);
    puck.y = clamp(pool[0].y, minY, maxY);
    return true;
  }

  function resolveWallsAndGoals() {
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
      return false;
    }

    if (puck.y < -PUCK_R * 0.45) {
      scoreGoal('bottom');
      return true;
    }
    if (puck.y > FIELD_H + PUCK_R * 0.45) {
      scoreGoal('top');
      return true;
    }
    return false;
  }

  function physicsStep(dt) {
    const bottomMove = planPaddleMove('bottom', dt);
    const topMove = planPaddleMove('top', dt);

    if (roundState !== 'live') return;

    const puckStart = { x: puck.x, y: puck.y };
    const puckDelta = { x: puck.vx * dt, y: puck.vy * dt };

    const hits = [
      findSweptPaddleHit(bottomMove, puckStart, puckDelta),
      findSweptPaddleHit(topMove, puckStart, puckDelta),
    ].filter(Boolean).sort((a, b) => a.t - b.t);

    if (hits.length > 0) {
      const hit = hits[0];
      const p = paddles[hit.move.side];

      // The striker is physically stopped at FIRST contact for this sub-step.
      // It cannot teleport to the other side of the puck. On the next 1/360 s
      // sub-step it tries to reach the finger again and therefore PUSHES the puck.
      p.x = hit.paddleX;
      p.y = hit.paddleY;
      p.vx = hit.move.vx;
      p.vy = hit.move.vy;

      puck.x = hit.puckX + hit.nx * COLLISION_EPSILON;
      puck.y = hit.puckY + hit.ny * COLLISION_EPSILON;
      applyContactImpulse(hit);

      const remaining = dt * (1 - hit.t);
      puck.x += puck.vx * remaining;
      puck.y += puck.vy * remaining;
    } else {
      puck.x += puckDelta.x;
      puck.y += puckDelta.y;
    }

    // Absolute invariant: after every physics sub-step the puck center is at
    // least (paddleRadius + puckRadius) away from BOTH paddles.
    hardSeparateFromPaddle('bottom');
    hardSeparateFromPaddle('top');
    separateFromBothPaddlesIfSqueezed();

    if (resolveWallsAndGoals()) return;

    // Wall correction can move the puck closer to a nearby striker. Run one
    // constrained separation pass that respects the rail geometry.
    hardSeparateFromPaddle('bottom');
    hardSeparateFromPaddle('top');
    separateFromBothPaddlesIfSqueezed();

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
