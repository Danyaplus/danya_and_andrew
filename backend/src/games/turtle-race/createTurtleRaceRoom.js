const GAME_ID = 'turtle-race';
const TICK_MS = 40;
const EMIT_EVERY_MS = 90;
const COUNTDOWN_MS = 3100;
const RACE_MS = 27000;
const BETWEEN_ROUNDS_MS = 3200;
const ROUNDS_MAX = 3;
const FINISH_DISTANCE = 100;
const BASE_SPEED = 2.9;
const GOOD_BONUS_SPEED = 6.8;
const PERFECT_BONUS_SPEED = 10.5;
const BOOST_MS = 1050;
const STUMBLE_MS = 650;
const TAP_COOLDOWN_MS = 760;
const NEEDLE_PERIOD_MS = 1600;
const GREEN_MIN = 0.34;
const GREEN_MAX = 0.66;
const PERFECT_MIN = 0.455;
const PERFECT_MAX = 0.545;

const other = (seat) => seat === 'a' ? 'b' : 'a';
const limit = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const nameOf = (value) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 28) : 'Игрок';

// Оба индикатора движутся независимо. Положение определяет серверное время.
function needlePosition(now, startedAt, seat) {
  const offset = seat === 'a' ? 0 : 365;
  const cycle = (((now - startedAt + offset) % NEEDLE_PERIOD_MS) + NEEDLE_PERIOD_MS) % NEEDLE_PERIOD_MS;
  const portion = cycle / NEEDLE_PERIOD_MS;
  return portion < 0.5 ? portion * 2 : (1 - portion) * 2;
}

function createRacer() {
  return {
    distance: 0,
    boostUntil: 0,
    stumbleUntil: 0,
    lastTapAt: -Infinity,
    lastQuality: null,
    lastQualityAt: 0,
    goodTaps: 0,
    perfectTaps: 0,
    misses: 0,
    finishAt: null,
  };
}

export function createTurtleRaceRoom({ roomId, players, io, onFinish }) {
  const seats = {
    a: { socketId: players[0].socketId, name: nameOf(players[0].name), color: 'coral' },
    b: { socketId: players[1].socketId, name: nameOf(players[1].name), color: 'cyan' },
  };

  const racers = { a: createRacer(), b: createRacer() };
  const scores = { a: 0, b: 0 };
  let status = 'playing';
  let phase = 'countdown';
  let round = 1;
  let startAt = Date.now() + COUNTDOWN_MS;
  let endAt = startAt + RACE_MS;
  let nextRoundAt = null;
  let roundWinner = null;
  let roundMessage = '';
  let result = null;
  let updatedAt = startAt;
  let lastEmitAt = 0;
  let finishedOnce = false;

  function seatOf(socketId) {
    if (seats.a.socketId === socketId) return 'a';
    if (seats.b.socketId === socketId) return 'b';
    return null;
  }

  function effectiveSpeed(racer, now) {
    if (now < racer.stumbleUntil) return BASE_SPEED * 0.35;
    if (now < racer.boostUntil) return BASE_SPEED + (racer.lastQuality === 'perfect' ? PERFECT_BONUS_SPEED : GOOD_BONUS_SPEED);
    return BASE_SPEED;
  }

  function publicRacer(racer, now) {
    return {
      distance: Number(racer.distance.toFixed(3)),
      speed: phase === 'racing' ? effectiveSpeed(racer, now) : 0,
      boostUntil: racer.boostUntil,
      stumbleUntil: racer.stumbleUntil,
      lastTapAt: Number.isFinite(racer.lastTapAt) ? racer.lastTapAt : null,
      lastQuality: racer.lastQuality,
      lastQualityAt: racer.lastQualityAt,
      goodTaps: racer.goodTaps,
      perfectTaps: racer.perfectTaps,
      misses: racer.misses,
    };
  }

  function snapshot(socketId, now = Date.now()) {
    const playerSeat = seatOf(socketId);
    return {
      gameId: GAME_ID,
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? other(playerSeat) : null,
      players: {
        a: { name: seats.a.name, color: seats.a.color },
        b: { name: seats.b.name, color: seats.b.color },
      },
      racers: { a: publicRacer(racers.a, now), b: publicRacer(racers.b, now) },
      scores: { ...scores },
      maxRounds: ROUNDS_MAX,
      round,
      status,
      phase,
      startAt,
      endAt,
      nextRoundAt,
      roundWinner,
      roundMessage,
      needlePeriodMs: NEEDLE_PERIOD_MS,
      meterOffsetMs: playerSeat === 'a' ? 0 : 365,
      greenMin: GREEN_MIN,
      greenMax: GREEN_MAX,
      perfectMin: PERFECT_MIN,
      perfectMax: PERFECT_MAX,
      tapCooldownMs: TAP_COOLDOWN_MS,
      result,
    };
  }

  function emit(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_EVERY_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(seats[seat].socketId).emit('game:state', snapshot(seats[seat].socketId, now));
    }
  }

  function finish(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = { winner, type, message };
    clearInterval(interval);
    emit(true);
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(seats) });
    }
  }

  function concludeMatch() {
    const winner = scores.a === scores.b ? null : scores.a > scores.b ? 'a' : 'b';
    const message = winner ? `${seats[winner].name} выиграл гонку черепах!` : 'После трёх заездов — ничья!';
    finish(winner, winner ? 'race' : 'draw', message);
  }

  function completeRound(winner, message, now) {
    if (phase !== 'racing') return;
    if (winner) scores[winner] += 1;
    roundWinner = winner;
    roundMessage = message;
    if (scores.a >= 2 || scores.b >= 2 || round >= ROUNDS_MAX) {
      concludeMatch();
      return;
    }
    phase = 'round-over';
    nextRoundAt = now + BETWEEN_ROUNDS_MS;
    emit(true);
  }

  function advance(now) {
    if (status !== 'playing' || phase !== 'racing') return;
    // Отсчитываем движение от общего времени начала заезда, не от подключения клиента.
    const upTo = Math.min(now, endAt);
    if (upTo <= updatedAt) return;
    const previous = updatedAt;
    const duration = upTo - previous;

    for (const seat of ['a', 'b']) {
      const racer = racers[seat];
      if (racer.finishAt !== null) continue;
      const fastEnd = Math.min(upTo, racer.boostUntil);
      const fastMs = Math.max(0, fastEnd - previous);
      const slowEnd = Math.min(upTo, racer.stumbleUntil);
      const slowMs = Math.max(0, slowEnd - previous);
      const bonus = racer.lastQuality === 'perfect' ? PERFECT_BONUS_SPEED : GOOD_BONUS_SPEED;
      const moved = (BASE_SPEED * duration + bonus * fastMs - BASE_SPEED * 0.65 * slowMs) / 1000;
      const old = racer.distance;
      racer.distance = Math.min(FINISH_DISTANCE, old + moved);
      if (racer.distance >= FINISH_DISTANCE && moved > 0) {
        racer.finishAt = previous + duration * ((FINISH_DISTANCE - old) / moved);
      }
    }
    updatedAt = upTo;
    const a = racers.a.finishAt;
    const b = racers.b.finishAt;
    if (a !== null || b !== null) {
      const winner = a !== null && b !== null ? (Math.abs(a - b) < 5 ? null : a < b ? 'a' : 'b') : a !== null ? 'a' : 'b';
      completeRound(winner, winner ? `${seats[winner].name} первым добрался до финиша!` : 'Фотофиниш — ничья!', now);
    } else if (now >= endAt) {
      const difference = racers.a.distance - racers.b.distance;
      const winner = Math.abs(difference) < 0.15 ? null : difference > 0 ? 'a' : 'b';
      completeRound(winner, winner ? `${seats[winner].name} оказался ближе к финишу!` : 'Черепахи пришли к одному результату!', now);
    }
  }

  function tap(socketId) {
    if (status !== 'playing' || phase !== 'racing') return;
    const seat = seatOf(socketId);
    if (!seat) return;
    const racer = racers[seat];
    const now = Date.now();
    advance(now);
    if (phase !== 'racing' || now - racer.lastTapAt < TAP_COOLDOWN_MS) return;

    racer.lastTapAt = now;
    const position = needlePosition(now, startAt, seat);
    let quality = 'miss';
    if (position >= PERFECT_MIN && position <= PERFECT_MAX) quality = 'perfect';
    else if (position >= GREEN_MIN && position <= GREEN_MAX) quality = 'good';

    racer.lastQuality = quality;
    racer.lastQualityAt = now;
    if (quality === 'miss') {
      racer.misses += 1;
      racer.boostUntil = 0;
      racer.stumbleUntil = now + STUMBLE_MS;
    } else {
      racer.goodTaps += 1;
      if (quality === 'perfect') racer.perfectTaps += 1;
      racer.stumbleUntil = 0;
      racer.boostUntil = now + BOOST_MS;
    }
    emit(true);
  }

  function update() {
    const now = Date.now();
    if (status !== 'playing') return;
    if (phase === 'countdown' && now >= startAt) {
      phase = 'racing';
      updatedAt = startAt;
      emit(true);
    }
    if (phase === 'racing') {
      advance(now);
      if (phase === 'racing') emit();
    } else if (phase === 'round-over' && now >= nextRoundAt) {
      round += 1;
      roundWinner = null;
      roundMessage = '';
      nextRoundAt = null;
      racers.a = createRacer();
      racers.b = createRacer();
      phase = 'countdown';
      startAt = now + COUNTDOWN_MS;
      endAt = startAt + RACE_MS;
      updatedAt = startAt;
      emit(true);
    }
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'tap') tap(socketId);
    if (action.type === 'resign' && status === 'playing') {
      const seat = seatOf(socketId);
      if (seat) finish(other(seat), 'resign', `${seats[seat].name} сдался.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatOf(socketId);
    if (seat) finish(other(seat), 'disconnect', 'Соперник отключился от гонки.');
  }

  const interval = setInterval(update, TICK_MS);
  interval.unref?.();

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [seats.a.socketId, seats.b.socketId],
    emitState: () => emit(true),
    handleAction,
    handleDisconnect,
    destroy() { clearInterval(interval); },
  };
}
