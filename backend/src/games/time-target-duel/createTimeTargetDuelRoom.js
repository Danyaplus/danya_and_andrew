const TICK_MS = 20;
const EMIT_EVERY_MS = 80;
const PREVIEW_MS = 2600;
const VISIBLE_TIMER_MS = 3000;
const MIN_TARGET_MS = 5000;
const MAX_TARGET_MS = 20000;
const HARD_TIMEOUT_AFTER_TARGET_MS = 10000;
const DRAW_EPSILON_MS = 5;

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function makePlayer(seat) {
  return {
    seat,
    stopped: false,
    stopAt: null,
    elapsedMs: null,
    differenceMs: null,
    timedOut: false,
  };
}

function randomTargetMs() {
  // Сотые доли секунды, например 12.50.
  const hundredths = Math.floor(Math.random() * ((MAX_TARGET_MS - MIN_TARGET_MS) / 10 + 1));
  return MIN_TARGET_MS + hundredths * 10;
}

export function createTimeTargetDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: 'red' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: 'blue' },
  };

  const targetMs = randomTargetMs();
  const timers = { a: makePlayer('a'), b: makePlayer('b') };

  let status = 'playing';
  let phase = 'preview'; // preview -> running -> finished
  let result = null;
  let startAt = Date.now() + PREVIEW_MS;
  let hiddenAt = startAt + VISIBLE_TIMER_MS;
  let hardDeadlineAt = startAt + targetMs + HARD_TIMEOUT_AFTER_TARGET_MS;
  let lastEmitAt = 0;
  let interval = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function publicTimer(timer) {
    return {
      stopped: timer.stopped,
      elapsedMs: timer.elapsedMs,
      differenceMs: timer.differenceMs,
      timedOut: timer.timedOut,
    };
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'time-target-duel',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      timers: {
        a: publicTimer(timers.a),
        b: publicTimer(timers.b),
      },
      targetMs,
      startAt,
      hiddenAt,
      visibleTimerMs: VISIBLE_TIMER_MS,
      phase,
      status,
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

    if (interval) clearInterval(interval);
    interval = null;
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishByTimes() {
    const a = timers.a;
    const b = timers.b;
    if (!a.stopped || !b.stopped) return;

    if (a.timedOut && b.timedOut) {
      finishMatch(null, 'double-timeout', 'Оба слишком долго не нажимали — ничья.');
      return;
    }
    if (a.timedOut) {
      finishMatch('b', 'timeout', `${bySeat.a.name} не остановил таймер вовремя.`);
      return;
    }
    if (b.timedOut) {
      finishMatch('a', 'timeout', `${bySeat.b.name} не остановил таймер вовремя.`);
      return;
    }

    const diff = Math.abs(a.differenceMs - b.differenceMs);
    if (diff <= DRAW_EPSILON_MS) {
      finishMatch(null, 'draw', 'Оба оказались одинаково близко к цели.');
      return;
    }

    const winner = a.differenceMs < b.differenceMs ? 'a' : 'b';
    finishMatch(winner, 'closest', `${bySeat[winner].name} остановил таймер ближе к заданному времени.`);
  }

  function stopTimer(socketId) {
    if (status !== 'playing' || phase !== 'running') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    const timer = timers[seat];
    if (timer.stopped) return;

    const now = Date.now();
    timer.stopped = true;
    timer.stopAt = now;
    timer.elapsedMs = Math.max(0, now - startAt);
    timer.differenceMs = Math.abs(timer.elapsedMs - targetMs);
    emitState(true);
    finishByTimes();
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'stop') stopTimer(socketId);
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

    if (phase === 'preview' && now >= startAt) {
      phase = 'running';
      emitState(true);
      return;
    }

    if (phase === 'running') {
      if (now >= hardDeadlineAt) {
        for (const seat of ['a', 'b']) {
          const timer = timers[seat];
          if (!timer.stopped) {
            timer.stopped = true;
            timer.timedOut = true;
            timer.stopAt = hardDeadlineAt;
            timer.elapsedMs = hardDeadlineAt - startAt;
            timer.differenceMs = Math.abs(timer.elapsedMs - targetMs);
          }
        }
        emitState(true);
        finishByTimes();
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
    gameId: 'time-target-duel',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
    },
  };
}
