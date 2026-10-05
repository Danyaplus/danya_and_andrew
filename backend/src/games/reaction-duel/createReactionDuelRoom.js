const TICK_MS = 12;
const EMIT_EVERY_MS = 45;
const LIGHT_COUNT = 5;
const FIRST_LIGHT_DELAY_MS = 280;
const LIGHT_INTERVAL_MS = 430;
const MIN_RANDOM_DELAY_MS = 100;
const MAX_RANDOM_DELAY_MS = 3000;
const RELEASE_TIMEOUT_MS = 7000;
const DRAW_WINDOW_MS = 1;

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makePlayer(seat) {
  return {
    seat,
    holding: false,
    released: false,
    reactionMs: null,
    releaseAt: null,
    timedOut: false,
    falseStart: false,
  };
}

export function createReactionDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: 'red' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: 'blue' },
  };

  const racers = { a: makePlayer('a'), b: makePlayer('b') };

  let status = 'playing';
  let phase = 'ready'; // ready -> lights -> go -> finished
  let result = null;
  let sequenceStartedAt = null;
  let firstLightAt = null;
  let allLightsAt = null;
  let goAt = null;
  let deadlineAt = null;
  let lastEmitAt = 0;
  let interval = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function lightsLitAt(now) {
    if (phase === 'ready') return 0;
    if (phase === 'go' || phase === 'finished') return 0;
    if (!firstLightAt || now < firstLightAt) return 0;
    return Math.min(LIGHT_COUNT, 1 + Math.floor((now - firstLightAt) / LIGHT_INTERVAL_MS));
  }

  function publicRacer(racer) {
    return {
      holding: racer.holding,
      released: racer.released,
      reactionMs: racer.reactionMs,
      timedOut: racer.timedOut,
      falseStart: racer.falseStart,
    };
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'reaction-duel',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      racers: {
        a: publicRacer(racers.a),
        b: publicRacer(racers.b),
      },
      phase,
      status,
      lightsLit: lightsLitAt(now),
      lightCount: LIGHT_COUNT,
      releaseTimeoutMs: RELEASE_TIMEOUT_MS,
      // Не раскрываем момент старта заранее. goAt появляется у клиента только после погасания ламп.
      goAt: phase === 'go' || phase === 'finished' ? goAt : null,
      deadlineAt: phase === 'go' || phase === 'finished' ? deadlineAt : null,
      result,
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

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = { winner, type, message };
    racers.a.holding = false;
    racers.b.holding = false;

    if (interval) clearInterval(interval);
    interval = null;
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishByReactions() {
    const a = racers.a;
    const b = racers.b;

    if (a.timedOut && b.timedOut) {
      finishMatch(null, 'double-timeout', 'Оба не отпустили кнопку за 7 секунд — ничья.');
      return;
    }
    if (a.timedOut) {
      finishMatch('b', 'timeout', `${bySeat.a.name} не отпустил кнопку за 7 секунд.`);
      return;
    }
    if (b.timedOut) {
      finishMatch('a', 'timeout', `${bySeat.b.name} не отпустил кнопку за 7 секунд.`);
      return;
    }

    if (a.reactionMs == null || b.reactionMs == null) return;
    const diff = Math.abs(a.reactionMs - b.reactionMs);
    if (diff <= DRAW_WINDOW_MS) {
      finishMatch(null, 'reaction-draw', `Одинаковая реакция: ${a.reactionMs} мс.`);
      return;
    }

    const winner = a.reactionMs < b.reactionMs ? 'a' : 'b';
    finishMatch(
      winner,
      'reaction',
      `${bySeat[winner].name} отпустил кнопку быстрее.`
    );
  }

  function startSequence(now) {
    if (phase !== 'ready' || !racers.a.holding || !racers.b.holding) return;
    phase = 'lights';
    sequenceStartedAt = now;
    firstLightAt = now + FIRST_LIGHT_DELAY_MS;
    allLightsAt = firstLightAt + LIGHT_INTERVAL_MS * (LIGHT_COUNT - 1);
    goAt = allLightsAt + randomInt(MIN_RANDOM_DELAY_MS, MAX_RANDOM_DELAY_MS);
    deadlineAt = goAt + RELEASE_TIMEOUT_MS;
    emitState(true);
  }

  function handleHoldStart(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    const racer = racers[seat];

    if (phase === 'ready') {
      racer.holding = true;
      emitState(true);
      startSequence(Date.now());
    }
  }

  function handleHoldEnd(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    const racer = racers[seat];
    const now = Date.now();

    if (phase === 'ready') {
      racer.holding = false;
      emitState(true);
      return;
    }

    if (racer.released || racer.timedOut || racer.falseStart) return;

    if (phase === 'lights') {
      racer.holding = false;
      racer.falseStart = true;
      finishMatch(opposite(seat), 'false-start', `${bySeat[seat].name} отпустил кнопку до сигнала.`);
      return;
    }

    if (phase === 'go') {
      racer.holding = false;
      racer.released = true;
      racer.releaseAt = now;
      racer.reactionMs = Math.max(0, now - goAt);
      emitState(true);
      finishByReactions();
    }
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'hold-start') handleHoldStart(socketId);
    if (action.type === 'hold-end') handleHoldEnd(socketId);
    if (action.type === 'resign') {
      const seat = seatForSocket(socketId);
      if (seat && status === 'playing') {
        finishMatch(opposite(seat), 'resign', `${bySeat[seat].name} вышел из игры.`);
      }
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  function update(now) {
    if (status !== 'playing') return;

    if (phase === 'lights') {
      if (goAt && now >= goAt) {
        phase = 'go';
        emitState(true);
        return;
      }
      emitState();
      return;
    }

    if (phase === 'go') {
      if (deadlineAt && now >= deadlineAt) {
        for (const seat of ['a', 'b']) {
          const racer = racers[seat];
          if (!racer.released) {
            racer.holding = false;
            racer.timedOut = true;
          }
        }
        emitState(true);
        finishByReactions();
        return;
      }
      emitState();
    }
  }

  interval = setInterval(() => update(Date.now()), TICK_MS);
  interval.unref?.();
  emitState(true);

  return {
    id: roomId,
    gameId: 'reaction-duel',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
    },
  };
}
