const TARGET_SCORE = 3;
const TOTAL_ROUNDS = 2;
const COUNTDOWN_MS = 2200;
const ROUND_OVER_MS = 1500;
const RESULT_HOLD_MS = 2600;
const INPUT_COOLDOWN_MS = 90;

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const name = value.trim().slice(0, 28);
  return name || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function createCatFishingRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();

  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };

  let status = 'playing';
  let phase = 'countdown';
  let round = 1;
  let roundScores = { a: 0, b: 0 };
  let roundWins = { a: 0, b: 0 };
  let result = null;
  let fish = null;
  let effect = null;
  let roundWinner = null;
  let roundMessage = 'Приготовьтесь';
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let fishCounter = 1;
  let timer = null;
  let finishedOnce = false;

  const lastInputAt = { a: 0, b: 0 };

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);

    return {
      gameId: 'cat-fishing',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      targetScore: TARGET_SCORE,
      totalRounds: TOTAL_ROUNDS,
      round,
      roundScores,
      roundWins,
      phase,
      status,
      fish,
      effect,
      roundWinner,
      roundMessage,
      countdownEndsAt,
      result,
    };
  }

  function emitState() {
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule(delay, fn) {
    clearTimer();
    timer = setTimeout(fn, delay);
    timer.unref?.();
  }

  function finishMatch(message) {
    status = 'finished';
    phase = 'finished';
    fish = null;

    let winner = null;
    let draw = false;

    if (roundWins.a > roundWins.b) winner = 'a';
    else if (roundWins.b > roundWins.a) winner = 'b';
    else draw = true;

    result = {
      winner,
      draw,
      message: draw
        ? `После двух раундов ${roundWins.a}:${roundWins.b} — ничья.`
        : message,
    };

    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      schedule(RESULT_HOLD_MS, () => {
        onFinish?.({ roomId, players: Object.values(bySeat) });
      });
    }
  }

  function spawnFish() {
    if (status !== 'playing' || phase !== 'playing') return;

    const type = Math.random() < 0.68 ? 'gold' : 'black';

    fish = {
      id: `fish-${round}-${fishCounter++}`,
      type,
      x: Math.round(randomBetween(34, 66) * 10) / 10,
      y: Math.round(randomBetween(28, 72) * 10) / 10,
      spawnedAt: Date.now(),
    };

    effect = null;
    emitState();
  }

  function scheduleNextFish() {
    const delay = Math.round(randomBetween(620, 1220));
    schedule(delay, spawnFish);
  }

  function startRound() {
    phase = 'countdown';
    roundScores = { a: 0, b: 0 };
    roundWinner = null;
    roundMessage = `Раунд ${round} из ${TOTAL_ROUNDS}`;
    fish = null;
    effect = null;
    countdownEndsAt = Date.now() + COUNTDOWN_MS;

    emitState();

    schedule(COUNTDOWN_MS, () => {
      if (status !== 'playing') return;

      phase = 'playing';
      roundMessage = '';
      emitState();
      scheduleNextFish();
    });
  }

  function endRound(winner) {
    phase = 'round-over';
    fish = null;
    roundWinner = winner;
    roundWins = {
      ...roundWins,
      [winner]: roundWins[winner] + 1,
    };
    roundMessage = `${bySeat[winner].name} первым набрал ${TARGET_SCORE} очка.`;

    emitState();

    if (round >= TOTAL_ROUNDS) {
      schedule(ROUND_OVER_MS, () => {
        finishMatch(`${bySeat[winner].name} выиграл матч.`);
      });
      return;
    }

    schedule(ROUND_OVER_MS, () => {
      round += 1;
      startRound();
    });
  }

  function catchFish(seat) {
    if (status !== 'playing' || phase !== 'playing' || !fish) return;

    const now = Date.now();
    if (now - lastInputAt[seat] < INPUT_COOLDOWN_MS) return;
    lastInputAt[seat] = now;

    // First valid server action locks this fish.
    const caught = fish;
    fish = null;

    const delta = caught.type === 'gold' ? 1 : -1;
    roundScores = {
      ...roundScores,
      [seat]: roundScores[seat] + delta,
    };

    effect = {
      id: `effect-${caught.id}-${seat}`,
      seat,
      type: caught.type,
      delta,
      x: caught.x,
      y: caught.y,
      at: now,
    };

    emitState();

    if (roundScores[seat] >= TARGET_SCORE) {
      endRound(seat);
      return;
    }

    scheduleNextFish();
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || typeof action.type !== 'string') return;

    if (action.type === 'catch') {
      catchFish(seat);
      return;
    }

    if (action.type === 'resign' && status === 'playing') {
      const winner = opposite(seat);
      roundWins = {
        ...roundWins,
        [winner]: Math.max(roundWins[winner], roundWins[seat] + 1),
      };
      finishMatch(`${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;

    const seat = seatForSocket(socketId);
    if (!seat) return;

    const winner = opposite(seat);
    roundWins = {
      ...roundWins,
      [winner]: Math.max(roundWins[winner], roundWins[seat] + 1),
    };

    finishMatch(`${bySeat[seat].name} отключился.`);
  }

  startRound();

  return {
    playerSocketIds: Object.values(bySeat).map((p) => p.socketId),
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      clearTimer();
    },
  };
}
