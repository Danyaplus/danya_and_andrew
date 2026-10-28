import { Chess } from 'chess.js';
import { canUseChessAdmin } from './chessAdminAccess.js';

const START_TIME_MS = 10 * 60 * 1000;
const TICK_MS = 500;
const SECRET_SPIN_MS = 3200;
const SECRET_RESULT_MS = 2600;
const AIRSTRIKE_APPROACH_MS = 7600;
const AIRSTRIKE_RESULT_MS = 2800;
const NUCLEAR_APPROACH_MS = 3500;
const NUCLEAR_FIRE_MS = 4000;
const GUN_WARNING_MS = 1200;
const GUN_FIRE_MS = 2600;

const SECRET_OUTCOMES = [
  { type: 'n', key: 'knights', label: 'ДВА КОНЯ', speech: 'двух коней', icon: '🐴' },
  { type: 'r', key: 'rooks', label: 'ДВЕ ЛАДЬИ', speech: 'две ладьи', icon: '🏰' },
  { type: 'b', key: 'bishops', label: 'ДВА СЛОНА', speech: 'двух слонов', icon: '♝' },
  { type: 'p', key: 'pawns', label: 'ДВЕ ПЕШКИ', speech: 'две пешки', icon: '♟' },
];

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

function squaresForPiece(chess, color, type) {
  const squares = [];
  const board = chess.board();

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.color !== color || piece.type !== type) continue;

      const file = String.fromCharCode(97 + col);
      const rank = 8 - row;
      squares.push(`${file}${rank}`);
    }
  }

  return squares;
}

function squareCoords(square) {
  return {
    file: square.charCodeAt(0) - 97,
    rank: Number(square[1]),
  };
}

function squareFromCoords(file, rank) {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${String.fromCharCode(97 + file)}${rank}`;
}

function blastSquares(centerSquare) {
  const { file, rank } = squareCoords(centerSquare);
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  return offsets
    .map(([df, dr]) => squareFromCoords(file + df, rank + dr))
    .filter(Boolean);
}

function allBoardSquares() {
  const squares = [];
  for (let rank = 1; rank <= 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      squares.push(squareFromCoords(file, rank));
    }
  }
  return squares;
}

function piecesForColor(chess, color, { excludeKing = false } = {}) {
  const pieces = [];
  const board = chess.board();

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece || piece.color !== color) continue;
      if (excludeKing && piece.type === 'k') continue;

      pieces.push({
        type: piece.type,
        color: piece.color,
        square: `${String.fromCharCode(97 + col)}${8 - row}`,
      });
    }
  }

  return pieces;
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function airstrikeImpacts(chess, targetColor) {
  const kingSquares = new Set([
    ...piecesForColor(chess, 'w').filter((piece) => piece.type === 'k').map((piece) => piece.square),
    ...piecesForColor(chess, 'b').filter((piece) => piece.type === 'k').map((piece) => piece.square),
  ]);

  const targetRanks = targetColor === 'w'
    ? new Set([1, 2, 3, 4])
    : new Set([5, 6, 7, 8]);

  const safeCenter = (square) => (
    targetRanks.has(Number(square[1])) &&
    !blastSquares(square).some((blastSquare) => kingSquares.has(blastSquare))
  );

  // Prefer centres that guarantee at least one enemy piece in the blast.
  const preferred = shuffle(
    piecesForColor(chess, targetColor, { excludeKing: true })
      .map((piece) => piece.square)
      .filter(safeCenter),
  );

  const fallback = shuffle(allBoardSquares().filter(safeCenter));
  const candidates = [...new Set([...preferred, ...fallback])];

  if (!candidates.length) return [];

  const first = candidates[0];
  const firstCoords = squareCoords(first);

  const second = candidates.find((square) => {
    if (square === first) return false;
    const coords = squareCoords(square);
    return Math.abs(coords.file - firstCoords.file) + Math.abs(coords.rank - firstCoords.rank) >= 3;
  }) || candidates.find((square) => square !== first) || first;

  return [first, second].map((centerSquare, index) => ({
    id: `impact-${index + 1}`,
    centerSquare,
    affectedSquares: blastSquares(centerSquare),
  }));
}

function shuffledTwo(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy.slice(0, 2);
}

function assignFireTargets(chess, actorColor) {
  const shooters = shuffle(piecesForColor(chess, actorColor));
  const targets = shuffle(piecesForColor(chess, opposite(actorColor)));
  if (!shooters.length || !targets.length) return [];

  return targets.map((target, index) => ({
    id: `shot-${index + 1}`,
    attackerSquare: shooters[index % shooters.length].square,
    targetSquare: target.square,
    targetType: target.type,
    targetColor: target.color,
    delay: 180 + Math.floor(Math.random() * 280) + index * 140,
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
  let pausedAt = null;
  const clocks = { w: START_TIME_MS, b: START_TIME_MS };
  const adminUnlocked = new Set();
  let secretEvent = null;
  let secretLocked = false;
  let secretResolveTimer = null;
  let secretClearTimer = null;

  function colorForSocket(socketId) {
    if (byColor.w.socketId === socketId) return 'w';
    if (byColor.b.socketId === socketId) return 'b';
    return null;
  }

  function effectiveClocks(now = Date.now()) {
    const snapshot = { ...clocks };
    if (status === 'playing' && !secretLocked) {
      const turn = chess.turn();
      const clockNow = pausedAt === null ? now : pausedAt;
      snapshot[turn] = Math.max(0, snapshot[turn] - (clockNow - turnStartedAt));
    }
    return snapshot;
  }

  function commitCurrentClock(now = Date.now()) {
    if (status !== 'playing' || secretLocked) return;
    const turn = chess.turn();
    clocks[turn] = Math.max(0, clocks[turn] - (now - turnStartedAt));
    turnStartedAt = now;
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    commitCurrentClock();
    status = 'finished';
    result = nextResult;
    secretLocked = false;
    if (secretResolveTimer) clearTimeout(secretResolveTimer);
    if (secretClearTimer) clearTimeout(secretClearTimer);
    secretResolveTimer = null;
    secretClearTimer = null;
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
      serverTime: now,
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
      eventLocked: secretLocked,
      chessEvent: secretEvent
        ? {
          ...secretEvent,
          eventType: secretEvent.eventType || secretEvent.type,
          visualType: secretEvent.visualType || secretEvent.type,
          visualVersion: 2,
        }
        : null,
      legalMoves: status === 'playing' && !secretLocked
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

  function unlockAdmin(socketId) {
    if (!colorForSocket(socketId) || !canUseChessAdmin(io, socketId)) {
      adminUnlocked.delete(socketId);
      emitError(socketId, 'Админ-панель доступна только аккаунту DanyaTest1.');
      return;
    }
    adminUnlocked.add(socketId);
  }

  function adminIsAuthorized(socketId) {
    // Recheck on every action: logout or changing account revokes access.
    return Boolean(colorForSocket(socketId)) &&
      adminUnlocked.has(socketId) && canUseChessAdmin(io, socketId);
  }

  function resolveSecretRoulette(eventId) {
    if (!secretEvent || secretEvent.id !== eventId || status !== 'playing') return;

    const { targetColor, outcome } = secretEvent;
    const removedPieces = [];

    if (outcome.type === 'clock') {
      clocks[targetColor] = Math.max(0, effectiveClocks()[targetColor] - 60_000);
    } else {
      const squares = squaresForPiece(chess, targetColor, outcome.type);
      const selectedSquares = shuffledTwo(squares);

      for (const square of selectedSquares) {
        const piece = chess.remove(square);
        if (piece) {
          removedPieces.push({
            square,
            type: piece.type,
            color: piece.color,
          });
        }
      }
    }

    secretLocked = false;
    turnStartedAt = Date.now();
    secretEvent = {
      ...secretEvent,
      phase: 'resolved',
      resolvedAt: Date.now(),
      removedPieces,
    };

    emitState();

    secretClearTimer = setTimeout(() => {
      if (secretEvent?.id !== eventId || status !== 'playing') return;
      secretEvent = null;
      emitState();
    }, SECRET_RESULT_MS);
    secretClearTimer.unref?.();
  }

  function startSecretRoulette(socketId) {
    if (status !== 'playing') return;

    if (!adminIsAuthorized(socketId)) {
      emitError(socketId, 'Секретный режим не активирован.');
      return;
    }

    if (secretLocked || secretEvent) {
      emitError(socketId, 'Шоу уже идёт.');
      return;
    }

    const actorColor = colorForSocket(socketId);
    if (!actorColor) return;

    const targetColor = opposite(actorColor);
    const available = SECRET_OUTCOMES.filter((outcome) => (
      squaresForPiece(chess, targetColor, outcome.type).length >= 2
    ));

    const outcome = available.length
      ? available[Math.floor(Math.random() * available.length)]
      : {
        type: 'clock',
        key: 'clock',
        label: 'МИНУС МИНУТА',
        speech: 'одну минуту времени',
        icon: '⏱️',
      };

    const now = Date.now();
    commitCurrentClock(now);
    secretLocked = true;

    secretEvent = {
      id: `secret-${now}-${Math.floor(Math.random() * 10000)}`,
      type: 'host-roulette',
      eventType: 'host-roulette',
      visualType: 'host-roulette',
      visualVersion: 2,
      phase: 'spinning',
      actorColor,
      targetColor,
      outcome,
      startedAt: now,
      resolveAt: now + SECRET_SPIN_MS,
      removedPieces: [],
    };

    emitState();

    secretResolveTimer = setTimeout(() => {
      secretResolveTimer = null;
      resolveSecretRoulette(secretEvent?.id);
    }, SECRET_SPIN_MS);
    secretResolveTimer.unref?.();
  }

  function resolveAirstrike(eventId) {
    if (!secretEvent || secretEvent.id !== eventId || status !== 'playing') return;

    const affected = new Set(
      (secretEvent.impacts || []).flatMap((impact) => impact.affectedSquares || []),
    );

    const removedPieces = [];

    for (const square of affected) {
      const piece = chess.get(square);
      if (!piece || piece.type === 'k') continue;

      const removed = chess.remove(square);
      if (removed) {
        removedPieces.push({
          square,
          type: removed.type,
          color: removed.color,
        });
      }
    }

    secretLocked = false;
    turnStartedAt = Date.now();
    secretEvent = {
      ...secretEvent,
      phase: 'resolved',
      resolvedAt: Date.now(),
      removedPieces,
    };

    emitState();

    secretClearTimer = setTimeout(() => {
      if (secretEvent?.id !== eventId || status !== 'playing') return;
      secretEvent = null;
      emitState();
    }, AIRSTRIKE_RESULT_MS);
    secretClearTimer.unref?.();
  }

  function startAirstrike(socketId) {
    if (status !== 'playing') return;

    if (!adminIsAuthorized(socketId)) {
      emitError(socketId, 'Секретный режим не активирован.');
      return;
    }

    if (secretLocked || secretEvent) {
      emitError(socketId, 'Секретное событие уже идёт.');
      return;
    }

    const actorColor = colorForSocket(socketId);
    if (!actorColor) return;

    const targetColor = opposite(actorColor);
    const impacts = airstrikeImpacts(chess, targetColor);

    if (!impacts.length) {
      emitError(socketId, 'Не удалось выбрать безопасные цели для авиаудара.');
      return;
    }

    const now = Date.now();
    commitCurrentClock(now);
    secretLocked = true;

    secretEvent = {
      id: `airstrike-${now}-${Math.floor(Math.random() * 10000)}`,
      type: 'airstrike',
      eventType: 'airstrike',
      visualType: 'airstrike',
      visualVersion: 2,
      phase: 'incoming',
      actorColor,
      targetColor,
      startedAt: now,
      resolveAt: now + AIRSTRIKE_APPROACH_MS,
      impacts,
      removedPieces: [],
    };

    emitState();

    secretResolveTimer = setTimeout(() => {
      secretResolveTimer = null;
      resolveAirstrike(secretEvent?.id);
    }, AIRSTRIKE_APPROACH_MS);
    secretResolveTimer.unref?.();
  }

  function resolveNuclear(eventId) {
    if (!secretEvent || secretEvent.id !== eventId || status !== 'playing' || !secretLocked) return;
    const actorColor = secretEvent.actorColor;
    const protectedSquare = secretEvent.protectedKingSquare;
    const removedPieces = [];

    // This is a one-off admin cinematic, not a normal chess move.
    // Never remove the launcher's king, including when it is in check.
    for (const piece of [...piecesForColor(chess, 'w'), ...piecesForColor(chess, 'b')]) {
      if (piece.type === 'k' && piece.color === actorColor && piece.square === protectedSquare) continue;
      const removed = chess.remove(piece.square);
      if (removed) removedPieces.push({ ...piece });
    }

    const event = secretEvent;
    secretEvent = {
      ...event,
      phase: 'aftermath',
      impactedAt: Date.now(),
      removedPieces,
    };
    emitState();

    secretClearTimer = setTimeout(() => {
      if (secretEvent?.id !== eventId || status !== 'playing') return;
      finish({
        type: 'nuclear',
        winner: actorColor,
        message: `Ядерный удар! Король ${byColor[actorColor].name} уцелел в противогазе. Победа!`,
      });
    }, NUCLEAR_FIRE_MS);
    secretClearTimer.unref?.();
  }

  function resolveGunfire(eventId) {
    if (!secretEvent || secretEvent.id !== eventId || status !== 'playing' || !secretLocked) return;

    const removedPieces = [];
    for (const piece of piecesForColor(chess, secretEvent.targetColor)) {
      const removed = chess.remove(piece.square);
      if (removed) removedPieces.push({ ...piece });
    }

    const event = secretEvent;
    secretEvent = {
      ...event,
      phase: 'shooting',
      firedAt: Date.now(),
      removedPieces,
    };
    emitState();

    secretClearTimer = setTimeout(() => {
      if (secretEvent?.id !== eventId || status !== 'playing') return;
      finish({
        type: 'gunfire',
        winner: event.actorColor,
        message: `Вооружённый налёт! ${byColor[event.actorColor].name} устранил все фигуры соперника.`,
      });
    }, GUN_FIRE_MS);
    secretClearTimer.unref?.();
  }

  function startGunfire(socketId) {
    if (status !== 'playing') return;
    if (!adminIsAuthorized(socketId)) {
      emitError(socketId, 'Вооружённый налёт доступен только администратору.');
      return;
    }
    if (secretLocked || secretEvent) {
      emitError(socketId, 'Другое секретное событие уже идёт.');
      return;
    }

    const actorColor = colorForSocket(socketId);
    const assignments = assignFireTargets(chess, actorColor);
    if (!assignments.length) {
      emitError(socketId, 'Не найдено целей для стрельбы.');
      return;
    }

    const now = Date.now();
    commitCurrentClock(now);
    secretLocked = true;
    secretEvent = {
      id: `gunfire-${now}-${Math.floor(Math.random() * 10000)}`,
      type: 'gunfire',
      eventType: 'gunfire',
      visualType: 'gunfire',
      visualVersion: 2,
      phase: 'warning',
      actorColor,
      targetColor: opposite(actorColor),
      startedAt: now,
      fireAt: now + GUN_WARNING_MS,
      finishAt: now + GUN_WARNING_MS + GUN_FIRE_MS,
      assignments,
      removedPieces: [],
    };
    emitState();

    const eventId = secretEvent.id;
    secretResolveTimer = setTimeout(() => {
      secretResolveTimer = null;
      resolveGunfire(eventId);
    }, GUN_WARNING_MS);
    secretResolveTimer.unref?.();
  }

  function startNuclear(socketId) {
    if (status !== 'playing') return;
    if (!adminIsAuthorized(socketId)) {
      emitError(socketId, 'Ядерный удар доступен только администратору.');
      return;
    }
    if (secretLocked || secretEvent) {
      emitError(socketId, 'Другое секретное событие уже идёт.');
      return;
    }

    const actorColor = colorForSocket(socketId);
    const protectedKingSquare = squaresForPiece(chess, actorColor, 'k')[0];
    if (!protectedKingSquare) {
      emitError(socketId, 'Не найден король для защиты.');
      return;
    }

    const now = Date.now();
    commitCurrentClock(now);
    secretLocked = true;
    secretEvent = {
      id: `nuclear-${now}-${Math.floor(Math.random() * 10000)}`,
      type: 'nuclear',
      eventType: 'nuclear',
      visualType: 'nuclear',
      phase: 'incoming',
      actorColor,
      targetColor: opposite(actorColor),
      protectedKingSquare,
      startedAt: now,
      impactAt: now + NUCLEAR_APPROACH_MS,
      finishAt: now + NUCLEAR_APPROACH_MS + NUCLEAR_FIRE_MS,
      removedPieces: [],
    };
    emitState();

    const eventId = secretEvent.id;
    secretResolveTimer = setTimeout(() => {
      secretResolveTimer = null;
      resolveNuclear(eventId);
    }, NUCLEAR_APPROACH_MS);
    secretResolveTimer.unref?.();
  }

  function handleMove(socketId, payload = {}) {
    if (status !== 'playing') return;
    if (secretLocked) {
      emitError(socketId, 'Сейчас идёт секретное шоу.');
      return;
    }
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
    if (status !== 'playing' || secretLocked) return;
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
    if (action.type === 'admin:unlock') unlockAdmin(socketId, action.payload);
    if (action.type === 'admin:roulette') startSecretRoulette(socketId);
    if (action.type === 'admin:airstrike') startAirstrike(socketId);
    if (action.type === 'admin:nuclear') startNuclear(socketId);
    if (action.type === 'admin:gunfire') startGunfire(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing' || secretLocked) return;
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
    if (status !== 'playing' || pausedAt !== null) return;
    const turn = chess.turn();
    const current = effectiveClocks();
    if (!secretLocked && current[turn] <= 0) {
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
    pause() {
      if (status === 'playing' && pausedAt === null) pausedAt = Date.now();
    },
    resume() {
      if (pausedAt === null) return;
      turnStartedAt += Date.now() - pausedAt;
      pausedAt = null;
      emitState();
    },
    destroy() {
      clearInterval(interval);
      if (secretResolveTimer) clearTimeout(secretResolveTimer);
      if (secretClearTimer) clearTimeout(secretClearTimer);
    },
  };
}
