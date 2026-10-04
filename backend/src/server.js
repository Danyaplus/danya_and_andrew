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
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('[db] SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  process.exit(1);
}

const authStore = new AuthStore({ url: SUPABASE_URL, secretKey: SUPABASE_SECRET_KEY });
await authStore.init();
const matchmaker = new Matchmaker(io);
const chatMessages = [];
const REACTION_EMOJIS = new Set(['👍', '❤️', '😂', '😢', '😡']);
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

function safeReaction(value) {
  const emoji = String(value || '');
  return REACTION_EMOJIS.has(emoji) ? emoji : '';
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
    CURRENT_PASSWORD_INVALID: 403,
    AVATAR_INVALID: 400,
    AVATAR_TOO_LARGE: 413,
    EMAIL_INVALID: 400,
    EMAIL_TAKEN: 409,
    DISPLAY_NAME_INVALID: 400,
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

async function dmSummaryPayload(userId) {
  const chats = await authStore.getDirectSummaries(userId);
  return {
    chats: chats.map((item) => ({
      ...item,
      friend: {
        ...item.friend,
        online: Boolean(userSockets.get(item.friend.id)?.size),
      },
    })),
  };
}

async function emitDmSummary(userId) {
  if (!userId) return;
  try {
    emitToUser(userId, 'dm:summary', await dmSummaryPayload(userId));
  } catch (error) {
    console.error('[dm] summary error:', error);
  }
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
  dmSummaryPayload(user.id)
    .then((payload) => socket.emit('dm:summary', payload))
    .catch((error) => console.error('[dm] initial summary error:', error));
  return true;
}

function notifyFriendsChanged(...userIds) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    emitToUser(userId, 'friends:changed', { at: Date.now() });
    void emitDmSummary(userId);
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

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await authStore.register(req.body?.username, req.body?.password);
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await authStore.login(req.body?.username, req.body?.password);
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

app.post('/api/auth/logout', async (req, res) => {
  const token = bearerToken(req);
  if (token) await authStore.revokeToken(token);
  res.json({ ok: true });
});

app.patch('/api/profile/avatar', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const updated = await authStore.updateAvatar(user.id, req.body?.avatar ?? null);
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

app.patch('/api/profile/email', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const updated = await authStore.updateEmail(user.id, req.body?.email ?? '');
    emitToUser(user.id, 'profile:updated', { user: updated });
    res.json({ ok: true, user: updated });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.patch('/api/profile/display-name', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const updated = await authStore.updateDisplayName(user.id, req.body?.displayName ?? '');
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

app.patch('/api/profile/login', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const updated = await authStore.updateUsername(
      user.id,
      req.body?.username ?? '',
      req.body?.currentPassword ?? '',
    );
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

app.patch('/api/profile/password', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const updated = await authStore.changePassword(
      user.id,
      req.body?.currentPassword ?? '',
      req.body?.newPassword ?? '',
    );
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

app.post('/api/friends/request', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const result = await authStore.sendFriendRequest(user.id, req.body?.userId);
    notifyFriendsChanged(user.id, req.body?.userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/friends/accept', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const result = await authStore.acceptFriendRequest(user.id, req.body?.userId);
    notifyFriendsChanged(user.id, req.body?.userId);
    res.json({ ok: true, ...result });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/friends/remove', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const targetId = req.body?.userId;
    const sharedParty = currentPartyForUser(user.id);
    if (sharedParty?.memberIds.includes(targetId)) dissolveParty(sharedParty.id, 'unfriended');
    const result = await authStore.removeFriendRelation(user.id, targetId);
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

    const replySource = payload.replyToId
      ? chatMessages.find((item) => item.id === payload.replyToId)
      : null;

    const message = {
      id: randomUUID(),
      senderId: socket.id,
      userId: authUser.id,
      name: safeName(authUser.displayName || authUser.username),
      avatar: authUser.avatar || null,
      text,
      createdAt: Date.now(),
      replyToId: replySource?.id || null,
      replyTo: replySource ? {
        id: replySource.id,
        userId: replySource.userId,
        name: replySource.name,
        text: replySource.text,
      } : null,
      reactions: {},
    };

    chatMessages.push(message);
    io.emit('chat:message', message);
  });

  socket.on('chat:react', (payload = {}) => {
    const userId = socket.data.userId;
    const emoji = safeReaction(payload.emoji);
    const message = chatMessages.find((item) => item.id === payload.messageId);
    if (!userId || !emoji || !message) return;

    const reactions = message.reactions && typeof message.reactions === 'object'
      ? message.reactions
      : {};
    const ids = new Set(Array.isArray(reactions[emoji]) ? reactions[emoji] : []);
    if (ids.has(userId)) ids.delete(userId);
    else ids.add(userId);
    if (ids.size) reactions[emoji] = [...ids];
    else delete reactions[emoji];
    message.reactions = reactions;

    io.emit('chat:reaction', { messageId: message.id, reactions });
  });

  socket.on('dm:summary:request', async () => {
    const userId = socket.data.userId;
    if (!userId) return;
    try {
      socket.emit('dm:summary', await dmSummaryPayload(userId));
    } catch (error) {
      console.error('[dm] summary request error:', error);
      socket.emit('dm:error', { error: 'SERVER_ERROR' });
    }
  });

  socket.on('dm:history:request', async (payload = {}) => {
    const fromUserId = socket.data.userId;
    const targetUserId = payload.userId;
    if (!fromUserId || !targetUserId || !authStore.areFriends(fromUserId, targetUserId)) {
      socket.emit('dm:error', { error: 'FRIEND_REQUIRED' });
      return;
    }

    try {
      const messages = await authStore.getDirectHistory(fromUserId, targetUserId);
      await authStore.markDirectRead(fromUserId, targetUserId);
      socket.emit('dm:history', { userId: targetUserId, messages });
      await emitDmSummary(fromUserId);
    } catch (error) {
      console.error('[dm] history error:', error);
      socket.emit('dm:error', { error: 'SERVER_ERROR' });
    }
  });

  socket.on('dm:read', async (payload = {}) => {
    const userId = socket.data.userId;
    const friendId = payload.userId;
    if (!userId || !friendId || !authStore.areFriends(userId, friendId)) return;
    try {
      await authStore.markDirectRead(userId, friendId);
      await emitDmSummary(userId);
    } catch (error) {
      console.error('[dm] read error:', error);
    }
  });

  socket.on('dm:send', async (payload = {}) => {
    const fromUserId = socket.data.userId;
    const targetUserId = payload.userId;
    const text = safeMessage(payload.text);
    if (!fromUserId || !targetUserId || !text || !authStore.areFriends(fromUserId, targetUserId)) {
      socket.emit('dm:error', { error: 'FRIEND_REQUIRED' });
      return;
    }

    try {
      const message = await authStore.saveDirectMessage(
        fromUserId,
        targetUserId,
        text,
        payload.replyToId || null,
      );
      emitToUser(fromUserId, 'dm:message', message);
      emitToUser(targetUserId, 'dm:message', message);
      await Promise.all([emitDmSummary(fromUserId), emitDmSummary(targetUserId)]);
    } catch (error) {
      console.error('[dm] send error:', error);
      socket.emit('dm:error', { error: error?.message === 'MESSAGE_NOT_FOUND' ? 'MESSAGE_NOT_FOUND' : 'SERVER_ERROR' });
    }
  });

  socket.on('dm:react', async (payload = {}) => {
    const userId = socket.data.userId;
    const emoji = safeReaction(payload.emoji);
    if (!userId || !emoji || !payload.messageId) return;

    try {
      const reaction = await authStore.toggleDirectReaction(userId, payload.messageId, emoji);
      emitToUser(reaction.fromUserId, 'dm:reaction', reaction);
      emitToUser(reaction.toUserId, 'dm:reaction', reaction);
    } catch (error) {
      console.error('[dm] reaction error:', error);
      socket.emit('dm:error', { error: 'SERVER_ERROR' });
    }
  });

  socket.on('queue:join', (payload) => {
    const authUser = socket.data.userId ? authStore.getPublicUser(socket.data.userId) : null;
    const nextPayload = { ...(payload || {}) };
    if (authUser) nextPayload.playerName = authUser.displayName || authUser.username;

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
  console.log('[db] Account/profile/friend data: Supabase');
});
