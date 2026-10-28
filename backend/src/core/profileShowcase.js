import { getAchievementProfile } from './achievements.js';

// Titles are cosmetic only. Each one is unlocked by a genuine server-side badge.
// No title or badge selection ever gives XP, CODI or an additional achievement.
export const PROFILE_TITLES = [
  { id: 'none', badgeId: null },
  { id: 'newcomer', badgeId: 'hello-codumi' },
  { id: 'first-victory', badgeId: 'first-match' },
  { id: 'rising-star', badgeId: 'five-matches' },
  { id: 'veteran', badgeId: 'thirty-matches' },
  { id: 'arena-legend', badgeId: 'hundred-matches' },
  { id: 'explorer', badgeId: 'three-games' },
  { id: 'collector', badgeId: 'seven-games' },
  { id: 'friend-of-all', badgeId: 'ten-friends' },
];

const cleanSelection = (row, unlocked) => ({
  titleId: PROFILE_TITLES.some((title) => title.id === row?.title_id && (!title.badgeId || unlocked.has(title.badgeId)))
    ? row.title_id : 'none',
  badgeIds: (Array.isArray(row?.badge_ids) ? row.badge_ids : [])
    .filter((id, index, ids) => typeof id === 'string' && unlocked.has(id) && ids.indexOf(id) === index)
    .slice(0, 3),
});

export async function readProfileShowcase(authStore, user) {
  const profile = await getAchievementProfile(authStore, user);
  const unlockedBadges = profile.badges.filter((badge) => badge.unlocked);
  const unlocked = new Set(unlockedBadges.map((badge) => badge.id));
  const { data, error } = await authStore.supabase.from('codumi_profile_showcase')
    .select('title_id,badge_ids').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return {
    ...cleanSelection(data, unlocked),
    titles: PROFILE_TITLES.map(({ id, badgeId }) => ({ id, unlocked: !badgeId || unlocked.has(badgeId) })),
    badges: unlockedBadges.map(({ id, title, icon, description }) => ({ id, title, icon, description })),
  };
}

export async function saveProfileShowcase(authStore, user, selection) {
  const { titleId, badgeIds } = selection || {};
  if (typeof titleId !== 'string' || !Array.isArray(badgeIds)
    || badgeIds.length > 3 || badgeIds.some((id) => typeof id !== 'string')
    || new Set(badgeIds).size !== badgeIds.length) {
    const error = new Error('INVALID_SHOWCASE');
    error.status = 400;
    throw error;
  }
  const title = PROFILE_TITLES.find((item) => item.id === titleId);
  const profile = await getAchievementProfile(authStore, user);
  const unlocked = new Set(profile.badges.filter((badge) => badge.unlocked).map((badge) => badge.id));
  if (!title || (title.badgeId && !unlocked.has(title.badgeId)) || badgeIds.some((id) => !unlocked.has(id))) {
    const error = new Error('SHOWCASE_NOT_UNLOCKED');
    error.status = 400;
    throw error;
  }
  const { error } = await authStore.supabase.from('codumi_profile_showcase').upsert({
    user_id: user.id,
    title_id: titleId,
    badge_ids: badgeIds,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return {
    titleId,
    badgeIds,
    titles: PROFILE_TITLES.map(({ id, badgeId }) => ({ id, unlocked: !badgeId || unlocked.has(badgeId) })),
    badges: profile.badges.filter((badge) => badge.unlocked).map(({ id, title, icon, description }) => ({ id, title, icon, description })),
  };
}
