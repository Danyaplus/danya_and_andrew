// Small in-memory rate limiter. Works on a single Node/Render instance.
// A distributed deployment should share counters (e.g. in Redis).
export class WindowLimiter {
  constructor({ maxKeys = 10_000, now = Date.now } = {}) {
    this.records = new Map();
    this.maxKeys = maxKeys;
    this.now = now;
    this.requests = 0;
  }

  allow(key, limit, windowMs) {
    const now = this.now();
    const record = this.records.get(key);
    if (!record || now >= record.expiresAt) {
      if (!record && this.records.size >= this.maxKeys) this.prune(now);
      // Fail closed on counter saturation instead of clearing active limits.
      if (!record && this.records.size >= this.maxKeys) return false;
      this.records.set(key, { count: 1, expiresAt: now + windowMs });
      return true;
    }
    if (record.count >= limit) return false;
    record.count += 1;
    return true;
  }

  prune(now = this.now()) {
    for (const [key, record] of this.records) {
      if (now >= record.expiresAt) this.records.delete(key);
    }
  }
}

export const SOCKET_LIMITS = Object.freeze({
  'game:action': [100, 1000],      // Fast reaction and continuous-control games
  'queue:join': [10, 60_000],
  'queue:leave': [25, 60_000],
  'match:leave': [15, 60_000],
  'match:resume:request': [15, 60_000],
  'match:heartbeat': [12, 10_000],
  'chat:send': [5, 10_000],
  'chat:react': [25, 10_000],
  'chat:delete': [12, 10_000],
  'chat:history:request': [6, 10_000],
  'presence:request': [10, 10_000],
  'auth:session': [10, 60_000],
  'auth:logout': [10, 60_000],
  'dm:send': [8, 10_000],
  'dm:react': [25, 10_000],
  'dm:delete': [12, 10_000],
  'dm:read': [20, 10_000],
  'dm:history:request': [12, 10_000],
  'dm:summary:request': [12, 10_000],
});

export function createSocketGuard(now = Date.now) {
  const limiter = new WindowLimiter({ maxKeys: 64, now });
  return (event) => {
    // A total budget prevents bypassing the limit by alternating event names.
    if (!limiter.allow('total', 130, 1000)) return false;
    const [count, windowMs] = SOCKET_LIMITS[event] || [20, 10_000];
    return limiter.allow(`event:${event}`, count, windowMs);
  };
}

export function allowedOrigin(origin, allowedOrigins) {
  // Non-browser clients may omit Origin; CORS is not an authentication method.
  return !origin || allowedOrigins.has(origin);
}

export function isGameAction(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.roomId === 'string' && value.roomId.length <= 100
    && value.action && typeof value.action === 'object' && !Array.isArray(value.action)
    && typeof value.action.type === 'string' && value.action.type.length <= 64);
}

export function isQueueRequest(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.gameId === 'string' && value.gameId.length <= 80
    && (!value.mode || value.mode === 'public' || value.mode === 'party')
    && (value.partyId == null || (typeof value.partyId === 'string' && value.partyId.length <= 80))
    && (value.playerName == null || (typeof value.playerName === 'string' && value.playerName.length <= 80)));
}
