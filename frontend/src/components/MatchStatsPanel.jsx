import { useEffect, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import '../styles/match-stats.css';

const OUTCOMES = {
  win: ['🏆', 'Победа', 'win'],
  loss: ['◌', 'Поражение', 'loss'],
  draw: ['🤝', 'Ничья', 'draw'],
  completed: ['🎮', 'Матч завершён', 'completed'],
};
const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Kyiv', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

export default function MatchStatsPanel({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const payload = await apiRequest('/api/arena/match-statistics/me', { token });
        if (!live) return;
        setStats(payload.stats);
        setError('');
      } catch {
        if (live) setError('Не удалось загрузить статистику. Попробуй позже.');
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    socket.on('progress:updated', load);
    return () => { live = false; socket.off('progress:updated', load); };
  }, [token]);

  if (loading) return <div className="match-stats-message">Загружаем статистику матчей…</div>;
  if (error) return <div className="match-stats-message" role="status">{error}</div>;
  if (!stats) return null;

  return <div className="match-stats">
    <div className="match-stats-heading"><span>СТАТИСТИКА АККАУНТА</span><h3>Твои матчи</h3><p>Результаты учитываются сервером. Здесь только подтверждённая статистика.</p></div>
    <div className="match-stats-overview">
      <div className="match-stats-box"><b>{stats.total}</b><span>Всего матчей</span></div>
      <div className="match-stats-box is-win"><b>{stats.wins}</b><span>Побед</span></div>
      <div className="match-stats-box"><b>{stats.losses}</b><span>Поражений</span></div>
      <div className="match-stats-box"><b>{stats.draws}</b><span>Ничьих</span></div>
    </div>
    <div className="match-stats-highlights">
      <section><span>🎯 Процент побед</span><strong>{stats.winRate}%</strong>
        <div className="match-stats-track"><i style={{ width: `${stats.winRate}%` }} /></div>
        <small>Среди матчей с известным результатом</small>
      </section>
      <section><span>💜 Любимая игра</span><strong>{stats.favoriteGameTitle || 'Пока нет'}</strong>
        <small>{stats.favoriteGameTitle ? `${stats.favoriteGameCount} матчей в этой игре` : 'Сыграй несколько матчей'}</small>
        <small>{stats.differentGames} разных игр в истории</small>
      </section>
    </div>
    {stats.undetermined > 0 && <p className="match-stats-note">Ещё {stats.undetermined} матчей без подтверждённого результата. Они входят в общее количество, но не считаются поражениями.</p>}
    <section className="match-stats-recent">
      <div className="match-stats-recent-header"><h3>Последние 5 матчей</h3><span>По киевскому времени</span></div>
      {stats.recent?.length ? stats.recent.map((match, index) => {
        const [symbol, label, kind] = OUTCOMES[match.outcome] || OUTCOMES.completed;
        return <div className="match-stats-recent-row" key={`${match.gameId}-${match.playedAt}-${index}`}>
          <div className={`match-stats-result-icon is-${kind}`}>{symbol}</div>
          <div className="match-stats-recent-name"><strong>{match.gameTitle || match.gameId}</strong><span>Против @{match.opponent}</span></div>
          <div className="match-stats-recent-meta"><b className={`is-${kind}`}>{label}</b><small>{match.playedAt ? DATE_FORMAT.format(new Date(match.playedAt)) : '—'}</small></div>
        </div>;
      }) : <p className="match-stats-empty">История появится после первого завершённого онлайн-матча.</p>}
    </section>
  </div>;
}
