// User-selected UI appearance is local to the device. It does not affect account or games.
export const THEME_KEY = 'codumi-appearance-mode';
export const CARD_STYLE_KEY = 'codumi-card-style';

export function readAppearanceMode() {
  const saved = localStorage.getItem(THEME_KEY);
  return ['auto', 'light', 'dark'].includes(saved) ? saved : 'auto';
}

export function readCardStyle() {
  const saved = localStorage.getItem(CARD_STYLE_KEY);
  return ['classic', 'glass', 'outline'].includes(saved) ? saved : 'classic';
}

export function kyivIsDay(date = new Date()) {
  // Kyiv always means Europe/Kyiv, including daylight-saving transitions.
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', hourCycle: 'h23',
  }).format(date));
  return hour >= 6 && hour < 18;
}

export function effectiveAppearance(mode, date = new Date()) {
  return mode === 'auto' ? (kyivIsDay(date) ? 'light' : 'dark') : mode;
}
