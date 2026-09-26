import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './battleship.css';

const BOARD_SIZE = 10;

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function opposite(side) {
  return side === 'a' ? 'b' : 'a';
}

function formatTurnClock(milliseconds = 0) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}

function cellName(cell) {
  const row = Math.floor(cell / BOARD_SIZE) + 1;
  const col = String.fromCharCode(65 + (cell % BOARD_SIZE));
  return `${col}${row}`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  const result = state.result || {};
  const didWin = result.winner === state.playerSide;

  let text = result.message || 'Матч завершён.';
  if (result.type === 'disconnect') {
    text = didWin ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  } else if (result.type === 'resign') {
    text = didWin ? 'Соперник сдался.' : 'Вы сдались.';
  } else if (result.type === 'win') {
    text = didWin
      ? 'Вы уничтожили весь флот соперника.'
      : 'Соперник уничтожил весь ваш флот.';
  }

  return {
    kind: didWin ? 'win' : 'lose',
    icon: didWin ? '🏆' : '⚓',
    title: didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}

function ShotMark({ value }) {
  if (value === 'hit' || value === 'sunk') {
    return <span className="battle-hit-mark" aria-hidden="true">×</span>;
  }
  if (value === 'miss' || value === 'blocked') {
    return <span className="battle-miss-mark" aria-hidden="true">•</span>;
  }
  return null;
}

function BattleBoard({
  title,
  subtitle,
  grid,
  enemy = false,
  canFire = false,
  onFire,
  lastShot,
}) {
  return (
    <div className={`battle-board-card ${enemy ? 'battle-board-card--enemy' : 'battle-board-card--mine'}`}>
      <div className="battle-board-heading">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <span className="battle-board-size">10×10</span>
      </div>

      <div className="battle-board" role="grid" aria-label={title}>
        {grid.map((value, cell) => {
          const isTargetable = enemy && canFire && value === 'unknown';
          const isLastShot = lastShot?.cell === cell && (
            (enemy && lastShot.target !== undefined) || !enemy
          );

          return (
            <button
              type="button"
              role="gridcell"
              key={cell}
              className={`battle-cell battle-cell--${value} ${isTargetable ? 'is-targetable' : ''} ${isLastShot ? 'is-last-shot' : ''}`}
              onClick={() => isTargetable && onFire?.(cell)}
              disabled={!isTargetable}
              aria-label={`${cellName(cell)}${value === 'ship' ? ', ваш корабль' : ''}`}
            >
              {value === 'ship' && <span className="battle-ship-piece" aria-hidden="true" />}
              <ShotMark value={value} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BattleshipGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('battleship');

  const result = useMemo(() => resultPresentation(state), [state]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function fire(cell) {
    if (!state || state.status !== 'playing') return;
    if (state.turn !== state.playerSide) return;
    if (state.enemyGrid?.[cell] !== 'unknown') return;

    sendAction({
      type: 'fire',
      payload: { cell },
    });
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  function goHome() {
    if (typeof onBack === 'function') onBack();
    else window.location.hash = '#/';
  }

  if (!state && !waiting) {
    return (
      <section className="battleship-lobby">
        <div className="battleship-lobby__icon">🚢</div>
        <span className="eyebrow">30 секунд на каждый ход</span>
        <h1>Морской бой</h1>
        <p>
          Поле 10×10 и стандартный флот: 1 четырёхпалубный, 2 трёхпалубных,
          3 двухпалубных и 4 однопалубных корабля. Расстановка создаётся автоматически.
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
      <section className="battleship-waiting-card">
        <div className="battleship-waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго капитана…</h2>
        <p>Когда второй игрок откроет «Морской бой» и нажмёт поиск, поля создадутся автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const mySide = state.playerSide;
  const enemySide = opposite(mySide);
  const myName = state.players?.[mySide]?.name || playerName;
  const enemyName = state.players?.[enemySide]?.name || 'Соперник';
  const myTurn = state.status === 'playing' && state.turn === mySide;
  const secondsLeft = Math.max(0, Math.ceil((state.turnTimeMs || 0) / 1000));
  const timedOutLastTurn = state.lastEvent?.type === 'timeout';

  return (
    <section className="battleship-match">
      <div className="battle-status-panel">
        <div className="battle-status-copy">
          <span className="eyebrow">Морской бой</span>
          <h2>{myTurn ? 'Твой ход' : 'Ход соперника'}</h2>
          <p>
            {myTurn
              ? 'Нажми на свободную клетку поля соперника.'
              : `${enemyName} выбирает клетку для выстрела.`}
          </p>
        </div>

        <div className={`battle-turn-clock ${myTurn ? 'is-mine' : ''} ${secondsLeft <= 10 ? 'is-low' : ''}`}>
          <small>На ход</small>
          <strong>{formatTurnClock(state.turnTimeMs)}</strong>
        </div>
      </div>

      {timedOutLastTurn && state.status === 'playing' && (
        <div className="battle-timeout-note">
          ⏱ Игрок не успел сделать ход за 30 секунд — очередь перешла сопернику.
        </div>
      )}

      <div className="battle-players-strip">
        <div className={`battle-player-pill ${myTurn ? 'is-turn' : ''}`}>
          <span>Ты</span>
          <strong>{myName}</strong>
          <small>Кораблей: {state.shipsRemaining?.me ?? 0}</small>
        </div>
        <div className="battle-vs">VS</div>
        <div className={`battle-player-pill ${!myTurn && state.status === 'playing' ? 'is-turn' : ''}`}>
          <span>Соперник</span>
          <strong>{enemyName}</strong>
          <small>Кораблей: {state.shipsRemaining?.enemy ?? 0}</small>
        </div>
      </div>

      <div className="battlefields">
        <BattleBoard
          title="Поле соперника"
          subtitle={myTurn ? 'Стреляй сюда' : 'Жди своего хода'}
          grid={state.enemyGrid || []}
          enemy
          canFire={myTurn}
          onFire={fire}
          lastShot={state.lastShot?.target === enemySide ? state.lastShot : null}
        />

        <BattleBoard
          title="Твоё поле"
          subtitle="Твои корабли видны только тебе"
          grid={state.myGrid || []}
          lastShot={state.lastShot?.target === mySide ? state.lastShot : null}
        />
      </div>

      <div className="battle-legend">
        <span><i className="battle-legend__ship" /> корабль</span>
        <span><b>×</b> попадание</span>
        <span><b>•</b> промах / закрытая клетка</span>
      </div>

      {error && <div className="game-error battle-error">{error}</div>}

      {state.status === 'playing' && (
        <div className="battle-actions">
          <button className="danger-button" onClick={resign}>Сдаться</button>
        </div>
      )}

      {result && (
        <div className="battle-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`battle-result-card battle-result-card--${result.kind}`}>
            <span className="battle-result-spark battle-result-spark--one">✦</span>
            <span className="battle-result-spark battle-result-spark--two">✦</span>
            <span className="battle-result-spark battle-result-spark--three">✦</span>
            <div className="battle-result-icon">{result.icon}</div>
            <span className="battle-result-kicker">Бой завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="battle-result-actions">
              <button type="button" className="primary-button battle-result-main-button" onClick={goHome}>
                Выйти в главное меню
              </button>
              <button type="button" className="secondary-button" onClick={findMatch}>
                Найти нового соперника
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
