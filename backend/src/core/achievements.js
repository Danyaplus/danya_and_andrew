import { progressFromXp, getProgressRecord } from './progression.js';

// Account-bound achievements. All progress is calculated server-side.
// Game completion is recorded by the matchmaker; browsers cannot award badges.
const CATALOG = [
  { id: 'hello-codumi', titleRewardId: 'newcomer', xpReward: 75, title: 'Добро пожаловать', description: 'Создай аккаунт Codumi Games.', icon: 'star', metric: 'account', target: 1, group: 'Профиль' },
  { id: 'first-match', titleRewardId: 'first-victory', xpReward: 100, title: 'Первый матч', description: 'Выиграй свой первый онлайн-матч.', icon: 'flag', metric: 'matches', target: 1, group: 'Матчи' },
  { id: 'five-matches', titleRewardId: 'rising-star', xpReward: 120, title: 'Разминка', description: 'Выиграй 5 онлайн-матчей.', icon: 'bolt', metric: 'matches', target: 5, group: 'Матчи' },
  { id: 'ten-matches', xpReward: 180, title: 'Постоянный игрок', description: 'Выиграй 10 онлайн-матчей.', icon: 'shield', metric: 'matches', target: 10, group: 'Матчи' },
  { id: 'thirty-matches', titleRewardId: 'veteran', xpReward: 300, title: 'Ветеран Codumi', description: 'Выиграй 30 онлайн-матчей.', icon: 'crown', metric: 'matches', target: 30, group: 'Матчи' },
  { id: 'hundred-matches', titleRewardId: 'arena-legend', xpReward: 700, title: 'Легенда арены', description: 'Выиграй 100 онлайн-матчей.', icon: 'medal', metric: 'matches', target: 100, group: 'Матчи' },
  { id: 'first-friend', xpReward: 100, title: 'Первый друг', description: 'Добавь первого друга.', icon: 'users', metric: 'friends', target: 1, group: 'Общение' },
  { id: 'five-friends', xpReward: 250, title: 'Своя компания', description: 'Подружись с 5 игроками.', icon: 'heart', metric: 'friends', target: 5, group: 'Общение' },
  { id: 'ten-friends', titleRewardId: 'friend-of-all', xpReward: 500, title: 'Душа компании', description: 'Подружись с 10 игроками.', icon: 'sparkles', metric: 'friends', target: 10, group: 'Общение' },
  { id: 'three-games', titleRewardId: 'explorer', xpReward: 150, title: 'Исследователь', description: 'Выиграй матчи в 3 разных играх.', icon: 'compass', metric: 'games', target: 3, group: 'Коллекция' },
  { id: 'seven-games', titleRewardId: 'collector', xpReward: 300, title: 'Коллекционер игр', description: 'Выиграй в 7 разных онлайн-играх.', icon: 'gem', metric: 'games', target: 7, group: 'Коллекция' },
  { id: 'fifteen-games', xpReward: 600, title: 'Мастер разнообразия', description: 'Выиграй в 15 разных онлайн-играх.', icon: 'trophy', metric: 'games', target: 15, group: 'Коллекция' },
];

export function achievementCatalog({ createdAt, matchesFinished = 0, maxFriends = 0, gameIds = [] } = {}) {
  const games = new Set(Array.isArray(gameIds) ? gameIds.filter((x) => typeof x === 'string') : []);
  const metrics = {
    account: createdAt ? 1 : 0,
    matches: Math.max(0, Number(matchesFinished) || 0),
    friends: Math.max(0, Number(maxFriends) || 0),
    games: games.size,
  };
  const badges = CATALOG.map((item) => {
    const progress = Math.min(item.target, metrics[item.metric]);
    return { ...item, progress, unlocked: progress >= item.target };
  });
  return {
    badges,
    unlockedCount: badges.filter((item) => item.unlocked).length,
    totalCount: badges.length,
    // Reserved for a future cup/league system. No cups are earned yet.
    trophies: [],
    stats: { matchesFinished: metrics.matches, differentGames: metrics.games, maxFriends: metrics.friends },
  };
}

export async function getWonGameIds(db, userId) {
  const { data, error } = await db.from('codumi_match_results')
    .select('game_id').eq('user_id', userId).eq('outcome', 'win').limit(5000);
  if (error) throw error;
  return [...new Set((data || []).map((item) => item.game_id).filter(Boolean))];
}

export async function getAchievementProfile(authStore, user) {
  const friendCount = authStore.getFriendsPayload(user.id).friends.length;
  const db = authStore.supabase;
  // High-water mark persists achievements even after a friend is removed.
  const synced = await db.rpc('codumi_sync_friend_progress', {
    p_user_id: user.id,
    p_friend_count: friendCount,
  });
  if (synced.error) throw synced.error;

  const { data, error } = await db.from('codumi_player_progress')
    .select('matches_finished,wins,max_friends,game_ids,xp')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  const { data: claimedRows, error: claimError } = await db.from('codumi_badge_claims')
    .select('badge_id').eq('user_id', user.id);
  if (claimError) throw claimError;
  const claimed = new Set((claimedRows || []).map((item) => item.badge_id));
  const wonGameIds = await getWonGameIds(db, user.id);
  const collection = achievementCatalog({
    createdAt: user.createdAt,
    matchesFinished: data?.wins || 0,
    maxFriends: data?.max_friends || 0,
    gameIds: wonGameIds,
  });
  return {
    ...collection,
    badges: collection.badges.map((badge) => ({ ...badge,
      claimed: claimed.has(badge.id), canClaim: badge.unlocked && !claimed.has(badge.id),
    })),
    level: progressFromXp(data?.xp || 0),
  };
}

export function badgeRewardAmount(id) {
  return CATALOG.find((badge) => badge.id === id)?.xpReward || null;
}


// A single settlement RPC pays *all* competitive games. Matchmaker verifies
// the result from the server-side snapshots; the browser never chooses winners,
// outcomes or reward amounts. The RPC commits both players atomically.
export function verifiedMatchResult({ roomId, gameId, userIds, outcomes }) {
  if (typeof roomId !== 'string' || !roomId || typeof gameId !== 'string' || !gameId
    || !Array.isArray(userIds) || userIds.length !== 2 || !userIds[0]
    || !userIds[1] || userIds[0] === userIds[1] || !outcomes) return null;

  const [a, b] = userIds;
  const first = outcomes[a];
  const second = outcomes[b];
  const isDraw = first === 'draw' && second === 'draw';
  const isWin = (first === 'win' && second === 'loss')
    || (first === 'loss' && second === 'win');
  if (!isDraw && !isWin) return null;

  return { roomId, gameId, playerA: a, playerB: b,
    winnerId: isDraw ? null : (first === 'win' ? a : b),
    eligibleIds: isDraw ? [a, b] : [first === 'win' ? a : b] };
}

async function optionalRewardSnapshot(db, userId) {
  const [progress, gameIds] = await Promise.allSettled([
    getProgressRecord(db, userId), getWonGameIds(db, userId),
  ]);
  return {
    progress: progress.status === 'fulfilled' ? progress.value : null,
    gameIds: gameIds.status === 'fulfilled' ? gameIds.value : null,
  };
}

function newlyUnlockedBadges(user, before, after) {
  if (!user || !before.progress || !before.gameIds || !after.progress || !after.gameIds) return [];
  const build = ({ progress, gameIds }) => achievementCatalog({
    createdAt: user.createdAt,
    matchesFinished: progress.wins || 0,
    maxFriends: progress.max_friends || 0,
    gameIds,
  });
  const previous = new Set(build(before).badges.filter((badge) => badge.unlocked).map((badge) => badge.id));
  return build(after).badges.filter((badge) => badge.unlocked && !previous.has(badge.id));
}

const REWARDS = Object.freeze({ win: { xp: 75, coins: 20 }, draw: { xp: 60, coins: 0 } });

// Only deterministic PostgreSQL/PostgREST failures are safe to recover from.
// A timeout or broken connection may happen AFTER PostgreSQL commits: NEVER
// retry those requests, or they could pay twice.
const SAFE_SQL_ROLLBACK_CODES = new Set(['PGRST202', '42883', 'P0001', '42P01', '42703', '42501', '22P02']);
export function canRecoverLegacyReward(error) {
  return SAFE_SQL_ROLLBACK_CODES.has(String(error?.code || ''));
}

async function walletBalance(db, userId) {
  const { data, error } = await db.from('codumi_coin_wallets').select('coins')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return Number(data?.coins || 0);
}

function logRewardError(context, error) {
  console.error(`[rewards] ${context}:`, error?.code || '', error?.message || error,
    error?.details || '', error?.hint || '');
}

// Compatibility recovery for deployments with the ORIGINAL reward RPCs but
// without a working unified settlement RPC. Uses the existing database fair-
// reward claim, not an in-memory cooldown. Never runs on a network timeout.
// Once all servers have the working unified migration, this path may be removed.
async function settleUsingLegacyFunctions(authStore, match) {
  const db = authStore.supabase;
  const rows = [];
  for (const userId of match.eligibleIds) {
    const outcome = match.winnerId === null ? 'draw' : 'win';
    const opponentId = userId === match.playerA ? match.playerB : match.playerA;
    const before = await optionalRewardSnapshot(db, userId);
    const balanceBefore = outcome === 'win' ? await walletBalance(db, userId) : 0;
    const claim = await db.rpc('codumi_claim_fair_reward', {
      p_room_id: match.roomId, p_user_id: userId,
      p_opponent_id: opponentId, p_outcome: outcome,
    });
    if (claim.error) throw claim.error;
    if (claim.data !== true) {
      if (rows.length) return { awarded: true, awards: rows, partial: true,
        reason: 'LEGACY_GUARD' };
      return { awarded: false, reason: 'LEGACY_GUARD' };
    }
    const credited = await db.rpc('codumi_award_match_xp', {
      p_room_id: match.roomId, p_user_id: userId,
      p_game_id: match.gameId, p_outcome: outcome,
    });
    if (credited.error) throw credited.error;
    if (credited.data !== true) {
      return { awarded: rows.length > 0, awards: rows, partial: rows.length > 0,
        reason: 'LEGACY_XP_REJECTED' };
    }
    let coinsEarned = 0;
    let coinError = false;
    if (outcome === 'win') {
      try {
        // Legacy installations may already credit coins from an XP trigger.
        let balanceAfter = await walletBalance(db, userId);
        if (balanceAfter - balanceBefore < REWARDS.win.coins) {
          const coinCredit = await db.rpc('codumi_credit_win_coins', {
            p_user_id: userId, p_room_id: match.roomId,
          });
          if (coinCredit.error) throw coinCredit.error;
          balanceAfter = await walletBalance(db, userId);
        }
        coinsEarned = Math.max(0, balanceAfter - balanceBefore);
        if (coinsEarned !== REWARDS.win.coins) coinError = true;
      } catch (error) {
        coinError = true;
        logRewardError(`Legacy coin payout for ${match.roomId}`, error);
      }
    }
    const after = await optionalRewardSnapshot(db, userId);
    const user = authStore.getPublicUser(userId);
    rows.push({ userId, outcome,
      xpEarned: REWARDS[outcome].xp, coinsEarned,
      coinError, prior: before, after, newBadges: newlyUnlockedBadges(user, before, after) });
  }
  return { awarded: rows.length > 0, awards: rows, partial: rows.length !== match.eligibleIds.length,
    reason: rows.length === match.eligibleIds.length ? null : 'PARTIAL_LEGACY' };
}

async function prepareRewardNotification(authStore, match, row, before) {
  const db = authStore.supabase;
  const after = row.after || await optionalRewardSnapshot(db, row.userId);
  const prior = row.prior || before || { progress: null, gameIds: null };
  const xpEarned = Number(row.xpEarned) || 0;
  const coinsEarned = Number(row.coinsEarned) || 0;
  const user = authStore.getPublicUser(row.userId);
  return {
    userId: row.userId, gameId: match.gameId, roomId: match.roomId,
    outcome: match.winnerId === null ? 'draw' : 'win',
    xpEarned, coinsEarned, coinError: Boolean(row.coinError),
    questClaims: [],
    previousLevel: progressFromXp(prior.progress?.xp ?? Math.max(0, (after.progress?.xp ?? xpEarned) - xpEarned)),
    nextLevel: progressFromXp(after.progress?.xp ?? ((prior.progress?.xp ?? 0) + xpEarned)),
    newBadges: row.newBadges || newlyUnlockedBadges(user, prior, after),
  };
}

export async function recordCompletedMatch(authStore, event, onAward = () => {}) {
  const match = verifiedMatchResult(event || {});
  if (!match) return { awarded: false, reason: event?.unrewardableReason || 'UNVERIFIED_RESULT', awards: [] };
  const db = authStore.supabase;
  let settled;
  const before = await Promise.all(match.eligibleIds.map((id) => optionalRewardSnapshot(db, id)));
  try {
    // Preferred path: one PostgreSQL transaction, both players, pair/game lock.
    // Never infer a win or amount from browser data.
    const { data, error } = await db.rpc('codumi_settle_verified_match_reward', {
      p_room_id: match.roomId, p_game_id: match.gameId,
      p_player_a: match.playerA, p_player_b: match.playerB,
      p_winner_id: match.winnerId,
    });
    if (error) throw error;
    if (!data || typeof data.awarded !== 'boolean') throw new Error('INVALID_REWARD_RPC_RESPONSE');
    settled = { awarded: data.awarded, reason: data.reason,
      awards: Array.isArray(data.awards) ? data.awards : [] };
  } catch (error) {
    logRewardError(`Unified payout for ${match.gameId}/${match.roomId}`, error);
    if (!canRecoverLegacyReward(error)) {
      // In particular: no fallback for post-commit network failures.
      return { awarded: false, reason: 'SETTLEMENT_FAILED', awards: [] };
    }
    try {
      settled = await settleUsingLegacyFunctions(authStore, match);
      console.warn(`[rewards] Legacy recovery used for ${match.gameId}/${match.roomId}`);
    } catch (legacyError) {
      logRewardError(`Legacy recovery for ${match.gameId}/${match.roomId}`, legacyError);
      return { awarded: false, reason: 'SETTLEMENT_FAILED', awards: [] };
    }
  }

  if (!settled.awarded) return { awarded: false, reason: settled.reason || 'NOT_AWARDED', awards: [] };
  const expected = new Set(match.eligibleIds);
  if (!Array.isArray(settled.awards) || !settled.awards.length
    || settled.awards.some((row) => !expected.has(row.userId))
    || new Set(settled.awards.map((row) => row.userId)).size !== settled.awards.length) {
    console.error(`[rewards] Invalid settlement receipt for ${match.roomId}`);
    return { awarded: false, reason: 'INVALID_RECEIPT', awards: [] };
  }
  const receipts = [];
  for (const row of settled.awards) {
    const prior = before[match.eligibleIds.indexOf(row.userId)];
    const notification = await prepareRewardNotification(authStore, match, row, prior);
    receipts.push({ userId: row.userId, outcome: notification.outcome,
      xpEarned: notification.xpEarned, coinsEarned: notification.coinsEarned,
      coinError: notification.coinError });
    try { await onAward(notification); }
    catch (notifyError) { logRewardError(`Notification ${match.roomId}`, notifyError); }
  }
  return { awarded: true, awards: receipts,
    partial: Boolean(settled.partial), reason: settled.reason || null };
}
