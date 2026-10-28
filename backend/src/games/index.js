import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const gamesDirectory = path.dirname(fileURLToPath(import.meta.url));

async function discoverGames() {
  const entries = await readdir(gamesDirectory, { withFileTypes: true });
  const registry = new Map();
  const failures = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const modulePath = path.join(gamesDirectory, entry.name, 'index.js');

    try {
      const module = await import(pathToFileURL(modulePath).href);
      const game = module.default;

      if (!game?.id || !game?.title || typeof game.createRoom !== 'function') {
        failures.push(`${entry.name}: неверный контракт модуля`);
        continue;
      }

      if (registry.has(game.id)) {
        throw new Error(`Повторяющийся game id: ${game.id}`);
      }

      registry.set(game.id, game);
    } catch (error) {
      failures.push(`${entry.name}: ${error?.message || error}`);
    }
  }

  if (failures.length) {
    throw new Error(`[games] Ошибки реестра игр:\n${failures.join('\n')}`);
  }
  if (!registry.size) throw new Error('[games] Не найдено ни одной игры');
  console.log(`[games] Registered ${registry.size} games`);
  return registry;
}

export const gameRegistry = await discoverGames();

export function getGameDefinition(gameId) {
  return gameRegistry.get(gameId);
}
