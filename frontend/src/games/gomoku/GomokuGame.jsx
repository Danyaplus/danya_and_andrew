import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './gomoku.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function colorLabel(color) {
  return color === 'black' ? 'Чёрные' : 'Белые';
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  if (state.result?.type === 'draw') {
    return {
      kind: 'draw',
      icon: '🤝',
      title: 'Ничья',
      text: state.result.message || 'Поле заполнено.',
    };
  }

  const won = state.result?.winner === state.playerColor;
  let text = state.result?.message || 'Матч завершён.';

  if (state.result?.type === 'disconnect') {
    text = won ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  } else if (state.result?.type === 'resign') {
    text = won ? 'Соперник сдался.' : 'Вы сдались.';
  } else if (state.result?.type === 'win') {
    text = won ? 'Ты первым собрал пять фишек подряд.' : 'Соперник собрал пять фишек подряд.';
  }

  return {
    kind: won ? 'win' : 'lose',
    icon: won ? '🏆' : '✦',
    title: won ? 'Ты победил!' : 'Ты проиграл',
    text,
  };
}

function turnText(state) {
  if (!state || state.status !== 'playing') return '';
  return state.turn === state.playerColor ? 'Твой ход' : 'Ход соперника';
}

export default function GomokuGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('gomoku');

  const winningCells = useMemo(
    () => new Set(state?.result?.line || []),
    [state?.result?.line],
  );

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function place(cell) {
    if (!state || state.status !== 'playing') return;
    if (state.turn !== state.playerColor) return;
    if (state.board?.[cell]) return;

    setError('');
    sendAction({ type: 'place', payload: { cell } });
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="gomoku-lobby">
        <div className="gomoku-lobby__stones" aria-hidden="true">
          <span className="gomoku-stone gomoku-stone--black" />
          <span className="gomoku-stone gomoku-stone--white" />
          <span className="gomoku-stone gomoku-stone--black" />
          <span className="gomoku-stone gomoku-stone--white" />
          <span className="gomoku-stone gomoku-stone--black" />
        </div>
        <span className="eyebrow">10 × 10 · пять в ряд</span>
        <h1>Гомоку</h1>
        <p>
          По очереди ставьте фишки на поле. Побеждает тот, кто первым соберёт
          пять своих фишек подряд по горизонтали, вертикали или диагонали.
        </p>
        <div className="gomoku-rules">
          <span>⚫ Чёрные ходят первыми</span>
          <span>🎯 Нужно 5 подряд</span>
          <span>↗ Горизонталь · вертикаль · диагональ</span>
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
      <section className="gomoku-waiting">
        <div className="gomoku-waiting__spinner" />
        <span className="eyebrow">Гомоку · 2 игрока</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только второй игрок запустит Гомоку, матч начнётся автоматически.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>
          Отменить поиск
        </button>
      </section>
    );
  }

  const myColor = state.playerColor;
  const opponentColor = myColor === 'black' ? 'white' : 'black';
  const myName = state.players?.[myColor]?.name || playerName;
  const opponentName = state.players?.[opponentColor]?.name || 'Соперник';
  const result = resultPresentation(state);

  return (
    <section className="gomoku-match">
      <div className="gomoku-topbar">
        <div className={`gomoku-player ${state.turn === myColor && state.status === 'playing' ? 'is-turn' : ''}`}>
          <span className={`gomoku-mini-stone gomoku-mini-stone--${myColor}`} />
          <div>
            <strong>{myName} <em>ты</em></strong>
            <small>{colorLabel(myColor)}</small>
          </div>
        </div>

        <div className="gomoku-status">
          <small>ХОД</small>
          <strong>{state.status === 'playing' ? turnText(state) : 'Матч окончен'}</strong>
          <span>{state.moveNumber || 0} ходов</span>
        </div>

        <div className={`gomoku-player gomoku-player--right ${state.turn === opponentColor && state.status === 'playing' ? 'is-turn' : ''}`}>
          <div>
            <strong>{opponentName}</strong>
            <small>{colorLabel(opponentColor)}</small>
          </div>
          <span className={`gomoku-mini-stone gomoku-mini-stone--${opponentColor}`} />
        </div>
      </div>

      <div className="gomoku-content">
        <div className="gomoku-board-shell">
          <div className="gomoku-board" role="grid" aria-label="Поле Гомоку 10 на 10">
            {(state.board || []).map((color, cell) => {
              const canPlace = state.status === 'playing' && state.turn === myColor && !color;
              const isLast = state.lastMove?.cell === cell;
              const isWinning = winningCells.has(cell);

              return (
                <button
                  type="button"
                  role="gridcell"
                  key={cell}
                  className={`gomoku-cell ${canPlace ? 'is-legal' : ''} ${isLast ? 'is-last' : ''} ${isWinning ? 'is-winning' : ''}`}
                  disabled={!canPlace}
                  onClick={() => place(cell)}
                  aria-label={`Клетка ${cell + 1}${color ? `, ${colorLabel(color)}` : ''}`}
                >
                  {color && (
                    <span className={`gomoku-piece gomoku-piece--${color}`} aria-hidden="true" />
                  )}
                  {!color && canPlace && <span className="gomoku-hover-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="gomoku-side">
          <div className="gomoku-rule-card">
            <span className="eyebrow">Цель</span>
            <h3>Собери 5 подряд</h3>
            <p>Линия может идти по горизонтали, вертикали или любой диагонали.</p>
          </div>

          <div className="gomoku-turn-card">
            <span className={`gomoku-big-stone gomoku-big-stone--${state.turn}`} />
            <div>
              <small>Сейчас ходят</small>
              <strong>{colorLabel(state.turn)}</strong>
            </div>
          </div>

          {error && <div className="game-error">{error}</div>}

          {state.status === 'playing' && (
            <button type="button" className="danger-button" onClick={resign}>
              Сдаться
            </button>
          )}
        </aside>
      </div>

      {result && (
        <div className="gomoku-result" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`gomoku-result__card gomoku-result__card--${result.kind}`}>
            <div className="gomoku-result__icon">{result.icon}</div>
            <span className="eyebrow">Матч завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="gomoku-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>
                Найти нового соперника
              </button>
              <button type="button" className="secondary-button" onClick={onBack}>
                Выйти в меню
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
