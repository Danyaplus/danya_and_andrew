const GAME_ID = 'snake-curve-duel';
const WIDTH = 120;
const HEIGHT = 72;
const TICK_MS = 16;
const EMIT_MS = 34;
const SPEED = 22;
const TURN_RATE = 2.05;
const TURN_RESPONSE = 7.5;
const BODY_RADIUS = 1.65;
const HEAD_RADIUS = 2.05;
const WALL_MARGIN = 1.2;
const BASE_LENGTH = 17;
const APPLE_GROWTH = 6;
const SAMPLE_DISTANCE = 0.72;
const NECK_GRACE = 5.2;
const APPLE_RADIUS = 2.2;
const COUNTDOWN_MS = 1800;
const ROUND_PAUSE_MS = 1700;
const WINS_TO_MATCH = 2;

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  return value.trim().slice(0, 28) || 'Игрок';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return distance(px, py, ax, ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  const x = ax + dx * t;
  const y = ay + dy * t;
  return distance(px, py, x, y);
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function createSnakeCurveDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name), color: '#ff334d', score: 0 },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name), color: '#2f8cff', score: 0 },
  };

  let status = 'playing';
  let phase = 'countdown';
  let round = 0;
  let snakes = null;
  let apple = null;
  let appleRespawnAt = 0;
  let roundStartsAt = 0;
  let nextRoundAt = 0;
  let roundWinner = null;
  let roundMessage = '';
  let result = null;
  let lastEmitAt = 0;
  let lastTickAt = Date.now();
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function freshSnake(seat) {
    const isA = seat === 'a';
    const x = isA ? 28 : 92;
    const y = isA ? 50 : 22;
    const angle = isA ? -0.18 : Math.PI - 0.18;
    const snake = {
      seat,
      x,
      y,
      angle,
      turnVelocity: isA ? TURN_RATE * 0.72 : TURN_RATE * 0.72,
      pressed: false,
      bodyLength: BASE_LENGTH,
      totalDistance: 0,
      body: [],
      sampleDistance: 0,
      alive: true,
    };

    // Pre-fill the tail so the snake starts visibly long.
    const spacing = 1.05;
    const points = Math.ceil(BASE_LENGTH / spacing);
    for (let i = points; i >= 1; i -= 1) {
      snake.body.push({
        x: x - Math.cos(angle) * i * spacing,
        y: y - Math.sin(angle) * i * spacing,
        s: -(i * spacing),
      });
    }
    snake.body.push({ x, y, s: 0 });
    return snake;
  }

  function randomApplePosition() {
    const margin = 9;
    for (let tries = 0; tries < 40; tries += 1) {
      const candidate = {
        x: margin + Math.random() * (WIDTH - margin * 2),
        y: margin + Math.random() * (HEIGHT - margin * 2),
      };
      if (
        distance(candidate.x, candidate.y, snakes.a.x, snakes.a.y) > 14 &&
        distance(candidate.x, candidate.y, snakes.b.x, snakes.b.y) > 14
      ) return candidate;
    }
    return { x: WIDTH / 2, y: HEIGHT / 2 };
  }

  function spawnApple(now = Date.now()) {
    apple = randomApplePosition();
    appleRespawnAt = 0;
    lastEmitAt = 0;
    emitState(true, now);
  }

  function scheduleApple(now) {
    apple = null;
    appleRespawnAt = now + 1800 + Math.random() * 2200;
  }

  function setupRound() {
    round += 1;
    snakes = { a: freshSnake('a'), b: freshSnake('b') };
    phase = 'countdown';
    roundWinner = null;
    roundMessage = '';
    apple = null;
    appleRespawnAt = 0;
    roundStartsAt = Date.now() + COUNTDOWN_MS;
    nextRoundAt = 0;
    lastTickAt = Date.now();
    lastEmitAt = 0;
    emitState(true);
  }

  function snapshotSnake(seat) {
    const s = snakes?.[seat];
    if (!s) return null;
    const body = [...s.body];
    const last = body[body.length - 1];
    if (!last || distance(last.x, last.y, s.x, s.y) > 0.08) {
      body.push({ x: s.x, y: s.y, s: s.totalDistance });
    }
    return {
      x: s.x,
      y: s.y,
      angle: s.angle,
      pressed: s.pressed,
      turnVelocity: s.turnVelocity,
      bodyLength: s.bodyLength,
      body: body.map(({ x, y }) => ({ x, y })),
    };
  }

  function snapshotFor(socketId) {
    const now = Date.now();
    const playerSeat = seatForSocket(socketId);
    return {
      serverNow: now,
      gameId: GAME_ID,
      roomId,
      status,
      phase,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      arena: { width: WIDTH, height: HEIGHT },
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color, score: bySeat.a.score },
        b: { name: bySeat.b.name, color: bySeat.b.color, score: bySeat.b.score },
      },
      snakes: {
        a: snapshotSnake('a'),
        b: snapshotSnake('b'),
      },
      apple,
      round,
      winsToMatch: WINS_TO_MATCH,
      roundWinner,
      roundMessage,
      countdownMs: phase === 'countdown' ? Math.max(0, roundStartsAt - now) : 0,
      nextRoundMs: phase === 'round-over' ? Math.max(0, nextRoundAt - now) : 0,
      speed: SPEED,
      result,
    };
  }

  function emitState(force = false, now = Date.now()) {
    if (!snakes) return;
    if (!force && now - lastEmitAt < EMIT_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = { winner, type, message };
    clearInterval(interval);
    emitState(true);
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishRound(crashed, reason) {
    if (phase !== 'playing' || status !== 'playing') return;

    if (crashed.size >= 2) {
      roundWinner = null;
      roundMessage = reason || 'Столкновение головами — ничья.';
    } else {
      const loser = [...crashed][0];
      const winner = opposite(loser);
      bySeat[winner].score += 1;
      roundWinner = winner;
      roundMessage = reason || `${bySeat[winner].name} выигрывает раунд.`;

      if (bySeat[winner].score >= WINS_TO_MATCH) {
        finishMatch(winner, 'score', `${bySeat[winner].name} первым выиграл ${WINS_TO_MATCH} раунда.`);
        return;
      }
    }

    phase = 'round-over';
    nextRoundAt = Date.now() + ROUND_PAUSE_MS;
    emitState(true);
  }

  function appendBodyPoint(snake) {
    const last = snake.body[snake.body.length - 1];
    if (!last || distance(last.x, last.y, snake.x, snake.y) >= SAMPLE_DISTANCE) {
      snake.body.push({ x: snake.x, y: snake.y, s: snake.totalDistance });
    }

    const cutoff = snake.totalDistance - snake.bodyLength - 1.5;
    while (snake.body.length > 3 && snake.body[1].s < cutoff) snake.body.shift();
  }

  function advanceSnake(snake, dt) {
    const targetTurn = snake.pressed ? -TURN_RATE : TURN_RATE;
    const alpha = 1 - Math.exp(-TURN_RESPONSE * dt);
    snake.turnVelocity += (targetTurn - snake.turnVelocity) * alpha;
    snake.angle = normalizeAngle(snake.angle + snake.turnVelocity * dt);

    const step = SPEED * dt;
    snake.x += Math.cos(snake.angle) * step;
    snake.y += Math.sin(snake.angle) * step;
    snake.totalDistance += step;
    appendBodyPoint(snake);
  }

  function bodyHit(snake, bodyOwner, { own = false } = {}) {
    const pts = bodyOwner.body;
    if (!pts || pts.length < 2) return false;
    const ignoreAfter = bodyOwner.totalDistance - (own ? NECK_GRACE : 3.8);

    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if ((b.s ?? bodyOwner.totalDistance) > ignoreAfter) continue;
      if (pointSegmentDistance(snake.x, snake.y, a.x, a.y, b.x, b.y) <= HEAD_RADIUS + BODY_RADIUS * 0.72) {
        return true;
      }
    }
    return false;
  }

  function checkApple(now) {
    if (!apple) {
      if (appleRespawnAt && now >= appleRespawnAt) spawnApple(now);
      return;
    }

    const eaters = [];
    for (const seat of ['a', 'b']) {
      const snake = snakes[seat];
      if (distance(snake.x, snake.y, apple.x, apple.y) <= HEAD_RADIUS + APPLE_RADIUS) eaters.push(seat);
    }
    if (!eaters.length) return;
    for (const seat of eaters) snakes[seat].bodyLength += APPLE_GROWTH;
    scheduleApple(now);
    emitState(true, now);
  }

  function runPhysics(now) {
    const dt = Math.min(0.04, Math.max(0.001, (now - lastTickAt) / 1000));
    lastTickAt = now;

    advanceSnake(snakes.a, dt);
    advanceSnake(snakes.b, dt);

    const crashed = new Set();
    for (const seat of ['a', 'b']) {
      const s = snakes[seat];
      if (
        s.x - HEAD_RADIUS <= WALL_MARGIN ||
        s.x + HEAD_RADIUS >= WIDTH - WALL_MARGIN ||
        s.y - HEAD_RADIUS <= WALL_MARGIN ||
        s.y + HEAD_RADIUS >= HEIGHT - WALL_MARGIN
      ) crashed.add(seat);
    }

    const headDistance = distance(snakes.a.x, snakes.a.y, snakes.b.x, snakes.b.y);
    if (headDistance <= HEAD_RADIUS * 2.05) {
      crashed.add('a');
      crashed.add('b');
      finishRound(crashed, 'Столкновение головами — ничья.');
      return;
    }

    for (const seat of ['a', 'b']) {
      const other = opposite(seat);
      if (bodyHit(snakes[seat], snakes[seat], { own: true })) crashed.add(seat);
      if (bodyHit(snakes[seat], snakes[other])) crashed.add(seat);
    }

    if (crashed.size) {
      if (crashed.size === 2) finishRound(crashed, 'Оба врезались одновременно — ничья.');
      else {
        const loser = [...crashed][0];
        finishRound(crashed, `${bySeat[loser].name} врезался — очко сопернику.`);
      }
      return;
    }

    checkApple(now);
  }

  function handleSteer(socketId, active) {
    if (status !== 'playing' || phase !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    snakes[seat].pressed = Boolean(active);
    emitState(true);
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'resign', 'Соперник вышел из матча.');
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'steer') handleSteer(socketId, action.active);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  const interval = setInterval(() => {
    if (status !== 'playing') return;
    const now = Date.now();

    if (phase === 'countdown') {
      if (now >= roundStartsAt) {
        phase = 'playing';
        lastTickAt = now;
        scheduleApple(now - 1200);
        emitState(true, now);
      }
    } else if (phase === 'playing') {
      runPhysics(now);
    } else if (phase === 'round-over' && now >= nextRoundAt) {
      setupRound();
      return;
    }

    emitState(false, now);
  }, TICK_MS);
  interval.unref?.();

  setupRound();

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(interval);
    },
  };
}
