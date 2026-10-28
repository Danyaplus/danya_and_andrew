import { getAchievementProfile } from './achievements.js';

// Cosmetic titles only; the achievement metrics and badge claim flags are verified in Supabase.
export const PROFILE_TITLES = [
  { id: 'none', badgeId: null, condition: 'none', price: 0 },
  { id: 'newcomer', badgeId: 'hello-codumi', condition: 'register', price: 0 },
  { id: 'first-victory', badgeId: 'first-match', condition: 'wins-1', price: 0 },
  { id: 'rising-star', badgeId: 'five-matches', condition: 'wins-5', price: 0 },
  { id: 'veteran', badgeId: 'thirty-matches', condition: 'wins-30', price: 0 },
  { id: 'arena-legend', badgeId: 'hundred-matches', condition: 'wins-100', price: 0 },
  { id: 'explorer', badgeId: 'three-games', condition: 'games-3', price: 0 },
  { id: 'collector', badgeId: 'seven-games', condition: 'games-7', price: 0 },
  { id: 'friend-of-all', badgeId: 'ten-friends', condition: 'friends-10', price: 0 },
  { id: 'royal-strategist', badgeId: null, condition: 'shop', price: 180 },
  { id: 'neon-champion', badgeId: null, condition: 'shop', price: 320 },
  { id: 'night-owl', badgeId: null, condition: 'shop', price: 480 },
  { id: 'golden-player', badgeId: null, condition: 'shop', price: 700 },
];

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function ownedTitleIds(rows) {
  return new Set((rows || []).map((row) => row.title_id));
}

function availableTitle(title, unlocked, owned) {
  return title.id === 'none'
    || (title.price > 0 ? owned.has(title.id) : unlocked.has(title.badgeId));
}

// A medal enters the showcase inventory only AFTER the user claims its XP reward.
function collectionFrom(profile) {
  const unlocked = new Set(profile.badges.filter((badge) => badge.unlocked).map((badge) => badge.id));
  const collected = profile.badges.filter((badge) => badge.unlocked && badge.claimed);
  const claimed = new Set(collected.map((badge) => badge.id));
  return { unlocked, claimed, collected };
}

async function loadRows(db, userId) {
  const [selection, bought] = await Promise.all([
    db.from('codumi_profile_showcase').select('title_id,badge_ids').eq('user_id', userId).maybeSingle(),
    db.from('codumi_owned_titles').select('title_id').eq('user_id', userId),
  ]);
  if (selection.error) throw selection.error;
  if (bought.error) throw bought.error;
  return { selection: selection.data, owned: ownedTitleIds(bought.data) };
}

function responseFor(profile, row, owned) {
  const { unlocked, claimed, collected } = collectionFrom(profile);
  const titles = PROFILE_TITLES.map(({ id, badgeId, price, condition }) => ({
    id, price, condition, owned: price > 0 ? owned.has(id) : availableTitle({ id, badgeId, price }, unlocked, owned),
    unlocked: availableTitle({ id, badgeId, price }, unlocked, owned),
  }));
  const validIds = [...new Set(Array.isArray(row?.badge_ids) ? row.badge_ids : [])]
    .filter((id) => typeof id === 'string' && claimed.has(id)).slice(0, 3);
  const selectedTitle = titles.find((title) => title.id === (row ? row.title_id : 'newcomer') && title.unlocked);
  return {
    titleId: selectedTitle?.id || 'none',
    badgeIds: validIds,
    titles,
    badges: collected.map(({ id, title, icon, description }) => ({ id, title, icon, description })),
    // Shown only as a hint in the collection; these must be claimed in Awards first.
    pendingBadges: profile.badges.filter((badge) => badge.unlocked && !badge.claimed)
      .map(({ id, title, icon, description }) => ({ id, title, icon, description })),
  };
}

export async function readProfileShowcase(authStore, user) {
  const [profile, rows] = await Promise.all([
    getAchievementProfile(authStore, user),
    loadRows(authStore.supabase, user.id),
  ]);
  return responseFor(profile, rows.selection, rows.owned);
}

export async function saveProfileShowcase(authStore, user, selection) {
  const { titleId, badgeIds } = selection || {};
  if (typeof titleId !== 'string' || !Array.isArray(badgeIds)
    || badgeIds.length > 3 || badgeIds.some((id) => typeof id !== 'string')
    || new Set(badgeIds).size !== badgeIds.length) throw validationError('INVALID_SHOWCASE');

  const [profile, rows] = await Promise.all([
    getAchievementProfile(authStore, user),
    loadRows(authStore.supabase, user.id),
  ]);
  const current = responseFor(profile, rows.selection, rows.owned);
  if (!current.titles.some((title) => title.id === titleId && title.unlocked)
    || badgeIds.some((id) => !current.badges.some((badge) => badge.id === id))) {
    throw validationError('SHOWCASE_NOT_UNLOCKED');
  }

  const { error } = await authStore.supabase.from('codumi_profile_showcase').upsert({
    user_id: user.id,
    title_id: titleId,
    badge_ids: badgeIds,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return { ...current, titleId, badgeIds };
}

export async function purchaseProfileTitle(authStore, user, titleId) {
  const title = PROFILE_TITLES.find((entry) => entry.id === titleId && entry.price > 0);
  if (!title) throw validationError('ITEM_UNKNOWN');
  // One atomic database transaction validates the server-controlled price, checks the wallet,
  // locks it, debits once, and grants ownership; two simultaneous requests cannot double-spend.
  const result = await authStore.supabase.rpc('codumi_purchase_profile_title', {
    p_user_id: user.id, p_title_id: title.id,
  });
  if (result.error) {
    const match = String(result.error.message || '').match(/INSUFFICIENT_COINS|TITLE_ALREADY_OWNED|ITEM_UNKNOWN/);
    if (match) {
      const error = new Error(match[0]);
      error.status = 409;
      throw error;
    }
    throw result.error;
  }
  return { coins: Number(result.data) || 0, titleId: title.id };
}
