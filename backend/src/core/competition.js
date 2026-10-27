import { createHash } from 'node:crypto';
import { progressFromXp } from './progression.js';
import { getCosmeticsProfile } from './cosmetics.js';

// Ten candidates per period; exactly three are selected from each catalog.
// IDs, targets and XP must match supabase/codumi-quest-rotation-stats.sql.
export const DAILY = [
  { id: 'd-play-1', title: 'Первый шаг', description: 'Выиграй 1 матч сегодня', metric: 'matches', target: 1, xp: 50 },
  { id: 'd-play-2', title: 'Две партии', description: 'Выиграй 2 матча сегодня', metric: 'matches', target: 2, xp: 80 },
  { id: 'd-play-3', title: 'Игровой ритм', description: 'Выиграй 3 матча сегодня', metric: 'matches', target: 3, xp: 110 },
  { id: 'd-play-4', title: 'Четыре встречи', description: 'Выиграй 4 матча сегодня', metric: 'matches', target: 4, xp: 140 },
  { id: 'd-play-5', title: 'Марафончик', description: 'Выиграй 5 матчей сегодня', metric: 'matches', target: 5, xp: 170 },
  { id: 'd-win-1', title: 'Первый триумф', description: 'Выиграй 1 матч сегодня', metric: 'wins', target: 1, xp: 100 },
  { id: 'd-win-2', title: 'Двойная победа', description: 'Выиграй 2 матча сегодня', metric: 'wins', target: 2, xp: 170 },
  { id: 'd-win-3', title: 'Серия побед', description: 'Выиграй 3 матча сегодня', metric: 'wins', target: 3, xp: 230 },
  { id: 'd-games-2', title: 'Попробуй другое', description: 'Победи в 2 разных играх сегодня', metric: 'games', target: 2, xp: 110 },
  { id: 'd-games-3', title: 'Тройной выбор', description: 'Победи в 3 разных играх сегодня', metric: 'games', target: 3, xp: 165 },
];
export const WEEKLY = [
  { id: 'w-play-10', title: 'Первые десять', description: 'Выиграй 10 матчей за неделю', metric: 'matches', target: 10, xp: 300 },
  { id: 'w-play-15', title: 'Пятнадцать матчей', description: 'Выиграй 15 матчей за неделю', metric: 'matches', target: 15, xp: 430 },
  { id: 'w-play-20', title: 'Настойчивый игрок', description: 'Выиграй 20 матчей за неделю', metric: 'matches', target: 20, xp: 580 },
  { id: 'w-play-30', title: 'Большая неделя', description: 'Выиграй 30 матчей за неделю', metric: 'matches', target: 30, xp: 820 },
  { id: 'w-play-40', title: 'Почти легенда', description: 'Выиграй 40 матчей за неделю', metric: 'matches', target: 40, xp: 1050 },
  { id: 'w-play-50', title: 'Легенда марафона', description: 'Выиграй 50 матчей за неделю', metric: 'matches', target: 50, xp: 1350 },
  { id: 'w-win-5', title: 'Пять триумфов', description: 'Выиграй 5 матчей за неделю', metric: 'wins', target: 5, xp: 450 },
  { id: 'w-win-10', title: 'Десять побед', description: 'Выиграй 10 матчей за неделю', metric: 'wins', target: 10, xp: 850 },
  { id: 'w-win-20', title: 'Чемпион недели', description: 'Выиграй 20 матчей за неделю', metric: 'wins', target: 20, xp: 1600 },
  { id: 'w-games-5', title: 'Исследователь арены', description: 'Победи в 5 разных играх за неделю', metric: 'games', target: 5, xp: 600 },
];

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
});
export function kyivPeriodKeys(now = new Date()) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const day = new Date(`${date}T00:00:00Z`);
  const isoWeekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - isoWeekday + 3);
  const isoYear = day.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round((day - firstThursday) / (7 * 86400000));
  return { daily: date, weekly: `${isoYear}-${String(week).padStart(2, '0')}` };
}

export function selectedQuests(definitions, userId, periodKey) {
  const digest = (id) => createHash('md5').update(`${userId}:${periodKey}:${id}`).digest('hex');
  return definitions.map((q) => ({ q, order: digest(q.id) }))
    .sort((a, b) => a.order < b.order ? -1 : a.order > b.order ? 1 : a.q.id.localeCompare(b.q.id))
    .slice(0, 3).map(({ q }) => q);
}

export function questPayload(rows, claims, userId, now = new Date()) {
  const keys = kyivPeriodKeys(now);
  const counts = { daily: { matches: 0, wins: 0, games: new Set() }, weekly: { matches: 0, wins: 0, games: new Set() } };
  for (const row of rows || []) {
    // Only verified wins advance match/game quests; draws still grant match XP.
    if (row.outcome !== 'win') continue;
    const rowKeys = kyivPeriodKeys(new Date(row.created_at));
    for (const type of ['daily', 'weekly']) {
      if (rowKeys[type] !== keys[type]) continue;
      counts[type].matches++;
      if (row.outcome === 'win') counts[type].wins++;
      counts[type].games.add(row.game_id);
    }
  }
  const claimed = new Set((claims || []).map((c) => `${c.period_type}:${c.period_key}:${c.quest_id}`));
  const map = (definitions, type) => selectedQuests(definitions, userId, keys[type]).map((q) => {
    const value = q.metric === 'games' ? counts[type].games.size : counts[type][q.metric];
    const progress = Math.min(q.target, value);
    const isClaimed = claimed.has(`${type}:${keys[type]}:${q.id}`);
    return { ...q, progress, claimed: isClaimed, completed: progress >= q.target,
      canClaim: progress >= q.target && !isClaimed, periodKey: keys[type] };
  });
  return { periodKeys: keys, daily: map(DAILY, 'daily'), weekly: map(WEEKLY, 'weekly') };
}

export async function getQuests(db, userId) {
  const [{ data: matches, error: matchError }, { data: claims, error: claimError }] = await Promise.all([
    db.from('codumi_match_results').select('game_id,outcome,created_at').eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 9 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(5000),
    db.from('codumi_quest_claims').select('quest_id,period_type,period_key').eq('user_id', userId)
      .gte('claimed_at', new Date(Date.now() - 9 * 86400000).toISOString()).limit(500),
  ]);
  if (matchError || claimError) throw matchError || claimError;
  return questPayload(matches, claims, userId);
}

export async function getMatchStatistics(authStore, userId) {
  const db = authStore.supabase;
  const [{ data: progress, error: progressError }, { data: history, error: historyError }] = await Promise.all([
    db.from('codumi_player_progress').select('matches_finished,wins,losses,draws,xp').eq('user_id', userId).maybeSingle(),
    db.rpc('codumi_get_match_statistics', { p_user_id: userId }),
  ]);
  if (progressError || historyError) throw progressError || historyError;
  const wins = Number(progress?.wins || 0);
  const losses = Number(progress?.losses || 0);
  const draws = Number(progress?.draws || 0);
  const decided = wins + losses + draws;
  const toRecent = (item) => ({
    gameId: item.gameId,
    outcome: item.outcome,
    playedAt: item.playedAt,
    opponent: item.opponentId ? (authStore.getPublicUser(item.opponentId)?.username || 'Игрок') : 'Соперник',
  });
  return {
    total: Number(progress?.matches_finished || 0), wins, losses, draws,
    undetermined: Math.max(0, Number(progress?.matches_finished || 0) - decided),
    winRate: decided ? Math.round(wins / decided * 100) : 0,
    favoriteGameId: history?.favoriteGameId || null,
    favoriteGameCount: Number(history?.favoriteGameCount || 0),
    differentGames: Number(history?.differentGames || 0),
    recent: (history?.recent || []).map(toRecent),
  };
}

export async function publicCompetitionProfile(authStore, userId) {
  const user = authStore.getPublicUser(userId);
  if (!user) return null;
  const db = authStore.supabase;
  const { data, error } = await db.from('codumi_player_progress')
    .select('xp,matches_finished,wins,losses,draws,max_friends,game_ids').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const { achievementCatalog, getWonGameIds } = await import('./achievements.js');
  const wonGameIds = await getWonGameIds(db, userId);
  const badgeProfile = achievementCatalog({ createdAt: user.createdAt, matchesFinished: data?.wins || 0,
    maxFriends: data?.max_friends || 0, gameIds: wonGameIds });
  const look = await getCosmeticsProfile(db,userId);
  return { user: { ...user, avatarFrame: look.equipped.frameId, backgroundId: look.equipped.backgroundId, emblemId: look.equipped.emblemId }, level: progressFromXp(data?.xp || 0), wins: data?.wins || 0, losses: data?.losses || 0, draws: data?.draws || 0,
    matchesFinished: data?.matches_finished || 0, awards: badgeProfile.unlockedCount, trophies: badgeProfile.trophies.length,
    unlockedBadges: badgeProfile.badges.filter((b) => b.unlocked).map(({ id, title, icon }) => ({ id, title, icon })) };
}
