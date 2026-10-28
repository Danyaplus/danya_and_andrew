// Shared UI labels; actual ownership, unlock conditions and prices are enforced by the backend.
const CONTENT = {
  uk: {
    none: ['Без титулу', 'Не показувати титул'], newcomer: ['Новачок Kodumi', 'За реєстрацію'],
    'first-victory': ['Переможець', 'Здобудь першу перемогу'],
    'rising-star': ['Висхідна зірка', 'Виграй 5 матчів'],
    veteran: ['Ветеран арени', 'Виграй 30 матчів'],
    'arena-legend': ['Легенда Kodumi', 'Виграй 100 матчів'],
    explorer: ['Дослідник ігор', 'Переможи у 3 різних іграх'],
    collector: ['Колекціонер', 'Переможи у 7 різних іграх'],
    'friend-of-all': ['Душа компанії', 'Додай 10 друзів'],
    'royal-strategist': ['Королівський стратег', 'Преміальний титул'],
    'neon-champion': ['Неоновий чемпіон', 'Преміальний титул'],
    'night-owl': ['Нічний гравець', 'Преміальний титул'],
    'golden-player': ['Золотий гравець', 'Преміальний титул'],
  },
  ru: {
    none: ['Без титула', 'Не показывать титул'], newcomer: ['Новичок Kodumi', 'За регистрацию'],
    'first-victory': ['Победитель', 'Одержи первую победу'],
    'rising-star': ['Восходящая звезда', 'Выиграй 5 матчей'],
    veteran: ['Ветеран арены', 'Выиграй 30 матчей'],
    'arena-legend': ['Легенда Kodumi', 'Выиграй 100 матчей'],
    explorer: ['Исследователь игр', 'Победи в 3 разных играх'],
    collector: ['Коллекционер', 'Победи в 7 разных играх'],
    'friend-of-all': ['Душа компании', 'Добавь 10 друзей'],
    'royal-strategist': ['Королевский стратег', 'Премиальный титул'],
    'neon-champion': ['Неоновый чемпион', 'Премиальный титул'],
    'night-owl': ['Ночной игрок', 'Премиальный титул'],
    'golden-player': ['Золотой игрок', 'Премиальный титул'],
  },
  en: {
    none: ['No title', 'Hide your title'], newcomer: ['Kodumi Rookie', 'Create an account'],
    'first-victory': ['Victor', 'Win your first match'],
    'rising-star': ['Rising Star', 'Win 5 matches'],
    veteran: ['Arena Veteran', 'Win 30 matches'],
    'arena-legend': ['Kodumi Legend', 'Win 100 matches'],
    explorer: ['Game Explorer', 'Win in 3 different games'],
    collector: ['Collector', 'Win in 7 different games'],
    'friend-of-all': ['Social Star', 'Make 10 friends'],
    'royal-strategist': ['Royal Strategist', 'Premium title'],
    'neon-champion': ['Neon Champion', 'Premium title'],
    'night-owl': ['Night Owl', 'Premium title'],
    'golden-player': ['Golden Player', 'Premium title'],
  },
};
export const titleInfo = (language, id) => (CONTENT[language] || CONTENT.uk)[id] || [id, ''];
export const paidTitleEmoji = {
  'royal-strategist': '👑', 'neon-champion': '⚡', 'night-owl': '🌙', 'golden-player': '🏆',
};

import paidTitles from '../../../shared/paidTitles.json';
export const PAID_TITLES = paidTitles;
