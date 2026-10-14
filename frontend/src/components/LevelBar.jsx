import { useEffect, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import '../styles/progression.css';

export default function LevelBar({ token, userId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!token || !userId) return undefined;
    let active = true;
    async function load() {
      try { const result = await apiRequest('/api/progression/me', { token }); if (active) setData(result); }
      catch { if (active) setData(null); }
    }
    void load();
    socket.on('progress:updated', load);
    return () => { active = false; socket.off('progress:updated', load); };
  }, [token, userId]);

  const level = data?.level || 1;
  const current = data?.currentXp || 0;
  const required = data?.requiredXp || 100;
  return (
    <section className="codumi-level-card" aria-label="Уровень и опыт">
      <div className="codumi-level-card__top"><span className="codumi-level-card__emblem">✦ {level}</span><div><small>ТВОЙ УРОВЕНЬ</small><strong>Уровень {level}</strong></div><span className="codumi-level-card__xp">{data?.xp ?? '—'} XP</span></div>
      <div className="codumi-level-card__track" role="progressbar" aria-valuenow={current} aria-valuemax={required}><span style={{ width: `${Math.min(100, current / required * 100)}%` }} /></div>
      <div className="codumi-level-card__bottom"><small>{current} / {required} XP до следующего уровня</small><small>За матчи +50 XP · победа +25</small></div>
      <p>Награды за уровни добавим позже. Опыт уже сохраняется в профиле.</p>
    </section>
  );
}
