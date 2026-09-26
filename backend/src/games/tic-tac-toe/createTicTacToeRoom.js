const START_TIME_MS = 5 * 60 * 1000;
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function safePlayerName(name) {
  if (typeof name !== 'string') return 'Игрок';
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 28) : 'Игрок';
}

function opposite(symbol) {
  return symbol === 'x' ? 'o' : 'x';
}

function winningLine(board, symbol) {
  return WIN_LINES.find((line) => line.every((index) => board[index] === symbol)) || null;
}

export function createTicTacToeRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySymbol = {
    x: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    o: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  const board = Array(9).fill(null);
  const marks = { x: [], o: [] };
  const clocks = { x: START_TIME_MS, o: START_TIME_MS };

  let turn = 'x';
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let turnStartedAt = Date.now();
  let finishedOnce = false;
  let interval = null;

  function symbolForSocket(socketId) {
    if (bySymbol.x.socketId === socketId) return 'x';
    if (bySymbol.o.socketId === socketId) return 'o';
    return null;
  }

  function effectiveClocks(now = Date.now()) {
    const snapshot = { ...clocks };
    if (status === 'playing') {
      snapshot[turn] = Math.max(0, snapshot[turn] - (now - turnStartedAt));
    }
    return snapshot;
  }

  function commitCurrentClock(now = Date.now()) {
    if (status !== 'playing') return;
    clocks[turn] = Math.max(0, clocks[turn] - (now - turnStartedAt));
    turnStartedAt = now;
  }

  function expiringCellFor(symbol) {
    return marks[symbol].length >= 3 ? marks[symbol][0] : null;
  }

  function legalTargetsFor(symbol) {
    const expiringCell = expiringCellFor(symbol);
    const targets = [];

    for (let index = 0; index < board.length; index += 1) {
      if (board[index] === null || index === expiringCell) targets.push(index);
    }

    return targets;
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    commitCurrentClock();
    status = 'finished';
    result = nextResult;
    if (interval) clearInterval(interval);
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySymbol) });
    }
  }

  function snapshotFor(socketId) {
    const playerSymbol = symbolForSocket(socketId);
    return {
      gameId: 'tic-tac-toe',
      roomId,
      playerSymbol,
      players: {
        x: { name: bySymbol.x.name },
        o: { name: bySymbol.o.name },
      },
      board: [...board],
      marks: {
        x: [...marks.x],
        o: [...marks.o],
      },
      turn,
      clocks: effectiveClocks(),
      status,
      result,
      lastMove,
      expiringCell: status === 'playing' ? expiringCellFor(turn) : null,
      legalTargets: status === 'playing' ? legalTargetsFor(turn) : [],
    };
  }

  function emitState() {
    for (const symbol of ['x', 'o']) {
      const player = bySymbol[symbol];
      io.to(player.socketId).emit('game:state', snapshotFor(player.socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', {
      gameId: 'tic-tac-toe',
      roomId,
      message,
    });
  }

  function handlePlace(socketId, payload = {}) {
    if (status !== 'playing') return;

    const symbol = symbolForSocket(socketId);
    if (!symbol) return;
    if (turn !== symbol) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }

    const cell = Number(payload.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
      emitError(socketId, 'Выберите клетку на поле.');
      return;
    }

    const now = Date.now();
    const currentClocks = effectiveClocks(now);
    if (currentClocks[symbol] <= 0) {
      clocks[symbol] = 0;
      finish({
        type: 'timeout',
        winner: opposite(symbol),
        message: 'Время вышло.',
      });
      return;
    }

    const legalTargets = legalTargetsFor(symbol);
    if (!legalTargets.includes(cell)) {
      emitError(socketId, 'Эта клетка уже занята.');
      return;
    }

    commitCurrentClock(now);

    let removed = null;
    if (marks[symbol].length >= 3) {
      removed = marks[symbol].shift();
      board[removed] = null;
    }

    board[cell] = symbol;
    marks[symbol].push(cell);
    lastMove = { symbol, cell, removed };

    const line = winningLine(board, symbol);
    if (line) {
      finish({
        type: 'win',
        winner: symbol,
        line,
        message: `${symbol === 'x' ? 'Крестики' : 'Нолики'} собрали три в ряд.`,
      });
      return;
    }

    turn = opposite(turn);
    turnStartedAt = Date.now();
    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const symbol = symbolForSocket(socketId);
    if (!symbol) return;

    finish({
      type: 'resign',
      winner: opposite(symbol),
      message: `${symbol === 'x' ? 'Крестики' : 'Нолики'} сдались.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'place') handlePlace(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const symbol = symbolForSocket(socketId);
    if (!symbol) return;

    finish({
      type: 'disconnect',
      winner: opposite(symbol),
      message: 'Один из игроков отключился.',
    });
  }

  interval = setInterval(() => {
    if (status !== 'playing') return;

    const current = effectiveClocks();
    if (current[turn] <= 0) {
      clocks[turn] = 0;
      finish({
        type: 'timeout',
        winner: opposite(turn),
        message: 'Время вышло.',
      });
      return;
    }

    emitState();
  }, 1000);
  interval.unref?.();

  return {
    playerSocketIds: [bySymbol.x.socketId, bySymbol.o.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
    },
  };
}
