// Cumulative XP, increasingly expensive levels (level 1 begins at 0 XP).
export function levelStartXp(level) {
  const l = Math.max(1, Math.floor(Number(level) || 1));
  return 25 * (l - 1) * (l + 2);
}

export function progressFromXp(xpValue) {
  const xp = Math.max(0, Math.floor(Number(xpValue) || 0));
  let level = 1;
  while (level < 1000 && levelStartXp(level + 1) <= xp) level += 1;
  const start = levelStartXp(level);
  const end = levelStartXp(level + 1);
  return { xp, level, currentXp: xp - start, requiredXp: end - start, nextLevelXp: end };
}

export async function getProgressRecord(db, userId) {
  const { data, error } = await db.from('codumi_player_progress')
    .select('xp,matches_finished,wins,max_friends,game_ids').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || { xp: 0, matches_finished: 0, wins: 0, max_friends: 0, game_ids: [] };
}
