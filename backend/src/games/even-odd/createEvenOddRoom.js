const GAME_ID = 'even-odd';
const CHOOSE_MS = 18000;
const INTRO_MS = 1600;
const SHOW_MS = 3200;
const POINTS_TO_WIN = 3;

function other(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function safeName(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 28) || 'Игрок' : 'Игрок';
}

function randomFingers() {
  return Math.floor(Math.random() * 5) + 1;
}

export function createEvenOddRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? [...players].reverse() : players;
  const seats = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };
  // Seats are randomized, and roles swap each round for variety.
  const firstEven = Math.random() < 0.5 ? 'a' : 'b';
  const scores = { a: 0, b: 0 };
  let round = 1;
  let choices = { a: null, b: null };
  let automatic = { a: false, b: false };
  let phase = 'intro';
  let status = 'playing';
  let phaseEndAt = Date.now() + INTRO_MS;
  let lastRound = null;
  let result = null;
  let timer = null;
  let finished = false;
  let destroyed = false;

  function parityFor(seat) {
    const evenSeat = round % 2 === 1 ? firstEven : other(firstEven);
    return seat === evenSeat ? 'even' : 'odd';
  }

  function seatFor(socketId) {
    if (socketId === seats.a.socketId) return 'a';
    if (socketId === seats.b.socketId) return 'b';
    return null;
  }

  function snapshot(seat) {
    const opponent = other(seat);
    return {
      gameId: GAME_ID,
      roomId,
      status,
      phase,
      phaseEndAt,
      serverTime: Date.now(),
      round,
      targetPoints: POINTS_TO_WIN,
      playerSeat: seat,
      opponentSeat: opponent,
      players: { a: { name: seats.a.name }, b: { name: seats.b.name } },
      roles: { a: parityFor('a'), b: parityFor('b') },
      scores: { ...scores },
      ready: { a: choices.a !== null, b: choices.b !== null },
      myChoice: choices[seat],
      // The opponent's number stays secret until BOTH have chosen.
      lastRound: lastRound ? { ...lastRound, automatic: { ...lastRound.automatic } } : null,
      result,
    };
  }

  function emitState() {
    if (destroyed) return;
    for (const seat of ['a', 'b']) {
      io.to(seats[seat].socketId).emit('game:state', snapshot(seat));
    }
  }

  function schedule(fn, ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!destroyed && status === 'playing') fn();
    }, ms);
    timer.unref?.();
  }

  function finish(winner, reason, message) {
    if (destroyed || status !== 'playing') return;
    if (timer) clearTimeout(timer);
    timer = null;
    status = 'finished';
    phase = 'finished';
    phaseEndAt = null;
    result = { winner, reason, message };
    emitState();
    if (!finished) {
      finished = true;
      onFinish?.({ roomId, players: Object.values(seats) });
    }
  }

  function beginRound() {
    if (status !== 'playing') return;
    choices = { a: null, b: null };
    automatic = { a: false, b: false };
    phase = 'choosing';
    phaseEndAt = Date.now() + CHOOSE_MS;
    emitState();
    schedule(() => {
      for (const seat of ['a', 'b']) {
        if (choices[seat] === null) {
          choices[seat] = randomFingers();
          automatic[seat] = true;
        }
      }
      reveal();
    }, CHOOSE_MS);
  }

  function reveal() {
    if (status !== 'playing' || phase !== 'choosing' || choices.a === null || choices.b === null) return;
    const sum = choices.a + choices.b;
    const parity = sum % 2 === 0 ? 'even' : 'odd';
    const winner = parityFor('a') === parity ? 'a' : 'b';
    scores[winner] += 1;
    lastRound = {
      round,
      a: choices.a,
      b: choices.b,
      sum,
      parity,
      winner,
      automatic: { ...automatic },
    };
    phase = 'reveal';
    phaseEndAt = Date.now() + SHOW_MS;
    emitState();
    schedule(() => {
      if (scores[winner] >= POINTS_TO_WIN) {
        finish(winner, 'score', `${seats[winner].name} победил со счётом ${scores.a}:${scores.b}!`);
      } else {
        round += 1;
        beginRound();
      }
    }, SHOW_MS);
  }

  function handleAction(socketId, action = {}) {
    const seat = seatFor(socketId);
    if (!seat || status !== 'playing') return;
    if (action.type === 'resign') {
      finish(other(seat), 'resign', `${seats[seat].name} вышел из матча.`);
      return;
    }
    if (action.type !== 'choose' || phase !== 'choosing') return;
    // A late packet from the previous round must never register in a new one.
    if (action.payload?.round !== round || choices[seat] !== null || Date.now() >= phaseEndAt) return;
    const fingers = action.payload?.fingers;
    if (!Number.isInteger(fingers) || fingers < 1 || fingers > 5) return;
    choices[seat] = fingers;
    emitState();
    if (choices.a !== null && choices.b !== null) reveal();
  }

  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat) finish(other(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  schedule(beginRound, INTRO_MS);

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [seats.a.socketId, seats.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      destroyed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
