import dictionary from './ui-dictionary.json';

// Russian source phrases are retained in the existing JSX/game modules.
// All new UI copy should be added here as a keyed translation in the dictionary.
const normalized = new Map(Object.entries(dictionary));

const templates = [

  [/^Прямое попадание! С вашей стороны выбито фигур: (\d+)\.$/u, (m, lang) => lang === 'uk'
    ? `Пряме влучання! З вашого боку вибито фігур: ${m[1]}.`
    : `Direct hit! You lost ${m[1]} pieces.`],
  [/^Авиаудар завершён\. У соперника выбито фигур: (\d+)\.$/u, (m, lang) => lang === 'uk'
    ? `Авіаудар завершено. У суперника вибито фігур: ${m[1]}.`
    : `Airstrike complete. Your opponent lost ${m[1]} pieces.`],
  // Match results are issued by the server in Russian. These predictable
  // templates intentionally keep usernames out of the translation dictionary.
  [/^Мат\. Победили (белые|чёрные)\.$/u, (m, lang) => lang === 'uk'
    ? `Мат. Перемогли ${m[1] === 'белые' ? 'білі' : 'чорні'}.`
    : `Checkmate. ${m[1] === 'белые' ? 'White' : 'Black'} wins.`],
  [/^Время вышло\. Победили (белые|чёрные)\.$/u, (m, lang) => lang === 'uk'
    ? `Час вийшов. Перемогли ${m[1] === 'белые' ? 'білі' : 'чорні'}.`
    : `Time is up. ${m[1] === 'белые' ? 'White' : 'Black'} wins.`],
  [/^(Белые|Чёрные) сдались\. Победа (белых|чёрных)\.$/u, (m, lang) => lang === 'uk'
    ? `${m[1] === 'Белые' ? 'Білі' : 'Чорні'} здалися. Перемога ${m[2] === 'белых' ? 'білих' : 'чорних'}.`
    : `${m[1] === 'Белые' ? 'White' : 'Black'} resigned. ${m[2] === 'белых' ? 'White' : 'Black'} wins.`],
  [/^(Белые|Чёрные) больше не могут ходить\.$/u, (m, lang) => lang === 'uk'
    ? `${m[1] === 'Белые' ? 'Білі' : 'Чорні'} більше не можуть ходити.`
    : `${m[1] === 'Белые' ? 'White' : 'Black'} has no legal moves.`],
  [/^(Белые|Чёрные) сдались\.$/u, (m, lang) => lang === 'uk'
    ? `${m[1] === 'Белые' ? 'Білі' : 'Чорні'} здалися.`
    : `${m[1] === 'Белые' ? 'White' : 'Black'} resigned.`],
  [/^(Крестики|Нолики) собрали три в ряд\.$/u, (m, lang) => lang === 'uk'
    ? `${m[1] === 'Крестики' ? 'Хрестики' : 'Нулики'} зібрали три в ряд.`
    : `${m[1] === 'Крестики' ? 'Crosses' : 'Noughts'} made three in a row.`],
  [/^(Крестики|Нолики) сдались\.$/u, (m, lang) => lang === 'uk'
    ? `${m[1] === 'Крестики' ? 'Хрестики' : 'Нулики'} здалися.`
    : `${m[1] === 'Крестики' ? 'Crosses' : 'Noughts'} resigned.`],
  [/^Ядерный удар! Король (.+) уцелел в противогазе\. Победа!$/u, (m, lang) => lang === 'uk'
    ? `Ядерний удар! Король ${m[1]} уцілів у протигазі. Перемога!`
    : `Nuclear strike! ${m[1]}'s king survived in a gas mask. Victory!`],
  [/^Вооружённый налёт! (.+) устранил все фигуры соперника\.$/u, (m, lang) => lang === 'uk'
    ? `Збройний напад! ${m[1]} знищив усі фігури суперника.`
    : `Armed attack! ${m[1]} eliminated every opposing piece.`],
  [/^Игра дня: (.+)$/u, (m, lang) => lang === 'uk' ? `Гра дня: ${translateText(m[1], lang)}` : `Game of the day: ${translateText(m[1], lang)}`],
  [/^Показано (\d+) из (\d+) игр$/u, (m, lang) => lang === 'uk' ? `Показано ${m[1]} з ${m[2]} ігор` : `Showing ${m[1]} of ${m[2]} games`],
  [/^(\d+) (игрока|игроков|игрок)$/u, (m, lang) => lang === 'uk' ? `${m[1]} гравці` : `${m[1]} players`],
  [/^Игрок (\d+)$/u, (m, lang) => lang === 'uk' ? `Гравець ${m[1]}` : `Player ${m[1]}`],
  [/^Раунд (\d+)(.*)$/u, (m, lang) => `${translateText('Раунд', lang)} ${m[1]}${m[2]}`],
  [/^Счёт: (.*)$/u, (m, lang) => `${translateText('Счёт', lang)}: ${m[1]}`],
  [/^Ход: (.*)$/u, (m, lang) => `${translateText('Ход', lang)}: ${translateText(m[1], lang)}`],
  [/^(.*) · хочет в друзья$/u, (m, lang) => `${m[1]} · ${lang === 'uk' ? 'хоче додати в друзі' : 'wants to be friends'}`],
  [/^(.*) · (В сети|Не в сети|В матче)$/u, (m, lang) => `${m[1]} · ${translateText(m[2], lang)}`],
];

// The exact-key lookup avoids altering usernames, free text and numeric game state.
// Emoji prefixes are preserved on shared buttons (⚔️ Дуэль, ⭐ Задания, etc).
export function translateText(value, language = 'uk') {
  if (typeof value !== 'string' || language === 'ru' || !value) return value;
  const spaces = value.match(/^(\s*)([\s\S]*?)(\s*)$/u);
  if (!spaces) return value;
  const [, before, raw, after] = spaces;
  // JSX rules often include newlines or multiple spaces. Treat those as a
  // single readable phrase rather than expecting byte-for-byte whitespace.
  const collapsed = raw.replace(/\s+/gu, ' ').trim();
  const direct = normalized.get(raw)?.[language] || normalized.get(collapsed)?.[language];
  if (direct) return before + direct + after;
  const prefixed = collapsed.match(/^([\p{Extended_Pictographic}\uFE0F\u200D]+\s*)(.+)$/u);
  if (prefixed) {
    const inner = translateText(prefixed[2], language);
    if (inner !== prefixed[2]) return before + prefixed[1] + inner + after;
  }
  for (const [pattern, build] of templates) {
    const match = collapsed.match(pattern);
    if (match) return before + build(match, language) + after;
  }
  return value;
}
