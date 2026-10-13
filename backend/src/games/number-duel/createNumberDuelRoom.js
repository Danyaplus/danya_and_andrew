const GAME_ID = 'number-duel';
const COUNTDOWN_MS = 3000;
const PICK_MS = 15000;
const GUESS_MS = 65000;
const REVIEW_MS = 4600;
const MAX_GUESSES = 10;
const TICK_MS = 100;

function other(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function safeName(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 28) : 'Игрок';
}

function randomNumber() {
  return Math.floor(Math.random() * 100) + 1;
}

export function createNumberDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? [...players].reverse() : players;
  const seats = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };
  // Both players get one turn as the number setter and one as the guesser.
  const scores = { a: null, b: null };
  const summaries = [];
  let round = 1;
  let phase = 'countdown';
  let status = 'playing';
  let result = null;
  let phaseEndsAt = Date.now() + COUNTDOWN_MS;
  let secret = null;
  let autoPicked = false;
  let guesses = [];
  let lastEmit = 0;
  let notified = false;

  function seatOf(socketId) {
    if (seats.a.socketId === socketId) return 'a';
    if (seats.b.socketId === socketId) return 'b';
    return null;
  }

  function chooser() {
    return round === 1 ? 'a' : 'b';
  }

  function guesser() {
    return other(chooser());
  }

  function snapshot(socketId, now = Date.now()) {
    const seat = seatOf(socketId);
    const picking = chooser();
    return {
      gameId: GAME_ID,
      roomId,
      serverTime: now,
      status,
      phase,
      round,
      totalRounds: 2,
      phaseEndsAt,
      playerSeat: seat,
      opponentSeat: seat ? other(seat) : null,
      chooserSeat: picking,
      guesserSeat: guesser(),
      players: {
        a: { name: seats.a.name, attempts: scores.a },
        b: { name: seats.b.name, attempts: scores.b },
      },
      guessMax: MAX_GUESSES,
      guesses: guesses.map(({ number, hint }) => ({ number, hint })),
      secretIsSet: secret !== null,
      // Only the person setting the number can see it before the review.
      secret: phase === 'review' || phase === 'finished' || seat === picking ? secret : null,
      autoPicked,
      summaries: summaries.map((item) => ({ ...item })),
      result,
    };
  }

  function emit(force = false) {
    const now = Date.now();
    if (!force && now - lastEmit < 350) return;
    lastEmit = now;
    for (const seat of ['a', 'b']) {
      io.to(seats[seat].socketId).emit('game:state', snapshot(seats[seat].socketId, now));
    }
  }

  function finish(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    phaseEndsAt = Date.now();
    result = { winner, type, message };
    clearInterval(ticker);
    emit(true);
    if (!notified) {
      notified = true;
      onFinish?.({ roomId, players: Object.values(seats) });
    }
  }

  function startGuess(now) {
    phase = 'guess';
    phaseEndsAt = now + GUESS_MS;
    emit(true);
  }

  function beginRoundReview(now, solved) {
    if (phase !== 'guess') return;
    const seat = guesser();
    const attempts = solved ? guesses.length : MAX_GUESSES + 1;
    scores[seat] = attempts;
    summaries.push({
      round,
      chooserSeat: chooser(),
      guesserSeat: seat,
      attempts,
      solved,
      number: secret,
      autoPicked,
    });
    phase = 'review';
    phaseEndsAt = now + REVIEW_MS;
    emit(true);
  }

  function conclude() {
    const a = scores.a ?? MAX_GUESSES + 1;
    const b = scores.b ?? MAX_GUESSES + 1;
    const winner = a === b ? null : a < b ? 'a' : 'b';
    const message = winner
      ? `${seats[winner].name} угадал число за меньшее число попыток!`
      : 'Результаты равны — ничья!';
    finish(winner, winner ? 'attempts' : 'draw', message);
  }

  function advance(now) {
    if (round === 2) {
      conclude();
      return;
    }
    round = 2;
    phase = 'countdown';
    phaseEndsAt = now + COUNTDOWN_MS;
    secret = null;
    guesses = [];
    autoPicked = false;
    emit(true);
  }

  function actionPick(socketId, value) {
    if (phase !== 'pick' || seatOf(socketId) !== chooser() || secret !== null) return;
    const now = Date.now();
    if (now >= phaseEndsAt) return;
    if (!Number.isInteger(value) || value < 1 || value > 100) return;
    secret = value;
    startGuess(now);
  }

  function actionGuess(socketId, value) {
    if (phase !== 'guess' || seatOf(socketId) !== guesser()) return;
    const now = Date.now();
    if (now >= phaseEndsAt) return;
    if (!Number.isInteger(value) || value < 1 || value > 100) return;
    if (guesses.some((item) => item.number === value)) return;
    const hint = value < secret ? 'higher' : value > secret ? 'lower' : 'correct';
    guesses.push({ number: value, hint });
    if (hint === 'correct' || guesses.length >= MAX_GUESSES) beginRoundReview(now, hint === 'correct');
    else emit(true);
  }

  function handleAction(socketId, action = {}) {
    if (status !== 'playing') return;
    if (action.type === 'pick') actionPick(socketId, action.payload?.number);
    if (action.type === 'guess') actionGuess(socketId, action.payload?.number);
    if (action.type === 'resign') {
      const seat = seatOf(socketId);
      if (seat) finish(other(seat), 'resign', `${seats[seat].name} сдался.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatOf(socketId);
    if (seat) finish(other(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  function tick() {
    if (status !== 'playing') return;
    const now = Date.now();
    if (now < phaseEndsAt) {
      emit();
      return;
    }
    if (phase === 'countdown') {
      phase = 'pick';
      phaseEndsAt = now + PICK_MS;
      emit(true);
    } else if (phase === 'pick') {
      // The game must progress even if the number setter is inactive.
      if (secret === null) {
        secret = randomNumber();
        autoPicked = true;
      }
      startGuess(now);
    } else if (phase === 'guess') {
      beginRoundReview(now, false);
    } else if (phase === 'review') {
      advance(now);
    }
  }

  const ticker = setInterval(tick, TICK_MS);
  ticker.unref?.();
  emit(true);

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [seats.a.socketId, seats.b.socketId],
    emitState: () => emit(true),
    handleAction,
    handleDisconnect,
    destroy() { clearInterval(ticker); },
  };
}
