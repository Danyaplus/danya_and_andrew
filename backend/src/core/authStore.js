import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
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
    hasPassword: true,
  };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(user, password) {
  const expected = Buffer.from(user.passwordHash || '', 'hex');
  const actual = Buffer.from(hashPassword(String(password || ''), user.passwordSalt || ''), 'hex');
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
    avatar: row.avatar || null,
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
  }

  async init() {
    const now = Date.now();
    const cleanup = await this.supabase.from('sessions').delete().lte('expires_at', now);
    if (cleanup.error) throw dbError(cleanup.error);

    const [usersResult, sessionsResult, requestsResult, friendsResult] = await Promise.all([
      this.supabase.from('users').select('*').order('created_at', { ascending: true }),
      this.supabase.from('sessions').select('*').gt('expires_at', now),
      this.supabase.from('friend_requests').select('*'),
      this.supabase.from('friendships').select('*'),
    ]);

    for (const result of [usersResult, sessionsResult, requestsResult, friendsResult]) {
      if (result.error) throw dbError(result.error);
    }

    this.data.users = (usersResult.data || []).map(rowToUser);
    this.data.sessions = (sessionsResult.data || []).map((row) => ({
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    }));

    const byId = new Map(this.data.users.map((user) => [user.id, user]));

    for (const row of requestsResult.data || []) {
      byId.get(row.from_user_id)?.outgoing.push(row.to_user_id);
      byId.get(row.to_user_id)?.incoming.push(row.from_user_id);
    }

    for (const row of friendsResult.data || []) {
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

  pruneSessions() {
    const now = Date.now();
    this.data.sessions = this.data.sessions.filter((session) => session.expiresAt > now);
  }

  validateCredentials(username, password, { registering = false, ignoreUserId = null } = {}) {
    const cleanUsername = normalizeUsername(username);
    const cleanPassword = String(password || '');

    if (!USERNAME_RE.test(cleanUsername)) throw new Error('USERNAME_INVALID');
    if (cleanPassword.length < 6 || cleanPassword.length > 128) throw new Error('PASSWORD_INVALID');

    if (
      registering &&
      this.data.users.some((user) => user.id !== ignoreUserId && user.usernameKey === usernameKey(cleanUsername))
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
      passwordHash: hashPassword(credentials.password, salt),
      avatar: null,
      email: '',
      friends: [],
      incoming: [],
      outgoing: [],
      createdAt: Date.now(),
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
    try {
      const token = await this.createSessionForUser(user.id);
      return { token, user: privateUser(user) };
    } catch (error) {
      this.data.users = this.data.users.filter((item) => item.id !== user.id);
      await this.supabase.from('users').delete().eq('id', user.id);
      throw error;
    }
  }

  async login(username, password) {
    const cleanUsername = normalizeUsername(username);
    const user = this.data.users.find((item) => item.usernameKey === usernameKey(cleanUsername));
    if (!user || !verifyPassword(user, password)) throw new Error('AUTH_INVALID');

    const token = await this.createSessionForUser(user.id);
    return { token, user: privateUser(user) };
  }

  getUserByToken(token) {
    if (!token || typeof token !== 'string') return null;
    this.pruneSessions();
    const session = this.data.sessions.find((item) => item.tokenHash === hashToken(token));
    if (!session || session.expiresAt <= Date.now()) return null;
    return this.data.users.find((user) => user.id === session.userId) || null;
  }

  async revokeToken(token) {
    if (!token) return;
    const hashed = hashToken(token);
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== hashed);
    const result = await this.supabase.from('sessions').delete().eq('token_hash', hashed);
    if (result.error) throw dbError(result.error);
  }

  getPublicUser(userId) {
    return publicUser(this.data.users.find((user) => user.id === userId));
  }

  getPrivateUser(userId) {
    return privateUser(this.data.users.find((user) => user.id === userId));
  }

  async updateAvatar(userId, avatar) {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const cleanAvatar = safeAvatar(avatar);

    const result = await this.supabase.from('users').update({ avatar: cleanAvatar }).eq('id', userId);
    if (result.error) throw dbError(result.error);

    user.avatar = cleanAvatar;
    return privateUser(user);
  }

  async updateEmail(userId, value) {
    const user = this.data.users.find((item) => item.id === userId);
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
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const displayName = safeDisplayName(value);

    const result = await this.supabase.from('users').update({ display_name: displayName }).eq('id', userId);
    if (result.error) throw dbError(result.error);

    user.displayName = displayName;
    return privateUser(user);
  }

  async updateUsername(userId, value, currentPassword) {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!verifyPassword(user, currentPassword)) throw new Error('AUTH_INVALID');

    const clean = this.validateCredentials(value, currentPassword, {
      registering: true,
      ignoreUserId: userId,
    }).username;
    const key = usernameKey(clean);

    const result = await this.supabase.from('users').update({
      username: clean,
      username_key: key,
    }).eq('id', userId);

    if (result.error) {
      if (result.error.code === '23505') throw new Error('USERNAME_TAKEN');
      throw dbError(result.error);
    }

    user.username = clean;
    user.usernameKey = key;
    return privateUser(user);
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!verifyPassword(user, currentPassword)) throw new Error('AUTH_INVALID');

    const cleanNewPassword = String(newPassword || '');
    if (cleanNewPassword.length < 6 || cleanNewPassword.length > 128) throw new Error('PASSWORD_INVALID');

    const salt = randomBytes(16).toString('hex');
    const passwordHash = hashPassword(cleanNewPassword, salt);
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
    const user = this.data.users.find((item) => item.id === userId);
    return Boolean(user && user.friends.includes(otherId));
  }

  relationship(userId, otherId) {
    const user = this.data.users.find((item) => item.id === userId);
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
    const user = this.data.users.find((item) => item.id === userId);
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

    const user = this.data.users.find((item) => item.id === userId);
    const target = this.data.users.find((item) => item.id === targetId);
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
    const user = this.data.users.find((item) => item.id === userId);
    const target = this.data.users.find((item) => item.id === targetId);
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
    const user = this.data.users.find((item) => item.id === userId);
    const target = this.data.users.find((item) => item.id === targetId);
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

  async getDirectHistory(a, b) {
    const filter = `and(from_user_id.eq.${a},to_user_id.eq.${b}),and(from_user_id.eq.${b},to_user_id.eq.${a})`;
    const result = await this.supabase
      .from('direct_messages')
      .select('*')
      .or(filter)
      .order('created_at', { ascending: false })
      .limit(120);
    if (result.error) throw dbError(result.error);

    const rows = [...(result.data || [])].reverse();
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
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    const [messagesResult, readsResult] = await Promise.all([
      this.supabase
        .from('direct_messages')
        .select('*')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(1000),
      this.supabase
        .from('direct_chat_reads')
        .select('friend_id,last_read_at')
        .eq('user_id', userId),
    ]);
    if (messagesResult.error) throw dbError(messagesResult.error);
    if (readsResult.error) throw dbError(readsResult.error);

    const reads = new Map((readsResult.data || []).map((row) => [row.friend_id, Number(row.last_read_at) || 0]));
    const latest = new Map();
    const unread = new Map();

    for (const row of messagesResult.data || []) {
      const friendId = row.from_user_id === userId ? row.to_user_id : row.from_user_id;
      if (!user.friends.includes(friendId)) continue;
      if (!latest.has(friendId)) latest.set(friendId, row);
      if (row.to_user_id === userId && Number(row.created_at) > (reads.get(friendId) || 0)) {
        unread.set(friendId, (unread.get(friendId) || 0) + 1);
      }
    }

    return user.friends
      .map((friendId) => {
        const friend = this.getPublicUser(friendId);
        if (!friend) return null;
        const row = latest.get(friendId);
        return {
          friend,
          unreadCount: unread.get(friendId) || 0,
          lastMessage: row ? {
            id: row.id,
            text: row.text,
            fromUserId: row.from_user_id,
            createdAt: Number(row.created_at),
          } : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
  }

  async toggleDirectReaction(userId, messageId, emoji) {
    const found = await this.supabase
      .from('direct_messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();
    if (found.error) throw dbError(found.error);
    const row = found.data;
    if (!row) throw new Error('MESSAGE_NOT_FOUND');
    if (row.from_user_id !== userId && row.to_user_id !== userId) throw new Error('MESSAGE_NOT_FOUND');

    const reactions = normalizeReactions(row.reactions);
    const ids = new Set(reactions[emoji] || []);
    if (ids.has(userId)) ids.delete(userId);
    else ids.add(userId);
    if (ids.size) reactions[emoji] = [...ids];
    else delete reactions[emoji];

    const updated = await this.supabase
      .from('direct_messages')
      .update({ reactions })
      .eq('id', messageId);
    if (updated.error) throw dbError(updated.error);

    return {
      messageId,
      fromUserId: row.from_user_id,
      toUserId: row.to_user_id,
      reactions,
    };
  }

}
