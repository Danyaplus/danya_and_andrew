import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import UserAvatar from '../components/UserAvatar.jsx';
import '../styles/arena.css';

function PlayerProfile({ id, token, currentUser, onClose, onInvite }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setProfile(null);
    apiRequest(`/api/arena/players/${encodeURIComponent(id)}`, { token }).then((data) => { if (live) setProfile(data.profile); })
      .catch(() => { if (live) setError('Не удалось загрузить профиль.'); });
    return () => { live = false; };
  }, [id, token]);
  return <div className="arena-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="arena-player-modal" role="dialog" aria-label="Профиль игрока" aria-modal="true" onClick={(event) => event.stopPropagation()}>
      <button className="arena-close" type="button" onClick={onClose} aria-label="Закрыть">×</button>
      {error && <p>{error}</p>}
      {!profile && !error && <p>Загрузка профиля…</p>}
      {profile && <>
        <div className="arena-user-heading"><UserAvatar user={profile.user} size={64}/><div><span>Публичный профиль</span><h2>@{profile.user.username}</h2></div></div>
        <div className="arena-stat-grid"><div><b>{profile.level.level}</b><span>Уровень</span></div><div><b>{profile.wins}</b><span>Побед</span></div><div><b>{profile.awards}</b><span>Наград</span></div><div><b>{profile.trophies}</b><span>Кубков</span></div></div>
        <h3>Полученные медали</h3>
        <div className="arena-badge-list">{profile.unlockedBadges.length ? profile.unlockedBadges.map((badge) => <span key={badge.id} title={badge.title}>🏅 {badge.title}</span>) : <small>Пока медалей нет</small>}</div>
        {profile.trophies === 0 && <p className="arena-muted">🏆 Кубки появятся, когда мы добавим турниры.</p>}
        {profile.isFriend && currentUser?.id !== id && <button className="arena-primary" type="button" onClick={() => { onClose(); onInvite(profile.user); }}>⚔️ Вызвать на дуэль</button>}
      </>}
    </section>
  </div>;
}

function QuestSection({ title, subtitle, items, onClaim, claimingId }) {
  return <section className="arena-quest-section">
    <div className="arena-section-head"><h2>{title}</h2><small>{subtitle}</small></div>
    <div className="arena-quest-grid">{items.map((item) => <article className={`arena-quest ${item.claimed ? 'is-complete' : ''}`} key={item.id}>
      <span className="arena-quest-icon">{item.claimed ? '🏅' : item.canClaim ? '🎁' : '✦'}</span>
      <div className="arena-quest-info"><h3>{item.title}</h3><p>{item.description}</p>
        <div className="arena-progress"><span style={{width:`${Math.min(100,100*item.progress/item.target)}%`}}/></div>
        <small>{item.progress} / {item.target}</small>
      </div>
      <div className="arena-quest-reward">
        <strong>{item.claimed ? '✓ Получено' : `+${item.xp} XP`}</strong>
        {item.canClaim && <button type="button" className="arena-claim-btn" disabled={Boolean(claimingId)} onClick={() => onClaim(item)}>{claimingId === item.id ? 'Выдаём…' : 'Забрать XP'}</button>}
        {!item.claimed && !item.canClaim && <small>Выполни задание</small>}
      </div>
    </article>)}</div>
  </section>;
}

export default function ArenaPage({ type = 'ranking', token, user, onInvite, onLogin }) {
  const [players, setPlayers] = useState([]);
  const [quests, setQuests] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimingId, setClaimingId] = useState(null);
  const [claimFeedback, setClaimFeedback] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const nextLeaderboardUpdate = useRef(0);
  const load = useCallback(async () => {
    if (type === 'quests' && !token) {setLoading(false);setError('');return;}
    try {
      const endpoint = type === 'ranking' ? '/api/arena/leaderboard' : '/api/arena/quests';
      const payload = await apiRequest(endpoint, {token});
      if (type === 'ranking') {
        setPlayers(payload.players || []);
        setLastUpdated(payload.updatedAt || null);
        nextLeaderboardUpdate.current = payload.nextUpdateAt || (Date.now() + 4 * 60 * 60 * 1000);
      } else setQuests(payload);
      setError('');
    } catch (err) { setError(err.message === 'ARENA_SQL_REQUIRED'
      ? 'В Supabase ещё не выполнено обновление CODUMI ARENA. Нужен SQL-файл из нового ZIP.'
      : 'Не удалось получить данные. Попробуй позднее.'); }
    finally { setLoading(false); }
  }, [type,token]);
  const claimQuest = async (quest) => {
    if (!token || claimingId || !quest.canClaim) return;
    setClaimingId(quest.id);
    setClaimFeedback('');
    try {
      const result = await apiRequest('/api/arena/quests/claim', {
        token, method: 'POST', body: { questId: quest.id, periodKey: quest.periodKey },
      });
      setClaimFeedback(result.xpEarned ? `🎉 Получено +${result.xpEarned} XP!` : 'Награда уже получена.');
      await load();
    } catch (err) {
      setClaimFeedback(err.message === 'PERIOD_EXPIRED' ? 'Наступил новый день или неделя. Обновляем задания…' :
        err.message === 'QUEST_LOCKED' ? 'Сначала выполни условие задания.' : 'Не удалось получить XP. Проверь подключение.');
      await load();
    } finally {
      setClaimingId(null);
    }
  };
  useEffect(() => {
    setLoading(true);
    void load();
    const onProgress = () => { if (type === 'quests') void load(); };
    const onConnect = () => { if (type === 'quests' || Date.now() >= nextLeaderboardUpdate.current) void load(); };
    socket.on('progress:updated', onProgress);
    socket.on('connect', onConnect);
    const interval = window.setInterval(() => {
      if (type === 'quests' || Date.now() >= nextLeaderboardUpdate.current) void load();
    }, 60000);
    return () => {
      socket.off('progress:updated', onProgress);
      socket.off('connect', onConnect);
      window.clearInterval(interval);
    };
  }, [load, type]);
  return <main className="arena-page">
    <header className="arena-hero"><span>CODUMI ARENA</span><h1>{type === 'ranking' ? '🏆 Рейтинг игроков' : '⭐ Задания и опыт'}</h1>
      <p>{type === 'ranking' ? 'Только логины, настоящие победы и прогресс игроков.' : 'Выполняй задания и забирай XP один раз за каждое. Новый день и неделя начинаются по Киеву.'}</p></header>
    {type === 'ranking' && lastUpdated && <div className="arena-refresh-note">
      <span>🕓 Рейтинг обновляется раз в 4 часа</span>
      <small>Последнее обновление: {new Intl.DateTimeFormat('ru-RU', { timeZone:'Europe/Kyiv', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(lastUpdated))} (Киев)</small>
    </div>}
    {loading && <p className="arena-muted">Загружаем…</p>}{error && <p className="arena-error">{error}</p>}
    {type === 'ranking' && !loading && !error && <div className="arena-ranking">
      {players.length === 0 ? <p>Результаты появятся после первых завершённых матчей.</p> : players.map((player, i) =>
        <button className={`arena-ranking-row ${player.id===user?.id?'is-mine':''}`} type="button" key={player.id} onClick={()=>setSelectedId(player.id)}>
          <span className="arena-rank">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span><UserAvatar user={player} size={42}/>
          <span className="arena-rank-name"><b>@{player.username}</b><small>Уровень {player.level} · {player.matchesFinished} матчей</small></span>
          <span className="arena-rank-wins"><b>{player.wins}</b><small>побед</small></span><span className="arena-rank-chevron">›</span>
        </button>)}
    </div>}
    {type === 'quests' && !user && <button type="button" className="arena-primary" onClick={onLogin}>Войти и получать XP</button>}
    {type === 'quests' && quests && !error && <>
      {claimFeedback && <p className="arena-feedback" role="status">{claimFeedback}</p>}
      <QuestSection title="☀️ Ежедневные" subtitle="Обновляются в 00:00 по Киеву" items={quests.daily || []} onClaim={claimQuest} claimingId={claimingId}/>
      <QuestSection title="🗓️ Еженедельные" subtitle="Каждый понедельник в 00:00 по Киеву" items={quests.weekly || []} onClaim={claimQuest} claimingId={claimingId}/>
      <p className="arena-muted">Выполни условие и один раз забери XP. Ежедневные задания обновляются по Киеву в 00:00; еженедельные — в понедельник.</p>
    </>}
    {selectedId && <PlayerProfile id={selectedId} token={token} currentUser={user} onClose={()=>setSelectedId(null)} onInvite={onInvite} />}
  </main>;
}
