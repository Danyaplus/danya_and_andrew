const TOOTH_COUNT = 12;

function safePlayerName(name) {
  if (typeof name !== 'string') return 'Игрок';
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 28) : 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

export function createCrocodileTeethRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  const badTooth = Math.floor(Math.random() * TOOTH_COUNT);
  const pressed = Array(TOOTH_COUNT).fill(false);
  let turn = Math.random() < 0.5 ? 'a' : 'b';
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let moveNumber = 0;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'crocodile-teeth',
      roomId,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      toothCount: TOOTH_COUNT,
      pressed: [...pressed],
      turn,
      status,
      result,
      lastMove,
      moveNumber,
      // Секретный зуб раскрывается только после окончания матча.
      badTooth: status === 'finished' ? badTooth : null,
    };
  }

  function emitState() {
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', {
      gameId: 'crocodile-teeth',
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
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function handlePress(socketId, payload = {}) {
    if (status !== 'playing') return;

    const seat = seatForSocket(socketId);
    if (!seat) return;
    if (turn !== seat) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }

    const tooth = Number(payload.tooth);
    if (!Number.isInteger(tooth) || tooth < 0 || tooth >= TOOTH_COUNT) {
      emitError(socketId, 'Выберите зуб крокодила.');
      return;
    }

    if (pressed[tooth]) {
      emitError(socketId, 'Этот зуб уже нажат.');
      return;
    }

    pressed[tooth] = true;
    moveNumber += 1;
    lastMove = { tooth, seat, moveNumber, bite: tooth === badTooth };

    if (tooth === badTooth) {
      finish({
        type: 'bite',
        loser: seat,
        winner: opposite(seat),
        tooth,
        message: `${bySeat[seat].name} нажал опасный зуб — крокодил захлопнул пасть!`,
      });
      return;
    }

    // Теоретически плохой зуб всегда останется, поэтому поле не может закончиться без укуса.
    turn = opposite(seat);
    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({
      type: 'resign',
      loser: seat,
      winner: opposite(seat),
      tooth: null,
      message: `${bySeat[seat].name} вышел из игры.`,
    });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'press') handlePress(socketId, action.payload);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({
      type: 'disconnect',
      loser: seat,
      winner: opposite(seat),
      tooth: null,
      message: 'Соперник отключился от игры.',
    });
  }

  return {
    id: roomId,
    gameId: 'crocodile-teeth',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {},
  };
}
