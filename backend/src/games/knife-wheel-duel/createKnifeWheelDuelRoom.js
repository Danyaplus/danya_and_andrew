const TICK_MS = 20;
const EMIT_EVERY_MS = 45;
const ROUND_INTRO_MS = 1450;
const ROUND_RESULT_MS = 2100;
const ROUND_COUNT = 3;
const KNIVES_BY_ROUND = [5, 6, 7];
const COLLISION_DEG = 15;
const THROW_COOLDOWN_MS = 260;
const PROJECTILE_FLIGHT_MS = 190;
const IMPACT_WORLD_DEG = { a: 180, b: 0 };

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

function normalizeDeg(value) {
  let angle = value % 360;
  if (angle < 0) angle += 360;
  return angle;
}

function angularDistance(a, b) {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(diff, 360 - diff);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomVelocity(roundIndex = 0) {
  const min = 70 + roundIndex * 12;
  const max = 135 + roundIndex * 20;
  const direction = Math.random() < 0.5 ? -1 : 1;
  return direction * randomBetween(min, max);
}

function makeRunner(seat, total) {
  return {
    seat,
    remaining: total,
    placed: 0,
    failed: false,
    completed: false,
    lastThrowAt: 0,
    inFlight: false,
    lastEvent: null,
    eventSerial: 0,
  };
}

export function createKnifeWheelDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: 'red' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: 'blue' },
  };

  let status = 'playing';
  let phase = 'round-intro';
  let result = null;
  let finishedOnce = false;
  let roundIndex = 0;
  let scores = { a: 0, b: 0 };
  let roundScores = { a: false, b: false };
  let runners = {};
  let stuckKnives = [];
  let wheelAngle = randomBetween(0, 360);
  let angularVelocity = randomVelocity(roundIndex);
  let targetAngularVelocity = angularVelocity;
  let pendingThrows = [];
  let nextVelocityChangeAt = Date.now() + randomBetween(850, 1700);
  let phaseEndsAt = Date.now() + ROUND_INTRO_MS;
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let interval = null;
  let knifeSerial = 0;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function beginRound(index, now = Date.now()) {
    roundIndex = index;
    const total = KNIVES_BY_ROUND[roundIndex];
    runners = {
      a: makeRunner('a', total),
      b: makeRunner('b', total),
    };
    roundScores = { a: false, b: false };
    stuckKnives = [];
    wheelAngle = randomBetween(0, 360);
    angularVelocity = randomVelocity(roundIndex);
    targetAngularVelocity = angularVelocity;
    pendingThrows = [];
    nextVelocityChangeAt = now + randomBetween(850, 1700);
    phase = 'round-intro';
    phaseEndsAt = now + ROUND_INTRO_MS;
  }

  beginRound(0, Date.now());

  function publicRunner(runner) {
    return {
      remaining: runner.remaining,
      placed: runner.placed,
      failed: runner.failed,
      completed: runner.completed,
      inFlight: runner.inFlight,
      lastEvent: runner.lastEvent ? { ...runner.lastEvent } : null,
    };
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'knife-wheel-duel',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      phase,
      status,
      result,
      round: roundIndex + 1,
      roundCount: ROUND_COUNT,
      knivesPerPlayer: KNIVES_BY_ROUND[roundIndex],
      scores: { ...scores },
      roundScores: { ...roundScores },
      runners: {
        a: publicRunner(runners.a),
        b: publicRunner(runners.b),
      },
      wheel: {
        angle: wheelAngle,
        velocity: angularVelocity,
        knives: stuckKnives.map((knife) => ({ ...knife })),
        projectiles: pendingThrows.map((shot) => ({
          id: shot.id,
          seat: shot.seat,
          launchAt: shot.launchAt,
          impactAt: shot.impactAt,
        })),
      },
      collisionDeg: COLLISION_DEG,
      phaseEndsAt,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_EVERY_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId, now));
    }
  }

  function finishMatch(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = nextResult;
    emitState(true);
    if (interval) clearInterval(interval);
    interval = null;
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishByScore() {
    if (scores.a === scores.b) {
      finishMatch({
        type: 'draw',
        winner: null,
        message: `Ничья — ${scores.a}:${scores.b}.`,
      });
      return;
    }
    const winner = scores.a > scores.b ? 'a' : 'b';
    finishMatch({
      type: 'score',
      winner,
      message: `${bySeat[winner].name} выиграл по раундам ${scores[winner]}:${scores[opposite(winner)]}.`,
    });
  }

  function finishRound(now = Date.now()) {
    if (phase !== 'playing') return;

    for (const seat of ['a', 'b']) {
      const runner = runners[seat];
      if (runner.completed && !runner.failed) {
        scores[seat] += 1;
        roundScores[seat] = true;
      }
    }

    phase = 'round-result';
    phaseEndsAt = now + ROUND_RESULT_MS;
    emitState(true);
  }

  function roundIsOver() {
    return ['a', 'b'].every((seat) => runners[seat].failed || runners[seat].completed);
  }

  function resolveProjectile(shot, now = Date.now()) {
    const runner = runners[shot.seat];
    if (!runner || runner.failed || runner.completed) {
      if (runner) runner.inFlight = false;
      return;
    }

    runner.inFlight = false;
    const localImpactAngle = normalizeDeg(IMPACT_WORLD_DEG[shot.seat] - wheelAngle);
    const collided = stuckKnives.some((knife) => angularDistance(knife.localAngle, localImpactAngle) < COLLISION_DEG);

    runner.eventSerial += 1;
    if (collided) {
      runner.failed = true;
      runner.lastEvent = {
        serial: runner.eventSerial,
        type: 'collision',
        at: now,
      };
      return;
    }

    knifeSerial += 1;
    stuckKnives.push({
      id: knifeSerial,
      seat: shot.seat,
      localAngle: localImpactAngle,
    });
    runner.remaining -= 1;
    runner.placed += 1;
    runner.lastEvent = {
      serial: runner.eventSerial,
      type: 'hit',
      at: now,
    };

    if (runner.remaining <= 0) {
      runner.completed = true;
      runner.lastEvent = {
        serial: runner.eventSerial,
        type: 'complete',
        at: now,
      };
    }
  }

  function throwKnife(socketId) {
    if (status !== 'playing' || phase !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    const runner = runners[seat];
    const now = Date.now();
    if (runner.failed || runner.completed || runner.inFlight || runner.remaining <= 0) return;
    if (now - runner.lastThrowAt < THROW_COOLDOWN_MS) return;
    runner.lastThrowAt = now;
    runner.inFlight = true;

    knifeSerial += 1;
    pendingThrows.push({
      id: `flight-${knifeSerial}`,
      seat,
      launchAt: now,
      impactAt: now + PROJECTILE_FLIGHT_MS,
    });
    emitState(true);
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'throw') throwKnife(socketId);
    if (action.type === 'resign') {
      const seat = seatForSocket(socketId);
      if (seat && status === 'playing') {
        finishMatch({
          type: 'resign',
          winner: opposite(seat),
          message: `${bySeat[seat].name} вышел из игры.`,
        });
      }
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch({
      type: 'disconnect',
      winner: opposite(seat),
      message: 'Соперник отключился.',
    });
  }

  function update(now) {
    if (status !== 'playing') return;
    const dt = clamp((now - lastTickAt) / 1000, 0, 0.08);
    lastTickAt = now;

    if (phase === 'round-intro') {
      if (now >= phaseEndsAt) {
        phase = 'playing';
        phaseEndsAt = 0;
        emitState(true);
      } else {
        emitState();
      }
      return;
    }

    if (phase === 'round-result') {
      if (now >= phaseEndsAt) {
        if (roundIndex + 1 >= ROUND_COUNT) {
          finishByScore();
        } else {
          beginRound(roundIndex + 1, now);
          emitState(true);
        }
      } else {
        emitState();
      }
      return;
    }

    if (phase !== 'playing') return;

    // Keep the wheel angle continuous instead of wrapping at 360°. This lets the client
    // interpolate the CSS transform without the target ever snapping backwards.
    const velocityBlend = 1 - Math.exp(-3.4 * dt);
    angularVelocity += (targetAngularVelocity - angularVelocity) * velocityBlend;
    wheelAngle += angularVelocity * dt;

    if (now >= nextVelocityChangeAt) {
      const currentDirection = Math.sign(targetAngularVelocity || angularVelocity || 1);
      const reverse = Math.random() < 0.56;
      const direction = reverse ? -currentDirection : currentDirection;
      const min = 64 + roundIndex * 10;
      const max = 138 + roundIndex * 20;
      targetAngularVelocity = direction * randomBetween(min, max);
      nextVelocityChangeAt = now + randomBetween(900, 1900);
    }

    if (pendingThrows.length) {
      const landed = pendingThrows
        .filter((shot) => now >= shot.impactAt)
        .sort((a, b) => a.impactAt - b.impactAt);
      if (landed.length) {
        const landedIds = new Set(landed.map((shot) => shot.id));
        pendingThrows = pendingThrows.filter((shot) => !landedIds.has(shot.id));
        for (const shot of landed) resolveProjectile(shot, now);
        emitState(true);
        if (roundIsOver()) {
          finishRound(now);
          return;
        }
      }
    }

    emitState();
  }

  interval = setInterval(() => update(Date.now()), TICK_MS);
  interval.unref?.();
  emitState(true);

  return {
    id: roomId,
    gameId: 'knife-wheel-duel',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
    },
  };
}
