import { useEffect, useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './checkers.css';

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

function cellTone(row, col) {
  return (row + col) % 2 === 0 ? 'light' : 'dark';
}

function statusText(state) {
  if (!state) return '';
  if (state.status === 'finished') return state.result?.message || 'Матч завершён';
  if (state.turn !== state.playerColor) return 'Ход соперника';
  if (state.forcedFrom) return 'Продолжай взятие';
  const hasCapture = state.legalMoves?.some((move) => move.capture);
  return hasCapture ? 'Твой ход · нужно рубить' : 'Твой ход';
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  const result = state.result || {};
  const isDraw = !result.winner;
  const didWin = result.winner === state.playerColor;

  if (isDraw) {
    return {
      kind: 'draw',
      icon: '🤝',
      title: 'Ничья',
      text: result.message || 'Партия завершилась вничью.',
    };
  }

  let text = result.message || 'Партия завершена.';
  if (result.type === 'disconnect') {
    text = didWin ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  } else if (result.type === 'timeout') {
    text = didWin ? 'У соперника закончилось время.' : 'У вас закончилось время.';
  } else if (result.type === 'resign') {
    text = didWin ? 'Соперник сдался.' : 'Вы сдались.';
  } else if (result.type === 'no-moves') {
    text = didWin ? 'У соперника не осталось допустимых ходов.' : 'У вас не осталось допустимых ходов.';
  }

  return {
    kind: didWin ? 'win' : 'lose',
    icon: didWin ? '🏆' : '⛀',
    title: didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}

export default function CheckersGame({ onBack }) {
  const [selected, setSelected] = useState(null);
  const [playerName] = useState(getPlayerName);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch: cancelMatchSearch,
    sendAction,
  } = useMultiplayerGame('checkers');

  useEffect(() => {
    if (state?.status === 'playing' && state.turn === state.playerColor && state.forcedFrom) {
      setSelected(state.forcedFrom);
    }
  }, [state?.forcedFrom, state?.playerColor, state?.status, state?.turn]);

  const orientedBoard = useMemo(() => {
    if (!state?.board) return [];
    const cells = [];

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const sourceRow = state.playerColor === 'b' ? 7 - row : row;
        const sourceCol = state.playerColor === 'b' ? 7 - col : col;
        const piece = state.board[sourceRow][sourceCol];
        const file = String.fromCharCode(97 + sourceCol);
        const rank = 8 - sourceRow;

        cells.push({
          row,
          col,
          square: `${file}${rank}`,
          piece,
        });
      }
    }

    return cells;
  }, [state]);

  const movesFromSelected = useMemo(() => {
    if (!selected || !state?.legalMoves) return [];
    return state.legalMoves.filter((move) => move.from === selected);
  }, [selected, state]);

  const legalTargets = useMemo(
    () => new Set(movesFromSelected.map((move) => move.to)),
    [movesFromSelected],
  );

  const legalSources = useMemo(
    () => new Set((state?.legalMoves || []).map((move) => move.from)),
    [state?.legalMoves],
  );

  function findMatch() {
    setError('');
    setSelected(null);
    startMatch(playerName);
  }

  function cancelSearch() {
    cancelMatchSearch();
  }

  function handleCellClick(square, piece) {
    if (!state || state.status !== 'playing') return;
    if (state.turn !== state.playerColor) return;

    if (piece?.color === state.playerColor) {
      if (state.forcedFrom && square !== state.forcedFrom) return;
      if (legalSources.has(square)) setSelected(square);
      return;
    }

    if (!selected || !legalTargets.has(square)) return;

    sendAction({
      type: 'move',
      payload: { from: selected, to: square },
    });

    setSelected(null);
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="checkers-lobby">
        <div className="checkers-lobby__icon">⛀</div>
        <span className="eyebrow">10 минут каждому</span>
        <h1>Шашки</h1>
        <p>
          Русские шашки: взятие обязательно, можно рубить назад, серии взятий продолжаются,
          а дамка ходит по всей диагонали.
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
      <section className="checkers-waiting-card">
        <div className="checkers-waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только второй игрок выберет «Шашки» и нажмёт поиск, матч начнётся.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const myColor = state.playerColor;
  const opponentColor = myColor === 'w' ? 'b' : 'w';
  const myName = state.players?.[myColor]?.name || playerName;
  const opponentName = state.players?.[opponentColor]?.name || 'Соперник';
  const myClock = state.clocks?.[myColor] ?? 0;
  const opponentClock = state.clocks?.[opponentColor] ?? 0;
  const result = resultPresentation(state);
  const pendingCaptured = new Set(state.pendingCaptured || []);

  return (
    <section className="checkers-match">
      <div className={`checkers-turn-chip ${state.turn === myColor && state.status === 'playing' ? 'is-active' : ''}`}>
        {statusText(state)}
      </div>

      <div className="checkers-layout">
        <div className="checkers-board-column">
          <div className={`checkers-player-bar ${state.turn === opponentColor && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="checkers-player-meta">
              <span className={`checkers-color-dot ${opponentColor === 'w' ? 'white' : 'black'}`} />
              <div>
                <strong>{opponentName}</strong>
                <small>{opponentColor === 'w' ? 'Белые' : 'Чёрные'}</small>
              </div>
            </div>
            <div className={`checkers-clock ${state.turn === opponentColor && state.status === 'playing' ? 'is-running' : ''} ${opponentClock <= 60000 ? 'is-low' : ''}`}>
              {formatClock(opponentClock)}
            </div>
          </div>

          <div className="checkers-board" role="grid" aria-label="Доска для шашек">
            {orientedBoard.map(({ row, col, square, piece }) => {
              const isSelected = selected === square;
              const isTarget = legalTargets.has(square);
              const canSelect = piece?.color === myColor && legalSources.has(square) && state.turn === myColor;
              const isLastMove = state.lastMove && (state.lastMove.from === square || state.lastMove.to === square);
              const isPendingCaptured = pendingCaptured.has(square);

              return (
                <button
                  type="button"
                  role="gridcell"
                  key={square}
                  className={`checkers-cell ${cellTone(row, col)} ${isSelected ? 'is-selected' : ''} ${isTarget ? 'is-target' : ''} ${canSelect ? 'can-select' : ''} ${isLastMove ? 'is-last-move' : ''} ${isPendingCaptured ? 'has-captured-piece' : ''}`}
                  onClick={() => handleCellClick(square, piece)}
                  aria-label={square}
                >
                  {piece && (
                    <span className={`checker-piece checker-piece--${piece.color} ${piece.king ? 'is-king' : ''} ${isPendingCaptured ? 'is-captured' : ''}`}>
                      {piece.king && <span className="checker-crown">♛</span>}
                    </span>
                  )}
                  {isTarget && <span className="checkers-target-dot" />}
                </button>
              );
            })}
          </div>

          <div className={`checkers-player-bar ${state.turn === myColor && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="checkers-player-meta">
              <span className={`checkers-color-dot ${myColor === 'w' ? 'white' : 'black'}`} />
              <div>
                <strong>{myName} <span className="checkers-you-label">ты</span></strong>
                <small>{myColor === 'w' ? 'Белые' : 'Чёрные'}</small>
              </div>
            </div>
            <div className={`checkers-clock ${state.turn === myColor && state.status === 'playing' ? 'is-running' : ''} ${myClock <= 60000 ? 'is-low' : ''}`}>
              {formatClock(myClock)}
            </div>
          </div>
        </div>

        <aside className="checkers-side-panel">
          <div>
            <span className="eyebrow">Правила</span>
            <h3>{statusText(state)}</h3>
            <p>
              {state.forcedFrom && state.turn === myColor
                ? 'После взятия есть ещё одна шашка для рубки — продолжай этой же фигурой.'
                : 'Если на доске доступно взятие, обычный ход сделать нельзя.'}
            </p>
          </div>
          {error && <div className="game-error">{error}</div>}
          {state.status === 'playing' && (
            <button className="danger-button" onClick={resign}>Сдаться</button>
          )}
        </aside>
      </div>

      {result && (
        <div className="checkers-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`checkers-result-card checkers-result-card--${result.kind}`}>
            <span className="checkers-result-spark checkers-result-spark--one">✦</span>
            <span className="checkers-result-spark checkers-result-spark--two">✦</span>
            <span className="checkers-result-spark checkers-result-spark--three">✦</span>
            <div className="checkers-result-icon">{result.icon}</div>
            <span className="checkers-result-kicker">Матч завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="checkers-result-actions">
              <button type="button" className="primary-button checkers-result-main-button" onClick={onBack}>
                Выйти в главное меню
              </button>
              <button type="button" className="secondary-button checkers-result-rematch-button" onClick={findMatch}>
                Найти нового соперника
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
