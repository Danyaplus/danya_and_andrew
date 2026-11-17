// Pure analysis; flags are suggestions, never bans. Uses *verified* finished
// matches, not client-controlled names, IPs or score claims.
export function computeSuspiciousPairs(events, { since = Date.now() - 7 * 86400000 } = {}) {
  const groups = new Map();
  for (const event of events) {
    if (!event?.settled || Number(event.finished_at) < since) continue;
    if (!event.user_a || !event.user_b || event.user_a === event.user_b || !event.game_id) continue;
    const ids = [event.user_a, event.user_b].sort();
    const key = `${event.game_id}|${ids[0]}|${ids[1]}`;
    let group = groups.get(key);
    if (!group) {
      group = { gameId: event.game_id, userIds: ids, matches: 0, wins: new Map(), fast: 0, lastAt: 0 };
      groups.set(key, group);
    }
    group.matches += 1;
    if (ids.includes(event.winner_id)) group.wins.set(event.winner_id, (group.wins.get(event.winner_id) || 0) + 1);
    if (Number(event.elapsed_ms) > 0 && Number(event.elapsed_ms) < 60_000) group.fast += 1;
    group.lastAt = Math.max(group.lastAt, Number(event.finished_at) || 0);
  }
  return [...groups.values()].flatMap(group => {
    if (group.matches < 6) return [];
    const [winnerId, winnerWins] = [...group.wins.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
    const dominance = winnerWins / group.matches;
    if (dominance < 0.8 && group.fast < 4) return [];
    return [{ gameId: group.gameId, userIds: group.userIds, matches: group.matches,
      winnerId, winnerWins, winShare: Math.round(dominance * 100), quickMatches: group.fast,
      lastAt: group.lastAt, flags: [
        ...(dominance >= 0.8 ? ['Победы одного игрока ≥ 80%'] : []),
        ...(group.fast >= 4 ? ['Необычно короткие матчи'] : []),
      ] }];
  }).sort((a, b) => b.matches - a.matches || b.lastAt - a.lastAt);
}
