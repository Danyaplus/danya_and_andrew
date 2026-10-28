import { getAchievementProfile } from './achievements.js';
import paidTitles from '../../../shared/paidTitles.json' with { type: 'json' };

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
  ...paidTitles.map(({ id, price }) => ({ id, badgeId: null, condition: 'shop', price })),
];

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function ownedTitleIds(rows) {
  return new Set((rows || []).map((row) => row.title_id));
}

function availableTitle(title, claimed, owned) {
  return title.id === 'none'
    || (title.price > 0 ? owned.has(title.id) : claimed.has(title.badgeId));
}

// A medal enters the showcase inventory only AFTER the user claims its XP reward.
function collectionFrom(profile) {
  const collected = profile.badges.filter((badge) => badge.unlocked && badge.claimed);
  const claimed = new Set(collected.map((badge) => badge.id));
  return { claimed, collected };
}

async function loadRows(db, userId) {
  const [selection, bought] = await Promise.all([
    db.from('codumi_profile_showcase').select('title_id,badge_ids,title_colors').eq('user_id', userId).maybeSingle(),
    db.from('codumi_owned_titles').select('title_id').eq('user_id', userId),
  ]);
  // Older installations may not yet have the additive showcase SQL. Never hide
  // earned badges just because the *selection* or *title shop* table is missing.
  const missing = (error) => ['42P01', '42703', 'PGRST205'].includes(error?.code);
  if (selection.error && !missing(selection.error)) throw selection.error;
  if (bought.error && !missing(bought.error)) throw bought.error;
  return { selection: selection.error ? null : selection.data, owned: ownedTitleIds(bought.error ? [] : bought.data) };
}

function responseFor(profile, row, owned) {
  const { claimed, collected } = collectionFrom(profile);
  const titles = PROFILE_TITLES.map(({ id, badgeId, price, condition }) => ({
    id, price, condition, owned: price > 0 ? owned.has(id) : availableTitle({ id, badgeId, price }, claimed, owned),
    unlocked: availableTitle({ id, badgeId, price }, claimed, owned),
  }));
  const validIds = [...new Set(Array.isArray(row?.badge_ids) ? row.badge_ids : [])]
    .filter((id) => typeof id === 'string' && claimed.has(id)).slice(0, 3);
  const selectedTitle = titles.find((title) => title.id === (row?.title_id || 'none') && title.unlocked);
  const titleColors = {};
  const savedColors = row?.title_colors && typeof row.title_colors === 'object' && !Array.isArray(row.title_colors) ? row.title_colors : {};
  for (const title of titles) {
    if (title.unlocked && /^#[0-9A-F]{6}$/i.test(savedColors[title.id] || '')) titleColors[title.id] = savedColors[title.id].toUpperCase();
  }
  return {
    titleId: selectedTitle?.id || 'none',
    badgeIds: validIds,
    titleColors,
    titles,
    badges: collected.map(({ id, title, icon, description }) => ({ id, title, icon, description })),
    // Shown only as a hint in the collection; these must be claimed in Awards first.
    lockedBadges: profile.badges.filter((badge) => !badge.unlocked)
      .map(({ id, title, icon, description, progress, target }) => ({ id, title, icon, description, progress, target })),
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
  const { titleId, badgeIds, titleColors = {} } = selection || {};
  if (typeof titleId !== 'string' || !Array.isArray(badgeIds)
    || badgeIds.length > 3 || badgeIds.some((id) => typeof id !== 'string')
    || new Set(badgeIds).size !== badgeIds.length
    || !titleColors || typeof titleColors !== 'object' || Array.isArray(titleColors)
    || Object.keys(titleColors).length > PROFILE_TITLES.length
    || Object.entries(titleColors).some(([id, color]) => !PROFILE_TITLES.some((title) => title.id === id)
      || !/^#[0-9a-f]{6}$/i.test(color))) throw validationError('INVALID_SHOWCASE');

  const [profile, rows] = await Promise.all([
    getAchievementProfile(authStore, user),
    loadRows(authStore.supabase, user.id),
  ]);
  const current = responseFor(profile, rows.selection, rows.owned);
  if (!current.titles.some((title) => title.id === titleId && title.unlocked)
    || badgeIds.some((id) => !current.badges.some((badge) => badge.id === id))
    || Object.keys(titleColors).some((id) => !current.titles.some((title) => title.id === id && title.unlocked))) {
    throw validationError('SHOWCASE_NOT_UNLOCKED');
  }

  const { error } = await authStore.supabase.from('codumi_profile_showcase').upsert({
    user_id: user.id,
    title_id: titleId,
    badge_ids: badgeIds,
    title_colors: Object.fromEntries(Object.entries(titleColors).map(([id, color]) => [id, color.toUpperCase()])),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return { ...current, titleId, badgeIds, titleColors: Object.fromEntries(Object.entries(titleColors).map(([id, color]) => [id, color.toUpperCase()])) };
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
