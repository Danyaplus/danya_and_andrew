import { isIP } from 'node:net';
import { normalizePublicIp } from '../core/publicIp.js';
import { requireAdmin } from './adminAuth.js';

const maxReason = 500;
const validReason = value => typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= maxReason;
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27,45}$/i.test(value);
const validIp = value => typeof value === 'string' && Boolean(isIP(value));
const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error });
const success = (res, data = {}) => res.json({ ok: true, ...data });

function readSchedule(body) {
  const startAt = Number(body?.startAt);
  const endsAt = body?.endsAt === null ? null : Number(body?.endsAt);
  if (!Number.isSafeInteger(startAt) || startAt < Date.now() - 120_000 || startAt > Date.now() + 365 * 86400000
    || (endsAt !== null && (!Number.isSafeInteger(endsAt) || endsAt <= startAt || endsAt > startAt + 3 * 365 * 86400000))) {
    throw new Error('INVALID_BAN_DATES');
  }
  if (!validReason(body?.reason)) throw new Error('REASON_REQUIRED');
  return { startAt, endsAt, reason: body.reason.trim() };
}

export function registerAdminActions(app, { controls, authStore, userSockets, io, matchmaker, requestIpFromSocket, emitToUser, purgeEphemeralUser }) {
  const db = authStore.supabase;
  function ready(res) { if (controls.ready) return true; bad(res, 'ADMIN_MODERATION_NOT_CONFIGURED', 503); return false; }
  const user = (req, res) => {
    if (!validId(req.params.id)) { bad(res, 'PLAYER_NOT_FOUND', 404); return null; }
    const entry = authStore.getUserRecord(req.params.id);
    if (!entry) { bad(res, 'PLAYER_NOT_FOUND', 404); return null; }
    return entry;
  };
  function disconnectUser(userId, ban) {
    for (const socketId of [...(userSockets.get(userId) || [])]) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) continue;
      socket.emit('auth:error', { error: 'ACCOUNT_BANNED', ban });
      matchmaker.leaveMatch(socket);
      socket.disconnect(true);
    }
  }
  function disconnectIp(ip, ban) {
    for (const socket of io.sockets.sockets.values()) {
      if (requestIpFromSocket(socket) !== ip) continue;
      socket.emit('auth:error', { error: 'IP_BANNED', ban });
      matchmaker.leaveMatch(socket);
      socket.disconnect(true);
    }
  }
  async function record(action, detail) {
    try { await controls.log(action, detail); }
    catch (error) { console.error('[admin-audit]', error?.message || error); }
  }
  function serverError(res, error) {
    const code = error?.message || '';
    if (['INVALID_IP', 'INVALID_BAN_DATES', 'REASON_REQUIRED', 'INVALID_COINS'].includes(code)) return bad(res, code);
    if (/WALLET_MISSING_OR_LIMIT/.test(code) || /WALLET_MISSING_OR_LIMIT/.test(error?.details || '')) return bad(res, 'WALLET_MISSING_OR_LIMIT', 409);
    console.error('[admin-action]', error?.code || error?.message || error);
    return bad(res, 'ADMIN_ACTION_FAILED', 503);
  }

  app.get('/api/admin/bans', requireAdmin, async (_req, res) => {
    if (!ready(res)) return;
    try { success(res, await controls.listBans()); }
    catch (error) { serverError(res, error); }
  });
  app.post('/api/admin/players/:id/ban', requireAdmin, async (req, res) => {
    if (!ready(res)) return;
    const player = user(req, res); if (!player) return;
    try {
      const values = readSchedule(req.body);
      const ban = await controls.banAccount(player.id, values);
      await record('account_ban', { userId: player.id, reason: values.reason, detail: ban });
      if (values.startAt <= Date.now()) disconnectUser(player.id, ban);
      success(res, { ban });
    } catch (error) { serverError(res, error); }
  });
  app.post('/api/admin/players/:id/unban', requireAdmin, async (req, res) => {
    if (!ready(res)) return;
    const player = user(req, res); if (!player) return;
    try {
      await controls.unbanAccount(player.id);
      await record('account_unban', { userId: player.id });
      success(res);
    } catch (error) { serverError(res, error); }
  });
  app.post('/api/admin/ip-bans', requireAdmin, async (req, res) => {
    if (!ready(res)) return;
    if (!validIp(req.body?.ip) || !normalizePublicIp(req.body.ip)) return bad(res, 'INVALID_IP');
    try {
      const values = readSchedule(req.body);
      const ban = await controls.banIp(req.body.ip, values);
      await record('ip_ban', { ip: req.body.ip, reason: values.reason, detail: ban });
      if (values.startAt <= Date.now()) disconnectIp(req.body.ip, ban);
      success(res, { ban });
    } catch (error) { serverError(res, error); }
  });
  app.post('/api/admin/ip-bans/unban', requireAdmin, async (req, res) => {
    if (!ready(res)) return;
    if (!validIp(req.body?.ip)) return bad(res, 'INVALID_IP');
    try {
      await controls.unbanIp(req.body.ip);
      await record('ip_unban', { ip: req.body.ip });
      success(res);
    } catch (error) { serverError(res, error); }
  });
  app.post('/api/admin/players/:id/coins', requireAdmin, async (req, res) => {
    if (!ready(res)) return;
    const player = user(req, res); if (!player) return;
    const amount = req.body?.amount;
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000 || !validReason(req.body?.reason)) return bad(res, 'INVALID_COINS');
    try {
      const { data, error } = await db.rpc('codumi_admin_adjust_coins', { p_user_id: player.id, p_delta: amount });
      if (error) throw error;
      await record('coins_adjusted', { userId: player.id, amount, reason: req.body.reason.trim(), detail: { balance: Number(data) } });
      emitToUser(player.id, 'wallet:updated', { coins: Number(data) });
      success(res, { coins: Number(data) });
    } catch (error) { serverError(res, error); }
  });
  app.delete('/api/admin/players/:id', requireAdmin, async (req, res) => {
    if (!ready(res)) return;
    const player = user(req, res); if (!player) return;
    // Explicit retyping of the user's login is required. No active match or
    // connected socket may be destroyed mid-settlement.
    if (req.body?.confirmation !== player.username) return bad(res, 'DELETE_CONFIRMATION_MISMATCH');
    if (userSockets.get(player.id)?.size) return bad(res, 'PLAYER_MUST_BE_OFFLINE', 409);
    const reason = req.body?.reason;
    if (!validReason(reason)) return bad(res, 'REASON_REQUIRED');
    try {
      // Collect direct-message attachment paths for best-effort Storage cleanup.
      // Database deletion itself remains atomic inside the RPC below.
      const attachments = [];
      for (let offset = 0; ; offset += 500) {
        const media = await db.from('direct_messages').select('media_path')
          .or(`from_user_id.eq.${player.id},to_user_id.eq.${player.id}`)
          .not('media_path', 'is', null).range(offset, offset + 499);
        if (media.error) throw media.error;
        attachments.push(...(media.data || []).map(row => row.media_path).filter(Boolean));
        if (!media.data || media.data.length < 500) break;
      }
      const { data, error } = await db.rpc('codumi_admin_delete_account', { p_user_id: player.id });
      if (error) throw error;
      if (data !== true) return bad(res, 'PLAYER_NOT_FOUND', 404);
      authStore.forgetDeletedUser(player.id);
      controls.forgetAccount(player.id);
      purgeEphemeralUser(player.id);
      const paths = attachments;
      for (let i = 0; i < paths.length; i += 100) {
        try {
          const deletion = await db.storage.from('direct-chat-media').remove(paths.slice(i, i + 100));
          if (deletion.error) console.error('[admin-delete] Media cleanup:', deletion.error.message);
        } catch (error) { console.error('[admin-delete] Media cleanup:', error?.message); }
      }
      await record('account_deleted', { userId: player.id, reason: reason.trim(), detail: { login: player.username } });
      success(res);
    } catch (error) { serverError(res, error); }
  });
}
