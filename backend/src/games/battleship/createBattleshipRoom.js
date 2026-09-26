const BOARD_SIZE = 10;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const TURN_TIME_MS = 30 * 1000;
const TICK_MS = 500;
const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

function safePlayerName(name) {
  if (typeof name !== 'string') return 'Игрок';
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 28) : 'Игрок';
}

function opposite(side) {
  return side === 'a' ? 'b' : 'a';
}

function toCell(row, col) {
  return row * BOARD_SIZE + col;
}

function fromCell(cell) {
  return {
    row: Math.floor(cell / BOARD_SIZE),
    col: cell % BOARD_SIZE,
  };
}

function nearbyCells(cell) {
  const { row, col } = fromCell(cell);
  const result = [];

  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
      if (rowDelta === 0 && colDelta === 0) continue;
      const nextRow = row + rowDelta;
      const nextCol = col + colDelta;
      if (nextRow < 0 || nextRow >= BOARD_SIZE || nextCol < 0 || nextCol >= BOARD_SIZE) continue;
      result.push(toCell(nextRow, nextCol));
    }
  }

  return result;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function createRandomBoard() {
  // Пересобираем всё поле целиком, если на редкой неудачной попытке
  // очередной корабль уже некуда поставить.
  for (let boardAttempt = 0; boardAttempt < 100; boardAttempt += 1) {
    const occupied = new Set();
    const ships = [];
    let failed = false;

    for (let shipIndex = 0; shipIndex < FLEET.length; shipIndex += 1) {
      const length = FLEET[shipIndex];
      let placed = null;

      for (let placementAttempt = 0; placementAttempt < 700; placementAttempt += 1) {
        const horizontal = Math.random() < 0.5;
        const maxRow = horizontal ? BOARD_SIZE : BOARD_SIZE - length + 1;
        const maxCol = horizontal ? BOARD_SIZE - length + 1 : BOARD_SIZE;
        const row = randomInt(maxRow);
        const col = randomInt(maxCol);
        const cells = [];

        for (let offset = 0; offset < length; offset += 1) {
          cells.push(toCell(
            row + (horizontal ? 0 : offset),
            col + (horizontal ? offset : 0),
          ));
        }

        const touchesAnotherShip = cells.some((cell) => {
          if (occupied.has(cell)) return true;
          return nearbyCells(cell).some((nearby) => occupied.has(nearby));
        });

        if (touchesAnotherShip) continue;
        placed = cells;
        break;
      }

      if (!placed) {
        failed = true;
        break;
      }

      const ship = {
        id: `ship-${shipIndex + 1}`,
        length,
        cells: placed,
        hits: new Set(),
      };

      ships.push(ship);
      for (const cell of placed) occupied.add(cell);
    }

    if (!failed) {
      const shipByCell = new Map();
      for (const ship of ships) {
        for (const cell of ship.cells) shipByCell.set(cell, ship);
      }

      return { ships, shipByCell };
    }
  }

  throw new Error('Не удалось создать корректную расстановку кораблей.');
}

function aliveShips(board) {
  return board.ships.filter((ship) => ship.hits.size < ship.cells.length).length;
}

function buildOwnGrid(board, marks) {
  const grid = Array(CELL_COUNT).fill('water');

  for (const ship of board.ships) {
    for (const cell of ship.cells) grid[cell] = 'ship';
  }

  for (const [cell, mark] of marks.entries()) {
    grid[cell] = mark;
  }

  return grid;
}

function buildEnemyGrid(marks) {
  const grid = Array(CELL_COUNT).fill('unknown');
  for (const [cell, mark] of marks.entries()) grid[cell] = mark;
  return grid;
}

export function createBattleshipRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySide = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  const boards = {
    a: createRandomBoard(),
    b: createRandomBoard(),
  };

  // marks[targetSide] хранит всё, что уже известно о поле этой стороны:
  // miss — реальный промах, hit/sunk — попадание, blocked — автоматически
  // закрытая клетка вокруг потопленного корабля.
  const marks = {
    a: new Map(),
    b: new Map(),
  };

  let turn = Math.random() < 0.5 ? 'a' : 'b';
  let turnStartedAt = Date.now();
  let status = 'playing';
  let result = null;
  let lastShot = null;
  let lastEvent = null;
  let finishedOnce = false;
  let interval = null;

  function sideForSocket(socketId) {
    if (bySide.a.socketId === socketId) return 'a';
    if (bySide.b.socketId === socketId) return 'b';
    return null;
  }

  function turnTimeRemaining(now = Date.now()) {
    if (status !== 'playing') return 0;
    return Math.max(0, TURN_TIME_MS - (now - turnStartedAt));
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    if (interval) clearInterval(interval);
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySide) });
    }
  }

  function switchTurn(event = null) {
    turn = opposite(turn);
    turnStartedAt = Date.now();
    lastEvent = event;
  }

  function snapshotFor(socketId) {
    const playerSide = sideForSocket(socketId);
    const enemySide = opposite(playerSide);

    return {
      gameId: 'battleship',
      roomId,
      playerSide,
      players: {
        a: { name: bySide.a.name },
        b: { name: bySide.b.name },
      },
      status,
      result,
      turn,
      turnTimeMs: turnTimeRemaining(),
      turnDurationMs: TURN_TIME_MS,
      boardSize: BOARD_SIZE,
      myGrid: buildOwnGrid(boards[playerSide], marks[playerSide]),
      enemyGrid: buildEnemyGrid(marks[enemySide]),
      shipsRemaining: {
        me: aliveShips(boards[playerSide]),
        enemy: aliveShips(boards[enemySide]),
      },
      lastShot,
      lastEvent,
    };
  }

  function emitState() {
    for (const side of ['a', 'b']) {
      const player = bySide[side];
      io.to(player.socketId).emit('game:state', snapshotFor(player.socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', {
      gameId: 'battleship',
      roomId,
      message,
    });
  }

  function sinkShip(targetSide, ship) {
    const targetMarks = marks[targetSide];
    const shipCells = new Set(ship.cells);

    for (const cell of ship.cells) targetMarks.set(cell, 'sunk');

    for (const cell of ship.cells) {
      for (const nearby of nearbyCells(cell)) {
        if (shipCells.has(nearby)) continue;
        if (boards[targetSide].shipByCell.has(nearby)) continue;
        if (!targetMarks.has(nearby)) targetMarks.set(nearby, 'blocked');
      }
    }
  }

  function handleFire(socketId, payload = {}) {
    if (status !== 'playing') return;

    const shooterSide = sideForSocket(socketId);
    if (!shooterSide) return;
    if (turn !== shooterSide) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }

    if (turnTimeRemaining() <= 0) {
      const expiredSide = turn;
      switchTurn({ type: 'timeout', side: expiredSide });
      emitState();
      return;
    }

    const cell = Number(payload.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) {
      emitError(socketId, 'Выберите клетку на поле соперника.');
      return;
    }

    const targetSide = opposite(shooterSide);
    const targetMarks = marks[targetSide];

    if (targetMarks.has(cell)) {
      emitError(socketId, 'В эту клетку уже стрелять нельзя.');
      return;
    }

    const ship = boards[targetSide].shipByCell.get(cell);
    let shotResult = 'miss';
    let sunkLength = null;

    if (!ship) {
      targetMarks.set(cell, 'miss');
    } else {
      ship.hits.add(cell);
      const isSunk = ship.hits.size === ship.cells.length;

      if (isSunk) {
        shotResult = 'sunk';
        sunkLength = ship.length;
        sinkShip(targetSide, ship);
      } else {
        shotResult = 'hit';
        targetMarks.set(cell, 'hit');
      }
    }

    lastShot = {
      shooter: shooterSide,
      target: targetSide,
      cell,
      result: shotResult,
      sunkLength,
    };
    lastEvent = null;

    if (aliveShips(boards[targetSide]) === 0) {
      finish({
        type: 'win',
        winner: shooterSide,
        message: 'Все корабли соперника уничтожены.',
      });
      return;
    }

    // Классическое правило: при попадании игрок стреляет ещё раз.
    // Новый дополнительный выстрел получает полный лимит в 30 секунд.
    if (shotResult === 'hit' || shotResult === 'sunk') {
      turnStartedAt = Date.now();
      lastEvent = {
        type: 'shot',
        side: shooterSide,
        result: shotResult,
        extraTurn: true,
      };
    } else {
      switchTurn({
        type: 'shot',
        side: shooterSide,
        result: shotResult,
        extraTurn: false,
      });
    }

    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const side = sideForSocket(socketId);
    if (!side) return;

    finish({
      type: 'resign',
      winner: opposite(side),
      message: 'Один из игроков сдался.',
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'fire') handleFire(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const side = sideForSocket(socketId);
    if (!side) return;

    finish({
      type: 'disconnect',
      winner: opposite(side),
      message: 'Соперник отключился от игры.',
    });
  }

  interval = setInterval(() => {
    if (status !== 'playing') return;

    if (turnTimeRemaining() <= 0) {
      const expiredSide = turn;
      switchTurn({ type: 'timeout', side: expiredSide });
    }

    emitState();
  }, TICK_MS);
  interval.unref?.();

  return {
    playerSocketIds: [bySide.a.socketId, bySide.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {
      if (interval) clearInterval(interval);
    },
  };
}
