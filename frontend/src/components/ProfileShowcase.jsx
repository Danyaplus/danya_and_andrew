import { useCallback, useEffect, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import { BadgeSymbol } from './AchievementsPanel.jsx';
import { useTranslation } from '../lib/i18n.jsx';
import '../styles/profile-showcase.css';

const LABELS = {
  uk: {
    none: 'Без титулу', newcomer: 'Новачок Kodumi', 'first-victory': 'Переможець',
    'rising-star': 'Висхідна зірка', veteran: 'Ветеран арени', 'arena-legend': 'Легенда Kodumi',
    explorer: 'Дослідник ігор', collector: 'Колекціонер', 'friend-of-all': 'Душа компанії',
    showcase: 'Вітрина досягнень', pick: 'Обери титул та до трьох улюблених медалей.',
    title: 'Твій титул', badges: 'Улюблені нагороди', selected: 'Обрано',
    empty: 'Ще немає відкритих медалей.', save: 'Зберегти вітрину', saving: 'Зберігаємо…', saved: 'Збережено!',
    error: 'Не вдалося зберегти. Спробуй ще раз.', loadError: 'Не вдалося завантажити вітрину.',
    choose: 'Обери нагороди у вкладці «Нагороди»', available: 'Доступно після отримання нагороди',
  },
  ru: {
    none: 'Без титула', newcomer: 'Новичок Kodumi', 'first-victory': 'Победитель',
    'rising-star': 'Восходящая звезда', veteran: 'Ветеран арены', 'arena-legend': 'Легенда Kodumi',
    explorer: 'Исследователь игр', collector: 'Коллекционер', 'friend-of-all': 'Душа компании',
    showcase: 'Витрина достижений', pick: 'Выбери титул и до трёх любимых медалей.',
    title: 'Твой титул', badges: 'Любимые награды', selected: 'Выбрано',
    empty: 'Пока нет открытых медалей.', save: 'Сохранить витрину', saving: 'Сохраняем…', saved: 'Сохранено!',
    error: 'Не удалось сохранить. Попробуй ещё раз.', loadError: 'Не удалось загрузить витрину.',
    choose: 'Выбери награды во вкладке «Награды»', available: 'Откроется после получения награды',
  },
  en: {
    none: 'No title', newcomer: 'Kodumi Rookie', 'first-victory': 'Victor',
    'rising-star': 'Rising Star', veteran: 'Arena Veteran', 'arena-legend': 'Kodumi Legend',
    explorer: 'Game Explorer', collector: 'Collector', 'friend-of-all': 'Social Star',
    showcase: 'Achievement showcase', pick: 'Choose a title and up to three favourite medals.',
    title: 'Your title', badges: 'Featured achievements', selected: 'Selected',
    empty: 'No unlocked medals yet.', save: 'Save showcase', saving: 'Saving…', saved: 'Saved!',
    error: 'Could not save. Please try again.', loadError: 'Could not load your showcase.',
    choose: 'Pick medals in the Achievements tab', available: 'Unlock the required achievement first',
  },
};

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
    } catch {
      setLoadFailed(true);
    } finally { setLoading(false); }
  }, [token, active]);

  useEffect(() => {
    if (!active || !token) { setData(null); setLoading(false); return undefined; }
    let alive = true;
    setLoading(true);
    setData(null);
    apiRequest('/api/profile/showcase', { token })
      .then((response) => { if (alive) { setData(response); setLoadFailed(false); } })
      .catch(() => { if (alive) setLoadFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token, active]);

  useEffect(() => {
    if (!active || !token) return undefined;
    socket.on('progress:updated', reload);
    socket.on('friends:changed', reload);
    return () => { socket.off('progress:updated', reload); socket.off('friends:changed', reload); };
  }, [active, token, reload]);

  return { data, setData, loading, loadFailed, reload };
}

export function ShowcaseBanner({ data, language, onOpenAwards }) {
  const { t } = useTranslation();
  const labels = LABELS[language] || LABELS.uk;
  const name = LABELS[language]?.[data?.titleId] || labels.none;
  const picks = (data?.badgeIds || []).map((id) => data?.badges?.find((badge) => badge.id === id)).filter(Boolean);
  return (
    <div className="kd-showcase-banner">
      {data?.titleId && data.titleId !== 'none' && <span className="kd-showcase-title" title={labels.title}>✦ {name}</span>}
      <div className="kd-showcase-trio" aria-label={labels.badges}>
        {Array.from({ length: 3 }, (_, i) => {
          const badge = picks[i];
          return badge
            ? <button type="button" className="kd-showcase-medal" key={badge.id} title={t(badge.title)} onClick={onOpenAwards} aria-label={t(badge.title)}><BadgeSymbol icon={badge.icon} unlocked /></button>
            : <button type="button" className="kd-showcase-medal kd-showcase-medal--empty" key={`empty-${i}`} onClick={onOpenAwards} title={labels.choose} aria-label={labels.choose}>+</button>;
        })}
      </div>
    </div>
  );
}

export function ShowcaseEditor({ token, data, setData, loading, loadFailed, language }) {
  const { t } = useTranslation();
  const labels = LABELS[language] || LABELS.uk;
  const [titleId, setTitleId] = useState('none');
  const [badgeIds, setBadgeIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setTitleId(data?.titleId || 'none');
    setBadgeIds(data?.badgeIds || []);
  }, [data?.titleId, data?.badgeIds]);

  const toggleBadge = (id) => {
    setNotice('');
    setBadgeIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : prev.length >= 3 ? prev : [...prev, id]);
  };
  const changed = Boolean(data) && (titleId !== data.titleId || badgeIds.join('|') !== (data.badgeIds || []).join('|'));

  const save = async () => {
    if (!token || !changed || saving) return;
    setSaving(true);
    setNotice('');
    try {
      const next = await apiRequest('/api/profile/showcase', { token, method: 'PATCH', body: { titleId, badgeIds } });
      setData(next);
      setNotice(labels.saved);
    } catch { setNotice(labels.error); }
    finally { setSaving(false); }
  };

  return (
    <section className="kd-showcase-editor" aria-label={labels.showcase}>
      <div className="kd-showcase-editor__heading">
        <div><h3>✦ {labels.showcase}</h3><p>{labels.pick}</p></div>
        <span>{badgeIds.length}/3</span>
      </div>
      {loading && <p className="kd-showcase-muted">…</p>}
      {loadFailed && !data && <p className="kd-showcase-muted">{labels.loadError}</p>}
      {data && <>
        <label className="kd-showcase-editor__title">
          <strong>{labels.title}</strong>
          <select value={titleId} onChange={(event) => { setTitleId(event.target.value); setNotice(''); }}>
            {(data.titles || []).map(({ id, unlocked }) => <option key={id} value={id} disabled={!unlocked}>{labels[id] || id}{!unlocked ? ' 🔒' : ''}</option>)}
          </select>
        </label>
        <div className="kd-showcase-editor__subhead"><strong>{labels.badges}</strong><small>{labels.selected}: {badgeIds.length}/3</small></div>
        <div className="kd-showcase-editor__badges">
          {(data.badges || []).map((badge) => {
            const selected = badgeIds.includes(badge.id);
            return <button type="button" key={badge.id} className={`kd-showcase-choice ${selected ? 'is-selected' : ''}`} onClick={() => toggleBadge(badge.id)} aria-pressed={selected} title={t(badge.description)}>
              <BadgeSymbol icon={badge.icon} unlocked />
              <span>{t(badge.title)}</span>
              {selected && <b>{badgeIds.indexOf(badge.id) + 1}</b>}
            </button>;
          })}
          {!data.badges?.length && <p className="kd-showcase-muted">{labels.empty}</p>}
        </div>
        <div className="kd-showcase-editor__footer">
          <button type="button" className="kd-showcase-save" onClick={save} disabled={!changed || saving}>{saving ? labels.saving : labels.save}</button>
          {notice && <small role="status">{notice}</small>}
        </div>
      </>}
    </section>
  );
}
