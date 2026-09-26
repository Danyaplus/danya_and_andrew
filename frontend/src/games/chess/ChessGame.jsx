import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './chess.css';

const PIECES = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

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

function squareColor(row, col) {
  return (row + col) % 2 === 0 ? 'light' : 'dark';
}

function statusText(state) {
  if (!state) return '';
  if (state.status === 'finished') return state.result?.message || 'Матч завершён';
  if (state.turn === state.playerColor) return 'Твой ход';
  return 'Ход соперника';
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

  if (result.type === 'disconnect' && didWin) {
    text = 'Соперник отключился от игры.';
  } else if (result.type === 'timeout') {
    text = didWin ? 'У соперника закончилось время.' : 'У вас закончилось время.';
  } else if (result.type === 'resign') {
    text = didWin ? 'Соперник сдался.' : 'Вы сдались.';
  } else if (result.type === 'checkmate') {
    text = didWin ? 'Вы поставили мат сопернику.' : 'Соперник поставил вам мат.';
  }

  return {
    kind: didWin ? 'win' : 'lose',
    icon: didWin ? '🏆' : '♟',
    title: didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}

export default function ChessGame({ onBack }) {
  const [selected, setSelected] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [playerName] = useState(getPlayerName);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch: cancelMatchSearch,
    sendAction,
  } = useMultiplayerGame('chess');

  const orientedBoard = useMemo(() => {
    if (!state?.board) return [];
    const squares = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const sourceRow = state.playerColor === 'b' ? 7 - row : row;
        const sourceCol = state.playerColor === 'b' ? 7 - col : col;
        const piece = state.board[sourceRow][sourceCol];
        const file = String.fromCharCode(97 + sourceCol);
        const rank = 8 - sourceRow;
        squares.push({
          row,
          col,
          sourceRow,
          sourceCol,
          square: `${file}${rank}`,
          piece,
        });
      }
    }
    return squares;
  }, [state]);

  const legalTargets = useMemo(() => {
    if (!selected || !state?.legalMoves) return new Set();
    return new Set(
      state.legalMoves
        .filter((move) => move.from === selected)
        .map((move) => move.to),
    );
  }, [selected, state]);

  function findMatch() {
    setError('');
    setSelected(null);
    setPromotion(null);
    startMatch(playerName);
  }

  function cancelSearch() {
    cancelMatchSearch();
  }

  function sendMove(from, to, promotionPiece = 'q') {
    sendAction({
      type: 'move',
      payload: { from, to, promotion: promotionPiece },
    });
    setSelected(null);
    setPromotion(null);
  }

  function handleSquareClick(square, piece) {
    if (!state || state.status !== 'playing') return;
    if (state.turn !== state.playerColor) return;

    if (!selected) {
      if (piece?.color === state.playerColor) setSelected(square);
      return;
    }

    if (piece?.color === state.playerColor) {
      setSelected(square);
      return;
    }

    if (!legalTargets.has(square)) {
      setSelected(null);
      return;
    }

    const selectedPiece = state.board.flat().find((item) => item?.square === selected);
    const reachesPromotionRank = selectedPiece?.type === 'p' && (square.endsWith('8') || square.endsWith('1'));

    if (reachesPromotionRank) {
      setPromotion({ from: selected, to: square });
      return;
    }

    sendMove(selected, square);
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="chess-lobby">
        <div className="chess-lobby__icon">♟</div>
        <span className="eyebrow">10 минут каждому</span>
        <h1>Шахматы</h1>
        <p>
          Полные правила: рокировка, взятие на проходе, превращение пешки,
          шах, мат, пат и стандартные ничьи.
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
      <section className="waiting-card">
        <div className="waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только кто-то ещё нажмёт «Найти соперника», матч начнётся автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const myColor = state.playerColor;
  const opponentColor = myColor === 'w' ? 'b' : 'w';
  const myName = state.players?.[myColor]?.name || playerName;
  const opponentName = state.players?.[opponentColor]?.name || 'Соперник';
  const result = resultPresentation(state);

  const myClock = state.clocks?.[myColor] ?? 0;
  const opponentClock = state.clocks?.[opponentColor] ?? 0;

  return (
    <section className="chess-match">
      <div className="chess-match__topbar">
        <div>
          <span className="eyebrow">Матч #{state.roomId.slice(0, 6)}</span>
          <h1>Шахматы</h1>
        </div>
        <div className={`turn-chip ${state.turn === myColor && state.status === 'playing' ? 'is-active' : ''}`}>
          {statusText(state)}
        </div>
      </div>

      <div className="chess-layout">
        <div className="board-column">
          <div className={`player-bar player-bar--opponent ${state.turn === opponentColor && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="player-meta">
              <span className={`color-dot ${opponentColor === 'w' ? 'white' : 'black'}`} />
              <div>
                <strong>{opponentName}</strong>
                <small>{opponentColor === 'w' ? 'Белые' : 'Чёрные'}</small>
              </div>
            </div>
            <div className={`clock ${state.turn === opponentColor && state.status === 'playing' ? 'is-running' : ''} ${opponentClock <= 60000 ? 'is-low' : ''}`}>
              {formatClock(opponentClock)}
            </div>
          </div>

          <div className="chess-board" role="grid" aria-label="Шахматная доска">
            {orientedBoard.map(({ row, col, square, piece }) => {
              const isSelected = selected === square;
              const isTarget = legalTargets.has(square);
              const lastMove = state.lastMove;
              const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={square}
                  className={`chess-square ${squareColor(row, col)} ${isSelected ? 'is-selected' : ''} ${isTarget ? 'is-target' : ''} ${isLastMove ? 'is-last-move' : ''}`}
                  onClick={() => handleSquareClick(square, piece)}
                  aria-label={square}
                >
                  {piece && (
                    <span className={`piece piece--${piece.color}`}>
                      {PIECES[`${piece.color}${piece.type}`]}
                    </span>
                  )}
                  {isTarget && <span className={`target-dot ${piece ? 'capture' : ''}`} />}
                  {col === 0 && <span className="rank-label">{square[1]}</span>}
                  {row === 7 && <span className="file-label">{square[0]}</span>}
                </button>
              );
            })}
          </div>

          <div className={`player-bar player-bar--me ${state.turn === myColor && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="player-meta">
              <span className={`color-dot ${myColor === 'w' ? 'white' : 'black'}`} />
              <div>
                <strong>{myName} <span className="you-label">ты</span></strong>
                <small>{myColor === 'w' ? 'Белые' : 'Чёрные'}</small>
              </div>
            </div>
            <div className={`clock ${state.turn === myColor && state.status === 'playing' ? 'is-running' : ''} ${myClock <= 60000 ? 'is-low' : ''}`}>
              {formatClock(myClock)}
            </div>
          </div>
        </div>

        <aside className="match-panel">
          <div className="match-panel__block">
            <span className="eyebrow">Статус</span>
            <h3>{statusText(state)}</h3>
            <p>
              {state.status === 'playing'
                ? `Ходят ${state.turn === 'w' ? 'белые' : 'чёрные'}.`
                : 'Партия завершена.'}
            </p>
          </div>

          {error && <div className="game-error">{error}</div>}

          {state.status === 'playing' && (
            <button className="danger-button" onClick={resign}>Сдаться</button>
          )}
        </aside>
      </div>

      {promotion && (
        <div className="modal-backdrop">
          <div className="promotion-modal">
            <span className="eyebrow">Превращение пешки</span>
            <h3>Выбери фигуру</h3>
            <div className="promotion-options">
              {['q', 'r', 'b', 'n'].map((type) => (
                <button key={type} onClick={() => sendMove(promotion.from, promotion.to, type)}>
                  {PIECES[`${myColor}${type}`]}
                </button>
              ))}
            </div>
            <button className="secondary-button" onClick={() => setPromotion(null)}>Отмена</button>
          </div>
        </div>
      )}

      {result && (
        <div className="result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`result-card result-card--${result.kind}`}>
            <span className="result-spark result-spark--one">✦</span>
            <span className="result-spark result-spark--two">✦</span>
            <span className="result-spark result-spark--three">✦</span>
            <div className="result-icon" aria-hidden="true">{result.icon}</div>
            <span className="result-kicker">Партия завершена</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="result-actions">
              <button className="primary-button result-main-button" onClick={onBack}>
                Выйти в главное меню
              </button>
              <button className="secondary-button result-rematch-button" onClick={findMatch}>
                Найти нового соперника
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
