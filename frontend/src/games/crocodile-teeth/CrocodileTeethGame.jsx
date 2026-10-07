import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './crocodile-teeth.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

const toothPositions = [
  { side: 'top', x: 16, y: 7, rot: 4 },
  { side: 'top', x: 30, y: 4, rot: 2 },
  { side: 'top', x: 44, y: 2, rot: 0 },
  { side: 'top', x: 58, y: 3, rot: -2 },
  { side: 'top', x: 72, y: 6, rot: -4 },
  { side: 'top', x: 86, y: 10, rot: -6 },
  { side: 'bottom', x: 15, y: 72, rot: -7 },
  { side: 'bottom', x: 29, y: 78, rot: -4 },
  { side: 'bottom', x: 43, y: 81, rot: -1 },
  { side: 'bottom', x: 57, y: 81, rot: 1 },
  { side: 'bottom', x: 71, y: 78, rot: 4 },
  { side: 'bottom', x: 85, y: 72, rot: 7 },
];

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;

  if (state.result?.type === 'disconnect') {
    return {
      kind: won ? 'win' : 'lose',
      title: won ? 'Ты победил!' : 'Матч завершён',
      text: won ? 'Соперник отключился.' : 'Соединение с матчем потеряно.',
    };
  }

  if (state.result?.type === 'resign') {
    return {
      kind: won ? 'win' : 'lose',
      title: won ? 'Ты победил!' : 'Ты проиграл',
      text: won ? 'Соперник вышел из игры.' : 'Ты вышел из игры.',
    };
  }

  return {
    kind: won ? 'win' : 'lose',
    title: won ? 'Ты выжил!' : 'Крокодил укусил!',
    text: won
      ? 'Соперник нашёл опасный зуб. Пасть захлопнулась на его ходу.'
      : 'Ты нажал опасный зуб, и пасть мгновенно захлопнулась.',
  };
}

export default function CrocodileTeethGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('crocodile-teeth');

  const pressedCount = useMemo(
    () => (state?.pressed || []).filter(Boolean).length,
    [state?.pressed],
  );

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function pressTooth(tooth) {
    if (!state || state.status !== 'playing') return;
    if (state.turn !== state.playerSeat) return;
    if (state.pressed?.[tooth]) return;
    setError('');
    sendAction({ type: 'press', payload: { tooth } });
  }

  function resign() {
    if (state?.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="ct-lobby">
        <div className="ct-lobby-croc" aria-hidden="true">
          <div className="ct-lobby-eye ct-lobby-eye--left" />
          <div className="ct-lobby-eye ct-lobby-eye--right" />
          <div className="ct-lobby-snout" />
          <div className="ct-lobby-mouth">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
        </div>
        <span className="eyebrow">2 игрока · один опасный зуб</span>
        <h1>Зубы крокодила</h1>
        <p>
          По очереди нажимайте зубы. Все выглядят одинаково, но один из них ловушка.
          Нажал его — пасть захлопнулась и ты проиграл.
        </p>
        <div className="ct-rules">
          <span>🐊 12 одинаковых зубов</span>
          <span>👉 По одному нажатию за ход</span>
          <span>💥 Опасный зуб выбирается случайно</span>
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
      <section className="ct-waiting">
        <div className="ct-waiting-croc">🐊</div>
        <span className="eyebrow">Зубы крокодила · 2 игрока</span>
        <h2>Ждём второго игрока…</h2>
        <p>Когда соперник подключится, один из зубов тайно станет опасным.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const me = state.playerSeat;
  const opponent = state.opponentSeat;
  const myName = state.players?.[me]?.name || playerName;
  const opponentName = state.players?.[opponent]?.name || 'Соперник';
  const myTurn = state.status === 'playing' && state.turn === me;
  const biting = state.status === 'finished' && state.result?.type === 'bite';
  const result = resultPresentation(state);

  return (
    <section className="ct-match">
      <div className="ct-topbar">
        <div className={`ct-player ${myTurn ? 'is-turn' : ''}`}>
          <span className="ct-player-dot ct-player-dot--blue" />
          <div><small>ТЫ</small><strong>{myName}</strong></div>
        </div>
        <div className="ct-center-status">
          <small>{state.status === 'playing' ? 'ХОД' : 'ФИНИШ'}</small>
          <strong>{state.status === 'playing' ? (myTurn ? 'Твой ход' : 'Ход соперника') : 'Пасть закрылась'}</strong>
          <span>{pressedCount} из {state.toothCount} зубов нажато</span>
        </div>
        <div className={`ct-player ct-player--right ${state.turn === opponent && state.status === 'playing' ? 'is-turn' : ''}`}>
          <div><small>СОПЕРНИК</small><strong>{opponentName}</strong></div>
          <span className="ct-player-dot ct-player-dot--red" />
        </div>
      </div>

      <div className={`ct-arena ${biting ? 'is-biting' : ''}`}>
        <div className="ct-bg-rings" aria-hidden="true" />
        <div className="ct-croc">
          <div className="ct-head-top">
            <div className="ct-brow ct-brow--left" />
            <div className="ct-brow ct-brow--right" />
            <div className="ct-eye ct-eye--left"><i /></div>
            <div className="ct-eye ct-eye--right"><i /></div>
            <div className="ct-snout">
              <span /><span />
            </div>
          </div>

          <div className="ct-mouth">
            <div className="ct-mouth-depth" />
            <div className="ct-tongue" />
            {(state.pressed || []).map((isPressed, index) => {
              const pos = toothPositions[index];
              const isBad = state.status === 'finished' && state.badTooth === index;
              const isLast = state.lastMove?.tooth === index;
              const canPress = state.status === 'playing' && myTurn && !isPressed;
              return (
                <button
                  type="button"
                  key={index}
                  className={`ct-tooth ct-tooth--${pos.side} ${isPressed ? 'is-pressed' : ''} ${isBad ? 'is-bad' : ''} ${isLast ? 'is-last' : ''}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--rot': `${pos.rot}deg` }}
                  disabled={!canPress}
                  onClick={() => pressTooth(index)}
                  aria-label={`Зуб ${index + 1}${isPressed ? ', уже нажат' : ''}`}
                >
                  <span />
                </button>
              );
            })}
          </div>

          <div className="ct-jaw-bottom" />
        </div>

        {state.status === 'playing' && (
          <div className={`ct-prompt ${myTurn ? 'is-yours' : ''}`}>
            {myTurn ? 'Выбери любой зуб' : 'Соперник выбирает зуб…'}
          </div>
        )}

        {error && <div className="game-error ct-error">{error}</div>}
      </div>

      {state.status === 'playing' && (
        <button type="button" className="danger-button ct-resign" onClick={resign}>Выйти</button>
      )}

      {result && (
        <div className="ct-result" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`ct-result-card ct-result-card--${result.kind}`}>
            <div className="ct-result-icon">{result.kind === 'win' ? '🏆' : '🐊'}</div>
            <span className="eyebrow">Матч завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="ct-result-actions">
              <button type="button" className="primary-button" onClick={findMatch}>Ещё раз</button>
              <button type="button" className="secondary-button" onClick={onBack}>В меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
