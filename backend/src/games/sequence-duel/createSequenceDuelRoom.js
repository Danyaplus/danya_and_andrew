const GAME_ID = 'sequence-duel';
const TOTAL_ROUNDS = 7;
const COLORS = ['red', 'blue', 'green', 'yellow'];
const COUNTDOWN_MS = 3000;
const WATCH_LEAD_MS = 650;
const FLASH_STEP_MS = 850;
const FLASH_ON_MS = 590;
const WATCH_TAIL_MS = 550;
const REVIEW_MS = 2300;
const TICK_MS = 65;

function safeName(name) {
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 28) : 'Игрок';
}

function other(seat) {
  return seat === 'a' ? 'b' : 'a';
}

export function createSequenceDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? [...players].reverse() : players;
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name), score: 0, progress: 0, done: false, success: false, reason: null },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name), score: 0, progress: 0, done: false, success: false, reason: null },
  };

  let status = 'playing';
  let phase = 'countdown'; // countdown -> watch -> answer -> review -> countdown | finished
  let round = 1;
  let sequence = [];
  let phaseStartedAt = 0;
  let phaseEndsAt = 0;
  let result = null;
  let interval = null;
  let finishedOnce = false;

  function seatOf(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId, now = Date.now()) {
    const seat = seatOf(socketId);
    const publicPlayer = (player) => ({
      name: player.name,
      score: player.score,
      progress: player.progress,
      done: player.done,
      success: player.done ? player.success : null,
      reason: player.done ? player.reason : null,
    });

    return {
      gameId: GAME_ID,
      roomId,
      serverTime: now,
      playerSeat: seat,
      opponentSeat: seat ? other(seat) : null,
      status,
      phase,
      round,
      totalRounds: TOTAL_ROUNDS,
      sequenceLength: sequence.length,
      // Пока идёт ввод, порядок не передаётся, чтобы его нельзя было прочитать из нового состояния.
      sequence: phase === 'watch' || phase === 'review' ? [...sequence] : null,
      phaseStartedAt,
      phaseEndsAt,
      flashStepMs: FLASH_STEP_MS,
      flashOnMs: FLASH_ON_MS,
      watchLeadMs: WATCH_LEAD_MS,
      players: { a: publicPlayer(bySeat.a), b: publicPlayer(bySeat.b) },
      result,
    };
  }

  function emitState() {
    const now = Date.now();
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId, now));
    }
  }

  function startRound(now = Date.now()) {
    if (status !== 'playing') return;
    // Все игроки смотрят на ОДНУ и ту же последовательность.
    sequence = Array.from({ length: round + 2 }, () => COLORS[Math.floor(Math.random() * COLORS.length)]);
    for (const seat of ['a', 'b']) {
      Object.assign(bySeat[seat], { progress: 0, done: false, success: false, reason: null });
    }
    phase = 'countdown';
    phaseStartedAt = now;
    phaseEndsAt = now + COUNTDOWN_MS;
    emitState();
  }

  function finish(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    phaseEndsAt = Date.now();
    result = { winner, type, message };
    if (interval) clearInterval(interval);
    interval = null;
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishByScore() {
    const a = bySeat.a.score;
    const b = bySeat.b.score;
    if (a === b) {
      finish(null, 'draw', `Оба игрока набрали ${a} очк. — ничья!`);
      return;
    }
    const winner = a > b ? 'a' : 'b';
    finish(winner, 'win', `${bySeat[winner].name} запомнил больше последовательностей!`);
  }

  function beginReview(now = Date.now()) {
    if (phase !== 'answer' || status !== 'playing') return;
    for (const seat of ['a', 'b']) {
      const p = bySeat[seat];
      if (!p.done) {
        p.done = true;
        p.reason = 'timeout';
      }
      if (p.success) p.score += 1;
    }
    phase = 'review';
    phaseStartedAt = now;
    phaseEndsAt = now + REVIEW_MS;
    emitState();
  }

  function handlePress(socketId, payload) {
    if (status !== 'playing' || phase !== 'answer') return;
    const seat = seatOf(socketId);
    if (!seat) return;
    const now = Date.now();
    if (now >= phaseEndsAt) {
      beginReview(now);
      return;
    }
    const player = bySeat[seat];
    if (player.done) return;
    const index = payload?.index;
    const color = payload?.color;
    if (!Number.isInteger(index) || index !== player.progress || !COLORS.includes(color)) return;

    if (sequence[index] !== color) {
      player.done = true;
      player.reason = 'mistake';
    } else {
      player.progress += 1;
      if (player.progress === sequence.length) {
        player.done = true;
        player.success = true;
        player.reason = 'correct';
      }
    }
    emitState();
    if (bySeat.a.done && bySeat.b.done) beginReview(now);
  }

  function advance(now) {
    if (status !== 'playing' || now < phaseEndsAt) return;
    if (phase === 'countdown') {
      phase = 'watch';
      phaseStartedAt = now;
      phaseEndsAt = now + WATCH_LEAD_MS + sequence.length * FLASH_STEP_MS + WATCH_TAIL_MS;
      emitState();
    } else if (phase === 'watch') {
      phase = 'answer';
      phaseStartedAt = now;
      phaseEndsAt = now + Math.max(12000, sequence.length * 2050 + 3000);
      emitState();
    } else if (phase === 'answer') {
      beginReview(now);
    } else if (phase === 'review') {
      if (round >= TOTAL_ROUNDS) finishByScore();
      else {
        round += 1;
        startRound(now);
      }
    }
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'press') handlePress(socketId, action.payload);
    if (action.type === 'resign' && status === 'playing') {
      const seat = seatOf(socketId);
      if (seat) finish(other(seat), 'resign', `${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatOf(socketId);
    if (seat) finish(other(seat), 'disconnect', 'Соперник отключился.');
  }

  interval = setInterval(() => advance(Date.now()), TICK_MS);
  interval.unref?.();
  startRound();

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
