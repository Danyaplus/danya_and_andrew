import { Chess } from 'chess.js';

const START_TIME_MS = 10 * 60 * 1000;
const TICK_MS = 500;

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function boardWithSquares(chess) {
  return chess.board().map((row, rowIndex) => row.map((piece, colIndex) => {
    if (!piece) return null;
    const file = String.fromCharCode(97 + colIndex);
    const rank = 8 - rowIndex;
    return {
      type: piece.type,
      color: piece.color,
      square: `${file}${rank}`,
    };
  }));
}

export function createChessRoom({ roomId, players, io, onFinish }) {
  const chess = new Chess();
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const byColor = {
    w: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  let status = 'playing';
  let result = null;
  let lastMove = null;
  let turnStartedAt = Date.now();
  let finishedOnce = false;
  const clocks = { w: START_TIME_MS, b: START_TIME_MS };

  function colorForSocket(socketId) {
    if (byColor.w.socketId === socketId) return 'w';
    if (byColor.b.socketId === socketId) return 'b';
    return null;
  }

  function effectiveClocks(now = Date.now()) {
    const snapshot = { ...clocks };
    if (status === 'playing') {
      const turn = chess.turn();
      snapshot[turn] = Math.max(0, snapshot[turn] - (now - turnStartedAt));
    }
    return snapshot;
  }

  function commitCurrentClock(now = Date.now()) {
    if (status !== 'playing') return;
    const turn = chess.turn();
    clocks[turn] = Math.max(0, clocks[turn] - (now - turnStartedAt));
    turnStartedAt = now;
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    commitCurrentClock();
    status = 'finished';
    result = nextResult;
    clearInterval(interval);
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(byColor) });
    }
  }

  function gameOverResult() {
    if (!chess.isGameOver()) return null;

    if (chess.isCheckmate()) {
      const winner = opposite(chess.turn());
      return {
        type: 'checkmate',
        winner,
        message: `Мат. Победили ${winner === 'w' ? 'белые' : 'чёрные'}.`,
      };
    }

    if (chess.isStalemate()) {
      return { type: 'draw', winner: null, message: 'Пат. Ничья.' };
    }

    if (chess.isInsufficientMaterial()) {
      return { type: 'draw', winner: null, message: 'Ничья: недостаточно материала для мата.' };
    }

    if (chess.isThreefoldRepetition()) {
      return { type: 'draw', winner: null, message: 'Ничья: троекратное повторение позиции.' };
    }

    if (typeof chess.isDrawByFiftyMoves === 'function' && chess.isDrawByFiftyMoves()) {
      return { type: 'draw', winner: null, message: 'Ничья по правилу 50 ходов.' };
    }

    if (chess.isDraw()) {
      return { type: 'draw', winner: null, message: 'Ничья.' };
    }

    return { type: 'finished', winner: null, message: 'Партия завершена.' };
  }

  function snapshotFor(socketId) {
    const playerColor = colorForSocket(socketId);
    const now = Date.now();
    const currentClocks = effectiveClocks(now);
    return {
      gameId: 'chess',
      roomId,
      playerColor,
      players: {
        w: { name: byColor.w.name },
        b: { name: byColor.b.name },
      },
      board: boardWithSquares(chess),
      turn: chess.turn(),
      clocks: currentClocks,
      status,
      result,
      lastMove,
      legalMoves: status === 'playing'
        ? chess.moves({ verbose: true }).map((move) => ({ from: move.from, to: move.to, promotion: move.promotion || null }))
        : [],
    };
  }

  function emitState() {
    for (const color of ['w', 'b']) {
      const player = byColor[color];
      io.to(player.socketId).emit('game:state', snapshotFor(player.socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: 'chess', roomId, message });
  }

  function handleMove(socketId, payload = {}) {
    if (status !== 'playing') return;
    const color = colorForSocket(socketId);
    if (!color) return;
    if (chess.turn() !== color) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }

    const now = Date.now();
    const current = effectiveClocks(now);
    if (current[color] <= 0) {
      clocks[color] = 0;
      finish({
        type: 'timeout',
        winner: opposite(color),
        message: `Время вышло. Победили ${opposite(color) === 'w' ? 'белые' : 'чёрные'}.`,
      });
      return;
    }

    commitCurrentClock(now);

    try {
      const move = chess.move({
        from: payload.from,
        to: payload.to,
        promotion: payload.promotion || 'q',
      });

      if (!move) {
        turnStartedAt = now;
        emitError(socketId, 'Недопустимый ход.');
        return;
      }

      lastMove = { from: move.from, to: move.to, san: move.san };
      turnStartedAt = Date.now();

      const ended = gameOverResult();
      if (ended) {
        finish(ended);
      } else {
        emitState();
      }
    } catch {
      turnStartedAt = now;
      emitError(socketId, 'Недопустимый ход.');
      emitState();
    }
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const color = colorForSocket(socketId);
    if (!color) return;
    const winner = opposite(color);
    finish({
      type: 'resign',
      winner,
      message: `${color === 'w' ? 'Белые' : 'Чёрные'} сдались. Победа ${winner === 'w' ? 'белых' : 'чёрных'}.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'move') handleMove(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const color = colorForSocket(socketId);
    if (!color) return;
    const winner = opposite(color);
    finish({
      type: 'disconnect',
      winner,
      message: 'Соперник отключился. Матч завершён.',
    });
  }

  const interval = setInterval(() => {
    if (status !== 'playing') return;
    const turn = chess.turn();
    const current = effectiveClocks();
    if (current[turn] <= 0) {
      clocks[turn] = 0;
      finish({
        type: 'timeout',
        winner: opposite(turn),
        message: `Время вышло. Победили ${opposite(turn) === 'w' ? 'белые' : 'чёрные'}.`,
      });
      return;
    }
    emitState();
  }, TICK_MS);

  return {
    id: roomId,
    gameId: 'chess',
    playerSocketIds: [byColor.w.socketId, byColor.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(interval);
    },
  };
}
