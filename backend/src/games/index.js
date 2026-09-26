import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const gamesDirectory = path.dirname(fileURLToPath(import.meta.url));

async function discoverGames() {
  const entries = await readdir(gamesDirectory, { withFileTypes: true });
  const registry = new Map();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const modulePath = path.join(gamesDirectory, entry.name, 'index.js');

    try {
      const module = await import(pathToFileURL(modulePath).href);
      const game = module.default;

      if (!game?.id || !game?.title || typeof game.createRoom !== 'function') {
        console.warn(`[games] Пропущен ${entry.name}: неверный контракт модуля.`);
        continue;
      }

      if (registry.has(game.id)) {
        throw new Error(`Повторяющийся game id: ${game.id}`);
      }

      registry.set(game.id, game);
    } catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND') continue;
      console.error(`[games] Не удалось загрузить ${entry.name}:`, error);
    }
  }

  return registry;
}

export const gameRegistry = await discoverGames();

export function getGameDefinition(gameId) {
  return gameRegistry.get(gameId);
}
