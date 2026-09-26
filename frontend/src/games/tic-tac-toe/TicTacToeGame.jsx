import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './tic-tac-toe.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function formatClock(milliseconds = 0) {
  const safe = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function symbolLabel(symbol) {
  return symbol === 'x' ? 'Крестики' : 'Нолики';
}

function statusText(state) {
  if (!state) return '';
  if (state.status === 'finished') return state.result?.message || 'Матч завершён';
  if (state.turn !== state.playerSymbol) return 'Ход соперника';
  if (state.expiringCell !== null && state.expiringCell !== undefined) {
    return 'Твой старый знак сейчас исчезнет';
  }
  return 'Твой ход';
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  const result = state.result || {};
  const didWin = result.winner === state.playerSymbol;

  let text = result.message || 'Матч завершён.';
  if (result.type === 'disconnect') {
    text = didWin ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  } else if (result.type === 'timeout') {
    text = didWin ? 'У соперника закончилось время.' : 'У вас закончилось время.';
  } else if (result.type === 'resign') {
    text = didWin ? 'Соперник сдался.' : 'Вы сдались.';
  } else if (result.type === 'win') {
    text = didWin ? 'Три твоих знака выстроились в ряд.' : 'Соперник собрал три знака в ряд.';
  }

  return {
    kind: didWin ? 'win' : 'lose',
    icon: didWin ? '🏆' : '✦',
    title: didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}

export default function TicTacToeGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('tic-tac-toe');

  const legalTargets = useMemo(
    () => new Set(state?.legalTargets || []),
    [state?.legalTargets],
  );

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
    if (state.turn !== state.playerSymbol) return;
    if (!legalTargets.has(cell)) return;

    setError('');
    sendAction({
      type: 'place',
      payload: { cell },
    });
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="ttt-lobby">
        <div className="ttt-lobby__mark" aria-hidden="true">
          <span className="ttt-lobby__x">×</span>
          <span className="ttt-lobby__o">○</span>
        </div>
        <span className="eyebrow">По 3 знака на поле</span>
        <h1>Крестики-нолики</h1>
        <p>
          У каждого игрока одновременно может быть только три знака. Когда ставишь четвёртый,
          самый старый знак мигает и исчезает — так что ничьей из-за заполненного поля здесь нет.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>
          Найти соперника
        </button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="ttt-waiting-card">
        <div className="ttt-waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только второй игрок откроет «Крестики-нолики» и нажмёт поиск, матч начнётся.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const mySymbol = state.playerSymbol;
  const opponentSymbol = mySymbol === 'x' ? 'o' : 'x';
  const myName = state.players?.[mySymbol]?.name || playerName;
  const opponentName = state.players?.[opponentSymbol]?.name || 'Соперник';
  const myClock = state.clocks?.[mySymbol] ?? 0;
  const opponentClock = state.clocks?.[opponentSymbol] ?? 0;
  const myMarks = state.marks?.[mySymbol]?.length ?? 0;
  const opponentMarks = state.marks?.[opponentSymbol]?.length ?? 0;
  const result = resultPresentation(state);
  const expiringCell = state.expiringCell;
  const expiringBelongsToMe = state.turn === mySymbol;

  return (
    <section className="ttt-match">
      <div className={`ttt-turn-chip ${state.turn === mySymbol && state.status === 'playing' ? 'is-active' : ''}`}>
        {statusText(state)}
      </div>

      <div className="ttt-layout">
        <div className="ttt-game-column">
          <div className={`ttt-player-card ${state.turn === opponentSymbol && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="ttt-player-card__identity">
              <span className={`ttt-symbol-badge ttt-symbol-badge--${opponentSymbol}`}>
                {opponentSymbol === 'x' ? '×' : '○'}
              </span>
              <div>
                <strong>{opponentName}</strong>
                <small>{symbolLabel(opponentSymbol)} · {opponentMarks}/3</small>
              </div>
            </div>
            <div className={`ttt-clock ${state.turn === opponentSymbol && state.status === 'playing' ? 'is-running' : ''} ${opponentClock <= 30000 ? 'is-low' : ''}`}>
              {formatClock(opponentClock)}
            </div>
          </div>

          <div className="ttt-board" role="grid" aria-label="Поле крестики-нолики">
            {(state.board || []).map((symbol, cell) => {
              const isExpiring = expiringCell === cell && state.status === 'playing';
              const isLegal = state.turn === mySymbol && legalTargets.has(cell);
              const isLastPlaced = state.lastMove?.cell === cell;
              const wasRemoved = state.lastMove?.removed === cell && state.lastMove?.cell !== cell;
              const isWinning = winningCells.has(cell);

              return (
                <button
                  type="button"
                  role="gridcell"
                  key={cell}
                  className={`ttt-cell ${symbol ? 'is-occupied' : 'is-empty'} ${isLegal ? 'is-legal' : ''} ${isExpiring ? 'is-expiring' : ''} ${isLastPlaced ? 'is-last' : ''} ${wasRemoved ? 'was-removed' : ''} ${isWinning ? 'is-winning' : ''}`}
                  onClick={() => place(cell)}
                  disabled={state.status !== 'playing' || state.turn !== mySymbol || !isLegal}
                  aria-label={`Клетка ${cell + 1}${symbol ? `, ${symbol === 'x' ? 'крестик' : 'нолик'}` : ''}`}
                >
                  {symbol && (
                    <span className={`ttt-mark ttt-mark--${symbol}`} aria-hidden="true">
                      {symbol === 'x' ? '×' : '○'}
                    </span>
                  )}
                  {!symbol && isLegal && <span className="ttt-placement-dot" aria-hidden="true" />}
                  {isExpiring && (
                    <span className="ttt-expiring-label">
                      {expiringBelongsToMe ? 'исчезнет' : 'старый'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={`ttt-player-card ${state.turn === mySymbol && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="ttt-player-card__identity">
              <span className={`ttt-symbol-badge ttt-symbol-badge--${mySymbol}`}>
                {mySymbol === 'x' ? '×' : '○'}
              </span>
              <div>
                <strong>{myName} <span className="ttt-you-label">ты</span></strong>
                <small>{symbolLabel(mySymbol)} · {myMarks}/3</small>
              </div>
            </div>
            <div className={`ttt-clock ${state.turn === mySymbol && state.status === 'playing' ? 'is-running' : ''} ${myClock <= 30000 ? 'is-low' : ''}`}>
              {formatClock(myClock)}
            </div>
          </div>
        </div>

        <aside className="ttt-side-panel">
          <div>
            <span className="eyebrow">Как ходить</span>
            <h3>{statusText(state)}</h3>
            <p>
              {state.turn === mySymbol && expiringCell !== null && expiringCell !== undefined
                ? 'Мигающий знак — самый старый. Как только ты выберешь новую клетку, он исчезнет, а новый знак появится на выбранном месте.'
                : 'Нажми на свободную клетку. Побеждает тот, кто первым соберёт три своих знака по горизонтали, вертикали или диагонали.'}
            </p>
          </div>

          <div className="ttt-rule-strip" aria-label="Лимит знаков">
            <span>1</span><span>2</span><span>3</span><span className="ttt-rule-strip__arrow">→</span><span>↻</span>
            <small>четвёртый заменяет самый старый</small>
          </div>

          {error && <div className="game-error">{error}</div>}
          {state.status === 'playing' && (
            <button className="danger-button" onClick={resign}>Сдаться</button>
          )}
        </aside>
      </div>

      {result && (
        <div className="ttt-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`ttt-result-card ttt-result-card--${result.kind}`}>
            <span className="ttt-result-spark ttt-result-spark--one">✦</span>
            <span className="ttt-result-spark ttt-result-spark--two">✦</span>
            <span className="ttt-result-spark ttt-result-spark--three">✦</span>
            <div className="ttt-result-icon">{result.icon}</div>
            <span className="ttt-result-kicker">Матч завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="ttt-result-actions">
              <button type="button" className="primary-button ttt-result-main-button" onClick={onBack}>
                Выйти в главное меню
              </button>
              <button type="button" className="secondary-button ttt-result-rematch-button" onClick={findMatch}>
                Найти нового соперника
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
