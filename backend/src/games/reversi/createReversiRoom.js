import { canUseChessAdmin } from '../chess/chessAdminAccess.js';

const SIZE = 8;
// Two seconds each for rope, plus, stick and equation; sound follows.
// The first 4.6s of sound is only a fallback when no custom M4A exists.
const SPECIAL_INTRO_MS = 8000;
const SPECIAL_FALLBACK_SOUND_MS = 4600;
const SPECIAL_TOTAL_FALLBACK_MS = SPECIAL_INTRO_MS + SPECIAL_FALLBACK_SOUND_MS;
const SPECIAL_MAX_SOUND_MS = 180000;
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
  const adminUnlocked = new Set();
  let specialEvent = null;
  let specialTimer = null;

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
      legalMoves: status === 'playing' && !specialEvent ? legalMovesFor(board, turn) : [],
      scores: countPieces(board),
      status,
      result,
      lastMove,
      skipped,
      moveNumber,
      specialEvent: specialEvent ? { ...specialEvent, elapsedMs: Math.min(specialEvent.totalMs, Date.now() - specialEvent.startedAt) } : null,
      adminEnabled: adminUnlocked.has(socketId) && canUseChessAdmin(io, socketId),
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
    if (specialTimer) clearTimeout(specialTimer);
    specialTimer = null;
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
    if (status !== 'playing' || specialEvent) return;
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
    if (status !== 'playing' || specialEvent) return;
    const color = colorFor(socketId);
    if (!color) return;
    finish({
      type: 'resign', winner: opposite(color),
      message: `${byColor[color].name} сдался.`,
    });
  }

  function unlockAdmin(socketId) {
    if (!colorFor(socketId) || !canUseChessAdmin(io, socketId)) {
      adminUnlocked.delete(socketId);
      emitError(socketId, 'Секретная панель доступна только аккаунту DanyaTest1.');
      return;
    }
    adminUnlocked.add(socketId);
    emitState();
  }

  function finishNoose() {
    if (status !== 'playing' || specialEvent?.type !== 'noose') return;
    const color = specialEvent.winner;
    const loser = opposite(color);
    finish({
      type: 'noose',
      winner: color,
      message: `Все шашки ${byColor[loser].name} пытали, и они не выдержали пытку, потому что пытка очень хорошая.`,
    });
  }

  function scheduleNooseFinish() {
    if (specialTimer) clearTimeout(specialTimer);
    if (!specialEvent || status !== 'playing') return;
    const remaining = Math.max(0, specialEvent.startedAt + specialEvent.totalMs - Date.now());
    specialTimer = setTimeout(finishNoose, remaining);
    specialTimer.unref?.();
  }

  function launchNoose(socketId) {
    if (status !== 'playing' || specialEvent) return;
    const color = colorFor(socketId);
    // Only the authenticated, unlocked administrator can start this scene.
    if (!color || !adminUnlocked.has(socketId) || !canUseChessAdmin(io, socketId)) {
      emitError(socketId, 'Нет прав на секретное действие.');
      return;
    }
    specialEvent = {
      id: `${roomId}:noose:${Date.now()}`,
      type: 'noose',
      startedAt: Date.now(),
      winner: color,
      totalMs: SPECIAL_TOTAL_FALLBACK_MS,
    };
    emitState();
    scheduleNooseFinish();
  }

  function updateNooseDuration(socketId, payload = {}) {
    if (status !== 'playing' || specialEvent?.type !== 'noose') return;
    if (!adminUnlocked.has(socketId) || !canUseChessAdmin(io, socketId)) return;
    if (specialEvent.winner !== colorFor(socketId)) return;
    if (payload.eventId !== specialEvent.id) return;
    const requested = Number(payload.durationMs);
    if (!Number.isFinite(requested) || requested < 1000 || requested > SPECIAL_MAX_SOUND_MS) return;
    const newTotalMs = SPECIAL_INTRO_MS + Math.ceil(requested) + 300;
    // Only accept one update: avoids repeated requests disrupting the countdown.
    if (specialEvent.audioDurationSet) return;
    specialEvent.audioDurationSet = true;
    specialEvent.totalMs = newTotalMs;
    scheduleNooseFinish();
    emitState();
  }

  function handleAction(socketId, action = {}) {
    if (action?.type === 'place') handlePlace(socketId, action.payload);
    if (action?.type === 'resign') handleResign(socketId);
    if (action?.type === 'admin:unlock') unlockAdmin(socketId);
    if (action?.type === 'admin:noose') launchNoose(socketId);
    if (action?.type === 'admin:noose:duration') updateNooseDuration(socketId, action.payload);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing' || specialEvent) return;
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
    destroy() { if (specialTimer) clearTimeout(specialTimer); adminUnlocked.clear(); },
  };
}
