const PREVIEW_MS = 2200;
const PICK_MS = 5000;
const REVEAL_MS = 2300;
const TOTAL_LEVELS = 3;
const CARD_IDS = ['a', 'b', 'n1', 'n2', 'n3'];

const LEVELS = {
  1: { name: 'МЕДЛЕННО', stepMs: 600, steps: 8, multiSwapChance: 0 },
  2: { name: 'СРЕДНЕ', stepMs: 360, steps: 11, multiSwapChance: 0.35 },
  3: { name: 'БЫСТРО', stepMs: 210, steps: 14, multiSwapChance: 0.72 },
};

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function applyPlan(startOrder, plan) {
  const order = [...startOrder];
  for (const step of plan) {
    for (const [a, b] of step.swaps) {
      [order[a], order[b]] = [order[b], order[a]];
    }
  }
  return order;
}

function randomPair(excluded = new Set()) {
  const available = [0, 1, 2, 3, 4].filter((index) => !excluded.has(index));
  if (available.length < 2) return null;
  const aIndex = Math.floor(Math.random() * available.length);
  const a = available.splice(aIndex, 1)[0];
  const b = available[Math.floor(Math.random() * available.length)];
  return a < b ? [a, b] : [b, a];
}

function buildShufflePlan(level) {
  const config = LEVELS[level];
  const plan = [];
  let lastKey = '';

  for (let stepIndex = 0; stepIndex < config.steps; stepIndex += 1) {
    let first = randomPair();
    let key = first.join('-');
    let attempts = 0;
    while (key === lastKey && attempts < 10) {
      first = randomPair();
      key = first.join('-');
      attempts += 1;
    }

    const swaps = [first];
    const used = new Set(first);
    if (Math.random() < config.multiSwapChance) {
      const second = randomPair(used);
      if (second) swaps.push(second);
    }

    plan.push({ swaps });
    lastKey = key;
  }

  return plan;
}

export function createShuffleDuelRoom({ roomId, players, io, onFinish }) {
  const randomized = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: randomized[0].socketId, name: safePlayerName(randomized[0].name) },
    b: { socketId: randomized[1].socketId, name: safePlayerName(randomized[1].name) },
  };

  let status = 'playing';
  let phase = 'preview';
  let level = 1;
  let roundStartOrder = shuffle(CARD_IDS);
  let order = [...roundStartOrder];
  let shufflePlan = [];
  let shuffleStartsAt = 0;
  let phaseEndsAt = 0;
  let picks = { a: null, b: null };
  let correct = null;
  let pendingOutcome = null;
  let result = null;
  let timer = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function clearTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function snapshotFor(socketId) {
    const now = Date.now();
    const playerSeat = seatForSocket(socketId);
    const opponentSeat = playerSeat ? opposite(playerSeat) : null;
    const revealData = phase === 'reveal' || status === 'finished';

    return {
      gameId: 'shuffle-duel',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      status,
      phase,
      level,
      totalLevels: TOTAL_LEVELS,
      levelName: LEVELS[level]?.name || '',
      phaseEndsAt,
      roundStartOrder: [...roundStartOrder],
      order: [...order],
      shufflePlan,
      shuffleStartsAt,
      shuffleStepMs: LEVELS[level]?.stepMs || 0,
      pickSeconds: PICK_MS / 1000,
      myPick: playerSeat ? picks[playerSeat] : null,
      pickStatus: {
        a: picks.a !== null,
        b: picks.b !== null,
      },
      ...(revealData ? {
        picks: { ...picks },
        correct: correct ? { ...correct } : null,
      } : {}),
      result,
    };
  }

  function emitState() {
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    clearTimer();
    status = 'finished';
    phase = 'finished';
    phaseEndsAt = 0;
    result = nextResult;
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function schedule(fn, delay) {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delay);
    timer.unref?.();
  }

  function startRound(nextLevel) {
    if (status !== 'playing') return;
    level = nextLevel;
    phase = 'preview';
    picks = { a: null, b: null };
    correct = null;
    pendingOutcome = null;
    shufflePlan = buildShufflePlan(level);
    roundStartOrder = shuffle(CARD_IDS);
    order = [...roundStartOrder];
    shuffleStartsAt = 0;
    phaseEndsAt = Date.now() + PREVIEW_MS;
    emitState();
    schedule(startShuffle, PREVIEW_MS);
  }

  function startShuffle() {
    if (status !== 'playing') return;
    phase = 'shuffle';
    shuffleStartsAt = Date.now() + 80;
    const duration = shufflePlan.length * LEVELS[level].stepMs;
    phaseEndsAt = shuffleStartsAt + duration;
    emitState();
    schedule(startPick, duration + 90);
  }

  function startPick() {
    if (status !== 'playing') return;
    order = applyPlan(roundStartOrder, shufflePlan);
    phase = 'pick';
    phaseEndsAt = Date.now() + PICK_MS;
    emitState();
    schedule(resolvePicks, PICK_MS);
  }

  function resolvePicks() {
    if (status !== 'playing' || phase !== 'pick') return;

    correct = {
      a: Number.isInteger(picks.a) && order[picks.a] === 'a',
      b: Number.isInteger(picks.b) && order[picks.b] === 'b',
    };

    if (correct.a && correct.b) {
      pendingOutcome = level >= TOTAL_LEVELS
        ? { type: 'draw', winner: null, message: 'Оба прошли все 3 уровня — ничья!' }
        : { type: 'next-level' };
    } else if (!correct.a && !correct.b) {
      pendingOutcome = { type: 'draw', winner: null, message: 'Оба ошиблись на одном уровне — ничья!' };
    } else {
      const winner = correct.a ? 'a' : 'b';
      pendingOutcome = {
        type: 'win',
        winner,
        message: `${bySeat[winner].name} нашёл свою карточку, а соперник ошибся.`,
      };
    }

    phase = 'reveal';
    phaseEndsAt = Date.now() + REVEAL_MS;
    emitState();

    schedule(() => {
      if (pendingOutcome?.type === 'next-level') startRound(level + 1);
      else finish(pendingOutcome || { type: 'draw', winner: null, message: 'Ничья.' });
    }, REVEAL_MS);
  }

  function handleChoose(socketId, payload = {}) {
    if (status !== 'playing' || phase !== 'pick') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    const slot = Number(payload.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= CARD_IDS.length) return;
    picks[seat] = slot;
    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({ type: 'resign', winner: opposite(seat), message: `${bySeat[seat].name} вышел из игры.` });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'choose') handleChoose(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({ type: 'disconnect', winner: opposite(seat), message: 'Соперник отключился.' });
  }

  startRound(1);

  return {
    id: roomId,
    gameId: 'shuffle-duel',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() { clearTimer(); },
  };
}
