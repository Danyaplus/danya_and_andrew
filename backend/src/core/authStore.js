import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const USERNAME_RE = /^[\p{L}\p{N}_-]{3,20}$/u;
const MAX_AVATAR_LENGTH = 420_000;

function normalizeUsername(value) {
  return String(value || '').trim();
}

function usernameKey(value) {
  return normalizeUsername(value).toLocaleLowerCase('ru-RU');
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar || null,
    createdAt: user.createdAt,
  };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function safeAvatar(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_AVATAR_LENGTH) {
    throw new Error('AVATAR_TOO_LARGE');
  }
  if (!/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
    throw new Error('AVATAR_INVALID');
  }
  return value;
}

function ensureArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

export class AuthStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { users: [], sessions: [] };
    this.load();
  }

  load() {
    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
        this.data.users = Array.isArray(parsed?.users) ? parsed.users : [];
        this.data.sessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
      }
    } catch (error) {
      console.error('[auth] Не удалось прочитать аккаунты:', error);
      this.data = { users: [], sessions: [] };
    }

    for (const user of this.data.users) {
      user.friends = ensureArray(user.friends);
      user.incoming = ensureArray(user.incoming);
      user.outgoing = ensureArray(user.outgoing);
      user.avatar = user.avatar || null;
    }

    this.pruneSessions(false);
  }

  save() {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
    renameSync(temp, this.filePath);
  }

  pruneSessions(shouldSave = true) {
    const now = Date.now();
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((session) => session.expiresAt > now);
    if (shouldSave && before !== this.data.sessions.length) this.save();
  }

  validateCredentials(username, password, { registering = false } = {}) {
    const cleanUsername = normalizeUsername(username);
    const cleanPassword = String(password || '');

    if (!USERNAME_RE.test(cleanUsername)) {
      throw new Error('USERNAME_INVALID');
    }
    if (cleanPassword.length < 6 || cleanPassword.length > 128) {
      throw new Error('PASSWORD_INVALID');
    }
    if (registering && this.data.users.some((user) => user.usernameKey === usernameKey(cleanUsername))) {
      throw new Error('USERNAME_TAKEN');
    }

    return { username: cleanUsername, password: cleanPassword };
  }

  register(username, password) {
    const credentials = this.validateCredentials(username, password, { registering: true });
    const salt = randomBytes(16).toString('hex');
    const user = {
      id: randomUUID(),
      username: credentials.username,
      usernameKey: usernameKey(credentials.username),
      passwordSalt: salt,
      passwordHash: hashPassword(credentials.password, salt),
      avatar: null,
      friends: [],
      incoming: [],
      outgoing: [],
      createdAt: Date.now(),
    };

    this.data.users.push(user);
    const token = this.createSessionForUser(user.id, false);
    this.save();
    return { token, user: publicUser(user) };
  }

  login(username, password) {
    const cleanUsername = normalizeUsername(username);
    const cleanPassword = String(password || '');
    const user = this.data.users.find((item) => item.usernameKey === usernameKey(cleanUsername));
    if (!user) throw new Error('AUTH_INVALID');

    const expected = Buffer.from(user.passwordHash, 'hex');
    const actual = Buffer.from(hashPassword(cleanPassword, user.passwordSalt), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error('AUTH_INVALID');
    }

    const token = this.createSessionForUser(user.id);
    return { token, user: publicUser(user) };
  }

  createSessionForUser(userId, shouldSave = true) {
    this.pruneSessions(false);
    const token = randomBytes(32).toString('base64url');
    this.data.sessions.push({
      tokenHash: hashToken(token),
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    if (shouldSave) this.save();
    return token;
  }

  getUserByToken(token) {
    if (!token || typeof token !== 'string') return null;
    this.pruneSessions(false);
    const tokenHashValue = hashToken(token);
    const session = this.data.sessions.find((item) => item.tokenHash === tokenHashValue);
    if (!session || session.expiresAt <= Date.now()) return null;
    return this.data.users.find((user) => user.id === session.userId) || null;
  }

  revokeToken(token) {
    if (!token) return;
    const hashed = hashToken(token);
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== hashed);
    if (before !== this.data.sessions.length) this.save();
  }

  getPublicUser(userId) {
    return publicUser(this.data.users.find((user) => user.id === userId));
  }

  updateAvatar(userId, avatar) {
    const user = this.data.users.find((item) => item.id === userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.avatar = safeAvatar(avatar);
    this.save();
    return publicUser(user);
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

  sendFriendRequest(userId, targetId) {
    if (!targetId || userId === targetId) throw new Error('FRIEND_INVALID');
    const user = this.data.users.find((item) => item.id === userId);
    const target = this.data.users.find((item) => item.id === targetId);
    if (!user || !target) throw new Error('USER_NOT_FOUND');
    if (user.friends.includes(targetId)) return { status: 'friend' };

    // If they already sent us a request, accept it immediately.
    if (user.incoming.includes(targetId)) {
      return this.acceptFriendRequest(userId, targetId);
    }

    if (!user.outgoing.includes(targetId)) user.outgoing.push(targetId);
    if (!target.incoming.includes(userId)) target.incoming.push(userId);
    this.save();
    return { status: 'outgoing' };
  }

  acceptFriendRequest(userId, targetId) {
    const user = this.data.users.find((item) => item.id === userId);
    const target = this.data.users.find((item) => item.id === targetId);
    if (!user || !target) throw new Error('USER_NOT_FOUND');
    if (!user.incoming.includes(targetId) && !user.friends.includes(targetId)) {
      throw new Error('FRIEND_REQUEST_NOT_FOUND');
    }

    user.incoming = user.incoming.filter((id) => id !== targetId);
    user.outgoing = user.outgoing.filter((id) => id !== targetId);
    target.incoming = target.incoming.filter((id) => id !== userId);
    target.outgoing = target.outgoing.filter((id) => id !== userId);
    if (!user.friends.includes(targetId)) user.friends.push(targetId);
    if (!target.friends.includes(userId)) target.friends.push(userId);
    this.save();
    return { status: 'friend' };
  }

  removeFriendRelation(userId, targetId) {
    const user = this.data.users.find((item) => item.id === userId);
    const target = this.data.users.find((item) => item.id === targetId);
    if (!user || !target) throw new Error('USER_NOT_FOUND');

    user.friends = user.friends.filter((id) => id !== targetId);
    user.incoming = user.incoming.filter((id) => id !== targetId);
    user.outgoing = user.outgoing.filter((id) => id !== targetId);
    target.friends = target.friends.filter((id) => id !== userId);
    target.incoming = target.incoming.filter((id) => id !== userId);
    target.outgoing = target.outgoing.filter((id) => id !== userId);
    this.save();
    return { status: 'none' };
  }
}
