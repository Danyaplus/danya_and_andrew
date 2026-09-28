const FIELD = { width: 1000, height: 560 };
const TICK_MS = 30;
const PLAYER_RADIUS = 34;
const BALL_RADIUS = 21;
const PLAYER_SPEED = 285;
const ROTATION_SPEED = 1.82;
const KICK_SPEED = 470;
const MAX_BALL_SPEED = 720;
const BALL_FRICTION_PER_SECOND = 0.42;
const GOAL_HALF_HEIGHT = 92;
const GOAL_LINE_X = 22;
const ROUND_TIME_MS = 60_000;
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

  function emitState() {
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
    emitState();

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
    emitState();
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
        emitState();
        finishMatch(winner, 'score', 'Первым набраны три победы в раундах.');
        return;
      }
    }

    emitState();
    round += 1;
    resetTimer = setTimeout(resetRound, ROUND_RESET_MS);
    resetTimer.unref?.();
  }

  function movePlayer(player, dt) {
    if (!player.moving) {
      player.angle = normalizeAngle(player.angle + ROTATION_SPEED * player.rotationDirection * dt);
      return;
    }

    const dx = Math.cos(player.angle) * PLAYER_SPEED * dt;
    const dy = Math.sin(player.angle) * PLAYER_SPEED * dt;
    const other = actors[opposite(player.seat)];

    let nextX = clamp(player.x + dx, PLAYER_RADIUS + 10, FIELD.width - PLAYER_RADIUS - 10);
    let nextY = clamp(player.y + dy, PLAYER_RADIUS + 10, FIELD.height - PLAYER_RADIUS - 10);

    const minDistance = PLAYER_RADIUS * 2 + 4;
    if (distanceSquared(nextX, nextY, other.x, other.y) < minDistance * minDistance) {
      const currentDx = player.x - other.x;
      const currentDy = player.y - other.y;
      const length = Math.hypot(currentDx, currentDy) || 1;
      nextX = other.x + (currentDx / length) * minDistance;
      nextY = other.y + (currentDy / length) * minDistance;
      nextX = clamp(nextX, PLAYER_RADIUS + 10, FIELD.width - PLAYER_RADIUS - 10);
      nextY = clamp(nextY, PLAYER_RADIUS + 10, FIELD.height - PLAYER_RADIUS - 10);
    }

    player.x = nextX;
    player.y = nextY;
  }

  function collideBallWithPlayer(player, now) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const minDistance = PLAYER_RADIUS + BALL_RADIUS;
    const distance = Math.hypot(dx, dy);
    if (distance >= minDistance) return;

    let nx;
    let ny;
    if (distance < 0.001) {
      nx = Math.cos(player.angle);
      ny = Math.sin(player.angle);
    } else {
      nx = dx / distance;
      ny = dy / distance;
    }

    // Never allow the player to visually enter the ball.
    ball.x = player.x + nx * (minDistance + 1.5);
    ball.y = player.y + ny * (minDistance + 1.5);

    const relativeTowardPlayer = ball.vx * nx + ball.vy * ny;
    if (relativeTowardPlayer < 0) {
      ball.vx -= 1.75 * relativeTowardPlayer * nx;
      ball.vy -= 1.75 * relativeTowardPlayer * ny;
    }

    if (player.moving && now - ball.lastKickAt[player.seat] >= 85) {
      const dirX = Math.cos(player.angle);
      const dirY = Math.sin(player.angle);
      ball.vx = ball.vx * 0.25 + dirX * KICK_SPEED;
      ball.vy = ball.vy * 0.25 + dirY * KICK_SPEED;
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
    emitState();
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
    const dt = Math.min(0.06, Math.max(0.001, (now - lastTickAt) / 1000));
    lastTickAt = now;

    if (phase === 'playing') {
      movePlayer(actors.a, dt);
      movePlayer(actors.b, dt);
      collideBallWithPlayer(actors.a, now);
      collideBallWithPlayer(actors.b, now);
      updateBall(dt, now);

      if (phase === 'playing' && timeLeftMs(now) <= 0) {
        endRound(null, 'Время вышло — ничья в раунде.');
      }
    }

    emitState();
  }, TICK_MS);
  interval.unref?.();

  return {
    id: roomId,
    gameId: 'spin-soccer',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
      if (resetTimer) clearTimeout(resetTimer);
    },
  };
}
