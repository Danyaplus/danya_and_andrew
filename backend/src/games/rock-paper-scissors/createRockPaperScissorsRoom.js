const GAME_ID = 'rock-paper-scissors';
const MOVES = ['rock', 'scissors', 'paper'];
const WINNING_MOVE = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const COUNTDOWN_MS = 2800;
const PICK_MS = 22000;
const REVEAL_MS = 3100;
const TARGET_WINS = 5;

function safeName(name) {
  if (typeof name !== 'string') return 'Игрок';
  return name.trim().replace(/\s+/g, ' ').slice(0, 28) || 'Игрок';
}

function other(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function randomMove() {
  return MOVES[Math.floor(Math.random() * MOVES.length)];
}

// Moves are held only in server memory; snapshots never reveal the opponent's
// choice until both have locked their moves or the selection timer has expired.
export function createRockPaperScissorsRoom({ roomId, players, io, onFinish }) {
  const order = Math.random() < 0.5 ? players : [...players].reverse();
  const seats = {
    a: { socketId: order[0].socketId, name: safeName(order[0].name) },
    b: { socketId: order[1].socketId, name: safeName(order[1].name) },
  };
  const score = { a: 0, b: 0 };
  let moves = { a: null, b: null };
  let auto = { a: false, b: false };
  let round = 1;
  let phase = 'countdown';
  let phaseEndAt = Date.now() + COUNTDOWN_MS;
  let status = 'playing';
  let result = null;
  let lastRound = null;
  let history = [];
  let timer = null;
  let destroyed = false;
  let finishedOnce = false;

  function seatOf(socketId) {
    if (seats.a.socketId === socketId) return 'a';
    if (seats.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshot(socketId) {
    const playerSeat = seatOf(socketId);
    const opponentSeat = playerSeat ? other(playerSeat) : null;
    return {
      gameId: GAME_ID,
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat,
      players: { a: { name: seats.a.name }, b: { name: seats.b.name } },
      score: { ...score },
      targetWins: TARGET_WINS,
      round,
      phase,
      phaseEndAt,
      status,
      result,
      // Ready is public, the actual opponent gesture is secret during selection.
      ready: { a: Boolean(moves.a), b: Boolean(moves.b) },
      myMove: playerSeat ? moves[playerSeat] : null,
      lastRound: lastRound ? { ...lastRound } : null,
      history: history.map((item) => ({ ...item })),
    };
  }

  function emitState() {
    if (destroyed) return;
    for (const seat of ['a', 'b']) {
      io.to(seats[seat].socketId).emit('game:state', snapshot(seats[seat].socketId));
    }
  }

  function error(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: GAME_ID, roomId, message });
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(fn, ms) {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (!destroyed && status === 'playing') fn();
    }, ms);
    timer.unref?.();
  }

  function finish(winner, type, message) {
    if (destroyed || status !== 'playing') return;
    clearTimer();
    status = 'finished';
    phase = 'finished';
    phaseEndAt = null;
    result = { winner, type, message };
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(seats) });
    }
  }

  function startPicking() {
    if (status !== 'playing') return;
    moves = { a: null, b: null };
    auto = { a: false, b: false };
    phase = 'picking';
    phaseEndAt = Date.now() + PICK_MS;
    emitState();
    schedule(() => {
      for (const seat of ['a', 'b']) {
        if (!moves[seat]) {
          moves[seat] = randomMove();
          auto[seat] = true;
        }
      }
      revealRound();
    }, PICK_MS);
  }

  function revealRound() {
    if (status !== 'playing' || phase !== 'picking' || !moves.a || !moves.b) return;
    clearTimer();
    const winner = moves.a === moves.b ? null : WINNING_MOVE[moves.a] === moves.b ? 'a' : 'b';
    if (winner) score[winner] += 1;
    lastRound = { round, a: moves.a, b: moves.b, winner, auto: { ...auto } };
    history = [...history, { round, winner, a: moves.a, b: moves.b }].slice(-7);
    phase = 'reveal';
    phaseEndAt = Date.now() + REVEAL_MS;
    emitState();
    schedule(() => {
      if (score.a >= TARGET_WINS || score.b >= TARGET_WINS) {
        const champion = score.a >= TARGET_WINS ? 'a' : 'b';
        finish(champion, 'score', `${seats[champion].name} первым набрал ${TARGET_WINS} побед!`);
        return;
      }
      round += 1;
      startPicking();
    }, REVEAL_MS);
  }

  function handleAction(socketId, action = {}) {
    if (status !== 'playing') return;
    const seat = seatOf(socketId);
    if (!seat) return;
    if (action?.type === 'resign') {
      finish(other(seat), 'resign', `${seats[seat].name} покинул матч.`);
      return;
    }
    if (action?.type !== 'choose') return;
    if (phase !== 'picking') return;
    if (moves[seat]) return;
    const move = action.payload?.move;
    if (!MOVES.includes(move)) {
      error(socketId, 'Выберите камень, ножницы или бумагу.');
      return;
    }
    // The deadline is authoritative even if a queued socket packet arrives late.
    if (Date.now() >= phaseEndAt) return;
    moves[seat] = move;
    emitState();
    if (moves.a && moves.b) revealRound();
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatOf(socketId);
    if (!seat) return;
    finish(other(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  schedule(startPicking, COUNTDOWN_MS);

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [seats.a.socketId, seats.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      destroyed = true;
      clearTimer();
    },
  };
}
