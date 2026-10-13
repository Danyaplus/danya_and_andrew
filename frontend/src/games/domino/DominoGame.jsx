import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './domino.css';

const PIPS = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Separate snake routes: the right end climbs upwards, the left end descends.
// Each turn occupies real cells: a vertical section is made of vertical tiles,
// then the next horizontal row proceeds in the opposite direction.
const path = (items) => items.flatMap(([direction, fixed, from, to]) => {
  const step = from <= to ? 1 : -1;
  const slots = [];
  for (let n = from; step > 0 ? n <= to : n >= to; n += step) {
    const col = direction === 'up' || direction === 'down' ? fixed : n;
    const row = direction === 'up' || direction === 'down' ? n : fixed;
    slots.push({
      x: 10 + col * 10,
      y: 20 + row * 10,
      direction,
    });
  }
  return slots;
});

const RIGHT_SLOTS = path([
  ['right', 3, 5, 8],
  ['up', 8, 2, 0],
  ['left', 0, 7, 0],
  ['down', 0, 1, 2],
  ['right', 2, 1, 7],
  ['up', 7, 1, 1],
  ['left', 1, 6, 1],
]);

const LEFT_SLOTS = path([
  ['left', 3, 3, 0],
  ['down', 0, 4, 6],
  ['right', 6, 1, 8],
  ['up', 8, 5, 4],
  ['left', 4, 7, 1],
  ['down', 1, 5, 5],
  ['right', 5, 2, 7],
]);

function getTileOrientation(item, direction) {
  const horizontal = direction === 'left' || direction === 'right';
  return item.isDouble
    ? (horizontal ? 'vertical' : 'horizontal')
    : (horizontal ? 'horizontal' : 'vertical');
}

// Server stores all tiles logically from the left end to the right end.
// The visual path on the left is traversed in reverse, so adapt the two
// values to the direction of travel and keep the matching halves together.
function orientedValues(item, direction) {
  const inner = item.side === 'left' ? item.right : item.left;
  const outer = item.side === 'left' ? item.left : item.right;
  return direction === 'right' || direction === 'down'
    ? { a: inner, b: outer }
    : { a: outer, b: inner };
}

function buildBoardPieces(history = [], lastMove) {
  if (!history.length) return [];

  const first = history[0];
  const pieces = [{
    key: `${first.id}-${first.moveNumber}`,
    a: first.left,
    b: first.right,
    x: 50,
    y: 50,
    orientation: first.isDouble ? 'vertical' : 'horizontal',
    last: lastMove?.type === 'play' && lastMove.id === first.id,
  }];

  let leftIndex = 0;
  let rightIndex = 0;

  for (const item of history.slice(1)) {
    const slots = item.side === 'left' ? LEFT_SLOTS : RIGHT_SLOTS;
    const index = item.side === 'left' ? leftIndex++ : rightIndex++;
    // Each side has room for 31 pieces (plus the central tile); normal
    // double-six games have only 28 pieces in total.
    const slot = slots[index];
    if (!slot) continue;
    pieces.push({
      key: `${item.id}-${item.moveNumber}`,
      ...orientedValues(item, slot.direction),
      x: slot.x,
      y: slot.y,
      orientation: getTileOrientation(item, slot.direction),
      last: lastMove?.type === 'play' && lastMove.id === item.id,
    });
  }

  return pieces;
}

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const name = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', name);
  return name;
}

function Half({ value }) {
  return (
    <span className="do-half" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} className={`do-pip ${PIPS[value]?.includes(index) ? 'is-on' : ''}`} />
      ))}
    </span>
  );
}

function Tile({
  a,
  b,
  onClick,
  disabled = false,
  selected = false,
  playable = false,
  chain = false,
  last = false,
  back = false,
  orientation = 'vertical',
  label,
}) {
  const className = [
    'do-tile',
    chain ? 'do-tile--chain' : 'do-tile--hand',
    back ? 'do-tile--back' : '',
    orientation === 'horizontal' ? 'do-tile--horizontal' : 'do-tile--vertical',
    selected ? 'is-selected' : '',
    playable ? 'is-playable' : '',
    last ? 'is-last' : '',
    a === b && !back ? 'is-double' : '',
  ].filter(Boolean).join(' ');

  if (back) {
    return (
      <span className={className} aria-hidden="true">
        <span className="do-back-mark">✦</span>
      </span>
    );
  }

  const content = <><Half value={a} /><span className="do-divider" /><Half value={b} /></>;
  if (!onClick) return <span className={className} aria-label={`${a}:${b}`}>{content}</span>;

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label || `Костяшка ${a}:${b}`}
    >
      {content}
    </button>
  );
}

function Result({ state, onAgain, onBack }) {
  const winner = state.result?.winner;
  const draw = winner === null;
  const won = winner === state.playerSeat;
  return (
    <div className="do-result">
      <div className="do-result-card">
        <span className="do-result-icon">{draw ? '🤝' : won ? '🏆' : '🎲'}</span>
        <span className="do-kicker">Партия завершена</span>
        <h2>{draw ? 'Ничья!' : won ? 'Ты победил!' : 'Победил соперник'}</h2>
        <p>{state.result?.message}</p>
        {state.result?.pips && (
          <div className="do-final-score">
            <span>Твои очки <b>{state.result.pips[state.playerSeat]}</b></span>
            <span>Очки соперника <b>{state.result.pips[state.opponentSeat]}</b></span>
          </div>
        )}
        <div className="do-result-actions">
          <button type="button" className="primary-button" onClick={onAgain}>Новый соперник</button>
          <button type="button" className="secondary-button" onClick={onBack}>К играм</button>
        </div>
      </div>
    </div>
  );
}

export default function DominoGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [selected, setSelected] = useState(null);
  const {
    waiting, state, error, setError, findMatch: startMatch,
    cancelSearch, sendAction,
  } = useMultiplayerGame('domino');

  const myTurn = state?.status === 'playing' && state.turn === state.playerSeat;
  const options = useMemo(() => new Map((state?.legalMoves || []).map((item) => [item.tileId, item.sides])), [state?.legalMoves]);
  const selectedSides = myTurn ? options.get(selected) || [] : [];
  const boardPieces = useMemo(() => buildBoardPieces(state?.playHistory || [], state?.lastMove), [state?.playHistory, state?.lastMove]);

  function findMatch() {
    setSelected(null);
    setError('');
    startMatch(playerName);
  }

  function play(tileId, side) {
    if (!myTurn || !options.get(tileId)?.includes(side)) return;
    sendAction({ type: 'play', payload: { tileId, side } });
    setSelected(null);
    setError('');
    navigator.vibrate?.(9);
  }

  function chooseTile(tile) {
    if (!myTurn) return;
    const sides = options.get(tile.id) || [];
    if (sides.length === 1) {
      play(tile.id, sides[0]);
    } else if (sides.length > 1) {
      setSelected((prev) => prev === tile.id ? null : tile.id);
    }
  }

  function action(type) {
    setSelected(null);
    setError('');
    sendAction({ type });
  }

  if (!state && !waiting) {
    return (
      <section className="do-lobby">
        <span className="do-kicker">Классическая настольная игра · 2 игрока онлайн</span>
        <h1>Домино <span>🁣</span></h1>
        <div className="do-lobby-art" aria-hidden="true">
          <Tile a={6} b={6} chain orientation="vertical" />
          <Tile a={6} b={3} chain orientation="horizontal" />
          <Tile a={3} b={5} chain orientation="horizontal" />
        </div>
        <p>Выложи все свои костяшки раньше соперника. Игровое поле теперь строится змейкой внутри квадратной карты, а в удачный ход можно сразу поставить две костяшки — по одной на каждый край.</p>
        <div className="do-rule-tags"><span>🁣 28 костяшек</span><span>👥 По 7 на руках</span><span>🎯 Ход можно усилить второй костяшкой</span></div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника →</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="do-lobby do-waiting">
        <div className="do-waiting-tiles" aria-hidden="true"><Tile a={2} b={5} chain orientation="horizontal" /><Tile a={5} b={5} chain orientation="vertical" /></div>
        <span className="do-kicker">Domino · онлайн на двоих</span>
        <h2>Ищем соперника…</h2>
        <p>Перемешиваем костяшки и готовим квадратное поле.</p>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;
  const me = state.playerSeat;
  const foe = state.opponentSeat;
  const myName = state.players?.[me]?.name || playerName;
  const opponentName = state.players?.[foe]?.name || 'Соперник';
  const foeCount = state.handCounts?.[foe] || 0;
  const myCount = state.handCounts?.[me] || 0;
  const shouldPick = myTurn && selectedSides.length > 1;
  const pending = state.status === 'playing' && !myTurn;
  const last = state.lastMove;
  const eventText = last?.type === 'draw'
    ? `${last.seat === me ? 'Ты взял' : 'Соперник взял'} костяшку из базара`
    : last?.type === 'pass' ? `${last.seat === me ? 'Ты пропустил' : 'Соперник пропустил'} ход`
      : last?.type === 'end-turn' ? `${last.seat === me ? 'Ты завершил' : 'Соперник завершил'} усиленный ход`
        : last?.type === 'play' ? `${last.seat === me ? 'Твой' : 'Соперника'} последний ход: ${last.id.replace('-', ':')}`
          : state.openingTileId ? `Первый ход должен начаться с костяшки ${state.openingTileId.replace('-', ':')}` : 'Сделай первый ход';

  const turnHelp = !myTurn
    ? 'Ждём ход соперника…'
    : state.canEndTurn
      ? 'Можно поставить вторую костяшку на другой край или завершить ход.'
      : state.canDraw
        ? 'Нет подходящих — возьми костяшку из базара.'
        : state.canPass
          ? 'Базар пуст — можно пропустить ход.'
          : shouldPick
            ? 'Выбери, к какому краю поставить костяшку.'
            : 'Нажми на подсвеченную костяшку.';

  return (
    <section className="do-game">
      <header className="do-header">
        <div className="do-head-title"><span className="do-kicker">Классика · онлайн</span><h1>🁣 Домино</h1></div>
        <span className={`do-turn ${myTurn ? 'do-turn--mine' : ''}`} aria-live="polite">
          {state.status === 'finished' ? 'Партия окончена' : myTurn ? '● ТВОЙ ХОД' : '◌ ХОД СОПЕРНИКА'}
        </span>
      </header>

      <div className={`do-opponent do-panel ${pending ? 'is-turn' : ''}`}>
        <div className="do-player-caption"><span>🔷 {opponentName}</span><b>{foeCount} {foeCount === 1 ? 'костяшка' : foeCount >= 2 && foeCount <= 4 ? 'костяшки' : 'костяшек'}</b></div>
        <div className="do-hidden-hand" aria-label={`У соперника ${foeCount} костяшек`}>
          {Array.from({ length: Math.min(foeCount, 14) }, (_, index) => <Tile key={index} back />)}
          {foeCount > 14 && <span className="do-more">+{foeCount - 14}</span>}
        </div>
      </div>

      <div className="do-table">
        <div className="do-table-head">
          <span className="do-kicker">Игровой стол</span>
          <span className="do-boneyard">🗃 Базар: <b>{state.boneyardCount}</b></span>
        </div>
        <div className="do-chain-edges">
          <span>◀ Левый край {state.ends?.left ?? '—'}</span>
          <span>Правый край {state.ends?.right ?? '—'} ▶</span>
        </div>
        <div className="do-board-shell" aria-label="Квадратное поле домино">
          <div className="do-board-grid">
            {!boardPieces.length && <div className="do-board-empty">Первая костяшка появится прямо по центру поля</div>}
            {boardPieces.map((piece) => (
              <div key={piece.key} className="do-board-piece" style={{ left: `${piece.x}%`, top: `${piece.y}%` }}>
                <Tile chain a={piece.a} b={piece.b} orientation={piece.orientation} last={piece.last} />
              </div>
            ))}
          </div>
        </div>
        <div className="do-table-foot"><span>{eventText}</span><span>Ходов: {state.moveNumber}</span></div>
      </div>

      <div className={`do-hand do-panel ${myTurn ? 'is-turn' : ''}`}>
        <div className="do-player-caption"><span>✨ {myName} <small>· ты</small></span><b>{myCount} на руках</b></div>
        <div className="do-hand-help">{turnHelp}</div>
        <div className="do-hand-tiles">
          {(state.hand || []).map((tile) => {
            const sides = options.get(tile.id) || [];
            return (
              <Tile
                key={tile.id}
                a={tile.a}
                b={tile.b}
                onClick={() => chooseTile(tile)}
                disabled={!myTurn || !sides.length}
                playable={myTurn && sides.length > 0}
                selected={selected === tile.id && shouldPick}
                label={`Костяшка ${tile.a}:${tile.b}${sides.length ? ', подходит' : ', не подходит'}`}
              />
            );
          })}
        </div>
        <div className="do-controls" aria-live="polite">
          {shouldPick && (
            <div className="do-choice">
              <button type="button" onClick={() => play(selected, 'left')} disabled={!selectedSides.includes('left')}>← Поставить слева</button>
              <button type="button" onClick={() => play(selected, 'right')} disabled={!selectedSides.includes('right')}>Поставить справа →</button>
            </div>
          )}
          {!shouldPick && (
            <div className="do-action-stack">
              {state.canDraw && <button type="button" className="do-pick-button" onClick={() => action('draw')}>🗃 Взять из базара</button>}
              {state.canPass && <button type="button" className="do-pick-button" onClick={() => action('pass')}>⏭ Пропустить ход</button>}
              {state.canEndTurn && <button type="button" className="do-pick-button do-pick-button--secondary" onClick={() => action('end-turn')}>✅ Завершить ход</button>}
              {!state.canDraw && !state.canPass && !state.canEndTurn && <span className="do-controls-note">Подходящие костяшки подсвечены зелёным</span>}
            </div>
          )}
        </div>
      </div>
      {error && <div className="game-error do-error">{error}</div>}
      <div className="do-bottom"><span>Цепочка строится внутри квадратного поля и поворачивает, чтобы не выходить за края</span><button type="button" onClick={() => action('resign')} disabled={state.status !== 'playing'}>Сдаться</button></div>
      {state.status === 'finished' && <Result state={state} onAgain={findMatch} onBack={onBack} />}
    </section>
  );
}
