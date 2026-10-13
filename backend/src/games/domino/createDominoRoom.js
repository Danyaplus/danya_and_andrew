// Two-player draw dominoes (double-six set). The server owns the deck, hands and moves.
const GAME_ID = 'domino';
const other = (seat) => seat === 'a' ? 'b' : 'a';
const OPENING_DOUBLE_ORDER = [1, 2, 3, 4, 5, 6, 0];

function cleanName(name) {
  return typeof name === 'string' ? name.trim().slice(0, 28) || 'Игрок' : 'Игрок';
}

function shuffledTiles() {
  const tiles = [];
  for (let a = 0; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) {
      tiles.push({ id: `${a}-${b}`, a, b });
    }
  }
  for (let i = tiles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

function compareTiles(a, b) {
  const sumDiff = (a.a + a.b) - (b.a + b.b);
  if (sumDiff) return sumDiff;
  const maxDiff = Math.max(a.a, a.b) - Math.max(b.a, b.b);
  if (maxDiff) return maxDiff;
  return Math.min(a.a, a.b) - Math.min(b.a, b.b);
}

function findOpeningTile(hand) {
  for (const value of OPENING_DOUBLE_ORDER) {
    const hit = hand.find((tile) => tile.a === value && tile.b === value);
    if (hit) return { rank: OPENING_DOUBLE_ORDER.indexOf(value), tile: hit, preferred: true };
  }
  const sorted = [...hand].sort(compareTiles);
  return { rank: Number.MAX_SAFE_INTEGER, tile: sorted[0], preferred: false };
}

function pickOpeningMove(hands) {
  const a = findOpeningTile(hands.a);
  const b = findOpeningTile(hands.b);
  if (a.preferred && b.preferred) {
    return a.rank <= b.rank ? { seat: 'a', tile: a.tile } : { seat: 'b', tile: b.tile };
  }
  if (a.preferred) return { seat: 'a', tile: a.tile };
  if (b.preferred) return { seat: 'b', tile: b.tile };
  return compareTiles(a.tile, b.tile) <= 0 ? { seat: 'a', tile: a.tile } : { seat: 'b', tile: b.tile };
}

function allowedMoves(hand, chain, options = {}) {
  const { openingTileId = null, requiredSide = null } = options;
  if (chain.length === 0) {
    const base = openingTileId
      ? hand.filter((tile) => tile.id === openingTileId).map((tile) => ({ tileId: tile.id, sides: ['right'] }))
      : hand.map((tile) => ({ tileId: tile.id, sides: ['right'] }));
    return base;
  }

  const left = chain[0].left;
  const right = chain[chain.length - 1].right;
  const moves = [];
  for (const tile of hand) {
    let sides = [];
    if (tile.a === left || tile.b === left) sides.push('left');
    if (tile.a === right || tile.b === right) sides.push('right');
    if (requiredSide) sides = sides.filter((side) => side === requiredSide);
    if (sides.length) moves.push({ tileId: tile.id, sides });
  }
  return moves;
}

const pipTotal = (hand) => hand.reduce((sum, tile) => sum + tile.a + tile.b, 0);

export function createDominoRoom({ roomId, players, io, onFinish }) {
  const bySeat = {
    a: { socketId: players[0].socketId, name: cleanName(players[0].name) },
    b: { socketId: players[1].socketId, name: cleanName(players[1].name) },
  };
  const tiles = shuffledTiles();
  const hands = { a: tiles.splice(0, 7), b: tiles.splice(0, 7) };
  const boneyard = tiles;
  const chain = [];
  const playHistory = [];

  const opening = pickOpeningMove(hands);
  let turn = opening.seat;
  let openingTileId = opening.tile.id;
  let status = 'playing';
  let result = null;
  let consecutivePasses = 0;
  let moveNumber = 0;
  let lastMove = null;
  let finishedOnce = false;
  let destroyed = false;
  let turnState = { played: 0, usedSide: null };

  function seatFor(socketId) {
    if (socketId === bySeat.a.socketId) return 'a';
    if (socketId === bySeat.b.socketId) return 'b';
    return null;
  }

  function legalMovesFor(seat) {
    if (status !== 'playing' || turn !== seat) return [];
    const requiredSide = turnState.played === 1 && turnState.usedSide
      ? (turnState.usedSide === 'left' ? 'right' : 'left')
      : null;
    const openingRestriction = chain.length === 0 ? openingTileId : null;
    return allowedMoves(hands[seat], chain, { openingTileId: openingRestriction, requiredSide });
  }

  function switchTurn() {
    turn = other(turn);
    turnState = { played: 0, usedSide: null };
  }

  function snapshot(socketId) {
    const seat = seatFor(socketId);
    const hand = hands[seat] || [];
    const options = legalMovesFor(seat);
    return {
      gameId: GAME_ID,
      roomId,
      playerSeat: seat,
      opponentSeat: other(seat),
      players: { a: { name: bySeat.a.name }, b: { name: bySeat.b.name } },
      hand: hand.map((tile) => ({ ...tile })),
      handCounts: { a: hands.a.length, b: hands.b.length },
      boneyardCount: boneyard.length,
      chain: chain.map((tile) => ({ ...tile })),
      playHistory: playHistory.map((item) => ({ ...item })),
      ends: chain.length ? { left: chain[0].left, right: chain[chain.length - 1].right } : null,
      turn,
      status,
      result,
      moveNumber,
      lastMove,
      legalMoves: options,
      openingTileId: chain.length === 0 ? openingTileId : null,
      canDraw: status === 'playing' && turn === seat && turnState.played === 0 && options.length === 0 && boneyard.length > 0,
      canPass: status === 'playing' && turn === seat && turnState.played === 0 && options.length === 0 && boneyard.length === 0,
      canEndTurn: status === 'playing' && turn === seat && turnState.played === 1,
      turnPlayCount: turnState.played,
    };
  }

  function emitState() {
    if (destroyed) return;
    io.to(bySeat.a.socketId).emit('game:state', snapshot(bySeat.a.socketId));
    io.to(bySeat.b.socketId).emit('game:state', snapshot(bySeat.b.socketId));
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: GAME_ID, roomId, message });
  }

  function finish(winner, type, message) {
    if (destroyed || status !== 'playing') return;
    status = 'finished';
    result = {
      winner,
      type,
      message,
      pips: { a: pipTotal(hands.a), b: pipTotal(hands.b) },
    };
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function play(socketId, payload = {}) {
    const seat = seatFor(socketId);
    if (status !== 'playing' || turn !== seat) return;
    const id = payload?.tileId;
    const side = payload?.side;
    const options = legalMovesFor(seat);
    if (!options.some((move) => move.tileId === id && move.sides.includes(side))) {
      emitError(socketId, 'Эту костяшку нельзя поставить на выбранный край.');
      return;
    }

    const index = hands[seat].findIndex((tile) => tile.id === id);
    if (index === -1) {
      emitError(socketId, 'Такой костяшки у тебя нет.');
      return;
    }

    const wasEmpty = chain.length === 0;
    const [tile] = hands[seat].splice(index, 1);
    let placed;
    if (!chain.length) {
      placed = { id: tile.id, left: tile.a, right: tile.b, a: tile.a, b: tile.b, seat };
      chain.push(placed);
      playHistory.push({ ...placed, side: 'start', moveNumber: moveNumber + 1, isDouble: tile.a === tile.b });
    } else if (side === 'left') {
      const end = chain[0].left;
      placed = { id: tile.id, left: tile.a === end ? tile.b : tile.a, right: end, a: tile.a, b: tile.b, seat };
      chain.unshift(placed);
      playHistory.push({ ...placed, side: 'left', moveNumber: moveNumber + 1, isDouble: tile.a === tile.b });
    } else {
      const end = chain[chain.length - 1].right;
      placed = { id: tile.id, left: end, right: tile.a === end ? tile.b : tile.a, a: tile.a, b: tile.b, seat };
      chain.push(placed);
      playHistory.push({ ...placed, side: 'right', moveNumber: moveNumber + 1, isDouble: tile.a === tile.b });
    }

    openingTileId = null;
    moveNumber += 1;
    consecutivePasses = 0;
    lastMove = { type: 'play', seat, id, side, moveNumber };

    if (hands[seat].length === 0) {
      finish(seat, 'empty', `${bySeat[seat].name} выложил все костяшки!`);
      return;
    }

    if (!wasEmpty && turnState.played === 0) {
      const oppositeSide = side === 'left' ? 'right' : 'left';
      const extraMoves = allowedMoves(hands[seat], chain, { requiredSide: oppositeSide });
      if (extraMoves.length) {
        turnState = { played: 1, usedSide: side };
        emitState();
        return;
      }
    }

    switchTurn();
    emitState();
  }

  function draw(socketId) {
    const seat = seatFor(socketId);
    if (status !== 'playing' || turn !== seat) return;
    if (turnState.played !== 0) {
      emitError(socketId, 'После первой поставленной костяшки можно только закончить ход или поставить вторую на другой край.');
      return;
    }
    if (legalMovesFor(seat).length) {
      emitError(socketId, 'Сначала поставь подходящую костяшку.');
      return;
    }
    if (!boneyard.length) {
      emitError(socketId, 'Базар пуст. Пропусти ход.');
      return;
    }
    const tile = boneyard.pop();
    hands[seat].push(tile);
    consecutivePasses = 0;
    lastMove = { type: 'draw', seat, moveNumber };
    emitState();
  }

  function pass(socketId) {
    const seat = seatFor(socketId);
    if (status !== 'playing' || turn !== seat) return;
    if (turnState.played !== 0) {
      emitError(socketId, 'После первой поставленной костяшки нельзя пропускать ход.');
      return;
    }
    if (boneyard.length || legalMovesFor(seat).length) {
      emitError(socketId, 'Пока можно сделать ход или взять костяшку из базара.');
      return;
    }
    consecutivePasses += 1;
    lastMove = { type: 'pass', seat, moveNumber };
    if (consecutivePasses === 2) {
      const scores = { a: pipTotal(hands.a), b: pipTotal(hands.b) };
      const winner = scores.a === scores.b ? null : scores.a < scores.b ? 'a' : 'b';
      finish(winner, 'block', winner
        ? `Рыба! Победил ${bySeat[winner].name} — у него меньше очков на руках.`
        : 'Рыба! У обоих одинаковое число очков — ничья.');
      return;
    }
    switchTurn();
    emitState();
  }

  function endTurn(socketId) {
    const seat = seatFor(socketId);
    if (status !== 'playing' || turn !== seat) return;
    if (turnState.played !== 1) {
      emitError(socketId, 'Сейчас нечего завершать — либо поставь первую костяшку, либо жди ход соперника.');
      return;
    }
    lastMove = { type: 'end-turn', seat, moveNumber };
    switchTurn();
    emitState();
  }

  function handleAction(socketId, action = {}) {
    if (!seatFor(socketId)) return;
    if (action?.type === 'play') play(socketId, action.payload);
    if (action?.type === 'draw') draw(socketId);
    if (action?.type === 'pass') pass(socketId);
    if (action?.type === 'end-turn') endTurn(socketId);
    if (action?.type === 'resign' && status === 'playing') {
      const winner = other(seatFor(socketId));
      finish(winner, 'resign', `${bySeat[seatFor(socketId)].name} сдался.`);
    }
  }

  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat && status === 'playing') {
      finish(other(seat), 'disconnect', 'Соперник отключился.');
    }
  }

  return {
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() { destroyed = true; },
  };
}
