import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './connect-four.css';

const COLORS = { red: 'Красные', yellow: 'Жёлтые' };

function playerNameFromStorage() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const created = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', created);
  return created;
}

function resultDetails(state) {
  if (state.status !== 'finished') return null;
  if (state.result?.type === 'draw') {
    return { type: 'draw', icon: '🤝', title: 'Ничья!', text: 'Поле заполнено, но победную линию никто не собрал.' };
  }

  const won = state.result?.winner === state.playerColor;
  let text = won ? 'Ты первым собрал четыре фишки подряд!' : 'Соперник собрал четыре фишки подряд.';
  if (state.result?.type === 'resign') text = won ? 'Соперник сдался.' : 'Ты сдался.';
  if (state.result?.type === 'disconnect') text = won ? 'Соперник вышел из игры.' : 'Матч завершён из-за отключения.';
  return { type: won ? 'win' : 'lose', icon: won ? '🏆' : '✨', title: won ? 'Победа!' : 'Поражение', text };
}

export default function ConnectFourGame({ onBack }) {
  const [playerName] = useState(playerNameFromStorage);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const {
    waiting, state, error, setError,
    findMatch: startMatch, cancelSearch, sendAction,
  } = useMultiplayerGame('connect-four');

  const winningCells = useMemo(() => new Set(state?.result?.line ?? []), [state?.result?.line]);
  const myColor = state?.playerColor;
  const canMove = state?.status === 'playing' && state?.turn === myColor;

  useEffect(() => {
    pendingRef.current = false;
    setPending(false);
  }, [state?.roomId, state?.moveCount, error]);

  function search() {
    pendingRef.current = false;
    setPending(false);
    setError('');
    startMatch(playerName);
  }

  function dropColumn(col) {
    if (!canMove || pendingRef.current || state.heights?.[col] >= 6) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    sendAction({ type: 'drop', payload: { col } });
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
      if (event.key >= '1' && event.key <= '7') {
        const col = Number(event.key) - 1;
        if (canMove && !pendingRef.current && state.heights?.[col] < 6) {
          event.preventDefault();
          dropColumn(col);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, canMove]);

  if (!state && !waiting) {
    return (
      <section className="cf4-lobby">
        <div className="cf4-lobby__spark cf4-lobby__spark--left" aria-hidden="true" />
        <div className="cf4-lobby__spark cf4-lobby__spark--right" aria-hidden="true" />
        <div className="cf4-lobby__game-icon" aria-hidden="true">
          <span className="cf4-coin cf4-coin--red" />
          <span className="cf4-coin cf4-coin--yellow" />
          <span className="cf4-coin cf4-coin--red" />
          <span className="cf4-coin cf4-coin--yellow" />
        </div>
        <div className="cf4-kicker">KODUMI GAMES · ОНЛАЙН-ДУЭЛЬ</div>
        <h1>Четыре <span>в ряд!</span></h1>
        <p>Бросайте фишки в столбцы по очереди. Кто первым соединит четыре одинаковых фишки — побеждает!</p>
        <div className="cf4-lobby__rules">
          <span>🔴 Против 🟡</span>
          <span>▦ Поле 7 × 6</span>
          <span>↗ Четыре подряд</span>
        </div>
        {error && <div className="cf4-error" role="alert">{error}</div>}
        <button type="button" className="cf4-main-button" onClick={search}>⚡ Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="cf4-lobby cf4-waiting">
        <div className="cf4-waiting__ring"><span className="cf4-coin cf4-coin--red" /></div>
        <div className="cf4-kicker">ПОИСК ОНЛАЙН-СОПЕРНИКА</div>
        <h2>Подбираем игрока…</h2>
        <p>Как только кто-то ещё выберет «Четыре в ряд», игра запустится автоматически.</p>
        <button type="button" className="cf4-secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const opponentColor = myColor === 'red' ? 'yellow' : 'red';
  const result = resultDetails(state);
  const myName = state.players?.[myColor]?.name || playerName;
  const opponentName = state.players?.[opponentColor]?.name || 'Соперник';
  const hasLast = Number.isInteger(state.lastMove?.cell);

  return (
    <section className="cf4-game" aria-label="Игра Четыре в ряд">
      <div className="cf4-scoreboard">
        <div className={`cf4-player ${state.turn === myColor && state.status === 'playing' ? 'is-active' : ''}`}>
          <span className={`cf4-coin cf4-coin--${myColor}`} aria-hidden="true" />
          <div className="cf4-player__text"><small>ТЫ · {COLORS[myColor]}</small><strong title={myName}>{myName}</strong></div>
        </div>
        <div className="cf4-scoreboard__center">
          <small>{state.status === 'finished' ? 'ФИНИШ' : 'РАУНД'}</small>
          <strong>{state.moveCount} <span>/ 42</span></strong>
        </div>
        <div className={`cf4-player cf4-player--opponent ${state.turn === opponentColor && state.status === 'playing' ? 'is-active' : ''}`}>
          <div className="cf4-player__text"><small>СОПЕРНИК · {COLORS[opponentColor]}</small><strong title={opponentName}>{opponentName}</strong></div>
          <span className={`cf4-coin cf4-coin--${opponentColor}`} aria-hidden="true" />
        </div>
      </div>

      <div className="cf4-arena">
        <div className="cf4-arena__heading">
          <div>
            <div className="cf4-kicker">НАСТОЛЬНАЯ ДУЭЛЬ</div>
            <h2>{state.status === 'finished' ? 'Матч завершён' : canMove ? 'Твой ход!' : 'Ход соперника'}</h2>
          </div>
          <div className={`cf4-turn-pill cf4-turn-pill--${state.turn}`}>
            <span className={`cf4-coin cf4-coin--${state.turn}`} />
            <span>{state.status === 'playing' ? 'Бросаем фишку' : 'Готово'}</span>
          </div>
        </div>

        <div className="cf4-board-wrap">
          <div className="cf4-column-controls" aria-label="Выбор столбца">
            {Array.from({ length: 7 }, (_, col) => {
              const legal = canMove && !pending && state.heights?.[col] < 6;
              return (
                <button
                  key={col}
                  type="button"
                  disabled={!legal}
                  className={`cf4-column-button ${legal ? 'is-ready' : ''}`}
                  onClick={() => dropColumn(col)}
                  aria-label={`Бросить фишку в столбец ${col + 1}`}
                >
                  <span className="cf4-column-button__number">{col + 1}</span>
                  <span className="cf4-column-button__arrow">▼</span>
                </button>
              );
            })}
          </div>
          <div className="cf4-board-frame">
            <div className="cf4-board" role="grid" aria-label="Игровое поле: 7 столбцов и 6 рядов">
              {state.board.map((color, cell) => {
                const col = cell % 7;
                const row = Math.floor(cell / 7);
                const isWinning = winningCells.has(cell);
                const isLast = hasLast && state.lastMove.cell === cell;
                const legal = canMove && !pending && state.heights?.[col] < 6;
                return (
                  <button
                    key={cell}
                    type="button"
                    role="gridcell"
                    className={`cf4-hole ${isWinning ? 'is-winning' : ''} ${isLast ? 'is-last' : ''}`}
                    aria-label={`Столбец ${col + 1}, ряд ${row + 1}: ${color ? COLORS[color] : 'пусто'}`}
                    disabled={!legal}
                    onClick={() => dropColumn(col)}
                  >
                    <span className="cf4-hole__well" aria-hidden="true" />
                    {color && (
                      <span
                        className={`cf4-coin cf4-coin--${color} cf4-hole__coin ${isLast ? 'is-new' : ''}`}
                        style={isLast ? { '--drop-from': `${-100 * (row + 1)}%` } : undefined}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="cf4-board-feet" aria-hidden="true"><span /><span /></div>
        </div>

        <div className="cf4-bottom-row">
          <div className="cf4-tip"><span>💡</span> {canMove ? 'Нажми на столбец, чтобы уронить фишку.' : 'Собери четыре подряд: ↔ ↕ ↗ ↘'}</div>
          {state.status === 'playing' && <button type="button" className="cf4-resign" onClick={() => sendAction({ type: 'resign' })}>Сдаться</button>}
        </div>
        {error && <div className="cf4-error" role="alert">{error}</div>}
      </div>

      {result && (
        <div className="cf4-result" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`cf4-result__card cf4-result__card--${result.type}`}>
            <div className="cf4-result__icon">{result.icon}</div>
            <div className="cf4-kicker">ИГРА ЗАВЕРШЕНА</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="cf4-result__matchup">
              <span><span className={`cf4-coin cf4-coin--${myColor}`} /> {myName}</span>
              <b>VS</b>
              <span><span className={`cf4-coin cf4-coin--${opponentColor}`} /> {opponentName}</span>
            </div>
            <div className="cf4-result__actions">
              <button type="button" className="cf4-main-button" onClick={search}>↻ Играть ещё</button>
              <button type="button" className="cf4-secondary-button" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
