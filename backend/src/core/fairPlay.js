// Server-only eligibility checks. The game result and activity always come from the server,
// never from client-supplied XP, winners or elapsed-time values.
const UNREWARDED_ENDINGS = new Set([
  'disconnect', 'resign', 'surrender', 'forfeit', 'leave', 'abandon',
  'timeout', 'clock', 'time', 'host-roulette', 'airstrike', 'nuclear', 'gunfire',
]);

export function evaluateRewardEligibility({ userIds, snapshots, socketIds, elapsedMs, actionCounts, forfeited }) {
  if (forfeited || !Array.isArray(userIds) || userIds.length !== 2
    || !userIds[0] || !userIds[1] || userIds[0] === userIds[1]
    || !Array.isArray(socketIds) || socketIds.length !== 2) return null;
  if (elapsedMs < 3000) return null;
  if (socketIds.some((id) => (actionCounts.get(id) || 0) < 1)) return null;

  const results = socketIds.map((id) => snapshots.get(id));
  if (results.some((state) => !state || state.status !== 'finished'
    || !state.result || !Object.prototype.hasOwnProperty.call(state.result, 'winner'))) return null;

  const endings = results.map((state) => String(state.result.type || '').toLowerCase());
  if (endings.some((ending) => UNREWARDED_ENDINGS.has(ending))) return null;
  if (String(results[0].result.winner) !== String(results[1].result.winner)) return null;

  const winner = results[0].result.winner;
  if (winner == null) return { [userIds[0]]: 'draw', [userIds[1]]: 'draw' };

  const seats = results.map((state) => state.playerSeat ?? state.playerColor ?? state.playerSymbol
    ?? state.playerSide ?? state.playerSlot ?? state.playerTeam ?? null);
  if (seats.some((seat) => seat == null) || String(seats[0]) === String(seats[1])) return null;
  const winnerIndex = seats.findIndex((seat) => String(seat) === String(winner));
  if (winnerIndex === -1) return null;
  return { [userIds[winnerIndex]]: 'win', [userIds[1 - winnerIndex]]: 'loss' };
}
