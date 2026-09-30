const FIELD = {
  width: 1200,
  height: 720,
  topMin: 24,
  topMax: 322,
  bottomMin: 398,
  bottomMax: 696,
};

const PHYSICS_MS = 8;           // ~125 Hz physics
const EMIT_MS = 50;             // ~20 network snapshots/s
const CAT_X = 238;
const CAT_RADIUS = 25;
const GRAVITY = 1180;
const FLAP_SPEED = 455;
const MAX_VERTICAL_SPEED = 760;
const ROUND_SECONDS = 60;
const STAGE_SECONDS = 20;
const WINS_TO_MATCH = 3;
const COUNTDOWN_MS = 2400;
const ROUND_OVER_MS = 1250;
const FLAP_COOLDOWN_MS = 82;

const STAGES = {
  green: {
    name: 'ЗЕЛЁНЫЙ',
    color: '#62df55',
    speed: 275,
    spawnEvery: 1700,
    width: [78, 96],
  },
  blue: {
    name: 'СИНИЙ',
    color: '#4da2ff',
    speed: 330,
    spawnEvery: 1420,
    width: [82, 102],
  },
  red: {
    name: 'КРАСНЫЙ',
    color: '#ff4e5b',
    speed: 405,
    spawnEvery: 1180,
    width: [88, 108],
  },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const name = value.trim().slice(0, 28);
  return name || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function stageForElapsed(seconds) {
  if (seconds < 20) return 'green';
  if (seconds < 40) return 'blue';
  return 'red';
}

function makeCat(seat) {
  const top = seat === 'b';
  return {
    x: CAT_X,
    y: top ? FIELD.topMin + CAT_RADIUS + 4 : FIELD.bottomMax - CAT_RADIUS - 4,
    vy: 0,
    alive: true,
    top,
    lastFlapAt: 0,
  };
}

function publicCat(cat) {
  return {
    x: cat.x,
    y: Math.round(cat.y * 10) / 10,
    vy: Math.round(cat.vy * 10) / 10,
    alive: cat.alive,
    top: cat.top,
  };
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function obstacleRects(obstacle, lane) {
  const x = obstacle.x;
  const w = obstacle.width;
  const topLane = lane === 'top';
  const minY = topLane ? FIELD.topMin : FIELD.bottomMin;
  const maxY = topLane ? FIELD.topMax : FIELD.bottomMax;
  const laneH = maxY - minY;

  if (obstacle.kind === 'green') {
    const h = obstacle.height;
    if (topLane) {
      return [{ x, y: minY, width: w, height: h }];
    }
    return [{ x, y: maxY - h, width: w, height: h }];
  }

  if (obstacle.kind === 'blue') {
    const h = obstacle.height;
    const anchorOuter = obstacle.anchor === 'outer';
    if (topLane) {
      return anchorOuter
        ? [{ x, y: minY, width: w, height: h }]
        : [{ x, y: maxY - h, width: w, height: h }];
    }
    return anchorOuter
      ? [{ x, y: maxY - h, width: w, height: h }]
      : [{ x, y: minY, width: w, height: h }];
  }

  // Red: paired pipes with a narrow but always playable gap.
  const gapSize = obstacle.gapSize;
  const gapFromOuter = obstacle.gapFromOuter;
  if (topLane) {
    const gapStart = minY + gapFromOuter;
    return [
      { x, y: minY, width: w, height: Math.max(0, gapStart - minY) },
      { x, y: gapStart + gapSize, width: w, height: Math.max(0, maxY - (gapStart + gapSize)) },
    ];
  }

  const gapEnd = maxY - gapFromOuter;
  const gapStart = gapEnd - gapSize;
  return [
    { x, y: minY, width: w, height: Math.max(0, gapStart - minY) },
    { x, y: gapEnd, width: w, height: Math.max(0, maxY - gapEnd) },
  ];
}

function circleRectHit(cx, cy, radius, rect) {
  if (rect.width <= 0 || rect.height <= 0) return false;
  const nearestX = clamp(cx, rect.x, rect.x + rect.width);
  const nearestY = clamp(cy, rect.y, rect.y + rect.height);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function createFlyingCatsRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();

  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };

  let cats = { a: makeCat('a'), b: makeCat('b') };
  let scores = { a: 0, b: 0 };
  let round = 1;
  let status = 'playing';
  let phase = 'countdown';
  let result = null;
  let roundWinner = null;
  let roundMessage = 'Приготовьтесь';
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let roundStartedAt = 0;
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let lastSpawnAt = 0;
  let obstacleId = 1;
  let obstacles = [];
  let stage = 'green';
  let interval = null;
  let phaseTimer = null;
  let finished = false;
  let blueFlip = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    const elapsedMs = roundStartedAt && phase === 'playing'
      ? clamp(Date.now() - roundStartedAt, 0, ROUND_SECONDS * 1000)
      : 0;

    return {
      gameId: 'flying-cats',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      field: FIELD,
      catRadius: CAT_RADIUS,
      cats: {
        a: publicCat(cats.a),
        b: publicCat(cats.b),
      },
      scores,
      winsToMatch: WINS_TO_MATCH,
      round,
      phase,
      countdownEndsAt,
      roundStartedAt,
      roundDurationMs: ROUND_SECONDS * 1000,
      elapsedMs,
      stage,
      stages: {
        green: { ...STAGES.green },
        blue: { ...STAGES.blue },
        red: { ...STAGES.red },
      },
      obstacles: obstacles.map((o) => ({
        id: o.id,
        x: Math.round(o.x * 10) / 10,
        width: o.width,
        kind: o.kind,
        height: o.height ?? null,
        anchor: o.anchor ?? null,
        gapSize: o.gapSize ?? null,
        gapFromOuter: o.gapFromOuter ?? null,
      })),
      roundWinner,
      roundMessage,
      status,
      result,
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

  function clearPhaseTimer() {
    if (phaseTimer) clearTimeout(phaseTimer);
    phaseTimer = null;
  }

  function finishMatch(winner, type, message, draw = false) {
    if (status === 'finished') return;

    status = 'finished';
    phase = 'finished';
    result = { winner: draw ? null : winner, type, message, draw };
    clearPhaseTimer();
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    emitState(true);

    if (!finished) {
      finished = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resetRound() {
    cats = { a: makeCat('a'), b: makeCat('b') };
    obstacles = [];
    obstacleId = 1;
    blueFlip = false;
    stage = 'green';
    roundWinner = null;
    roundMessage = 'Приготовьтесь';
    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    roundStartedAt = 0;
    lastSpawnAt = 0;
    lastTickAt = Date.now();

    emitState(true);

    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      if (status !== 'playing') return;
      phase = 'playing';
      roundStartedAt = Date.now();
      lastSpawnAt = Date.now() - 650;
      roundMessage = '';
      emitState(true);
    }, COUNTDOWN_MS);
    phaseTimer.unref?.();
  }

  function endRound(winner, draw, message) {
    if (status !== 'playing' || phase !== 'playing') return;

    phase = 'round-over';
    roundWinner = draw ? null : winner;
    roundMessage = message;
    cats.a.vy = 0;
    cats.b.vy = 0;
    emitState(true);

    if (!draw) {
      scores = { ...scores, [winner]: scores[winner] + 1 };

      if (scores[winner] >= WINS_TO_MATCH) {
        emitState(true);
        finishMatch(winner, 'score', `${bySeat[winner].name} первым выиграл три раунда.`);
        return;
      }
    }

    round += 1;
    clearPhaseTimer();
    phaseTimer = setTimeout(resetRound, ROUND_OVER_MS);
    phaseTimer.unref?.();
  }

  function spawnObstacle() {
    const spec = STAGES[stage];
    const width = Math.round(rand(spec.width[0], spec.width[1]));
    const obstacle = {
      id: `pipe-${round}-${obstacleId++}`,
      x: FIELD.width + 35,
      width,
      kind: stage,
    };

    if (stage === 'green') {
      obstacle.height = Math.round(rand(82, 146));
    } else if (stage === 'blue') {
      blueFlip = !blueFlip;
      obstacle.anchor = blueFlip ? 'outer' : 'inner';
      obstacle.height = Math.round(rand(92, 154));
    } else {
      obstacle.gapSize = Math.round(rand(116, 142));
      const laneH = FIELD.topMax - FIELD.topMin;
      const minFromOuter = 44;
      const maxFromOuter = laneH - obstacle.gapSize - 44;
      obstacle.gapFromOuter = Math.round(rand(minFromOuter, Math.max(minFromOuter, maxFromOuter)));
    }

    obstacles.push(obstacle);
  }

  function updateCat(cat, seat, dt) {
    const gravity = cat.top ? -GRAVITY : GRAVITY;
    cat.vy += gravity * dt;
    cat.vy = clamp(cat.vy, -MAX_VERTICAL_SPEED, MAX_VERTICAL_SPEED);
    cat.y += cat.vy * dt;

    if (cat.top) {
      const minY = FIELD.topMin + CAT_RADIUS;
      const maxY = FIELD.topMax - CAT_RADIUS;
      if (cat.y < minY) {
        cat.y = minY;
        if (cat.vy < 0) cat.vy = 0;
      }
      if (cat.y > maxY) {
        cat.y = maxY;
        if (cat.vy > 0) cat.vy = 0;
      }
    } else {
      const minY = FIELD.bottomMin + CAT_RADIUS;
      const maxY = FIELD.bottomMax - CAT_RADIUS;
      if (cat.y > maxY) {
        cat.y = maxY;
        if (cat.vy > 0) cat.vy = 0;
      }
      if (cat.y < minY) {
        cat.y = minY;
        if (cat.vy < 0) cat.vy = 0;
      }
    }
  }

  function catHitsAnyPipe(cat, seat) {
    const lane = cat.top ? 'top' : 'bottom';

    for (const obstacle of obstacles) {
      if (
        CAT_X + CAT_RADIUS < obstacle.x ||
        CAT_X - CAT_RADIUS > obstacle.x + obstacle.width
      ) continue;

      const rects = obstacleRects(obstacle, lane);
      for (const rect of rects) {
        if (circleRectHit(cat.x, cat.y, CAT_RADIUS, rect)) return true;
      }
    }
    return false;
  }

  function simulateStep(dt) {
    if (phase !== 'playing' || status !== 'playing') return;

    const elapsed = (Date.now() - roundStartedAt) / 1000;
    const nextStage = stageForElapsed(elapsed);

    if (nextStage !== stage) {
      stage = nextStage;
      lastSpawnAt = Date.now() - 350;
      roundMessage = `${STAGES[stage].name} УРОВЕНЬ`;
      emitState(true);
      setTimeout(() => {
        if (phase === 'playing' && stage === nextStage) {
          roundMessage = '';
          emitState(true);
        }
      }, 850).unref?.();
    }

    const spec = STAGES[stage];
    const now = Date.now();

    if (now - lastSpawnAt >= spec.spawnEvery) {
      lastSpawnAt = now;
      spawnObstacle();
    }

    const speed = spec.speed;
    for (const obstacle of obstacles) {
      obstacle.x -= speed * dt;
    }
    obstacles = obstacles.filter((o) => o.x + o.width > -40);

    updateCat(cats.a, 'a', dt);
    updateCat(cats.b, 'b', dt);

    // Check both players in the same physics step so truly simultaneous hits can draw.
    const deadA = catHitsAnyPipe(cats.a, 'a');
    const deadB = catHitsAnyPipe(cats.b, 'b');

    if (deadA || deadB) {
      cats.a.alive = !deadA;
      cats.b.alive = !deadB;

      if (deadA && deadB) {
        endRound(null, true, 'Оба котика врезались одновременно — ничья в раунде.');
      } else if (deadA) {
        endRound('b', false, `${bySeat.a.name} задел трубу.`);
      } else {
        endRound('a', false, `${bySeat.b.name} задел трубу.`);
      }
      return;
    }

    if (elapsed >= ROUND_SECONDS) {
      endRound(null, true, 'Оба прошли зелёный, синий и красный уровни — ничья в раунде.');
    }
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || status !== 'playing') return;

    if (action.type === 'flap') {
      if (phase !== 'playing') return;

      const cat = cats[seat];
      const now = Date.now();

      if (!cat.alive || now - cat.lastFlapAt < FLAP_COOLDOWN_MS) return;
      cat.lastFlapAt = now;
      cat.vy = cat.top ? FLAP_SPEED : -FLAP_SPEED;
      return;
    }

    if (action.type === 'resign') {
      finishMatch(opposite(seat), 'resign', `${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'disconnect', `${bySeat[seat].name} отключился.`);
  }

  function tick() {
    if (status !== 'playing') return;

    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.04);

    if (phase === 'playing') {
      const substeps = clamp(Math.ceil(dt / (1 / 220)), 1, 8);
      const stepDt = dt / substeps;
      for (let i = 0; i < substeps; i += 1) {
        simulateStep(stepDt);
        if (phase !== 'playing' || status !== 'playing') break;
      }
      emitState(false);
    }
  }

  interval = setInterval(tick, PHYSICS_MS);
  interval.unref?.();

  resetRound();

  return {
    playerSocketIds: Object.values(bySeat).map((p) => p.socketId),
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      clearPhaseTimer();
      if (interval) clearInterval(interval);
      interval = null;
    },
  };
}
