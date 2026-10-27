import { getGameById } from '../games/index.js';
import { translateText } from './translations.js';

// Public URLs have a different pathname for each language; # routes are internal.
// Build-time localized HTML provides metadata without requiring client-side JS.
const seo = {
  uk: {
    title: 'Kodumi Games — онлайн-ігри для двох',
    description: 'Kodumi Games — безкоштовні онлайн-ігри на двох. Обирай гру, знаходь суперника та грай у браузері в реальному часі.',
  },
  ru: {
    title: 'Kodumi Games — онлайн-игры на двоих',
    description: 'Kodumi Games — бесплатные онлайн-игры на двоих. Выбирай игру, находи соперника и играй в реальном времени прямо в браузере.',
  },
  en: {
    title: 'Kodumi Games — two-player online games',
    description: 'Kodumi Games offers free online games for two players. Pick a game, find an opponent and play together in real time.',
  },
};

function upsertMeta(name, content, attr = 'name') {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.append(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href, hreflang) {
  let el = [...document.querySelectorAll(`link[rel="${rel}"]`)].find((link) => hreflang ? link.hreflang === hreflang : !link.hreflang);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.append(el);
  }
  el.href = href;
}

export function setLocalizedMetadata(language, route) {
  const source = seo[language] || seo.uk;
  const game = route?.type === 'game' ? getGameById(route.gameId) : null;
  const gameTitle = game ? `${translateText(game.title, language)} — ${source.title}` : source.title;
  document.title = gameTitle;
  upsertMeta('description', source.description);
  upsertMeta('og:title', gameTitle, 'property');
  upsertMeta('og:description', source.description, 'property');
  upsertMeta('og:locale', ({ uk:'uk_UA', ru:'ru_RU', en:'en_US' })[language] || 'uk_UA', 'property');
  const siteBase = new URL(import.meta.env.BASE_URL, window.location.origin);
  const variants = {
    uk: new URL('', siteBase).href,
    ru: new URL('ru/', siteBase).href,
    en: new URL('en/', siteBase).href,
  };
  upsertLink('canonical', variants[language] || variants.uk);
  for (const lang of ['uk', 'ru', 'en']) upsertLink('alternate', variants[lang], lang);
  upsertLink('alternate', variants.uk, 'x-default');
}
