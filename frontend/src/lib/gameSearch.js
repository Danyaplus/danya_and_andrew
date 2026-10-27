// Shared forgiving search used by the header suggestions and the catalog.
// Exact matches are always preferred; a small number of typing errors is tolerated.
export function normalizeGameText(value) {
  return String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious = null;
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      // A pair of swapped adjacent letters counts as one mistake.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        if (beforePrevious) current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

import { translateText } from './translations.js';

export function searchGames(allGames, rawQuery) {
  const query = normalizeGameText(rawQuery);
  if (!query) return allGames;
  const exact = allGames.filter((game) => {
    const strings = ['ru', 'uk', 'en'].flatMap((language) => [
      normalizeGameText(translateText(game.title, language)),
      normalizeGameText(translateText(game.description, language)),
    ]);
    return strings.some((text) => text.includes(query));
  });
  if (exact.length) {
    return [...exact].sort((a, b) => {
      const rank = (item) => Math.min(...['ru', 'uk', 'en'].map((language) => {
        const title = normalizeGameText(translateText(item.title, language));
        if (title === query) return 0;
        if (title.startsWith(query)) return 1;
        if (title.includes(query)) return 2;
        return 3;
      }));
      return rank(a) - rank(b);
    });
  }
  if (query.length < 4) return [];
  const allowed = query.length < 6 ? 1 : query.length < 10 ? 2 : 3;
  return allGames.map((game) => {
    const title = normalizeGameText(game.title);
    const words = title.split(' ');
    const candidates = [title, title.replace(/ /g, ''), ...words];
    const distance = Math.min(...candidates.map((candidate) => editDistance(query, candidate, allowed)));
    return { game, distance };
  }).filter(({ distance }) => distance <= allowed)
    .sort((a, b) => a.distance - b.distance || a.game.title.localeCompare(b.game.title, 'ru'))
    .slice(0, 6).map(({ game }) => game);
}
