const PAIR_SYMBOLS = ['🍓', '🚀', '👑', '🐱', '💎', '🎮', '⚡', '🌙'];
const CARD_COUNT = PAIR_SYMBOLS.length * 2;
const MISMATCH_SHOW_MS = 850;
const MATCH_PAUSE_MS = 360;

function safePlayerName(name) {
  if (typeof name !== 'string') return 'Игрок';
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 28) : 'Игрок';
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

function createDeck() {
  const symbols = shuffle(PAIR_SYMBOLS.flatMap((symbol) => [symbol, symbol]));
  return symbols.map((symbol, id) => ({
    id,
    symbol,
    revealed: false,
    matchedBy: null,
  }));
}

export function createMemoryBattleRoom({ roomId, players, io, onFinish }) {
  const randomizedPlayers = Math.random() < 0.5 ? players : [...players].reverse();

  const bySeat = {
    a: {
      socketId: randomizedPlayers[0].socketId,
      name: safePlayerName(randomizedPlayers[0].name),
      score: 0,
      pairs: [],
    },
    b: {
      socketId: randomizedPlayers[1].socketId,
      name: safePlayerName(randomizedPlayers[1].name),
      score: 0,
      pairs: [],
    },
  };

  const cards = createDeck();
  let turn = Math.random() < 0.5 ? 'a' : 'b';
  let selected = [];
  let locked = false;
  let status = 'playing';
  let result = null;
  let lastEvent = null;
  let eventSerial = 0;
  let resolveTimer = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function visibleCards() {
    return cards.map((card) => ({
      id: card.id,
      symbol: card.revealed || card.matchedBy ? card.symbol : null,
      revealed: card.revealed,
      matchedBy: card.matchedBy,
    }));
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);

    return {
      gameId: 'memory-battle',
      roomId,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      status,
      turn,
      locked,
      selected: [...selected],
      cards: visibleCards(),
      pairCount: PAIR_SYMBOLS.length,
      players: {
        a: {
          name: bySeat.a.name,
          score: bySeat.a.score,
          pairs: [...bySeat.a.pairs],
        },
        b: {
          name: bySeat.b.name,
          score: bySeat.b.score,
          pairs: [...bySeat.b.pairs],
        },
      },
      lastEvent,
      result,
    };
  }

  function emitState() {
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', {
      gameId: 'memory-battle',
      roomId,
      message,
    });
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    locked = true;
    result = nextResult;

    if (resolveTimer) {
      clearTimeout(resolveTimer);
      resolveTimer = null;
    }

    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishIfComplete() {
    if (!cards.every((card) => card.matchedBy)) return false;

    const aScore = bySeat.a.score;
    const bScore = bySeat.b.score;

    if (aScore === bScore) {
      finish({
        type: 'draw',
        winner: null,
        message: `Ничья: ${aScore}:${bScore} по парам.`,
      });
    } else {
      const winner = aScore > bScore ? 'a' : 'b';
      finish({
        type: 'win',
        winner,
        message: `${bySeat[winner].name} собрал больше пар: ${Math.max(aScore, bScore)}.`,
      });
    }

    return true;
  }

  function handleFlip(socketId, payload = {}) {
    if (status !== 'playing') return;

    const seat = seatForSocket(socketId);
    if (!seat) return;

    if (turn !== seat) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }

    if (locked) return;

    const cardId = Number(payload.cardId);
    if (!Number.isInteger(cardId) || cardId < 0 || cardId >= CARD_COUNT) return;

    const card = cards[cardId];
    if (!card || card.matchedBy || card.revealed) return;

    card.revealed = true;
    selected.push(cardId);

    if (selected.length === 1) {
      lastEvent = null;
      emitState();
      return;
    }

    const [firstId, secondId] = selected;
    const first = cards[firstId];
    const second = cards[secondId];
    locked = true;

    if (first.symbol === second.symbol) {
      first.matchedBy = seat;
      second.matchedBy = seat;
      bySeat[seat].score += 1;
      bySeat[seat].pairs.push(first.symbol);

      eventSerial += 1;
      lastEvent = {
        serial: eventSerial,
        type: 'match',
        seat,
        symbol: first.symbol,
        message: 'Пара! Дополнительный ход.',
      };

      selected = [];
      emitState();

      if (finishIfComplete()) return;

      resolveTimer = setTimeout(() => {
        resolveTimer = null;
        if (status !== 'playing') return;
        locked = false;
        lastEvent = null;
        emitState();
      }, MATCH_PAUSE_MS);

      return;
    }

    eventSerial += 1;
    lastEvent = {
      serial: eventSerial,
      type: 'miss',
      seat,
      message: 'Не совпало — ход переходит сопернику.',
    };

    emitState();

    resolveTimer = setTimeout(() => {
      resolveTimer = null;
      if (status !== 'playing') return;

      first.revealed = false;
      second.revealed = false;
      selected = [];
      locked = false;
      turn = opposite(turn);
      lastEvent = null;
      emitState();
    }, MISMATCH_SHOW_MS);
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    finish({
      type: 'resign',
      winner: opposite(seat),
      message: `${bySeat[seat].name} вышел из матча.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'flip') handleFlip(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    finish({
      type: 'disconnect',
      winner: opposite(seat),
      message: 'Один из игроков отключился.',
    });
  }

  return {
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      if (resolveTimer) clearTimeout(resolveTimer);
      resolveTimer = null;
    },
  };
}
