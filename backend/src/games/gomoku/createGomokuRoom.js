const BOARD_SIZE = 10;
const WIN_LENGTH = 5;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

function safePlayerName(name) {
  if (typeof name !== 'string') return 'Игрок';
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 28) : 'Игрок';
}

function opposite(color) {
  return color === 'black' ? 'white' : 'black';
}

function rowOf(cell) {
  return Math.floor(cell / BOARD_SIZE);
}

function colOf(cell) {
  return cell % BOARD_SIZE;
}

function cellAt(row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return -1;
  return row * BOARD_SIZE + col;
}

function winningLine(board, cell, color) {
  const row = rowOf(cell);
  const col = colOf(cell);
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    const line = [cell];

    for (const sign of [-1, 1]) {
      let step = 1;
      while (true) {
        const next = cellAt(row + dr * step * sign, col + dc * step * sign);
        if (next < 0 || board[next] !== color) break;
        if (sign < 0) line.unshift(next);
        else line.push(next);
        step += 1;
      }
    }

    if (line.length >= WIN_LENGTH) return line;
  }

  return null;
}

export function createGomokuRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const byColor = {
    black: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    white: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  const board = Array(CELL_COUNT).fill(null);
  let turn = 'black';
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let moveNumber = 0;
  let finishedOnce = false;

  function colorForSocket(socketId) {
    if (byColor.black.socketId === socketId) return 'black';
    if (byColor.white.socketId === socketId) return 'white';
    return null;
  }

  function snapshotFor(socketId) {
    return {
      gameId: 'gomoku',
      roomId,
      boardSize: BOARD_SIZE,
      winLength: WIN_LENGTH,
      board: [...board],
      playerColor: colorForSocket(socketId),
      players: {
        black: { name: byColor.black.name },
        white: { name: byColor.white.name },
      },
      turn,
      status,
      result,
      lastMove,
      moveNumber,
    };
  }

  function emitState() {
    for (const color of ['black', 'white']) {
      const player = byColor[color];
      io.to(player.socketId).emit('game:state', snapshotFor(player.socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', {
      gameId: 'gomoku',
      roomId,
      message,
    });
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

  function handlePlace(socketId, payload = {}) {
    if (status !== 'playing') return;

    const color = colorForSocket(socketId);
    if (!color) return;
    if (turn !== color) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }

    const cell = Number(payload.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) {
      emitError(socketId, 'Выберите клетку на поле.');
      return;
    }

    if (board[cell] !== null) {
      emitError(socketId, 'Эта клетка уже занята.');
      return;
    }

    board[cell] = color;
    moveNumber += 1;
    lastMove = { cell, color, moveNumber };

    const line = winningLine(board, cell, color);
    if (line) {
      finish({
        type: 'win',
        winner: color,
        line,
        message: `${color === 'black' ? 'Чёрные' : 'Белые'} собрали пять в ряд.`,
      });
      return;
    }

    if (moveNumber >= CELL_COUNT) {
      finish({
        type: 'draw',
        winner: null,
        line: [],
        message: 'Поле заполнено — ничья.',
      });
      return;
    }

    turn = opposite(turn);
    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const color = colorForSocket(socketId);
    if (!color) return;

    finish({
      type: 'resign',
      winner: opposite(color),
      line: [],
      message: `${color === 'black' ? 'Чёрные' : 'Белые'} сдались.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'place') handlePlace(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const color = colorForSocket(socketId);
    if (!color) return;

    finish({
      type: 'disconnect',
      winner: opposite(color),
      line: [],
      message: 'Один из игроков отключился.',
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
