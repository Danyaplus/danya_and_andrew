import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './backgammon.css';

const BOARD_W = 1200;
const BOARD_H = 720;

const POINT_X = [
  92, 174, 256, 338, 420, 502,
  698, 780, 862, 944, 1026, 1108,
];

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;

  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function pointX(index) {
  if (index <= 11) return POINT_X[11 - index];
  return POINT_X[index - 12];
}

function isTopPoint(index) {
  return index <= 11;
}

function checkerPosition(index, checkerIndex, count) {
  const x = pointX(index);
  const top = isTopPoint(index);
  const visibleCount = Math.min(count, 5);
  const step = count > 5 ? 34 : 43;
  const y = top
    ? 56 + checkerIndex * step
    : BOARD_H - 56 - checkerIndex * step;

  return { x, y, top, visibleCount };
}

function dieFace(value) {
  const dots = {
    1: [[50, 50]],
    2: [[30, 30], [70, 70]],
    3: [[30, 30], [50, 50], [70, 70]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]],
    5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[30, 25], [70, 25], [30, 50], [70, 50], [30, 75], [70, 75]],
  };

  return dots[value] || [];
}

function Dice({ value, active = false }) {
  if (!value) return <div className="bg-die bg-die--empty">?</div>;

  return (
    <div className={`bg-die ${active ? 'is-active' : ''}`} aria-label={`Кубик ${value}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {dieFace(value).map(([cx, cy], index) => (
          <circle key={index} cx={cx} cy={cy} r="9" />
        ))}
      </svg>
    </div>
  );
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;

  return {
    icon: won ? '🏆' : '🎲',
    title: won ? 'Ты выиграл!' : 'Ты проиграл',
    text: state.result?.message || 'Партия окончена.',
  };
}

function Checker({ seat, x, y, countLabel, selected }) {
  return (
    <g className={`bg-checker bg-checker--${seat} ${selected ? 'is-selected' : ''}`} transform={`translate(${x} ${y})`}>
      <circle className="bg-checker__shadow" cy="4" r="31" />
      <circle className="bg-checker__body" r="30" />
      <circle className="bg-checker__ring" r="22" />
      {countLabel && <text className="bg-checker__count" x="0" y="7" textAnchor="middle">{countLabel}</text>}
    </g>
  );
}

function Point({ index, point, legalSource, selected, legalTarget, onSelect, onTarget }) {
  const x = pointX(index);
  const top = isTopPoint(index);
  const even = index % 2 === 0;
  const width = 74;
  const tipY = top ? 314 : 406;
  const baseY = top ? 26 : 694;
  const points = `${x - width / 2},${baseY} ${x + width / 2},${baseY} ${x},${tipY}`;

  function handleClick() {
    if (legalTarget) onTarget(index);
    else if (legalSource) onSelect(index);
  }

  return (
    <g
      className={[
        'bg-point',
        even ? 'bg-point--light' : 'bg-point--dark',
        legalSource ? 'is-source' : '',
        selected ? 'is-selected' : '',
        legalTarget ? 'is-target' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      role={(legalSource || legalTarget) ? 'button' : undefined}
    >
      <polygon points={points} />
      {(point?.count || 0) > 0 && Array.from({ length: Math.min(point.count, 5) }, (_, checkerIndex) => {
        const pos = checkerPosition(index, checkerIndex, point.count);
        const countLabel = checkerIndex === Math.min(point.count, 5) - 1 && point.count > 5
          ? point.count
          : null;

        return (
          <Checker
            key={checkerIndex}
            seat={point.owner}
            x={pos.x}
            y={pos.y}
            countLabel={countLabel}
            selected={selected && checkerIndex === Math.min(point.count, 5) - 1}
          />
        );
      })}
      <text className="bg-point__number" x={x} y={top ? 22 : 712} textAnchor="middle">
        {index + 1}
      </text>
    </g>
  );
}

export default function BackgammonGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [selectedSource, setSelectedSource] = useState(null);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('backgammon');

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myTurn = state?.status === 'playing' && state?.turn === me;
  const canRoll = myTurn && state?.phase === 'roll';

  const myLegalMoves = useMemo(() => (
    myTurn && state?.phase === 'move' ? (state?.legalMoves || []) : []
  ), [myTurn, state?.phase, state?.legalMoves]);

  const legalSources = useMemo(() => (
    new Set(myLegalMoves.map((move) => String(move.from)))
  ), [myLegalMoves]);

  const selectedMoves = useMemo(() => {
    if (selectedSource == null) return [];
    return myLegalMoves.filter((move) => String(move.from) === String(selectedSource));
  }, [selectedSource, myLegalMoves]);

  const targetKeys = useMemo(() => (
    new Set(selectedMoves.map((move) => String(move.to)))
  ), [selectedMoves]);

  const result = resultPresentation(state);

  function findMatch() {
    setError('');
    setSelectedSource(null);
    startMatch(playerName);
  }

  function selectSource(source) {
    if (!legalSources.has(String(source))) return;
    setSelectedSource(source);
  }

  function performMove(move) {
    sendAction({
      type: 'move',
      payload: {
        from: move.from,
        to: move.to,
        die: move.die,
      },
    });
    setSelectedSource(null);
    navigator.vibrate?.(8);
  }

  function chooseTarget(target) {
    const moves = selectedMoves.filter((move) => String(move.to) === String(target));
    if (!moves.length) return;

    if (moves.length === 1) {
      performMove(moves[0]);
      return;
    }

    // The only practical ambiguity is bearing off with two usable dice.
    // Prefer the smaller die so the larger die remains available.
    performMove([...moves].sort((a, b) => a.die - b.die)[0]);
  }

  if (!state && !waiting) {
    return (
      <section className="bg-lobby">
        <div className="bg-lobby__icon">🎲</div>
        <span className="eyebrow">2 игрока · классические короткие нарды</span>
        <h1>Нарды</h1>
        <p>
          Бросай два кубика, передвигай шашки по выпавшим значениям, бей одиночные
          шашки соперника и первым выведи все 15 своих шашек с доски.
        </p>
        <div className="bg-rules">
          <span>🎲 дубль играется 4 раза</span>
          <span>💥 одиночную шашку можно сбить на бар</span>
          <span>🏁 первым вывести 15 шашек — победа</span>
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
      <section className="bg-waiting">
        <div className="bg-waiting__dice">⚄ ⚂</div>
        <span className="eyebrow">Нарды · 2 игрока</span>
        <h2>Ищем соперника…</h2>
        <p>Доска готова. Как только подключится второй игрок, начнётся партия.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>
          Отменить поиск
        </button>
      </section>
    );
  }

  const myName = state.players?.[me]?.name || playerName;
  const foeName = state.players?.[foe]?.name || 'Соперник';
  const myOff = state.off?.[me] ?? 0;
  const foeOff = state.off?.[foe] ?? 0;
  const myBar = state.bar?.[me] ?? 0;
  const foeBar = state.bar?.[foe] ?? 0;
  const barSelected = selectedSource === 'bar';
  const canSelectBar = legalSources.has('bar');

  return (
    <section className="bg-game">
      <div className="bg-scorebar">
        <div className={`bg-player ${myTurn ? 'is-turn' : ''}`}>
          <span className={`bg-mini-checker bg-mini-checker--${me}`} />
          <div>
            <small>Ты</small>
            <strong>{myName}</strong>
            <span>Выведено: {myOff}/15 · Бар: {myBar}</span>
          </div>
        </div>

        <div className="bg-turn">
          <small>ХОД {state.turnNumber}</small>
          <strong>
            {state.status === 'finished'
              ? 'Партия окончена'
              : myTurn
                ? state.phase === 'roll'
                  ? 'Бросай кубики'
                  : state.phase === 'blocked'
                    ? 'Нет ходов'
                    : 'Твой ход'
                : 'Ход соперника'}
          </strong>
        </div>

        <div className={`bg-player bg-player--right ${!myTurn && state.status === 'playing' ? 'is-turn' : ''}`}>
          <div>
            <small>Соперник</small>
            <strong>{foeName}</strong>
            <span>Выведено: {foeOff}/15 · Бар: {foeBar}</span>
          </div>
          <span className={`bg-mini-checker bg-mini-checker--${foe}`} />
        </div>
      </div>

      <div className="bg-board-shell">
        <svg className="bg-board" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-label="Доска для нард">
          <defs>
            <linearGradient id="bg-wood" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8f4c29" />
              <stop offset="48%" stopColor="#c27b3f" />
              <stop offset="100%" stopColor="#74371f" />
            </linearGradient>
            <linearGradient id="bg-inner" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d5a05e" />
              <stop offset="100%" stopColor="#a96435" />
            </linearGradient>
          </defs>

          <rect x="8" y="8" width="1184" height="704" rx="32" fill="url(#bg-wood)" stroke="#4b2417" strokeWidth="12" />
          <rect x="30" y="28" width="1140" height="664" rx="22" fill="url(#bg-inner)" stroke="#5c2f1d" strokeWidth="4" />
          <rect x="568" y="28" width="64" height="664" fill="#5a2b1c" opacity="0.88" />
          <rect x="579" y="28" width="42" height="664" fill="#2e1711" opacity="0.32" />

          {(state.points || []).map((point, index) => (
            <Point
              key={index}
              index={index}
              point={point}
              legalSource={legalSources.has(String(index))}
              selected={String(selectedSource) === String(index)}
              legalTarget={targetKeys.has(String(index))}
              onSelect={selectSource}
              onTarget={chooseTarget}
            />
          ))}

          {state.bar?.a > 0 && (
            <g
              className={`bg-bar-stack ${canSelectBar && me === 'a' ? 'is-source' : ''} ${barSelected && me === 'a' ? 'is-selected' : ''}`}
              onClick={() => me === 'a' && selectSource('bar')}
            >
              <Checker seat="a" x="600" y="300" countLabel={state.bar.a > 1 ? state.bar.a : null} selected={barSelected && me === 'a'} />
            </g>
          )}

          {state.bar?.b > 0 && (
            <g
              className={`bg-bar-stack ${canSelectBar && me === 'b' ? 'is-source' : ''} ${barSelected && me === 'b' ? 'is-selected' : ''}`}
              onClick={() => me === 'b' && selectSource('bar')}
            >
              <Checker seat="b" x="600" y="420" countLabel={state.bar.b > 1 ? state.bar.b : null} selected={barSelected && me === 'b'} />
            </g>
          )}

          {targetKeys.has('off') && (
            <g className="bg-off-target" onClick={() => chooseTarget('off')} role="button">
              <rect x={me === 'a' ? 1124 : 24} y="285" width="52" height="150" rx="18" />
              <text
                x={me === 'a' ? 1150 : 50}
                y="365"
                textAnchor="middle"
                transform={`rotate(${me === 'a' ? 90 : -90} ${me === 'a' ? 1150 : 50} 365)`}
              >
                ВЫВЕСТИ
              </text>
            </g>
          )}
        </svg>

        <div className="bg-dice-panel">
          <div className="bg-dice">
            <Dice value={state.dice?.[0]} active={state.remainingDice?.includes(state.dice?.[0])} />
            <Dice value={state.dice?.[1]} active={state.remainingDice?.includes(state.dice?.[1])} />
          </div>

          {canRoll ? (
            <button
              type="button"
              className="bg-roll-button"
              onClick={() => {
                sendAction({ type: 'roll' });
                setSelectedSource(null);
                navigator.vibrate?.(12);
              }}
            >
              🎲 БРОСИТЬ КУБИКИ
            </button>
          ) : (
            <div className="bg-dice-status">
              {state.phase === 'move' && myTurn
                ? `Осталось ходов: ${state.remainingDice?.join(', ') || '—'}`
                : state.phase === 'blocked'
                  ? 'Ходов нет — очередь перейдёт сопернику'
                  : myTurn
                    ? 'Твой ход'
                    : 'Ждём ход соперника'}
            </div>
          )}
        </div>
      </div>

      {selectedSource != null && selectedMoves.length > 0 && (
        <div className="bg-move-picker">
          <span>Куда ходить:</span>
          {selectedMoves.map((move, index) => (
            <button
              key={`${move.from}-${move.to}-${move.die}-${index}`}
              type="button"
              onClick={() => performMove(move)}
            >
              🎲 {move.die} → {move.to === 'off' ? 'вывести' : `пункт ${Number(move.to) + 1}`}
            </button>
          ))}
          <button type="button" className="bg-move-picker__cancel" onClick={() => setSelectedSource(null)}>
            Отмена
          </button>
        </div>
      )}

      <p className="bg-tip">
        Подсвеченные шашки можно двигать. Нажми шашку, затем выбери подсвеченный пункт или нужный кубик.
        Если шашка на баре — сначала нужно вернуть её в игру.
      </p>

      {error && <div className="game-error">{error}</div>}

      {state.status === 'playing' && (
        <button type="button" className="danger-button bg-resign" onClick={() => sendAction({ type: 'resign' })}>
          Сдаться
        </button>
      )}

      {result && (
        <div className="bg-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className="bg-result">
            <div className="bg-result__icon">{result.icon}</div>
            <span className="eyebrow">Нарды</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="bg-result__off">
              <strong>{myOff}</strong>
              <span>:</span>
              <strong>{foeOff}</strong>
            </div>
            <div className="bg-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Сыграть ещё</button>
              <button type="button" className="secondary-button" onClick={onBack}>В меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
