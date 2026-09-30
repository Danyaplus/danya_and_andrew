import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './cat-fishing.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;

  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function FishIcon({ type }) {
  const black = type === 'black';

  return (
    <svg viewBox="0 0 140 90" className="cf-fish-svg" aria-hidden="true">
      <path
        d="M25 45 C11 31 8 18 11 14 C22 15 35 22 44 31 C56 17 78 11 99 17 C119 23 132 36 132 45 C132 54 119 67 99 73 C78 79 56 73 44 59 C35 68 22 75 11 76 C8 72 11 59 25 45 Z"
        className={black ? 'cf-fish-svg__body is-black' : 'cf-fish-svg__body'}
      />
      <circle cx="104" cy="36" r="6" className="cf-fish-svg__eye-white" />
      <circle cx="106" cy="36" r="2.7" className="cf-fish-svg__eye" />

      {black && (
        <g className="cf-fish-svg__danger">
          <path d="M70 34 L76 23 L82 34 L94 31 L88 42 L99 47 L87 51 L90 64 L78 58 L70 68 L67 55 L54 58 L60 47 L50 39 L63 39 Z" />
          <circle cx="75" cy="47" r="5" />
        </g>
      )}
    </svg>
  );
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  if (state.result?.draw) {
    return {
      title: 'НИЧЬЯ',
      text: state.result.message || 'После двух раундов ничья.',
    };
  }

  const won = state.result?.winner === state.playerSeat;

  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || '',
  };
}

export default function CatFishingGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const lastPressRef = useRef(0);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('cat-fishing');

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const canCatch = state?.status === 'playing' && state?.phase === 'playing' && !!state?.fish;
  const result = resultPresentation(state);

  useEffect(() => {
    if (!state) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space') return;
      if (event.target?.matches?.('input, textarea, select, button')) return;

      event.preventDefault();
      catchFish();
    }

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function catchFish() {
    if (!canCatch) return;

    const stamp = performance.now();
    if (stamp - lastPressRef.current < 80) return;

    lastPressRef.current = stamp;
    sendAction({ type: 'catch' });
  }

  if (!state && !waiting) {
    return (
      <section className="cf-lobby">
        <div className="cf-lobby__fish">
          <span>🐾</span>
          <span>🐟</span>
          <span>🐾</span>
        </div>

        <span className="eyebrow">Реакция · 2 игрока · 2 раунда</span>
        <h1>Кошачья рыбалка</h1>

        <p>
          Жми кнопку раньше соперника. Жёлтая рыба даёт +1, чёрная взрывается и снимает 1 очко.
          Первый до 3 очков забирает раунд.
        </p>

        <div className="cf-rules">
          <span><b className="is-gold">+1</b> жёлтая рыба</span>
          <span><b className="is-black">−1</b> чёрная рыба</span>
          <span><b>3</b> очка для победы</span>
        </div>

        {error && <div className="game-error">{error}</div>}

        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>
          Найти соперника
        </button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="cf-waiting">
        <div className="cf-waiting__icon">🐱🐟</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго кота…</h2>
        <p>Матч начнётся автоматически.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>
          Отменить поиск
        </button>
      </section>
    );
  }

  if (!state) return null;

  const myScore = me ? state.roundScores?.[me] ?? 0 : 0;
  const foeScore = foe ? state.roundScores?.[foe] ?? 0 : 0;
  const myRoundWins = me ? state.roundWins?.[me] ?? 0 : 0;
  const foeRoundWins = foe ? state.roundWins?.[foe] ?? 0 : 0;
  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';

  const countdown = state.phase === 'countdown'
    ? Math.max(1, Math.ceil((state.countdownEndsAt - now) / 750))
    : null;

  const ownSide = me === 'b' ? 'right' : 'left';
  const foeSide = ownSide === 'left' ? 'right' : 'left';

  return (
    <section className="cf-shell">
      <header className="cf-topbar">
        <div className="cf-player">
          <span className={`cf-player__cat cf-player__cat--${ownSide}`}>🐱</span>
          <div>
            <small>{myName}</small>
            <strong>{myScore}</strong>
          </div>
        </div>

        <div className="cf-round-card">
          <small>РАУНД</small>
          <strong>{state.round}/{state.totalRounds}</strong>
          <span>{myRoundWins}:{foeRoundWins}</span>
        </div>

        <div className="cf-player cf-player--right">
          <div>
            <small>{foeName}</small>
            <strong>{foeScore}</strong>
          </div>
          <span className={`cf-player__cat cf-player__cat--${foeSide}`}>🐱</span>
        </div>
      </header>

      <div className="cf-table">
        <div className="cf-table__shine" />

        <div className="cf-cat-seat cf-cat-seat--left" aria-hidden="true">
          <div className="cf-cat-face">🐱</div>
          <div className="cf-arm">🐾</div>
        </div>

        <div className="cf-cat-seat cf-cat-seat--right" aria-hidden="true">
          <div className="cf-cat-face">🐱</div>
          <div className="cf-arm">🐾</div>
        </div>

        {state.fish && (
          <button
            type="button"
            className={`cf-fish cf-fish--${state.fish.type}`}
            style={{
              left: `${state.fish.x}%`,
              top: `${state.fish.y}%`,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              catchFish();
            }}
            aria-label={state.fish.type === 'gold' ? 'Жёлтая рыба' : 'Чёрная рыба'}
          >
            <FishIcon type={state.fish.type} />
          </button>
        )}

        {state.effect && (
          <div
            key={state.effect.id}
            className={`cf-catch-effect cf-catch-effect--${state.effect.type} ${
              state.effect.seat === me ? 'is-mine' : 'is-foe'
            }`}
            style={{
              left: `${state.effect.x}%`,
              top: `${state.effect.y}%`,
            }}
          >
            <span>{state.effect.type === 'gold' ? '+1' : '−1'}</span>
            <b>{state.effect.type === 'gold' ? '✨' : '💥'}</b>
          </div>
        )}

        {state.phase === 'countdown' && (
          <div className="cf-overlay">
            <span>РАУНД {state.round}</span>
            <strong>{countdown}</strong>
            <small>ЖМИ БЫСТРЕЕ СОПЕРНИКА</small>
          </div>
        )}

        {state.phase === 'round-over' && (
          <div className="cf-overlay cf-overlay--round">
            <span>РАУНД {state.round} ЗАВЕРШЁН</span>
            <strong>{state.roundWinner === me ? 'ТВОЙ!' : 'СОПЕРНИКА'}</strong>
            <small>{state.roundMessage}</small>
          </div>
        )}
      </div>

      <button
        type="button"
        className="cf-catch-button"
        disabled={!canCatch}
        onPointerDown={(event) => {
          event.preventDefault();
          catchFish();
        }}
      >
        <span>🐾</span>
        <b>{canCatch ? 'ХВАТАЙ!' : 'ЖДИ РЫБУ…'}</b>
        <small>или нажми Space</small>
      </button>

      <p className="cf-tip">
        Жёлтая = +1 · Чёрная = −1 · Первый до 3 очков выигрывает раунд
      </p>

      {result && (
        <div className="cf-result">
          <div className="cf-result__card">
            <span>Кошачья рыбалка</span>
            <div className="cf-result__icon">🐱🐟🐱</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>

            <div className="cf-result__score">
              <strong>{myRoundWins}</strong>
              <span>:</span>
              <strong>{foeRoundWins}</strong>
            </div>

            <div className="cf-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>
                Новый соперник
              </button>
              <button type="button" className="secondary-button" onClick={onBack}>
                Все игры
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
