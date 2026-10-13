const COLS = 7;
const ROWS = 6;
const TARGET = 4;

function cleanName(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 28) : 'Игрок';
}

function other(color) {
  return color === 'red' ? 'yellow' : 'red';
}

function findLine(board, row, col, color) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    const line = [row * COLS + col];
    for (const sign of [-1, 1]) {
      for (let step = 1; step < TARGET; step++) {
        const r = row + dr * step * sign;
        const c = col + dc * step * sign;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r * COLS + c] !== color) break;
        if (sign === -1) line.unshift(r * COLS + c);
        else line.push(r * COLS + c);
      }
    }
    if (line.length >= TARGET) return line;
  }
  return null;
}

export function createConnectFourRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? [...players] : [...players].reverse();
  const participants = {
    red: { socketId: shuffled[0].socketId, name: cleanName(shuffled[0].name) },
    yellow: { socketId: shuffled[1].socketId, name: cleanName(shuffled[1].name) },
  };
  const board = Array(ROWS * COLS).fill(null);
  const heights = Array(COLS).fill(0);
  let turn = Math.random() < 0.5 ? 'red' : 'yellow';
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let moveCount = 0;
  let reported = false;

  function playerColor(socketId) {
    if (participants.red.socketId === socketId) return 'red';
    if (participants.yellow.socketId === socketId) return 'yellow';
    return null;
  }

  function snapshot(socketId) {
    return {
      gameId: 'connect-four',
      roomId,
      rows: ROWS,
      cols: COLS,
      board: [...board],
      heights: [...heights],
      playerColor: playerColor(socketId),
      players: {
        red: { name: participants.red.name },
        yellow: { name: participants.yellow.name },
      },
      turn,
      status,
      result,
      lastMove,
      moveCount,
    };
  }

  function emitState() {
    for (const color of ['red', 'yellow']) {
      const person = participants[color];
      io.to(person.socketId).emit('game:state', snapshot(person.socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: 'connect-four', roomId, message });
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    emitState();
    if (!reported) {
      reported = true;
      onFinish?.({ roomId, players: Object.values(participants) });
    }
  }

  function drop(socketId, payload) {
    if (status !== 'playing') return;
    const color = playerColor(socketId);
    if (!color) return;
    if (color !== turn) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }
    const col = payload?.col;
    if (!Number.isInteger(col) || col < 0 || col >= COLS) {
      emitError(socketId, 'Выбери один из семи столбцов.');
      return;
    }
    if (heights[col] >= ROWS) {
      emitError(socketId, 'Этот столбец уже заполнен.');
      return;
    }

    const row = ROWS - 1 - heights[col];
    const cell = row * COLS + col;
    board[cell] = color;
    heights[col] += 1;
    moveCount += 1;
    lastMove = { row, col, cell, color, moveNumber: moveCount };

    const line = findLine(board, row, col, color);
    if (line) {
      finish({
        type: 'win',
        winner: color,
        line,
        message: `${color === 'red' ? 'Красные' : 'Жёлтые'} собрали четыре фишки подряд!`,
      });
      return;
    }
    if (moveCount >= ROWS * COLS) {
      finish({ type: 'draw', winner: null, line: [], message: 'Все клетки заполнены. Ничья!' });
      return;
    }
    turn = other(color);
    emitState();
  }

  function resign(socketId) {
    if (status !== 'playing') return;
    const color = playerColor(socketId);
    if (!color) return;
    finish({ type: 'resign', winner: other(color), line: [], message: 'Один из игроков сдался.' });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'drop') drop(socketId, action.payload);
    else if (action.type === 'resign') resign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const color = playerColor(socketId);
    if (!color) return;
    finish({ type: 'disconnect', winner: other(color), line: [], message: 'Соперник отключился.' });
  }

  return {
    playerSocketIds: [participants.red.socketId, participants.yellow.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {},
  };
}
