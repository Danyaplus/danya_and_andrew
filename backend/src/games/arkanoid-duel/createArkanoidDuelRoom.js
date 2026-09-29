const FIELD = { width: 1200, height: 680 };
const PHYSICS_TICK_MS = 8;      // ~125 server updates/s
const EMIT_EVERY_MS = 50;       // ~20 network snapshots/s
const PADDLE_WIDTH = 34;
const PADDLE_HEIGHT = 172;
const PADDLE_HALF_HEIGHT = PADDLE_HEIGHT / 2;
const PADDLE_X = { a: 88, b: FIELD.width - 88 };
const PADDLE_MAX_SPEED = 1380;
const BALL_RADIUS = 18;
const START_BALL_SPEED = 455;
const SPEED_MULTIPLIER = 1.052;
const SPEED_ADD = 10;
const MAX_BALL_SPEED = 1120;
const PADDLE_VELOCITY_STEER = 0.34;
const CONTACT_OFFSET_STEER = 245;
const MIN_HORIZONTAL_RATIO = 0.30;
const WINS_TO_MATCH = 3;
const ROUND_OVER_MS = 1050;
const SERVE_DELAY_MS = 1150;
const EDGE_PADDING = 16;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function makePaddle(seat) {
  return {
    seat,
    x: PADDLE_X[seat],
    y: FIELD.height / 2,
    targetY: FIELD.height / 2,
    vy: 0,
  };
}

function makeBall() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    speed: START_BALL_SPEED,
    hits: 0,
    lastTouch: null,
  };
}

function publicPaddle(paddle) {
  return {
    x: paddle.x,
    y: Math.round(paddle.y * 10) / 10,
    vy: Math.round(paddle.vy * 10) / 10,
  };
}

function publicBall(ball) {
  return {
    x: Math.round(ball.x * 10) / 10,
    y: Math.round(ball.y * 10) / 10,
    vx: Math.round(ball.vx * 10) / 10,
    vy: Math.round(ball.vy * 10) / 10,
    speed: Math.round(ball.speed * 10) / 10,
    hits: ball.hits,
    lastTouch: ball.lastTouch,
  };
}

function axisSlab(start, delta, halfSize, axis) {
  if (Math.abs(delta) < 1e-9) {
    if (start < -halfSize || start > halfSize) return null;
    return { near: -Infinity, far: Infinity, normal: { x: 0, y: 0 } };
  }

  if (delta > 0) {
    return {
      near: (-halfSize - start) / delta,
      far: (halfSize - start) / delta,
      normal: axis === 'x' ? { x: -1, y: 0 } : { x: 0, y: -1 },
    };
  }

  return {
    near: (halfSize - start) / delta,
    far: (-halfSize - start) / delta,
    normal: axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 },
  };
}

// Swept point vs expanded moving paddle rectangle (Minkowski sum).
// This prevents a fast ball or fast paddle from tunnelling through the other.
function sweptBallPaddle(ballStart, ballEnd, paddleStart, paddleEnd) {
  const relStart = {
    x: ballStart.x - paddleStart.x,
    y: ballStart.y - paddleStart.y,
  };
  const relEnd = {
    x: ballEnd.x - paddleEnd.x,
    y: ballEnd.y - paddleEnd.y,
  };
  const dx = relEnd.x - relStart.x;
  const dy = relEnd.y - relStart.y;
  const hx = PADDLE_WIDTH / 2 + BALL_RADIUS;
  const hy = PADDLE_HEIGHT / 2 + BALL_RADIUS;

  const inside = Math.abs(relStart.x) <= hx && Math.abs(relStart.y) <= hy;
  if (inside) {
    const penX = hx - Math.abs(relStart.x);
    const penY = hy - Math.abs(relStart.y);
    if (penX <= penY) {
      return {
        t: 0,
        normal: { x: relStart.x >= 0 ? 1 : -1, y: 0 },
      };
    }
    return {
      t: 0,
      normal: { x: 0, y: relStart.y >= 0 ? 1 : -1 },
    };
  }

  const slabX = axisSlab(relStart.x, dx, hx, 'x');
  const slabY = axisSlab(relStart.y, dy, hy, 'y');
  if (!slabX || !slabY) return null;

  const tEnter = Math.max(slabX.near, slabY.near);
  const tExit = Math.min(slabX.far, slabY.far);
  if (tEnter > tExit || tExit < 0 || tEnter > 1) return null;

  const normal = slabX.near > slabY.near ? slabX.normal : slabY.normal;
  return { t: Math.max(0, tEnter), normal };
}

function enforcePlayableAngle(ball, side) {
  let speed = Math.hypot(ball.vx, ball.vy);
  if (speed < 1) speed = START_BALL_SPEED;

  const minHorizontal = speed * MIN_HORIZONTAL_RATIO;
  if (Math.abs(ball.vx) < minHorizontal) {
    const sign = side === 'a' ? 1 : -1;
    const nextVx = sign * minHorizontal;
    const remaining = Math.max(0, speed * speed - nextVx * nextVx);
    const vySign = ball.vy === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(ball.vy);
    ball.vx = nextVx;
    ball.vy = vySign * Math.sqrt(remaining);
  }
}

function normalizeBallSpeed(ball, targetSpeed, side) {
  const current = Math.hypot(ball.vx, ball.vy) || 1;
  const scale = targetSpeed / current;
  ball.vx *= scale;
  ball.vy *= scale;
  ball.speed = targetSpeed;
  enforcePlayableAngle(ball, side);
}

export function createArkanoidDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  let paddles = { a: makePaddle('a'), b: makePaddle('b') };
  let ball = makeBall();
  let scores = { a: 0, b: 0 };
  let round = 1;
  let phase = 'serve';
  let status = 'playing';
  let result = null;
  let roundWinner = null;
  let roundMessage = 'Приготовьтесь';
  let serveEndsAt = Date.now() + SERVE_DELAY_MS;
  let serveToward = Math.random() < 0.5 ? 'a' : 'b';
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let interval = null;
  let phaseTimer = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'arkanoid-duel',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      field: {
        ...FIELD,
        paddleWidth: PADDLE_WIDTH,
        paddleHeight: PADDLE_HEIGHT,
        paddleX: PADDLE_X,
        paddleMaxSpeed: PADDLE_MAX_SPEED,
        ballRadius: BALL_RADIUS,
      },
      paddles: {
        a: publicPaddle(paddles.a),
        b: publicPaddle(paddles.b),
      },
      ball: publicBall(ball),
      scores,
      round,
      winsToMatch: WINS_TO_MATCH,
      startBallSpeed: START_BALL_SPEED,
      maxBallSpeed: MAX_BALL_SPEED,
      phase,
      serveEndsAt,
      roundWinner,
      roundMessage,
      status,
      result,
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

  function clearPhaseTimer() {
    if (phaseTimer) clearTimeout(phaseTimer);
    phaseTimer = null;
  }

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    clearPhaseTimer();
    if (interval) clearInterval(interval);
    result = { winner, type, message };
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function launchBall() {
    if (status !== 'playing') return;
    phase = 'playing';
    roundMessage = '';
    serveEndsAt = 0;

    const towardLeft = serveToward === 'a';
    const angleY = (Math.random() * 0.66 - 0.33) * START_BALL_SPEED;
    const vxMag = Math.sqrt(Math.max(1, START_BALL_SPEED ** 2 - angleY ** 2));
    ball = makeBall();
    ball.vx = towardLeft ? -vxMag : vxMag;
    ball.vy = angleY;
    emitState(true);
  }

  function prepareServe() {
    if (status !== 'playing') return;
    clearPhaseTimer();
    paddles = { a: makePaddle('a'), b: makePaddle('b') };
    ball = makeBall();
    phase = 'serve';
    roundWinner = null;
    roundMessage = 'Приготовьтесь';
    serveEndsAt = Date.now() + SERVE_DELAY_MS;
    lastTickAt = Date.now();
    emitState(true);
    phaseTimer = setTimeout(launchBall, SERVE_DELAY_MS);
    phaseTimer.unref?.();
  }

  function endRound(winner) {
    if (status !== 'playing' || phase !== 'playing') return;
    scores = { ...scores, [winner]: scores[winner] + 1 };
    phase = 'round-over';
    roundWinner = winner;
    roundMessage = winner === 'a' ? `${bySeat.a.name} берёт раунд` : `${bySeat.b.name} берёт раунд`;
    ball.vx = 0;
    ball.vy = 0;
    emitState(true);

    if (scores[winner] >= WINS_TO_MATCH) {
      finishMatch(winner, 'score', 'Первым набраны три победы в раундах.');
      return;
    }

    round += 1;
    serveToward = opposite(winner); // next serve flies toward the player who lost the point
    clearPhaseTimer();
    phaseTimer = setTimeout(prepareServe, ROUND_OVER_MS);
    phaseTimer.unref?.();
  }

  function updatePaddle(paddle, dt) {
    const minY = PADDLE_HALF_HEIGHT + EDGE_PADDING;
    const maxY = FIELD.height - PADDLE_HALF_HEIGHT - EDGE_PADDING;
    const desired = clamp(paddle.targetY, minY, maxY);
    const delta = desired - paddle.y;
    const maxMove = PADDLE_MAX_SPEED * dt;
    const move = clamp(delta, -maxMove, maxMove);
    const oldY = paddle.y;
    paddle.y = clamp(paddle.y + move, minY, maxY);
    paddle.vy = dt > 0 ? (paddle.y - oldY) / dt : 0;
  }

  function hitPaddle(seat, hit, ballStart, ballEnd, paddleStart, paddleEnd, dt) {
    const paddle = paddles[seat];
    const t = hit.t;
    const hitBall = {
      x: ballStart.x + (ballEnd.x - ballStart.x) * t,
      y: ballStart.y + (ballEnd.y - ballStart.y) * t,
    };
    const hitPaddleY = paddleStart.y + (paddleEnd.y - paddleStart.y) * t;
    const paddleVy = dt > 0 ? (paddleEnd.y - paddleStart.y) / dt : paddle.vy;
    const normal = hit.normal;

    // Put the ball exactly outside the paddle at first contact.
    if (Math.abs(normal.x) >= Math.abs(normal.y)) {
      hitBall.x = paddle.x + normal.x * (PADDLE_WIDTH / 2 + BALL_RADIUS + 0.8);
    } else {
      hitBall.y = hitPaddleY + normal.y * (PADDLE_HEIGHT / 2 + BALL_RADIUS + 0.8);
    }

    const relativeVx = ball.vx;
    const relativeVy = ball.vy - paddleVy;
    const vn = relativeVx * normal.x + relativeVy * normal.y;

    // Perfectly hard response in the paddle's moving frame.
    let reflectedX = relativeVx;
    let reflectedY = relativeVy;
    if (vn < 0) {
      reflectedX -= 2 * vn * normal.x;
      reflectedY -= 2 * vn * normal.y;
    }

    ball.x = hitBall.x;
    ball.y = hitBall.y;
    ball.vx = reflectedX;
    ball.vy = reflectedY + paddleVy;

    // Contact position and paddle movement both steer the outgoing trajectory.
    const offset = clamp((hitBall.y - hitPaddleY) / PADDLE_HALF_HEIGHT, -1, 1);
    ball.vy += offset * CONTACT_OFFSET_STEER;
    ball.vy += paddleVy * PADDLE_VELOCITY_STEER;

    // Always send the ball back into the arena after a face hit.
    if (seat === 'a' && ball.vx <= 0) ball.vx = Math.max(120, Math.abs(ball.vx));
    if (seat === 'b' && ball.vx >= 0) ball.vx = -Math.max(120, Math.abs(ball.vx));

    ball.hits += 1;
    ball.lastTouch = seat;
    const nextSpeed = Math.min(MAX_BALL_SPEED, Math.max(ball.speed * SPEED_MULTIPLIER + SPEED_ADD, ball.speed + 16));
    normalizeBallSpeed(ball, nextSpeed, seat);

    const remaining = Math.max(0, 1 - t) * dt;
    ball.x += ball.vx * remaining;
    ball.y += ball.vy * remaining;
  }

  function resolveVerticalWalls() {
    const minY = BALL_RADIUS;
    const maxY = FIELD.height - BALL_RADIUS;

    // Reflect overshoot instead of simply clamping; this preserves distance travelled.
    for (let guard = 0; guard < 3; guard += 1) {
      if (ball.y < minY) {
        ball.y = minY + (minY - ball.y);
        ball.vy = Math.abs(ball.vy);
        continue;
      }
      if (ball.y > maxY) {
        ball.y = maxY - (ball.y - maxY);
        ball.vy = -Math.abs(ball.vy);
        continue;
      }
      break;
    }
  }

  function simulateStep(dt) {
    const paddleStarts = {
      a: { x: paddles.a.x, y: paddles.a.y },
      b: { x: paddles.b.x, y: paddles.b.y },
    };

    updatePaddle(paddles.a, dt);
    updatePaddle(paddles.b, dt);

    if (phase !== 'playing') return;

    const ballStart = { x: ball.x, y: ball.y };
    const ballEnd = {
      x: ball.x + ball.vx * dt,
      y: ball.y + ball.vy * dt,
    };

    const paddleEnds = {
      a: { x: paddles.a.x, y: paddles.a.y },
      b: { x: paddles.b.x, y: paddles.b.y },
    };

    const candidates = [];
    if (ball.vx < 0 && ballStart.x >= PADDLE_X.a - PADDLE_WIDTH / 2 - BALL_RADIUS - 24) {
      const hit = sweptBallPaddle(ballStart, ballEnd, paddleStarts.a, paddleEnds.a);
      if (hit) candidates.push({ seat: 'a', hit });
    }
    if (ball.vx > 0 && ballStart.x <= PADDLE_X.b + PADDLE_WIDTH / 2 + BALL_RADIUS + 24) {
      const hit = sweptBallPaddle(ballStart, ballEnd, paddleStarts.b, paddleEnds.b);
      if (hit) candidates.push({ seat: 'b', hit });
    }

    candidates.sort((left, right) => left.hit.t - right.hit.t);
    if (candidates.length > 0) {
      const first = candidates[0];
      hitPaddle(first.seat, first.hit, ballStart, ballEnd, paddleStarts[first.seat], paddleEnds[first.seat], dt);
    } else {
      ball.x = ballEnd.x;
      ball.y = ballEnd.y;
    }

    resolveVerticalWalls();

    if (ball.x < -BALL_RADIUS - 8) {
      endRound('b');
    } else if (ball.x > FIELD.width + BALL_RADIUS + 8) {
      endRound('a');
    }
  }

  function tick() {
    if (status !== 'playing') return;
    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.04);

    // Small deterministic substeps keep wall and paddle geometry stable under lag spikes.
    const substeps = clamp(Math.ceil(dt / (1 / 220)), 1, 8);
    const stepDt = dt / substeps;
    for (let i = 0; i < substeps; i += 1) {
      simulateStep(stepDt);
      if (phase !== 'playing' || status !== 'playing') break;
    }

    emitState(false);
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || status !== 'playing') return;

    if (action.type === 'move') {
      const y = Number(action.y);
      if (!Number.isFinite(y)) return;
      const minY = PADDLE_HALF_HEIGHT + EDGE_PADDING;
      const maxY = FIELD.height - PADDLE_HALF_HEIGHT - EDGE_PADDING;
      paddles[seat].targetY = clamp(y, minY, maxY);
      return;
    }

    if (action.type === 'resign') {
      finishMatch(opposite(seat), 'resign', `${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    const seat = seatForSocket(socketId);
    if (!seat || status === 'finished') return;
    finishMatch(opposite(seat), 'disconnect', `${bySeat[seat].name} отключился.`);
  }

  function destroy() {
    clearPhaseTimer();
    if (interval) clearInterval(interval);
    interval = null;
  }

  interval = setInterval(tick, PHYSICS_TICK_MS);
  interval.unref?.();
  phaseTimer = setTimeout(launchBall, SERVE_DELAY_MS);
  phaseTimer.unref?.();

  return {
    playerSocketIds: Object.values(bySeat).map((player) => player.socketId),
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy,
  };
}
