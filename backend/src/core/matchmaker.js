import { randomUUID } from 'node:crypto';
import { getGameDefinition } from '../games/index.js';
import { publicSpectatorSnapshot, spectatableGameIds } from './spectator.js';
import { evaluateRewardEligibility } from './fairPlay.js';

export const RECONNECT_GRACE_MS = 20_000;
// 2-second probes, 6-second allowance: a stalled socket is detected before
// Socket.IO’s ordinary disconnect timeout while tolerating brief packet loss.
export const MATCH_HEARTBEAT_TIMEOUT_MS = 6_000;
export const MATCH_HEARTBEAT_SCAN_MS = 1_500;

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
    this.healthTimer = setInterval(() => this.checkMatchConnectionHealth(), MATCH_HEARTBEAT_SCAN_MS);
    this.healthTimer.unref?.();
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

  queuedSocketForAccount(userId, exceptSocketId = null) {
    if (!userId) return null;
    for (const queue of this.queues.values()) {
      for (const entry of queue) {
        if (entry.socketId === exceptSocketId) continue;
        const queuedSocket = this.io.sockets.sockets.get(entry.socketId);
        if (queuedSocket?.data.userId === userId) return queuedSocket;
      }
    }
    return null;
  }

  joinQueue(socket, { gameId, playerName, mode = 'public', partyId = null }) {
    if (socket.data.currentRoom || this.findPlayingRoom(socket.data.userId)) {
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

    if (this.queuedSocketForAccount(socket.data.userId, socket.id)) {
      socket.emit('game:error', { gameId, message: 'Этот аккаунт уже ищет матч в другой вкладке.' });
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
      if (opponentSocket.data.currentRoom || this.findPlayingRoom(opponentSocket.data.userId)) continue;
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
    for (const socketId of info.connections || info.socketIds) {
      if (socketId) this.io.to(socketId).emit('match:watchers', { roomId, count });
    }
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
    const info = { gameId: game.id, userIds, socketIds: players.map(p => p.socketId),
      // Socket IDs inside game rooms are stable logical seats. Connections can change on reconnect.
      connections: players.map(p => p.socketId), resumeTokens: players.map(() => randomUUID()),
      disconnectTimers: [null, null],
      awayUntil: [null, null], lastHeartbeatAt: [Date.now(), Date.now()], viewForUser: {},
      startedAt: Date.now(), finished: false, forfeited: false };
    this.roomInfo.set(roomId, info);
    let completionRecorded = false;
    // Capture the final server-produced per-player snapshot, never browser claims.
    const lastStates = new Map();
    const actionCounts = new Map();
    info.actionCounts = actionCounts;
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
          const seat = info.socketIds.indexOf(socketId);
          const actualSocketId = seat >= 0 ? info.connections[seat] : socketId;
          if (actualSocketId) this.io.to(actualSocketId).emit(event, payload);
        },
      }),
    };

    const room = game.createRoom({
      roomId,
      players,
      io: observedIo,
      onFinish: ({ roomId: finishedRoomId, players: finishedPlayers }) => {
        info.finished = true;
        for (const timer of info.disconnectTimers) if (timer) clearTimeout(timer);
        info.disconnectTimers = [null, null];
        this.onMatchEnded?.({ userIds, roomId, gameId: game.id });
        if (!completionRecorded) {
          completionRecorded = true;
          const outcomes = evaluateRewardEligibility({ userIds, snapshots: lastStates,
            socketIds: info.socketIds, elapsedMs: Date.now() - info.startedAt, actionCounts,
            forfeited: info.forfeited });
          // No rewards for leaving, idling, missing verified results or a match that
          // ended during a disconnected seat's recovery window.
          if (outcomes && info.connections.every(Boolean)) {
            Promise.resolve()
              .then(() => this.onMatchFinished?.({ roomId: finishedRoomId, gameId: game.id,
                userIds, outcomes, elapsedMs: Date.now() - info.startedAt }))
              .catch((error) => console.error('[achievements] Match hook failed:', error));
          }
        }
        for (const player of finishedPlayers) {
          const playerSocket = this.io.sockets.sockets.get(player.socketId);
          const seat = info.socketIds.indexOf(player.socketId);
          const connectedSocket = this.io.sockets.sockets.get(seat >= 0 ? info.connections[seat] : player.socketId);
          if (connectedSocket?.data.currentRoom === finishedRoomId) {
            connectedSocket.data.currentRoom = null;
            connectedSocket.data.roomSeatId = null;
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
      playerSocket.data.roomSeatId = player.socketId;
      playerSocket.join(roomId);
      const seat = info.socketIds.indexOf(player.socketId);
      playerSocket.emit('match:started', { gameId: game.id, roomId, resumeToken: info.resumeTokens[seat] });
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

  // Heartbeat is accepted only from the currently bound socket and logical
  // seat. This never trusts a browser-supplied room/seat/user identity.
  receiveMatchHeartbeat(socket, payload, acknowledge) {
    const roomId = socket.data.currentRoom;
    const info = this.roomInfo.get(roomId);
    const seat = info?.socketIds.indexOf(socket.data.roomSeatId || socket.id) ?? -1;
    const valid = Boolean(info && !info.finished && roomId && payload?.roomId === roomId
      && seat >= 0 && info.connections[seat] === socket.id);
    if (valid) info.lastHeartbeatAt[seat] = Date.now();
    if (typeof acknowledge === 'function') acknowledge({ ok: valid, roomId: valid ? roomId : null });
  }

  // Socket.IO can remain "connected" in both browsers for many seconds after
  // a Wi-Fi -> mobile-data switch. Do not wait for the transport to time out:
  // pause the room and tell the other player when application probes stop.
  checkMatchConnectionHealth() {
    const now = Date.now();
    for (const [roomId, info] of this.roomInfo) {
      if (info.finished || !this.rooms.has(roomId)) continue;
      for (let seat = 0; seat < info.connections.length; seat += 1) {
        const socketId = info.connections[seat];
        if (!socketId) continue;
        if (now - (info.lastHeartbeatAt?.[seat] || info.startedAt) < MATCH_HEARTBEAT_TIMEOUT_MS) continue;
        const oldSocket = this.io.sockets.sockets.get(socketId);
        if (oldSocket?.data.currentRoom === roomId) {
          this.temporarilyDisconnect(oldSocket);
          // The browser might reconnect on its original Socket.IO session.
          oldSocket.emit('match:connection:lost', { roomId, gameId: info.gameId });
        } else {
          // The socket disappeared without a regular disconnect event.
          this.detachSeat(roomId, seat);
        }
      }
    }
  }

  detachSeat(roomId, seat) {
    const info = this.roomInfo.get(roomId);
    if (!info || info.finished || !info.connections[seat]) return;
    const deadlineAt = Date.now() + RECONNECT_GRACE_MS;
    info.connections[seat] = null;
    info.awayUntil[seat] = deadlineAt;
    try { this.rooms.get(roomId)?.pause?.(); }
    catch (error) { console.error('[match] Pause failed:', error); }
    for (const otherId of info.connections) {
      if (otherId) this.io.to(otherId).emit('match:opponent:away', { roomId, deadlineAt });
    }
    info.disconnectTimers[seat] = setTimeout(() => this.expireDisconnectedSeat(roomId, seat), RECONNECT_GRACE_MS);
    info.disconnectTimers[seat].unref?.();
  }

  // Called by a newly authenticated socket after a network drop or full page reload.
  // The account is checked server-side: another account can never claim the seat.
  resumeMatch(socket, { roomId, resumeToken, gameId } = {}) {
    // Secret resume tokens are unique per seat and survive only in this browser tab.
    // They also allow guests (without accounts) to resume after a full page reload.
    if (typeof roomId !== 'string' || roomId.length > 100 ||
      typeof resumeToken !== 'string' || resumeToken.length > 100) {
      socket.emit('match:resume:unavailable', { gameId });
      return false;
    }
    const info = this.roomInfo.get(roomId);
    const room = this.rooms.get(roomId);
    if (!info || !room || info.finished || (gameId && gameId !== info.gameId)) {
      socket.emit('match:resume:unavailable', { gameId });
      return false;
    }
    const seat = info.resumeTokens.indexOf(resumeToken);
    if (seat < 0 || (info.userIds[seat] && info.userIds[seat] !== socket.data.userId) ||
      (info.userIds[seat] == null && socket.data.userId != null)) {
      socket.emit('match:resume:unavailable', { gameId });
      return false;
    }
    const currentlyConnectedId = info.connections[seat];
    if (currentlyConnectedId && currentlyConnectedId !== socket.id
      && this.io.sockets.sockets.has(currentlyConnectedId)) {
      socket.emit('match:resume:busy', { gameId: info.gameId });
      return false;
    }
    if (socket.data.currentRoom && socket.data.currentRoom !== roomId) {
      socket.emit('match:resume:busy', { gameId: info.gameId });
      return false;
    }
    this.removeFromQueues(socket.id);
    this.stopWatching(socket);
    if (info.disconnectTimers[seat]) clearTimeout(info.disconnectTimers[seat]);
    info.disconnectTimers[seat] = null;
    info.awayUntil[seat] = null;
    info.connections[seat] = socket.id;
    info.lastHeartbeatAt[seat] = Date.now();
    socket.data.currentRoom = roomId;
    socket.data.roomSeatId = info.socketIds[seat];
    socket.join(roomId);
    socket.emit('match:resumed', { roomId, gameId: info.gameId, resumeToken });
    room.emitState();
    for (const otherId of info.connections) {
      if (otherId && otherId !== socket.id) {
        this.io.to(otherId).emit('match:opponent:back', { roomId });
      }
    }
    const missingSeat = info.connections.findIndex(id => id === null);
    if (missingSeat >= 0) {
      socket.emit('match:opponent:away', {
        roomId, deadlineAt: info.awayUntil[missingSeat],
      });
    } else {
      try { room.resume?.(); } catch (error) { console.error('[match] Resume failed:', error); }
    }
    this.broadcastSpectators(roomId);
    return true;
  }

  expireDisconnectedSeat(roomId, seat, { alreadyNotified = false, alreadyHandled = false } = {}) {
    const info = this.roomInfo.get(roomId);
    if (!info || info.finished || info.connections[seat] !== null) return;
    info.disconnectTimers[seat] = null;
    info.forfeited = true; // Anti-farm: technical wins earn no XP / CODI / quests.
    const room = this.rooms.get(roomId);
    const logicalId = info.socketIds[seat];
    const winnerSeat = 1 - seat;
    const winnerSocketId = info.connections[winnerSeat];
    if (winnerSocketId && !alreadyNotified) {
      this.io.to(winnerSocketId).emit('match:technical-result', {
        roomId, gameId: info.gameId, outcome: 'win', reason: 'opponent-disconnected',
      });
    }
    // Existing game-specific disconnect handlers decide the in-game result.
    if (!alreadyHandled) {
      try { room?.handleDisconnect(logicalId); }
      catch (error) { console.error('[match] Disconnect finish failed:', error); }
    }
    // A few games have no terminal disconnect handler. Do not leave them locked forever.
    if (!info.finished) {
      info.finished = true;
      for (const timer of info.disconnectTimers) if (timer) clearTimeout(timer);
      info.disconnectTimers = [null, null];
      this.onMatchEnded?.({ userIds: info.userIds, roomId, gameId: info.gameId });
      if (winnerSocketId) {
        const survivor = this.io.sockets.sockets.get(winnerSocketId);
        if (survivor?.data.currentRoom === roomId) {
          survivor.data.currentRoom = null;
          survivor.data.roomSeatId = null;
        }
      }
      room?.destroy();
      for (const watcherId of this.spectators.get(roomId) || []) {
        const watcher = this.io.sockets.sockets.get(watcherId);
        if (watcher) this.stopWatching(watcher, { silent: false });
      }
      this.spectators.delete(roomId);
      this.rooms.delete(roomId);
      this.publicStates.delete(roomId);
      this.roomInfo.delete(roomId);
    }
  }

  temporarilyDisconnect(socket) {
    const roomId = socket.data.currentRoom;
    const info = this.roomInfo.get(roomId);
    if (!info || info.finished) return;
    const seat = info.socketIds.indexOf(socket.data.roomSeatId || socket.id);
    if (seat < 0 || info.connections[seat] !== socket.id) return;
    socket.data.currentRoom = null;
    socket.data.roomSeatId = null;
    socket.leave(roomId);
    this.detachSeat(roomId, seat);
  }

  leaveMatch(socket) {
    const roomId = socket.data.currentRoom;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    const info = this.roomInfo.get(roomId);
    if (!info) return;
    const logicalId = socket.data.roomSeatId || socket.id;
    const seat = info.socketIds.indexOf(logicalId);
    if (seat < 0 || info.connections[seat] !== socket.id) return;
    if (!info.finished) info.forfeited = true;
    socket.data.currentRoom = null;
    socket.data.roomSeatId = null;
    info.connections[seat] = null;
    socket.leave(roomId);
    // Explicitly leaving is different from a temporary connection loss.
    for (const otherId of info.connections) {
      if (otherId) this.io.to(otherId).emit('match:technical-result', {
        roomId, gameId: info.gameId, outcome: 'win', reason: 'opponent-left',
      });
    }
    try { room?.handleDisconnect(logicalId); }
    catch (error) { console.error('[match] Leave failed:', error); }
    if (!info.finished) this.expireDisconnectedSeat(roomId, seat, { alreadyNotified: true, alreadyHandled: true });
  }

  handleAction(socket, { roomId, action }) {
    const room = this.rooms.get(roomId);
    if (!room) {
      socket.emit('game:error', { message: 'Матч уже завершён или не существует.' });
      return;
    }
    const info = this.roomInfo.get(roomId);
    const logicalId = socket.data.roomSeatId || socket.id;
    if (socket.data.currentRoom !== roomId || !room.playerSocketIds.includes(logicalId)) return;
    if (!info || info.finished || info.connections.includes(null)) return;
    const seat = info.socketIds.indexOf(logicalId);
    if (seat < 0 || info.connections[seat] !== socket.id) return;
    try {
      // Actions are attributed to stable seats, not transient socket IDs.
      if (info.actionCounts) info.actionCounts.set(logicalId, (info.actionCounts.get(logicalId) || 0) + 1);
      room.handleAction(logicalId, action);
    } catch (error) {
      console.error(`[games] Rejected action for room ${roomId}:`, error);
      socket.emit('game:error', { message: 'Недопустимое действие. Попробуй ещё раз.' });
    }
  }

  handleDisconnect(socket) {
    this.stopWatching(socket);
    this.removeFromQueues(socket.id);
    this.temporarilyDisconnect(socket);
  }
}
