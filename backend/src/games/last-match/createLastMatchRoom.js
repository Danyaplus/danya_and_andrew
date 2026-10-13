import { randomInt } from 'node:crypto';

const GAME_ID = 'last-match';
const STARTING_MATCHES = 20;
const MAX_TAKE = 3;

function other(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function safeName(name) {
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 28) : 'Игрок';
}

export function createLastMatchRoom({ roomId, players, io, onFinish }) {
  const assigned = randomInt(2) ? [...players].reverse() : [...players];
  const seats = {
    a: { socketId: assigned[0].socketId, name: safeName(assigned[0].name) },
    b: { socketId: assigned[1].socketId, name: safeName(assigned[1].name) },
  };

  let remaining = STARTING_MATCHES;
  let turn = randomInt(2) ? 'a' : 'b';
  let moveNumber = 0;
  let status = 'playing';
  let result = null;
  let lastMove = null;
  let history = [];
  let finishedOnce = false;

  function seatFor(socketId) {
    if (socketId === seats.a.socketId) return 'a';
    if (socketId === seats.b.socketId) return 'b';
    return null;
  }

  function snapshot(socketId) {
    const playerSeat = seatFor(socketId);
    return {
      gameId: GAME_ID,
      roomId,
      status,
      playerSeat,
      opponentSeat: playerSeat ? other(playerSeat) : null,
      players: {
        a: { name: seats.a.name },
        b: { name: seats.b.name },
      },
      remaining,
      initialMatches: STARTING_MATCHES,
      maxTake: MAX_TAKE,
      turn,
      moveNumber,
      lastMove,
      history,
      result,
    };
  }

  function emitState() {
    io.to(seats.a.socketId).emit('game:state', snapshot(seats.a.socketId));
    io.to(seats.b.socketId).emit('game:state', snapshot(seats.b.socketId));
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(seats) });
    }
  }

  function handleAction(socketId, action) {
    const seat = seatFor(socketId);
    if (!seat || status !== 'playing' || !action || typeof action !== 'object') return;

    if (action.type === 'resign') {
      finish({
        type: 'resign',
        winner: other(seat),
        loser: seat,
        message: `${seats[seat].name} покинул игру.`,
      });
      return;
    }

    if (action.type !== 'take' || seat !== turn) return;
    const count = action.count;
    // Server owns the pile; rejects doubles, invalid counts and moves out of turn.
    if (!Number.isInteger(count) || count < 1 || count > MAX_TAKE || count > remaining) return;

    remaining -= count;
    moveNumber += 1;
    lastMove = { number: moveNumber, seat, count, remaining };
    history = [...history, lastMove].slice(-6);

    if (remaining === 0) {
      finish({
        type: 'last-match',
        winner: other(seat),
        loser: seat,
        message: `${seats[seat].name} взял последнюю спичку и проиграл!`,
      });
      return;
    }

    turn = other(seat);
    emitState();
  }

  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat && status === 'playing') {
      finish({
        type: 'disconnect',
        winner: other(seat),
        loser: seat,
        message: `${seats[seat].name} отключился. Победа достаётся сопернику.`,
      });
    }
  }

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [seats.a.socketId, seats.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {},
  };
}
