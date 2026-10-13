const SIZE = 8;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],            [0, 1],
  [1, -1],  [1, 0],   [1, 1],
];

function opposite(color) {
  return color === 'black' ? 'white' : 'black';
}

function safeName(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 28)
    : 'Игрок';
}

function at(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE
    ? row * SIZE + col : -1;
}

export function initialBoard() {
  const board = Array(SIZE * SIZE).fill(null);
  board[at(3, 3)] = 'white';
  board[at(3, 4)] = 'black';
  board[at(4, 3)] = 'black';
  board[at(4, 4)] = 'white';
  return board;
}

// Every move must enclose one or more enemy pieces between the placed piece
// and an existing piece of the player's color.
export function flipsFor(board, cell, color) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 64 || board[cell] !== null) return [];
  if (color !== 'black' && color !== 'white') return [];

  const row = Math.floor(cell / SIZE);
  const col = cell % SIZE;
  const enemy = opposite(color);
  const captured = [];

  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;

    while (at(r, c) !== -1 && board[at(r, c)] === enemy) {
      line.push(at(r, c));
      r += dr;
      c += dc;
    }

    if (line.length > 0 && at(r, c) !== -1 && board[at(r, c)] === color) {
      captured.push(...line);
    }
  }

  return captured;
}

export function legalMovesFor(board, color) {
  const moves = [];
  for (let cell = 0; cell < 64; cell += 1) {
    if (board[cell] === null && flipsFor(board, cell, color).length > 0) {
      moves.push(cell);
    }
  }
  return moves;
}

function countPieces(board) {
  return board.reduce((counts, piece) => {
    if (piece === 'black') counts.black += 1;
    if (piece === 'white') counts.white += 1;
    return counts;
  }, { black: 0, white: 0 });
}

export function createReversiRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? [...players] : [...players].reverse();
  const byColor = {
    black: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    white: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };

  const board = initialBoard();
  let turn = 'black';
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let skipped = null;
  let moveNumber = 0;
  let finishedOnce = false;

  function colorFor(socketId) {
    if (byColor.black.socketId === socketId) return 'black';
    if (byColor.white.socketId === socketId) return 'white';
    return null;
  }

  function snapshot(socketId) {
    return {
      gameId: 'reversi',
      roomId,
      board: [...board],
      playerColor: colorFor(socketId),
      players: {
        black: { name: byColor.black.name },
        white: { name: byColor.white.name },
      },
      turn,
      legalMoves: status === 'playing' ? legalMovesFor(board, turn) : [],
      scores: countPieces(board),
      status,
      result,
      lastMove,
      skipped,
      moveNumber,
    };
  }

  function emitState() {
    for (const color of ['black', 'white']) {
      const socketId = byColor[color].socketId;
      io.to(socketId).emit('game:state', snapshot(socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: 'reversi', roomId, message });
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(byColor) });
    }
  }

  function endByScore() {
    const scores = countPieces(board);
    const winner = scores.black === scores.white
      ? null : scores.black > scores.white ? 'black' : 'white';
    finish({
      type: 'score',
      winner,
      scores,
      message: winner ? `Победа по фишкам: ${scores.black} : ${scores.white}`
        : `Ничья: ${scores.black} : ${scores.white}`,
    });
  }

  function handlePlace(socketId, payload = {}) {
    if (status !== 'playing') return;
    const color = colorFor(socketId);
    if (!color) return;
    if (color !== turn) return emitError(socketId, 'Сейчас ход соперника.');

    const cell = payload?.cell;
    const flips = flipsFor(board, cell, color);
    if (!flips.length) return emitError(socketId, 'На этой клетке нельзя поставить фишку.');

    board[cell] = color;
    for (const target of flips) board[target] = color;
    moveNumber += 1;
    lastMove = { cell, color, flipped: flips, moveNumber };
    skipped = null;

    const other = opposite(color);
    if (legalMovesFor(board, other).length) {
      turn = other;
      emitState();
      return;
    }

    // No legal moves: a player passes automatically. If neither can play,
    // the game is over even when some empty squares remain.
    if (legalMovesFor(board, color).length) {
      turn = color;
      skipped = other;
      emitState();
      return;
    }

    endByScore();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const color = colorFor(socketId);
    if (!color) return;
    finish({
      type: 'resign', winner: opposite(color),
      message: `${byColor[color].name} сдался.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action?.type === 'place') handlePlace(socketId, action.payload);
    if (action?.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const color = colorFor(socketId);
    if (!color) return;
    finish({
      type: 'disconnect', winner: opposite(color),
      message: 'Соперник отключился от матча.',
    });
  }

  return {
    playerSocketIds: [byColor.black.socketId, byColor.white.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {},
  };
}
