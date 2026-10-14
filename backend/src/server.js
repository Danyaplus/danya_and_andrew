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
import { getAchievementProfile, recordCompletedMatch, achievementCatalog } from './core/achievements.js';
import { getProgressRecord, progressFromXp } from './core/progression.js';
import { getQuests, publicCompetitionProfile } from './core/competition.js';
import { listNotifications, saveNotification, markNotificationRead, markAllNotificationsRead } from './core/notifications.js';
import { WindowLimiter, createSocketGuard, allowedOrigin, isGameAction, isQueueRequest } from './core/security.js';
import { gameRegistry } from './games/index.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
const CLIENT_ORIGIN = CLIENT_ORIGINS.length === 1 ? CLIENT_ORIGINS[0] : CLIENT_ORIGINS;
const allowedOrigins = new Set(CLIENT_ORIGINS);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const app = express();
app.disable('x-powered-by');
// Set TRUST_PROXY=1 only when traffic comes through a trusted reverse proxy.
// Render provides a trusted reverse proxy; direct development connections do not.
app.set('trust proxy', process.env.TRUST_PROXY === '1' || Boolean(process.env.RENDER_SERVICE_ID) ? 1 : false);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '700kb' }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'PATCH'],
  },
  maxHttpBufferSize: 16 * 1024,
  allowRequest: (req, callback) => callback(
    null, allowedOrigin(req.headers.origin, allowedOrigins),
  ),
});

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('[db] SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  process.exit(1);
}

const authStore = new AuthStore({ url: SUPABASE_URL, secretKey: SUPABASE_SECRET_KEY });
await authStore.init();
const matchmaker = new Matchmaker(io, {
  onMatchFinished: (event) => recordCompletedMatch(authStore, event, async (award) => {
    const gameName = gameRegistry.get(award.gameId)?.title || award.gameId;
    const outcomeText = { win: 'Победа', loss: 'Поражение', draw: 'Ничья', completed: 'Матч завершён' }[award.outcome];
    await pushNotification(award.userId, {
      kind: 'match', title: `${outcomeText} · ${gameName}`,
      message: `+${award.xpEarned} XP за матч`, link: '#/game/' + encodeURIComponent(award.gameId),
    });
    for (const quest of award.questClaims || []) {
      await pushNotification(award.userId, { kind: 'achievement', title: 'Задание выполнено!',
        message: `+${quest.xp_reward} XP · ${quest.quest_id}`, link: 'quests' });
    }
    for (const badge of award.newBadges) {
      await pushNotification(award.userId, {
        kind: 'achievement', title: `Медаль: ${badge.title}`, message: badge.description, link: 'profile:awards',
      });
    }
    if (award.nextLevel.level > award.previousLevel.level) {
      await pushNotification(award.userId, {
        kind: 'level_up', title: `Новый уровень ${award.nextLevel.level}!`,
        message: 'Следующая награда за уровень появится в будущих обновлениях.', link: 'profile:overview',
      });
    }
    emitToUser(award.userId, 'progress:updated', { level: award.nextLevel, newBadges: award.newBadges.map((item) => item.id) });
  }),
});
const chatMessages = [];
const MAX_CHAT_MESSAGES = 200;
const httpLimiter = new WindowLimiter();
function httpRateLimit({ prefix, limit, windowMs, identify = () => '' }) {
  return (req, res, next) => {
    const address = req.ip || req.socket.remoteAddress || 'unknown';
    const extra = identify(req);
    if (!httpLimiter.allow(`${prefix}:ip:${address}`, limit, windowMs)
      || (extra && !httpLimiter.allow(`${prefix}:account:${extra}`, limit, windowMs))) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ ok: false, error: 'TOO_MANY_REQUESTS' });
      return;
    }
    next();
  };
}
const loginLimit = httpRateLimit({
  prefix: 'login', limit: 20, windowMs: 5 * 60_000,
  identify: (req) => typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0, 30) : '',
});
const registerLimit = httpRateLimit({ prefix: 'register', limit: 8, windowMs: 60 * 60_000 });
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

async function pushNotification(userId, notification) {
  if (!userId) return;
  try {
    const saved = await saveNotification(authStore.supabase, userId, notification);
    if (saved) emitToUser(userId, 'notifications:new', saved);
  } catch (error) {
    console.error('[notifications] Failed to save event:', error?.message || error);
  }
}

async function checkFriendAchievements(userId, before) {
  try {
    const user = authStore.getPublicUser(userId);
    const after = await getAchievementProfile(authStore, user);
    const previous = new Set(before?.badges?.filter((badge) => badge.unlocked).map((badge) => badge.id) || []);
    const newBadges = before ? after.badges.filter((badge) => badge.unlocked && !previous.has(badge.id)) : [];
    for (const badge of newBadges) {
      await pushNotification(userId, { kind: 'achievement', title: `Медаль: ${badge.title}`, message: badge.description, link: 'profile:awards' });
    }
    emitToUser(userId, 'progress:updated', { level: after.level, newBadges: newBadges.map((badge) => badge.id) });
  } catch (error) {
    console.error('[achievements] Friend progress error:', error?.message || error);
  }
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

app.post('/api/auth/register', registerLimit, async (req, res) => {
  try {
    const result = await authStore.register(req.body?.username, req.body?.password);
    res.status(201).json({ ok: true, ...result });
    void pushNotification(result.user.id, { kind: 'achievement', title: 'Медаль: Добро пожаловать',
      message: 'Ты создал аккаунт Codumi Games!', link: 'profile:awards' });
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/auth/login', loginLimit, async (req, res) => {
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

// Badges and trophies are read-only for the browser; progress belongs to the session account.
app.get('/api/achievements/me', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    res.json({ ok: true, ...(await getAchievementProfile(authStore, user)) });
  } catch (error) {
    console.error('[achievements] Could not read progress:', error?.message || error);
    res.status(503).json({ ok: false, error: 'ACHIEVEMENTS_UNAVAILABLE' });
  }
});

app.get('/api/progression/me', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const row = await getProgressRecord(authStore.supabase, user.id);
    res.json({ ok: true, ...progressFromXp(row.xp), matchesFinished: row.matches_finished });
  } catch (error) {
    console.error('[progression] read error:', error?.message || error);
    res.status(503).json({ ok: false, error: 'PROGRESSION_UNAVAILABLE' });
  }
});

app.get('/api/notifications', httpRateLimit({ prefix: 'notices', limit: 90, windowMs: 60_000 }), async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    res.json({ ok: true, notifications: await listNotifications(authStore.supabase, user.id) });
  } catch (error) {
    console.error('[notifications] read error:', error?.message || error);
    res.status(503).json({ ok: false, error: 'NOTIFICATIONS_UNAVAILABLE' });
  }
});

app.patch('/api/notifications/read-all', httpRateLimit({ prefix: 'notice-read-all', limit: 30, windowMs: 60_000 }), async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    await markAllNotificationsRead(authStore.supabase, user.id);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'NOTIFICATIONS_UNAVAILABLE' });
  }
});

app.patch('/api/notifications/:id/read', httpRateLimit({ prefix: 'notice-read', limit: 60, windowMs: 60_000 }), async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(400).json({ ok: false, error: 'INVALID_NOTIFICATION' });
  try {
    await markNotificationRead(authStore.supabase, user.id, req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'NOTIFICATIONS_UNAVAILABLE' });
  }
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

app.patch('/api/profile/login', (req, res) => {
  if (!requireUser(req, res)) return;
  res.status(403).json({ ok: false, error: 'LOGIN_IMMUTABLE' });
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
    const targetId = req.body?.userId;
    const relationBefore = authStore.getFriendsPayload(user.id);
    const alreadyOutgoing = relationBefore.outgoing.some((item) => item.id === targetId);
    const wasIncoming = relationBefore.incoming.some((item) => item.id === targetId);
    const friendBefore = wasIncoming ? await getAchievementProfile(authStore, user).catch(() => null) : null;
    const otherUser = wasIncoming ? authStore.getPublicUser(targetId) : null;
    const otherBefore = otherUser ? await getAchievementProfile(authStore, otherUser).catch(() => null) : null;
    const result = await authStore.sendFriendRequest(user.id, targetId);
    notifyFriendsChanged(user.id, targetId);
    res.json({ ok: true, ...result });
    if (result.status === 'outgoing' && !alreadyOutgoing) {
      void pushNotification(targetId, { kind: 'friend_request', title: 'Новая заявка в друзья',
        message: `${user.displayName || user.username} хочет добавить тебя в друзья`, link: 'profile:friends' });
    } else if (wasIncoming && result.status === 'friend') {
      void pushNotification(targetId, { kind: 'friend_accepted', title: 'Заявка принята',
        message: `${user.displayName || user.username} теперь твой друг`, link: 'profile:friends' });
      void checkFriendAchievements(user.id, friendBefore);
      void checkFriendAchievements(targetId, otherBefore);
    }
  } catch (error) {
    authErrorResponse(res, error);
  }
});

app.post('/api/friends/accept', async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const targetId = req.body?.userId;
    const friendUser = authStore.getPublicUser(targetId);
    const beforeA = await getAchievementProfile(authStore, user).catch(() => null);
    const beforeB = friendUser ? await getAchievementProfile(authStore, friendUser).catch(() => null) : null;
    const result = await authStore.acceptFriendRequest(user.id, targetId);
    notifyFriendsChanged(user.id, targetId);
    res.json({ ok: true, ...result });
    void pushNotification(targetId, { kind: 'friend_accepted', title: 'Заявка принята',
      message: `${user.displayName || user.username} теперь твой друг`, link: 'profile:friends' });
    void checkFriendAchievements(user.id, beforeA);
    if (friendUser) void checkFriendAchievements(targetId, beforeB);
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
    const before = currentPartyForUser(user.id);
    const party = createParty(user.id, req.body?.userId);
    res.json({ ok: true, party: partyPayload(party) });
    const friendId = req.body?.userId;
    if (party?.id !== before?.id) void pushNotification(friendId, { kind: 'party_invite', title: 'Вас добавили в игровую группу',
      message: `${user.displayName || user.username} приглашает сыграть вместе`, link: 'profile:friends' });
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

// CODUMI Arena: competition profiles, XP quests and consensual friend duels.
app.get('/api/arena/leaderboard', httpRateLimit({ prefix: 'arena-top', limit: 90, windowMs: 60_000 }), async (_req,res) => {
  try {
    const { data, error } = await authStore.supabase.from('codumi_player_progress')
      .select('user_id,xp,matches_finished,wins,losses,draws').order('wins',{ ascending:false })
      .order('xp',{ ascending:false }).limit(100);
    if (error) throw error;
    const progress = new Map((data || []).map((row) => [row.user_id,row]));
    const players = authStore.data.users.map((account) => {
      const user = authStore.getPublicUser(account.id);
      const row = progress.get(user.id) || {xp:0,wins:0,losses:0,draws:0,matches_finished:0};
      return {id:user.id, username:user.username, level:progressFromXp(row.xp).level,
        xp:row.xp,wins:row.wins,losses:row.losses,draws:row.draws,matchesFinished:row.matches_finished};
    }).sort((a,b)=>b.wins-a.wins || b.xp-a.xp || a.username.localeCompare(b.username,'ru')).slice(0,100);
    res.json({ ok:true, players });
  } catch (error) {
    console.error('[arena] leaderboard:',error?.message || error);
    res.status(500).json({ ok:false,error:'RANKING_UNAVAILABLE' });
  }
});

app.get('/api/arena/players/:id', httpRateLimit({ prefix:'arena-profile', limit:90,windowMs:60_000 }), async (req,res) => {
  try {
    const profile = await publicCompetitionProfile(authStore, req.params.id);
    if (!profile) return res.status(404).json({ ok:false,error:'USER_NOT_FOUND' });
    const viewer = requestUser(req);
    res.json({ ok:true, profile:{ ...profile, isFriend: Boolean(viewer && authStore.areFriends(viewer.id,req.params.id)) } });
  } catch (error) {
    console.error('[arena] profile:',error?.message || error);
    res.status(500).json({ ok:false,error:'PROFILE_UNAVAILABLE' });
  }
});

app.get('/api/arena/quests', async (req,res) => {
  const user = requireUser(req,res);
  if (!user) return;
  try { res.json({ ok:true, ...(await getQuests(authStore.supabase,user.id)) }); }
  catch (error) {
    console.error('[arena] quests:',error?.message || error);
    res.status(500).json({ ok:false,error:'QUESTS_UNAVAILABLE' });
  }
});

app.get('/api/duels/invites', async (req,res) => {
  const user = requireUser(req,res);
  if (!user) return;
  try {
    const { data,error } = await authStore.supabase.from('codumi_duel_invites')
      .select('id,from_user_id,to_user_id,game_id,created_at,expires_at,status')
      .eq('to_user_id',user.id).eq('status','pending').gt('expires_at',new Date().toISOString())
      .order('created_at',{ ascending:false }).limit(40);
    if (error) throw error;
    res.json({ ok:true, invites:(data || []).map((row) => ({ ...row,
      fromUsername:authStore.getPublicUser(row.from_user_id)?.username || 'Игрок' })) });
  } catch (error) {
    console.error('[duels] inbox:',error?.message || error);
    res.status(500).json({ ok:false,error:'INVITES_UNAVAILABLE' });
  }
});

app.post('/api/duels/invite',httpRateLimit({prefix:'duel-invite',limit:12,windowMs:60_000}),async (req,res) => {
  const user = requireUser(req,res);
  if (!user) return;
  const targetId = req.body?.userId;
  const gameId = req.body?.gameId;
  if (typeof targetId !== 'string' || typeof gameId !== 'string' ||
      !gameRegistry.has(gameId) || !authStore.areFriends(user.id,targetId) || user.id === targetId) {
    return res.status(400).json({ok:false,error:'INVALID_DUEL_INVITE'});
  }
  try {
    const db = authStore.supabase;
    const { data:existing,error:lookupError } = await db.from('codumi_duel_invites')
      .select('id').eq('from_user_id',user.id).eq('to_user_id',targetId).eq('game_id',gameId)
      .eq('status','pending').gt('expires_at',new Date().toISOString()).limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) return res.status(409).json({ok:false,error:'DUEL_ALREADY_INVITED'});
    const { data,error } = await db.from('codumi_duel_invites')
      .insert({from_user_id:user.id,to_user_id:targetId,game_id:gameId})
      .select('id,game_id,created_at,expires_at').single();
    if (error) throw error;
    res.json({ ok:true, invite:data });
    void pushNotification(targetId,{kind:'party_invite',title:`Вызов на дуэль: ${gameRegistry.get(gameId)?.title || gameId}`,
      message:`@${user.username} приглашает тебя сыграть`,link:`duel:${data.id}`});
    emitToUser(targetId,'duel:invite',{ id:data.id, gameId,fromUsername:user.username });
  } catch (error) {
    console.error('[duels] create:',error?.message || error);
    res.status(500).json({ok:false,error:'INVITE_FAILED'});
  }
});

app.post('/api/duels/:id/respond',async (req,res) => {
  const user = requireUser(req,res);
  if (!user) return;
  const id = req.params.id;
  const accept = req.body?.accept === true;
  try {
    const db = authStore.supabase;
    const { data:invite,error } = await db.from('codumi_duel_invites')
      .select('*').eq('id',id).eq('to_user_id',user.id).eq('status','pending')
      .gt('expires_at',new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!invite) return res.status(404).json({ok:false,error:'DUEL_EXPIRED'});
    if (!authStore.areFriends(user.id,invite.from_user_id))
      return res.status(403).json({ok:false,error:'PARTY_FRIEND_REQUIRED'});
    if (accept) {
      if (!userSockets.get(invite.from_user_id)?.size || !userSockets.get(user.id)?.size)
        return res.status(409).json({ok:false,error:'FRIEND_OFFLINE'});
      const busy = [invite.from_user_id,user.id].some((uid) =>
        [...(userSockets.get(uid) || [])].some((socketId) => io.sockets.sockets.get(socketId)?.data.currentRoom));
      if (busy) return res.status(409).json({ok:false,error:'PLAYER_BUSY'});
    }
    const { data:updated,error:updateError } = await db.from('codumi_duel_invites')
      .update({status:accept?'accepted':'declined'}).eq('id',id).eq('to_user_id',user.id)
      .eq('status','pending').gt('expires_at',new Date().toISOString()).select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return res.status(409).json({ok:false,error:'DUEL_EXPIRED'});
    if (!accept) {
      res.json({ok:true,accepted:false});
      emitToUser(invite.from_user_id,'duel:declined',{id});
      return;
    }
    const party = createParty(invite.from_user_id,user.id);
    const ready = { inviteId:id,gameId:invite.game_id,partyId:party.id };
    res.json({ok:true,accepted:true,...ready});
    for (const id of party.memberIds) emitToUser(id,'duel:ready',ready);
  } catch (error) {
    console.error('[duels] respond:',error?.message || error);
    res.status(500).json({ok:false,error:'DUEL_RESPONSE_FAILED'});
  }
});

// Normalize invalid JSON and oversized bodies without returning internal stacks.
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'REQUEST_TOO_LARGE' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'INVALID_JSON' });
  }
  return next(err);
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
  const guard = createSocketGuard();
  function permit(event) {
    if (guard(event)) return true;
    // Do not flood clients with errors if they themselves are flooding the server.
    return false;
  }

  const handshakeUser = authStore.getUserByToken(socket.handshake.auth?.token);
  if (handshakeUser) attachSocketUser(socket, handshakeUser);

  sendChatHistory(socket);

  socket.on('auth:session', (payload = {}) => {
    if (!permit('auth:session')) return;
    const user = authStore.getUserByToken(payload.token);
    if (!user) {
      detachSocketUser(socket);
      socket.emit('auth:error', { error: 'AUTH_INVALID' });
      return;
    }
    attachSocketUser(socket, user);
  });

  socket.on('auth:logout', () => {
    if (!permit('auth:logout')) return;
    detachSocketUser(socket);
  });

  socket.on('presence:request', () => {
    if (!permit('presence:request')) return;
    socket.emit('presence:snapshot', { onlineUserIds: onlineUserIds() });
  });

  socket.on('chat:history:request', () => {
    if (!permit('chat:history:request')) return;
    sendChatHistory(socket);
  });

  socket.on('chat:send', (payload = {}) => {
    if (!permit('chat:send')) return;
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
    if (chatMessages.length > MAX_CHAT_MESSAGES) chatMessages.splice(0, chatMessages.length - MAX_CHAT_MESSAGES);
    io.emit('chat:message', message);
  });

  socket.on('chat:react', (payload = {}) => {
    if (!permit('chat:react')) return;
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
    if (!permit('dm:summary:request')) return;
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
    if (!permit('dm:history:request')) return;
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
    if (!permit('dm:read')) return;
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
    if (!permit('dm:send')) return;
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
    if (!permit('dm:react')) return;
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
    if (!permit('queue:join')) return;
    const authUser = socket.data.userId ? authStore.getPublicUser(socket.data.userId) : null;
    if (!isQueueRequest(payload)) return;
    const nextPayload = { ...payload };
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
    if (!permit('queue:leave')) return;
    if (!payload?.gameId) return;
    matchmaker.leaveQueue(socket, payload.gameId);
  });

  socket.on('game:action', (payload) => {
    if (!permit('game:action')) return;
    if (!isGameAction(payload)) return;
    matchmaker.handleAction(socket, payload);
  });

  socket.on('match:leave', () => {
    if (!permit('match:leave')) return;
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
