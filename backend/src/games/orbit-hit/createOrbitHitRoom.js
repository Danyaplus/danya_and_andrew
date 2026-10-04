const MATCH_MS = 60_000;
const COUNTDOWN_MS = 2_400;
const ROTATION_SPEED_DEG_PER_SEC = 120;
const TARGET_MIN_DEG = 26;
const TARGET_MAX_DEG = 160;
const HIT_TOLERANCE_DEG = 7;
const INPUT_COOLDOWN_MS = 85;
const MAX_STREAK = 5;

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

function circularDistanceDeg(a, b) {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(diff, 360 - diff);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function makeTarget() {
  return {
    centerDeg: randomBetween(0, 360),
    arcDeg: randomBetween(TARGET_MIN_DEG, TARGET_MAX_DEG),
  };
}

function makeRunner(seat) {
  return {
    seat,
    score: 0,
    streak: 0,
    target: makeTarget(),
    phaseDeg: randomBetween(0, 360),
    lastTapAt: 0,
    eventSerial: 0,
    lastEvent: null,
  };
}

export function createOrbitHitRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: 'pink' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: 'blue' },
  };

  const runners = {
    a: makeRunner('a'),
    b: makeRunner('b'),
  };

  const createdAt = Date.now();
  const startsAt = createdAt + COUNTDOWN_MS;
  const endsAt = startsAt + MATCH_MS;
  let status = 'playing';
  let phase = 'countdown';
  let result = null;
  let finishedOnce = false;
  let startTimer = null;
  let finishTimer = null;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function runnerAngle(runner, now = Date.now()) {
    const elapsedMs = Math.max(0, now - startsAt);
    return normalizeDeg(runner.phaseDeg + elapsedMs * ROTATION_SPEED_DEG_PER_SEC / 1000);
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'orbit-hit',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      runners: {
        a: {
          score: runners.a.score,
          streak: runners.a.streak,
          target: { ...runners.a.target },
          phaseDeg: runners.a.phaseDeg,
          lastEvent: runners.a.lastEvent ? { ...runners.a.lastEvent } : null,
        },
        b: {
          score: runners.b.score,
          streak: runners.b.streak,
          target: { ...runners.b.target },
          phaseDeg: runners.b.phaseDeg,
          lastEvent: runners.b.lastEvent ? { ...runners.b.lastEvent } : null,
        },
      },
      rotationSpeedDegPerSec: ROTATION_SPEED_DEG_PER_SEC,
      startsAt,
      endsAt,
      matchMs: MATCH_MS,
      phase,
      status,
      result,
    };
  }

  function emitState() {
    const now = Date.now();
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId, now));
    }
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = nextResult;
    if (startTimer) clearTimeout(startTimer);
    if (finishTimer) clearTimeout(finishTimer);
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishByScore() {
    if (status !== 'playing') return;
    const scoreA = runners.a.score;
    const scoreB = runners.b.score;

    if (scoreA === scoreB) {
      finish({
        type: 'draw',
        winner: null,
        message: `Ничья — ${scoreA}:${scoreB}.`,
      });
      return;
    }

    const winner = scoreA > scoreB ? 'a' : 'b';
    finish({
      type: 'score',
      winner,
      message: `${bySeat[winner].name} набрал больше очков за минуту.`,
    });
  }

  function tap(socketId) {
    if (status !== 'playing' || phase !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    const runner = runners[seat];
    const now = Date.now();
    if (now >= endsAt) {
      finishByScore();
      return;
    }
    if (now - runner.lastTapAt < INPUT_COOLDOWN_MS) return;
    runner.lastTapAt = now;

    const angle = runnerAngle(runner, now);
    const distance = circularDistanceDeg(angle, runner.target.centerDeg);
    const hit = distance <= runner.target.arcDeg / 2 + HIT_TOLERANCE_DEG;
    runner.eventSerial += 1;

    if (hit) {
      runner.streak = clamp(runner.streak + 1, 1, MAX_STREAK);
      const gained = runner.streak;
      runner.score += gained;
      runner.target = makeTarget();
      runner.lastEvent = {
        serial: runner.eventSerial,
        type: 'hit',
        gained,
        streak: runner.streak,
        at: now,
      };
    } else {
      runner.streak = 0;
      runner.lastEvent = {
        serial: runner.eventSerial,
        type: 'miss',
        gained: 0,
        streak: 0,
        at: now,
      };
    }

    emitState();
  }

  function resign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({
      type: 'resign',
      winner: opposite(seat),
      message: `${bySeat[seat].name} вышел из игры.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'tap') tap(socketId);
    if (action.type === 'resign') resign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({
      type: 'disconnect',
      winner: opposite(seat),
      message: 'Соперник отключился.',
    });
  }

  startTimer = setTimeout(() => {
    if (status !== 'playing') return;
    phase = 'playing';
    emitState();
  }, COUNTDOWN_MS);
  startTimer.unref?.();

  finishTimer = setTimeout(finishByScore, COUNTDOWN_MS + MATCH_MS + 40);
  finishTimer.unref?.();

  return {
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      if (startTimer) clearTimeout(startTimer);
      if (finishTimer) clearTimeout(finishTimer);
    },
  };
}
