const GAME_ID = 'tron-light-cycles';
const WIDTH = 100;
const HEIGHT = 140;
// Physics runs at ~60 Hz, while snapshots are sent much less often.
// Phones interpolate between snapshots at their own display refresh rate.
const TICK_MS = 16;
const EMIT_EVERY_MS = 66; // ~15 network snapshots/s during motion
const UI_EMIT_EVERY_MS = 250; // countdown / round pause
const TRAIL_CHUNK_MS = 96;
const SPEED = 20;
const WALL_MARGIN = 2.2;
const TARGET_SCORE = 3;
const MATCH_DURATION_MS = 2.5 * 60 * 1000;
const COUNTDOWN_MS = 2200;
const ROUND_PAUSE_MS = 1700;
const TURN_COOLDOWN_MS = 95;

// След живёт 4.5 секунды. Последние 1.3 секунды он плавно гаснет.
const TRAIL_LIFETIME_MS = 5000;
const TRAIL_FADE_MS = 1600;

// Для собственной полосы игнорируем совсем свежий хвост прямо позади байка.
// Это главное исправление ложной «смерти от воздуха».
const OWN_TRAIL_GRACE_MS = 500;
const TRAIL_HIT_DISTANCE = 0.78;
const HEAD_HIT_DISTANCE = 2.8;

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(side) {
  return side === 'a' ? 'b' : 'a';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return distance(px, py, x1, y1);

  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return distance(px, py, nx, ny);
}

function movementFor(cycle, dt) {
  const step = SPEED * dt;
  const vectors = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const [dx, dy] = vectors[cycle.dir];
  return {
    x1: cycle.x,
    y1: cycle.y,
    x2: cycle.x + dx * step,
    y2: cycle.y + dy * step,
  };
}

function pruneTrail(cycle, now) {
  const cutoff = now - TRAIL_LIFETIME_MS;
  while (cycle.trail.length && cycle.trail[0].createdAt < cutoff) {
    cycle.trail.shift();
  }
}

function trailOpacity(createdAt, now) {
  const age = now - createdAt;
  if (age >= TRAIL_LIFETIME_MS) return 0;
  const fadeStartsAt = TRAIL_LIFETIME_MS - TRAIL_FADE_MS;
  if (age <= fadeStartsAt) return 1;
  return clamp((TRAIL_LIFETIME_MS - age) / TRAIL_FADE_MS, 0, 1);
}

function trailSnapshot(cycle, now) {
  pruneTrail(cycle, now);
  return cycle.trail.map((segment) => ({
    x1: segment.x1,
    y1: segment.y1,
    x2: segment.x2,
    y2: segment.y2,
    createdAt: segment.createdAt,
  }));
}

function appendTrail(cycle, move, now) {
  const last = cycle.trail[cycle.trail.length - 1];
  // Merge many tiny 60 Hz physics steps into short straight chunks. Collision
  // stays authoritative, but payload and client draw calls remain small.
  if (
    last &&
    last.dir === cycle.dir &&
    now - last.createdAt < TRAIL_CHUNK_MS
  ) {
    last.x2 = move.x2;
    last.y2 = move.y2;
    last.updatedAt = now;
    return;
  }

  cycle.trail.push({
    ...move,
    dir: cycle.dir,
    createdAt: now,
    updatedAt: now,
  });
}

function pathHitsTrail(move, trail, now, { ignoreFreshOwn = false } = {}) {
  for (const segment of trail) {
    if (ignoreFreshOwn && now - segment.createdAt < OWN_TRAIL_GRACE_MS) continue;

    // Проверяем новую позицию и середину маленького шага. Это надёжнее и
    // не создаёт ложного касания со своим хвостом в точке старта шага.
    const midX = (move.x1 + move.x2) / 2;
    const midY = (move.y1 + move.y2) / 2;
    const endDistance = pointSegmentDistance(move.x2, move.y2, segment.x1, segment.y1, segment.x2, segment.y2);
    const midDistance = pointSegmentDistance(midX, midY, segment.x1, segment.y1, segment.x2, segment.y2);

    if (Math.min(endDistance, midDistance) <= TRAIL_HIT_DISTANCE) return true;
  }
  return false;
}

export function createTronLightCyclesRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySide = {
    a: {
      socketId: shuffled[0].socketId,
      name: safePlayerName(shuffled[0].name),
      color: '#35e8ff',
      score: 0,
    },
    b: {
      socketId: shuffled[1].socketId,
      name: safePlayerName(shuffled[1].name),
      color: '#ff4fd8',
      score: 0,
    },
  };

  let status = 'playing';
  let phase = 'countdown';
  let round = 0;
  let roundWinner = null;
  let roundMessage = '';
  let result = null;
  let lastCrash = null;
  let roundStartsAt = 0;
  let matchEndsAt = 0;
  let nextRoundAt = 0;
  let lastPhysicsAt = Date.now();
  let lastEmitAt = 0;
  let finishedOnce = false;
  let cycles = null;

  function sideForSocket(socketId) {
    if (bySide.a.socketId === socketId) return 'a';
    if (bySide.b.socketId === socketId) return 'b';
    return null;
  }

  function freshCycle(side) {
    // Разводим стартовые траектории по разным полосам, чтобы игроки не
    // сталкивались лоб в лоб сами по себе сразу после старта.
    const isA = side === 'a';
    return {
      side,
      x: isA ? 28 : 72,
      y: isA ? 120 : 20,
      dir: isA ? 3 : 1,
      trail: [],
      lastTurnAt: 0,
    };
  }

  function setupRound() {
    round += 1;
    cycles = {
      a: freshCycle('a'),
      b: freshCycle('b'),
    };
    phase = 'countdown';
    roundWinner = null;
    roundMessage = '';
    lastCrash = null;
    roundStartsAt = Date.now() + COUNTDOWN_MS;
    if (round === 1 && !matchEndsAt) matchEndsAt = roundStartsAt + MATCH_DURATION_MS;
    nextRoundAt = 0;
    lastPhysicsAt = Date.now();
    lastEmitAt = 0;
    emitState(true);
  }

  function playerSnapshot(side, now) {
    const cycle = cycles?.[side];
    return {
      name: bySide[side].name,
      color: bySide[side].color,
      score: bySide[side].score,
      cycle: cycle ? {
        x: cycle.x,
        y: cycle.y,
        dir: cycle.dir,
        segments: trailSnapshot(cycle, now),
      } : null,
    };
  }

  function snapshotFor(socketId) {
    const now = Date.now();
    return {
      serverNow: now,
      gameId: GAME_ID,
      roomId,
      status,
      phase,
      playerSide: sideForSocket(socketId),
      players: {
        a: playerSnapshot('a', now),
        b: playerSnapshot('b', now),
      },
      arena: { width: WIDTH, height: HEIGHT },
      cycleSpeed: SPEED,
      targetScore: TARGET_SCORE,
      trailLifetimeMs: TRAIL_LIFETIME_MS,
      matchDurationMs: MATCH_DURATION_MS,
      matchRemainingMs: matchEndsAt ? Math.max(0, matchEndsAt - now) : MATCH_DURATION_MS,
      round,
      roundWinner,
      roundMessage,
      countdownMs: phase === 'countdown' ? Math.max(0, roundStartsAt - now) : 0,
      nextRoundMs: phase === 'roundOver' ? Math.max(0, nextRoundAt - now) : 0,
      lastCrash,
      result,
    };
  }

  function emitState(force = false) {
    if (!cycles) return;
    const now = Date.now();
    const minGap = phase === 'playing' ? EMIT_EVERY_MS : UI_EMIT_EVERY_MS;
    if (!force && now - lastEmitAt < minGap) return;
    lastEmitAt = now;
    for (const side of ['a', 'b']) {
      io.to(bySide[side].socketId).emit('game:state', snapshotFor(bySide[side].socketId));
    }
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = nextResult;
    clearInterval(interval);
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySide) });
    }
  }

  function finishRound(crashedSides, crashPoint) {
    if (phase !== 'playing' || status !== 'playing') return;
    lastCrash = crashPoint || null;

    if (crashedSides.size === 2) {
      roundWinner = null;
      roundMessage = 'Оба разбились — раунд без очка.';
    } else {
      const crashed = [...crashedSides][0];
      const winner = opposite(crashed);
      bySide[winner].score += 1;
      roundWinner = winner;
      roundMessage = `${bySide[winner].name} выигрывает раунд.`;

      if (bySide[winner].score >= TARGET_SCORE) {
        finish({
          type: 'score',
          winner,
          message: `${bySide[winner].name} первым набрал ${TARGET_SCORE} победы.`,
        });
        return;
      }
    }

    phase = 'roundOver';
    nextRoundAt = Date.now() + ROUND_PAUSE_MS;
    emitState(true);
  }

  function runPhysics(now) {
    const dt = Math.min(0.065, Math.max(0.001, (now - lastPhysicsAt) / 1000));
    lastPhysicsAt = now;

    for (const side of ['a', 'b']) pruneTrail(cycles[side], now);

    const moves = {
      a: movementFor(cycles.a, dt),
      b: movementFor(cycles.b, dt),
    };
    const next = {
      a: { x: moves.a.x2, y: moves.a.y2 },
      b: { x: moves.b.x2, y: moves.b.y2 },
    };
    const crashed = new Set();

    for (const side of ['a', 'b']) {
      const opponentSide = opposite(side);
      const p = next[side];

      if (
        p.x <= WALL_MARGIN || p.x >= WIDTH - WALL_MARGIN ||
        p.y <= WALL_MARGIN || p.y >= HEIGHT - WALL_MARGIN
      ) {
        crashed.add(side);
        continue;
      }

      if (pathHitsTrail(moves[side], cycles[side].trail, now, { ignoreFreshOwn: true })) {
        crashed.add(side);
        continue;
      }

      if (pathHitsTrail(moves[side], cycles[opponentSide].trail, now)) {
        crashed.add(side);
      }
    }

    // Только реальное столкновение двух голов, без невидимого «коридора» между ними.
    if (distance(next.a.x, next.a.y, next.b.x, next.b.y) <= HEAD_HIT_DISTANCE) {
      crashed.add('a');
      crashed.add('b');
    }

    if (crashed.size) {
      const sides = [...crashed];
      const crashPoint = sides.length === 1
        ? { side: sides[0], x: next[sides[0]].x, y: next[sides[0]].y }
        : { side: 'both', x: (next.a.x + next.b.x) / 2, y: (next.a.y + next.b.y) / 2 };
      finishRound(crashed, crashPoint);
      return;
    }

    for (const side of ['a', 'b']) {
      appendTrail(cycles[side], moves[side], now);
      cycles[side].x = next[side].x;
      cycles[side].y = next[side].y;
    }
  }

  function finishByTime() {
    if (status !== 'playing') return;

    const aScore = bySide.a.score;
    const bScore = bySide.b.score;

    if (aScore === bScore) {
      finish({
        type: 'time-draw',
        winner: null,
        message: `Время вышло. Ничья ${aScore}:${bScore}.`,
      });
      return;
    }

    const winner = aScore > bScore ? 'a' : 'b';
    finish({
      type: 'time',
      winner,
      message: `Время вышло. ${bySide[winner].name} побеждает по счёту ${aScore}:${bScore}.`,
    });
  }

  function handleTurn(socketId, direction) {
    if (status !== 'playing' || phase !== 'playing') return;
    if (direction !== 'left' && direction !== 'right') return;

    const side = sideForSocket(socketId);
    if (!side) return;

    const cycle = cycles[side];
    const now = Date.now();
    if (now - cycle.lastTurnAt < TURN_COOLDOWN_MS) return;

    cycle.dir = direction === 'right'
      ? (cycle.dir + 1) % 4
      : (cycle.dir + 3) % 4;
    cycle.lastTurnAt = now;
    emitState(true);
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const side = sideForSocket(socketId);
    if (!side) return;
    const winner = opposite(side);
    finish({
      type: 'resign',
      winner,
      message: `${bySide[side].name} покинул гонку.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'turn') handleTurn(socketId, action.payload?.direction);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const side = sideForSocket(socketId);
    if (!side) return;
    const winner = opposite(side);
    finish({
      type: 'disconnect',
      winner,
      message: 'Соперник отключился от игры.',
    });
  }

  const interval = setInterval(() => {
    if (status !== 'playing') return;
    const now = Date.now();

    if (matchEndsAt && now >= matchEndsAt) {
      finishByTime();
      return;
    }

    if (phase === 'countdown') {
      if (now >= roundStartsAt) {
        phase = 'playing';
        lastPhysicsAt = now;
      }
      emitState();
      return;
    }

    if (phase === 'roundOver') {
      if (now >= nextRoundAt) {
        setupRound();
      } else {
        emitState();
      }
      return;
    }

    if (phase === 'playing') {
      runPhysics(now);
      if (status === 'playing' && phase === 'playing') emitState();
    }
  }, TICK_MS);

  setupRound();

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [bySide.a.socketId, bySide.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(interval);
    },
  };
}
