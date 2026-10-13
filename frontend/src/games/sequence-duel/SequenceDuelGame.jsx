import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './sequence-duel.css';

const COLORS = [
  { key: 'red', name: 'Красный', symbol: '●', hex: '#ff5475', short: '1' },
  { key: 'blue', name: 'Синий', symbol: '◆', hex: '#45aaff', short: '2' },
  { key: 'green', name: 'Зелёный', symbol: '▲', hex: '#4ee29c', short: '3' },
  { key: 'yellow', name: 'Жёлтый', symbol: '★', hex: '#ffca53', short: '4' },
];

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function getResult(state) {
  if (state?.status !== 'finished') return null;
  if (!state.result?.winner) {
    return { title: 'НИЧЬЯ!', icon: '🤝', tone: 'draw', message: state.result?.message };
  }
  const won = state.result.winner === state.playerSeat;
  return {
    title: won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ',
    icon: won ? '🏆' : '✨',
    tone: won ? 'win' : 'lose',
    message: state.result?.message,
  };
}

export default function SequenceDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [serverNow, setServerNow] = useState(0);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const latestStateRef = useRef(null);
  const clockRef = useRef({ server: Date.now(), local: performance.now() });

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: queueMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('sequence-duel');

  latestStateRef.current = state;
  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mine = me ? state.players?.[me] : null;
  const opponent = foe ? state.players?.[foe] : null;

  useEffect(() => {
    if (!state?.serverTime) return;
    clockRef.current = { server: state.serverTime, local: performance.now() };
    setServerNow(state.serverTime);
  }, [state?.serverTime]);

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;
    const interval = setInterval(() => {
      const c = clockRef.current;
      setServerNow(c.server + performance.now() - c.local);
    }, 50);
    return () => clearInterval(interval);
  }, [state?.roomId, state?.status]);

  useEffect(() => {
    pendingRef.current = false;
    setPending(false);
  }, [state?.round, state?.phase, mine?.progress, mine?.done]);

  function findMatch() {
    pendingRef.current = false;
    setPending(false);
    setError('');
    queueMatch(playerName);
  }

  function pressColor(color) {
    const current = latestStateRef.current;
    const seat = current?.playerSeat;
    const myState = seat && current?.players?.[seat];
    if (!current || current.status !== 'playing' || current.phase !== 'answer' || !myState || myState.done || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    sendAction({ type: 'press', payload: { index: myState.progress, color } });
    navigator.vibrate?.(12);
  }

  useEffect(() => {
    const handleKey = (event) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
      const key = ['1', '2', '3', '4'].indexOf(event.key);
      if (key === -1) return;
      if (latestStateRef.current?.phase !== 'answer') return;
      event.preventDefault();
      pressColor(COLORS[key].key);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (!state && !waiting) {
    return (
      <section className="sd-lobby">
        <div className="sd-lobby__lights" aria-hidden="true">
          {COLORS.map((color) => <span key={color.key} style={{ '--sd-color': color.hex }}>{color.symbol}</span>)}
        </div>
        <span className="sd-eyebrow">🧠 ИГРА НА ПАМЯТЬ · 2 ИГРОКА ОНЛАЙН</span>
        <h1>Повтори <em>последовательность</em></h1>
        <p>Четыре цветные кнопки загораются по очереди. Запомни их порядок, затем повтори его точь-в-точь. Чем дальше, тем длиннее цепочка!</p>
        <div className="sd-lobby__features">
          <span>✨ 7 уровней</span>
          <span>🎨 От 3 до 9 цветов</span>
          <span>🏆 Очко за точный повтор</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="sd-primary" onClick={findMatch}>Найти соперника →</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="sd-lobby sd-lobby--waiting">
        <div className="sd-waiting-orb">🧠</div>
        <span className="sd-eyebrow">ПОИСК ОНЛАЙН-СОПЕРНИКА</span>
        <h2>Готовим дуэль памяти…</h2>
        <p>Когда второй игрок подключится, обеим сторонам покажется одинаковая цветная цепочка.</p>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="sd-secondary" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const phase = state.phase;
  const now = serverNow || state.serverTime;
  const remaining = Math.max(0, (state.phaseEndsAt - now) / 1000);
  const countdown = Math.max(1, Math.ceil(remaining));
  const activeIndex = phase === 'watch'
    ? Math.floor((now - state.phaseStartedAt - state.watchLeadMs) / state.flashStepMs)
    : -1;
  const activeColor = phase === 'watch' && activeIndex >= 0 && activeIndex < state.sequenceLength
    && ((now - state.phaseStartedAt - state.watchLeadMs) % state.flashStepMs) < state.flashOnMs
      ? state.sequence?.[activeIndex]
      : null;
  const canAnswer = state.status === 'playing' && phase === 'answer' && !mine?.done && !pending;
  const result = getResult(state);

  let title = 'Готовься запоминать!';
  let hint = 'Смотри на цветные кнопки — скоро они загорятся.';
  if (phase === 'watch') {
    title = 'ЗАПОМИНАЙ!';
    hint = 'Не нажимай. Смотри, в каком порядке вспыхивают цвета.';
  } else if (phase === 'answer') {
    title = mine?.done ? (mine.success ? 'Отличная память! 🎉' : 'Попытка закончена') : 'ТВОЯ ОЧЕРЕДЬ!';
    hint = mine?.done ? 'Подожди, пока соперник закончит свой ответ.' : 'Повтори последовательность нажатием цветных кнопок.';
  } else if (phase === 'review') {
    title = 'ИТОГ УРОВНЯ';
    hint = `Ты: ${mine?.success ? '+1 очко' : 'без очка'} · Соперник: ${opponent?.success ? '+1 очко' : 'без очка'}`;
  } else if (phase === 'finished') {
    title = 'МАТЧ ОКОНЧЕН';
    hint = 'Все семь уровней позади!';
  }

  return (
    <section className="sd-game">
      <div className="sd-scorebar">
        <div className="sd-scorebar__player sd-scorebar__player--red">
          <span className="sd-scorebar__tag">ТЫ</span>
          <strong title={mine?.name}>{mine?.name || playerName}</strong>
          <b>{mine?.score ?? 0}</b>
        </div>
        <div className="sd-scorebar__middle"><small>УРОВЕНЬ</small><strong>{state.round} <span>/</span> {state.totalRounds}</strong></div>
        <div className="sd-scorebar__player sd-scorebar__player--blue">
          <span className="sd-scorebar__tag">СОПЕРНИК</span>
          <strong title={opponent?.name}>{opponent?.name || 'Игрок'}</strong>
          <b>{opponent?.score ?? 0}</b>
        </div>
      </div>

      <div className="sd-arena">
        <div className="sd-arena__glow sd-arena__glow--a" />
        <div className="sd-arena__glow sd-arena__glow--b" />
        <div className="sd-topline">
          <span>⚡ ДУЭЛЬ ПАМЯТИ</span>
          <span className="sd-topline__time">{phase === 'finished' ? 'ФИНИШ' : `${Math.ceil(remaining)} сек`}</span>
        </div>

        <div className="sd-headline">
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>

        <div className="sd-levels" aria-label="Пройденные уровни">
          {Array.from({ length: state.totalRounds }, (_, i) => (
            <span key={i} className={`${i + 1 === state.round ? 'is-current' : ''} ${i + 1 < state.round ? 'is-past' : ''}`}>{i + 1}</span>
          ))}
        </div>

        <div className={`sd-pad ${phase === 'watch' ? 'sd-pad--watch' : ''}`} aria-label="Цветные кнопки">
          {COLORS.map((color) => (
            <button
              key={color.key}
              type="button"
              className={`sd-pad__key ${activeColor === color.key ? 'is-flashing' : ''}`}
              style={{ '--sd-color': color.hex }}
              aria-label={color.name}
              disabled={!canAnswer}
              onClick={() => pressColor(color.key)}
            >
              <span className="sd-pad__symbol" aria-hidden="true">{color.symbol}</span>
              <span className="sd-pad__name">{color.name}</span>
              <span className="sd-pad__hotkey">{color.short}</span>
            </button>
          ))}
          {phase === 'countdown' && <div key={`count-${countdown}`} className="sd-pad__countdown">{countdown}</div>}
        </div>

        <div className="sd-progress">
          <div className="sd-progress__headline">
            <strong>{phase === 'watch' ? 'СМОТРИ ВНИМАТЕЛЬНО' : phase === 'review' ? 'ПРАВИЛЬНЫЙ ПОРЯДОК' : 'ТВОЙ ПРОГРЕСС'}</strong>
            <span>{mine?.progress ?? 0} / {state.sequenceLength}</span>
          </div>
          <div className="sd-progress__dots">
            {Array.from({ length: state.sequenceLength }, (_, i) => {
              const revealed = phase === 'review' ? COLORS.find((color) => color.key === state.sequence?.[i]) : null;
              return (
                <span
                  key={i}
                  className={`${phase === 'watch' && i === activeIndex ? 'is-current' : ''} ${phase !== 'watch' && i < (mine?.progress ?? 0) ? 'is-done' : ''}`}
                  style={revealed ? { '--sd-color': revealed.hex, background: revealed.hex } : undefined}
                >{revealed?.symbol || (phase !== 'watch' && i < (mine?.progress ?? 0) ? '✓' : '')}</span>
              );
            })}
          </div>
          <div className="sd-opponent-status">
            <span>👤 Соперник</span>
            <strong>{opponent?.done ? (opponent.success ? '✅ Повторил!' : '⏳ Закончил попытку') : phase === 'answer' ? `Вводит: ${opponent?.progress ?? 0}/${state.sequenceLength}` : 'Тоже запоминает'}</strong>
          </div>
        </div>
      </div>

      <div className="sd-footer">
        <span>⌨️ На компьютере — клавиши <b>1, 2, 3, 4</b> · На телефоне — касания</span>
        {error && <span className="sd-footer__error">{error}</span>}
        {state.status === 'playing' && <button type="button" onClick={() => sendAction({ type: 'resign' })}>Сдаться</button>}
      </div>

      {result && (
        <div className="sd-result-overlay" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`sd-result sd-result--${result.tone}`}>
            <div className="sd-result__icon">{result.icon}</div>
            <span className="sd-eyebrow">7 УРОВНЕЙ ПРОЙДЕНО</span>
            <h2>{result.title}</h2>
            <p>{result.message}</p>
            <div className="sd-result__scores">
              <div><small>ТВОИ ОЧКИ</small><strong>{mine?.score ?? 0}</strong></div>
              <span>:</span>
              <div><small>СОПЕРНИК</small><strong>{opponent?.score ?? 0}</strong></div>
            </div>
            <div className="sd-result__buttons">
              <button type="button" className="sd-primary" onClick={findMatch}>Играть ещё</button>
              <button type="button" className="sd-secondary" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
