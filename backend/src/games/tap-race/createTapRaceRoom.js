const TICK_MS = 25;
const EMIT_EVERY_MS = 50;
const TRACK_LENGTH = 1600;
const TAP_BOOST = 42;
const MAX_SPEED = 680;
const DRAG_PER_SECOND = 1.15;
const MIN_TAP_INTERVAL_MS = 18;
const WINS_TO_MATCH = 2;
const COUNTDOWN_MS = 2400;
const ROUND_RESET_MS = 1900;

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

function makeCar(seat) {
  return {
    seat,
    distance: 0,
    speed: 0,
    lastTapAt: 0,
    tapFlashUntil: 0,
  };
}

function publicCar(car, now = Date.now()) {
  return {
    seat: car.seat,
    distance: Math.round(car.distance * 10) / 10,
    progress: clamp(car.distance / TRACK_LENGTH, 0, 1),
    speed: Math.round(car.speed * 10) / 10,
    speedRatio: clamp(car.speed / MAX_SPEED, 0, 1),
    tapping: now < car.tapFlashUntil,
  };
}

export function createTapRaceRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name), color: 'red' },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name), color: 'blue' },
  };

  let cars = { a: makeCar('a'), b: makeCar('b') };
  let scores = { a: 0, b: 0 };
  let round = 1;
  let status = 'playing';
  let phase = 'countdown';
  let result = null;
  let roundWinner = null;
  let roundMessage = '';
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let interval = null;
  let resetTimer = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function countdownLeftMs(now = Date.now()) {
    if (phase !== 'countdown') return 0;
    return Math.max(0, countdownEndsAt - now);
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'tap-race',
      roomId,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      cars: {
        a: publicCar(cars.a, now),
        b: publicCar(cars.b, now),
      },
      scores,
      round,
      winsToMatch: WINS_TO_MATCH,
      trackLength: TRACK_LENGTH,
      maxSpeed: MAX_SPEED,
      countdownLeftMs: countdownLeftMs(now),
      phase,
      status,
      roundWinner,
      roundMessage,
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
    cars.a.speed = 0;
    cars.b.speed = 0;
    result = { winner, type, message };
    if (resetTimer) clearTimeout(resetTimer);
    if (interval) clearInterval(interval);
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resetRound() {
    if (status !== 'playing') return;
    cars = { a: makeCar('a'), b: makeCar('b') };
    phase = 'countdown';
    roundWinner = null;
    roundMessage = '';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    lastTickAt = Date.now();
    emitState(true);
  }

  function endRound(winner) {
    if (status !== 'playing' || phase !== 'racing') return;
    phase = 'round-over';
    roundWinner = winner;
    cars.a.speed = 0;
    cars.b.speed = 0;

    if (winner) {
      scores = { ...scores, [winner]: scores[winner] + 1 };
      roundMessage = `${bySeat[winner].name} первым пересёк финиш.`;

      if (scores[winner] >= WINS_TO_MATCH) {
        emitState(true);
        finishMatch(winner, 'race-win', 'Первым выиграны два заезда.');
        return;
      }
    } else {
      roundMessage = 'Финиш одновременно — очко никому.';
    }

    emitState(true);
    round += 1;
    resetTimer = setTimeout(resetRound, ROUND_RESET_MS);
    resetTimer.unref?.();
  }

  function handleTap(socketId) {
    if (status !== 'playing' || phase !== 'racing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    const now = Date.now();
    const car = cars[seat];
    if (now - car.lastTapAt < MIN_TAP_INTERVAL_MS) return;

    car.lastTapAt = now;
    car.tapFlashUntil = now + 110;
    car.speed = Math.min(MAX_SPEED, car.speed + TAP_BOOST);
    emitState(true);
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'tap') handleTap(socketId);
    if (action.type === 'resign') {
      const seat = seatForSocket(socketId);
      if (seat && status === 'playing') {
        finishMatch(opposite(seat), 'resign', `${bySeat[seat].name} вышел из гонки.`);
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

    const rawDt = Math.max(0, (now - lastTickAt) / 1000);
    const dt = Math.min(rawDt, 0.08);
    lastTickAt = now;

    if (phase === 'countdown') {
      if (now >= countdownEndsAt) {
        phase = 'racing';
        cars.a.lastTapAt = 0;
        cars.b.lastTapAt = 0;
        emitState(true);
      } else {
        emitState();
      }
      return;
    }

    if (phase !== 'racing') {
      emitState();
      return;
    }

    for (const seat of ['a', 'b']) {
      const car = cars[seat];
      car.distance += car.speed * dt;
      car.distance = Math.min(TRACK_LENGTH, car.distance);
      car.speed *= Math.exp(-DRAG_PER_SECOND * dt);
      if (car.speed < 0.4) car.speed = 0;
    }

    const aFinished = cars.a.distance >= TRACK_LENGTH;
    const bFinished = cars.b.distance >= TRACK_LENGTH;

    if (aFinished || bFinished) {
      if (aFinished && bFinished) {
        const diff = Math.abs(cars.a.distance - cars.b.distance);
        endRound(diff < 0.01 ? null : (cars.a.distance > cars.b.distance ? 'a' : 'b'));
      } else {
        endRound(aFinished ? 'a' : 'b');
      }
      return;
    }

    emitState();
  }

  interval = setInterval(() => update(Date.now()), TICK_MS);
  interval.unref?.();

  emitState(true);

  return {
    id: roomId,
    gameId: 'tap-race',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
      if (resetTimer) clearTimeout(resetTimer);
    },
  };
}
