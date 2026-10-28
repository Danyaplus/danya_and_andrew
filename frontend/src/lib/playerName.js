// One guest display name across all game modes. Preserve the existing key so
// updates do not rename returning visitors or change matchmaking identities.
export const PLAYER_NAME_STORAGE_KEY = 'danya-andrew-player-name';

export function getPlayerName() {
  const saved = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem(PLAYER_NAME_STORAGE_KEY, generated);
  return generated;
}
