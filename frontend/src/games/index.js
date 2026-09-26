// Vite автоматически подхватывает каждый frontend/src/games/<game-id>/index.js.
// Поэтому для новой игры не нужно изменять этот файл.
const modules = import.meta.glob('./*/index.js', { eager: true });

export const games = Object.values(modules)
  .map((module) => module.default)
  .filter((game) => game?.id && game?.title && game?.component)
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

export function getGameById(id) {
  return games.find((game) => game.id === id);
}
