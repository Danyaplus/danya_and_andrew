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


export async function recordCompletedMatch(authStore, { roomId, gameId, userIds, outcomes = {} }, onAward = () => {}) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (uniqueIds.length !== 2) return;
  await Promise.all(uniqueIds.map(async (userId) => {
    try {
      const outcome = outcomes[userId];
      // Losses, forfeits and unfinished games never mint XP, coins or quest/badge progress.
      if (outcome !== 'win' && outcome !== 'draw') return;
      const db = authStore.supabase;
      const user = authStore.getPublicUser(userId);
      if (!user) return;
      const opponentId = uniqueIds.find((id) => id !== userId);
      const { data: eligible, error: guardError } = await db.rpc('codumi_claim_fair_reward', {
        p_room_id: roomId, p_user_id: userId, p_opponent_id: opponentId,
        p_outcome: outcome,
      });
      if (guardError) throw guardError;
      if (!eligible) return;
      const previous = await getProgressRecord(db, userId);
      const wonGameIdsBefore = await getWonGameIds(db, userId);
      const { data: awarded, error } = await db.rpc('codumi_award_match_xp', {
        p_room_id: roomId, p_user_id: userId, p_game_id: gameId, p_outcome: outcome,
      });
      if (error) throw error;
      if (!awarded) return; // A server callback can never reward the same room twice.
      // Coins are reserved for confirmed wins. PostgreSQL verifies outcome and deduplicates by room.
      if (outcome === 'win') {
        try {
          const paid = await db.rpc('codumi_credit_win_coins', { p_user_id: userId, p_room_id: roomId });
          if (paid.error) throw paid.error;
          // The DB trigger may have credited first; still notify once for this awarded match.
          await onAward({ userId, coinsEarned: 20, coinOnly: true });
        } catch (coinError) {
          console.error('[coins] Could not credit win:', coinError?.message || coinError);
        }
      }
      const next = await getProgressRecord(db, userId);
      const beforeBadges = achievementCatalog({ createdAt: user.createdAt, matchesFinished: previous.wins || 0, maxFriends: previous.max_friends, gameIds: wonGameIdsBefore });
      const wonGameIdsAfter = outcome === 'win'
        ? [...new Set([...wonGameIdsBefore, gameId])] : wonGameIdsBefore;
      const afterBadges = achievementCatalog({ createdAt: user.createdAt, matchesFinished: next.wins || 0, maxFriends: next.max_friends, gameIds: wonGameIdsAfter });
      const previousIds = new Set(beforeBadges.badges.filter((item) => item.unlocked).map((item) => item.id));
      const newBadges = afterBadges.badges.filter((item) => item.unlocked && !previousIds.has(item.id));
      await onAward({ userId, gameId, roomId, outcome, xpEarned: 50 + (outcome === 'win' ? 25 : outcome === 'draw' ? 10 : 0), questClaims: [],
        nextLevel: progressFromXp(next.xp), previousLevel: progressFromXp(previous.xp), newBadges });
    } catch (error) {
      console.error('[achievements] Failed to award completed match:', error?.message || error);
    }
  }));
}
