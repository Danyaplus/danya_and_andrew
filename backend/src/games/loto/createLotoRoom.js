const GAME_ID = 'loto';
const DRAW_MS = 1550;  // Bag shakes, then a barrel is revealed.
const MARK_MS = 10000; // Only players with the number have to mark it.
const REST_MS = 1000;  // Give players time to see the last barrel.
const CARD_SIZE = 15;
const TOTAL_BARRELS = 90;

const other = (seat) => seat === 'a' ? 'b' : 'a';
const safeName = (name) => typeof name === 'string'
  ? (name.trim().replace(/\s+/g, ' ').slice(0, 28) || 'Игрок') : 'Игрок';

function shuffle(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Traditional Russian lotto ticket: 3 rows, 9 columns, 5 numbers per row.
// Empty cells remain blank; numbers in each column grow top to bottom.
function generateCard() {
  const columns = Array.from({ length: 9 }, () => []);
  const rows = [0, 0, 0];

  // At least one number from each decade/column.
  for (const col of shuffle([...Array(9).keys()])) {
    const available = [0, 1, 2].filter((row) => rows[row] < 5);
    const row = available[Math.floor(Math.random() * available.length)];
    columns[col].push(row);
    rows[row] += 1;
  }
  // Exactly five numbers in each row.
  for (let row = 0; row < 3; row += 1) {
    while (rows[row] < 5) {
      const available = [...Array(9).keys()].filter((col) => !columns[col].includes(row));
      const col = available[Math.floor(Math.random() * available.length)];
      columns[col].push(row);
      rows[row] += 1;
    }
  }

  const cells = Array.from({ length: 3 }, () => Array(9).fill(null));
  for (let col = 0; col < 9; col += 1) {
    const min = col === 0 ? 1 : col * 10;
    const max = col === 8 ? 90 : col === 0 ? 9 : col * 10 + 9;
    const numbers = shuffle(Array.from({ length: max - min + 1 }, (_, n) => n + min))
      .slice(0, columns[col].length).sort((a, b) => a - b);
    const positions = columns[col].sort((a, b) => a - b);
    positions.forEach((row, index) => { cells[row][col] = numbers[index]; });
  }
  return cells;
}

export function createLotoRoom({ roomId, players, io, onFinish }) {
  const bySeat = {
    a: { socketId: players[0].socketId, name: safeName(players[0].name) },
    b: { socketId: players[1].socketId, name: safeName(players[1].name) },
  };
  const cards = { a: generateCard(), b: generateCard() };
  const numbers = {
    a: new Set(cards.a.flat().filter((value) => value !== null)),
    b: new Set(cards.b.flat().filter((value) => value !== null)),
  };
  const marked = { a: new Set(), b: new Set() };
  const bag = shuffle(Array.from({ length: TOTAL_BARRELS }, (_, i) => i + 1));
  let phase = 'drawing';
  let phaseEndsAt = Date.now() + DRAW_MS;
  let currentNumber = null;
  let drawn = [];
  let status = 'playing';
  let result = null;
  let timer = null;
  let destroyed = false;
  let finishedOnce = false;

  const seatOf = (socketId) => bySeat.a.socketId === socketId ? 'a'
    : bySeat.b.socketId === socketId ? 'b' : null;
  const requiresMark = (seat) => phase === 'marking' && currentNumber !== null
    && numbers[seat].has(currentNumber) && !marked[seat].has(currentNumber);
  const waitingFor = () => ['a', 'b'].filter(requiresMark);

  function snapshot(socketId) {
    return {
      gameId: GAME_ID,
      roomId,
      playerSeat: seatOf(socketId),
      opponentSeat: other(seatOf(socketId)),
      serverTime: Date.now(),
      status,
      phase,
      phaseEndsAt,
      players: { a: { name: bySeat.a.name }, b: { name: bySeat.b.name } },
      cards,
      marked: { a: [...marked.a], b: [...marked.b] },
      progress: { a: marked.a.size, b: marked.b.size },
      cardSize: CARD_SIZE,
      drawnCount: drawn.length,
      lastDrawn: drawn.slice(-8).reverse(),
      bagLeft: bag.length,
      currentNumber,
      waitingFor: waitingFor(),
      result,
    };
  }

  function emitState() {
    if (destroyed) return;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshot(bySeat[seat].socketId));
    }
  }

  function schedule(fn, delay) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!destroyed && status === 'playing') fn();
    }, delay);
    timer.unref?.();
  }

  function finish(winner, type, message) {
    if (destroyed || status === 'finished') return;
    clearTimeout(timer);
    timer = null;
    status = 'finished';
    phase = 'finished';
    phaseEndsAt = null;
    result = { winner, type, message };
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function beginDraw() {
    if (status !== 'playing') return;
    if (!bag.length) {
      finish(null, 'draw', 'Все бочонки вышли из мешочка — ничья!');
      return;
    }
    currentNumber = null;
    phase = 'drawing';
    phaseEndsAt = Date.now() + DRAW_MS;
    emitState();
    schedule(revealBarrel, DRAW_MS);
  }

  function finishBarrel() {
    if (status !== 'playing' || phase !== 'marking' || waitingFor().length) return;
    // Decide the result only after everyone with this number has marked it.
    // The order of taps must not break a tie on the same final barrel.
    const aDone = marked.a.size === CARD_SIZE;
    const bDone = marked.b.size === CARD_SIZE;
    if (aDone && bDone) {
      finish(null, 'draw', 'Оба игрока закрыли карточки одним бочонком — ничья!');
      return;
    }
    if (aDone || bDone) {
      const winner = aDone ? 'a' : 'b';
      finish(winner, 'completed', `${bySeat[winner].name} закрыл все 15 чисел!`);
      return;
    }
    clearTimeout(timer);
    phase = 'rest';
    phaseEndsAt = Date.now() + REST_MS;
    emitState();
    schedule(beginDraw, REST_MS);
  }

  function mark(seat) {
    if (!requiresMark(seat)) return false;
    marked[seat].add(currentNumber);
    emitState();
    if (waitingFor().length === 0) finishBarrel();
    return true;
  }

  function revealBarrel() {
    if (status !== 'playing' || phase !== 'drawing') return;
    currentNumber = bag.pop();
    drawn.push(currentNumber);
    phase = 'marking';
    if (waitingFor().length === 0) {
      phase = 'rest';
      phaseEndsAt = Date.now() + REST_MS;
      emitState();
      schedule(beginDraw, REST_MS);
      return;
    }
    phaseEndsAt = Date.now() + MARK_MS;
    emitState();
    schedule(() => {
      // Resolve all remaining marks first. A manually placed last barrel
      // and an automatically placed last barrel have the same result.
      for (const seat of waitingFor()) {
        if (status !== 'playing') break;
        mark(seat);
      }
    }, MARK_MS);
  }

  function handleAction(socketId, action = {}) {
    if (status !== 'playing') return;
    const seat = seatOf(socketId);
    if (!seat) return;
    if (action?.type === 'resign') {
      finish(other(seat), 'resign', `${bySeat[seat].name} вышел из игры.`);
      return;
    }
    if (action?.type !== 'mark' || phase !== 'marking') return;
    if (action.number !== currentNumber) return; // Reject stale taps from a prior barrel.
    if (Date.now() >= phaseEndsAt) return; // Timeout handler will mark it shortly.
    mark(seat);
  }

  function handleDisconnect(socketId) {
    const seat = seatOf(socketId);
    if (seat && status === 'playing') finish(other(seat), 'disconnect', 'Соперник отключился. Победа за тобой!');
  }

  schedule(revealBarrel, DRAW_MS);
  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      destroyed = true;
      clearTimeout(timer);
    },
  };
}
