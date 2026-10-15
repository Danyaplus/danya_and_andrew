import { randomUUID } from 'node:crypto';
import { getGameDefinition } from '../games/index.js';
import { publicSpectatorSnapshot, spectatableGameIds } from './spectator.js';

export class Matchmaker {
  constructor(io, { onMatchFinished = null, onMatchStarted = null, onMatchEnded = null } = {}) {
    this.io = io;
    this.onMatchFinished = onMatchFinished;
    this.onMatchStarted = onMatchStarted;
    this.onMatchEnded = onMatchEnded;
    this.queues = new Map();
    this.rooms = new Map();
    this.spectators = new Map();
    this.publicStates = new Map();
    this.roomInfo = new Map();
  }

  getQueue(queueKey) {
    if (!this.queues.has(queueKey)) this.queues.set(queueKey, []);
    return this.queues.get(queueKey);
  }

  removeFromQueues(socketId) {
    const removedGameIds = new Set();
    for (const [queueKey, queue] of this.queues.entries()) {
      for (const entry of queue) {
        if (entry.socketId === socketId && entry.gameId) removedGameIds.add(entry.gameId);
      }
      const filtered = queue.filter((entry) => entry.socketId !== socketId);
      if (filtered.length) this.queues.set(queueKey, filtered);
      else this.queues.delete(queueKey);
    }
    return [...removedGameIds];
  }

  leaveQueue(socket, gameId) {
    for (const [queueKey, queue] of this.queues.entries()) {
      const filtered = queue.filter((entry) => !(entry.socketId === socket.id && entry.gameId === gameId));
      if (filtered.length) this.queues.set(queueKey, filtered);
      else this.queues.delete(queueKey);
    }
    socket.emit('queue:left', { gameId });
  }

  joinQueue(socket, { gameId, playerName, mode = 'public', partyId = null }) {
    if (socket.data.currentRoom) {
      socket.emit('game:error', { gameId, message: 'Сначала заверши текущий матч.' });
      return;
    }

    const game = getGameDefinition(gameId);
    if (!game) {
      socket.emit('game:error', { gameId, message: 'Эта игра не подключена на сервере.' });
      return;
    }

    const partyMode = mode === 'party';
    if (partyMode && (!partyId || socket.data.partyId !== partyId)) {
      socket.emit('game:error', { gameId, message: 'Вечеринка больше не активна.' });
      return;
    }

    this.removeFromQueues(socket.id);
    this.stopWatching(socket);

    const queueKey = partyMode ? `party:${partyId}:${gameId}` : `public:${gameId}`;
    const queue = this.getQueue(queueKey);

    while (queue.length > 0) {
      const opponent = queue.shift();
      const opponentSocket = this.io.sockets.sockets.get(opponent.socketId);
      if (!opponentSocket || opponentSocket.id === socket.id) continue;
      if (socket.data.userId && opponentSocket.data.userId === socket.data.userId) continue;
      if (partyMode && opponentSocket.data.partyId !== partyId) continue;

      if (queue.length === 0) this.queues.delete(queueKey);
      this.createMatch(game, [
        { socketId: opponentSocket.id, name: opponent.name },
        { socketId: socket.id, name: playerName },
      ]);
      return;
    }

    queue.push({
      socketId: socket.id,
      gameId,
      partyId: partyMode ? partyId : null,
      mode: partyMode ? 'party' : 'public',
      name: typeof playerName === 'string' ? playerName.slice(0, 28) : 'Игрок',
      joinedAt: Date.now(),
    });
    socket.emit('queue:waiting', {
      gameId,
      mode: partyMode ? 'party' : 'public',
      partyId: partyMode ? partyId : null,
    });
  }

  findPlayingRoom(userId) {
    if (!userId) return null;
    for (const [roomId, info] of this.roomInfo.entries()) {
      if (!info.finished && info.userIds.includes(userId)) return { roomId, gameId: info.gameId };
    }
    return null;
  }

  spectatorCount(roomId) {
    return this.spectators.get(roomId)?.size || 0;
  }

  broadcastSpectators(roomId) {
    const info = this.roomInfo.get(roomId);
    if (!info) return;
    const count = this.spectatorCount(roomId);
    for (const socketId of info.socketIds) this.io.to(socketId).emit('match:watchers', { roomId, count });
    for (const socketId of this.spectators.get(roomId) || []) this.io.to(socketId).emit('match:watchers', { roomId, count });
  }

  watchRoom(socket, roomId, friendId) {
    const info = this.roomInfo.get(roomId);
    const publicState = this.publicStates.get(roomId);
    if (!info || info.finished || !this.rooms.has(roomId) || !info.userIds.includes(friendId)) return false;
    if (!spectatableGameIds.has(info.gameId) || !publicState) return false;
    if (socket.data.currentRoom) return false;
    for (const gameId of this.removeFromQueues(socket.id)) socket.emit('queue:left', { gameId });
    this.stopWatching(socket);
    let watchers = this.spectators.get(roomId);
    if (!watchers) { watchers = new Set(); this.spectators.set(roomId, watchers); }
    watchers.add(socket.id);
    socket.data.watchingRoom = roomId;
    socket.data.watchingFriendId = friendId;
    socket.join(`spectators:${roomId}`);
    socket.emit('watch:started', { roomId, gameId: info.gameId, friendId, viewAs: info.viewForUser[friendId] || null });
    socket.emit('watch:state', { roomId, gameId: info.gameId, state: publicState });
    this.broadcastSpectators(roomId);
    return true;
  }

  stopWatching(socket, { silent = true } = {}) {
    const roomId = socket.data.watchingRoom;
    if (!roomId) return;
    socket.data.watchingRoom = null;
    socket.data.watchingFriendId = null;
    socket.leave(`spectators:${roomId}`);
    const watchers = this.spectators.get(roomId);
    watchers?.delete(socket.id);
    if (watchers?.size === 0) this.spectators.delete(roomId);
    if (!silent) socket.emit('watch:ended', { roomId });
    this.broadcastSpectators(roomId);
  }

  updateSpectatorState(roomId, state) {
    const publicState = publicSpectatorSnapshot(state);
    if (!publicState) return;
    this.publicStates.set(roomId, publicState);
    if (!this.spectatorCount(roomId)) return;
    this.io.to(`spectators:${roomId}`).emit('watch:state', { roomId, gameId: state.gameId, state: publicState });
  }

  createMatch(game, players) {
    const roomId = randomUUID();
    // Capture account IDs at start; a client cannot claim somebody else's progress.
    const userIds = players.map(({ socketId }) => this.io.sockets.sockets.get(socketId)?.data?.userId || null);
    const info = { gameId: game.id, userIds, socketIds: players.map(p => p.socketId), viewForUser: {}, finished: false };
    this.roomInfo.set(roomId, info);
    let completionRecorded = false;
    // Capture the final server-produced per-player snapshot, never browser claims.
    const lastStates = new Map();
    const thisMatchmaker = this;
    const observedIo = {
      // Admin authorization in chess inspects the real Socket.IO socket registry.
      sockets: this.io.sockets,
      to: (socketId) => ({
        emit: (event, payload) => {
          if (event === 'game:state' && payload?.roomId === roomId) {
            lastStates.set(socketId, payload);
            if (userIds[players.findIndex(p => p.socketId === socketId)]) {
              info.viewForUser[userIds[players.findIndex(p => p.socketId === socketId)]] =
                payload.playerColor ?? payload.playerSeat ?? payload.playerSymbol ?? payload.playerSide ?? null;
            }
            if (socketId === players[0].socketId) thisMatchmaker.updateSpectatorState(roomId, payload);
          }
          this.io.to(socketId).emit(event, payload);
        },
      }),
    };
    function outcomeFor(socketId) {
      const snapshot = lastStates.get(socketId);
      if (!snapshot || snapshot.status !== 'finished' || !snapshot.result || !('winner' in snapshot.result)) return 'completed';
      const winner = snapshot.result.winner;
      if (winner == null) return 'draw';
      const seat = snapshot.playerSeat ?? snapshot.playerColor ?? snapshot.playerSymbol ?? snapshot.playerSide
        ?? snapshot.playerSlot ?? snapshot.playerTeam ?? null;
      if (seat == null) return 'completed';
      return String(winner) === String(seat) ? 'win' : 'loss';
    }

    const room = game.createRoom({
      roomId,
      players,
      io: observedIo,
      onFinish: ({ roomId: finishedRoomId, players: finishedPlayers }) => {
        info.finished = true;
        this.onMatchEnded?.({ userIds, roomId, gameId: game.id });
        if (!completionRecorded) {
          completionRecorded = true;
          // This hook only records completed sessions, never accepts browser badges.
          Promise.resolve(this.onMatchFinished?.({ roomId: finishedRoomId, gameId: game.id, userIds, outcomes: Object.fromEntries(players.map((player, i) => [userIds[i], outcomeFor(player.socketId)]).filter(([id]) => id)) }))
            .catch((error) => console.error('[achievements] Match hook failed:', error));
        }
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
          for (const socketId of this.spectators.get(finishedRoomId) || []) {
            const watcher = this.io.sockets.sockets.get(socketId);
            if (watcher) this.stopWatching(watcher, { silent: false });
          }
          this.spectators.delete(finishedRoomId);
          this.publicStates.delete(finishedRoomId);
          this.roomInfo.delete(finishedRoomId);
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
    this.onMatchStarted?.({ userIds, roomId, gameId: game.id });
    this.broadcastSpectators(roomId);
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
    if (socket.data.currentRoom !== roomId || !room.playerSocketIds.includes(socket.id)) return;
    try {
      room.handleAction(socket.id, action);
    } catch (error) {
      // Malformed/malicious input must not terminate the whole Node process.
      console.error(`[games] Rejected action for room ${roomId}:`, error);
      socket.emit('game:error', { message: 'Недопустимое действие. Попробуй ещё раз.' });
    }
  }

  handleDisconnect(socket) {
    this.stopWatching(socket);
    this.removeFromQueues(socket.id);
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    room?.handleDisconnect(socket.id);
  }
}
