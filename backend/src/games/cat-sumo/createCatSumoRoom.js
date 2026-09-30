const WORLD = {
  width: 1000,
  height: 650,
  cx: 500,
  cy: 325,
  ringRadius: 248,
};

const PLAYER_RADIUS = 38;
const ROTATE_SPEED = 2.35;       // rad/s
const DRIVE_ACCEL = 1080;        // px/s²
const MAX_SPEED = 235;           // px/s
const LINEAR_DAMPING = 2.55;
const RESTITUTION = 0.04;
const PHYSICS_MS = 8;            // ~125 Hz
const EMIT_MS = 80;              // ~12.5 network states/s; client predicts between snapshots
const COUNTDOWN_MS = 2400;
const ROUND_DURATION_MS = 150000; // 2:30
const ROUND_OVER_MS = 1500;
const TOTAL_ROUNDS = 2;
const FALL_MARGIN = 11;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const name = value.trim().slice(0, 28);
  return name || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function makePlayer(seat) {
  const left = seat === 'a';

  return {
    x: left ? WORLD.cx - 92 : WORLD.cx + 92,
    y: WORLD.cy,
    vx: 0,
    vy: 0,
    angle: left ? 0 : Math.PI,
    rotateSign: left ? 1 : -1,
    running: false,
    alive: true,
  };
}

function publicPlayer(player) {
  return {
    x: Math.round(player.x * 10) / 10,
    y: Math.round(player.y * 10) / 10,
    vx: Math.round(player.vx * 10) / 10,
    vy: Math.round(player.vy * 10) / 10,
    angle: Math.round(player.angle * 10000) / 10000,
    rotateSign: player.rotateSign,
    running: player.running,
    alive: player.alive,
  };
}

function capSpeed(player) {
  const speed = Math.hypot(player.vx, player.vy);

  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    player.vx *= scale;
    player.vy *= scale;
  }
}

function resolvePlayerCollision(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);

  const minimum = PLAYER_RADIUS * 2;

  if (dist >= minimum) return;

  if (dist < 0.0001) {
    dx = 1;
    dy = 0;
    dist = 1;
  }

  const nx = dx / dist;
  const ny = dy / dist;

  // Positional correction: prevents tunnelling/overlap without snapping the
  // players to a grid. Equal masses share the correction.
  const overlap = minimum - dist;
  const correction = overlap * 0.52;

  a.x -= nx * correction;
  a.y -= ny * correction;
  b.x += nx * correction;
  b.y += ny * correction;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velocityAlongNormal = rvx * nx + rvy * ny;

  // Only apply an impact impulse while the bodies are moving toward each other.
  if (velocityAlongNormal < 0) {
    const impulseMagnitude = -((1 + RESTITUTION) * velocityAlongNormal) / 2;
    const ix = impulseMagnitude * nx;
    const iy = impulseMagnitude * ny;

    a.vx -= ix;
    a.vy -= iy;
    b.vx += ix;
    b.vy += iy;
  }

  // Gentle contact friction only along the tangent. It keeps head-on pushes
  // stable while still allowing side hits to slide around the round body.
  const tx = -ny;
  const ty = nx;
  const relativeTangent = rvx * tx + rvy * ty;
  const tangentImpulse = clamp(-relativeTangent * 0.055, -12, 12);

  a.vx -= tx * tangentImpulse;
  a.vy -= ty * tangentImpulse;
  b.vx += tx * tangentImpulse;
  b.vy += ty * tangentImpulse;

  capSpeed(a);
  capSpeed(b);
}

function outsideRing(player) {
  const distance = Math.hypot(player.x - WORLD.cx, player.y - WORLD.cy);
  return distance > WORLD.ringRadius + FALL_MARGIN;
}

export function createCatSumoRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();

  const bySeat = {
    a: {
      socketId: shuffled[0].socketId,
      name: safeName(shuffled[0].name),
    },
    b: {
      socketId: shuffled[1].socketId,
      name: safeName(shuffled[1].name),
    },
  };

  let fighters = {
    a: makePlayer('a'),
    b: makePlayer('b'),
  };

  let round = 1;
  let roundWins = { a: 0, b: 0 };
  let status = 'playing';
  let phase = 'countdown';
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let roundStartedAt = 0;
  let roundWinner = null;
  let roundMessage = 'Приготовьтесь';
  let result = null;

  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let physicsTimer = null;
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
      gameId: 'cat-sumo',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,

      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },

      world: WORLD,
      playerRadius: PLAYER_RADIUS,
      fighters: {
        a: publicPlayer(fighters.a),
        b: publicPlayer(fighters.b),
      },

      totalRounds: TOTAL_ROUNDS,
      round,
      roundWins,
      phase,
      status,
      countdownEndsAt,
      roundStartedAt,
      roundDurationMs: ROUND_DURATION_MS,
      roundWinner,
      roundMessage,
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

  function stopPhysics() {
    if (physicsTimer) clearInterval(physicsTimer);
    physicsTimer = null;
  }

  function finishMatch(message = '') {
    if (status === 'finished') return;

    status = 'finished';
    phase = 'finished';
    fighters.a.running = false;
    fighters.b.running = false;

    let winner = null;
    let draw = false;

    if (roundWins.a > roundWins.b) winner = 'a';
    else if (roundWins.b > roundWins.a) winner = 'b';
    else draw = true;

    result = {
      winner,
      draw,
      message: draw
        ? `После двух раундов ${roundWins.a}:${roundWins.b} — ничья.`
        : message || `${bySeat[winner].name} выиграл матч.`,
    };

    clearPhaseTimer();
    stopPhysics();
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;

      // The final state has already been emitted above.
      // Release currentRoom immediately so "Новый соперник" works at once.
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resetRound() {
    fighters = {
      a: makePlayer('a'),
      b: makePlayer('b'),
    };

    roundWinner = null;
    roundMessage = `Раунд ${round} из ${TOTAL_ROUNDS}`;
    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    roundStartedAt = 0;
    lastTickAt = Date.now();

    emitState(true);

    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      if (status !== 'playing') return;

      phase = 'playing';
      roundMessage = '';
      roundStartedAt = Date.now();
      lastTickAt = Date.now();
      emitState(true);
    }, COUNTDOWN_MS);

    phaseTimer.unref?.();
  }

  function endRound(winner, draw, message) {
    if (status !== 'playing' || phase !== 'playing') return;

    phase = 'round-over';
    roundWinner = draw ? null : winner;
    roundMessage = message;

    fighters.a.running = false;
    fighters.b.running = false;

    if (!draw) {
      roundWins = {
        ...roundWins,
        [winner]: roundWins[winner] + 1,
      };
    }

    emitState(true);

    if (round >= TOTAL_ROUNDS) {
      clearPhaseTimer();
      phaseTimer = setTimeout(() => {
        finishMatch(
          winner ? `${bySeat[winner].name} выиграл последний раунд.` : '',
        );
      }, ROUND_OVER_MS);

      phaseTimer.unref?.();
      return;
    }

    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      round += 1;
      resetRound();
    }, ROUND_OVER_MS);

    phaseTimer.unref?.();
  }

  function simulatePlayer(player, dt) {
    if (!player.running) {
      player.angle += player.rotateSign * ROTATE_SPEED * dt;
    }

    if (player.running) {
      player.vx += Math.cos(player.angle) * DRIVE_ACCEL * dt;
      player.vy += Math.sin(player.angle) * DRIVE_ACCEL * dt;
    }

    const damping = Math.exp(-LINEAR_DAMPING * dt);
    player.vx *= damping;
    player.vy *= damping;

    capSpeed(player);

    player.x += player.vx * dt;
    player.y += player.vy * dt;
  }

  function simulationStep(dt) {
    if (status !== 'playing' || phase !== 'playing') return;

    simulatePlayer(fighters.a, dt);
    simulatePlayer(fighters.b, dt);

    // Several tiny collision iterations make the round bodies feel solid
    // without requiring an expensive physics engine.
    for (let i = 0; i < 3; i += 1) {
      resolvePlayerCollision(fighters.a, fighters.b);
    }

    const fallenA = outsideRing(fighters.a);
    const fallenB = outsideRing(fighters.b);

    if (fallenA || fallenB) {
      fighters.a.alive = !fallenA;
      fighters.b.alive = !fallenB;

      if (fallenA && fallenB) {
        endRound(
          null,
          true,
          'Оба вылетели из ринга в одном физическом шаге — ничья.',
        );
      } else if (fallenA) {
        endRound(
          'b',
          false,
          `${bySeat.a.name} первым вылетел из круга.`,
        );
      } else {
        endRound(
          'a',
          false,
          `${bySeat.b.name} первым вылетел из круга.`,
        );
      }

      return;
    }

    if (Date.now() - roundStartedAt >= ROUND_DURATION_MS) {
      endRound(
        null,
        true,
        '2:30 закончились, оба остались в ринге — ничья раунда.',
      );
    }
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || status !== 'playing') return;

    if (action.type === 'run') {
      if (phase !== 'playing') return;

      const active = !!action.active;
      if (fighters[seat].running === active) return;

      fighters[seat].running = active;
      emitState(true);
      return;
    }

    if (action.type === 'resign') {
      const winner = opposite(seat);
      roundWins = {
        ...roundWins,
        [winner]: roundWins[winner] + 1,
      };
      finishMatch(`${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;

    const seat = seatForSocket(socketId);
    if (!seat) return;

    const winner = opposite(seat);
    roundWins = {
      ...roundWins,
      [winner]: roundWins[winner] + 1,
    };

    finishMatch(`${bySeat[seat].name} отключился.`);
  }

  physicsTimer = setInterval(() => {
    if (status !== 'playing' || phase !== 'playing') return;

    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.04);

    const substeps = clamp(Math.ceil(dt / (1 / 240)), 1, 8);
    const stepDt = dt / substeps;

    for (let i = 0; i < substeps; i += 1) {
      simulationStep(stepDt);

      if (phase !== 'playing' || status !== 'playing') break;
    }

    emitState(false);
  }, PHYSICS_MS);

  physicsTimer.unref?.();

  resetRound();

  return {
    playerSocketIds: Object.values(bySeat).map((player) => player.socketId),
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      clearPhaseTimer();
      stopPhysics();
    },
  };
}
