import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derivePassword = promisify(scrypt);
import { createClient } from '@supabase/supabase-js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const USERNAME_RE = /^[\p{L}\p{N}_-]{3,20}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AVATAR_LENGTH = 420_000;

function normalizeUsername(value) {
  return String(value || '').trim();
}

function usernameKey(value) {
  return normalizeUsername(value).toLocaleLowerCase('ru-RU');
}

function normalizeDisplayName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 28);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function ensureArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatar: user.avatar || null,
    createdAt: user.createdAt,
  };
}

function privateUser(user) {
  const visible = publicUser(user);
  if (!visible) return null;
  return {
    ...visible,
    email: user.email || '',
    language: user.language || 'uk',
    hasPassword: true,
  };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password, salt) {
  return (await derivePassword(password, salt, 64)).toString('hex');
}

async function verifyPassword(user, password) {
  const expected = Buffer.from(user.passwordHash || '', 'hex');
  const actual = Buffer.from(await hashPassword(String(password || ''), user.passwordSalt || ''), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

function safeAvatar(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_AVATAR_LENGTH) throw new Error('AVATAR_TOO_LARGE');
  if (!/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
    throw new Error('AVATAR_INVALID');
  }
  return value;
}

function safeEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return '';
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new Error('EMAIL_INVALID');
  return email;
}

function safeDisplayName(value) {
  const displayName = normalizeDisplayName(value);
  if (!displayName) throw new Error('DISPLAY_NAME_INVALID');
  return displayName;
}

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    usernameKey: row.username_key,
    displayName: row.display_name || row.username,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    email: normalizeEmail(row.email),
    language: row.language || 'uk',
    avatar: row.avatar || null,
    lastSeenAt: Number(row.last_seen_at) || null,
    friends: [],
    incoming: [],
    outgoing: [],
    createdAt: Number(row.created_at),
  };
}


function normalizeReactions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [emoji, ids] of Object.entries(value)) {
    if (!Array.isArray(ids)) continue;
    result[emoji] = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
  }
  return result;
}

function directRowToMessage(row, author, replyRow = null) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    name: author?.displayName || author?.username || 'Игрок',
    avatar: author?.avatar || null,
    text: row.text,
    createdAt: Number(row.created_at),
    replyToId: row.reply_to || null,
    replyTo: replyRow ? {
      id: replyRow.id,
      fromUserId: replyRow.from_user_id,
      text: replyRow.text,
      name: null,
    } : null,
    reactions: normalizeReactions(row.reactions),
    media: row.media_path ? { kind: row.media_kind, mime: row.media_mime, size: Number(row.media_size) || 0 } : null,
  };
}

function pair(a, b) {
  return String(a) < String(b) ? [a, b] : [b, a];
}

function dbError(error) {
  if (!error) return null;
  const next = new Error(error.code || error.message || 'DATABASE_ERROR');
  next.db = error;
  return next;
}

export class AuthStore {
  constructor({ url, secretKey }) {
    if (!url || !secretKey) throw new Error('SUPABASE_CONFIG_REQUIRED');
    this.supabase = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    this.data = { users: [], sessions: [] };
    this.usersById = new Map();
    this.usersByUsername = new Map();
    this.sessionsByHash = new Map();
    this.lastSessionPrune = 0;
  }

  // Supabase REST defaults to a limited row count. Read every page so
  // existing accounts and friendships never silently disappear at 1000 rows.
  async fetchAllRows(table, configure = (query) => query) {
    const PAGE = 500;
    const output = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await configure(this.supabase.from(table).select('*'))
        .range(offset, offset + PAGE - 1);
      if (error) throw dbError(error);
      output.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return output;
  }

  async init() {
    const now = Date.now();
    const cleanup = await this.supabase.from('sessions').delete().lte('expires_at', now);
    if (cleanup.error) throw dbError(cleanup.error);

    const [userRows, sessionRows, requestRows, friendshipRows] = await Promise.all([
      this.fetchAllRows('users', (query) => query.order('created_at', { ascending: true }).order('id', { ascending: true })),
      this.fetchAllRows('sessions', (query) => query.gt('expires_at', now).order('token_hash')),
      this.fetchAllRows('friend_requests', (query) => query.order('from_user_id').order('to_user_id')),
      this.fetchAllRows('friendships', (query) => query.order('user_a').order('user_b')),
    ]);
    this.data.users = userRows.map(rowToUser);
    this.data.sessions = sessionRows.map((row) => ({
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    }));

    this.usersById = new Map(this.data.users.map((user) => [user.id, user]));
    this.usersByUsername = new Map(this.data.users.map((user) => [user.usernameKey, user]));
    this.sessionsByHash = new Map(this.data.sessions.map((session) => [session.tokenHash, session]));
    const byId = this.usersById;

    for (const row of requestRows) {
      byId.get(row.from_user_id)?.outgoing.push(row.to_user_id);
      byId.get(row.to_user_id)?.incoming.push(row.from_user_id);
    }

    for (const row of friendshipRows) {
      byId.get(row.user_a)?.friends.push(row.user_b);
      byId.get(row.user_b)?.friends.push(row.user_a);
    }

    for (const user of this.data.users) {
      user.friends = ensureArray(user.friends);
      user.incoming = ensureArray(user.incoming);
      user.outgoing = ensureArray(user.outgoing);
    }

    console.log(`[db] Supabase ready: ${this.data.users.length} users`);
  }

  // Scanning all 30-day sessions on every HTTP/socket request is expensive.
  // Fast path is a Map lookup; expired tokens are rejected even before pruning.
  pruneSessions() {
    const now = Date.now();
    if (now - this.lastSessionPrune < 60_000) return;
    this.lastSessionPrune = now;
    this.data.sessions = this.data.sessions.filter((session) => session.expiresAt > now);
    this.sessionsByHash = new Map(this.data.sessions.map((session) => [session.tokenHash, session]));
  }

  getUserRecord(userId) {
    return this.usersById.get(userId) || null;
  }

  validateCredentials(username, password, { registering = false, ignoreUserId = null } = {}) {
    const cleanUsername = normalizeUsername(username);
    const cleanPassword = String(password || '');

    if (!USERNAME_RE.test(cleanUsername)) throw new Error('USERNAME_INVALID');
    if (cleanPassword.length < 6 || cleanPassword.length > 128) throw new Error('PASSWORD_INVALID');

    if (
      registering &&
      (this.usersByUsername.has(usernameKey(cleanUsername))
        && this.usersByUsername.get(usernameKey(cleanUsername)).id !== ignoreUserId)
    ) {
      throw new Error('USERNAME_TAKEN');
    }

    return { username: cleanUsername, password: cleanPassword };
  }

  async createSessionForUser(userId) {
    this.pruneSessions();
    const token = randomBytes(32).toString('base64url');
    const session = {
      tokenHash: hashToken(token),
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };

    const result = await this.supabase.from('sessions').insert({
      token_hash: session.tokenHash,
      user_id: session.userId,
      created_at: session.createdAt,
      expires_at: session.expiresAt,
    });
    if (result.error) throw dbError(result.error);

    this.data.sessions.push(session);
    this.sessionsByHash.set(session.tokenHash, session);
    return token;
  }

  async register(username, password) {
    const credentials = this.validateCredentials(username, password, { registering: true });
    const salt = randomBytes(16).toString('hex');
    const user = {
      id: randomUUID(),
      username: credentials.username,
      usernameKey: usernameKey(credentials.username),
      displayName: credentials.username,
      passwordSalt: salt,
      passwordHash: await hashPassword(credentials.password, salt),
      avatar: null,
      email: '',
      language: 'uk',
      friends: [],
      incoming: [],
      outgoing: [],
      createdAt: Date.now(),
      lastSeenAt: null,
    };

    const inserted = await this.supabase.from('users').insert({
      id: user.id,
      username: user.username,
      username_key: user.usernameKey,
      display_name: user.displayName,
      password_salt: user.passwordSalt,
      password_hash: user.passwordHash,
      email: null,
      avatar: null,
      created_at: user.createdAt,
    });

    if (inserted.error) {
      if (inserted.error.code === '23505') throw new Error('USERNAME_TAKEN');
      throw dbError(inserted.error);
    }

    this.data.users.push(user);
    this.usersById.set(user.id, user);
    this.usersByUsername.set(user.usernameKey, user);
    try {
      const token = await this.createSessionForUser(user.id);
      return { token, user: privateUser(user) };
    } catch (error) {
      this.data.users = this.data.users.filter((item) => item.id !== user.id);
      this.usersById.delete(user.id);
      this.usersByUsername.delete(user.usernameKey);
      await this.supabase.from('users').delete().eq('id', user.id);
      throw error;
    }
  }

  async login(username, password) {
    const cleanUsername = normalizeUsername(username);
    const user = this.usersByUsername.get(usernameKey(cleanUsername));
    if (!user || !await verifyPassword(user, password)) throw new Error('AUTH_INVALID');

    const token = await this.createSessionForUser(user.id);
    return { token, user: privateUser(user) };
  }

  getUserByToken(token) {
    if (!token || typeof token !== 'string') return null;
    this.pruneSessions();
    const session = this.sessionsByHash.get(hashToken(token));
    if (!session || session.expiresAt <= Date.now()) return null;
    return this.getUserRecord(session.userId);
  }

  async revokeToken(token) {
    if (!token) return;
    const hashed = hashToken(token);
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== hashed);
    this.sessionsByHash.delete(hashed);
    const result = await this.supabase.from('sessions').delete().eq('token_hash', hashed);
    if (result.error) throw dbError(result.error);
  }

  getPublicUser(userId) {
    return publicUser(this.getUserRecord(userId));
  }

  getPrivateUser(userId) {
    return privateUser(this.getUserRecord(userId));
  }

  async updateAvatar(userId, avatar) {
    const user = this.getUserRecord(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const cleanAvatar = safeAvatar(avatar);

    const result = await this.supabase.from('users').update({ avatar: cleanAvatar }).eq('id', userId);
    if (result.error) throw dbError(result.error);

    user.avatar = cleanAvatar;
    return privateUser(user);
  }

  async updateLanguage(userId, language) {
    if (!['uk', 'ru', 'en'].includes(language)) throw new Error('LANGUAGE_INVALID');
    const user = this.getUserRecord(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const result = await this.supabase.from('users').update({ language }).eq('id', userId);
    if (result.error) throw dbError(result.error);
    user.language = language;
    return privateUser(user);
  }

  async updateEmail(userId, value) {
    const user = this.getUserRecord(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const email = safeEmail(value);

    if (email && this.data.users.some((item) => item.id !== userId && normalizeEmail(item.email) === email)) {
      throw new Error('EMAIL_TAKEN');
    }

    const result = await this.supabase.from('users').update({ email: email || null }).eq('id', userId);
    if (result.error) {
      if (result.error.code === '23505') throw new Error('EMAIL_TAKEN');
      throw dbError(result.error);
    }

    user.email = email;
    return privateUser(user);
  }

  async updateDisplayName(userId, value) {
    const user = this.getUserRecord(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const displayName = safeDisplayName(value);

    const result = await this.supabase.from('users').update({ display_name: displayName }).eq('id', userId);
    if (result.error) throw dbError(result.error);

    user.displayName = displayName;
    return privateUser(user);
  }

  // Login is permanent. The original login may only be used for signing in.
  async updateUsername() {
    throw new Error('LOGIN_IMMUTABLE');
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = this.getUserRecord(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!await verifyPassword(user, currentPassword)) throw new Error('AUTH_INVALID');

    const cleanNewPassword = String(newPassword || '');
    if (cleanNewPassword.length < 6 || cleanNewPassword.length > 128) throw new Error('PASSWORD_INVALID');

    const salt = randomBytes(16).toString('hex');
    const passwordHash = await hashPassword(cleanNewPassword, salt);
    const result = await this.supabase.from('users').update({
      password_salt: salt,
      password_hash: passwordHash,
    }).eq('id', userId);
    if (result.error) throw dbError(result.error);

    user.passwordSalt = salt;
    user.passwordHash = passwordHash;
    return privateUser(user);
  }

  areFriends(userId, otherId) {
    const user = this.getUserRecord(userId);
    return Boolean(user && user.friends.includes(otherId));
  }

  relationship(userId, otherId) {
    const user = this.getUserRecord(userId);
    if (!user) return 'none';
    if (user.friends.includes(otherId)) return 'friend';
    if (user.incoming.includes(otherId)) return 'incoming';
    if (user.outgoing.includes(otherId)) return 'outgoing';
    return 'none';
  }

  searchUsers(userId, query) {
    // Friends are searched only by login. Display name is intentionally ignored.
    const needle = normalizeUsername(query).toLocaleLowerCase('ru-RU');
    if (!needle) return [];

    return this.data.users
      .filter((user) => user.id !== userId && user.usernameKey.includes(needle))
      .slice(0, 12)
      .map((user) => ({
        ...publicUser(user),
        relation: this.relationship(userId, user.id),
      }));
  }

  getFriendsPayload(userId) {
    const user = this.getUserRecord(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    const byId = new Map(this.data.users.map((item) => [item.id, item]));
    const mapPublic = (ids) => ids.map((id) => publicUser(byId.get(id))).filter(Boolean);

    return {
      friends: mapPublic(user.friends),
      incoming: mapPublic(user.incoming),
      outgoing: mapPublic(user.outgoing),
    };
  }

  async sendFriendRequest(userId, targetId) {
    if (!targetId || userId === targetId) throw new Error('FRIEND_INVALID');

    const user = this.getUserRecord(userId);
    const target = this.getUserRecord(targetId);
    if (!user || !target) throw new Error('USER_NOT_FOUND');
    if (user.friends.includes(targetId)) return { status: 'friend' };

    if (user.incoming.includes(targetId)) {
      return this.acceptFriendRequest(userId, targetId);
    }

    const result = await this.supabase.from('friend_requests').insert({
      from_user_id: userId,
      to_user_id: targetId,
      created_at: Date.now(),
    });

    if (result.error && result.error.code !== '23505') throw dbError(result.error);

    if (!user.outgoing.includes(targetId)) user.outgoing.push(targetId);
    if (!target.incoming.includes(userId)) target.incoming.push(userId);
    return { status: 'outgoing' };
  }

  async acceptFriendRequest(userId, targetId) {
    const user = this.getUserRecord(userId);
    const target = this.getUserRecord(targetId);
    if (!user || !target) throw new Error('USER_NOT_FOUND');

    if (!user.incoming.includes(targetId) && !user.friends.includes(targetId)) {
      throw new Error('FRIEND_REQUEST_NOT_FOUND');
    }

    const deleteForward = await this.supabase
      .from('friend_requests')
      .delete()
      .eq('from_user_id', targetId)
      .eq('to_user_id', userId);
    if (deleteForward.error) throw dbError(deleteForward.error);

    const deleteReverse = await this.supabase
      .from('friend_requests')
      .delete()
      .eq('from_user_id', userId)
      .eq('to_user_id', targetId);
    if (deleteReverse.error) throw dbError(deleteReverse.error);

    const [a, b] = pair(userId, targetId);
    const inserted = await this.supabase.from('friendships').upsert({
      user_a: a,
      user_b: b,
      created_at: Date.now(),
    }, { onConflict: 'user_a,user_b', ignoreDuplicates: true });
    if (inserted.error) throw dbError(inserted.error);

    user.incoming = user.incoming.filter((id) => id !== targetId);
    user.outgoing = user.outgoing.filter((id) => id !== targetId);
    target.incoming = target.incoming.filter((id) => id !== userId);
    target.outgoing = target.outgoing.filter((id) => id !== userId);

    if (!user.friends.includes(targetId)) user.friends.push(targetId);
    if (!target.friends.includes(userId)) target.friends.push(userId);

    return { status: 'friend' };
  }

  async removeFriendRelation(userId, targetId) {
    const user = this.getUserRecord(userId);
    const target = this.getUserRecord(targetId);
    if (!user || !target) throw new Error('USER_NOT_FOUND');

    const [a, b] = pair(userId, targetId);
    const results = await Promise.all([
      this.supabase.from('friendships').delete().eq('user_a', a).eq('user_b', b),
      this.supabase.from('friend_requests').delete().eq('from_user_id', userId).eq('to_user_id', targetId),
      this.supabase.from('friend_requests').delete().eq('from_user_id', targetId).eq('to_user_id', userId),
    ]);
    for (const result of results) if (result.error) throw dbError(result.error);

    user.friends = user.friends.filter((id) => id !== targetId);
    user.incoming = user.incoming.filter((id) => id !== targetId);
    user.outgoing = user.outgoing.filter((id) => id !== targetId);
    target.friends = target.friends.filter((id) => id !== userId);
    target.incoming = target.incoming.filter((id) => id !== userId);
    target.outgoing = target.outgoing.filter((id) => id !== userId);

    return { status: 'none' };
  }

  async recordLastSeen(userId, timestamp = Date.now()) {
    const user = this.getUserRecord(userId);
    if (!user) return;
    user.lastSeenAt = timestamp;
    const result = await this.supabase.from('users').update({ last_seen_at: timestamp }).eq('id', userId);
    if (result.error) throw dbError(result.error);
  }

  async getDirectMessageForMedia(messageId, userId) {
    const result = await this.supabase.from('direct_messages')
      .select('id,from_user_id,to_user_id,media_path,media_mime,media_kind')
      .eq('id', messageId).maybeSingle();
    if (result.error) throw dbError(result.error);
    const row = result.data;
    if (!row || !row.media_path || (row.from_user_id !== userId && row.to_user_id !== userId)) return null;
    const hidden = await this.supabase.from('direct_message_hidden')
      .select('message_id').eq('user_id', userId).eq('message_id', messageId).maybeSingle();
    if (hidden.error) throw dbError(hidden.error);
    if (hidden.data) return null;
    return row;
  }

  async saveDirectMedia(fromUserId, toUserId, { buffer, mime, kind, label }) {
    if (!this.areFriends(fromUserId, toUserId)) throw new Error('FRIEND_REQUIRED');
    const id = randomUUID();
    const mediaPath = `${pair(fromUserId, toUserId).join('/')}/${id}`;
    const storage = this.supabase.storage.from('direct-chat-media');
    const uploaded = await storage.upload(mediaPath, buffer, { contentType: mime, upsert: false, cacheControl: '60' });
    if (uploaded.error) throw dbError(uploaded.error);
    const createdAt = Date.now();
    const row = {
      id, from_user_id: fromUserId, to_user_id: toUserId,
      text: label, created_at: createdAt, reply_to: null, reactions: {},
      media_path: mediaPath, media_kind: kind, media_mime: mime, media_size: buffer.length,
    };
    const inserted = await this.supabase.from('direct_messages').insert(row);
    if (inserted.error) {
      await storage.remove([mediaPath]).catch(() => {});
      throw dbError(inserted.error);
    }
    return directRowToMessage(row, this.getPublicUser(fromUserId));
  }

  async getHiddenDirectMessageIds(userId) {
    const hidden = new Set();
    const PAGE = 500;
    for (let offset = 0; ; offset += PAGE) {
      const result = await this.supabase.from('direct_message_hidden')
        .select('message_id').eq('user_id', userId)
        .order('message_id').range(offset, offset + PAGE - 1);
      if (result.error) throw dbError(result.error);
      for (const row of result.data || []) hidden.add(row.message_id);
      if ((result.data || []).length < PAGE) break;
    }
    return hidden;
  }

  async deleteDirectMessage(userId, messageId, scope) {
    const found = await this.supabase.from('direct_messages')
      .select('id,from_user_id,to_user_id,media_path')
      .eq('id', messageId).maybeSingle();
    if (found.error) throw dbError(found.error);
    const row = found.data;
    if (!row || (row.from_user_id !== userId && row.to_user_id !== userId)) {
      throw new Error('MESSAGE_NOT_FOUND');
    }
    if (scope === 'me') {
      const saved = await this.supabase.from('direct_message_hidden').upsert({
        user_id: userId,
        message_id: messageId,
        created_at: Date.now(),
      }, { onConflict: 'user_id,message_id', ignoreDuplicates: true });
      if (saved.error) throw dbError(saved.error);
      return { scope: 'me', messageId, userId };
    }
    if (scope !== 'all') throw new Error('BAD_DELETE_SCOPE');
    if (row.from_user_id !== userId) throw new Error('MESSAGE_NOT_OWNED');
    // Delete media first: if storage fails, keep the message for a safe retry.
    if (row.media_path) {
      const removed = await this.supabase.storage.from('direct-chat-media').remove([row.media_path]);
      if (removed.error) throw dbError(removed.error);
    }
    const deleted = await this.supabase.from('direct_messages')
      .delete().eq('id', messageId).eq('from_user_id', userId);
    if (deleted.error) throw dbError(deleted.error);
    return { scope: 'all', messageId, fromUserId: row.from_user_id, toUserId: row.to_user_id };
  }

  async getDirectHistory(a, b) {
    const filter = `and(from_user_id.eq.${a},to_user_id.eq.${b}),and(from_user_id.eq.${b},to_user_id.eq.${a})`;
    const result = await this.supabase
      .from('direct_messages')
      .select('*')
      .or(filter)
      .order('created_at', { ascending: false })
      .limit(120);
    if (result.error) throw dbError(result.error);

    const hiddenIds = await this.getHiddenDirectMessageIds(a);
    const rows = [...(result.data || [])].reverse().filter((row) => !hiddenIds.has(row.id));
    const byId = new Map(rows.map((row) => [row.id, row]));

    return rows.map((row) => {
      const author = this.getPublicUser(row.from_user_id);
      const message = directRowToMessage(row, author, row.reply_to ? byId.get(row.reply_to) : null);
      if (message.replyTo) {
        const replyAuthor = this.getPublicUser(message.replyTo.fromUserId);
        message.replyTo.name = replyAuthor?.displayName || replyAuthor?.username || 'Игрок';
      }
      return message;
    });
  }

  async saveDirectMessage(fromUserId, toUserId, text, replyToId = null) {
    const author = this.getPublicUser(fromUserId);
    let replyRow = null;

    if (replyToId) {
      const replyResult = await this.supabase
        .from('direct_messages')
        .select('*')
        .eq('id', replyToId)
        .maybeSingle();
      if (replyResult.error) throw dbError(replyResult.error);
      replyRow = replyResult.data || null;
      if (!replyRow) throw new Error('MESSAGE_NOT_FOUND');
      const samePair =
        (replyRow.from_user_id === fromUserId && replyRow.to_user_id === toUserId) ||
        (replyRow.from_user_id === toUserId && replyRow.to_user_id === fromUserId);
      if (!samePair) throw new Error('MESSAGE_NOT_FOUND');
    }

    const message = {
      id: randomUUID(),
      fromUserId,
      toUserId,
      name: author?.displayName || author?.username || 'Игрок',
      avatar: author?.avatar || null,
      text: String(text || '').slice(0, 500),
      createdAt: Date.now(),
      replyToId: replyRow?.id || null,
      replyTo: replyRow ? {
        id: replyRow.id,
        fromUserId: replyRow.from_user_id,
        name: this.getPublicUser(replyRow.from_user_id)?.displayName || this.getPublicUser(replyRow.from_user_id)?.username || 'Игрок',
        text: replyRow.text,
      } : null,
      reactions: {},
    };

    const result = await this.supabase.from('direct_messages').insert({
      id: message.id,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      text: message.text,
      created_at: message.createdAt,
      reply_to: message.replyToId,
      reactions: {},
    });
    if (result.error) throw dbError(result.error);

    return message;
  }

  async markDirectRead(userId, friendId) {
    if (!this.areFriends(userId, friendId)) throw new Error('FRIEND_REQUIRED');
    const result = await this.supabase.from('direct_chat_reads').upsert({
      user_id: userId,
      friend_id: friendId,
      last_read_at: Date.now(),
    }, { onConflict: 'user_id,friend_id' });
    if (result.error) throw dbError(result.error);
  }

  async getDirectSummaries(userId) {
    const user = this.getUserRecord(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const { data, error } = await this.supabase.rpc('codumi_direct_summaries', { p_user_id: userId });
    if (error) throw dbError(error);
    const result = new Map((data || []).map((row) => [row.friend_id, row]));
    return user.friends.map((friendId) => {
      const friend = this.getPublicUser(friendId);
      if (!friend) return null;
      const row = result.get(friendId);
      return {
        friend,
        unreadCount: Number(row?.unread_count || 0),
        lastMessage: row?.message_id ? {
          id: row.message_id,
          text: row.message_text,
          mediaKind: row.media_kind || null,
          fromUserId: row.from_user_id,
          createdAt: Number(row.created_at),
        } : null,
      };
    }).filter(Boolean).sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
  }

  async toggleDirectReaction(userId, messageId, emoji) {
    const { data, error } = await this.supabase.rpc('codumi_toggle_direct_reaction', {
      p_user_id: userId, p_message_id: messageId, p_emoji: emoji,
    });
    if (error) throw dbError(error);
    return { messageId, fromUserId: data.fromUserId, toUserId: data.toUserId,
      reactions: normalizeReactions(data.reactions) };
  }

  async cleanupDirectMessages(olderThanTimestamp) {
    const threshold = Number(olderThanTimestamp) || 0;
    if (!threshold) return { messages: 0, reads: 0 };
    const storage = this.supabase.storage.from('direct-chat-media');
    let removedMessages = 0;

    // Remove stored files BEFORE deleting the DB messages that reference them.
    // Run in bounded pages to avoid unbounded memory usage and orphaned media.
    for (let page = 0; page < 100; page++) {
      const found = await this.supabase.from('direct_messages')
        .select('id,media_path').lt('created_at', threshold).limit(100);
      if (found.error) throw dbError(found.error);
      const rows = found.data || [];
      if (!rows.length) break;
      const paths = rows.map((row) => row.media_path).filter(Boolean);
      if (paths.length) {
        const removed = await storage.remove(paths);
        if (removed.error) throw dbError(removed.error);
      }
      const deleted = await this.supabase.from('direct_messages')
        .delete({ count: 'exact' }).in('id', rows.map((row) => row.id))
        .lt('created_at', threshold);
      if (deleted.error) throw dbError(deleted.error);
      removedMessages += Number(deleted.count) || rows.length;
      if (rows.length < 100) break;
    }
    const reads = await this.supabase.from('direct_chat_reads')
      .delete({ count: 'exact' }).lt('last_read_at', threshold);
    if (reads.error) throw dbError(reads.error);
    return { messages: removedMessages, reads: Number(reads.count) || 0 };
  }

}
