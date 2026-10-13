import { useEffect, useMemo, useRef, useState } from 'react';
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

function Tile({ a, b, onClick, disabled = false, selected = false, playable = false, chain = false, last = false, back = false, label }) {
  const className = [
    'do-tile', chain ? 'do-tile--chain' : 'do-tile--hand',
    back ? 'do-tile--back' : '', selected ? 'is-selected' : '',
    playable ? 'is-playable' : '', last ? 'is-last' : '',
    a === b && !back ? 'is-double' : '',
  ].filter(Boolean).join(' ');

  if (back) return <span className={className} aria-hidden="true"><span className="do-back-mark">✦</span></span>;
  const content = <><Half value={a} /><span className="do-divider" /><Half value={b} /></>;
  if (!onClick) return <span className={className} aria-label={`${a}:${b}`}>{content}</span>;
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={label || `Костяшка ${a}:${b}`}>
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
  const chainRef = useRef(null);
  const {
    waiting, state, error, setError, findMatch: startMatch,
    cancelSearch, sendAction,
  } = useMultiplayerGame('domino');

  const myTurn = state?.status === 'playing' && state.turn === state.playerSeat;
  const options = useMemo(() => new Map((state?.legalMoves || []).map((item) => [item.tileId, item.sides])), [state?.legalMoves]);
  const selectedSides = myTurn ? options.get(selected) || [] : [];

  useEffect(() => {
    if (!chainRef.current || state?.lastMove?.type !== 'play') return;
    const track = chainRef.current;
    track.scrollTo({ left: state.lastMove.side === 'left' ? 0 : track.scrollWidth, behavior: 'smooth' });
  }, [state?.moveNumber]);

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
          <Tile a={6} b={6} chain /><Tile a={6} b={3} chain /><Tile a={3} b={5} chain />
        </div>
        <p>Выложи все свои костяшки раньше соперника. Приставляй одинаковые числа к концам цепочки, а если хода нет — бери костяшки из базара.</p>
        <div className="do-rule-tags"><span>🁣 28 костяшек</span><span>👥 По 7 на руках</span><span>🎯 Первый без костяшек победил</span></div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника →</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="do-lobby do-waiting">
        <div className="do-waiting-tiles" aria-hidden="true"><Tile a={2} b={5} chain /><Tile a={5} b={5} chain /></div>
        <span className="do-kicker">Domino · онлайн на двоих</span>
        <h2>Ищем соперника…</h2>
        <p>Перемешиваем костяшки и готовим игровой стол.</p>
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
      : last?.type === 'play' ? `${last.seat === me ? 'Твой' : 'Соперника'} последний ход: ${last.id.replace('-', ':')}`
        : 'Сделай первый ход — поставь любую костяшку';

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
        <div className="do-board-scroll" ref={chainRef} aria-label="Цепочка домино">
          <div className="do-board-track">
            {!state.chain?.length && <div className="do-board-empty">Пока пусто. Поставь первую костяшку!</div>}
            {(state.chain || []).map((tile) => (
              <Tile key={tile.id} chain a={tile.left} b={tile.right} last={last?.type === 'play' && last.id === tile.id} />
            ))}
          </div>
        </div>
        <div className="do-table-foot"><span>{eventText}</span><span>Ходов: {state.moveNumber}</span></div>
      </div>

      <div className={`do-hand do-panel ${myTurn ? 'is-turn' : ''}`}>
        <div className="do-player-caption"><span>✨ {myName} <small>· ты</small></span><b>{myCount} на руках</b></div>
        <div className="do-hand-help">
          {myTurn ? state.canDraw ? 'Нет подходящих — возьми костяшку из базара' : state.canPass ? 'Базар пуст, подходящих нет — пропусти ход' : shouldPick ? 'Куда поставить выбранную костяшку?' : 'Нажми на подсвеченную костяшку' : 'Ждём ход соперника…'}
        </div>
        <div className="do-hand-tiles">
          {(state.hand || []).map((tile) => {
            const sides = options.get(tile.id) || [];
            return (
              <Tile
                key={tile.id} a={tile.a} b={tile.b}
                onClick={() => chooseTile(tile)} disabled={!myTurn || !sides.length}
                playable={myTurn && sides.length > 0} selected={selected === tile.id && shouldPick}
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
          {state.canDraw && <button type="button" className="do-pick-button" onClick={() => action('draw')}>🗃 Взять из базара</button>}
          {state.canPass && <button type="button" className="do-pick-button" onClick={() => action('pass')}>⏭ Пропустить ход</button>}
          {!shouldPick && !state.canDraw && !state.canPass && <span className="do-controls-note">{myTurn ? 'Подходящие костяшки светятся зелёным' : 'Костяшки соперника скрыты до конца партии'}</span>}
        </div>
      </div>
      {error && <div className="game-error do-error">{error}</div>}
      <div className="do-bottom"><span>Костяшки можно ставить к любому совпадающему краю</span><button type="button" onClick={() => action('resign')} disabled={state.status !== 'playing'}>Сдаться</button></div>
      {state.status === 'finished' && <Result state={state} onAgain={findMatch} onBack={onBack} />}
    </section>
  );
}
