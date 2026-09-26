import { randomUUID } from 'node:crypto';
import { getGameDefinition } from '../games/index.js';

export class Matchmaker {
  constructor(io) {
    this.io = io;
    this.queues = new Map();
    this.rooms = new Map();
  }

  getQueue(gameId) {
    if (!this.queues.has(gameId)) this.queues.set(gameId, []);
    return this.queues.get(gameId);
  }

  removeFromQueues(socketId) {
    for (const [gameId, queue] of this.queues.entries()) {
      const filtered = queue.filter((entry) => entry.socketId !== socketId);
      this.queues.set(gameId, filtered);
    }
  }

  leaveQueue(socket, gameId) {
    const queue = this.getQueue(gameId);
    this.queues.set(gameId, queue.filter((entry) => entry.socketId !== socket.id));
    socket.emit('queue:left', { gameId });
  }

  joinQueue(socket, { gameId, playerName }) {
    if (socket.data.currentRoom) {
      socket.emit('game:error', { gameId, message: 'Сначала заверши текущий матч.' });
      return;
    }

    const game = getGameDefinition(gameId);
    if (!game) {
      socket.emit('game:error', { gameId, message: 'Эта игра не подключена на сервере.' });
      return;
    }

    if (socket.data.currentRoom) {
      socket.emit('game:error', { gameId, message: 'Сначала заверши текущий матч.' });
      return;
    }

    this.removeFromQueues(socket.id);

    const queue = this.getQueue(gameId);
    while (queue.length > 0) {
      const opponent = queue.shift();
      const opponentSocket = this.io.sockets.sockets.get(opponent.socketId);
      if (!opponentSocket || opponentSocket.id === socket.id) continue;

      this.createMatch(game, [
        { socketId: opponentSocket.id, name: opponent.name },
        { socketId: socket.id, name: playerName },
      ]);
      return;
    }

    queue.push({
      socketId: socket.id,
      name: typeof playerName === 'string' ? playerName.slice(0, 28) : 'Игрок',
      joinedAt: Date.now(),
    });
    socket.emit('queue:waiting', { gameId });
  }

  createMatch(game, players) {
    const roomId = randomUUID();

    const room = game.createRoom({
      roomId,
      players,
      io: this.io,
      onFinish: ({ roomId: finishedRoomId, players: finishedPlayers }) => {
        for (const player of finishedPlayers) {
          const playerSocket = this.io.sockets.sockets.get(player.socketId);
          if (playerSocket?.data.currentRoom === finishedRoomId) {
            playerSocket.data.currentRoom = null;
          }
        }

        setTimeout(() => {
          const oldRoom = this.rooms.get(finishedRoomId);
          oldRoom?.destroy();
          this.rooms.delete(finishedRoomId);
        }, 5 * 60 * 1000).unref?.();
      },
    });

    this.rooms.set(roomId, room);

    for (const player of players) {
      const playerSocket = this.io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.data.currentRoom = roomId;
      playerSocket.join(roomId);
      playerSocket.emit('match:started', { gameId: game.id, roomId });
    }

    room.emitState();
  }

  syncCurrentRoom(socket) {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    room?.emitState();
  }

  leaveMatch(socket) {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    socket.data.currentRoom = null;
    socket.leave(roomId);
    room?.handleDisconnect(socket.id);
  }

  handleAction(socket, { roomId, action }) {
    const room = this.rooms.get(roomId);
    if (!room) {
      socket.emit('game:error', { message: 'Матч уже завершён или не существует.' });
      return;
    }
    if (!room.playerSocketIds.includes(socket.id)) return;
    room.handleAction(socket.id, action);
  }

  handleDisconnect(socket) {
    this.removeFromQueues(socket.id);
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    room?.handleDisconnect(socket.id);
  }
}
