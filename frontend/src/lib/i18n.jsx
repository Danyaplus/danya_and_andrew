import { createContext, useContext } from 'react';
import { translateText } from './translations.js';

export const DEFAULT_LANGUAGE = 'uk';
export const LANGUAGES = ['uk', 'ru', 'en'];
export const languageStorageKey = 'kodumi-language';
const LanguageContext = createContext({ language: DEFAULT_LANGUAGE, setLanguage() {} });

export function languageFromPath() {
  const base = import.meta.env.BASE_URL;
  const pathname = window.location.pathname;
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//u, '');
  const prefix = relative.split('/')[0];
  // The URL is the source of truth for public language pages (indexing).
  return LANGUAGES.includes(prefix) ? prefix : DEFAULT_LANGUAGE;
}

export function saveLanguage(language) {
  if (!LANGUAGES.includes(language)) return;
  try { localStorage.setItem(languageStorageKey, language); } catch (_) { /* disabled storage */ }
  document.documentElement.lang = language;
}

export function setLocalizedPath(language) {
  const base = import.meta.env.BASE_URL;
  const currentPath = window.location.pathname;
  const expected = `${base}${language === 'uk' ? '' : `${language}/`}`;
  if (currentPath !== expected) {
    window.history.replaceState(window.history.state, '', `${expected}${window.location.search}${window.location.hash}`);
  }
}

export function LanguageProvider({ language, setLanguage, children }) {
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }
export function useTranslation() {
  const { language, setLanguage } = useLanguage();
  return { language, setLanguage, t: (text) => translateText(text, language) };
}
