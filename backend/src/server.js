import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { AuthStore } from './core/authStore.js';
import { Matchmaker } from './core/matchmaker.js';
import { gameRegistry } from './games/index.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const accountsFile = process.env.ACCOUNTS_FILE || path.resolve(__dirname, '../data/accounts.json');

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '700kb' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'PATCH'],
  },
});

const authStore = new AuthStore(accountsFile);
const matchmaker = new Matchmaker(io);
const chatMessages = [];
const directMessages = new Map();
const userSockets = new Map();
const parties = new Map();
const userParty = new Map();
let clearChatTimer = null;

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, 28);
  return trimmed || 'Игрок';
}

function safeMessage(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 500);
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function requestUser(req) {
  return authStore.getUserByToken(bearerToken(req));
}

function requireUser(req, res) {
  const user = requestUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    return null;
  }
  return user;
}

function authErrorResponse(res, error) {
  const code = error?.message || 'UNKNOWN';
  const status = {
    USERNAME_INVALID: 400,
    PASSWORD_INVALID: 400,
    USERNAME_TAKEN: 409,
    AUTH_INVALID: 401,
    AVATAR_INVALID: 400,
    AVATAR_TOO_LARGE: 413,
    EMAIL_INVALID: 400,
    EMAIL_TAKEN: 409,
    USER_NOT_FOUND: 404,
    FRIEND_INVALID: 400,
    FRIEND_REQUEST_NOT_FOUND: 404,
    PARTY_INVALID: 400,
    PARTY_FRIEND_REQUIRED: 403,
  }[code] || 400;
  res.status(status).json({ ok: false, error: code });
}

function onlineUserIds() {
  return [...userSockets.entries()]
    .filter(([, sockets]) => sockets.size > 0)
    .map(([userId]) => userId);
}

function emitToUser(userId, event, payload) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const socketId of sockets) io.to(socketId).emit(event, payload);
}

function setPartyOnUserSockets(userId, partyId) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const socketId of sockets) {
    const memberSocket = io.sockets.sockets.get(socketId);
    if (memberSocket) memberSocket.data.partyId = partyId || null;
  }
}

function partyPayload(party) {
  if (!party) return null;
  return {
    id: party.id,
    createdAt: party.createdAt,
    members: party.memberIds.map((userId) => authStore.getPublicUser(userId)).filter(Boolean),
  };
}

function emitParty(party) {
  if (!party) return;
  const payload = partyPayload(party);
  for (const userId of party.memberIds) {
    setPartyOnUserSockets(userId, party.id);
    emitToUser(userId, 'party:update', { party: payload });
  }
}

function dissolveParty(partyId, reason = 'left') {
  const party = parties.get(partyId);
  if (!party) return;
  parties.delete(partyId);
  for (const userId of party.memberIds) {
    if (userParty.get(userId) === partyId) userParty.delete(userId);
    const sockets = userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        const removedGames = matchmaker.removeFromQueues(socketId);
        const memberSocket = io.sockets.sockets.get(socketId);
        for (const gameId of removedGames) memberSocket?.emit('queue:left', { gameId });
      }
    }
    setPartyOnUserSockets(userId, null);
    emitToUser(userId, 'party:cleared', { partyId, reason });
  }
}

function createParty(ownerId, friendId) {
  if (!friendId || ownerId === friendId) throw new Error('PARTY_INVALID');
  if (!authStore.getPublicUser(friendId)) throw new Error('USER_NOT_FOUND');
  if (!authStore.areFriends(ownerId, friendId)) throw new Error('PARTY_FRIEND_REQUIRED');

  const oldOwnerParty = userParty.get(ownerId);
  const oldFriendParty = userParty.get(friendId);
  if (oldOwnerParty) dissolveParty(oldOwnerParty, 'replaced');
  if (oldFriendParty && oldFriendParty !== oldOwnerParty) dissolveParty(oldFriendParty, 'replaced');

  const party = {
    id: randomUUID(),
    memberIds: [ownerId, friendId],
    createdAt: Date.now(),
  };
  parties.set(party.id, party);
  userParty.set(ownerId, party.id);
  userParty.set(friendId, party.id);

  // A newly created party starts from a clean matchmaking state.
  for (const userId of party.memberIds) {
    const sockets = userSockets.get(userId);
    if (!sockets) continue;
    for (const socketId of sockets) {
      const removedGames = matchmaker.removeFromQueues(socketId);
      const memberSocket = io.sockets.sockets.get(socketId);
      for (const gameId of removedGames) memberSocket?.emit('queue:left', { gameId });
    }
  }

  emitParty(party);
  return party;
}

function currentPartyForUser(userId) {
  const partyId = userParty.get(userId);
  return partyId ? parties.get(partyId) || null : null;
}

function dmKey(a, b) {
  return [a, b].sort().join(':');
}

function directHistory(a, b) {
  return directMessages.get(dmKey(a, b)) || [];
}

function detachSocketUser(socket) {
  const userId = socket.data.userId;
  if (!userId) return;
  const sockets = userSockets.get(userId);
  sockets?.delete(socket.id);
  socket.data.userId = null;
  socket.data.authUser = null;
  socket.data.partyId = null;

  if (!sockets || sockets.size === 0) {
    userSockets.delete(userId);
    io.emit('presence:update', { userId, online: false });
  }
}

function attachSocketUser(socket, user) {
  if (!user) return false;
  if (socket.data.userId === user.id) {
    socket.data.authUser = user;
    socket.data.partyId = userParty.get(user.id) || null;
    return true;
  }

  detachSocketUser(socket);
  const wasOffline = !userSockets.has(user.id) || userSockets.get(user.id).size === 0;
  const sockets = userSockets.get(user.id) || new Set();
  sockets.add(socket.id);
  userSockets.set(user.id, sockets);
  socket.data.userId = user.id;
  socket.data.authUser = user;
  socket.data.partyId = userParty.get(user.id) || null;

  if (wasOffline) io.emit('presence:update', { userId: user.id, online: true });
  socket.emit('auth:user', { user: authStore.getPrivateUser(user.id) });
  socket.emit('presence:snapshot', { onlineUserIds: onlineUserIds() });
  const party = currentPartyForUser(user.id);
  if (party) socket.emit('party:update', { party: partyPayload(party) });
  return true;
}

function notifyFriendsChanged(...userIds) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    emitToUser(userId, 'friends:changed', { at: Date.now() });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'danya-andrew-server',
    games: [...gameRegistry.keys()],
  });
});

app.get('/api/games', (_req, res) => {
  res.json([...gameRegistry.values()].map(({ id, title }) => ({ id, title })));
});

app.post('/api/auth/register', (req, res) => {
  try {
    const result = authStore.register(req.body?.username, req.body?.password);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const result = authStore.login(req.body?.username, req.body?.password);
    res.json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ ok: true, user: authStore.getPrivateUser(user.id) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) authStore.revokeToken(token);
  res.json({ ok: true });
});

app.patch('/api/profile/avatar', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const updated = authStore.updateAvatar(user.id, req.body?.avatar ?? null);
    emitToUser(user.id, 'profile:updated', { user: updated });
    const friends = authStore.getFriendsPayload(user.id).friends.map((item) => item.id);
    notifyFriendsChanged(...friends);
    const party = currentPartyForUser(user.id);
    if (party) emitParty(party);
    res.json({ ok: true, user: updated });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.patch('/api/profile/email', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const updated = authStore.updateEmail(user.id, req.body?.email ?? '');
    emitToUser(user.id, 'profile:updated', { user: updated });
    res.json({ ok: true, user: updated });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.get('/api/users/search', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const users = authStore.searchUsers(user.id, String(req.query?.q || '')).map((item) => ({
    ...item,
    online: Boolean(userSockets.get(item.id)?.size),
  }));
  res.json({ ok: true, users });
});

app.get('/api/friends', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const payload = authStore.getFriendsPayload(user.id);
    const withPresence = (items) => items.map((item) => ({
      ...item,
      online: Boolean(userSockets.get(item.id)?.size),
    }));
    res.json({
      ok: true,
      friends: withPresence(payload.friends),
      incoming: withPresence(payload.incoming),
      outgoing: withPresence(payload.outgoing),
    });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/friends/request', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const result = authStore.sendFriendRequest(user.id, req.body?.userId);
    notifyFriendsChanged(user.id, req.body?.userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/friends/accept', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const result = authStore.acceptFriendRequest(user.id, req.body?.userId);
    notifyFriendsChanged(user.id, req.body?.userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/friends/remove', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const targetId = req.body?.userId;
    const sharedParty = currentPartyForUser(user.id);
    if (sharedParty?.memberIds.includes(targetId)) dissolveParty(sharedParty.id, 'unfriended');
    const result = authStore.removeFriendRelation(user.id, targetId);
    notifyFriendsChanged(user.id, targetId);
    res.json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.get('/api/party/current', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ ok: true, party: partyPayload(currentPartyForUser(user.id)) });
});

app.post('/api/party/create', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const party = createParty(user.id, req.body?.userId);
    res.json({ ok: true, party: partyPayload(party) });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/party/leave', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const party = currentPartyForUser(user.id);
  if (party) dissolveParty(party.id, 'left');
  res.json({ ok: true });
});

if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

function sendChatHistory(socket) {
  socket.emit('chat:history', { messages: chatMessages });
}

function cancelScheduledChatClear() {
  if (!clearChatTimer) return;
  clearTimeout(clearChatTimer);
  clearChatTimer = null;
}

function scheduleChatClearIfEmpty() {
  cancelScheduledChatClear();
  clearChatTimer = setTimeout(() => {
    if (io.sockets.sockets.size !== 0) return;
    chatMessages.length = 0;
    clearChatTimer = null;
    console.log('[chat] История очищена: на сайте никого нет.');
  }, 2000);
  clearChatTimer.unref?.();
}

io.on('connection', (socket) => {
  cancelScheduledChatClear();
  socket.data.currentRoom = null;
  socket.data.userId = null;
  socket.data.authUser = null;
  socket.data.partyId = null;

  const handshakeUser = authStore.getUserByToken(socket.handshake.auth?.token);
  if (handshakeUser) attachSocketUser(socket, handshakeUser);

  sendChatHistory(socket);

  socket.on('auth:session', (payload = {}) => {
    const user = authStore.getUserByToken(payload.token);
    if (!user) {
      detachSocketUser(socket);
      socket.emit('auth:error', { error: 'AUTH_INVALID' });
      return;
    }
    attachSocketUser(socket, user);
  });

  socket.on('auth:logout', () => {
    detachSocketUser(socket);
  });

  socket.on('presence:request', () => {
    socket.emit('presence:snapshot', { onlineUserIds: onlineUserIds() });
  });

  socket.on('chat:history:request', () => {
    sendChatHistory(socket);
  });

  socket.on('chat:send', (payload = {}) => {
    const text = safeMessage(payload.text);
    const authUser = socket.data.userId ? authStore.getPublicUser(socket.data.userId) : null;
    if (!text || !authUser) return;

    const message = {
      id: randomUUID(),
      senderId: socket.id,
      userId: authUser.id,
      name: safeName(authUser.username),
      avatar: authUser.avatar || null,
      text,
      createdAt: Date.now(),
    };

    chatMessages.push(message);
    io.emit('chat:message', message);
  });

  socket.on('dm:history:request', (payload = {}) => {
    const fromUserId = socket.data.userId;
    const targetUserId = payload.userId;
    if (!fromUserId || !targetUserId || !authStore.areFriends(fromUserId, targetUserId)) {
      socket.emit('dm:error', { error: 'FRIEND_REQUIRED' });
      return;
    }
    socket.emit('dm:history', {
      userId: targetUserId,
      messages: directHistory(fromUserId, targetUserId),
    });
  });

  socket.on('dm:send', (payload = {}) => {
    const fromUserId = socket.data.userId;
    const targetUserId = payload.userId;
    const text = safeMessage(payload.text);
    if (!fromUserId || !targetUserId || !text || !authStore.areFriends(fromUserId, targetUserId)) {
      socket.emit('dm:error', { error: 'FRIEND_REQUIRED' });
      return;
    }

    const author = authStore.getPublicUser(fromUserId);
    const message = {
      id: randomUUID(),
      fromUserId,
      toUserId: targetUserId,
      name: safeName(author?.username),
      avatar: author?.avatar || null,
      text,
      createdAt: Date.now(),
    };

    const key = dmKey(fromUserId, targetUserId);
    const history = directMessages.get(key) || [];
    history.push(message);
    if (history.length > 100) history.splice(0, history.length - 100);
    directMessages.set(key, history);

    emitToUser(fromUserId, 'dm:message', message);
    emitToUser(targetUserId, 'dm:message', message);
  });

  socket.on('queue:join', (payload) => {
    const authUser = socket.data.userId ? authStore.getPublicUser(socket.data.userId) : null;
    const nextPayload = { ...(payload || {}) };
    if (authUser) nextPayload.playerName = authUser.username;

    if (nextPayload.mode === 'party') {
      const activeParty = currentPartyForUser(socket.data.userId);
      if (!activeParty || nextPayload.partyId !== activeParty.id) {
        socket.emit('game:error', { gameId: nextPayload.gameId, message: 'Вечеринка больше не активна.' });
        return;
      }
      socket.data.partyId = activeParty.id;
    }

    matchmaker.joinQueue(socket, nextPayload);
  });

  socket.on('queue:leave', (payload) => {
    if (!payload?.gameId) return;
    matchmaker.leaveQueue(socket, payload.gameId);
  });

  socket.on('game:action', (payload) => {
    if (!payload?.roomId || !payload?.action) return;
    matchmaker.handleAction(socket, payload);
  });

  socket.on('match:leave', () => {
    matchmaker.leaveMatch(socket);
  });

  socket.on('disconnect', () => {
    detachSocketUser(socket);
    matchmaker.handleDisconnect(socket);
    scheduleChatClearIfEmpty();
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Danya & Andrew server: http://localhost:${PORT}`);
  console.log(`Games: ${[...gameRegistry.keys()].join(', ') || 'none'}`);
  console.log(`[auth] Accounts file: ${accountsFile}`);
});
