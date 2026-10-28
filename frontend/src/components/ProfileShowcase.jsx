import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import { BadgeSymbol } from './AchievementsPanel.jsx';
import { useTranslation } from '../lib/i18n.jsx';
import { titleInfo, paidTitleEmoji } from '../lib/profileTitles.js';
import '../styles/profile-showcase.css';

const TEXT = {
  uk: {
    showcase: 'Моя вітрина', subtitle: 'Збирай медалі та титули. На профілі можна показати 3 медалі й 1 титул.',
    title: 'Титули', medals: 'Медалі', active: 'Встановлено', available: 'Моя колекція',
    empty: 'Ти ще не забрав жодної медалі. Отримай її в розділі «Нагороди».',
    pending: 'Відкриті, але ще не забрані медалі', claim: 'Спочатку забери медаль у розділі «Нагороди».',
    choose: 'Обрати', remove: 'Прибрати', locked: 'Ще не відкрито', bought: 'Придбано',
    shop: 'Придбати в магазині', saving: 'Зберігаємо…', save: 'Зберегти вибір', saved: 'Збережено!',
    error: 'Не вдалося зберегти. Спробуй ще раз.', loadError: 'Не вдалося завантажити вітрину.',
    edit: 'Змінити вітрину', noTitle: 'Титул не вибраний', slots: 'Можна вибрати максимум три медалі', color: 'Колір вибраного титулу', notEarned: 'Ще не отримані медалі',
  },
  ru: {
    showcase: 'Моя витрина', subtitle: 'Собирай медали и титулы. В профиле можно показать 3 медали и 1 титул.',
    title: 'Титулы', medals: 'Медали', active: 'Выставлено', available: 'Моя коллекция',
    empty: 'Ты ещё не забрал ни одной медали. Получи её в разделе «Награды».',
    pending: 'Открытые, но ещё не забранные медали', claim: 'Сначала забери медаль в разделе «Награды».',
    choose: 'Выбрать', remove: 'Убрать', locked: 'Ещё не открыто', bought: 'Куплено',
    shop: 'Купить в магазине', saving: 'Сохраняем…', save: 'Сохранить выбор', saved: 'Сохранено!',
    error: 'Не удалось сохранить. Попробуй ещё раз.', loadError: 'Не удалось загрузить витрину.',
    edit: 'Изменить витрину', noTitle: 'Титул не выбран', slots: 'Можно выбрать максимум три медали', color: 'Цвет выбранного титула', notEarned: 'Ещё не полученные медали',
  },
  en: {
    showcase: 'My showcase', subtitle: 'Collect medals and titles. Display 3 medals and 1 title on your profile.',
    title: 'Titles', medals: 'Medals', active: 'Equipped', available: 'My collection',
    empty: 'You have not claimed a medal yet. Claim one from Achievements first.',
    pending: 'Unlocked but not claimed', claim: 'Claim this medal in Achievements before showcasing it.',
    choose: 'Select', remove: 'Remove', locked: 'Not unlocked', bought: 'Purchased',
    shop: 'Buy in shop', saving: 'Saving…', save: 'Save choices', saved: 'Saved!',
    error: 'Could not save. Please try again.', loadError: 'Could not load the showcase.',
    edit: 'Edit showcase', noTitle: 'No title selected', slots: 'You can feature at most three medals', color: 'Selected title color', notEarned: 'Medals not yet earned',
  },
};

const colorsKey = (colors = {}) => JSON.stringify(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b)));

export function useProfileShowcase(token, active) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const reload = useCallback(async () => {
    if (!token || !active) return;
    try {
      const response = await apiRequest('/api/profile/showcase', { token });
      setData(response);
      setLoadFailed(false);
    } catch { setLoadFailed(true); }
    finally { setLoading(false); }
  }, [token, active]);

  useEffect(() => {
    if (!active || !token) { setData(null); setLoading(false); return undefined; }
    setLoading(true);
    reload();
  }, [active, token, reload]);

  useEffect(() => {
    if (!active || !token) return undefined;
    socket.on('progress:updated', reload);
    socket.on('friends:changed', reload);
    socket.on('showcase:updated', reload);
    return () => {
      socket.off('progress:updated', reload);
      socket.off('friends:changed', reload);
      socket.off('showcase:updated', reload);
    };
  }, [active, token, reload]);

  return { data, setData, loading, loadFailed, reload };
}

export function ShowcaseBanner({ data, language, onOpenAwards }) {
  const { t } = useTranslation();
  const labels = TEXT[language] || TEXT.uk;
  const title = data?.titleId && data.titleId !== 'none' ? titleInfo(language, data.titleId)[0] : '';
  const titleColor = data?.titleColors?.[data?.titleId] || '#FFE3A2';
  const picks = (data?.badgeIds || []).map((id) => data?.badges?.find((badge) => badge.id === id)).filter(Boolean);
  return (
    <div className="kd-showcase-banner">
      {title && <button type="button" className="kd-showcase-title" style={{"--title-accent":titleColor}} onClick={onOpenAwards} title={labels.edit}>✦ {title}</button>}
      <div className="kd-showcase-trio" aria-label={labels.medals}>
        {Array.from({ length: 3 }, (_, i) => {
          const badge = picks[i];
          return badge
            ? <button type="button" className="kd-showcase-medal" key={badge.id} title={t(badge.title)} onClick={onOpenAwards} aria-label={t(badge.title)}><BadgeSymbol icon={badge.icon} unlocked /></button>
            : <button type="button" className="kd-showcase-medal kd-showcase-medal--empty" key={`empty-${i}`} onClick={onOpenAwards} title={labels.edit} aria-label={labels.edit}>+</button>;
        })}
      </div>
    </div>
  );
}

export function ShowcaseEditor({ token, data, setData, loading, loadFailed, language, onOpenAwards, onOpenShop }) {
  const { t } = useTranslation();
  const labels = TEXT[language] || TEXT.uk;
  const [titleId, setTitleId] = useState('none');
  const [badgeIds, setBadgeIds] = useState([]);
  const [titleColors, setTitleColors] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const medalListRef = useRef(null);

  useEffect(() => {
    setTitleId(data?.titleId || 'none');
    setBadgeIds(data?.badgeIds || []);
    setTitleColors(data?.titleColors || {});
  }, [data]);

  const toggleBadge = (id) => {
    setNotice('');
    setBadgeIds((prev) => prev.includes(id)
      ? prev.filter((item) => item !== id)
      : prev.length >= 3 ? prev : [...prev, id]);
  };
  const changed = Boolean(data) && (titleId !== data.titleId || badgeIds.join('|') !== (data.badgeIds || []).join('|') || colorsKey(titleColors) !== colorsKey(data.titleColors || {}));
  const save = async () => {
    if (!token || !changed || saving) return;
    setSaving(true);
    setNotice('');
    try {
      const next = await apiRequest('/api/profile/showcase', { token, method: 'PATCH', body: { titleId, badgeIds, titleColors } });
      setData(next);
      setNotice(labels.saved);
    } catch { setNotice(labels.error); }
    finally { setSaving(false); }
  };

  const badges = data?.badges || [];
  const activeBadges = badgeIds.map((id) => badges.find((b) => b.id === id)).filter(Boolean);
  const remainingBadges = badges.filter((badge) => !badgeIds.includes(badge.id));
  const unlockedTitles = (data?.titles || []).filter((title) => title.unlocked);
  const inactiveTitles = (data?.titles || []).filter((title) => !title.unlocked);
  const renderMedal = (badge, selected) => <button key={badge.id} type="button"
    className={`kd-showcase-choice ${selected ? 'is-selected' : ''}`}
    onClick={() => toggleBadge(badge.id)} aria-pressed={selected} title={t(badge.description)}>
    <BadgeSymbol icon={badge.icon} unlocked />
    <span>{t(badge.title)}</span>
    <small>{selected ? `${labels.active} · ${badgeIds.indexOf(badge.id) + 1}` : labels.choose}</small>
  </button>;
  const renderTitle = (title) => {
    const [name, description] = titleInfo(language, title.id);
    const selected = titleId === title.id;
    return <button key={title.id} type="button" disabled={!title.unlocked}
      style={{'--title-accent': titleColors[title.id] || '#DDBB6B'}}
      className={`kd-showcase-title-card ${selected ? 'is-selected' : ''} ${!title.unlocked ? 'is-locked' : ''}`}
      onClick={() => { setTitleId(title.id); setNotice(''); }} aria-pressed={selected}>
      <span className="kd-showcase-title-card__icon">{paidTitleEmoji[title.id] || (title.id === 'none' ? '—' : '✦')}</span>
      <span className="kd-showcase-title-card__body"><strong>{name}</strong><small>{description}</small>
        {title.price > 0 && title.owned && <em>{labels.bought}</em>}</span>
      <span className="kd-showcase-title-card__state">{selected ? `✓ ${labels.active}` : title.unlocked ? labels.choose : '🔒'}</span>
    </button>;
  };

  return <section className="kd-showcase-editor" aria-label={labels.showcase}>
    <div className="kd-showcase-editor__heading"><div><h3>✦ {labels.showcase}</h3><p>{labels.subtitle}</p></div><span>{badgeIds.length}/3</span></div>
    {loading && !data && <p className="kd-showcase-muted">…</p>}
    {loadFailed && !data && <p className="kd-showcase-muted" role="alert">{labels.loadError}</p>}
    {data && <>
      <div className="kd-showcase-editor__subhead"><strong>🏅 {labels.medals}</strong><small>{labels.active}: {badgeIds.length}/3</small></div>
      <div className="kd-showcase-active-medals">
        {Array.from({ length: 3 }, (_, i) => {
          const badge = activeBadges[i];
          return badge ? <button type="button" key={badge.id} className="kd-showcase-active-slot" onClick={() => toggleBadge(badge.id)} title={labels.remove}>
            <BadgeSymbol icon={badge.icon} unlocked /><span>{t(badge.title)}</span><b>×</b>
          </button> : <button type="button" className="kd-showcase-active-slot is-empty" key={`slot${i}`} title={labels.choose} aria-label={labels.choose} onClick={() => medalListRef.current?.scrollIntoView({behavior:'smooth', block:'center'})}>+</button>;
        })}
      </div>
      <div className="kd-showcase-editor__subhead"><strong>{labels.available}</strong><small>{badges.length}</small></div>
      <div className="kd-showcase-editor__badges" ref={medalListRef}>
        {activeBadges.map((badge) => renderMedal(badge, true))}
        {remainingBadges.map((badge) => renderMedal(badge, false))}
        {!badges.length && <p className="kd-showcase-muted">{labels.empty} <button type="button" className="kd-showcase-inline-link" onClick={onOpenAwards}>{labels.medals} ↗</button></p>}
      </div>
      {!!data.pendingBadges?.length && <div className="kd-showcase-pending">
        <strong>{labels.pending}</strong>
        <div className="kd-showcase-pending-list kd-showcase-pending-cards">{data.pendingBadges.map((badge) => <div className="kd-showcase-pending-card" key={badge.id} title={labels.claim}><BadgeSymbol icon={badge.icon} unlocked /><span>{t(badge.title)}</span></div>)}</div>
        <button type="button" className="kd-showcase-inline-link" onClick={onOpenAwards}>{labels.claim} ↗</button>
      </div>}
      {!!data.lockedBadges?.length && <details className="kd-showcase-locked-medals"><summary>{labels.notEarned} ({data.lockedBadges.length})</summary>
        <div className="kd-showcase-editor__badges">{data.lockedBadges.map((badge) => <div key={badge.id} className="kd-showcase-choice is-locked" title={t(badge.description)}>
          <BadgeSymbol icon={badge.icon} unlocked={false} /><span>{t(badge.title)}</span><small>{badge.progress}/{badge.target}</small>
        </div>)}</div>
      </details>}
      <div className="kd-showcase-editor__subhead"><strong>👑 {labels.title}</strong><small>1</small></div>
      <div className="kd-showcase-titles-list">{unlockedTitles.filter((title) => title.id === titleId).map(renderTitle)}
        {unlockedTitles.filter((title) => title.id !== titleId).map(renderTitle)}</div>
      {titleId !== 'none' && unlockedTitles.some((title) => title.id === titleId) && <div className="kd-showcase-color-panel">
        <label htmlFor="kd-showcase-title-color">🎨 {labels.color}</label>
        <div className="kd-showcase-color-controls"><input id="kd-showcase-title-color" type="color" value={titleColors[titleId] || '#DDBB6B'}
          onChange={(e) => {setTitleColors((prev) => ({...prev,[titleId]:e.target.value.toUpperCase()}));setNotice('');}} />
          {['#F0C75A','#4BE2AD','#75B9FF','#F586DF','#FFFFFF'].map((hex) => <button key={hex} type="button" className="kd-showcase-color-dot" style={{'--swatch':hex}} title={hex} aria-label={hex} onClick={() => {setTitleColors((prev) => ({...prev,[titleId]:hex}));setNotice('');}} />)}
          <span className="kd-showcase-color-hex">{titleColors[titleId] || '#DDBB6B'}</span></div>
      </div>}
      {inactiveTitles.length > 0 && <div className="kd-showcase-locked-titles"><strong>{labels.locked}</strong>
        <div className="kd-showcase-titles-list">{inactiveTitles.map(renderTitle)}</div>
        {inactiveTitles.some((title) => title.price > 0) && <button type="button" className="kd-showcase-inline-link" onClick={onOpenShop}>{labels.shop} ↗</button>}
      </div>}
      <div className="kd-showcase-editor__footer"><button type="button" className="kd-showcase-save" onClick={save} disabled={!changed || saving}>{saving ? labels.saving : labels.save}</button>
        {notice && <small role="status">{notice}</small>}
      </div>
    </>}
  </section>;
}
