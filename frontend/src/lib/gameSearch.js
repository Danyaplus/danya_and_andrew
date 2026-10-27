// Search shared by the main catalogue and header suggestions.
// Handles RU/UK/EN, phonetic Latin spellings and accidental keyboard layouts.
import { translateText } from './translations.js';

export function normalizeGameText(value) {
  return String(value ?? '').toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/\s+/g, ' ');
}

// Physical keys (not phonetic transliteration): "if[vfns" -> "шахматы".
// Ukrainian has its own letters in the corresponding key positions.
const EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const RU_KEYS = 'ёйцукенгшщзхъфывапролджэячсмитьбю.';
const UK_KEYS = 'ґйцукенгшщзхїфівапролджєячсмитьбю.';
const keyboardMaps = [
  [EN_KEYS, RU_KEYS], [EN_KEYS, UK_KEYS],
  [RU_KEYS, EN_KEYS], [UK_KEYS, EN_KEYS],
].map(([from, to]) => new Map([...from].map((letter, index) => [letter, to[index]])));

function keyboardVariants(text) {
  const raw = String(text ?? '').toLowerCase();
  // Keep punctuation until after correction: [ in "if[vfns" is the Cyrillic х.
  const results = [raw];
  for (const mapping of keyboardMaps) {
    const mapped = [...raw].map((character) => mapping.get(character) ?? character).join('');
    if (mapped !== raw) results.push(mapped);
  }
  return results;
}

const LATIN_FROM_CYRILLIC = {
  а:'a',б:'b',в:'v',г:'g',ґ:'g',д:'d',е:'e',є:'ye',ё:'yo',ж:'zh',з:'z',и:'i',і:'i',ї:'yi',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',
  ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
function romanize(text, useKh = false) {
  return [...String(text).toLowerCase()]
    .map((letter) => letter === 'х' && useKh ? 'kh' : LATIN_FROM_CYRILLIC[letter] ?? letter)
    .join('');
}

// Optional common names not identical to the titles in the catalogue.
const ALIASES = {
  chess: ['шахи', 'шахмат', 'shahmaty', 'shakhmaty'],
  checkers: ['draughts', 'shashki', 'шашечки'],
  'pin-pong-duel': ['пинг понг', 'пингпонг', 'пин понг', 'ping pong', 'pingpong', 'настольный теннис', 'настільний теніс', 'table tennis'],
};

function textVariants(text, allowKeyboard = false) {
  const inputs = allowKeyboard ? keyboardVariants(text) : [text];
  const options = new Set();
  for (const input of inputs) {
    for (const value of [input, romanize(input), romanize(input, true)]) {
      const normalized = normalizeGameText(value);
      if (normalized) options.add(normalized);
    }
  }
  return [...options];
}

function gameSearchIndex(game) {
  const names = new Set([game.title, game.id.replace(/-/g, ' '), ...(ALIASES[game.id] ?? [])]);
  const descriptions = new Set();
  for (const language of ['ru', 'uk', 'en']) {
    names.add(translateText(game.title, language));
    descriptions.add(translateText(game.description, language));
  }
  return {
    titles: [...names].flatMap((name) => textVariants(name)),
    descriptions: [...descriptions].flatMap((description) => textVariants(description)),
  };
}

function matchScore(query, text) {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (text.split(' ').some((part) => part.startsWith(query))) return 2;
  return text.includes(query) ? 3 : Infinity;
}

// Restricted Damerau/Levenshtein distance, with adjacent transposition.
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
      if (beforePrevious && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}

export function searchGames(allGames, rawQuery) {
  const queries = textVariants(String(rawQuery ?? '').trim(), true);
  if (!queries.length) return allGames;

  // Rank exact titles above descriptions, and all real results above fuzzy ones.
  const indexed = allGames.map((game, order) => ({ game, order, ...gameSearchIndex(game) }));
  const matches = indexed.map((entry) => {
    let score = Infinity;
    for (const query of queries) {
      for (const title of entry.titles) score = Math.min(score, matchScore(query, title));
      for (const description of entry.descriptions) score = Math.min(score, 5 + matchScore(query, description));
    }
    return { ...entry, score };
  }).filter((entry) => Number.isFinite(entry.score));

  if (matches.length) {
    return matches.sort((a,b) => a.score - b.score || a.order - b.order).map(({game}) => game);
  }

  const query = normalizeGameText(rawQuery);
  if (query.length < 4) return [];
  const allowed = query.length < 6 ? 1 : query.length < 10 ? 2 : 3;
  return indexed.map((entry) => {
    let distance = allowed + 1;
    for (const variant of queries) {
      if (variant.length < 4) continue;
      for (const title of entry.titles) {
        for (const candidate of [title, title.replace(/ /g, ''), ...title.split(' ')]) {
          distance = Math.min(distance, editDistance(variant, candidate, allowed));
          if (distance === 0) break;
        }
      }
    }
    return { ...entry, distance };
  }).filter(({ distance }) => distance <= allowed)
    .sort((a,b) => a.distance - b.distance || a.order - b.order)
    .slice(0, 6).map(({game}) => game);
}
