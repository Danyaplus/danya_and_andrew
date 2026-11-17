import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import { AdminPlayerActions, AdminBansList } from './AdminModerationPanel.jsx';
import { AdminLiveMatches, AdminCoinHistory, AdminSuspicious } from './AdminExtraPanels.jsx';

const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('ru-RU').format(n);
const dateFormat = (ms) => {
  if (!ms) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
};
const sidebar = [
  { id: 'overview', label: 'Обзор', icon: 'overview' },
  { id: 'games', label: 'Популярные игры', icon: 'games' },
  { id: 'matches', label: 'Активные матчи', icon: 'chart' },
  { id: 'players', label: 'Игроки', icon: 'players' },
  { id: 'moderation', label: 'Модерация', icon: 'shield' },
  { id: 'suspicious', label: 'Антифарм', icon: 'shield' },
];

function Icon({ name, size = 20 }) {
  const base = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const shapes = {
    overview: <><path d="M3.5 11 12 4l8.5 7v9H3.5Z" /><path d="M9 20v-7h6v7" /></>,
    games: <><rect x="3" y="6" width="18" height="12" rx="5" /><path d="M7 12h5m-2.5-2.5v5M16 10h.01M18 13h.01" /></>,
    players: <><circle cx="9" cy="9" r="3" /><path d="M3 20v-2c0-3 2.7-5.2 6-5.2s6 2.2 6 5.2v2" /><path d="M16.5 6a3 3 0 0 1 0 6m0 2c2.6 0 4.5 1.9 4.5 4v2" /></>,
    shield: <><path d="m12 2 8 4v6c0 4.6-2.8 8-8 10-5.2-2-8-5.4-8-10V6Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    chart: <><path d="M3 19h18M3 19V5" /><path d="m6 15 5-5 4 3 5-8" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" /><path d="M12 12h9m-4-4 4 4-4 4" /></>,
    back: <><path d="m14 5-7 7 7 7M7 12h13" /></>,
    refresh: <><path d="M20 7V3l-4 4" /><path d="M20 7a8 8 0 1 0 2 6" /></>,
    down: <path d="m6 9 6 6 6-6" />,
    coin: <><ellipse cx="12" cy="5.5" rx="7" ry="3" /><path d="M5 5.5V12c0 1.7 3 3 7 3s7-1.3 7-3V5.5M5 10c0 1.7 3 3 7 3s7-1.3 7-3M5 14v4c0 1.7 3 3 7 3s7-1.3 7-3v-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2c0-3.5 3.3-6 8-6s8 2.5 8 6v2" /></>,
    award: <><path d="M6 4h12v5a6 6 0 0 1-12 0V4ZM6 6H3v2a4 4 0 0 0 4 4M18 6h3v2a4 4 0 0 1-4 4M12 15v5m-5 0h10" /></>,
    star: <path d="m12 2 3.1 6.5L22 9.5l-5 4.9 1.2 7-6.2-3.4-6.2 3.4 1.2-7-5-4.9 6.9-1Z" />,
    inventory: <><path d="m12 2 9 5v10l-9 5-9-5V7Z" /><path d="m3 7 9 5 9-5M12 12v10" /></>,
  };
  return <svg {...base}>{shapes[name] || shapes.games}</svg>;
}
function GameImage({ game, className = '' }) {
  if (!game?.id) return null;
  return <img className={className} alt="" loading="lazy"
    src={`${import.meta.env.BASE_URL}images/games/${encodeURIComponent(game.id)}.webp`}
    onError={event => { event.currentTarget.style.display = 'none'; }} />;
}
function Avatar({ user, size = 'sm' }) {
  const label = user?.displayName || user?.username || 'Игрок';
  return <span className={`kc-avatar kc-avatar--${size}`} title={label}>
    {user?.avatar && user.avatar.startsWith('data:image/') ? <img src={user.avatar} alt="" loading="lazy" /> : label.slice(0, 2).toUpperCase()}
  </span>;
}
function Panel({ title, icon, right, className = '', children }) {
  return <section className={`kc-panel ${className}`}>
    <div className="kc-panel__heading"><h2>{icon ? <Icon name={icon} size={19} /> : null}{title}</h2>{right}</div>
    {children}
  </section>;
}
function Stat({ name, value, icon, note, tone = 'violet' }) {
  return <article className={`kc-stat kc-stat--${tone}`}>
    <div className="kc-stat__icon"><Icon name={icon} size={24} /></div>
    <div><span>{name}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div>
  </article>;
}
function ErrorBox({ error, onRetry }) {
  return <div className="kc-error" role="alert"><div><strong>Не удалось загрузить данные.</strong><p>{adminErrorText(error)}</p></div>{onRetry ? <button type="button" onClick={onRetry}>Повторить</button> : null}</div>;
}
function Graph({ data }) {
  const values = (data || []).map(d => Number(d.resultRecords) || 0);
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${26 + i * (620 / Math.max(1, values.length - 1))},${176 - (v / max) * 133}`).join(' ');
  return <div className="kc-graph">
    {values.length ? <svg role="img" aria-label="Результаты матчей по дням" viewBox="0 0 680 195" preserveAspectRatio="none">
      {[40,85,130,175].map(y => <line key={y} x1="26" y1={y} x2="646" y2={y} stroke="rgba(190,164,255,.12)" />)}
      <polyline points={points} fill="none" stroke="#bf83ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v,i) => <circle key={i} cx={26 + i * (620 / Math.max(1, values.length - 1))} cy={176 - (v/max) * 133} r="5" fill="#c98dff" stroke="#412f6a" strokeWidth="2" />)}
    </svg> : <p className="kc-subtle">Нет данных за выбранный период</p>}
    <div className="kc-graph__days">{(data || []).map(d => <span key={d.date}>{d.date.slice(5)}</span>)}</div>
  </div>;
}

export default function AdminDashboard({ token, onSignOut }) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewReload, setOverviewReload] = useState(0);
  const [players, setPlayers] = useState([]);
  const [playersTotal, setPlayersTotal] = useState(0);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [expandedGames, setExpandedGames] = useState(false);
  const [showCoinHistory, setShowCoinHistory] = useState(false);
  const [autoLoad, setAutoLoad] = useState(false);
  const sentinel = useRef(null);
  const [playersReload, setPlayersReload] = useState(0);
  const [profileReload, setProfileReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setOverviewLoading(true);
    adminRequest('overview', { token }).then(data => { if (alive) { setOverview(data); setOverviewError(null); } })
      .catch(err => { if (alive) setOverviewError(err); })
      .finally(() => { if (alive) setOverviewLoading(false); });
    return () => { alive = false; };
  }, [token, overviewReload]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (tab !== 'players') return;
    let alive = true;
    setPlayersLoading(true);
    setPlayersError(null);
    adminRequest(`players?offset=0&limit=100&q=${encodeURIComponent(query)}`, { token })
      .then(data => { if (alive) { setPlayers(data.players || []); setPlayersTotal(data.total ?? 0); } })
      .catch(err => { if (alive) setPlayersError(err); })
      .finally(() => { if (alive) setPlayersLoading(false); });
    return () => { alive = false; };
  }, [token, tab, query, playersReload]);

  const loadMore = useCallback(() => {
    if (playersLoading || !players.length || players.length >= playersTotal) return;
    setPlayersLoading(true);
    setPlayersError(null);
    adminRequest(`players?offset=${players.length}&limit=100&q=${encodeURIComponent(query)}`, { token })
      .then(data => setPlayers(prev => [...prev, ...(data.players || []).filter(item => !prev.some(p => p.id === item.id))]))
      .catch(setPlayersError)
      .finally(() => setPlayersLoading(false));
  }, [playersLoading, players, playersTotal, query, token]);

  useEffect(() => {
    if (tab !== 'players' || !autoLoad || !sentinel.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: '240px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [tab, autoLoad, loadMore]);

  useEffect(() => {
    if (tab !== 'profile' || !playerId) return;
    let alive = true;
    setProfileLoading(true);
    setProfile(null);
    setProfileError(null);
    adminRequest(`players/${encodeURIComponent(playerId)}`, { token })
      .then(data => { if (alive) setProfile(data.player); })
      .catch(err => { if (alive) setProfileError(err); })
      .finally(() => { if (alive) setProfileLoading(false); });
    return () => { alive = false; };
  }, [playerId, tab, token, profileReload]);

  const openProfile = (id) => { setPlayerId(id); setExpandedGames(false); setShowCoinHistory(false); setTab('profile'); };
  const refreshProfile = () => { setProfileReload(v => v+1); setPlayersReload(v => v+1); };
  const title = tab === 'overview' ? 'Обзор платформы' : tab === 'games' ? 'Популярные игры' : tab === 'matches' ? 'Активные матчи' : tab === 'suspicious' ? 'Подозрительные игроки' : tab === 'players' ? 'Игроки' : tab === 'profile' ? 'Профиль игрока' : 'Модерация';
  const subtitle = tab === 'overview' ? 'Активность платформы и реальные данные.' : tab === 'games' ? 'Самые популярные игры по сохранённым результатам матчей.' : tab === 'matches' ? 'Идущие сейчас игры и безопасное наблюдение за матчами.' : tab === 'suspicious' ? 'Повторяющиеся пары и необычные серии результатов — только для ручной проверки.' : tab === 'players' ? 'Поиск, монеты, опыт и последние подключения.' : tab === 'profile' ? 'Подробная информация об аккаунте и его прогрессе.' : 'Раздел управления нарушениями.';
  const noActivity = !overview?.sampledResultRecords;

  const stats = <div className="kc-stats">
    <Stat name="Зарегистрировано" icon="players" value={fmt(overview?.totalUsers)} note="За всё время" />
    <Stat name="Сейчас онлайн" icon="chart" value={fmt(overview?.onlineUsers)} note="Авторизованные подключения" tone="blue" />
    <Stat name="Новых за 7 дней" icon="user" value={fmt(overview?.newUsers7d)} note="Зарегистрированные пользователи" />
    <Stat name="Записей результатов" icon="games" value={fmt(overview?.totalResultRecords)} note="Результаты игроков в базе" tone="gold" />
  </div>;

  return <div className="kc-admin">
    <aside className="kc-sidebar">
      <div className="kc-brand"><div className="kc-brand__icon"><Icon name="games" size={29} /></div><span>Kodumi <b>Games</b></span></div>
      <div className="kc-sidebar__caption">CONTROL CENTER</div>
      <nav aria-label="Управление платформой">
        {sidebar.map(item => <button type="button" key={item.id}
          className={`kc-navbtn ${item.id === tab || (tab === 'profile' && item.id === 'players') ? 'kc-navbtn--active' : ''}`}
          onClick={() => setTab(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}
      </nav>
      <div className="kc-sidebar__footer"><span className="kc-active-dot" />Admin access<div className="kc-subtle">Защищённый доступ</div></div>
    </aside>
    <main className="kc-main">
      <header className="kc-topbar">
        <div><div className="kc-topbar__eyebrow">ADMINISTRATION <span>•</span> KODUMI GAMES</div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="kc-topbar__actions"><span className="kc-admin-tag"><span className="kc-active-dot" /> Администратор</span><button type="button" title="Выйти из админки" onClick={onSignOut}><Icon name="logout" size={17}/> Выйти</button></div>
      </header>
      <div className="kc-preview-note"><Icon name="shield" size={16}/> Данные поступают с сервера. Блокировки, баланс и удаление доступны только после установки SQL-миграции в Supabase.</div>
      {overviewError && (tab === 'overview' || tab === 'games') ? <ErrorBox error={overviewError} onRetry={() => setOverviewReload(v => v + 1)} /> : null}
      {overviewLoading && (tab === 'overview' || tab === 'games') ? <div className="kc-loading">Загрузка статистики…</div> : null}
      {overview && tab === 'overview' ? <>
        {stats}
        <div className="kc-contentgrid">
          <Panel title="Игра №1" icon="star" className="kc-contentgrid__wide">
            {noActivity ? <div className="kc-empty">Пока нет сохранённых результатов игр.</div> : <div className="kc-hero">
              <GameImage game={overview.topGames[0]} className="kc-hero__background" />
              <div><span>Лидер по сохранённым результатам</span><strong>{overview.topGames[0]?.name}</strong><small>{fmt(overview.topGames[0]?.resultRecords)} записей в выборке</small></div>
              <span className="kc-hero__icon"><Icon name="star" size={54}/></span>
            </div>}
          </Panel>
          <Panel title="Активность за 7 дней" icon="chart" className="kc-contentgrid__narrow">
            <Graph data={overview.dailyRecords} />
            <p className="kc-subtle">По последним {fmt(overview.sampledResultRecords)} записям результатов — не статистика посещений.</p>
          </Panel>
          <Panel title="Топ игр" icon="games" className="kc-contentgrid__wide" right={<button className="kc-textbutton" onClick={() => setTab('games')}>Полный рейтинг →</button>}>
            <div className="kc-ranklist">{overview.topGames.slice(0, 5).map((game, i) => <div className="kc-rankrow" key={game.id}><b className="kc-rankrow__position">{i + 1}</b><span className="kc-rankrow__image"><GameImage game={game} /></span><strong>{game.name}</strong><span>{fmt(game.resultRecords)} результатов</span></div>)}{noActivity ? <p className="kc-subtle">Нет записей</p> : null}</div>
          </Panel>
          <Panel title="Состояние системы" icon="shield" className="kc-contentgrid__narrow">
            <div className="kc-system"><span className="kc-active-dot"/> Статистика доступна</div>
            <div className="kc-system"><Icon name="players" size={17}/> {fmt(overview.onlineUsers)} пользователей в сети</div>
            <div className="kc-system"><Icon name="games" size={17}/> {fmt(overview.gameCount)} игр в каталоге</div>
            <div className="kc-system"><Icon name="clock" size={17}/> Данные на {dateFormat(overview.updatedAt)}</div>
          </Panel>
        </div>
      </> : null}
      {overview && tab === 'games' ? <>
        <div className="kc-stats kc-stats--two"><Stat name="Игр в каталоге" value={fmt(overview.gameCount)} icon="games"/><Stat name="Выборка результатов" value={fmt(overview.sampledResultRecords)} icon="chart" note={`Последние ${fmt(overview.sampleLimit)} записей максимум`}/></div>
        <Panel title="Топ-3 игры" icon="award"><div className="kc-top-three">{overview.topGames.slice(0, 3).map((game, index) => (
          <article className={`kc-top-game kc-top-game--${index + 1}`} key={game.id}>
            <GameImage game={game} className="kc-top-game__image" />
            <div className="kc-top-game__rank">{['🥇','🥈','🥉'][index]} Место {index + 1}</div>
            <div className="kc-top-game__info"><h3>{game.name}</h3><span>{fmt(game.resultRecords)} сохранённых результатов</span></div>
          </article>
        ))}</div>{noActivity ? <div className="kc-empty">Пока нет результатов</div> : null}</Panel>
        <Panel title="Остальные игры" icon="games"><div className="kc-tablebox"><table><thead><tr><th>Место</th><th>Игра</th><th>Результатов в выборке</th></tr></thead><tbody>
          {overview.topGames.slice(3).map((game, i) => <tr key={game.id}><td>#{i + 4}</td><td><span className="kc-gamelabel"><span className="kc-rankrow__image"><GameImage game={game} /></span>{game.name}</span></td><td>{fmt(game.resultRecords)}</td></tr>)}
        </tbody></table>{noActivity ? <div className="kc-empty">Нет результатов в базе</div> : null}</div></Panel>
      </> : null}
      {tab === 'matches' ? <AdminLiveMatches token={token} /> : null}
      {tab === 'suspicious' ? <AdminSuspicious token={token} onOpenPlayer={openProfile} /> : null}
      {tab === 'players' ? <>
        <Panel title="Игроки платформы" icon="players" right={<span className="kc-subtle">Найдено: {fmt(playersTotal)}</span>}>
          <label className="kc-search"><Icon name="search" size={19}/><input placeholder="Поиск по нику, логину или ID" value={search} onChange={e => setSearch(e.target.value)}/></label>
          {playersError ? <ErrorBox error={playersError} onRetry={() => setPlayersReload(v => v + 1)}/> : null}
          <div className="kc-tablebox"><table><thead><tr><th>Игрок</th><th>Логин</th><th>Последний вход</th><th>Монеты</th><th>Бан</th><th>Уровень / XP</th><th>Профиль</th></tr></thead><tbody>
            {players.map(player => <tr key={player.id}><td><div className="kc-playercell"><Avatar user={player}/><span><strong>{player.displayName}</strong><small>{player.online ? <span className="kc-online">● Онлайн</span> : '● Не в сети'}</small></span></div></td><td>{player.username}</td><td>{player.online ? 'Сейчас онлайн' : dateFormat(player.lastSeenAt)}</td><td className="kc-coinval"><Icon name="coin" size={16}/>{fmt(player.coins)}</td><td>{player.ban ? <span className="kc-ban-tag">Заблокирован</span> : <span className="kc-subtle">Нет</span>}</td><td>Ур. {player.level} · {fmt(player.xp)} XP</td><td><button type="button" className="kc-outlinebtn" onClick={() => openProfile(player.id)}>Открыть</button></td></tr>)}
          </tbody></table></div>
          {playersLoading ? <div className="kc-loading">Загрузка игроков…</div> : null}
          {!playersLoading && !players.length && !playersError ? <div className="kc-empty">Игроки не найдены</div> : null}
          <div className="kc-tablefooter"><span>Показано {fmt(players.length)} из {fmt(playersTotal)} · по 100 за запрос</span><div>
            {players.length < playersTotal ? <button className="kc-gradientbtn" type="button" onClick={loadMore} disabled={playersLoading}>Загрузить ещё 100</button> : null}
            <button className="kc-outlinebtn" type="button" onClick={() => setAutoLoad(v => !v)}>{autoLoad ? 'Отключить автозагрузку' : 'Смотреть полный список'}</button>
          </div></div><div ref={sentinel} className="kc-sentinel" aria-hidden="true" />
        </Panel>
      </> : null}
      {tab === 'profile' ? <>
        <button type="button" className="kc-back" onClick={() => setTab('players')}><Icon name="back" size={18}/> Вернуться к игрокам</button>
        {profileLoading ? <div className="kc-loading">Загрузка профиля…</div> : null}
        {profileError ? <ErrorBox error={profileError} onRetry={() => {setTab('players');window.setTimeout(() => setTab('profile'),0);}}/> : null}
        {profile ? <>
          <div className="kc-profilehero"><Avatar user={profile} size="lg"/><div><h2>{profile.displayName}</h2><span>@{profile.username}</span><small>{profile.id} · Регистрация: {dateFormat(profile.createdAt)} · {profile.online ? 'Сейчас онлайн' : `Был: ${dateFormat(profile.lastSeenAt)}`}</small></div></div>
          <div className="kc-stats"><Stat name="Монеты" value={fmt(profile.coins)} icon="coin" tone="gold"/><Stat name="Уровень" value={fmt(profile.level.level)} icon="star"/><Stat name="Опыт XP" value={fmt(profile.level.xp)} icon="chart" tone="blue"/><Stat name="Матчи" value={fmt(profile.matchesFinished)} icon="games"/></div>
          <div className="kc-contentgrid kc-contentgrid--profile">
            <Panel title="Любимые игры" icon="games" right={<button className="kc-textbutton" onClick={() => setExpandedGames(v => !v)}>{expandedGames ? 'Скрыть список ↑' : 'Показать все ↓'}</button>}>
              <div className="kc-ranklist">{(expandedGames ? profile.playedGames : profile.playedGames.slice(0,3)).map((game, i) => <div className="kc-rankrow" key={game.id}><b className="kc-rankrow__position">{i+1}</b><span className="kc-rankrow__image"><GameImage game={game} /></span><strong>{game.name}</strong><span>{fmt(game.recordedResults)} результатов</span></div>)}</div>
              {!profile.playedGames.length ? <div className="kc-empty">Нет истории результатов игр</div> : null}
              <p className="kc-subtle">Рейтинг по сохранённым результатам. {profile.historyLimited ? 'История ограничена 5000 записями.' : ''}</p>
            </Panel>
            <Panel title="Куплено в магазине" icon="inventory"><div className="kc-taggrid">{profile.ownedItems.map(item => <span key={item.id} className="kc-tag">{item.icon} {item.name}</span>)}{profile.purchasedTitles.map(item => <span key={item.id} className="kc-tag">👑 {item.name}</span>)}{!profile.ownedItems.length && !profile.purchasedTitles.length ? <span className="kc-subtle">Покупок нет</span> : null}</div></Panel>
            <Panel title="Достижения и награды" icon="award"><div className="kc-taggrid">{profile.earnedBadges.map(item => <span key={item.id} className="kc-tag kc-tag--award">🏆 {item.title}{item.claimed ? ' ✓' : ''}</span>)}{!profile.earnedBadges.length ? <span className="kc-subtle">Достижений пока нет</span> : null}</div></Panel>
            <Panel title="Статистика" icon="shield"><div className="kc-details"><div><span>Побед</span><strong>{fmt(profile.wins)}</strong></div><div><span>Поражений</span><strong>{fmt(profile.losses)}</strong></div><div><span>Ничьих</span><strong>{fmt(profile.draws)}</strong></div><div><span>Часов в играх</span><strong>Пока не отслеживается</strong></div></div></Panel>

            <Panel title="История транзакций" icon="coin" className="kc-contentgrid__wide" right={<button className="kc-outlinebtn" type="button" onClick={() => setShowCoinHistory(v => !v)}>{showCoinHistory ? 'Скрыть историю ↑' : 'Проверить историю монет →'}</button>}>
              <p className="kc-subtle">Начисления и списания записываются после установки новой SQL-миграции. Для ручных операций сохраняется причина.</p>
              {showCoinHistory ? <AdminCoinHistory token={token} playerId={profile.id} onClose={() => setShowCoinHistory(false)} /> : null}
            </Panel>
            <AdminPlayerActions player={profile} token={token} onChanged={refreshProfile} onDeleted={() => { setProfile(null);setPlayerId(null);setTab('players');setPlayersReload(v => v+1);setOverviewReload(v=>v+1); }} />
          </div>
        </> : null}
      </> : null}
      {tab === 'moderation' ? <AdminBansList token={token} onOpenPlayer={openProfile} /> : null}
    </main>
  </div>;
}
