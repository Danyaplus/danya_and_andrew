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

export async function recordCompletedMatch(authStore, event, onAward = () => {}) {
  const match = verifiedMatchResult(event || {});
  if (!match) return { awarded: false, reason: 'UNVERIFIED_RESULT' };
  const db = authStore.supabase;

  try {
    // Snapshots are only for achievements/level-up messages. Failure to read
    // progress must never consume eligibility or prevent an earned payout.
    const before = await Promise.all(match.eligibleIds.map((id) => optionalRewardSnapshot(db, id)));

    // Exactly ONE call, for BOTH participants. PostgreSQL locks the unordered
    // pair+game, checks a 10-minute cooldown, and makes XP, coins and the
    // room audit entries one all-or-nothing transaction.
    const { data, error } = await db.rpc('codumi_settle_verified_match_reward', {
      p_room_id: match.roomId,
      p_game_id: match.gameId,
      p_player_a: match.playerA,
      p_player_b: match.playerB,
      p_winner_id: match.winnerId,
    });
    if (error) throw error;
    if (data?.awarded !== true) {
      if (data?.reason && data.reason !== 'ALREADY_SETTLED') {
        console.info(`[rewards] ${match.gameId} ${match.roomId}: ${data.reason}`);
      }
      return { awarded: false, reason: data?.reason || 'NOT_AWARDED' };
    }

    const expectedIds = new Set(match.eligibleIds);
    const rows = data.awards;
    if (!Array.isArray(rows) || rows.length !== expectedIds.size
      || rows.some((row) => !expectedIds.has(row?.userId))
      || new Set(rows.map((row) => row?.userId)).size !== expectedIds.size) {
      // Payout is ALREADY committed, so do not retry (would duplicate events).
      console.error(`[rewards] Invalid response from settlement for room ${match.roomId}`);
      return { awarded: true, reason: 'INVALID_RESPONSE' };
    }

    // All notifications are deliberately outside the transaction. A failed
    // notification cannot undo a reward or prevent the other player being paid.
    await Promise.all(rows.map(async (reward) => {
      try {
        const userId = reward.userId;
        const outcome = match.winnerId === null ? 'draw' : 'win';
        const xpEarned = Number(reward.xpEarned) || 0;
        const coinsEarned = Number(reward.coinsEarned) || 0;
        const index = match.eligibleIds.indexOf(userId);
        const after = await optionalRewardSnapshot(db, userId);
        const prior = before[index];
        const user = authStore.getPublicUser(userId);
        const previousLevel = progressFromXp(prior.progress?.xp
          ?? Math.max(0, (after.progress?.xp ?? xpEarned) - xpEarned));
        const nextLevel = progressFromXp(after.progress?.xp
          ?? ((prior.progress?.xp ?? 0) + xpEarned));
        const notify = async (payload) => {
          try { await onAward(payload); }
          catch (failure) { console.error('[rewards] Notification error:', failure?.message || failure); }
        };
        await notify({ userId, gameId: match.gameId, roomId: match.roomId, outcome,
          xpEarned, questClaims: [], nextLevel, previousLevel,
          newBadges: newlyUnlockedBadges(user, prior, after) });
        if (coinsEarned > 0) {
          await notify({ userId, gameId: match.gameId, roomId: match.roomId,
            outcome, coinsEarned, coinOnly: true });
        }
      } catch (notificationFailure) {
        console.error(`[rewards] Post-settlement notification failed for ${reward.userId}:`,
          notificationFailure?.message || notificationFailure);
      }
    }));
    return { awarded: true };
  } catch (failure) {
    console.error(`[rewards] Cannot settle ${match.gameId} room ${match.roomId}:`, failure?.message || failure);
    return { awarded: false, reason: 'SETTLEMENT_FAILED' };
  }
}
