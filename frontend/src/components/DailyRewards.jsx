import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, socket } from '../lib/socket.js';
import '../styles/daily-rewards.css';

const formatNumber = value => Number(value || 0).toLocaleString('ru-RU');
const iconFor = reward => reward?.milestone ? '🎁' : reward?.kind === 'xp' ? '✦' : '🪙';
const prizeText = reward => reward ? `${formatNumber(reward.amount)} ${reward.kind === 'xp' ? 'XP' : 'CODI'}` : '—';

function useCountdown(timestamp) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', tick); };
  }, []);
  const remaining = Math.max(0, Math.floor((new Date(timestamp || 0).getTime() - now) / 1000));
  const hh = String(Math.floor(remaining / 3600)).padStart(2, '0');
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function useDailyRewards({ token, userId, canAutoOpen = true }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [visible, setVisible] = useState(false);
  const [feedback, setFeedback] = useState('');
  const autoShown = useRef('');
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (!token || !userId) return;
    const version = requestVersion.current;
    try {
      const result = await apiRequest('/api/daily-rewards', { token, timeoutMs: 16000 });
      if (version !== requestVersion.current) return;
      setData(result);
      setError('');
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(err.message === 'DAILY_REWARDS_SQL_REQUIRED'
        ? 'Ежедневные награды ещё не установлены в Supabase.'
        : 'Награды временно недоступны. Проверь подключение к серверу.');
    }
  }, [token, userId]);

  useEffect(() => {
    requestVersion.current += 1;
    setData(null); setError(''); setVisible(false); setFeedback('');
    if (!token || !userId) return undefined;
    // The server, never the device clock, determines the Kyiv calendar date.
    void refresh();
    const reload = () => { void refresh(); };
    const onVisibility = () => { if (!document.hidden) reload(); };
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', onVisibility);
    socket.on('connect', reload);
    socket.on('daily-rewards:updated', reload);
    const timer = window.setInterval(reload, 45_000);
    return () => {
      requestVersion.current += 1;
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.off('connect', reload);
      socket.off('daily-rewards:updated', reload);
      window.clearInterval(timer);
    };
  }, [refresh, token, userId]);

  useEffect(() => {
    if (!data || data.claimedToday || !canAutoOpen || !userId) return;
    const key = `${userId}:${data.today}`;
    if (autoShown.current === key) return;
    autoShown.current = key;
    setVisible(true);
    setFeedback('');
  }, [data, canAutoOpen, userId]);

  const claim = useCallback(async () => {
    if (!token || !userId || claiming || data?.claimedToday) return;
    setClaiming(true);
    setFeedback('');
    try {
      const result = await apiRequest('/api/daily-rewards/claim', { token, method: 'POST' });
      setFeedback(result.alreadyClaimed
        ? 'Эта награда уже получена. Возвращайся завтра!'
        : `Награда за ${result.day}-й день получена: +${prizeText(result.reward)}!`);
      await refresh();
      if (!result.alreadyClaimed) window.dispatchEvent(new Event('kodumi-market-updated'));
    } catch (err) {
      setFeedback(err.message === 'DAILY_REWARDS_SQL_REQUIRED'
        ? 'Для выдачи наград требуется установить SQL-миграцию.'
        : 'Не удалось получить награду. Проверь подключение и попробуй ещё раз.');
      await refresh();
    } finally { setClaiming(false); }
  }, [token, userId, claiming, data?.claimedToday, refresh]);

  return { data, error, claiming, visible, setVisible, feedback, claim, refresh };
}

function RewardGrid({ data }) {
  return <div className="kd-reward-grid" aria-label="Календарь наград">
    {(data?.rewards || []).map(({ day, reward }) => {
      const received = day <= data.streak;
      const today = day === data.displayDay;
      return <div key={day} className={`kd-reward-tile ${received ? 'is-received' : ''} ${today ? 'is-today' : ''} ${reward.milestone ? 'is-milestone' : ''}`}>
        <small>День {day}</small>
        <span className="kd-reward-tile__icon" aria-hidden="true">{iconFor(reward)}</span>
        <strong>{prizeText(reward)}</strong>
        <span className="kd-reward-tile__status">{received ? '✓ Получено' : today ? 'Сегодня' : reward.milestone ? '⭐ Бонус' : 'Скоро'}</span>
      </div>;
    })}
  </div>;
}

export function DailyRewardsBanner({ rewards, onLogin }) {
  const {data, error, setVisible} = rewards;
  const loggedIn = Boolean(data);
  const claimable = loggedIn && !data.claimedToday;
  return <section className="kd-rewards-banner" aria-label="Ежедневные награды">
    <div className="kd-rewards-banner__gift" aria-hidden="true">🎁</div>
    <div className="kd-rewards-banner__copy">
      <small>ПОДАРОК ЗА ВХОД</small>
      <h2>Ежедневные награды</h2>
      <p>{error || (data?.claimedToday ? 'Сегодня награда уже получена. Завтра будет новая!' : 'Заходи каждый день и собирай серию. Каждый 5-й день — большой бонус!')}</p>
      {loggedIn && <span className="kd-rewards-banner__streak">🔥 Серия: {data.streak} {data.streak === 1 ? 'день' : 'дней'} · {prizeText(data.todayReward)} {claimable ? 'сегодня' : 'получено'}</span>}
    </div>
    <button type="button" onClick={() => loggedIn ? setVisible(true) : onLogin?.()}>
      {loggedIn ? claimable ? '🎁 Забрать' : '✓ Посмотреть' : 'Войти и получить'}
    </button>
  </section>;
}

export function DailyRewardsDialog({ rewards }) {
  const {data, error, visible, setVisible, feedback, claiming, claim} = rewards;
  const clock = useCountdown(data?.nextResetAt);
  useEffect(() => {
    if (!visible) return undefined;
    const esc = e => { if (e.key === 'Escape') setVisible(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [visible, setVisible]);
  if (!visible) return null;
  return createPortal(<div className="kd-rewards-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setVisible(false); }}>
    <section className="kd-rewards-modal" role="dialog" aria-modal="true" aria-label="Ежедневные награды">
      <button type="button" className="kd-rewards-modal__close" aria-label="Закрыть окно" onClick={() => setVisible(false)}>×</button>
      <div className="kd-rewards-modal__hero">
        <span className="kd-rewards-modal__present" aria-hidden="true">🎁</span>
        <small>KODUMI GAMES · ПОДАРОК ЗА ВХОД</small>
        <h2>Ежедневные награды</h2>
        <p>Заходи каждый день после 00:00 по Киеву. Собери серию и забери ценные призы!</p>
      </div>
      {error && <p className="kd-rewards-error">{error}</p>}
      {data ? <>
        <div className="kd-rewards-modal__streak"><span>🔥 Серия: <strong>{data.streak} дней</strong></span><small>Каждый 5-й день — повышенная награда</small></div>
        <RewardGrid data={data}/>
        <div className="kd-rewards-modal__footer">
          <div className="kd-rewards-today"><span>{data.claimedToday ? '✓ Награда за сегодня получена' : `Сегодня · День ${data.displayDay}`}</span><strong>{iconFor(data.todayReward)} {prizeText(data.todayReward)}</strong></div>
          <p>🕛 Следующий день через <b>{clock}</b></p>
          {feedback && <div className="kd-rewards-feedback" role="status">{feedback}</div>}
          <button type="button" className="kd-rewards-primary" onClick={claim} disabled={claiming || data.claimedToday}>
            {claiming ? 'Выдаём награду…' : data.claimedToday ? '✓ Получено — возвращайся завтра' : '🎁 Забрать награду'}
          </button>
        </div>
      </> : <p className="kd-rewards-loading">Загружаем календарь наград…</p>}
    </section>
  </div>, document.body);
}

export function DailyRewardsPage({ rewards, user, onLogin, onQuests }) {
  const {data, error, claiming, claim, feedback, refresh, setVisible} = rewards;
  const clock = useCountdown(data?.nextResetAt);
  return <main className="kd-rewards-page page-shell">
    <section className="kd-rewards-page__hero"><span>🎁 KODUMI GAMES</span><h1>Ежедневные награды</h1><p>Заходи ежедневно, получай CODI или опыт и открывай особенные бонусы каждые 5 дней.</p></section>
    {!user && <div className="kd-rewards-page__signin"><p>Авторизуйся, чтобы получать награды и сохранять свою серию.</p><button type="button" onClick={onLogin}>Войти в аккаунт</button></div>}
    {user && error && <div className="kd-rewards-error" role="alert">{error} <button type="button" onClick={refresh}>Повторить</button></div>}
    {user && !data && !error && <p className="kd-rewards-loading">Получаем награды с сервера…</p>}
    {data && <>
      <section className="kd-rewards-page__calendar" aria-label="Серия ежедневных наград">
        <div className="kd-rewards-page__streak"><span>🔥 Текущая серия</span><strong>{data.streak} дней</strong><p>Каждый день — новый подарок. Не пропускай целый день, чтобы сохранить серию.</p></div>
        <RewardGrid data={data}/>
      </section>
      <section className="kd-rewards-page__today"><span className="kd-rewards-page__chest" aria-hidden="true">🎁</span><div><small>{data.claimedToday ? 'НАГРАДА ПОЛУЧЕНА' : 'НАГРАДА ЗА СЕГОДНЯ'}</small><h2>{iconFor(data.todayReward)} {prizeText(data.todayReward)}</h2><p>{data.todayReward?.milestone ? 'Особенный бонус за серию входов!' : data.todayReward?.kind==='xp' ? 'Опыт зачисляется прямо в твой уровень.' : 'Монеты CODI сразу появятся на балансе.'}</p><small>Новый день по Киеву через {clock}</small></div><button type="button" className="kd-rewards-primary" onClick={claim} disabled={claiming||data.claimedToday}>{claiming?'Начисляем…':data.claimedToday?'✓ Уже получено':'🎁 Забрать награду'}</button></section>
      {feedback && <div className="kd-rewards-feedback" role="status">{feedback}</div>}
    </>}
    <section className="kd-rewards-page__tasks"><div><h2>⭐ Ежедневные задания</h2><p>Хочешь больше опыта и монет? Выполняй задания, пока ждёшь следующую награду.</p></div><button type="button" onClick={onQuests}>Перейти к заданиям →</button></section>
    {data?.claimedToday && <button className="kd-rewards-page__details" type="button" onClick={() => setVisible(true)}>Посмотреть полный календарь наград</button>}
  </main>;
}
