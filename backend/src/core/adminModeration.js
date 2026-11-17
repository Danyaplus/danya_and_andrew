import { isIP } from 'node:net';

// The server is the authority. Browser-side flags never grant or revoke access.
const now = () => Date.now();
const safeIp = value => {
  const ip = String(value || '').trim().replace(/^::ffff:/, '');
  return isIP(ip) ? ip : null;
};
const active = record => Boolean(record && Number(record.start_at) <= now()
  && (record.expires_at == null || Number(record.expires_at) > now()));
const asPublicBan = (record, kind) => ({
  kind, startAt: Number(record.start_at), endsAt: record.expires_at == null ? null : Number(record.expires_at),
  permanent: record.expires_at == null, reason: record.reason || '',
});

export function requestPublicIp(req, trustProxy = false) {
  // With one trusted reverse proxy, the *rightmost* forwarded address is the
  // hop immediately before that proxy. Never trust an arbitrary leftmost value.
  const forwarded = trustProxy && req?.headers?.['x-forwarded-for'];
  const lastHop = typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : '';
  return safeIp(lastHop) || safeIp(req?.socket?.remoteAddress) || null;
}

export class AdminModeration {
  constructor(db) {
    this.db = db;
    this.accountBans = new Map();
    this.ipBans = new Map();
    this.ready = false;
    this.loadErrorKind = null;
  }
  async load() {
    // PostgREST has a response row cap. Hydrate all bans in pages, otherwise
    // old bans beyond the first 1000 could be bypassed after a server restart.
    const readAll = async table => {
      const output = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await this.db.from(table).select('*').range(offset, offset + 499);
        if (error) throw error;
        output.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      return output;
    };
    const [accountRows, ipRows] = await Promise.all([
      readAll('codumi_admin_account_bans'), readAll('codumi_admin_ip_bans'),
    ]);
    this.accountBans = new Map(accountRows.map(x => [x.user_id, x]));
    this.ipBans = new Map(ipRows.map(x => [x.ip, x]));
    this.ready = true;
    this.loadErrorKind = null;
    // Retain only 90 days of IP association records.
    try {
      const prune = await this.db.from('codumi_admin_ip_visits').delete()
        .lt('last_seen_at', now() - 90 * 86400000);
      if (prune.error) console.warn('[moderation] IP retention:', prune.error.message);
    } catch (error) { console.warn('[moderation] IP retention:', error?.message); }
  }
  checkAccount(id) { const ban = this.accountBans.get(id); return active(ban) ? asPublicBan(ban, 'account') : null; }
  checkIp(ip) { const ban = this.ipBans.get(safeIp(ip)); return active(ban) ? asPublicBan(ban, 'ip') : null; }
  check(id, ip) { return this.checkIp(ip) || (id && this.checkAccount(id)) || null; }
  async rememberIp(id, ip) {
    const safe = safeIp(ip);
    if (!this.ready || !id || !safe) return;
    const result = await this.db.from('codumi_admin_ip_visits').upsert({
      user_id: id, ip: safe, last_seen_at: now(),
    }, { onConflict: 'user_id,ip' });
    if (result.error) throw result.error;
  }
  async getIps(id) {
    if (!this.ready) return [];
    const { data, error } = await this.db.from('codumi_admin_ip_visits')
      .select('ip,last_seen_at').eq('user_id', id).order('last_seen_at', { ascending: false }).limit(30);
    if (error) throw error;
    return (data || []).map(row => ({ ip: row.ip, lastSeenAt: Number(row.last_seen_at), banned: Boolean(this.checkIp(row.ip)) }));
  }
  async listBans() {
    const [a, b] = await Promise.all([
      this.db.from('codumi_admin_account_bans').select('*').order('created_at', { ascending: false }).limit(250),
      this.db.from('codumi_admin_ip_bans').select('*').order('created_at', { ascending: false }).limit(250),
    ]);
    if (a.error || b.error) throw a.error || b.error;
    return {
      accounts: (a.data || []).map(row => ({ userId: row.user_id, ...asPublicBan(row, 'account') })),
      ips: (b.data || []).map(row => ({ ip: row.ip, ...asPublicBan(row, 'ip') })),
    };
  }
  async banAccount(id, { startAt, endsAt, reason }) {
    const row = { user_id: id, start_at: startAt, expires_at: endsAt, reason, created_at: now() };
    const result = await this.db.from('codumi_admin_account_bans').upsert(row, { onConflict: 'user_id' });
    if (result.error) throw result.error;
    this.accountBans.set(id, row);
    return asPublicBan(row, 'account');
  }
  async unbanAccount(id) {
    const result = await this.db.from('codumi_admin_account_bans').delete().eq('user_id', id);
    if (result.error) throw result.error;
    this.accountBans.delete(id);
  }
  async banIp(ip, { startAt, endsAt, reason }) {
    const safe = safeIp(ip);
    if (!safe) throw new Error('INVALID_IP');
    const row = { ip: safe, start_at: startAt, expires_at: endsAt, reason, created_at: now() };
    const result = await this.db.from('codumi_admin_ip_bans').upsert(row, { onConflict: 'ip' });
    if (result.error) throw result.error;
    this.ipBans.set(safe, row);
    return asPublicBan(row, 'ip');
  }
  async unbanIp(ip) {
    const safe = safeIp(ip);
    if (!safe) throw new Error('INVALID_IP');
    const result = await this.db.from('codumi_admin_ip_bans').delete().eq('ip', safe);
    if (result.error) throw result.error;
    this.ipBans.delete(safe);
  }
  async log(action, { userId = null, ip = null, amount = null, reason = '', detail = null } = {}) {
    const result = await this.db.from('codumi_admin_audit').insert({
      action, user_id: userId, ip: safeIp(ip), amount,
      reason, detail, created_at: now(),
    });
    if (result.error) throw result.error;
  }
  forgetAccount(id) { this.accountBans.delete(id); }
}
