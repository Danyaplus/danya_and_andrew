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
import { getAchievementProfile, recordCompletedMatch, achievementCatalog, badgeRewardAmount } from './core/achievements.js';
import { getProgressRecord, progressFromXp } from './core/progression.js';
import { getQuests, getMatchStatistics, publicCompetitionProfile } from './core/competition.js';
import { COSMETICS, getCosmeticsProfile } from './core/cosmetics.js';
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
  onMatchStarted: ({ userIds, gameId }) => {
    for (const userId of new Set(userIds.filter(Boolean))) emitFriendMatchPresence(userId);
  },
  onMatchEnded: ({ userIds }) => {
    for (const userId of new Set(userIds.filter(Boolean))) emitFriendMatchPresence(userId);
  },
  onMatchFinished: (event) => recordCompletedMatch(authStore, event, async (award) => {
    const gameName = gameRegistry.get(award.gameId)?.title || award.gameId;
    const outcomeText = { win: 'Победа', loss: 'Поражение', draw: 'Ничья', completed: 'Матч завершён' }[award.outcome];
    await pushNotification(award.userId, {
      kind: 'match', title: `${outcomeText} · ${gameName}`,
      message: `+${award.xpEarned} XP за матч`, link: '#/game/' + encodeURIComponent(award.gameId),
    });
    if (award.coinOnly) {
      emitToUser(award.userId, 'wallet:updated', { coinsEarned: award.coinsEarned });
      await pushNotification(award.userId, { kind: 'achievement', title: 'Монеты за победу!',
        message: `+${award.coinsEarned} CODI за выигранный матч`, link: 'profile:shop' });
      return;
    }
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
const DM_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
const DM_MEDIA_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav']);
const GLOBAL_CHAT_RESET_INTERVAL_MS = 60 * 60_000;
const DIRECT_CHAT_RETENTION_MS = 3 * 24 * 60 * 60_000;
const DIRECT_CHAT_CLEANUP_INTERVAL_MS = 6 * 60 * 60_000;
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
let globalChatResetTimer = null;
let directChatCleanupTimer = null;

function validMediaBuffer(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
  const head = buffer.subarray(0, 16);
  const start = head.toString('ascii');
  if (mime === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mime === 'image/png') return head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/webp') return start.slice(0,4) === 'RIFF' && start.slice(8,12) === 'WEBP';
  if (mime === 'image/gif') return start.startsWith('GIF87a') || start.startsWith('GIF89a');
  if (mime === 'video/webm' || mime === 'audio/webm') return head.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if (mime === 'video/mp4' || mime === 'video/quicktime' || mime === 'audio/mp4') return start.slice(4,8) === 'ftyp';
  if (mime === 'audio/ogg') return start.startsWith('OggS');
  if (mime === 'audio/wav') return start.slice(0,4) === 'RIFF' && start.slice(8,12) === 'WAVE';
  if (mime === 'audio/mpeg') return start.startsWith('ID3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  return false;
}

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

function activeMatchForUser(userId) {
  return matchmaker.findPlayingRoom(userId);
}

function emitFriendMatchPresence(userId) {
  const payload = { userId, gameId: activeMatchForUser(userId)?.gameId || null };
  try {
    for (const friend of authStore.getFriendsPayload(userId).friends) {
      emitToUser(friend.id, 'presence:match', payload);
    }
  } catch (error) {
    console.warn('[presence] Could not update match status:', error?.message);
  }
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
        lastSeenAt: authStore.data.users.find((user) => user.id === item.friend.id)?.lastSeenAt || null,
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
    const timestamp = Date.now();
    const user = authStore.data.users.find((item) => item.id === userId);
    if (user) user.lastSeenAt = timestamp;
    io.emit('presence:update', { userId, online: false });
    // Last-visit data is only sent to accepted friends.
    try {
      for (const friend of authStore.getFriendsPayload(userId).friends) {
        emitToUser(friend.id, 'dm:presence', { userId, online: false, lastSeenAt: timestamp });
      }
    } catch (error) { console.warn('[presence] Friends update:', error?.message || error); }
    void authStore.recordLastSeen(userId, timestamp)
      .catch((error) => console.error('[presence] Last seen save:', error?.message || error));
  }
}

function attachSocketUser(socket, user) {
  if (!user) return false;
  if (socket.data.userId === user.id) {
    socket.data.authUser = user;
    socket.data.partyId = userParty.get(user.id) || null;
    return true;
  }

  matchmaker.stopWatching(socket);
  detachSocketUser(socket);
  const wasOffline = !userSockets.has(user.id) || userSockets.get(user.id).size === 0;
  const sockets = userSockets.get(user.id) || new Set();
  sockets.add(socket.id);
  userSockets.set(user.id, sockets);
  socket.data.userId = user.id;
  socket.data.authUser = user;
  socket.data.partyId = userParty.get(user.id) || null;

  if (wasOffline) {
    io.emit('presence:update', { userId: user.id, online: true });
    try {
      for (const friend of authStore.getFriendsPayload(user.id).friends) {
        emitToUser(friend.id, 'dm:presence', { userId: user.id, online: true });
      }
    } catch (error) { console.warn('[presence] Friends update:', error?.message || error); }
  }
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
    for (const socketId of userSockets.get(userId) || []) {
      const memberSocket = io.sockets.sockets.get(socketId);
      const target = memberSocket?.data.watchingFriendId;
      if (target && !authStore.areFriends(userId, target)) matchmaker.stopWatching(memberSocket, { silent: false });
    }
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

// Currency and cosmetics. No client-chosen price, and no manual coin grant endpoint.
app.get('/api/shop/me', httpRateLimit({prefix:'shop-read',limit:50,windowMs:60_000}), async(req,res)=>{
  const user = requireUser(req,res);if(!user)return;
  try { const shop=await getCosmeticsProfile(authStore.supabase,user.id);
    res.json({ok:true,...shop,catalog:COSMETICS}); }
  catch(error){console.error('[shop] get',error?.message||error);res.status(503).json({ok:false,error:'SHOP_UNAVAILABLE'});}
});
app.post('/api/shop/action', httpRateLimit({prefix:'shop-action',limit:30,windowMs:60_000}), async(req,res)=>{
  const user = requireUser(req,res);if(!user)return;
  const action = req.body?.action; const itemId=req.body?.itemId;
  if (!['buy','equip'].includes(action) || !COSMETICS.some(item=>item.id===itemId))
    return res.status(400).json({ok:false,error:'ITEM_UNKNOWN'});
  try {
    const paid=await authStore.supabase.rpc('codumi_shop_action',{
      p_user_id:user.id,p_action:action,p_item_id:itemId,
    });
    if (paid.error){
      const code = String(paid.error.message||'');
      if (/INSUFFICIENT_COINS|ITEM_LOCKED|ITEM_UNKNOWN/.test(code))
        return res.status(409).json({ok:false,error:code.match(/INSUFFICIENT_COINS|ITEM_LOCKED|ITEM_UNKNOWN/)[0]});
      throw paid.error;
    }
    const shop=await getCosmeticsProfile(authStore.supabase,user.id);
    emitToUser(user.id,'wallet:updated',shop);
    // Cosmetic-only changes appear immediately, while win rankings still recalculate every 4 hours.
    for(const entry of leaderboardCache.players || []) if(entry.id===user.id) entry.avatarFrame=shop.equipped.frameId;
    res.json({ok:true,...shop});
  }catch(error){console.error('[shop] action',error?.message||error);res.status(503).json({ok:false,error:'SHOP_UNAVAILABLE'});}
});

// New site wallpapers, profile symbols and nickname colors use an additive SQL extension.
app.post('/api/shop/extra', httpRateLimit({prefix:'shop-extra',limit:30,windowMs:60_000}), async(req,res)=>{
  const user=requireUser(req,res);if(!user)return;
  const {action,itemId,color,enabled}=req.body||{};
  // SQL validates the item catalogue and price; do not freeze new wallpaper IDs
  // inside the API's JavaScript catalogue.
  const extraItemId=typeof itemId==='string' && /^(site|emoji)-[a-z0-9-]{1,55}$/.test(itemId);
  const colorAction=['color','save-color','remove-color'].includes(action);
  const animationAction=action==='site-animation';
  if (colorAction
      ? (typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color))
      : animationAction
        ? typeof enabled!=='boolean'
        : (!['buy','equip'].includes(action)||!extraItemId)) {
    return res.status(400).json({ok:false,error:'ITEM_UNKNOWN'});
  }
  try {
    const result=colorAction
      ? await authStore.supabase.rpc(
          action==='save-color' ? 'codumi_save_nickname_palette_color'
          : action==='remove-color' ? 'codumi_remove_nickname_palette_color'
          : 'codumi_set_nickname_color',
          {p_user_id:user.id,p_color:color.toUpperCase()}
        )
      : animationAction
        ? await authStore.supabase.rpc('codumi_set_site_animation_enabled',{p_user_id:user.id,p_enabled:enabled})
        : await authStore.supabase.rpc('codumi_extra_action',{p_user_id:user.id,p_action:action,p_item_id:itemId});
    if(result.error){
      const match=String(result.error.message||'').match(/INSUFFICIENT_COINS|ITEM_LOCKED|ITEM_UNKNOWN/);
      if(match)return res.status(409).json({ok:false,error:match[0]});
      throw result.error;
    }
    const shop=await getCosmeticsProfile(authStore.supabase,user.id);
    emitToUser(user.id,'wallet:updated',shop);
    res.json({ok:true,...shop});
  }catch(error){console.error('[shop] extra',error?.message||error);res.status(503).json({ok:false,error:'SHOP_UNAVAILABLE'});}
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

app.post('/api/achievements/claim', httpRateLimit({ prefix: 'badge-claim', limit: 20, windowMs: 60_000 }), async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const badgeId = req.body?.badgeId;
  const reward = typeof badgeId === 'string' ? badgeRewardAmount(badgeId) : null;
  if (!reward) return res.status(400).json({ ok: false, error: 'BADGE_UNKNOWN' });
  try {
    // The real account and badge conditions come from the server, not from a client field.
    const profile = await getAchievementProfile(authStore, user);
    const badge = profile.badges.find((item) => item.id === badgeId);
    if (!badge?.unlocked) return res.status(409).json({ ok: false, error: 'BADGE_LOCKED' });
    if (badge.claimed) return res.json({ ok: true, alreadyClaimed: true, xpEarned: 0 });
    const { data, error } = await authStore.supabase.rpc('codumi_claim_badge_xp', {
      p_user_id: user.id, p_badge_id: badgeId, p_xp_reward: reward,
    });
    if (error) throw error;
    const xpEarned = Number(data) || 0;
    const next = await getProgressRecord(authStore.supabase, user.id);
    emitToUser(user.id, 'progress:updated', { level: progressFromXp(next.xp), badgeId });
    if (xpEarned) await pushNotification(user.id, { kind: 'achievement', title: 'Награда за медаль!',
      message: `${badge.title}: +${xpEarned} XP`, link: 'profile:awards' });
    res.json({ ok: true, xpEarned, alreadyClaimed: !xpEarned, level: progressFromXp(next.xp) });
  } catch (error) {
    console.error('[achievements] claim:', error?.message || error);
    res.status(503).json({ ok: false, error: 'BADGE_CLAIM_UNAVAILABLE' });
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
    for(const entry of leaderboardCache.players || []) if(entry.id===user.id) entry.avatar=updated.avatar;
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
      playingGameId: activeMatchForUser(item.id)?.gameId || null,
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

// Recognize a migration that has not yet been executed in Supabase.
function arenaSchemaMissing(error) {
  return ['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error?.code) ||
    /does not exist|could not find.*(?:table|function|column)|schema cache/i.test(error?.message || '');
}

// CODUMI Arena: competition profiles, XP quests and consensual friend duels.
// One shared leaderboard snapshot per four-hour UTC block.
// The page can be opened repeatedly without triggering a database query each time.
let leaderboardCache = { bucket: -1, players: null, updatedAt: null };
app.get('/api/arena/leaderboard', httpRateLimit({ prefix: 'arena-top', limit: 90, windowMs: 60_000 }), async (_req,res) => {
  try {
    const bucket = Math.floor(Date.now() / (4 * 60 * 60 * 1000));
    if (leaderboardCache.bucket === bucket && leaderboardCache.players) {
      return res.json({ ok:true, players:leaderboardCache.players, updatedAt:leaderboardCache.updatedAt, nextUpdateAt:(bucket+1)*4*60*60*1000 });
    }
    let { data, error } = await authStore.supabase.from('codumi_player_progress')
      .select('user_id,xp,matches_finished,wins,losses,draws').order('wins',{ ascending:false })
      .order('xp',{ ascending:false }).limit(100);
    // If an earlier Supabase schema is still installed, show existing users and XP
    // instead of a blank ranking. The SQL update is required to start counting wins.
    if (error && /wins|losses|draws|column|schema cache|42703|PGRST204/i.test(error.message || '')) {
      const fallback = await authStore.supabase.from('codumi_player_progress')
        .select('user_id,xp,matches_finished').limit(1000);
      if (fallback.error) throw fallback.error;
      data = fallback.data;
      error = null;
    }
    if (error) throw error;
    const progress = new Map((data || []).map((row) => [row.user_id,row]));
    const players = authStore.data.users.map((account) => {
      const user = authStore.getPublicUser(account.id);
      const row = progress.get(user.id) || {xp:0,wins:0,losses:0,draws:0,matches_finished:0};
      return {id:user.id, username:user.username, avatar:user.avatar, level:progressFromXp(row.xp).level,
        xp:row.xp,wins:row.wins,losses:row.losses,draws:row.draws,matchesFinished:row.matches_finished};
    }).sort((a,b)=>b.wins-a.wins || b.xp-a.xp || a.username.localeCompare(b.username,'ru')).slice(0,100);
    // Show the real saved avatar and decorative frame, without exposing account details.
    const looks = await authStore.supabase.from('codumi_profile_looks').select('user_id,frame_id')
      .in('user_id',players.map(p=>p.id));
    if(!looks.error){
      const frames=new Map((looks.data||[]).map(x=>[x.user_id,x.frame_id]));
      players.forEach(p=>{p.avatarFrame=frames.get(p.id)||'none';});
    }
    leaderboardCache = { bucket, players, updatedAt: new Date().toISOString() };
    res.json({ ok:true, players, updatedAt:leaderboardCache.updatedAt, nextUpdateAt:(bucket+1)*4*60*60*1000 });
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

app.get('/api/arena/match-statistics/me', httpRateLimit({ prefix:'match-stats', limit:30, windowMs:60_000 }), async (req,res) => {
  const user = requireUser(req,res);
  if (!user) return;
  try {
    const stats = await getMatchStatistics(authStore, user.id);
    const favorite = stats.favoriteGameId ? gameRegistry.get(stats.favoriteGameId) : null;
    res.json({ ok:true, stats:{ ...stats,
      favoriteGameTitle: favorite?.title || stats.favoriteGameId || null,
      recent: stats.recent.map((item) => ({ ...item,
        gameTitle: gameRegistry.get(item.gameId)?.title || item.gameId })) } });
  } catch (error) {
    console.error('[arena] match statistics:',error?.message || error);
    res.status(503).json({ ok:false,error:'MATCH_STATS_UNAVAILABLE' });
  }
});

app.get('/api/arena/quests', async (req,res) => {
  const user = requireUser(req,res);
  if (!user) return;
  try { res.json({ ok:true, ...(await getQuests(authStore.supabase,user.id)) }); }
  catch (error) {
    console.error('[arena] quests:',error?.message || error);
    res.status(503).json({ ok:false,error:arenaSchemaMissing(error) ? 'ARENA_SQL_REQUIRED' : 'QUESTS_UNAVAILABLE' });
  }
});

app.post('/api/arena/quests/claim', httpRateLimit({ prefix: 'quest-claim', limit: 25, windowMs: 60_000 }), async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const questId = req.body?.questId;
  const periodKey = req.body?.periodKey;
  if (typeof questId !== 'string' || typeof periodKey !== 'string' || periodKey.length > 20) {
    return res.status(400).json({ ok: false, error: 'INVALID_QUEST' });
  }
  try {
    const { data, error } = await authStore.supabase.rpc('codumi_claim_quest_xp', {
      p_user_id: user.id, p_quest_id: questId, p_expected_period_key: periodKey,
    });
    if (error) {
      const code = error.message || '';
      if (/QUEST_LOCKED|PERIOD_EXPIRED|INVALID_QUEST/.test(code)) {
        return res.status(409).json({ ok: false, error: code.match(/QUEST_LOCKED|PERIOD_EXPIRED|INVALID_QUEST/)[0] });
      }
      throw error;
    }
    const xpEarned = Number(data) || 0;
    // The DB verifies the quest was actually claimed; retries cannot mint twice.
    const coinAward = await authStore.supabase.rpc('codumi_credit_quest_coins', {
      p_user_id:user.id,p_quest_id:questId,p_period_key:periodKey,
    });
    if (coinAward.error) throw coinAward.error;
    const coinsEarned = Number(coinAward.data) || 0;
    if (coinsEarned) emitToUser(user.id,'wallet:updated',{ coinsEarned });
    const next = await getProgressRecord(authStore.supabase, user.id);
    emitToUser(user.id, 'progress:updated', { level: progressFromXp(next.xp), questId });
    if (xpEarned) await pushNotification(user.id, { kind: 'achievement', title: 'Задание выполнено!',
      message: `Получено +${xpEarned} XP`, link: 'quests' });
    res.json({ ok: true, xpEarned, coinsEarned, alreadyClaimed: !xpEarned, level: progressFromXp(next.xp) });
  } catch (error) {
    console.error('[arena] claim:', error?.message || error);
    res.status(503).json({ ok: false, error: 'QUEST_CLAIM_UNAVAILABLE' });
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

// Private friend media. Never expose Supabase Storage paths or a public bucket URL.
const dmMediaUploadLimiter = httpRateLimit({ prefix: 'dm-media-upload', limit: 20, windowMs: 60_000,
  identify: (req) => requestUser(req)?.id || '' });
app.post('/api/dm/media', dmMediaUploadLimiter, express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const friendId = typeof req.query.friendId === 'string' ? req.query.friendId : '';
  const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
  const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const bytes = req.body;
  if (!authStore.areFriends(user.id, friendId)) return res.status(403).json({ ok: false, error: 'FRIEND_REQUIRED' });
  if (!['image', 'video', 'voice', 'circle'].includes(kind) || !DM_MEDIA_MIMES.has(mime)) {
    return res.status(415).json({ ok: false, error: 'UNSUPPORTED_MEDIA' });
  }
  if (!((kind === 'image' && mime.startsWith('image/')) ||
    ((kind === 'video' || kind === 'circle') && mime.startsWith('video/')) ||
    (kind === 'voice' && mime.startsWith('audio/')))) {
    return res.status(415).json({ ok: false, error: 'UNSUPPORTED_MEDIA' });
  }
  const kindLimit = kind === 'image' ? 8 * 1024 * 1024 : kind === 'voice' ? 8 * 1024 * 1024 : DM_MEDIA_MAX_BYTES;
  if (!bytes || bytes.length > kindLimit || !validMediaBuffer(bytes, mime)) {
    return res.status(400).json({ ok: false, error: 'INVALID_MEDIA_FILE' });
  }
  try {
    const label = { image: '📷 Фото', video: '🎞️ Видео', voice: '🎤 Голосовое сообщение', circle: '⭕ Видеокружок' }[kind];
    const message = await authStore.saveDirectMedia(user.id, friendId, { buffer: bytes, mime, kind, label });
    emitToUser(user.id, 'dm:message', message);
    emitToUser(friendId, 'dm:message', message);
    await Promise.all([emitDmSummary(user.id), emitDmSummary(friendId)]);
    res.status(201).json({ ok: true, message });
  } catch (error) {
    console.error('[dm] media send:', error?.message || error);
    res.status(500).json({ ok: false, error: 'MEDIA_SAVE_FAILED' });
  }
});

app.get('/api/dm/media/:messageId', httpRateLimit({ prefix: 'dm-media-read', limit: 100, windowMs: 60_000,
  identify: (req) => requestUser(req)?.id || '' }), async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const row = await authStore.getDirectMessageForMedia(req.params.messageId, user.id);
    if (!row) return res.status(404).json({ ok: false, error: 'MEDIA_NOT_FOUND' });
    const result = await authStore.supabase.storage.from('direct-chat-media').download(row.media_path);
    if (result.error || !result.data) return res.status(404).json({ ok: false, error: 'MEDIA_NOT_FOUND' });
    const buffer = Buffer.from(await result.data.arrayBuffer());
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', row.media_mime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error) {
    console.error('[dm] media read:', error?.message || error);
    res.status(500).json({ ok: false, error: 'MEDIA_FETCH_FAILED' });
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

function broadcastChatHistory() {
  io.emit('chat:history', { messages: chatMessages });
}

function clearGlobalChatHistory(reason = 'hourly reset') {
  if (!chatMessages.length) return;
  chatMessages.length = 0;
  broadcastChatHistory();
  console.log(`[chat] Global chat cleared: ${reason}.`);
}

function cancelScheduledChatClear() {
  if (!clearChatTimer) return;
  clearTimeout(clearChatTimer);
  clearChatTimer = null;
}

function scheduleChatClearIfEmpty() {
  cancelScheduledChatClear();
  clearChatTimer = setTimeout(() => {
    clearChatTimer = null;
  }, 2000);
  clearChatTimer.unref?.();
}

function scheduleGlobalChatReset() {
  if (globalChatResetTimer) clearTimeout(globalChatResetTimer);
  const msUntilNextHour = GLOBAL_CHAT_RESET_INTERVAL_MS - (Date.now() % GLOBAL_CHAT_RESET_INTERVAL_MS);
  const run = () => {
    clearGlobalChatHistory('hourly reset');
    globalChatResetTimer = setTimeout(run, GLOBAL_CHAT_RESET_INTERVAL_MS);
    globalChatResetTimer.unref?.();
  };
  globalChatResetTimer = setTimeout(run, msUntilNextHour);
  globalChatResetTimer.unref?.();
}

async function cleanupDirectMessagesHistory() {
  try {
    const removed = await authStore.cleanupDirectMessages(Date.now() - DIRECT_CHAT_RETENTION_MS);
    if ((removed.messages || 0) > 0 || (removed.reads || 0) > 0) {
      console.log(`[dm] Cleaned old direct messages: ${removed.messages} messages, ${removed.reads} read markers.`);
      if (removed.messages > 0) io.emit('dm:history:purged');
    }
  } catch (error) {
    console.error('[dm] cleanup error:', error?.message || error);
  }
}

function scheduleDirectChatCleanup() {
  if (directChatCleanupTimer) clearInterval(directChatCleanupTimer);
  cleanupDirectMessagesHistory();
  directChatCleanupTimer = setInterval(cleanupDirectMessagesHistory, DIRECT_CHAT_CLEANUP_INTERVAL_MS);
  directChatCleanupTimer.unref?.();
}

scheduleGlobalChatReset();
scheduleDirectChatCleanup();

io.on('connection', (socket) => {
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
      matchmaker.stopWatching(socket);
      detachSocketUser(socket);
      socket.emit('auth:error', { error: 'AUTH_INVALID' });
      return;
    }
    attachSocketUser(socket, user);
  });

  socket.on('auth:logout', () => {
    if (!permit('auth:logout')) return;
    matchmaker.stopWatching(socket);
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

  socket.on('chat:delete', (payload = {}) => {
    if (!permit('chat:delete')) return;
    const userId = socket.data.userId;
    if (!userId || typeof payload.messageId !== 'string' || payload.messageId.length > 100) return;
    const index = chatMessages.findIndex((item) => item.id === payload.messageId);
    if (index < 0 || chatMessages[index].userId !== userId) {
      socket.emit('chat:error', { error: 'MESSAGE_NOT_OWNED' });
      return;
    }
    chatMessages.splice(index, 1);
    for (const item of chatMessages) {
      if (item.replyToId === payload.messageId) {
        item.replyToId = null;
        item.replyTo = null;
      }
    }
    io.emit('chat:deleted', { messageId: payload.messageId });
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

  socket.on('dm:delete', async (payload = {}) => {
    if (!permit('dm:delete')) return;
    const userId = socket.data.userId;
    if (!userId || typeof payload.messageId !== 'string' || payload.messageId.length > 100) return;
    if (payload.scope !== 'me' && payload.scope !== 'all') return;
    try {
      const deleted = await authStore.deleteDirectMessage(userId, payload.messageId, payload.scope);
      if (deleted.scope === 'me') {
        emitToUser(userId, 'dm:deleted', { messageId: deleted.messageId, scope: 'me' });
        await emitDmSummary(userId);
      } else {
        const event = { messageId: deleted.messageId, scope: 'all' };
        emitToUser(deleted.fromUserId, 'dm:deleted', event);
        emitToUser(deleted.toUserId, 'dm:deleted', event);
        await Promise.all([emitDmSummary(deleted.fromUserId), emitDmSummary(deleted.toUserId)]);
      }
    } catch (error) {
      console.error('[dm] delete error:', error?.message || error);
      socket.emit('dm:error', { error: ['MESSAGE_NOT_OWNED', 'MESSAGE_NOT_FOUND'].includes(error?.message) ? error.message : 'SERVER_ERROR' });
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

  socket.on('match:watch', (payload = {}) => {
    if (!permit('match:watch')) return;
    const watcherId = socket.data.userId;
    const friendId = typeof payload.friendId === 'string' ? payload.friendId : null;
    if (!watcherId || !friendId || watcherId === friendId || !authStore.areFriends(watcherId, friendId)) {
      socket.emit('watch:error', { message: 'Смотреть можно только матчи своих друзей.' });
      return;
    }
    if (socket.data.currentRoom) {
      socket.emit('watch:error', { message: 'Заверши свой матч, прежде чем стать зрителем.' });
      return;
    }
    const match = activeMatchForUser(friendId);
    if (!match || !matchmaker.watchRoom(socket, match.roomId, friendId)) {
      socket.emit('watch:error', { message: 'Друг сейчас не играет в поддерживаемую игру или матч уже закончился.' });
    }
  });

  socket.on('match:unwatch', () => {
    if (!permit('match:unwatch')) return;
    matchmaker.stopWatching(socket);
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
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Danya & Andrew server: http://localhost:${PORT}`);
  console.log(`Games: ${[...gameRegistry.keys()].join(', ') || 'none'}`);
  console.log('[db] Account/profile/friend data: Supabase');
});
