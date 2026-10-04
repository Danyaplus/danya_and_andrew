const CHECKERS_PER_PLAYER = 15;

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const clean = value.trim().slice(0, 28);
  return clean || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function makePoints() {
  const points = Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));

  // Classic short backgammon starting position.
  const setup = [
    ['a', 23, 2], ['a', 12, 5], ['a', 7, 3], ['a', 5, 5],
    ['b', 0, 2],  ['b', 11, 5], ['b', 16, 3], ['b', 18, 5],
  ];

  for (const [owner, point, count] of setup) {
    points[point] = { owner, count };
  }

  return points;
}

function clonePosition(position) {
  return {
    points: position.points.map((point) => ({ ...point })),
    bar: { ...position.bar },
    off: { ...position.off },
  };
}

function allInHome(position, seat) {
  if (position.bar[seat] > 0) return false;

  const home = seat === 'a' ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23];
  const homeSet = new Set(home);

  for (let i = 0; i < 24; i += 1) {
    const point = position.points[i];
    if (point.owner === seat && point.count > 0 && !homeSet.has(i)) return false;
  }

  return true;
}

function destinationFor(seat, from, die) {
  if (from === 'bar') {
    return seat === 'a' ? 24 - die : die - 1;
  }

  return seat === 'a' ? from - die : from + die;
}

function canBearOffFrom(position, seat, from, die) {
  if (!allInHome(position, seat)) return false;

  if (seat === 'a') {
    const exactDistance = from + 1;
    if (die === exactDistance) return true;
    if (die < exactDistance) return false;

    // Oversized die is allowed only if there are no checkers farther away.
    for (let i = from + 1; i <= 5; i += 1) {
      const point = position.points[i];
      if (point.owner === seat && point.count > 0) return false;
    }
    return true;
  }

  const exactDistance = 24 - from;
  if (die === exactDistance) return true;
  if (die < exactDistance) return false;

  for (let i = 18; i < from; i += 1) {
    const point = position.points[i];
    if (point.owner === seat && point.count > 0) return false;
  }
  return true;
}

function rawMovesForDie(position, seat, die) {
  const moves = [];

  // Bar checkers must enter first.
  if (position.bar[seat] > 0) {
    const to = destinationFor(seat, 'bar', die);
    const target = position.points[to];
    if (!target || (target.owner && target.owner !== seat && target.count >= 2)) return [];

    moves.push({ from: 'bar', to, die });
    return moves;
  }

  for (let from = 0; from < 24; from += 1) {
    const source = position.points[from];
    if (source.owner !== seat || source.count <= 0) continue;

    const to = destinationFor(seat, from, die);
    if (to < 0 || to > 23) {
      if (canBearOffFrom(position, seat, from, die)) {
        moves.push({ from, to: 'off', die });
      }
      continue;
    }

    const target = position.points[to];
    if (target.owner && target.owner !== seat && target.count >= 2) continue;
    moves.push({ from, to, die });
  }

  return moves;
}

function applyMoveToPosition(position, seat, move) {
  const next = clonePosition(position);
  const enemy = opposite(seat);

  if (move.from === 'bar') {
    next.bar[seat] -= 1;
  } else {
    const source = next.points[move.from];
    source.count -= 1;
    if (source.count <= 0) {
      source.owner = null;
      source.count = 0;
    }
  }

  if (move.to === 'off') {
    next.off[seat] += 1;
    return next;
  }

  const target = next.points[move.to];

  if (target.owner === enemy && target.count === 1) {
    target.owner = null;
    target.count = 0;
    next.bar[enemy] += 1;
  }

  if (!target.owner) target.owner = seat;
  target.count += 1;

  return next;
}

function removeOneDie(dice, die) {
  const index = dice.indexOf(die);
  if (index < 0) return [...dice];
  return [...dice.slice(0, index), ...dice.slice(index + 1)];
}

function enumerateMoveSequences(position, seat, dice, depth = 0) {
  if (!dice.length || depth > 4) return [[]];

  let sequences = [];
  const uniqueDice = [...new Set(dice)];

  for (const die of uniqueDice) {
    const moves = rawMovesForDie(position, seat, die);
    if (!moves.length) continue;

    const rest = removeOneDie(dice, die);

    for (const move of moves) {
      const next = applyMoveToPosition(position, seat, move);
      const tails = enumerateMoveSequences(next, seat, rest, depth + 1);
      for (const tail of tails) {
        sequences.push([move, ...tail]);
      }
    }
  }

  return sequences.length ? sequences : [[]];
}

function legalFirstMoves(position, seat, dice) {
  if (!dice.length) return [];

  const sequences = enumerateMoveSequences(position, seat, dice);
  const maxLength = Math.max(...sequences.map((sequence) => sequence.length));

  if (maxLength <= 0) return [];

  let bestSequences = sequences.filter((sequence) => sequence.length === maxLength);

  // Official rule: if only one of two different dice can be played,
  // the higher die must be used.
  if (maxLength === 1 && new Set(dice).size > 1) {
    const highestPlayableDie = Math.max(...bestSequences.map((sequence) => sequence[0].die));
    bestSequences = bestSequences.filter((sequence) => sequence[0].die === highestPlayableDie);
  }

  const seen = new Set();
  const result = [];

  for (const sequence of bestSequences) {
    const move = sequence[0];
    const key = `${move.from}:${move.to}:${move.die}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(move);
  }

  return result;
}

function rollDice() {
  return [
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
  ];
}

export function createBackgammonRoom({ roomId, players, io, onFinish }) {
  const randomized = Math.random() < 0.5 ? players : [...players].reverse();

  const playersBySeat = {
    a: {
      socketId: randomized[0].socketId,
      name: safeName(randomized[0].name),
    },
    b: {
      socketId: randomized[1].socketId,
      name: safeName(randomized[1].name),
    },
  };

  let position = {
    points: makePoints(),
    bar: { a: 0, b: 0 },
    off: { a: 0, b: 0 },
  };

  let turn = Math.random() < 0.5 ? 'a' : 'b';
  let phase = 'roll';
  let dice = [];
  let remainingDice = [];
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let turnNumber = 1;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (playersBySeat.a.socketId === socketId) return 'a';
    if (playersBySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', {
      gameId: 'backgammon',
      roomId,
      message,
    });
  }

  function currentLegalMoves() {
    if (status !== 'playing' || phase !== 'move') return [];
    return legalFirstMoves(position, turn, remainingDice);
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);

    return {
      gameId: 'backgammon',
      roomId,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      status,
      turn,
      phase,
      turnNumber,
      dice: [...dice],
      remainingDice: [...remainingDice],
      legalMoves: currentLegalMoves(),
      points: position.points.map((point) => ({ ...point })),
      bar: { ...position.bar },
      off: { ...position.off },
      players: {
        a: { name: playersBySeat.a.name },
        b: { name: playersBySeat.b.name },
      },
      lastMove,
      result,
    };
  }

  function emitState() {
    io.to(playersBySeat.a.socketId).emit('game:state', snapshotFor(playersBySeat.a.socketId));
    io.to(playersBySeat.b.socketId).emit('game:state', snapshotFor(playersBySeat.b.socketId));
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    phase = 'finished';
    dice = [];
    remainingDice = [];
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(playersBySeat) });
    }
  }

  function nextTurn() {
    if (position.off.a >= CHECKERS_PER_PLAYER) {
      finish({
        type: 'win',
        winner: 'a',
        message: `${playersBySeat.a.name} первым вывел все 15 шашек.`,
      });
      return;
    }

    if (position.off.b >= CHECKERS_PER_PLAYER) {
      finish({
        type: 'win',
        winner: 'b',
        message: `${playersBySeat.b.name} первым вывел все 15 шашек.`,
      });
      return;
    }

    turn = opposite(turn);
    phase = 'roll';
    dice = [];
    remainingDice = [];
    lastMove = null;
    turnNumber += 1;
  }

  function handleRoll(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat || seat !== turn || phase !== 'roll') return;

    dice = rollDice();
    remainingDice = dice[0] === dice[1]
      ? [dice[0], dice[0], dice[0], dice[0]]
      : [...dice];
    phase = 'move';

    if (!currentLegalMoves().length) {
      phase = 'blocked';
      emitState();

      setTimeout(() => {
        if (status !== 'playing' || phase !== 'blocked') return;
        nextTurn();
        emitState();
      }, 850);
      return;
    }

    emitState();
  }

  function sameMove(a, b) {
    return String(a.from) === String(b.from)
      && String(a.to) === String(b.to)
      && Number(a.die) === Number(b.die);
  }

  function handleMove(socketId, payload = {}) {
    if (status !== 'playing') return;

    const seat = seatForSocket(socketId);
    if (!seat || seat !== turn || phase !== 'move') return;

    const requested = {
      from: payload.from === 'bar' ? 'bar' : Number(payload.from),
      to: payload.to === 'off' ? 'off' : Number(payload.to),
      die: Number(payload.die),
    };

    const legalMoves = currentLegalMoves();
    const move = legalMoves.find((candidate) => sameMove(candidate, requested));

    if (!move) {
      emitError(socketId, 'Этот ход сейчас недоступен.');
      return;
    }

    position = applyMoveToPosition(position, seat, move);
    remainingDice = removeOneDie(remainingDice, move.die);
    lastMove = {
      seat,
      from: move.from,
      to: move.to,
      die: move.die,
      at: Date.now(),
    };

    if (position.off[seat] >= CHECKERS_PER_PLAYER) {
      finish({
        type: 'win',
        winner: seat,
        message: `${playersBySeat[seat].name} первым вывел все 15 шашек.`,
      });
      return;
    }

    const nextMoves = legalFirstMoves(position, seat, remainingDice);
    if (!remainingDice.length || !nextMoves.length) {
      nextTurn();
    }

    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    finish({
      type: 'resign',
      winner: opposite(seat),
      message: `${playersBySeat[seat].name} сдался.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'roll') handleRoll(socketId);
    if (action.type === 'move') handleMove(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    finish({
      type: 'disconnect',
      winner: opposite(seat),
      message: 'Соперник отключился.',
    });
  }

  return {
    playerSocketIds: [playersBySeat.a.socketId, playersBySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {},
  };
}
