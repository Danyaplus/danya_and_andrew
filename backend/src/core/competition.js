import { progressFromXp } from './progression.js';

export const DAILY = [
  { id: 'daily-1', title: 'Разогрев', description: 'Заверши 1 матч', metric: 'matches', target: 1, xp: 60 },
  { id: 'daily-3', title: 'В игре', description: 'Заверши 3 матча', metric: 'matches', target: 3, xp: 100 },
  { id: 'daily-wins', title: 'Победный день', description: 'Победи в 2 матчах', metric: 'wins', target: 2, xp: 150 },
];
export const WEEKLY = [
  { id: 'weekly-10', title: 'Марафон', description: 'Заверши 10 матчей', metric: 'matches', target: 10, xp: 300 },
  { id: 'weekly-wins', title: 'Победитель недели', description: 'Одержи 5 побед', metric: 'wins', target: 5, xp: 500 },
  { id: 'weekly-games', title: 'Исследователь недели', description: 'Сыграй в 5 разных игр', metric: 'games', target: 5, xp: 400 },
];

const kyivParts = (timestamp) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(timestamp);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};
export function kyivPeriodKeys(now = new Date()) {
  const parts = kyivParts(now);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  // Week key is ISO week; UTC arithmetic avoids DST ambiguities.
  const day = new Date(`${date}T00:00:00Z`);
  const isoWeekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - isoWeekday + 3);
  const isoYear = day.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round((day - firstThursday) / (7 * 86400000));
  return { daily: date, weekly: `${isoYear}-${String(week).padStart(2, '0')}` };
}
export function questPayload(rows, claims, now = new Date()) {
  const keys = kyivPeriodKeys(now);
  const results = { daily: { matches: 0, wins: 0, games: new Set() }, weekly: { matches: 0, wins: 0, games: new Set() } };
  for (const row of rows || []) {
    const key = kyivPeriodKeys(new Date(row.created_at));
    for (const type of ['daily','weekly']) {
      if (key[type] !== keys[type]) continue;
      results[type].matches += 1;
      if (row.outcome === 'win') results[type].wins += 1;
      results[type].games.add(row.game_id);
    }
  }
  const claimed = new Set((claims || []).filter((c) => keys[c.period_type] === c.period_key).map((c) => c.quest_id));
  function map(definitions, type) {
    return definitions.map((q) => ({ ...q, progress: Math.min(q.target, q.metric === 'games' ? results[type].games.size : results[type][q.metric]),
      completed: claimed.has(q.id) }));
  }
  return { periodKeys: keys, daily: map(DAILY,'daily'), weekly: map(WEEKLY,'weekly') };
}
export async function getQuests(db,userId) {
  const [{ data: matches,error: matchError },{ data: claims,error: claimError }] = await Promise.all([
    db.from('codumi_match_results').select('game_id,outcome,created_at').eq('user_id',userId)
      .gte('created_at',new Date(Date.now()-9*86400000).toISOString()).order('created_at',{ ascending:false }).limit(1000),
    db.from('codumi_quest_claims').select('quest_id,period_type,period_key').eq('user_id',userId)
      .gte('claimed_at',new Date(Date.now()-9*86400000).toISOString()).limit(100),
  ]);
  if (matchError || claimError) throw matchError || claimError;
  return questPayload(matches,claims);
}
export async function publicCompetitionProfile(authStore,userId) {
  const user = authStore.getPublicUser(userId);
  if (!user) return null;
  const db = authStore.supabase;
  const { data,error } = await db.from('codumi_player_progress')
    .select('xp,matches_finished,wins,losses,draws,max_friends,game_ids').eq('user_id',userId).maybeSingle();
  if (error) throw error;
  // Unlocked achievements use the same read-only catalog as the private profile.
  const { achievementCatalog } = await import('./achievements.js');
  const badgeProfile = achievementCatalog({ createdAt:user.createdAt,matchesFinished:data?.matches_finished||0,
    maxFriends:data?.max_friends||0,gameIds:data?.game_ids||[] });
  return { user, level:progressFromXp(data?.xp||0), wins:data?.wins||0,losses:data?.losses||0,draws:data?.draws||0,
    matchesFinished:data?.matches_finished||0, awards:badgeProfile.unlockedCount, trophies:badgeProfile.trophies.length,
    unlockedBadges:badgeProfile.badges.filter((b)=>b.unlocked).map(({id,title,icon})=>({id,title,icon})) };
}
