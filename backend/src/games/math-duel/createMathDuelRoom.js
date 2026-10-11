// The server owns question generation, the correct answers, timing and scoring.
// Clients receive no answer key until the question has closed.
const GAME_ID = 'math-duel';
const ROUNDS = 10;
const COUNTDOWN_MS = 3000;
const REVEAL_MS = 2400;
const INCORRECT_COOLDOWN_MS = 1250;
const SEATS = ['a', 'b'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildQuestion(round) {
  let text;
  let correct;
  let difficulty;

  if (round <= 3) {
    difficulty = 'РАЗМИНКА';
    if (randomInt(0, 1) === 0) {
      const a = randomInt(4, 19);
      const b = randomInt(2, 19);
      text = `${a} + ${b}`;
      correct = a + b;
    } else {
      const a = randomInt(10, 34);
      const b = randomInt(2, a - 1);
      text = `${a} − ${b}`;
      correct = a - b;
    }
  } else if (round <= 6) {
    difficulty = 'УСКОРЯЕМСЯ';
    const type = randomInt(0, 2);
    if (type === 0) {
      const a = randomInt(18, 49);
      const b = randomInt(9, 45);
      text = `${a} + ${b}`;
      correct = a + b;
    } else if (type === 1) {
      const a = randomInt(31, 90);
      const b = randomInt(9, a - 1);
      text = `${a} − ${b}`;
      correct = a - b;
    } else {
      const a = randomInt(3, 9);
      const b = randomInt(3, 9);
      text = `${a} × ${b}`;
      correct = a * b;
    }
  } else if (round <= 8) {
    difficulty = 'СЛОЖНЕЕ';
    if (randomInt(0, 1) === 0) {
      const a = randomInt(4, 12);
      const b = randomInt(4, 12);
      text = `${a} × ${b}`;
      correct = a * b;
    } else {
      const divisor = randomInt(3, 12);
      const quotient = randomInt(3, 12);
      text = `${divisor * quotient} ÷ ${divisor}`;
      correct = quotient;
    }
  } else {
    difficulty = 'ФИНАЛ';
    if (randomInt(0, 1) === 0) {
      const a = randomInt(4, 11);
      const b = randomInt(3, 9);
      const c = randomInt(4, 27);
      text = `${a} × ${b} + ${c}`;
      correct = a * b + c;
    } else {
      const a = randomInt(6, 18);
      const b = randomInt(4, 12);
      const c = randomInt(2, 6);
      text = `(${a} + ${b}) × ${c}`;
      correct = (a + b) * c;
    }
  }

  // Distinct believable alternatives: never duplicate the correct answer.
  const candidates = new Set([correct]);
  const shifts = shuffle([-16, -12, -9, -7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7, 9, 12, 16]);
  for (const shift of shifts) {
    if (candidates.size >= 4) break;
    const option = correct + shift;
    if (option >= 0 && option !== correct) candidates.add(option);
  }
  // Kept as a guard if the range above changes in the future.
  while (candidates.size < 4) candidates.add(correct + candidates.size + 1);
  const options = shuffle([...candidates]);

  return { text, options, correctIndex: options.indexOf(correct), difficulty };
}

function safeName(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 28)
    : 'Игрок';
}

function other(seat) { return seat === 'a' ? 'b' : 'a'; }

export function createMathDuelRoom({ roomId, players, io, onFinish }) {
  const assigned = Math.random() < 0.5 ? [...players].reverse() : players;
  const bySeat = {
    a: { socketId: assigned[0].socketId, name: safeName(assigned[0].name), score: 0, wrong: 0 },
    b: { socketId: assigned[1].socketId, name: safeName(assigned[1].name), score: 0, wrong: 0 },
  };
  // Avoid an accidental duplicate problem during the same match.
  const seenQuestions = new Set();
  const questionSet = Array.from({ length: ROUNDS }, (_, index) => {
    let question;
    do { question = buildQuestion(index + 1); } while (seenQuestions.has(question.text));
    seenQuestions.add(question.text);
    return question;
  });
  let status = 'playing';
  let phase = 'countdown';
  let round = 1;
  let phaseEndsAt = Date.now() + COUNTDOWN_MS;
  let roundStartAt = null;
  let questionEndsAt = null;
  let reveal = null;
  let result = null;
  let serial = 0;
  let interval = null;
  let finishedOnce = false;
  const locks = { a: 0, b: 0 };
  const selections = { a: null, b: null };

  function seatFor(socketId) {
    return SEATS.find((seat) => bySeat[seat].socketId === socketId) ?? null;
  }

  function secondsForRound(number) {
    return Math.max(9000, 15000 - (number - 1) * 650);
  }

  function snapshot(socketId) {
    const now = Date.now();
    const seat = seatFor(socketId);
    const current = questionSet[round - 1];
    const visible = phase === 'question' || phase === 'reveal' || status === 'finished';
    return {
      gameId: GAME_ID,
      roomId,
      serverTime: now,
      playerSeat: seat,
      opponentSeat: seat ? other(seat) : null,
      players: {
        a: { name: bySeat.a.name, score: bySeat.a.score, wrong: bySeat.a.wrong },
        b: { name: bySeat.b.name, score: bySeat.b.score, wrong: bySeat.b.wrong },
      },
      status,
      phase,
      round,
      roundCount: ROUNDS,
      phaseEndsAt,
      roundStartAt,
      questionEndsAt,
      question: visible ? { text: current.text, options: current.options, difficulty: current.difficulty } : null,
      mySelection: seat ? selections[seat] : null,
      myLockedUntil: seat ? locks[seat] : 0,
      // The real answer exists exclusively on the server until the reveal.
      correctIndex: phase === 'reveal' || status === 'finished' ? current.correctIndex : null,
      reveal,
      result,
      eventSerial: serial,
    };
  }

  function emitState() {
    for (const seat of SEATS) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshot(bySeat[seat].socketId));
    }
  }

  function finalResult() {
    if (bySeat.a.score === bySeat.b.score) {
      return { winner: null, type: 'draw', message: `Ничья ${bySeat.a.score}:${bySeat.b.score}!` };
    }
    const winner = bySeat.a.score > bySeat.b.score ? 'a' : 'b';
    return { winner, type: 'score', message: `${bySeat[winner].name} победил со счётом ${bySeat.a.score}:${bySeat.b.score}!` };
  }

  function finish(override = null) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    phaseEndsAt = null;
    result = override || finalResult();
    if (interval) clearInterval(interval);
    interval = null;
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function beginQuestion(now) {
    if (status !== 'playing') return;
    phase = 'question';
    roundStartAt = now;
    questionEndsAt = now + secondsForRound(round);
    phaseEndsAt = questionEndsAt;
    selections.a = null;
    selections.b = null;
    locks.a = 0;
    locks.b = 0;
    reveal = null;
    serial += 1;
    emitState();
  }

  function endQuestion(now, winningSeat = null) {
    if (phase !== 'question' || status !== 'playing') return;
    if (winningSeat) bySeat[winningSeat].score += 1;
    phase = 'reveal';
    phaseEndsAt = now + REVEAL_MS;
    const q = questionSet[round - 1];
    reveal = {
      winner: winningSeat,
      correctValue: q.options[q.correctIndex],
      message: winningSeat ? `${bySeat[winningSeat].name} отвечает первым! +1` : 'Время вышло. Очко не получает никто.',
    };
    serial += 1;
    emitState();
  }

  function handleAction(socketId, action = {}) {
    const seat = seatFor(socketId);
    if (!seat || status !== 'playing' || !action || typeof action !== 'object') return;
    if (action.type === 'resign') {
      finish({ winner: other(seat), type: 'resign', message: `${bySeat[seat].name} покинул матч.` });
      return;
    }
    if (action.type !== 'answer' || phase !== 'question') return;
    const now = Date.now();
    // Guard timing even before the next periodic tick processes an expired round.
    if (now >= questionEndsAt) {
      endQuestion(now);
      return;
    }
    if (now < locks[seat]) return;
    const optionIndex = action?.optionIndex;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return;
    selections[seat] = optionIndex;
    const question = questionSet[round - 1];
    if (optionIndex === question.correctIndex) {
      endQuestion(now, seat);
      return;
    }
    bySeat[seat].wrong += 1;
    locks[seat] = now + INCORRECT_COOLDOWN_MS;
    serial += 1;
    emitState();
  }

  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat && status === 'playing') {
      finish({ winner: other(seat), type: 'disconnect', message: 'Соперник покинул матч.' });
    }
  }

  function tick() {
    if (status !== 'playing' || Date.now() < phaseEndsAt) return;
    const now = Date.now();
    if (phase === 'countdown') beginQuestion(now);
    else if (phase === 'question') endQuestion(now);
    else if (phase === 'reveal') {
      if (round === ROUNDS) finish();
      else {
        round += 1;
        beginQuestion(now);
      }
    }
  }

  interval = setInterval(tick, 55);
  interval.unref?.();
  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
      interval = null;
    },
  };
}
