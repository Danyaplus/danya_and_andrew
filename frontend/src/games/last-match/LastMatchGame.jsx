import { useEffect, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './last-match.css';

const GAME_ID = 'last-match';
const TOTAL_MATCHES = 20;

function getPlayerName() {
  const stored = localStorage.getItem('danya-andrew-player-name');
  if (stored) return stored;
  const name = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', name);
  return name;
}

function MatchPile({ remaining = TOTAL_MATCHES, preview = 0, decorative = false }) {
  return (
    <div className={`lm-pile ${decorative ? 'lm-pile--decorative' : ''}`}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `На столе осталось ${remaining} из ${TOTAL_MATCHES} спичек`}
    >
      {Array.from({ length: TOTAL_MATCHES }, (_, index) => {
        const removed = index >= remaining;
        const picked = !removed && preview > 0 && index >= remaining - preview;
        return (
          <div
            key={index}
            className={`lm-match ${removed ? 'is-removed' : ''} ${picked ? 'is-preview' : ''} ${remaining === 1 && index === 0 ? 'is-last' : ''}`}
            aria-hidden="true"
          >
            <span className="lm-match__stick" />
            <span className="lm-match__head" />
          </div>
        );
      })}
    </div>
  );
}

function PlayerPanel({ name, label, active, me, lastActor }) {
  return (
    <div className={`lm-player ${active ? 'is-active' : ''} ${me ? 'lm-player--me' : 'lm-player--other'}`}>
      <span className="lm-player__avatar" aria-hidden="true">{me ? '✦' : '◆'}</span>
      <div className="lm-player__details">
        <span className="lm-player__label">{label}</span>
        <strong title={name}>{name}</strong>
      </div>
      <span className="lm-player__status" aria-label={active ? 'Сейчас ходит' : lastActor ? 'Сделал последний ход' : 'Ожидает'}>
        {active ? 'ХОД' : lastActor ? '✓' : '·'}
      </span>
    </div>
  );
}

export default function LastMatchGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [hovered, setHovered] = useState(0);
  const [pending, setPending] = useState(null);
  const { waiting, state, error, setError, findMatch, cancelSearch, sendAction } = useMultiplayerGame(GAME_ID);

  const seat = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mine = seat && state.players?.[seat];
  const opponent = foe && state.players?.[foe];
  const ended = state?.status === 'finished';
  const myTurn = Boolean(state && !ended && state.turn === seat);
  const pendingKey = state ? `${state.roomId}:${state.moveNumber}` : '';
  const waitingForReply = pending === pendingKey;
  const canTake = myTurn && !waitingForReply;
  const result = state?.result;
  const win = Boolean(result && result.winner === seat);
  const tookLast = result?.type === 'last-match' && result?.loser === seat;
  const lastActor = state?.lastMove?.seat;
  const remaining = state?.remaining ?? TOTAL_MATCHES;

  useEffect(() => {
    setHovered(0);
  }, [state?.moveNumber, state?.roomId]);

  useEffect(() => {
    if (!canTake) return undefined;
    function onKeyDown(event) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const count = Number(event.key);
      if (!Number.isInteger(count) || count < 1 || count > 3 || count > remaining) return;
      event.preventDefault();
      take(count);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canTake, remaining, pendingKey]);

  function take(count) {
    if (!canTake || !Number.isInteger(count) || count < 1 || count > Math.min(3, remaining)) return;
    setPending(pendingKey);
    setHovered(0);
    sendAction({ type: 'take', count });
  }

  function playAgain() {
    setPending(null);
    setHovered(0);
    setError('');
    findMatch(playerName);
  }

  function leave() {
    if (state?.status === 'playing') sendAction({ type: 'resign' });
    if (onBack) onBack();
    else window.location.hash = '#/';
  }

  if (!state) {
    return (
      <section className="lm-root lm-lobby">
        <div className="lm-lobby__spark lm-lobby__spark--one" aria-hidden="true">✦</div>
        <div className="lm-lobby__spark lm-lobby__spark--two" aria-hidden="true">✧</div>
        <div className="lm-eyebrow"><span className="lm-live-dot" /> МИНИ-ДУЭЛЬ · 2 ИГРОКА ОНЛАЙН</div>
        <div className="lm-lobby__display">
          <div className="lm-lobby__halo" />
          <div className="lm-lobby__matches"><MatchPile decorative /></div>
          <span className="lm-lobby__count">20</span>
          <span className="lm-lobby__tiny">СПИЧЕК НА СТОЛЕ</span>
        </div>
        <h1>ПОСЛЕДНЯЯ <em>СПИЧКА</em><span className="lm-title-star">✳</span></h1>
        <p className="lm-lobby__subtitle">По очереди забирайте от 1 до 3 спичек.<br />Тот, кто возьмёт <b>последнюю</b>, проиграет!</p>
        <div className="lm-lobby__rules">
          <div><strong>20</strong><span>спичек</span></div>
          <div><strong>1–3</strong><span>за ход</span></div>
          <div><strong>2</strong><span>игрока</span></div>
        </div>
        {waiting ? (
          <div className="lm-searching" role="status">
            <span className="lm-searching__flames" aria-hidden="true"><i /><i /><i /></span>
            <strong>ИЩЕМ СОПЕРНИКА…</strong>
            <p>Игра начнётся, как только найдётся второй игрок.</p>
            <button type="button" className="lm-outline-btn" onClick={cancelSearch}>Отменить поиск</button>
          </div>
        ) : (
          <button className="lm-main-btn" type="button" onClick={playAgain}>
            <span>⚡ НАЙТИ СОПЕРНИКА</span><span aria-hidden="true">→</span>
          </button>
        )}
        {error && <div className="lm-error" role="alert">{error}</div>}
        <p className="lm-lobby__note">На компьютере можно выбирать спички клавишами 1, 2, 3.</p>
      </section>
    );
  }

  return (
    <section className="lm-root lm-game">
      <div className="lm-game__topline"><span className="lm-eyebrow"><span className="lm-live-dot" /> ПОСЛЕДНЯЯ СПИЧКА</span><span className="lm-round-label">ИГРА НА ДВОИХ</span></div>
      <div className="lm-players">
        <PlayerPanel name={mine?.name || playerName} label="ТЫ" active={myTurn} me lastActor={lastActor === seat} />
        <span className="lm-players__vs" aria-hidden="true">VS</span>
        <PlayerPanel name={opponent?.name || 'Соперник'} label="СОПЕРНИК" active={!ended && !myTurn} lastActor={lastActor === foe} />
      </div>

      <div className="lm-status" role="status" aria-live="polite">
        {ended ? (
          <><span className="lm-status__icon">{win ? '🏆' : '✴'}</span><div><strong>{win ? 'ТЫ ПОБЕДИЛ!' : 'ИГРА ОКОНЧЕНА'}</strong><small>{result?.message}</small></div></>
        ) : myTurn ? (
          <><span className="lm-status__icon">⚡</span><div><strong>ТВОЙ ХОД!</strong><small>Сколько спичек заберёшь?</small></div></>
        ) : (
          <><span className="lm-status__icon">⌛</span><div><strong>ХОД СОПЕРНИКА</strong><small>Ждём, пока он выберет 1, 2 или 3 спички…</small></div></>
        )}
      </div>

      <div className="lm-table">
        <div className="lm-table__top">
          <span className="lm-table__tag">НА СТОЛЕ</span>
          <div className="lm-table__counter"><strong>{remaining}</strong><span> / {TOTAL_MATCHES}</span></div>
          <span className="lm-table__tag lm-table__tag--right">СПИЧЕК</span>
        </div>
        <div className="lm-table__rim">
          <div className="lm-table__halo" />
          <MatchPile remaining={remaining} preview={canTake ? hovered : 0} />
          {remaining === 0 && <div className="lm-empty-board" aria-hidden="true">✦ ПУСТО ✦</div>}
        </div>
        <div className="lm-table__caption">
          {remaining === 1 && !ended
            ? 'ОСТАЛАСЬ ОДНА! КТО-ТО ДОЛЖЕН ЕЁ ВЗЯТЬ…'
            : 'НЕ ЗАБИРАЙ ПОСЛЕДНЮЮ СПИЧКУ'}
        </div>
      </div>

      <div className="lm-control">
        <div className="lm-control__heading"><span>ТВОЙ ВЫБОР</span><small>{ended ? 'Матч завершён' : waitingForReply ? 'Подтверждаем ход…' : myTurn ? 'Нажми, сколько взять' : 'Ожидаем соперника'}</small></div>
        <div className="lm-take-buttons">
          {[1, 2, 3].map((count) => (
            <button
              type="button"
              key={count}
              disabled={!canTake || count > remaining}
              className={`lm-take ${hovered === count && canTake ? 'is-preview' : ''}`}
              onClick={() => take(count)}
              onMouseEnter={() => setHovered(count)}
              onMouseLeave={() => setHovered(0)}
              onFocus={() => setHovered(count)}
              onBlur={() => setHovered(0)}
              aria-label={`Взять ${count} ${count === 1 ? 'спичку' : 'спички'}`}
            >
              <span className="lm-take__number">{count}</span>
              <span className="lm-take__matches" aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</span>
              <span className="lm-take__copy">{count === 1 ? 'СПИЧКУ' : 'СПИЧКИ'}</span>
              <span className="lm-take__key">{count}</span>
            </button>
          ))}
        </div>
        {state.history?.length > 0 && (
          <div className="lm-history">
            <span className="lm-history__label">ПОСЛЕДНИЕ ХОДЫ</span>
            <div className="lm-history__list">
              {[...state.history].reverse().slice(0, 3).map((move) => (
                <div className="lm-history__item" key={move.number}>
                  <span className={move.seat === seat ? 'is-mine' : ''}>{move.seat === seat ? 'ТЫ' : 'СОПЕРНИК'}</span>
                  <span>забрал <b>{move.count}</b></span>
                  <small>осталось {move.remaining}</small>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lm-footer"><span>🔥 Бери 1, 2 или 3. Последняя — проигрыш!</span><button type="button" onClick={leave}>Выйти ↗</button></div>
      {error && <div className="lm-error" role="alert">{error}</div>}
      {ended && (
        <div className="lm-finish-backdrop">
          <div className={`lm-finish-card ${win ? 'is-win' : 'is-loss'}`} role="dialog" aria-modal="true" aria-label="Результат игры">
            <div className="lm-finish-card__symbol" aria-hidden="true">{win ? '🏆' : '💥'}</div>
            <span className="lm-finish-card__eyebrow">МАТЧ ЗАВЕРШЁН</span>
            <h2>{win ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</h2>
            <p>{tookLast ? 'Ты забрал последнюю спичку. В следующий раз будь хитрее!' : result?.type === 'last-match' && win ? 'Соперник забрал последнюю спичку. Ты перехитрил его!' : result?.message}</p>
            <button type="button" className="lm-main-btn" onClick={playAgain}>⚡ СЫГРАТЬ ЕЩЁ <span aria-hidden="true">→</span></button>
            <button type="button" className="lm-finish-card__exit" onClick={leave}>Вернуться к играм</button>
          </div>
        </div>
      )}
    </section>
  );
}
