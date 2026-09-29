const FIELD = { width: 1000, height: 560 };
const PHYSICS_TICK_MS = 8;
const EMIT_EVERY_MS = 50;
const PLAYER_RADIUS = 34;
const BALL_RADIUS = 21;
const PLAYER_SPEED = 285;
const ROTATION_SPEED = 1.82;
const KICK_SPEED = 470;
const MAX_BALL_SPEED = 720;
const BALL_FRICTION_PER_SECOND = 0.42;
const GOAL_HALF_HEIGHT = 130;
const GOAL_LINE_X = 22;
const ROUND_TIME_MS = 150_000;
const ROUND_RESET_MS = 1850;
const WINS_TO_MATCH = 3;

function safePlayerName(value) {
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
  let next = angle;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function isInsideGoalMouth(y) {
  const middle = FIELD.height / 2;
  return y >= middle - GOAL_HALF_HEIGHT && y <= middle + GOAL_HALF_HEIGHT;
}

function makePlayer(seat) {
  const left = seat === 'a';
  return {
    seat,
    x: left ? 245 : FIELD.width - 245,
    y: FIELD.height / 2,
    angle: left ? 0 : Math.PI,
    // In screen coordinates +angle is clockwise. A is left/CW, B is right/CCW.
    rotationDirection: left ? 1 : -1,
    moving: false,
  };
}

function makeBall() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    lastTouch: null,
    lastKickAt: { a: 0, b: 0 },
  };
}

function publicPlayer(player) {
  return {
    seat: player.seat,
    x: Math.round(player.x * 10) / 10,
    y: Math.round(player.y * 10) / 10,
    angle: player.angle,
    rotationDirection: player.rotationDirection,
    moving: player.moving,
  };
}

function publicBall(ball) {
  return {
    x: Math.round(ball.x * 10) / 10,
    y: Math.round(ball.y * 10) / 10,
    vx: Math.round(ball.vx * 10) / 10,
    vy: Math.round(ball.vy * 10) / 10,
    lastTouch: ball.lastTouch,
  };
}

function limitBallSpeed(ball) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= MAX_BALL_SPEED || speed === 0) return;
  const scale = MAX_BALL_SPEED / speed;
  ball.vx *= scale;
  ball.vy *= scale;
}

export function createSpinSoccerRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: 'red' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: 'blue' },
  };

  let actors = { a: makePlayer('a'), b: makePlayer('b') };
  let ball = makeBall();
  let scores = { a: 0, b: 0 };
  let round = 1;
  let phase = 'playing';
  let status = 'playing';
  let result = null;
  let roundWinner = null;
  let roundMessage = '';
  let roundStartedAt = Date.now();
  let lastTickAt = Date.now();
  let interval = null;
  let resetTimer = null;
  let finishedOnce = false;
  let lastEmitAt = 0;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function timeLeftMs(now = Date.now()) {
    if (phase !== 'playing' || status !== 'playing') return 0;
    return Math.max(0, ROUND_TIME_MS - (now - roundStartedAt));
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'spin-soccer',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      field: FIELD,
      actors: {
        a: publicPlayer(actors.a),
        b: publicPlayer(actors.b),
      },
      ball: publicBall(ball),
      scores,
      round,
      winsToMatch: WINS_TO_MATCH,
      roundTimeMs: ROUND_TIME_MS,
      timeLeftMs: timeLeftMs(),
      phase,
      status,
      roundWinner,
      roundMessage,
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

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    actors.a.moving = false;
    actors.b.moving = false;
    result = { winner, type, message };
    if (resetTimer) clearTimeout(resetTimer);
    if (interval) clearInterval(interval);
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resetRound() {
    if (status !== 'playing') return;
    actors = { a: makePlayer('a'), b: makePlayer('b') };
    ball = makeBall();
    phase = 'playing';
    roundWinner = null;
    roundMessage = '';
    roundStartedAt = Date.now();
    lastTickAt = Date.now();
    emitState(true);
  }

  function endRound(winner, message) {
    if (status !== 'playing' || phase !== 'playing') return;
    actors.a.moving = false;
    actors.b.moving = false;
    phase = 'round-over';
    roundWinner = winner;
    roundMessage = message;

    if (winner) {
      scores = { ...scores, [winner]: scores[winner] + 1 };
      if (scores[winner] >= WINS_TO_MATCH) {
        emitState(true);
        finishMatch(winner, 'score', 'Первым набраны три победы в раундах.');
        return;
      }
    }

    emitState(true);
    round += 1;
    resetTimer = setTimeout(resetRound, ROUND_RESET_MS);
    resetTimer.unref?.();
  }

  function desiredPlayerVelocity(player) {
    if (!player.moving) return { x: 0, y: 0 };
    return {
      x: Math.cos(player.angle) * PLAYER_SPEED,
      y: Math.sin(player.angle) * PLAYER_SPEED,
    };
  }

  function clampPlayer(player) {
    player.x = clamp(player.x, PLAYER_RADIUS + 10, FIELD.width - PLAYER_RADIUS - 10);
    player.y = clamp(player.y, PLAYER_RADIUS + 10, FIELD.height - PLAYER_RADIUS - 10);
  }

  function collisionTimeBetweenPlayers(a, b, va, vb, dt) {
    const minDistance = PLAYER_RADIUS * 2 + 4;
    const rx = b.x - a.x;
    const ry = b.y - a.y;
    const rvx = vb.x - va.x;
    const rvy = vb.y - va.y;

    const c = rx * rx + ry * ry - minDistance * minDistance;
    if (c <= 0) return 0;

    const aa = rvx * rvx + rvy * rvy;
    if (aa < 1e-8) return null;

    const bb = 2 * (rx * rvx + ry * rvy);
    const discriminant = bb * bb - 4 * aa * c;
    if (discriminant < 0) return null;

    const root = Math.sqrt(discriminant);
    const t1 = (-bb - root) / (2 * aa);
    const t2 = (-bb + root) / (2 * aa);
    if (t1 >= 0 && t1 <= dt) return t1;
    if (t2 >= 0 && t2 <= dt) return t2;
    return null;
  }

  function separatePlayers() {
    const a = actors.a;
    const b = actors.b;
    const minDistance = PLAYER_RADIUS * 2 + 4;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let distance = Math.hypot(dx, dy);
    if (distance >= minDistance) return;

    if (distance < 0.001) {
      dx = 1;
      dy = 0;
      distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = minDistance - distance + 0.25;

    // Equal-size players share the correction. This also prevents one player
    // from tunnelling through the other at high speed.
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
    clampPlayer(a);
    clampPlayer(b);
  }

  function updatePlayers(dt) {
    const a = actors.a;
    const b = actors.b;

    if (!a.moving) {
      a.angle = normalizeAngle(a.angle + ROTATION_SPEED * a.rotationDirection * dt);
    }
    if (!b.moving) {
      b.angle = normalizeAngle(b.angle + ROTATION_SPEED * b.rotationDirection * dt);
    }

    let va = desiredPlayerVelocity(a);
    let vb = desiredPlayerVelocity(b);
    const hitAt = collisionTimeBetweenPlayers(a, b, va, vb, dt);

    if (hitAt === null) {
      a.x += va.x * dt;
      a.y += va.y * dt;
      b.x += vb.x * dt;
      b.y += vb.y * dt;
      clampPlayer(a);
      clampPlayer(b);
      separatePlayers();
      return;
    }

    // First move both players exactly to the moment their circles touch.
    a.x += va.x * hitAt;
    a.y += va.y * hitAt;
    b.x += vb.x * hitAt;
    b.y += vb.y * hitAt;

    let nx = b.x - a.x;
    let ny = b.y - a.y;
    const normalLength = Math.hypot(nx, ny) || 1;
    nx /= normalLength;
    ny /= normalLength;

    const aNormal = va.x * nx + va.y * ny;
    const bNormal = vb.x * nx + vb.y * ny;

    // When the players are pushing into each other, use an equal-mass,
    // perfectly inelastic contact along the collision normal.
    // One moving player + one stationary player -> both are pushed together.
    // Equal players running head-on -> their normal speeds cancel to zero.
    if (aNormal > bNormal) {
      const sharedNormal = (aNormal + bNormal) * 0.5;
      va = {
        x: va.x + (sharedNormal - aNormal) * nx,
        y: va.y + (sharedNormal - aNormal) * ny,
      };
      vb = {
        x: vb.x + (sharedNormal - bNormal) * nx,
        y: vb.y + (sharedNormal - bNormal) * ny,
      };
    }

    const remaining = Math.max(0, dt - hitAt);
    a.x += va.x * remaining;
    a.y += va.y * remaining;
    b.x += vb.x * remaining;
    b.y += vb.y * remaining;

    clampPlayer(a);
    clampPlayer(b);
    separatePlayers();
  }

  function collideBallWithPlayer(player, now) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const minDistance = PLAYER_RADIUS + BALL_RADIUS;
    const distance = Math.hypot(dx, dy);
    if (distance >= minDistance) return;

    // Collision normal always points from the player toward the ball.
    // This is the key to side hits: a ball touched on the right side
    // is pushed to the right instead of always following the player's facing angle.
    let nx;
    let ny;
    if (distance < 0.001) {
      nx = Math.cos(player.angle);
      ny = Math.sin(player.angle);
    } else {
      nx = dx / distance;
      ny = dy / distance;
    }

    // Hard positional separation: the player and the ball can never overlap.
    ball.x = player.x + nx * (minDistance + 1.5);
    ball.y = player.y + ny * (minDistance + 1.5);

    const playerVx = player.moving ? Math.cos(player.angle) * PLAYER_SPEED : 0;
    const playerVy = player.moving ? Math.sin(player.angle) * PLAYER_SPEED : 0;

    // Resolve the impact in the contact-normal direction, just like two round bodies.
    // The tangential part of the ball velocity is preserved, so glancing hits create
    // diagonal trajectories naturally.
    const relativeNormalSpeed = (ball.vx - playerVx) * nx + (ball.vy - playerVy) * ny;
    const restitution = 0.88;

    if (relativeNormalSpeed < 0) {
      const impulse = -(1 + restitution) * relativeNormalSpeed;
      ball.vx += impulse * nx;
      ball.vy += impulse * ny;
    }

    if (player.moving && now - ball.lastKickAt[player.seat] >= 85) {
      const playerNormalSpeed = Math.max(0, playerVx * nx + playerVy * ny);
      const ballNormalSpeed = ball.vx * nx + ball.vy * ny;

      // Give a deliberate kick a minimum punch, but still in the real contact-normal
      // direction. Center hit -> mostly forward. Side hit -> strong diagonal/side shot.
      const desiredNormalSpeed = Math.max(
        KICK_SPEED * 0.58,
        playerNormalSpeed * 1.72,
      );

      if (ballNormalSpeed < desiredNormalSpeed) {
        const extra = desiredNormalSpeed - ballNormalSpeed;
        ball.vx += extra * nx;
        ball.vy += extra * ny;
      }

      // A small amount of the player's sideways motion is transferred to the ball.
      // This makes grazing contacts feel less robotic without overpowering the normal hit.
      const tx = -ny;
      const ty = nx;
      const playerTangentSpeed = playerVx * tx + playerVy * ty;
      ball.vx += tx * playerTangentSpeed * 0.16;
      ball.vy += ty * playerTangentSpeed * 0.16;

      ball.lastTouch = player.seat;
      ball.lastKickAt[player.seat] = now;
    }

    limitBallSpeed(ball);
  }

  function updateBall(dt, now) {
    const speed = Math.hypot(ball.vx, ball.vy);
    const steps = Math.max(1, Math.ceil((speed * dt) / 10));
    const stepDt = dt / steps;

    for (let step = 0; step < steps; step += 1) {
      ball.x += ball.vx * stepDt;
      ball.y += ball.vy * stepDt;

      collideBallWithPlayer(actors.a, now);
      collideBallWithPlayer(actors.b, now);

      if (ball.y - BALL_RADIUS < 8) {
        ball.y = 8 + BALL_RADIUS;
        ball.vy = Math.abs(ball.vy) * 0.9;
      } else if (ball.y + BALL_RADIUS > FIELD.height - 8) {
        ball.y = FIELD.height - 8 - BALL_RADIUS;
        ball.vy = -Math.abs(ball.vy) * 0.9;
      }

      const mouth = isInsideGoalMouth(ball.y);
      if (!mouth) {
        if (ball.x - BALL_RADIUS < GOAL_LINE_X) {
          ball.x = GOAL_LINE_X + BALL_RADIUS;
          ball.vx = Math.abs(ball.vx) * 0.9;
        } else if (ball.x + BALL_RADIUS > FIELD.width - GOAL_LINE_X) {
          ball.x = FIELD.width - GOAL_LINE_X - BALL_RADIUS;
          ball.vx = -Math.abs(ball.vx) * 0.9;
        }
      } else {
        if (ball.x + BALL_RADIUS < 0) {
          endRound('b', 'Гол в левые ворота!');
          return;
        }
        if (ball.x - BALL_RADIUS > FIELD.width) {
          endRound('a', 'Гол в правые ворота!');
          return;
        }
      }
    }

    const friction = Math.pow(BALL_FRICTION_PER_SECOND, dt);
    ball.vx *= friction;
    ball.vy *= friction;
    if (Math.abs(ball.vx) < 2) ball.vx = 0;
    if (Math.abs(ball.vy) < 2) ball.vy = 0;
  }

  function handleDrive(socketId, active) {
    if (status !== 'playing' || phase !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    actors[seat].moving = Boolean(active);
    emitState(true);
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'resign', 'Соперник покинул матч.');
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'drive') handleDrive(socketId, action.active);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  interval = setInterval(() => {
    if (status !== 'playing') return;
    const now = Date.now();
    const dt = Math.min(0.025, Math.max(0.001, (now - lastTickAt) / 1000));
    lastTickAt = now;

    if (phase === 'playing') {
      updatePlayers(dt);
      collideBallWithPlayer(actors.a, now);
      collideBallWithPlayer(actors.b, now);
      updateBall(dt, now);

      if (phase === 'playing' && timeLeftMs(now) <= 0) {
        endRound(null, 'Время вышло — ничья в раунде.');
      }
    }

    emitState();
  }, PHYSICS_TICK_MS);
  interval.unref?.();

  return {
    id: roomId,
    gameId: 'spin-soccer',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
      if (resetTimer) clearTimeout(resetTimer);
    },
  };
}
