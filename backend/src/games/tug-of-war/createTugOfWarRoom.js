// Authoritative two-player tug-of-war. The client only sends a 'pull' action;
// all cooldowns, physics, scores and countdowns are decided by the server.
const TICK_MS = 25;
const EMIT_MS = 50;
const COUNTDOWN_MS = 3000;
const ROUND_MS = 28000;
const BREAK_MS = 2300;
const MAX_ROUNDS = 5;
const WINS_REQUIRED = 2;
const MIN_PULL_MS = 70;
const PULL_IMPULSE = 15;
const SPEED_CAP = 95;
const FRICTION = 4;
const WIN_POSITION = 100;
const DRAW_DISTANCE = 2;

const other = (seat) => seat === 'a' ? 'b' : 'a';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const safeName = (name) => typeof name === 'string' ? (name.trim().slice(0, 28) || 'Игрок') : 'Игрок';

export function createTugOfWarRoom({ roomId, players, io, onFinish }) {
  const bySeat = {
    a: { socketId: players[0].socketId, name: safeName(players[0].name), color: 'red' },
    b: { socketId: players[1].socketId, name: safeName(players[1].name), color: 'blue' },
  };
  let status = 'playing';
  let phase = 'countdown';
  let round = 1;
  let scores = { a: 0, b: 0 };
  let position = 0; // -100: red wins, +100: blue wins
  let velocity = 0;
  let pulls = { a: 0, b: 0 };
  let lastPull = { a: -Infinity, b: -Infinity };
  let flashUntil = { a: 0, b: 0 };
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let roundEndsAt = 0;
  let roundWinner = null;
  let roundMessage = '';
  let result = null;
  let lastTick = Date.now();
  let lastEmit = 0;
  let finishedOnce = false;
  let breakTimer = null;
  let ticker = null;

  function seatFor(socketId) {
    return bySeat.a.socketId === socketId ? 'a' : bySeat.b.socketId === socketId ? 'b' : null;
  }

  function stateFor(socketId, now = Date.now()) {
    const seat = seatFor(socketId);
    return {
      gameId: 'tug-of-war', roomId, playerSeat: seat,
      opponentSeat: seat ? other(seat) : null,
      serverTime: now, status, phase, round, maxRounds: MAX_ROUNDS,
      winsRequired: WINS_REQUIRED,
      players: { a: { name: bySeat.a.name, color: bySeat.a.color }, b: { name: bySeat.b.name, color: bySeat.b.color } },
      scores: { ...scores },
      position: Math.round(position * 100) / 100,
      velocity: Math.round(velocity * 100) / 100,
      pulls: { ...pulls },
      pulling: { a: now < flashUntil.a, b: now < flashUntil.b },
      countdownLeftMs: phase === 'countdown' ? Math.max(0, countdownEndsAt - now) : 0,
      roundLeftMs: phase === 'playing' ? Math.max(0, roundEndsAt - now) : 0,
      roundWinner, roundMessage, result,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmit < EMIT_MS) return;
    lastEmit = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', stateFor(bySeat[seat].socketId, now));
    }
  }

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    velocity = 0;
    result = { winner, type, message };
    if (ticker) clearInterval(ticker);
    if (breakTimer) clearTimeout(breakTimer);
    emitState(true);
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function startNextRound() {
    if (status !== 'playing') return;
    round += 1;
    position = 0;
    velocity = 0;
    pulls = { a: 0, b: 0 };
    flashUntil = { a: 0, b: 0 };
    lastPull = { a: -Infinity, b: -Infinity };
    roundWinner = null;
    roundMessage = '';
    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    lastTick = Date.now();
    breakTimer = null;
    emitState(true);
  }

  function finishRound(winner) {
    if (status !== 'playing' || phase !== 'playing') return;
    phase = 'round-over';
    velocity = 0;
    roundWinner = winner;
    if (winner) {
      scores[winner] += 1;
      roundMessage = `${bySeat[winner].name} перетянул канат!`;
    } else {
      roundMessage = 'Ровная борьба — ничья в раунде!';
    }
    if (scores.a >= WINS_REQUIRED || scores.b >= WINS_REQUIRED || round >= MAX_ROUNDS) {
      const leader = scores.a > scores.b ? 'a' : scores.b > scores.a ? 'b' : null;
      finishMatch(leader, leader ? 'score' : 'draw', leader ? `${bySeat[leader].name} победил в перетягивании!` : 'Ничья — силы оказались равны!');
      return;
    }
    emitState(true);
    breakTimer = setTimeout(startNextRound, BREAK_MS);
    breakTimer.unref?.();
  }

  function handleAction(socketId, action = {}) {
    const seat = seatFor(socketId);
    if (!seat) return;
    if (action?.type === 'resign') {
      if (status === 'playing') finishMatch(other(seat), 'resign', `${bySeat[seat].name} покинул матч.`);
      return;
    }
    if (action?.type !== 'pull' || status !== 'playing' || phase !== 'playing') return;
    const now = Date.now();
    if (now - lastPull[seat] < MIN_PULL_MS) return;
    lastPull[seat] = now;
    pulls[seat] += 1;
    flashUntil[seat] = now + 155;
    velocity = clamp(velocity + (seat === 'a' ? -PULL_IMPULSE : PULL_IMPULSE), -SPEED_CAP, SPEED_CAP);
    emitState(true);
  }

  function update(now) {
    if (status !== 'playing') return;
    const dt = Math.min(0.1, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    if (phase === 'countdown') {
      if (now >= countdownEndsAt) {
        phase = 'playing';
        roundEndsAt = now + ROUND_MS;
        lastPull = { a: -Infinity, b: -Infinity };
        emitState(true);
      } else emitState();
      return;
    }
    if (phase !== 'playing') { emitState(); return; }
    // Exponential drag removes momentum naturally when both players stop tapping.
    const decay = Math.exp(-FRICTION * dt);
    position = clamp(position + (velocity * (1 - decay)) / FRICTION, -WIN_POSITION, WIN_POSITION);
    velocity *= decay;
    if (Math.abs(velocity) < 0.025) velocity = 0;
    if (position <= -WIN_POSITION) { finishRound('a'); return; }
    if (position >= WIN_POSITION) { finishRound('b'); return; }
    if (now >= roundEndsAt) {
      finishRound(position < -DRAW_DISTANCE ? 'a' : position > DRAW_DISTANCE ? 'b' : null);
      return;
    }
    emitState();
  }

  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat && status === 'playing') finishMatch(other(seat), 'disconnect', 'Соперник отключился от матча.');
  }

  ticker = setInterval(() => update(Date.now()), TICK_MS);
  ticker.unref?.();
  emitState(true);

  return {
    id: roomId,
    gameId: 'tug-of-war',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      if (ticker) clearInterval(ticker);
      if (breakTimer) clearTimeout(breakTimer);
    },
  };
}
