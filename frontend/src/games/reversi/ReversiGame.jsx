import { getPlayerName } from '../../lib/playerName.js';
import { useEffect, useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './reversi.css';
import ReversiNooseScene, { ReversiNooseResult } from './ReversiNooseScene.jsx';



function colorLabel(color) {
  return color === 'black' ? 'Чёрные' : 'Белые';
}

function opponentOf(color) {
  return color === 'black' ? 'white' : 'black';
}

function resultInfo(state) {
  if (state?.status !== 'finished') return null;
  const result = state.result || {};
  const draw = !result.winner;
  const won = result.winner === state.playerColor;
  const score = state.scores || { black: 0, white: 0 };

  if (result.type === 'noose') {
    return { icon: won ? '🏆' : '⚫⚪', title: won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ!', text: won ? 'Ты победил!' : 'Ваши все шашки пытали, и они не выдержали пытку, потому что пытка очень хорошая.' };
  }
  if (result.type === 'disconnect') {
    return { icon: '🔌', title: won ? 'Ты победил!' : 'Матч завершён', text: 'Один из игроков отключился.' };
  }
  if (result.type === 'resign') {
    return { icon: won ? '🏆' : '🏳️', title: won ? 'Ты победил!' : 'Ты сдался', text: result.message };
  }
  return {
    icon: draw ? '🤝' : won ? '🏆' : '♟',
    title: draw ? 'Ничья!' : won ? 'Ты победил!' : 'Ты проиграл',
    text: `Финальный счёт: ⚫ ${score.black} — ${score.white} ⚪`,
  };
}

export default function ReversiGame({ onBack, adminMode = false }) {
  const [playerName] = useState(getPlayerName);
  const {
    waiting, state, error, setError, findMatch, cancelSearch, sendAction,
  } = useMultiplayerGame('reversi');

  useEffect(() => {
    if (adminMode && state?.roomId && state.status === 'playing' && !state.adminEnabled) {
      sendAction({ type: 'admin:unlock' });
    }
  }, [adminMode, state?.roomId, state?.adminEnabled, state?.status]);

  const legal = useMemo(() => new Set(state?.legalMoves || []), [state?.legalMoves]);
  const flipping = useMemo(() => new Set(state?.lastMove?.flipped || []), [state?.lastMove]);
  const myColor = state?.playerColor || 'black';
  const rivalColor = opponentOf(myColor);
  const myTurn = state?.status === 'playing' && state.turn === myColor;
  const result = resultInfo(state);
  const lockedByScene = state?.status === 'playing' && !!state?.specialEvent;

  function play() {
    setError('');
    findMatch(playerName);
  }

  function place(cell) {
    if (!myTurn || !legal.has(cell) || lockedByScene) return;
    setError('');
    sendAction({ type: 'place', payload: { cell } });
  }

  if (!state && !waiting) {
    return (
      <section className="rv-lobby">
        <div className="rv-lobby__logo" aria-hidden="true">
          <span className="rv-disc rv-disc--black" /><span className="rv-disc rv-disc--white" />
          <span className="rv-disc rv-disc--white" /><span className="rv-disc rv-disc--black" />
        </div>
        <div className="rv-eyebrow">Классическая настольная дуэль · 2 игрока</div>
        <h1>Реверси</h1>
        <p>Окружай фишки соперника своими — захваченные фишки перевернутся и станут твоими! К концу партии нужно собрать как можно больше.</p>
        <div className="rv-lobby__rules">
          <div><span>⚫</span><strong>Чёрные начинают</strong><small>Ходите по очереди</small></div>
          <div><span>↔</span><strong>Захватывай линии</strong><small>В том числе по диагонали</small></div>
          <div><span>🏆</span><strong>Больше фишек</strong><small>Тот и выиграл</small></div>
        </div>
        {error && <p className="rv-error" role="alert">{error}</p>}
        <button className="rv-primary" type="button" onClick={play}>Найти соперника <span>→</span></button>
        <button className="rv-text-button" type="button" onClick={onBack}>Вернуться к играм</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="rv-lobby rv-waiting">
        <div className="rv-waiting__spinner" aria-hidden="true"><span className="rv-disc rv-disc--black"/><span className="rv-disc rv-disc--white"/></div>
        <div className="rv-eyebrow">Онлайн · Реверси</div>
        <h2>Ищем соперника…</h2>
        <p>Матч начнётся автоматически, когда второй игрок присоединится.</p>
        <button className="rv-secondary" type="button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const scores = state.scores || { black: 2, white: 2 };
  const rivalName = state.players?.[rivalColor]?.name || 'Соперник';
  const myName = state.players?.[myColor]?.name || playerName;
  const currentName = state.turn === myColor ? 'Твой ход' : 'Ход соперника';

  return (
    <section className="rv-game">
      <header className="rv-heading">
        <div><div className="rv-eyebrow">Соревнование · 8 × 8</div><h1>Реверси <span>⚫⚪</span></h1></div>
        <div className="rv-heading__turns">{state.moveNumber || 0} ходов</div>
      </header>

      <div className="rv-scoreboard">
        <div className={`rv-player ${myTurn ? 'rv-player--active' : ''}`}>
          <span className={`rv-disc rv-disc--${myColor}`} aria-hidden="true"/>
          <div className="rv-player__info"><small>ТЫ · {colorLabel(myColor)}</small><strong title={myName}>{myName}</strong></div>
          <b>{scores[myColor]}</b>
        </div>
        <div className="rv-vs">VS</div>
        <div className={`rv-player rv-player--rival ${!myTurn && state.status === 'playing' ? 'rv-player--active' : ''}`}>
          <span className={`rv-disc rv-disc--${rivalColor}`} aria-hidden="true" />
          <div className="rv-player__info"><small>СОПЕРНИК · {colorLabel(rivalColor)}</small><strong title={rivalName}>{rivalName}</strong></div>
          <b>{scores[rivalColor]}</b>
        </div>
      </div>

      <div className="rv-layout">
        <div className="rv-board-area">
          <div className={`rv-turn-banner ${myTurn ? 'rv-turn-banner--mine' : ''}`} aria-live="polite">
            <span className="rv-turn-banner__dot" />
            <strong>{state.status === 'finished' ? 'Партия завершена' : currentName}</strong>
            {state.status === 'playing' && <span>{myTurn ? `Доступно ходов: ${legal.size}` : 'Ожидаем ход…'}</span>}
          </div>
          {state.skipped && state.status === 'playing' && (
            <div className="rv-pass" role="status">У {colorLabel(state.skipped).toLowerCase()} нет ходов — ход пропущен!</div>
          )}
          <div className="rv-board-frame">
            <div className="rv-board" role="grid" aria-label="Доска Реверси, 8 на 8">
              {(state.board || []).map((piece, cell) => {
                const canPlace = myTurn && legal.has(cell);
                const isLast = state.lastMove?.cell === cell;
                const wasFlipped = flipping.has(cell);
                const row = Math.floor(cell / 8) + 1;
                const col = cell % 8 + 1;
                return (
                  <button
                    type="button"
                    role="gridcell"
                    key={cell}
                    className={`rv-cell ${canPlace ? 'rv-cell--legal' : ''} ${isLast ? 'rv-cell--last' : ''}`}
                    disabled={!canPlace}
                    onClick={() => place(cell)}
                    aria-label={`Ряд ${row}, колонка ${col}: ${piece ? colorLabel(piece) : canPlace ? 'можно ходить' : 'пусто'}`}
                  >
                    {piece && <span key={`${cell}-${piece}-${wasFlipped ? state.lastMove?.moveNumber : ''}`} className={`rv-disc rv-disc--${piece} ${wasFlipped ? 'rv-disc--flipped' : ''}`} aria-hidden="true"/>}
                    {canPlace && <span className="rv-hint" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rv-board-note"><span>✦</span> Светящиеся клетки — это ходы, при которых ты захватываешь фишки соперника.</div>
        </div>

        <aside className="rv-sidebar">
          <div className="rv-panel rv-panel--guide">
            <div className="rv-eyebrow">Как играть</div>
            <h3>Захвати фишки!</h3>
            <p>Партия начинается с четырёх фишек в центре. Можно ходить только туда, где твоя новая фишка захватит хотя бы одну фишку соперника по прямой или диагонали. Захваченные фишки переворачиваются.</p>
            <div className="rv-example" aria-hidden="true">
              <span className="rv-disc rv-disc--black"/><span className="rv-disc rv-disc--white"/><span className="rv-disc rv-disc--white"/><span className="rv-disc rv-disc--black"/><span className="rv-example__arrow">→</span><span className="rv-disc rv-disc--black"/><span className="rv-disc rv-disc--black"/>
            </div>
          </div>
          <div className="rv-panel rv-panel--stats">
            <span className="rv-eyebrow">Статистика</span>
            <div className="rv-stat"><span>⚫ Чёрные</span><strong>{scores.black}</strong></div>
            <div className="rv-stat"><span>⚪ Белые</span><strong>{scores.white}</strong></div>
            <div className="rv-stat"><span>Свободных клеток</span><strong>{64 - scores.black - scores.white}</strong></div>
            <div className="rv-progress" aria-label="Соотношение фишек">
              <span style={{ width: `${(scores.black / Math.max(1, scores.black + scores.white)) * 100}%` }}/>
            </div>
          </div>
          {error && <div className="rv-error" role="alert">{error}</div>}
          {state.status === 'playing' && <button type="button" className="rv-resign" onClick={() => sendAction({ type: 'resign' })} disabled={lockedByScene}>Сдаться</button>}
          {adminMode && (
            <div className="rv-panel rv-secret-panel" aria-label="Секретные действия Реверси">
              <div className="rv-secret-panel__title">
                <span>Секретное меню</span><span className="rv-secret-panel__tag">ADMIN</span>
              </div>
              <button
                type="button"
                className="rv-secret-panel__action"
                title="Запустить секретную комбинацию на экранах обоих игроков"
                aria-label="Петля — показать секретную сцену обоим игрокам"
                disabled={state.status !== 'playing' || lockedByScene || !state.adminEnabled}
                onClick={() => sendAction({ type: 'admin:noose' })}
              >
                <span aria-hidden="true">🪢</span> Петля
              </button>
              {!state.adminEnabled && state.status === 'playing' && <p className="rv-secret-panel__hint">Открываем секретную панель…</p>}
              {state.adminEnabled && <p className="rv-secret-panel__hint">Картинки и звук появятся у обоих игроков</p>}
            </div>
          )}
        </aside>
      </div>

      {lockedByScene && <ReversiNooseScene
          event={state.specialEvent}
          onAudioDuration={state.adminEnabled
            ? (durationMs) => sendAction({ type: 'admin:noose:duration', payload: { durationMs, eventId: state.specialEvent?.id } })
            : undefined}
        />}
      {result?.title && state?.result?.type === 'noose' && (
        <ReversiNooseResult won={state.result.winner === myColor} onPlayAgain={play} onBack={onBack} />
      )}
      {result && state?.result?.type !== 'noose' && (
        <div className="rv-result" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className="rv-result__card">
            <div className="rv-result__icon">{result.icon}</div>
            <div className="rv-eyebrow">Реверси · Итоги матча</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="rv-result__actions">
              <button className="rv-primary" type="button" onClick={play}>Новый соперник →</button>
              <button className="rv-secondary" type="button" onClick={onBack}>К списку игр</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
