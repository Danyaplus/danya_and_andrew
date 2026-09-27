const GAME_ID = 'tron-light-cycles';
const WIDTH = 100;
const HEIGHT = 140;
const TICK_MS = 40;
const SPEED = 24;
const WALL_MARGIN = 1.8;
const COLLISION_DISTANCE = 1.6;
const TARGET_SCORE = 3;
const COUNTDOWN_MS = 2600;
const ROUND_PAUSE_MS = 1800;
const TURN_COOLDOWN_MS = 100;
const OWN_TRAIL_GRACE_MS = 190;

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
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return distance(px, py, x1, y1);

  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  const nearestX = x1 + t * dx;
  const nearestY = y1 + t * dy;
  return distance(px, py, nearestX, nearestY);
}

function orientation(ax, ay, bx, by, cx, cy) {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(ax, ay, bx, by, cx, cy) {
  return bx <= Math.max(ax, cx) + 0.000001 &&
    bx + 0.000001 >= Math.min(ax, cx) &&
    by <= Math.max(ay, cy) + 0.000001 &&
    by + 0.000001 >= Math.min(ay, cy);
}

function segmentsIntersect(a, b) {
  const o1 = orientation(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const o2 = orientation(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const o3 = orientation(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const o4 = orientation(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a.x1, a.y1, b.x1, b.y1, a.x2, a.y2)) return true;
  if (o2 === 0 && onSegment(a.x1, a.y1, b.x2, b.y2, a.x2, a.y2)) return true;
  if (o3 === 0 && onSegment(b.x1, b.y1, a.x1, a.y1, b.x2, b.y2)) return true;
  if (o4 === 0 && onSegment(b.x1, b.y1, a.x2, a.y2, b.x2, b.y2)) return true;
  return false;
}

function segmentDistance(a, b) {
  if (segmentsIntersect(a, b)) return 0;
  return Math.min(
    pointSegmentDistance(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2),
    pointSegmentDistance(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2),
    pointSegmentDistance(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2),
    pointSegmentDistance(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2),
  );
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

function currentSegment(cycle, endX = cycle.x, endY = cycle.y) {
  return {
    x1: cycle.segmentStart.x,
    y1: cycle.segmentStart.y,
    x2: endX,
    y2: endY,
  };
}

function segmentLength(segment) {
  return distance(segment.x1, segment.y1, segment.x2, segment.y2);
}

function snapshotSegments(cycle) {
  const segments = cycle.segments.map((segment) => ({ ...segment }));
  const active = currentSegment(cycle);
  if (segmentLength(active) > 0.05) segments.push(active);
  return segments;
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
  let nextRoundAt = 0;
  let lastPhysicsAt = Date.now();
  let finishedOnce = false;
  let cycles = null;

  function sideForSocket(socketId) {
    if (bySide.a.socketId === socketId) return 'a';
    if (bySide.b.socketId === socketId) return 'b';
    return null;
  }

  function freshCycle(side, xOffset) {
    const isA = side === 'a';
    const x = 50 + xOffset;
    const y = isA ? 118 : 22;
    return {
      side,
      x,
      y,
      dir: isA ? 3 : 1,
      segmentStart: { x, y },
      segments: [],
      lastTurnAt: 0,
      ignoreOwnLastUntil: 0,
    };
  }

  function setupRound() {
    round += 1;
    const offset = (Math.random() * 18) - 9;
    cycles = {
      a: freshCycle('a', offset),
      b: freshCycle('b', -offset),
    };
    phase = 'countdown';
    roundWinner = null;
    roundMessage = '';
    lastCrash = null;
    roundStartsAt = Date.now() + COUNTDOWN_MS;
    nextRoundAt = 0;
    lastPhysicsAt = Date.now();
    emitState();
  }

  function playerSnapshot(side) {
    const cycle = cycles?.[side];
    return {
      name: bySide[side].name,
      color: bySide[side].color,
      score: bySide[side].score,
      cycle: cycle ? {
        x: cycle.x,
        y: cycle.y,
        dir: cycle.dir,
        segments: snapshotSegments(cycle),
      } : null,
    };
  }

  function snapshotFor(socketId) {
    const now = Date.now();
    return {
      gameId: GAME_ID,
      roomId,
      status,
      phase,
      playerSide: sideForSocket(socketId),
      players: {
        a: playerSnapshot('a'),
        b: playerSnapshot('b'),
      },
      arena: { width: WIDTH, height: HEIGHT },
      targetScore: TARGET_SCORE,
      round,
      roundWinner,
      roundMessage,
      countdownMs: phase === 'countdown' ? Math.max(0, roundStartsAt - now) : 0,
      nextRoundMs: phase === 'roundOver' ? Math.max(0, nextRoundAt - now) : 0,
      lastCrash,
      result,
    };
  }

  function emitState() {
    for (const side of ['a', 'b']) {
      io.to(bySide[side].socketId).emit('game:state', snapshotFor(bySide[side].socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: GAME_ID, roomId, message });
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = nextResult;
    clearInterval(interval);
    emitState();

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
    emitState();
  }

  function collidesWithTrails(side, movement, now, predicted) {
    const cycle = cycles[side];
    const opponentSide = opposite(side);
    const opponent = cycles[opponentSide];

    for (let index = 0; index < cycle.segments.length; index += 1) {
      const segment = cycle.segments[index];
      const isLast = index === cycle.segments.length - 1;
      if (isLast && now < cycle.ignoreOwnLastUntil) continue;
      if (segmentDistance(movement, segment) < COLLISION_DISTANCE) return true;
    }

    for (const segment of opponent.segments) {
      if (segmentDistance(movement, segment) < COLLISION_DISTANCE) return true;
    }

    const opponentActive = currentSegment(opponent, predicted[opponentSide].x, predicted[opponentSide].y);
    if (segmentLength(opponentActive) > 0.05 && segmentDistance(movement, opponentActive) < COLLISION_DISTANCE) {
      return true;
    }

    return false;
  }

  function runPhysics(now) {
    const dt = Math.min(0.08, Math.max(0.001, (now - lastPhysicsAt) / 1000));
    lastPhysicsAt = now;

    const moves = {
      a: movementFor(cycles.a, dt),
      b: movementFor(cycles.b, dt),
    };
    const predicted = {
      a: { x: moves.a.x2, y: moves.a.y2 },
      b: { x: moves.b.x2, y: moves.b.y2 },
    };
    const crashed = new Set();

    for (const side of ['a', 'b']) {
      const next = predicted[side];
      if (
        next.x <= WALL_MARGIN ||
        next.x >= WIDTH - WALL_MARGIN ||
        next.y <= WALL_MARGIN ||
        next.y >= HEIGHT - WALL_MARGIN
      ) {
        crashed.add(side);
        continue;
      }

      if (collidesWithTrails(side, moves[side], now, predicted)) crashed.add(side);
    }

    if (distance(predicted.a.x, predicted.a.y, predicted.b.x, predicted.b.y) < COLLISION_DISTANCE * 1.8) {
      crashed.add('a');
      crashed.add('b');
    }

    if (segmentsIntersect(moves.a, moves.b)) {
      crashed.add('a');
      crashed.add('b');
    }

    if (crashed.size > 0) {
      const sides = [...crashed];
      const point = sides.length === 1
        ? { side: sides[0], x: predicted[sides[0]].x, y: predicted[sides[0]].y }
        : {
          side: 'both',
          x: (predicted.a.x + predicted.b.x) / 2,
          y: (predicted.a.y + predicted.b.y) / 2,
        };
      finishRound(crashed, point);
      return;
    }

    for (const side of ['a', 'b']) {
      cycles[side].x = predicted[side].x;
      cycles[side].y = predicted[side].y;
    }
  }

  function handleTurn(socketId, direction) {
    if (status !== 'playing' || phase !== 'playing') return;
    if (direction !== 'left' && direction !== 'right') return;

    const side = sideForSocket(socketId);
    if (!side) return;

    const cycle = cycles[side];
    const now = Date.now();
    if (now - cycle.lastTurnAt < TURN_COOLDOWN_MS) return;

    const active = currentSegment(cycle);
    if (segmentLength(active) > 0.12) cycle.segments.push(active);
    cycle.segmentStart = { x: cycle.x, y: cycle.y };
    cycle.dir = direction === 'right'
      ? (cycle.dir + 1) % 4
      : (cycle.dir + 3) % 4;
    cycle.lastTurnAt = now;
    cycle.ignoreOwnLastUntil = now + OWN_TRAIL_GRACE_MS;
    emitState();
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
        return;
      }
      emitState();
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
