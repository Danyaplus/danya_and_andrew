const FIELD = {
  width: 1200,
  height: 720,
  top: 34,
  bottom: 686,
};

const PHYSICS_MS = 8;       // ~125 Hz
const EMIT_MS = 50;         // ~20 snapshots/s
const CAT_X = 238;
const CAT_RADIUS = 25;
const GRAVITY = 1120;
const FLAP_SPEED = 455;
const MAX_VERTICAL_SPEED = 780;
const ROUND_SECONDS = 60;
const WINS_TO_MATCH = 3;
const COUNTDOWN_MS = 2400;
const ROUND_OVER_MS = 1250;
const FLAP_COOLDOWN_MS = 82;

const STAGES = {
  green: {
    name: 'ЗЕЛЁНЫЙ',
    speed: 280,
    spawnEvery: 1650,
    width: [78, 98],
  },
  blue: {
    name: 'СИНИЙ',
    speed: 340,
    spawnEvery: 1450,
    width: [82, 104],
  },
  red: {
    name: 'КРАСНЫЙ',
    speed: 405,
    spawnEvery: 1280,
    width: [88, 110],
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
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
  const inverted = seat === 'b';

  return {
    x: CAT_X,
    y: inverted ? 158 : 562,
    vy: 0,
    alive: true,
    inverted,
    lastFlapAt: 0,
  };
}

function publicCat(cat) {
  return {
    x: cat.x,
    y: Math.round(cat.y * 10) / 10,
    vy: Math.round(cat.vy * 10) / 10,
    alive: cat.alive,
    inverted: cat.inverted,
  };
}

function obstacleRects(obstacle) {
  const x = obstacle.x;
  const width = obstacle.width;

  if (obstacle.kind === 'green') {
    if (obstacle.side === 'top') {
      return [{
        x,
        y: FIELD.top,
        width,
        height: obstacle.height,
      }];
    }

    return [{
      x,
      y: FIELD.bottom - obstacle.height,
      width,
      height: obstacle.height,
    }];
  }

  if (obstacle.kind === 'blue') {
    return [
      {
        x,
        y: FIELD.top,
        width,
        height: obstacle.topHeight,
      },
      {
        x,
        y: FIELD.bottom - obstacle.bottomHeight,
        width,
        height: obstacle.bottomHeight,
      },
    ];
  }

  return [
    {
      x,
      y: FIELD.top,
      width,
      height: obstacle.gapStart - FIELD.top,
    },
    {
      x,
      y: obstacle.gapStart + obstacle.gapSize,
      width,
      height: FIELD.bottom - (obstacle.gapStart + obstacle.gapSize),
    },
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
        speed: o.speed,
        side: o.side ?? null,
        height: o.height ?? null,
        topHeight: o.topHeight ?? null,
        bottomHeight: o.bottomHeight ?? null,
        gapStart: o.gapStart ?? null,
        gapSize: o.gapSize ?? null,
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
    result = {
      winner: draw ? null : winner,
      type,
      message,
      draw,
    };

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
      lastSpawnAt = Date.now() - 700;
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

    if (!draw) {
      scores = {
        ...scores,
        [winner]: scores[winner] + 1,
      };
    }

    emitState(true);

    if (!draw && scores[winner] >= WINS_TO_MATCH) {
      finishMatch(
        winner,
        'score',
        `${bySeat[winner].name} первым выиграл три раунда.`,
      );
      return;
    }

    round += 1;

    clearPhaseTimer();
    phaseTimer = setTimeout(resetRound, ROUND_OVER_MS);
    phaseTimer.unref?.();
  }

  function spawnObstacle() {
    const spec = STAGES[stage];
    const obstacle = {
      id: `pipe-${round}-${obstacleId++}`,
      x: FIELD.width + 35,
      width: Math.round(rand(spec.width[0], spec.width[1])),
      kind: stage,
      speed: spec.speed,
    };

    if (stage === 'green') {
      // Completely random. No alternation: top/top/top/bottom is valid.
      obstacle.side = Math.random() < 0.5 ? 'top' : 'bottom';
      obstacle.height = Math.round(rand(115, 255));
    }

    if (stage === 'blue') {
      // One short pipe + one long pipe. Which side is longer is random.
      const shortHeight = Math.round(rand(62, 118));
      const longHeight = Math.round(rand(185, 285));
      const topIsLong = Math.random() < 0.5;

      obstacle.topHeight = topIsLong ? longHeight : shortHeight;
      obstacle.bottomHeight = topIsLong ? shortHeight : longHeight;
    }

    if (stage === 'red') {
      // Both sides are dangerous. The opening is narrow and moves vertically.
      obstacle.gapSize = Math.round(rand(145, 178));

      const minPipe = 125;
      const minGapStart = FIELD.top + minPipe;
      const maxGapStart = FIELD.bottom - minPipe - obstacle.gapSize;

      obstacle.gapStart = Math.round(rand(minGapStart, maxGapStart));
    }

    obstacles.push(obstacle);
  }

  function updateCat(cat, dt) {
    // Seat B is the mirrored cat: gravity pulls upward, flap pushes downward.
    const gravity = cat.inverted ? -GRAVITY : GRAVITY;
    cat.vy += gravity * dt;
    cat.vy = clamp(cat.vy, -MAX_VERTICAL_SPEED, MAX_VERTICAL_SPEED);
    cat.y += cat.vy * dt;

    // IMPORTANT: both cats use the SAME full-height play area.
    const minY = FIELD.top + CAT_RADIUS;
    const maxY = FIELD.bottom - CAT_RADIUS;

    if (cat.y < minY) {
      cat.y = minY;
      if (cat.vy < 0) cat.vy = 0;
    }

    if (cat.y > maxY) {
      cat.y = maxY;
      if (cat.vy > 0) cat.vy = 0;
    }
  }

  function catHitsAnyPipe(cat) {
    for (const obstacle of obstacles) {
      if (
        CAT_X + CAT_RADIUS < obstacle.x ||
        CAT_X - CAT_RADIUS > obstacle.x + obstacle.width
      ) {
        continue;
      }

      for (const rect of obstacleRects(obstacle)) {
        if (circleRectHit(cat.x, cat.y, CAT_RADIUS, rect)) {
          return true;
        }
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
      lastSpawnAt = Date.now() - 420;
      roundMessage = `${STAGES[stage].name} УРОВЕНЬ`;
      emitState(true);

      setTimeout(() => {
        if (phase === 'playing' && stage === nextStage) {
          roundMessage = '';
          emitState(true);
        }
      }, 850).unref?.();
    }

    const now = Date.now();
    const spec = STAGES[stage];

    if (now - lastSpawnAt >= spec.spawnEvery) {
      lastSpawnAt = now;
      spawnObstacle();
    }

    for (const obstacle of obstacles) {
      obstacle.x -= obstacle.speed * dt;
    }

    obstacles = obstacles.filter((o) => o.x + o.width > -40);

    updateCat(cats.a, dt);
    updateCat(cats.b, dt);

    // Same physics step for both players => a truly simultaneous collision is a draw.
    const deadA = catHitsAnyPipe(cats.a);
    const deadB = catHitsAnyPipe(cats.b);

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
      endRound(
        null,
        true,
        'Оба пережили все 60 секунд — ничья в раунде.',
      );
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
      cat.vy = cat.inverted ? FLAP_SPEED : -FLAP_SPEED;
      return;
    }

    if (action.type === 'resign') {
      finishMatch(
        opposite(seat),
        'resign',
        `${bySeat[seat].name} покинул матч.`,
      );
    }
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;

    const seat = seatForSocket(socketId);
    if (!seat) return;

    finishMatch(
      opposite(seat),
      'disconnect',
      `${bySeat[seat].name} отключился.`,
    );
  }

  function tick() {
    if (status !== 'playing') return;

    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.04);

    if (phase !== 'playing') return;

    const substeps = clamp(Math.ceil(dt / (1 / 220)), 1, 8);
    const stepDt = dt / substeps;

    for (let i = 0; i < substeps; i += 1) {
      simulateStep(stepDt);
      if (phase !== 'playing' || status !== 'playing') break;
    }

    emitState(false);
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
