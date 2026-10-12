import { randomInt } from 'node:crypto';

const GAME_ID = 'coin-flip';
const ROUNDS = 7;
const COUNTDOWN_MS = 3000;
const CHOOSE_MS = 10000;
const BOTH_READY_MS = 600;
const FLIP_MS = 2600;
const SUMMARY_MS = 2300;
const SEATS = ['a', 'b'];

function other(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function safeName(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 28) : 'Игрок';
}

export function createCoinFlipRoom({ roomId, players, io, onFinish }) {
  const assigned = randomInt(2) === 0 ? players : [...players].reverse();
  const seats = {
    a: { socketId: assigned[0].socketId, name: safeName(assigned[0].name), score: 0 },
    b: { socketId: assigned[1].socketId, name: safeName(assigned[1].name), score: 0 },
  };

  let status = 'playing';
  let phase = 'countdown';
  let round = 1;
  let phaseEndsAt = Date.now() + COUNTDOWN_MS;
  let outcome = null;
  let roundResult = null;
  let result = null;
  let history = [];
  let finishedOnce = false;
  const picks = { a: null, b: null };

  function seatFor(socketId) {
    if (seats.a.socketId === socketId) return 'a';
    if (seats.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshot(socketId) {
    const playerSeat = seatFor(socketId);
    const canReveal = phase === 'summary' || phase === 'finished';
    return {
      gameId: GAME_ID,
      roomId,
      serverTime: Date.now(),
      status,
      phase,
      round,
      roundCount: ROUNDS,
      phaseEndsAt,
      playerSeat,
      opponentSeat: playerSeat ? other(playerSeat) : null,
      players: {
        a: { name: seats.a.name, score: seats.a.score },
        b: { name: seats.b.name, score: seats.b.score },
      },
      myChoice: playerSeat ? picks[playerSeat] : null,
      opponentReady: playerSeat ? Boolean(picks[other(playerSeat)]) : false,
      outcome: canReveal ? outcome : null,
      roundResult: canReveal ? roundResult : null,
      history: [...history],
      result,
    };
  }

  function emitState() {
    for (const seat of SEATS) {
      io.to(seats[seat].socketId).emit('game:state', snapshot(seats[seat].socketId));
    }
  }

  function clearTimers() {
    clearInterval(interval);
  }

  function finish(override) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    phaseEndsAt = null;
    if (override) {
      result = override;
    } else if (seats.a.score === seats.b.score) {
      result = { winner: null, type: 'draw', message: 'Идеально ровная дуэль! Ничья.' };
    } else {
      const winner = seats.a.score > seats.b.score ? 'a' : 'b';
      result = { winner, type: 'score', message: `${seats[winner].name} угадал больше подбрасываний!` };
    }
    clearTimers();
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(seats) });
    }
  }

  function beginChoosing(now) {
    phase = 'choosing';
    phaseEndsAt = now + CHOOSE_MS;
    picks.a = null;
    picks.b = null;
    outcome = null;
    roundResult = null;
    emitState();
  }

  function beginFlipping(now) {
    if (phase !== 'choosing' || status !== 'playing') return;
    phase = 'flipping';
    phaseEndsAt = now + FLIP_MS;
    // The coin is tossed on the server, after guesses are locked.
    outcome = randomInt(2) === 0 ? 'heads' : 'tails';
    emitState(); // The result and opponent's guess remain hidden while it spins.
  }

  function beginSummary(now) {
    if (phase !== 'flipping' || status !== 'playing') return;
    phase = 'summary';
    phaseEndsAt = now + SUMMARY_MS;
    const winners = SEATS.filter((seat) => picks[seat] === outcome);
    for (const seat of winners) seats[seat].score += 1;
    roundResult = {
      outcome,
      picks: { ...picks },
      winners,
    };
    history = [...history, { round, outcome, picks: { ...picks }, winners }];
    emitState();
  }

  function tick() {
    if (status !== 'playing') return;
    const now = Date.now();
    if (now < phaseEndsAt) return;
    if (phase === 'countdown') beginChoosing(now);
    else if (phase === 'choosing') beginFlipping(now);
    else if (phase === 'flipping') beginSummary(now);
    else if (phase === 'summary') {
      if (round === ROUNDS) finish();
      else {
        round += 1;
        beginChoosing(now);
      }
    }
  }

  function handleAction(socketId, action = {}) {
    const seat = seatFor(socketId);
    if (!seat || status !== 'playing' || !action || typeof action !== 'object') return;
    if (action.type === 'resign') {
      finish({ winner: other(seat), type: 'resign', message: `${seats[seat].name} завершил матч.` });
      return;
    }
    if (action.type !== 'choose' || phase !== 'choosing' || picks[seat]) return;
    const now = Date.now();
    if (now >= phaseEndsAt) {
      beginFlipping(now);
      return;
    }
    if (action.choice !== 'heads' && action.choice !== 'tails') return;
    picks[seat] = action.choice;
    if (picks.a && picks.b) phaseEndsAt = Math.min(phaseEndsAt, now + BOTH_READY_MS);
    emitState();
  }

  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat && status === 'playing') {
      finish({ winner: other(seat), type: 'disconnect', message: 'Соперник отключился от матча.' });
    }
  }

  const interval = setInterval(tick, 100);
  interval.unref?.();

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [seats.a.socketId, seats.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy: clearTimers,
  };
}
