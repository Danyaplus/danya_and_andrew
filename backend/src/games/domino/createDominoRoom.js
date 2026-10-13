// Two-player draw dominoes (double-six set). The server owns the deck, hands and moves.
const GAME_ID = 'domino';
const other = (seat) => seat === 'a' ? 'b' : 'a';

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

function allowedMoves(hand, chain) {
  if (chain.length === 0) {
    return hand.map((tile) => ({ tileId: tile.id, sides: ['right'] }));
  }

  const left = chain[0].left;
  const right = chain[chain.length - 1].right;
  const moves = [];
  for (const tile of hand) {
    const sides = [];
    if (tile.a === left || tile.b === left) sides.push('left');
    if (tile.a === right || tile.b === right) sides.push('right');
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
  let turn = Math.random() < 0.5 ? 'a' : 'b';
  let status = 'playing';
  let result = null;
  let consecutivePasses = 0;
  let moveNumber = 0;
  let lastMove = null;
  let finishedOnce = false;
  let destroyed = false;

  function seatFor(socketId) {
    if (socketId === bySeat.a.socketId) return 'a';
    if (socketId === bySeat.b.socketId) return 'b';
    return null;
  }

  function snapshot(socketId) {
    const seat = seatFor(socketId);
    const hand = hands[seat] || [];
    const options = status === 'playing' && turn === seat ? allowedMoves(hand, chain) : [];
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
      ends: chain.length ? { left: chain[0].left, right: chain[chain.length - 1].right } : null,
      turn,
      status,
      result,
      moveNumber,
      lastMove,
      legalMoves: options,
      canDraw: status === 'playing' && turn === seat && options.length === 0 && boneyard.length > 0,
      canPass: status === 'playing' && turn === seat && options.length === 0 && boneyard.length === 0,
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
    const index = hands[seat].findIndex((tile) => tile.id === id);
    if (index === -1) { emitError(socketId, 'Такой костяшки у тебя нет.'); return; }
    const options = allowedMoves(hands[seat], chain);
    if (!options.some((move) => move.tileId === id && move.sides.includes(side))) {
      emitError(socketId, 'Эту костяшку нельзя поставить на выбранный край.');
      return;
    }

    const [tile] = hands[seat].splice(index, 1);
    let placed;
    if (!chain.length) {
      placed = { id: tile.id, left: tile.a, right: tile.b, seat };
      chain.push(placed);
    } else if (side === 'left') {
      const end = chain[0].left;
      placed = { id: tile.id, left: tile.a === end ? tile.b : tile.a, right: end, seat };
      chain.unshift(placed);
    } else {
      const end = chain[chain.length - 1].right;
      placed = { id: tile.id, left: end, right: tile.a === end ? tile.b : tile.a, seat };
      chain.push(placed);
    }
    moveNumber += 1;
    consecutivePasses = 0;
    lastMove = { type: 'play', seat, id, side, moveNumber };

    if (hands[seat].length === 0) {
      finish(seat, 'empty', `${bySeat[seat].name} выложил все костяшки!`);
      return;
    }
    turn = other(seat);
    emitState();
  }

  function draw(socketId) {
    const seat = seatFor(socketId);
    if (status !== 'playing' || turn !== seat) return;
    if (allowedMoves(hands[seat], chain).length) {
      emitError(socketId, 'Сначала поставь подходящую костяшку.');
      return;
    }
    if (!boneyard.length) { emitError(socketId, 'Базар пуст. Пропусти ход.'); return; }
    const tile = boneyard.pop();
    hands[seat].push(tile);
    consecutivePasses = 0;
    lastMove = { type: 'draw', seat, moveNumber };
    emitState();
  }

  function pass(socketId) {
    const seat = seatFor(socketId);
    if (status !== 'playing' || turn !== seat) return;
    if (boneyard.length || allowedMoves(hands[seat], chain).length) {
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
    turn = other(seat);
    emitState();
  }

  function handleAction(socketId, action = {}) {
    if (!seatFor(socketId)) return;
    if (action?.type === 'play') play(socketId, action.payload);
    if (action?.type === 'draw') draw(socketId);
    if (action?.type === 'pass') pass(socketId);
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
