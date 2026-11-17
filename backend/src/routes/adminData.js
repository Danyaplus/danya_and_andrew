// Read-only administrator insights. Every route is protected by the same
// server-side bearer session used for the administrator login.
import { requireAdmin } from './adminAuth.js';
import { getCosmeticsProfile, COSMETICS } from '../core/cosmetics.js';
import { readProfileShowcase } from '../core/profileShowcase.js';
import { progressFromXp } from '../core/progression.js';
import { getAchievementProfile } from '../core/achievements.js';

const MAX_LIMIT = 100;
const HISTORY_LIMIT = 3000;
const DB_PAGE_SIZE = 500;

// PostgREST projects may cap one response to 1000 rows. Explicitly page so
// the "last N" label is accurate and high-activity accounts are not truncated.
async function recentRows(db, table, columns, { userId = null, limit, newestFirst = false }) {
  const collected = [];
  for (let offset = 0; offset < limit; offset += DB_PAGE_SIZE) {
    let query = db.from(table).select(columns);
    if (userId) query = query.eq('user_id', userId);
    if (newestFirst) query = query.order('created_at', { ascending: false });
    const size = Math.min(DB_PAGE_SIZE, limit - offset);
    const response = await query.range(offset, offset + size - 1);
    if (response.error) throw response.error;
    const items = response.data || [];
    collected.push(...items);
    if (items.length < size) break;
  }
  return collected;
}

function safeNumber(value) { return Math.max(0, Number(value) || 0); }
function visibleUser(user, isOnline) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatar: user.avatar || null,
    createdAt: user.createdAt || null,
    lastSeenAt: user.lastSeenAt || null,
    online: Boolean(isOnline),
  };
}
function errorResponse(res, error) {
  console.error('[admin-data]', error?.code || error?.message || error);
  return res.status(503).json({ ok: false, error: 'ADMIN_DATA_UNAVAILABLE' });
}

export function registerAdminDataRoutes(app, { authStore, userSockets, gameRegistry, controls }) {
  const db = authStore.supabase;
  const online = (id) => Boolean(userSockets.get(id)?.size);

  app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    try {
      const totalUsers = authStore.data.users.length;
      const now = Date.now();
      const onlineUsers = authStore.data.users.reduce((sum, user) => sum + Number(online(user.id)), 0);
      const newUsers7d = authStore.data.users.filter(user => user.createdAt && user.createdAt >= now - 7 * 86400000).length;
      const [countResult, rows] = await Promise.all([
        db.from('codumi_match_results').select('game_id', { count: 'exact', head: true }),
        recentRows(db, 'codumi_match_results', 'game_id,created_at', { limit: HISTORY_LIMIT, newestFirst: true }),
      ]);
      if (countResult.error) throw countResult.error;
      const counts = new Map();
      for (const row of rows) if (row.game_id) counts.set(row.game_id, (counts.get(row.game_id) || 0) + 1);
      const topGames = [...counts.entries()].map(([id, resultRecords]) => ({
        id, name: gameRegistry.get(id)?.title || id, resultRecords,
      })).sort((a, b) => b.resultRecords - a.resultRecords);
      const dailyRecords = Array.from({ length: 7 }, (_, n) => {
        const date = new Date(now - (6 - n) * 86400000).toISOString().slice(0, 10);
        const count = rows.filter(row => String(row.created_at || '').slice(0, 10) === date).length;
        return { date, resultRecords: count };
      });
      res.json({ ok: true, totalUsers, onlineUsers, newUsers7d,
        totalResultRecords: countResult.count ?? 0, gameCount: gameRegistry.size,
        sampledResultRecords: rows.length, sampleLimit: HISTORY_LIMIT,
        topGames, dailyRecords, updatedAt: now,
      });
    } catch (error) { errorResponse(res, error); }
  });

  app.get('/api/admin/players', requireAdmin, async (req, res) => {
    try {
      const offset = Math.max(0, Math.min(1_000_000, Math.floor(Number(req.query.offset) || 0)));
      const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(req.query.limit) || 100)));
      const search = String(req.query.q || '').trim().toLocaleLowerCase().slice(0, 80);
      const users = authStore.data.users.filter(user => !search ||
        [user.id, user.username, user.displayName].some(value => String(value || '').toLocaleLowerCase().includes(search)));
      const page = users.slice(offset, offset + limit);
      const ids = page.map(user => user.id);
      let walletById = new Map();
      let progressById = new Map();
      if (ids.length) {
        const [walletResult, progressResult] = await Promise.all([
          db.from('codumi_coin_wallets').select('user_id,coins').in('user_id', ids),
          db.from('codumi_player_progress').select('user_id,xp,matches_finished').in('user_id', ids),
        ]);
        if (walletResult.error || progressResult.error) throw walletResult.error || progressResult.error;
        walletById = new Map((walletResult.data || []).map(row => [row.user_id, row]));
        progressById = new Map((progressResult.data || []).map(row => [row.user_id, row]));
      }
      res.json({ ok: true, offset, limit, total: users.length, players: page.map(user => {
        const progress = progressById.get(user.id);
        const xp = safeNumber(progress?.xp);
        return { ...visibleUser(user, online(user.id)), coins: safeNumber(walletById.get(user.id)?.coins),
          xp, level: progressFromXp(xp).level, matchesFinished: safeNumber(progress?.matches_finished),
          ban: controls.checkAccount(user.id) };
      }) });
    } catch (error) { errorResponse(res, error); }
  });

  app.get('/api/admin/players/:id', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id || '').slice(0, 80);
      const user = authStore.getUserRecord(id);
      if (!user) return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
      const [wallet, progressResult, matchRows, achievements, showcase, knownIps] = await Promise.all([
        getCosmeticsProfile(db, id),
        db.from('codumi_player_progress').select('xp,matches_finished,wins,losses,draws').eq('user_id', id).maybeSingle(),
        recentRows(db, 'codumi_match_results', 'game_id,outcome', { userId: id, limit: 5000 }),
        getAchievementProfile(authStore, user),
        readProfileShowcase(authStore, user),
        controls.getIps(id),
      ]);
      if (progressResult.error) throw progressResult.error;
      const row = progressResult.data || {};
      const gameCount = new Map();
      for (const match of matchRows) {
        if (!match.game_id) continue;
        gameCount.set(match.game_id, (gameCount.get(match.game_id) || 0) + 1);
      }
      const playedGames = [...gameCount.entries()].map(([gameId, count]) => ({
        id: gameId, name: gameRegistry.get(gameId)?.title || gameId, recordedResults: count,
      })).sort((a, b) => b.recordedResults - a.recordedResults);
      const catalog = new Map(COSMETICS.map(item => [item.id, item]));
      const ownedItems = wallet.owned.map(itemId => {
        const item = catalog.get(itemId);
        return { id: itemId, name: item?.name || itemId, kind: item?.kind || 'other', icon: item?.icon || '' };
      });
      res.json({ ok: true, player: {
        ...visibleUser(user, online(id)),
        coins: wallet.coins,
        level: progressFromXp(row.xp),
        matchesFinished: safeNumber(row.matches_finished),
        wins: safeNumber(row.wins), losses: safeNumber(row.losses), draws: safeNumber(row.draws),
        playedGames, historyLimited: matchRows.length >= 5000,
        ownedItems, equipped: wallet.equipped,
        earnedBadges: achievements.badges.filter(item => item.unlocked).map(item => ({ id: item.id, title: item.title, claimed: item.claimed, icon: item.icon })),
        purchasedTitles: showcase.titles.filter(item => item.owned && item.price > 0).map(item => ({ id: item.id, name: item.id })),
        selectedTitle: showcase.titleId,
        // Total hours are not collected; known public IPs are collected after migration.
        hoursPlayed: null, knownIps, ban: controls.checkAccount(id),
      } });
    } catch (error) { errorResponse(res, error); }
  });
}
