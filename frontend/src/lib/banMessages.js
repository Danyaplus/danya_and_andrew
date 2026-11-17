// Player-visible access notices. Times use the user's selected language and timezone.
const text = {
  ru: {
    account: 'Ваш аккаунт заблокирован за нарушение правил.',
    ip: 'Доступ к платформе с этого IP-адреса заблокирован за нарушение правил.',
    permanent: 'Блокировка бессрочная. Доступ возможен только после разблокировки администратором.',
    temporary: 'Срок блокировки: с {start} до {end}.',
    reason: 'Причина',
    generic: 'Ваш доступ ограничен.',
  },
  uk: {
    account: 'Ваш акаунт заблоковано за порушення правил.',
    ip: 'Доступ до платформи з цієї IP-адреси заблоковано за порушення правил.',
    permanent: 'Блокування безстрокове. Доступ можливий лише після розблокування адміністратором.',
    temporary: 'Термін блокування: з {start} до {end}.',
    reason: 'Причина',
    generic: 'Ваш доступ обмежено.',
  },
  en: {
    account: 'Your account has been banned for violating the rules.',
    ip: 'Access from this public IP address has been banned for violating the rules.',
    permanent: 'This ban is permanent until an administrator lifts it.',
    temporary: 'Ban period: {start} to {end}.',
    reason: 'Reason',
    generic: 'Your access has been restricted.',
  },
};
export function accessBanMessage(payload, language = 'uk') {
  const lang = ['ru', 'uk', 'en'].includes(language) ? language : 'uk';
  const phrases = text[lang];
  const ban = payload?.ban || payload?.data?.ban || {};
  const cause = payload?.message || payload?.error || payload?.data?.error;
  if (!['IP_BANNED', 'ACCOUNT_BANNED'].includes(cause)) return '';
  const timestamp = value => value == null ? '—' : new Intl.DateTimeFormat(
    lang === 'uk' ? 'uk-UA' : lang === 'en' ? 'en-US' : 'ru-RU',
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(new Date(Number(value)));
  const period = ban.permanent || ban.endsAt == null
    ? phrases.permanent
    : phrases.temporary.replace('{start}', timestamp(ban.startAt)).replace('{end}', timestamp(ban.endsAt));
  // The free-form moderation reason is retained for administrators; do not
  // display untranslated text written in a different language to players.
  return `${cause === 'IP_BANNED' ? phrases.ip : phrases.account} ${period}`;
}
