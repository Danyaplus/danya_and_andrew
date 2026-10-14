import { progressFromXp, getProgressRecord } from './progression.js';

// Account-bound achievements. All progress is calculated server-side.
// Game completion is recorded by the matchmaker; browsers cannot award badges.
const CATALOG = [
  { id: 'hello-codumi', title: 'Добро пожаловать', description: 'Создай аккаунт Codumi Games.', icon: 'star', metric: 'account', target: 1, group: 'Профиль' },
  { id: 'first-match', title: 'Первый матч', description: 'Заверши свою первую онлайн-игру.', icon: 'flag', metric: 'matches', target: 1, group: 'Матчи' },
  { id: 'five-matches', title: 'Разминка', description: 'Заверши 5 онлайн-матчей.', icon: 'bolt', metric: 'matches', target: 5, group: 'Матчи' },
  { id: 'ten-matches', title: 'Постоянный игрок', description: 'Заверши 10 онлайн-матчей.', icon: 'shield', metric: 'matches', target: 10, group: 'Матчи' },
  { id: 'thirty-matches', title: 'Ветеран Codumi', description: 'Заверши 30 онлайн-матчей.', icon: 'crown', metric: 'matches', target: 30, group: 'Матчи' },
  { id: 'hundred-matches', title: 'Легенда арены', description: 'Заверши 100 онлайн-матчей.', icon: 'medal', metric: 'matches', target: 100, group: 'Матчи' },
  { id: 'first-friend', title: 'Первый друг', description: 'Добавь первого друга.', icon: 'users', metric: 'friends', target: 1, group: 'Общение' },
  { id: 'five-friends', title: 'Своя компания', description: 'Подружись с 5 игроками.', icon: 'heart', metric: 'friends', target: 5, group: 'Общение' },
  { id: 'ten-friends', title: 'Душа компании', description: 'Подружись с 10 игроками.', icon: 'sparkles', metric: 'friends', target: 10, group: 'Общение' },
  { id: 'three-games', title: 'Исследователь', description: 'Заверши матчи в 3 разных играх.', icon: 'compass', metric: 'games', target: 3, group: 'Коллекция' },
  { id: 'seven-games', title: 'Коллекционер игр', description: 'Попробуй 7 разных онлайн-игр.', icon: 'gem', metric: 'games', target: 7, group: 'Коллекция' },
  { id: 'fifteen-games', title: 'Мастер разнообразия', description: 'Попробуй 15 разных онлайн-игр.', icon: 'trophy', metric: 'games', target: 15, group: 'Коллекция' },
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
    .select('matches_finished,max_friends,game_ids,xp')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  return {
    ...achievementCatalog({
      createdAt: user.createdAt,
      matchesFinished: data?.matches_finished || 0,
      maxFriends: data?.max_friends || 0,
      gameIds: data?.game_ids || [],
    }),
    level: progressFromXp(data?.xp || 0),
  };
}

export async function recordCompletedMatch(authStore, { roomId, gameId, userIds, outcomes = {} }, onAward = () => {}) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  await Promise.all(uniqueIds.map(async (userId) => {
    try {
      const db = authStore.supabase;
      const user = authStore.getPublicUser(userId);
      if (!user) return;
      const previous = await getProgressRecord(db, userId);
      const outcome = ['win', 'loss', 'draw'].includes(outcomes[userId]) ? outcomes[userId] : 'completed';
      const { data: awarded, error } = await db.rpc('codumi_award_match_xp', {
        p_room_id: roomId, p_user_id: userId, p_game_id: gameId, p_outcome: outcome,
      });
      if (error) throw error;
      if (!awarded) return; // A server callback can never reward the same room twice.
      const next = await getProgressRecord(db, userId);
      const beforeBadges = achievementCatalog({ createdAt: user.createdAt, matchesFinished: previous.matches_finished, maxFriends: previous.max_friends, gameIds: previous.game_ids });
      const afterBadges = achievementCatalog({ createdAt: user.createdAt, matchesFinished: next.matches_finished, maxFriends: next.max_friends, gameIds: next.game_ids });
      const previousIds = new Set(beforeBadges.badges.filter((item) => item.unlocked).map((item) => item.id));
      const newBadges = afterBadges.badges.filter((item) => item.unlocked && !previousIds.has(item.id));
      await onAward({ userId, gameId, roomId, outcome, xpEarned: 50 + (outcome === 'win' ? 25 : outcome === 'draw' ? 10 : 0),
        nextLevel: progressFromXp(next.xp), previousLevel: progressFromXp(previous.xp), newBadges });
    } catch (error) {
      console.error('[achievements] Failed to award completed match:', error?.message || error);
    }
  }));
}
