import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './time-target-duel.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function formatSeconds(ms, digits = 2) {
  if (ms == null) return '—';
  return (ms / 1000).toFixed(digits);
}

function formatDiff(ms) {
  if (ms == null) return '—';
  return `${formatSeconds(ms, 2)} сек`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const winner = state.result?.winner;
  if (!winner) {
    return { title: 'НИЧЬЯ', icon: '🤝', tone: 'draw', text: state.result?.message || 'Одинаковая точность.' };
  }
  const won = winner === state.playerSeat;
  return {
    title: won ? 'ТЫ ПОБЕДИЛ' : 'ТЫ ПРОИГРАЛ',
    icon: won ? '🎯🏆' : '⏱️',
    tone: won ? 'win' : 'lose',
    text: state.result?.message || 'Раунд завершён.',
  };
}

export default function TimeTargetDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(0);
  const syncRef = useRef({ local: performance.now(), server: Date.now() });

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('time-target-duel');

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mine = me ? state?.timers?.[me] : null;
  const theirs = foe ? state?.timers?.[foe] : null;
  const myName = me ? state?.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state?.players?.[foe]?.name || 'Соперник' : 'Соперник';
  const result = resultPresentation(state);

  useEffect(() => {
    if (!state?.serverTime) return;
    syncRef.current = { local: performance.now(), server: state.serverTime };
  }, [state?.serverTime]);

  useEffect(() => {
    if (!state || state.status !== 'playing') return undefined;
    let frame = 0;
    const tick = () => {
      const sync = syncRef.current;
      const now = sync.server + (performance.now() - sync.local);
      setClock(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state?.status, state?.roomId]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat || !state || state.phase !== 'running' || mine?.stopped) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
      event.preventDefault();
      sendAction({ type: 'stop' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, mine?.stopped, sendAction]);

  const estimatedNow = clock || state?.serverTime || Date.now();
  const previewLeft = state?.phase === 'preview' ? Math.max(0, (state.startAt || estimatedNow) - estimatedNow) : 0;
  const elapsed = state?.phase === 'running' || state?.phase === 'finished'
    ? Math.max(0, estimatedNow - (state.startAt || estimatedNow))
    : 0;
  const timerVisible = state?.phase === 'running' && !mine?.stopped && elapsed < (state.visibleTimerMs || 3000);

  const phaseLabel = useMemo(() => {
    if (!state) return '';
    if (state.phase === 'preview') return 'ЗАПОМНИ ЦЕЛЬ';
    if (mine?.stopped && state.status === 'playing') return 'ЖДЁМ СОПЕРНИКА';
    if (state.phase === 'running' && timerVisible) return 'СМОТРИ НА ТАЙМЕР';
    if (state.phase === 'running') return 'СЧИТАЙ В ГОЛОВЕ';
    return 'РЕЗУЛЬТАТ';
  }, [state, mine?.stopped, timerVisible]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function stopTimer() {
    if (!state || state.phase !== 'running' || mine?.stopped || state.status !== 'playing') return;
    sendAction({ type: 'stop' });
  }

  function exitToMenu() {
    if (typeof onBack === 'function') onBack();
    else window.location.hash = '#/';
  }

  if (!state && !waiting) {
    return (
      <section className="tt-lobby">
        <div className="tt-lobby__clock" aria-hidden="true">12.50</div>
        <span className="eyebrow">Чувство времени · один шанс</span>
        <h1>Поймай время</h1>
        <p>
          Получаете случайную цель от 5 до 20 секунд. Секундомер виден только первые 3 секунды,
          потом исчезает. Нажми как можно ближе к цели — выигрывает меньшая разница.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="tt-waiting">
        <div className="tt-waiting__dots">05.00 · ??.?? · 20.00</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Когда соперник подключится, вам выпадет одно и то же целевое время.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const targetText = formatSeconds(state.targetMs, 2);
  const previewCount = Math.max(1, Math.ceil(previewLeft / 1000));
  const shownElapsed = timerVisible ? elapsed : mine?.stopped ? mine.elapsedMs : null;

  return (
    <section className="tt-shell">
      <header className="tt-hud">
        <div className="tt-player tt-player--you">
          <span className="tt-player__dot" />
          <div><small>ТЫ</small><strong>{myName}</strong></div>
        </div>
        <div className="tt-hud__center">
          <small>TIME TARGET</small>
          <strong>{phaseLabel}</strong>
        </div>
        <div className="tt-player tt-player--foe">
          <div><small>СОПЕРНИК</small><strong>{foeName}</strong></div>
          <span className="tt-player__dot" />
        </div>
      </header>

      <div className={`tt-arena tt-arena--${state.phase} ${state.status === 'finished' ? 'is-finished' : ''}`}>
        <div className="tt-grid" aria-hidden="true">
          {Array.from({ length: 40 }, (_, index) => <i key={index} className={index % 13 === 7 ? 'is-accent' : ''} />)}
        </div>

        <div className="tt-target-card">
          <small>ТВОЯ ЦЕЛЬ</small>
          <strong>{targetText}</strong>
          <span>СЕКУНД</span>
        </div>

        <div className={`tt-stopwatch ${!timerVisible && state.phase === 'running' && !mine?.stopped ? 'is-hidden' : ''} ${mine?.stopped ? 'is-stopped' : ''}`}>
          <small>{mine?.stopped ? 'ТВОЙ РЕЗУЛЬТАТ' : 'СЕКУНДОМЕР'}</small>
          <strong>
            {state.phase === 'preview'
              ? '0.00'
              : mine?.stopped
                ? formatSeconds(mine.elapsedMs, 2)
                : timerVisible
                  ? formatSeconds(shownElapsed, 2)
                  : '??.??'}
          </strong>
          <span>
            {mine?.stopped
              ? `разница ${formatDiff(mine.differenceMs)}`
              : timerVisible
                ? 'после 3.00 исчезнет'
                : 'теперь считай сам'}
          </span>
        </div>

        {state.phase === 'preview' && (
          <div className="tt-countdown">
            <small>СТАРТ ЧЕРЕЗ</small>
            <strong>{previewCount}</strong>
          </div>
        )}

        {state.phase === 'running' && !mine?.stopped && (
          <button type="button" className="tt-stop-button" onClick={stopTimer}>
            <span>◉</span>
            <strong>СТОП</strong>
            <small>нажми, когда думаешь, что уже {targetText}</small>
          </button>
        )}

        {state.phase === 'running' && mine?.stopped && (
          <div className="tt-wait-opponent">
            <b>ВРЕМЯ ЗАФИКСИРОВАНО</b>
            <span>Ждём, когда остановится соперник…</span>
          </div>
        )}
      </div>

      <div className="tt-help">
        <span>👀 Таймер виден только первые <b>3 секунды</b></span>
        <span>🎯 Побеждает минимальная разница с <b>{targetText}</b></span>
        <span>⌨️ На ПК можно нажать <b>ПРОБЕЛ</b></span>
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="tt-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`tt-result tt-result--${result.tone}`}>
            <div className="tt-result__icon">{result.icon}</div>
            <span className="eyebrow">Цель {targetText} сек</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>

            <div className="tt-result__comparison">
              <div className="tt-result__player">
                <small>ТЫ</small>
                <strong>{mine?.timedOut ? 'НЕ НАЖАЛ' : `${formatSeconds(mine?.elapsedMs, 2)} сек`}</strong>
                <span>Δ {mine?.timedOut ? '—' : formatDiff(mine?.differenceMs)}</span>
              </div>
              <div className="tt-result__target">
                <small>ЦЕЛЬ</small>
                <strong>{targetText}</strong>
              </div>
              <div className="tt-result__player">
                <small>СОПЕРНИК</small>
                <strong>{theirs?.timedOut ? 'НЕ НАЖАЛ' : `${formatSeconds(theirs?.elapsedMs, 2)} сек`}</strong>
                <span>Δ {theirs?.timedOut ? '—' : formatDiff(theirs?.differenceMs)}</span>
              </div>
            </div>

            <div className="tt-result__actions">
              <button className="primary-button" onClick={findMatch}>Ещё раз</button>
              <button className="secondary-button" onClick={exitToMenu}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
