import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './math-duel.css';

const BUTTON_KEYS = ['1', '2', '3', '4'];
const DECORATIVE_SIGNS = ['+', '×', '−', '÷'];

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function playTone(type) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const notes = type === 'score' ? [660, 880] : type === 'wrong' ? [240, 190] : [450];
    notes.forEach((hz, index) => {
      const osc = ctx.createOscillator();
      const volume = ctx.createGain();
      const start = ctx.currentTime + index * .09;
      osc.type = type === 'wrong' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(hz, start);
      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(.055, start + .015);
      volume.gain.exponentialRampToValueAtTime(.0001, start + .125);
      osc.connect(volume).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + .14);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch { /* Sound is optional. */ }
}

function remainingMs(end, now) { return Math.max(0, (end || 0) - now); }

export default function MathDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const syncRef = useRef({ local: performance.now(), server: Date.now() });
  const prevRef = useRef(null);
  const {
    waiting, state, error, setError, findMatch: startMatch, cancelSearch, sendAction,
  } = useMultiplayerGame('math-duel');

  useEffect(() => {
    if (!state?.serverTime) return;
    syncRef.current = { local: performance.now(), server: state.serverTime };
    setClock(state.serverTime);
  }, [state?.serverTime]);

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;
    const id = setInterval(() => {
      setClock(syncRef.current.server + (performance.now() - syncRef.current.local));
    }, 60);
    return () => clearInterval(id);
  }, [state?.roomId, state?.status]);

  useEffect(() => {
    if (!state || !soundEnabled) return;
    const prev = prevRef.current;
    // The first snapshot after joining is not a sound event.
    if (prev?.roomId === state.roomId) {
      if (prev.phase === 'question' && state.phase === 'reveal' && state.reveal?.winner) playTone('score');
      else if (prev.wrong !== state.players?.[state.playerSeat]?.wrong) playTone('wrong');
    }
    prevRef.current = {
      roomId: state.roomId,
      phase: state.phase,
      wrong: state.players?.[state.playerSeat]?.wrong,
    };
  }, [state, soundEnabled]);

  const seat = state?.playerSeat;
  const opponentSeat = state?.opponentSeat;
  const mine = seat ? state?.players?.[seat] : null;
  const theirs = opponentSeat ? state?.players?.[opponentSeat] : null;
  const phase = state?.phase;
  const phaseLeft = remainingMs(state?.phaseEndsAt, clock);
  const questionDuration = (state?.questionEndsAt || 0) - (state?.roundStartAt || 0);
  const fraction = phase === 'question' && questionDuration > 0
    ? Math.max(0, Math.min(1, phaseLeft / questionDuration)) : 0;
  const canAnswer = state?.status === 'playing' && phase === 'question' && phaseLeft > 0 && clock >= (state?.myLockedUntil || 0);
  const isCoolingDown = phase === 'question' && clock < (state?.myLockedUntil || 0);
  const result = state?.status === 'finished' ? state.result : null;
  const amWinner = result?.winner === seat;
  const isDraw = result && !result.winner;

  function findMatch() {
    setError('');
    prevRef.current = null;
    startMatch(playerName);
  }

  function answer(index) {
    if (!canAnswer || !Number.isInteger(index) || index < 0 || index > 3) return;
    sendAction({ type: 'answer', optionIndex: index });
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (!state || state.status !== 'playing' || state.phase !== 'question' || event.repeat) return;
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const number = BUTTON_KEYS.indexOf(event.key) !== -1
        ? BUTTON_KEYS.indexOf(event.key)
        : BUTTON_KEYS.indexOf(event.code?.replace('Numpad', ''));
      if (number === -1) return;
      event.preventDefault();
      if (canAnswer) sendAction({ type: 'answer', optionIndex: number });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, canAnswer, sendAction]);

  if (!state) {
    return (
      <section className="md-lobby">
        <div className="md-lobby-art" aria-hidden="true">
          <span>7 × 8</span><b>?</b><span>64 ÷ 8</span>
        </div>
        <div className="md-kicker">⚡ МИНИ-ИГРА · 2 ИГРОКА ОНЛАЙН</div>
        <h1>Математическая<br /><em>дуэль</em></h1>
        {waiting ? (
          <>
            <p>Ищем соперника… Как только второй игрок подключится, начнётся общий отсчёт 3–2–1!</p>
            <div className="md-searching"><span /><span /><span /> ОЖИДАЕМ СОПЕРНИКА</div>
            <button type="button" className="md-secondary" onClick={cancelSearch}>Отменить поиск</button>
          </>
        ) : (
          <>
            <p>Одинаковый пример у обоих игроков. Найди правильный ответ быстрее противника и забери очко!</p>
            <div className="md-features">
              <span>🧠 10 вопросов</span><span>⚡ Первый правильный +1</span><span>🏆 Победа по очкам</span>
            </div>
            <button type="button" className="md-primary" onClick={findMatch}>⚔️ НАЙТИ СОПЕРНИКА <span>→</span></button>
          </>
        )}
        {error && <div className="md-error" role="alert">{error}</div>}
        <p className="md-lobby-note">На телефоне нажимай на ответы, на компьютере — клавиши 1–4.</p>
      </section>
    );
  }

  return (
    <section className="md-game">
      <div className="md-background-glow" aria-hidden="true" />
      <header className="md-header">
        <div className="md-player md-player--mine">
          <div className="md-avatar">🧠</div>
          <div className="md-player-title"><small>ТЫ</small><strong>{mine?.name || playerName}</strong></div>
          <span className="md-points">{mine?.score ?? 0}</span>
        </div>
        <div className="md-vs"><span>DUEL</span><strong>VS</strong></div>
        <div className="md-player md-player--foe">
          <span className="md-points">{theirs?.score ?? 0}</span>
          <div className="md-player-title"><small>СОПЕРНИК</small><strong>{theirs?.name || 'Игрок'}</strong></div>
          <div className="md-avatar">⚡</div>
        </div>
      </header>

      <div className="md-progress" aria-label={`Раунд ${state.round} из ${state.roundCount}`}>
        {Array.from({ length: state.roundCount }, (_, i) => (
          <span key={i} className={i + 1 < state.round ? 'is-complete' : i + 1 === state.round ? 'is-current' : ''} />
        ))}
      </div>

      <div className="md-meta">
        <div><small>РАУНД</small><strong>{String(state.round).padStart(2, '0')} <span>/ {state.roundCount}</span></strong></div>
        <div className="md-difficulty">{state.question?.difficulty || 'ГОТОВНОСТЬ К БОЮ'}</div>
        <div className={`md-time ${phase === 'question' && phaseLeft < 4000 ? 'is-danger' : ''}`}>
          <small>ВРЕМЯ</small><strong>{phase === 'question' ? (phaseLeft / 1000).toFixed(1) : '—'}<span> с</span></strong>
        </div>
      </div>

      <main className="md-stage">
        <div className="md-stage-texture" aria-hidden="true">{DECORATIVE_SIGNS.map((sign, i) => <span key={i}>{sign}</span>)}</div>
        {phase === 'countdown' ? (
          <div className="md-countdown" key="countdown">
            <div className="md-stage-label">ПРИГОТОВЬСЯ!</div>
            <strong key={Math.ceil(phaseLeft / 1000)}>{Math.max(1, Math.ceil(phaseLeft / 1000))}</strong>
            <p>Первый пример уже близко…</p>
          </div>
        ) : (
          <>
            <div className="md-question-head"><span className="md-spark">✦</span> РЕШИ ПРИМЕР <span className="md-spark">✦</span></div>
            <div className="md-expression" key={`question-${state.round}`}>
              {state.question?.text} <span>=</span> <em>?</em>
            </div>
            <div className="md-timer-track"><div style={{ width: `${fraction * 100}%` }} className={phaseLeft < 4000 ? 'is-danger' : ''} /></div>
            <div className="md-options">
              {(state.question?.options || []).map((value, index) => {
                const revealed = phase === 'reveal' || state.status === 'finished';
                const correct = revealed && index === state.correctIndex;
                const incorrect = revealed && state.mySelection === index && !correct;
                const wrongPress = isCoolingDown && state.mySelection === index;
                return (
                  <button
                    type="button"
                    key={`${state.round}-${index}`}
                    className={[
                      'md-option', correct ? 'is-correct' : '', incorrect || wrongPress ? 'is-wrong' : '',
                      revealed && !correct ? 'is-dimmed' : '',
                    ].filter(Boolean).join(' ')}
                    disabled={!canAnswer}
                    onClick={() => answer(index)}
                    aria-label={`Вариант ${index + 1}: ${value}`}
                  >
                    <span className="md-option-key">{index + 1}</span><strong>{value}</strong>
                    <span className="md-option-symbol">{correct ? '✓' : (incorrect || wrongPress) ? '✕' : '↗'}</span>
                  </button>
                );
              })}
            </div>
            {phase === 'question' ? (
              <div className={`md-instruction ${isCoolingDown ? 'is-wrong' : ''}`} aria-live="polite">
                {isCoolingDown ? `✕ Неверно! Попробуй ещё через ${Math.max(.1, remainingMs(state.myLockedUntil, clock) / 1000).toFixed(1)} с` : '⚡ Нажми на правильный ответ быстрее соперника'}
              </div>
            ) : (
              <div className={`md-reveal ${state.reveal?.winner === seat ? 'is-mine' : ''}`} role="status">
                <strong>{state.reveal?.winner === seat ? '🏆 ОЧКО ТВОЁ!' : state.reveal?.winner ? '⚡ СОПЕРНИК БЫСТРЕЕ' : '⌛ ВРЕМЯ ВЫШЛО'}</strong>
                <span>{state.reveal?.message} · Ответ: {state.reveal?.correctValue}</span>
              </div>
            )}
          </>
        )}
      </main>

      <div className="md-bottom">
        <span>🎯 Победит тот, у кого больше очков после 10 раундов</span>
        <div>
          <button className="md-icon-button" type="button" onClick={() => setSoundEnabled((value) => !value)} aria-label={soundEnabled ? 'Выключить звуки' : 'Включить звуки'} title="Звук">{soundEnabled ? '🔊' : '🔇'}</button>
          <button className="md-exit-button" type="button" onClick={() => { if (state.status === 'playing') sendAction({ type: 'resign' }); if (onBack) onBack(); else window.location.hash = '#/'; }}>Выйти</button>
        </div>
      </div>

      {error && <div className="md-error" role="alert">{error}</div>}
      {result && (
        <div className="md-overlay" role="dialog" aria-modal="true" aria-label="Результат матча">
          <div className="md-result">
            <div className="md-result-icon">{isDraw ? '🤝' : amWinner ? '🏆' : '🎯'}</div>
            <div className="md-kicker">МАТЧ ЗАВЕРШЁН · {state.round} / {state.roundCount} РАУНДОВ</div>
            <h2>{isDraw ? 'НИЧЬЯ!' : amWinner ? 'ТЫ ПОБЕДИЛ!' : 'ПОБЕДИЛ СОПЕРНИК'}</h2>
            <p>{result.message}</p>
            <div className="md-result-scores"><div><small>ТВОИ ОЧКИ</small><b>{mine?.score ?? 0}</b></div><span>:</span><div><small>СОПЕРНИК</small><b>{theirs?.score ?? 0}</b></div></div>
            <button className="md-primary" type="button" onClick={findMatch}>⚔️ СЫГРАТЬ ЕЩЁ РАЗ <span>→</span></button>
            <button className="md-secondary" type="button" onClick={() => { if (onBack) onBack(); else window.location.hash = '#/'; }}>Вернуться к играм</button>
          </div>
        </div>
      )}
    </section>
  );
}
