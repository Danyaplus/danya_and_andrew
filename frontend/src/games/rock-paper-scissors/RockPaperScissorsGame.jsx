import { getPlayerName } from '../../lib/playerName.js';
import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './rock-paper-scissors.css';

const GESTURES = [
  { id: 'rock', emoji: '✊', name: 'Камень', caption: 'Бьёт ножницы' },
  { id: 'scissors', emoji: '✌️', name: 'Ножницы', caption: 'Режут бумагу' },
  { id: 'paper', emoji: '✋', name: 'Бумага', caption: 'Накрывает камень' },
];
const BY_ID = Object.fromEntries(GESTURES.map((gesture) => [gesture.id, gesture]));



function Gesture({ move, hidden = false, className = '' }) {
  return (
    <span className={`rps-gesture ${hidden ? 'rps-gesture--hidden' : ''} ${className}`} aria-hidden="true">
      {hidden ? '❔' : BY_ID[move]?.emoji || '✊'}
    </span>
  );
}

function PlayerScore({ name, score = 0, ready, own, target }) {
  return (
    <div className={`rps-player ${own ? 'rps-player--own' : 'rps-player--other'}`}>
      <div className="rps-player__head">
        <span className="rps-player__avatar" aria-hidden="true">{own ? '😎' : '🤖'}</span>
        <div className="rps-player__meta">
          <small>{own ? 'ТЫ' : 'СОПЕРНИК'}</small>
          <strong title={name}>{name}</strong>
        </div>
      </div>
      <div className="rps-player__points" aria-label={`${score} из ${target} побед`}>
        {Array.from({ length: target }, (_, index) => (
          <span className={index < score ? 'is-earned' : ''} key={index} />
        ))}
      </div>
      <div className="rps-player__footer"><b>{score}</b><small> / {target}</small>
        <span className={`rps-ready ${ready ? 'is-ready' : ''}`}>{ready ? '✓ Готов' : '○ Думает'}</span>
      </div>
    </div>
  );
}

export default function RockPaperScissorsGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState(null);
  const serverOffset = useRef(0);
  const { waiting, state, error, setError, findMatch, cancelSearch, sendAction } = useMultiplayerGame('rock-paper-scissors');

  useEffect(() => {
    if (Number.isFinite(state?.serverTime)) {
      serverOffset.current = state.serverTime - Date.now();
    }
  }, [state?.serverTime]);

  useEffect(() => {
    if (!state || state.status !== 'playing') return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(interval);
  }, [state?.roomId, state?.status]);

  // Prevent ghost selection during the short round-trip before the server confirms it.
  useEffect(() => { setPending(null); }, [state?.round, state?.phase, state?.myMove, state?.roomId]);

  function startMatch() {
    setPending(null);
    setError('');
    findMatch(playerName);
  }

  function choose(move) {
    if (state?.status !== 'playing' || state.phase !== 'picking' || state.myMove || pending) return;
    if (Date.now() + serverOffset.current >= state.phaseEndAt) return;
    setPending(move);
    setError('');
    sendAction({ type: 'choose', payload: { move } });
  }

  const phase = state?.phase;
  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myName = state?.players?.[me]?.name || playerName;
  const foeName = state?.players?.[foe]?.name || 'Соперник';
  const myMove = state?.myMove || pending;
  const revealed = phase === 'reveal' || (phase === 'finished' && state?.lastRound);
  const lastRound = state?.lastRound;
  const remainingMs = Math.max(0, (state?.phaseEndAt ?? now) - (now + serverOffset.current));
  const leftSeconds = Math.ceil(remainingMs / 1000);
  const locked = Boolean(myMove);
  const canChoose = state?.status === 'playing' && phase === 'picking' && !locked && remainingMs > 0;
  const roundWinner = lastRound?.winner;
  const outcome = roundWinner === null ? 'Ничья! Повторяем!' : roundWinner === me ? 'Ты выиграл раунд!' : 'Раунд за соперником';
  const matchWon = state?.result?.winner === me;

  if (!state && !waiting) {
    return (
      <section className="rps-root rps-lobby">
        <div className="rps-glow rps-glow--one" /><div className="rps-glow rps-glow--two" />
        <div className="rps-lobby__tag">⚡ БЫСТРАЯ ДУЭЛЬ · 2 ИГРОКА</div>
        <div className="rps-lobby__hands" aria-hidden="true">
          <span>✊</span><span>✌️</span><span>✋</span>
        </div>
        <h1>КАМЕНЬ<br /><em>НОЖНИЦЫ</em><br />БУМАГА</h1>
        <p>Выбирай жест втайне от соперника. Когда оба готовы — руки раскрываются одновременно!</p>
        <div className="rps-lobby__rules">
          <span>🏆 До 5 побед</span><span>🤝 Ничья — без очков</span><span>⏳ 22 сек. на выбор</span>
        </div>
        {error && <div className="rps-error" role="alert">{error}</div>}
        <button type="button" className="rps-main-btn" onClick={startMatch}>⚔️ Найти соперника <span>→</span></button>
        <span className="rps-lobby__note">Не успеешь выбрать — выпадет случайный жест.</span>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="rps-root rps-waiting" aria-live="polite">
        <div className="rps-waiting__orbit" aria-hidden="true"><span>✊</span><span>✌️</span><span>✋</span></div>
        <div className="rps-lobby__tag">ПОИСК СОПЕРНИКА</div>
        <h2>Готовь кулачки!</h2>
        <p>Ищем второго игрока. Матч начнётся автоматически, когда он подключится.</p>
        <button type="button" className="rps-outline-btn" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="rps-root rps-match">
      <header className="rps-hud">
        <PlayerScore name={myName} score={state.score?.[me]} ready={state.ready?.[me]} own target={state.targetWins} />
        <div className="rps-hud__versus"><b>VS</b><small>РАУНД {state.round}</small></div>
        <PlayerScore name={foeName} score={state.score?.[foe]} ready={state.ready?.[foe]} target={state.targetWins} />
      </header>

      <div className="rps-arena">
        <div className="rps-arena__dots" aria-hidden="true" />
        <div className="rps-arena__top">
          <span className="rps-round-tag">РАУНД {state.round}</span>
          <div className={`rps-timer ${phase === 'picking' && leftSeconds <= 5 ? 'is-urgent' : ''}`}>
            {phase === 'picking' ? `⏱ ${leftSeconds}с` : phase === 'countdown' ? 'ПРИГОТОВЬСЯ' : revealed ? 'РЕЗУЛЬТАТ' : 'ФИНИШ'}
          </div>
        </div>

        <div className="rps-arena__faceoff" key={`${state.roomId}-${state.round}-${phase}`}>
          <div className={`rps-hand-slot rps-hand-slot--you ${revealed ? 'is-revealed' : ''}`}>
            <small>ТВОЙ ЖЕСТ</small>
            <div className="rps-hand-slot__orb">
              <Gesture move={revealed ? lastRound?.[me] : myMove} hidden={!revealed && !myMove} />
            </div>
            <strong>{revealed ? BY_ID[lastRound?.[me]]?.name : myMove ? BY_ID[myMove]?.name : '???'}</strong>
          </div>
          <div className="rps-arena__center">⚡</div>
          <div className={`rps-hand-slot rps-hand-slot--foe ${revealed ? 'is-revealed' : ''}`}>
            <small>ЖЕСТ СОПЕРНИКА</small>
            <div className="rps-hand-slot__orb"><Gesture move={lastRound?.[foe]} hidden={!revealed} /></div>
            <strong>{revealed ? BY_ID[lastRound?.[foe]]?.name : state.ready?.[foe] ? 'Выбрано ✓' : '???'}</strong>
          </div>
        </div>

        {phase === 'countdown' && (
          <div className="rps-announcement rps-announcement--count" key={`intro-${state.roomId}`}>
            <span>НА СТАРТ!</span><b>{Math.max(1, leftSeconds)}</b><small>Выбор начнётся через мгновение</small>
          </div>
        )}
        {phase === 'reveal' && (
          <div className={`rps-round-outcome ${roundWinner === me ? 'is-win' : roundWinner ? 'is-loss' : 'is-draw'}`} role="status">
            <b>{roundWinner === null ? '🤝' : roundWinner === me ? '🏅' : '💥'} {outcome}</b>
            <small>{lastRound?.auto?.[me] || lastRound?.auto?.[foe] ? 'Пропущенный выбор заменён случайным жестом' : roundWinner === null ? 'Очки остаются прежними' : '+1 победа'}</small>
          </div>
        )}
        {phase === 'picking' && (
          <div className="rps-live-message" role="status">
            {locked ? '🔒 Жест выбран. Ожидаем соперника…' : '👇 Выбери свой жест ниже!'}
          </div>
        )}
        <div className="rps-arena__footer">{state.score?.[me] || 0} : {state.score?.[foe] || 0} <span>·</span> первый до {state.targetWins}</div>
      </div>

      <div className={`rps-choices ${!canChoose ? 'is-disabled' : ''}`} aria-label="Выбор жеста">
        <div className="rps-choices__heading"><b>{phase === 'picking' ? locked ? 'ТВОЙ ВЫБОР ЗАФИКСИРОВАН' : 'ТВОЙ ХОД!' : phase === 'countdown' ? 'СКОРО НАЧНЁМ' : 'СЛЕДУЮЩИЙ РАУНД'}</b><span>Выбери один жест</span></div>
        <div className="rps-choices__grid">
          {GESTURES.map((gesture) => (
            <button
              key={gesture.id}
              type="button"
              className={`rps-choice rps-choice--${gesture.id} ${myMove === gesture.id && phase === 'picking' ? 'is-picked' : ''}`}
              onClick={() => choose(gesture.id)}
              disabled={!canChoose}
              aria-pressed={myMove === gesture.id && phase === 'picking'}
              aria-label={`${gesture.name}. ${gesture.caption}`}
            >
              <span className="rps-choice__icon">{gesture.emoji}</span>
              <strong>{gesture.name}</strong><small>{gesture.caption}</small>
              {myMove === gesture.id && phase === 'picking' && <i>✓</i>}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rps-error" role="alert">{error}</div>}
      {state.status === 'playing' && <button type="button" className="rps-quit" onClick={() => sendAction({ type: 'resign' })}>Выйти из матча</button>}
      {state.status === 'finished' && (
        <div className="rps-result-backdrop" role="dialog" aria-modal="true" aria-label="Матч завершён">
          <div className={`rps-result ${matchWon ? 'is-win' : 'is-loss'}`}>
            <div className="rps-result__medal">{matchWon ? '🏆' : '🎯'}</div>
            <span>МАТЧ ЗАВЕРШЁН</span>
            <h2>{matchWon ? 'ПОБЕДА!' : 'МАТЧ ОКОНЧЕН'}</h2>
            <p>{state.result?.type === 'score' ? matchWon ? 'Ты первым набрал пять побед. Красиво сыграно!' : 'В этот раз соперник оказался хитрее!' : state.result?.message}</p>
            <div className="rps-result__score"><strong>{state.score?.[me]}</strong><span>:</span><strong>{state.score?.[foe]}</strong></div>
            <div className="rps-result__buttons">
              <button type="button" className="rps-main-btn" onClick={startMatch}>🔄 Играть снова</button>
              <button type="button" className="rps-outline-btn" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
