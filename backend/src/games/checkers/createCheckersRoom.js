const START_TIME_MS = 10 * 60 * 1000;
const TICK_MS = 500;
const DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function squareName(row, col) {
  return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function squareToCoords(square) {
  if (typeof square !== 'string' || !/^[a-h][1-8]$/.test(square)) return null;
  return {
    row: 8 - Number(square[1]),
    col: square.charCodeAt(0) - 97,
  };
}

function createInitialBoard() {
  return Array.from({ length: 8 }, (_, row) => (
    Array.from({ length: 8 }, (_, col) => {
      if ((row + col) % 2 === 0) return null;
      if (row <= 2) return { color: 'b', king: false };
      if (row >= 5) return { color: 'w', king: false };
      return null;
    })
  ));
}

function pieceSnapshot(piece, row, col) {
  if (!piece) return null;
  return {
    color: piece.color,
    king: piece.king,
    square: squareName(row, col),
  };
}

function boardSnapshot(board) {
  return board.map((row, rowIndex) => (
    row.map((piece, colIndex) => pieceSnapshot(piece, rowIndex, colIndex))
  ));
}

function manCaptureMoves(board, row, col, piece, alreadyCaptured = new Set()) {
  const moves = [];

  for (const [dr, dc] of DIRECTIONS) {
    const enemyRow = row + dr;
    const enemyCol = col + dc;
    const landRow = row + dr * 2;
    const landCol = col + dc * 2;

    if (!inBounds(landRow, landCol) || !inBounds(enemyRow, enemyCol)) continue;

    const enemy = board[enemyRow][enemyCol];
    const enemySquare = squareName(enemyRow, enemyCol);
    if (enemy && enemy.color !== piece.color && !alreadyCaptured.has(enemySquare) && !board[landRow][landCol]) {
      moves.push({
        from: squareName(row, col),
        to: squareName(landRow, landCol),
        capture: squareName(enemyRow, enemyCol),
      });
    }
  }

  return moves;
}

function kingCaptureMoves(board, row, col, piece, alreadyCaptured = new Set()) {
  const moves = [];

  for (const [dr, dc] of DIRECTIONS) {
    let scanRow = row + dr;
    let scanCol = col + dc;
    let captured = null;

    while (inBounds(scanRow, scanCol)) {
      const target = board[scanRow][scanCol];

      if (!captured) {
        if (!target) {
          scanRow += dr;
          scanCol += dc;
          continue;
        }

        if (target.color === piece.color || alreadyCaptured.has(squareName(scanRow, scanCol))) break;
        captured = { row: scanRow, col: scanCol };
        scanRow += dr;
        scanCol += dc;
        continue;
      }

      if (target) break;

      moves.push({
        from: squareName(row, col),
        to: squareName(scanRow, scanCol),
        capture: squareName(captured.row, captured.col),
      });

      scanRow += dr;
      scanCol += dc;
    }
  }

  return moves;
}

function captureMovesFrom(board, row, col, alreadyCaptured = new Set()) {
  const piece = board[row]?.[col];
  if (!piece) return [];
  return piece.king
    ? kingCaptureMoves(board, row, col, piece, alreadyCaptured)
    : manCaptureMoves(board, row, col, piece, alreadyCaptured);
}

function simpleMovesFrom(board, row, col) {
  const piece = board[row]?.[col];
  if (!piece) return [];
  const moves = [];

  if (piece.king) {
    for (const [dr, dc] of DIRECTIONS) {
      let nextRow = row + dr;
      let nextCol = col + dc;

      while (inBounds(nextRow, nextCol) && !board[nextRow][nextCol]) {
        moves.push({
          from: squareName(row, col),
          to: squareName(nextRow, nextCol),
          capture: null,
        });
        nextRow += dr;
        nextCol += dc;
      }
    }
    return moves;
  }

  const forward = piece.color === 'w' ? -1 : 1;
  for (const dc of [-1, 1]) {
    const nextRow = row + forward;
    const nextCol = col + dc;
    if (inBounds(nextRow, nextCol) && !board[nextRow][nextCol]) {
      moves.push({
        from: squareName(row, col),
        to: squareName(nextRow, nextCol),
        capture: null,
      });
    }
  }

  return moves;
}

function allMovesFor(board, color, forcedFrom = null, alreadyCaptured = new Set()) {
  if (forcedFrom) {
    const coords = squareToCoords(forcedFrom);
    if (!coords) return [];
    const piece = board[coords.row]?.[coords.col];
    if (!piece || piece.color !== color) return [];
    return captureMovesFrom(board, coords.row, coords.col, alreadyCaptured);
  }

  const captures = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (board[row][col]?.color === color) {
        captures.push(...captureMovesFrom(board, row, col, alreadyCaptured));
      }
    }
  }

  if (captures.length > 0) return captures;

  const simple = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (board[row][col]?.color === color) {
        simple.push(...simpleMovesFrom(board, row, col));
      }
    }
  }

  return simple;
}

function pieceCount(board, color) {
  let total = 0;
  for (const row of board) {
    for (const piece of row) {
      if (piece?.color === color) total += 1;
    }
  }
  return total;
}

export function createCheckersRoom({ roomId, players, io, onFinish }) {
  const board = createInitialBoard();
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const byColor = {
    w: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  let turn = 'w';
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let forcedFrom = null;
  const capturedThisTurn = new Set();
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
      snapshot[turn] = Math.max(0, snapshot[turn] - (now - turnStartedAt));
    }
    return snapshot;
  }

  function commitCurrentClock(now = Date.now()) {
    if (status !== 'playing') return;
    clocks[turn] = Math.max(0, clocks[turn] - (now - turnStartedAt));
    turnStartedAt = now;
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    commitCurrentClock();
    status = 'finished';
    result = nextResult;
    forcedFrom = null;
    capturedThisTurn.clear();
    clearInterval(interval);
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(byColor) });
    }
  }

  function maybeFinishBecauseNoMoves(colorToMove) {
    const opponent = colorToMove;
    if (pieceCount(board, opponent) === 0 || allMovesFor(board, opponent).length === 0) {
      const winner = opposite(opponent);
      finish({
        type: 'no-moves',
        winner,
        message: `${opponent === 'w' ? 'Белые' : 'Чёрные'} больше не могут ходить.`,
      });
      return true;
    }
    return false;
  }

  function snapshotFor(socketId) {
    const playerColor = colorForSocket(socketId);
    return {
      gameId: 'checkers',
      roomId,
      playerColor,
      players: {
        w: { name: byColor.w.name },
        b: { name: byColor.b.name },
      },
      board: boardSnapshot(board),
      turn,
      clocks: effectiveClocks(),
      status,
      result,
      lastMove,
      forcedFrom,
      pendingCaptured: [...capturedThisTurn],
      legalMoves: status === 'playing' ? allMovesFor(board, turn, forcedFrom, capturedThisTurn) : [],
    };
  }

  function emitState() {
    for (const color of ['w', 'b']) {
      const player = byColor[color];
      io.to(player.socketId).emit('game:state', snapshotFor(player.socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: 'checkers', roomId, message });
  }

  function handleMove(socketId, payload = {}) {
    if (status !== 'playing') return;

    const color = colorForSocket(socketId);
    if (!color) return;
    if (turn !== color) {
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
        message: 'Время вышло.',
      });
      return;
    }

    const legalMoves = allMovesFor(board, turn, forcedFrom, capturedThisTurn);
    const legalMove = legalMoves.find((move) => move.from === payload.from && move.to === payload.to);
    if (!legalMove) {
      emitError(socketId, 'Так ходить нельзя. Если есть взятие, рубить обязательно.');
      return;
    }

    const from = squareToCoords(legalMove.from);
    const to = squareToCoords(legalMove.to);
    const captured = legalMove.capture ? squareToCoords(legalMove.capture) : null;
    if (!from || !to) return;

    commitCurrentClock(now);

    const piece = board[from.row][from.col];
    board[from.row][from.col] = null;
    if (captured) capturedThisTurn.add(legalMove.capture);

    const becameKing = !piece.king && (
      (piece.color === 'w' && to.row === 0) ||
      (piece.color === 'b' && to.row === 7)
    );

    const movedPiece = {
      color: piece.color,
      king: piece.king || becameKing,
    };
    board[to.row][to.col] = movedPiece;

    lastMove = {
      from: legalMove.from,
      to: legalMove.to,
      capture: legalMove.capture,
      becameKing,
    };

    if (captured) {
      const continuation = captureMovesFrom(board, to.row, to.col, capturedThisTurn);
      if (continuation.length > 0) {
        forcedFrom = legalMove.to;
        turnStartedAt = Date.now();
        emitState();
        return;
      }
    }

    for (const capturedSquare of capturedThisTurn) {
      const coords = squareToCoords(capturedSquare);
      if (coords) board[coords.row][coords.col] = null;
    }
    capturedThisTurn.clear();
    forcedFrom = null;
    turn = opposite(turn);
    turnStartedAt = Date.now();

    if (!maybeFinishBecauseNoMoves(turn)) emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const color = colorForSocket(socketId);
    if (!color) return;
    finish({
      type: 'resign',
      winner: opposite(color),
      message: `${color === 'w' ? 'Белые' : 'Чёрные'} сдались.`,
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
    finish({
      type: 'disconnect',
      winner: opposite(color),
      message: 'Соперник отключился от игры.',
    });
  }

  const interval = setInterval(() => {
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
  }, TICK_MS);

  return {
    id: roomId,
    gameId: 'checkers',
    playerSocketIds: [byColor.w.socketId, byColor.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(interval);
    },
  };
}
