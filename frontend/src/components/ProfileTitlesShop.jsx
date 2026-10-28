import { useState } from 'react';
import { apiRequest } from '../lib/socket.js';
import { titleInfo, paidTitleEmoji } from '../lib/profileTitles.js';
import '../styles/profile-showcase.css';

const COPY = {
  uk: { heading: 'Титули', intro: 'Купуй титули за CODI. Щоб встановити титул, перейди до своєї вітрини.',
    owned: '✓ Придбано', buying: 'Купуємо…', buy: 'Придбати', insufficient: 'Недостатньо CODI.',
    error: 'Не вдалося придбати титул.', bought: 'Титул придбано! Обрати його можна у вітрині.' },
  ru: { heading: 'Титулы', intro: 'Покупай титулы за CODI. Чтобы установить титул, перейди в свою витрину.',
    owned: '✓ Куплено', buying: 'Покупаем…', buy: 'Купить', insufficient: 'Недостаточно CODI.',
    error: 'Не удалось купить титул.', bought: 'Титул куплен! Выбери его в витрине.' },
  en: { heading: 'Titles', intro: 'Buy titles with CODI. You can equip them only in your Showcase.',
    owned: '✓ Purchased', buying: 'Purchasing…', buy: 'Buy', insufficient: 'Not enough CODI.',
    error: 'Could not purchase the title.', bought: 'Title purchased! Equip it from your Showcase.' },
};

export default function ProfileTitlesShop({ token, data, language, onPurchased, onShopChange }) {
  const copy = COPY[language] || COPY.uk;
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState('');
  const paid = (data?.titles || []).filter((item) => item.price > 0);

  const buy = async (title) => {
    if (busy || title.owned || !token) return;
    setBusy(title.id);
    setNotice('');
    try {
      await apiRequest('/api/profile/titles/buy', { token, method: 'POST', body: { titleId: title.id } });
      const shop = await apiRequest('/api/shop/me', { token });
      onShopChange?.(shop);
      await onPurchased?.();
      setNotice(copy.bought);
    } catch (error) {
      setNotice(error?.message === 'INSUFFICIENT_COINS' ? copy.insufficient
        : error?.message === 'TITLE_ALREADY_OWNED' ? copy.owned : copy.error);
      await onPurchased?.();
    } finally { setBusy(null); }
  };

  return <section className="kd-showcase-shop" aria-label={copy.heading}>
    <h3>👑 {copy.heading}</h3>
    <p>{copy.intro}</p>
    <div className="kd-showcase-shop__grid">{paid.map((title) => <article key={title.id} className="kd-showcase-shop__card">
      <span className="kd-showcase-shop__icon" aria-hidden="true">{paidTitleEmoji[title.id] || '👑'}</span>
      <strong>{titleInfo(language, title.id)[0]}</strong>
      <small>{title.price} CODI</small>
      {title.owned ? <span className="kd-showcase-shop__owned">{copy.owned}</span>
        : <button type="button" disabled={Boolean(busy)} onClick={() => buy(title)}>{busy === title.id ? copy.buying : `${copy.buy} · ${title.price} CODI`}</button>}
    </article>)}</div>
    {notice && <p role="status" className="kd-showcase-shop__notice">{notice}</p>}
  </section>;
}
