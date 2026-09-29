import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './tap-race.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  let text = state.result?.message || 'Матч завершён.';
  if (state.result?.type === 'disconnect') text = won ? 'Соперник отключился от гонки.' : 'Соединение с матчем потеряно.';
  if (state.result?.type === 'resign') text = won ? 'Соперник покинул гонку.' : 'Вы покинули гонку.';
  return {
    won,
    title: won ? 'Вы победили!' : 'Вы проиграли',
    icon: won ? '🏆' : '🏁',
    text,
  };
}

function RaceCar({ color, progress, mine, tapping }) {
  const left = `calc(${Math.max(0, Math.min(1, progress)) * 84}% + 5%)`;
  return (
    <div
      className={`tap-race-car tap-race-car--${color} ${mine ? 'is-mine' : ''} ${tapping ? 'is-tapping' : ''}`}
      style={{ left }}
      aria-hidden="true"
    >
      <span className="tap-race-car__shadow" />
      <span className="tap-race-car__body">
        <i className="tap-race-car__window" />
        <i className="tap-race-car__stripe" />
      </span>
      <span className="tap-race-car__wheel tap-race-car__wheel--top" />
      <span className="tap-race-car__wheel tap-race-car__wheel--bottom" />
      {mine && <span className="tap-race-car__you">ТЫ</span>}
    </div>
  );
}

export default function TapRaceGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const pendingTapsRef = useRef(0);
  const flushTimerRef = useRef(null);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('tap-race');

  const mySeat = state?.playerSeat;
  const opponentSeat = state?.opponentSeat;
  const myCar = mySeat ? state?.cars?.[mySeat] : null;
  const opponentCar = opponentSeat ? state?.cars?.[opponentSeat] : null;
  const myScore = mySeat ? (state?.scores?.[mySeat] ?? 0) : 0;
  const opponentScore = opponentSeat ? (state?.scores?.[opponentSeat] ?? 0) : 0;
  const myName = mySeat ? (state?.players?.[mySeat]?.name || playerName) : playerName;
  const opponentName = opponentSeat ? (state?.players?.[opponentSeat]?.name || 'Соперник') : 'Соперник';
  const result = resultPresentation(state);
  const canTap = state?.status === 'playing' && state?.phase === 'racing';

  const countdownLabel = useMemo(() => {
    if (state?.phase !== 'countdown') return null;
    const ms = state.countdownLeftMs ?? 0;
    if (ms <= 450) return 'GO!';
    return String(Math.max(1, Math.ceil(ms / 800)));
  }, [state?.phase, state?.countdownLeftMs]);

  useEffect(() => () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
  }, []);

  function flushTaps() {
    flushTimerRef.current = null;
    const count = Math.min(4, pendingTapsRef.current);
    pendingTapsRef.current = Math.max(0, pendingTapsRef.current - count);
    if (count > 0 && canTap) sendAction({ type: 'tap-batch', count });
    if (pendingTapsRef.current > 0 && canTap) {
      flushTimerRef.current = setTimeout(flushTaps, 45);
    }
  }

  function findMatch() {
    pendingTapsRef.current = 0;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    setError('');
    startMatch(playerName);
  }

  function tapGas(event) {
    event.preventDefault();
    if (!canTap) return;
    pendingTapsRef.current = Math.min(12, pendingTapsRef.current + 1);
    if (!flushTimerRef.current) flushTimerRef.current = setTimeout(flushTaps, 35);
  }

  function exitToMenu() {
    if (typeof onBack === 'function') onBack();
    else window.location.hash = '#/';
  }

  if (!state && !waiting) {
    return (
      <section className="tap-race-lobby">
        <div className="tap-race-lobby__icon">🏎️</div>
        <span className="eyebrow">Жми быстрее · инерция · до 2 побед</span>
        <h1>Гонка на кликах</h1>
        <p>
          Каждый тап разгоняет машину. Перестал нажимать — скорость плавно падает, поэтому машина ещё катится по инерции.
          Есть предельная скорость: даже автокликер не разгонит её бесконечно.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="tap-race-waiting">
        <div className="tap-race-waiting__car">🏎️</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго гонщика…</h2>
        <p>Заезд начнётся автоматически, когда второй игрок нажмёт поиск.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="tap-race-game">
      <div className="tap-race-hud">
        <div className="tap-race-hud__player tap-race-hud__player--you">
          <span className="tap-race-hud__dot" />
          <div><small>Ты</small><strong>{myName}</strong></div>
          <b>{myScore}</b>
        </div>

        <div className="tap-race-score">
          <small>Раунд {state.round} · до {state.winsToMatch} побед</small>
          <strong>{myScore} : {opponentScore}</strong>
          <span>{state.phase === 'racing' ? 'ГОНКА' : state.phase === 'countdown' ? 'СТАРТ' : 'ФИНИШ'}</span>
        </div>

        <div className="tap-race-hud__player tap-race-hud__player--opponent">
          <b>{opponentScore}</b>
          <div><small>Соперник</small><strong>{opponentName}</strong></div>
          <span className="tap-race-hud__dot" />
        </div>
      </div>

      <div className="tap-race-track-wrap">
        <div className="tap-race-track">
          <div className="tap-race-scenery tap-race-scenery--top" />
          <div className="tap-race-finish-line" aria-hidden="true" />

          <div className="tap-race-lane tap-race-lane--opponent">
            <span className="tap-race-lane__label">СОПЕРНИК</span>
            <div className="tap-race-road-dashes" />
            <RaceCar
              color="blue"
              progress={opponentCar?.progress ?? 0}
              mine={false}
              tapping={opponentCar?.tapping}
            />
          </div>

          <div className="tap-race-lane-divider" />

          <div className="tap-race-lane tap-race-lane--mine">
            <span className="tap-race-lane__label">ТВОЯ ДОРОЖКА</span>
            <div className="tap-race-road-dashes" />
            <RaceCar
              color="red"
              progress={myCar?.progress ?? 0}
              mine
              tapping={myCar?.tapping}
            />
          </div>

          <div className="tap-race-scenery tap-race-scenery--bottom" />

          {countdownLabel && (
            <div className={`tap-race-countdown ${countdownLabel === 'GO!' ? 'is-go' : ''}`} aria-live="polite">
              {countdownLabel}
            </div>
          )}

          {state.phase === 'round-over' && state.status === 'playing' && (
            <div className="tap-race-round-banner" aria-live="polite">
              <span>{state.roundWinner === mySeat ? '🏁✨' : state.roundWinner ? '🏁' : '🤝'}</span>
              <strong>
                {state.roundWinner === mySeat ? 'Ты выиграл заезд!' : state.roundWinner ? 'Соперник выиграл заезд' : 'Одновременный финиш'}
              </strong>
              <small>{state.roundMessage}</small>
            </div>
          )}
        </div>
      </div>

      <div className="tap-race-controls">
        <div className="tap-race-speed-panel">
          <div className="tap-race-speed-panel__row">
            <span>Твоя скорость</span>
            <strong>{Math.round(myCar?.speed ?? 0)}</strong>
          </div>
          <div className="tap-race-speed-bar">
            <i style={{ width: `${Math.round((myCar?.speedRatio ?? 0) * 100)}%` }} />
          </div>
          <small>Отпустил кнопку — машина продолжит катиться и постепенно замедлится.</small>
        </div>

        <button
          type="button"
          className={`tap-race-gas ${canTap ? '' : 'is-disabled'}`}
          onPointerDown={tapGas}
          onContextMenu={(event) => event.preventDefault()}
          disabled={!canTap}
          aria-label="Добавить скорость"
        >
          <span>⚡</span>
          <strong>ЖМИ!</strong>
          <small>каждый тап = ускорение</small>
        </button>
      </div>

      <div className="tap-race-bottom-actions">
        <span>Максимальная скорость ограничена сервером.</span>
        {state.status === 'playing' && (
          <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти из гонки</button>
        )}
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="tap-race-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`tap-race-result ${result.won ? 'is-win' : 'is-lose'}`}>
            <div className="tap-race-result__icon">{result.icon}</div>
            <span className="eyebrow">Матч завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="tap-race-result__score">{myScore} : {opponentScore}</div>
            <div className="tap-race-result__actions">
              <button className="primary-button" onClick={exitToMenu}>Выйти в главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Найти нового соперника</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
