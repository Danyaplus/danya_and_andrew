// Only results produced and confirmed by the game server may earn rewards.
// A valid surrender, an expired disconnect and a quick legitimate finish all
// count as a real win for the remaining player. Admin-only events do not.
const UNREWARDED_ENDINGS = new Set([
  'host-roulette', 'airstrike', 'nuclear', 'gunfire',
]);

export function evaluateRewardEligibility({ userIds, snapshots, socketIds, forfeitedSeat = null }) {
  if (!Array.isArray(userIds) || userIds.length !== 2
    || (userIds[0] && userIds[0] === userIds[1])
    || !Array.isArray(socketIds) || socketIds.length !== 2) return null;

  const results = socketIds.map((id) => snapshots.get(id));
  if (results.some((state) => !state || state.status !== 'finished'
    || !state.result || !Object.prototype.hasOwnProperty.call(state.result, 'winner'))) return null;

  const endings = results.map((state) => String(state.result.type || '').toLowerCase());
  if (endings.some((ending) => UNREWARDED_ENDINGS.has(ending))) return null;
  if (String(results[0].result.winner) !== String(results[1].result.winner)) return null;

  const winner = results[0].result.winner;
  if (winner == null) return forfeitedSeat === null ? ['draw', 'draw'] : null;

  const seats = results.map((state) => state.playerSeat ?? state.playerColor ?? state.playerSymbol
    ?? state.playerSide ?? state.playerSlot ?? state.playerTeam ?? null);
  if (seats.some((seat) => seat == null) || String(seats[0]) === String(seats[1])) return null;
  const winnerIndex = seats.findIndex((seat) => String(seat) === String(winner));
  if (winnerIndex === -1) return null;
  // When someone has left, only the still-present player can be rewarded.
  if (forfeitedSeat !== null && winnerIndex !== 1 - forfeitedSeat) return null;
  return winnerIndex === 0 ? ['win', 'loss'] : ['loss', 'win'];
}
