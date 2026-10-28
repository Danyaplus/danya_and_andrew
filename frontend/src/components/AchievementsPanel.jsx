import { useEffect, useMemo, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import { useTranslation } from '../lib/i18n.jsx';
import '../styles/achievements.css';

const ICONS = {
  star: <path d="m12 2 3.1 6.4 7.1 1-5.1 5 1.2 7-6.3-3.3-6.3 3.3 1.2-7-5.1-5 7.1-1z" />,
  flag: <><path d="M5 22V3"/><path d="M5 4c5-3 7 3 14 0v10c-7 3-9-3-14 0z"/></>,
  bolt: <path d="M13 2 4 14h7l-1 8 10-13h-7z" />,
  shield: <path d="M12 2 4 5v7c0 5.2 3 8.2 8 10 5-1.8 8-4.8 8-10V5z" />,
  crown: <path d="m3 7 5 4 4-7 4 7 5-4-2 12H5zM5 22h14" />,
  medal: <><path d="m7 2 5 7 5-7h4l-6 10H9L3 2z"/><circle cx="12" cy="16" r="6"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 4 5"/></>,
  heart: <path d="M20.6 5.6a5 5 0 0 0-7.1 0L12 7l-1.5-1.4a5 5 0 1 0-7.1 7.1L12 21l8.6-8.3a5 5 0 0 0 0-7.1Z"/>,
  sparkles: <><path d="m12 2 2 7 7 3-7 2-2 8-2-8-7-2 7-3z"/><path d="m20 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></>,
  compass: <><circle cx="12" cy="12" r="10"/><path d="m15.5 8.5-2.8 5.7-4.2 1.3 1.2-5z"/></>,
  gem: <><path d="M6 3h12l5 7-11 12L1 10z"/><path d="m1 10 11 12 4-12-4-7-4 7 4 12M1 10h22"/></>,
  trophy: <><path d="M7 4h10v9a5 5 0 0 1-10 0zM7 6H3v3c0 3 2 5 5 5M17 6h4v3c0 3-2 5-5 5M12 18v3M7 22h10"/></>,
};

export function BadgeSymbol({ icon, unlocked }) {
  return (
    <span className={`ach-medal ${unlocked ? 'is-gold' : 'is-locked'}`} aria-hidden="true">
      <span className="ach-medal__ribbon ach-medal__ribbon--left" />
      <span className="ach-medal__ribbon ach-medal__ribbon--right" />
      <span className="ach-medal__disc">
        {unlocked ? <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon] || ICONS.star}</svg> : <strong>?</strong>}
      </span>
    </span>
  );
}

function TrophyPlaceholder({ name, type }) {
  return (
    <div className={`ach-cup ach-cup--${type}`}>
      <span className="ach-cup__illustration" aria-hidden="true">
        <svg viewBox="0 0 92 96" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 10h36v34a18 18 0 0 1-36 0V10Z"/>
          <path d="M28 17H13v10c0 13 7 20 20 21M64 17h15v10c0 13-7 20-20 21"/>
          <path d="M46 63v14M32 83h28M26 89h40"/>
          <path d="m46 21 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="currentColor" stroke="none" opacity=".42"/>
        </svg>
      </span>
      <strong>{name}</strong>
      <small>Скоро</small>
    </div>
  );
}

export default function AchievementsPanel({ token }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiRequest('/api/achievements/me', { token }).then((response) => {
      if (active) setData(response);
    }).catch(() => {
      if (active) setError('Не удалось загрузить достижения. Проверь подключение и обновление базы данных.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, refresh]);

  useEffect(() => {
    if (!token) return undefined;
    const update = () => setRefresh((value) => value + 1);
    socket.on('progress:updated', update);
    socket.on('friends:changed', update);
    window.addEventListener('focus', update);
    return () => {
      socket.off('progress:updated', update);
      socket.off('friends:changed', update);
      window.removeEventListener('focus', update);
    };
  }, [token]);

  async function claimSelectedBadge() {
    const badge = data?.badges?.find((item) => item.id === selectedId);
    if (!token || !badge?.canClaim || claiming) return;
    setClaiming(true);
    setClaimMessage('');
    try {
      const response = await apiRequest('/api/achievements/claim', {
        token, method: 'POST', body: { badgeId: badge.id },
      });
      setClaimMessage(response.xpEarned ? `🎉 +${response.xpEarned} XP получено!` : 'Ты уже получал эту награду.');
      setRefresh((count) => count + 1);
    } catch {
      setClaimMessage('Не удалось забрать награду. Попробуй ещё раз позднее.');
      setRefresh((count) => count + 1);
    } finally { setClaiming(false); }
  }

  const badges = data?.badges || [];
  const filtered = useMemo(() => badges.filter((badge) => filter === 'all' || (filter === 'unlocked' ? badge.unlocked : !badge.unlocked)), [badges, filter]);
  const selected = badges.find((badge) => badge.id === selectedId) || null;

  return (
    <div className="ach-page">
      <div className="ach-hero">
        <div className="ach-hero__copy">
          <span className="ach-eyebrow">CODUMI • КОЛЛЕКЦИЯ</span>
          <h3>Мои награды <span aria-hidden="true">✦</span></h3>
          <p>Выполняй задания, собирай медали и открывай новые достижения.</p>
        </div>
        <div className="ach-hero__counter" aria-label="Получено достижений">
          <strong>{data?.unlockedCount ?? '—'}<i> / {data?.totalCount ?? '—'}</i></strong>
          <span>открыто</span>
        </div>
      </div>

      <section className="ach-trophy-section" aria-label="Витрина кубков">
        <div className="ach-section-title"><div><span className="ach-eyebrow">БУДУЩАЯ НАГРАДА</span><h4>Моя витрина кубков</h4></div><span className="ach-coming">Скоро</span></div>
        <div className="ach-trophy-shelf">
          <TrophyPlaceholder type="bronze" name="Бронзовый" />
          <TrophyPlaceholder type="silver" name="Серебряный" />
          <TrophyPlaceholder type="gold" name="Золотой" />
        </div>
        <p className="ach-trophy-note">Места для кубков уже готовы. Правила их получения добавим позже.</p>
      </section>

      <section className="ach-collection" aria-label="Достижения">
        <div className="ach-section-title"><div><span className="ach-eyebrow">КОЛЛЕКЦИЯ</span><h4>Достижения</h4></div><span className="ach-coming">В реальном времени</span></div>
        <div className="ach-filters" role="group" aria-label="Фильтр достижений">
          {[
            ['all', 'Все', badges.length],
            ['unlocked', 'Получены', data?.unlockedCount || 0],
            ['locked', 'Закрыты', Math.max(0, badges.length - (data?.unlockedCount || 0))],
          ].map(([id, label, count]) => <button type="button" key={id} className={filter === id ? 'is-active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} <span>{count}</span></button>)}
        </div>

        {loading && <div className="ach-loading" role="status">Загружаем твою коллекцию…</div>}
        {error && !loading && <div className="ach-error" role="alert">{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Попробовать ещё раз</button></div>}
        {!loading && !error && (
          <>
            <div className="ach-badge-grid">
              {filtered.map((badge) => (
                <button type="button" key={badge.id} className={`ach-badge ${badge.unlocked ? 'is-unlocked' : 'is-locked'} ${selectedId === badge.id ? 'is-selected' : ''}`} aria-pressed={selectedId === badge.id} onClick={() => { setClaimMessage(''); setSelectedId((old) => old === badge.id ? null : badge.id); }}>
                  <BadgeSymbol unlocked={badge.unlocked} icon={badge.icon} />
                  <strong>{t(badge.title)}</strong>
                  <span className="ach-badge__status">{badge.claimed ? '✓ XP забран' : badge.unlocked ? '✦ Открыто' : 'Закрыто'}</span>
                </button>
              ))}
            </div>
            {filtered.length === 0 && <div className="ach-empty">Здесь пока нет медалей. Они появятся после выполнения заданий.</div>}
            {selected && (
              <div className="ach-detail" aria-live="polite">
                <div><strong>{t(selected.title)}</strong><p>{t(selected.description)}</p></div>
                <div className="ach-detail__progress"><span>{selected.unlocked ? '✓ Выполнено' : `${selected.progress} / ${selected.target}`}</span><div><i style={{ width: `${Math.min(100, 100 * selected.progress / selected.target)}%` }} /></div></div>
                <div className="ach-detail__claim">
                  <strong>{selected.claimed ? `✓ ${selected.xpReward} XP уже получено` : `Награда: +${selected.xpReward} XP`}</strong>
                  {selected.canClaim && <button type="button" disabled={claiming} onClick={claimSelectedBadge}>{claiming ? 'Выдаём…' : 'Забрать награду'}</button>}
                  {!selected.unlocked && <small>Награда откроется после выполнения условия</small>}
                  {claimMessage && <small role="status">{claimMessage}</small>}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      <p className="ach-footer-note">Медали открываются автоматически. XP за каждую медаль можно получить один раз. Кубки пока не начисляются.</p>
    </div>
  );
}
