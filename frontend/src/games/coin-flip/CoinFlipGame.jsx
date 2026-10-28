import { getPlayerName } from '../../lib/playerName.js';
import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './coin-flip.css';

const GAME_ID = 'coin-flip';



function SideIcon({ side }) {
  return side === 'heads' ? <span aria-hidden="true">🦅</span> : <span aria-hidden="true">✦</span>;
}

function Coin({ phase, outcome, round, small = false }) {
  return (
    <div className={`cf-coin-scene ${small ? 'cf-coin-scene--small' : ''}`} aria-label={outcome === 'heads' ? 'Орёл' : outcome === 'tails' ? 'Решка' : 'Золотая монета'}>
      <div key={`${round}-${phase === 'flipping' ? 'spin' : 'rest'}`} className={`cf-coin ${phase === 'flipping' ? 'cf-coin--spinning' : ''} ${outcome === 'tails' ? 'cf-coin--tails' : ''}`}>
        <div className="cf-coin__face cf-coin__face--heads"><div className="cf-coin__rim"><span className="cf-coin__emblem">🦅</span><strong>ОРЁЛ</strong><small>★ ★ ★</small></div></div>
        <div className="cf-coin__face cf-coin__face--tails"><div className="cf-coin__rim"><span className="cf-coin__emblem cf-coin__emblem--tails">✦</span><strong>РЕШКА</strong><small>★ ★ ★</small></div></div>
      </div>
      <div className="cf-coin-shadow" />
    </div>
  );
}

function ResultOverlay({ state, me, mine, foe, onAgain, onBack }) {
  const result = state.result;
  const draw = result?.winner == null;
  const winner = result?.winner === me;
  return (
    <div className="cf-finish-overlay" role="dialog" aria-modal="true" aria-label="Результат матча">
      <div className="cf-finish-card">
        <div className="cf-finish-glow" aria-hidden="true" />
        <div className="cf-finish-icon" aria-hidden="true">{draw ? '🤝' : winner ? '🏆' : '🎯'}</div>
        <div className="cf-kicker">МАТЧ ЗАВЕРШЁН · 7 РАУНДОВ</div>
        <h2>{draw ? 'НИЧЬЯ!' : winner ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</h2>
        <p>{result?.message}</p>
        <div className="cf-finish-points">
          <div><span>ТЫ</span><strong>{mine?.score ?? 0}</strong></div>
          <b>:</b>
          <div><span>СОПЕРНИК</span><strong>{foe?.score ?? 0}</strong></div>
        </div>
        <div className="cf-finish-actions">
          <button type="button" className="cf-button cf-button--gold" onClick={onAgain}>↻ Играть ещё</button>
          <button type="button" className="cf-button cf-button--quiet" onClick={onBack}>← Все игры</button>
        </div>
      </div>
    </div>
  );
}

export default function CoinFlipGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(Date.now);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { waiting, state, error, setError, findMatch, cancelSearch, sendAction } = useMultiplayerGame(GAME_ID);
  const skewRef = useRef(0);
  const previousRef = useRef('');
  const sendRef = useRef(sendAction);
  const canChooseRef = useRef(false);
  sendRef.current = sendAction;
  canChooseRef.current = state?.status === 'playing' && state?.phase === 'choosing' && !state.myChoice;

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (state?.serverTime) skewRef.current = state.serverTime - Date.now();
  }, [state?.serverTime]);

  useEffect(() => {
    const listener = (event) => {
      if (!canChooseRef.current || event.repeat || event.metaKey || event.altKey || event.ctrlKey) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const side = event.key === '1' ? 'heads' : event.key === '2' ? 'tails' : null;
      if (!side) return;
      event.preventDefault();
      sendRef.current({ type: 'choose', choice: side });
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    if (!state || !soundEnabled) return;
    const key = `${state.roomId}-${state.round}-${state.phase}`;
    if (key === previousRef.current) return;
    const old = previousRef.current;
    previousRef.current = key;
    if (!old.startsWith(`${state.roomId}-`)) return;
    if (state.phase !== 'summary' && state.phase !== 'finished') return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      if (context.state === 'suspended') { context.close(); return; }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const success = state.roundResult?.winners?.includes(state.playerSeat);
      oscillator.type = 'sine';
      oscillator.frequency.value = success ? 740 : 360;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.065, context.currentTime + .025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + .26);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + .27);
      oscillator.onended = () => context.close();
    } catch { /* Audio is optional (e.g. muted browser tabs). */ }
  }, [state, soundEnabled]);

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mine = me ? state.players?.[me] : null;
  const theirs = foe ? state.players?.[foe] : null;
  const phase = state?.phase;
  const secondsLeft = state?.phaseEndsAt ? Math.max(0, (state.phaseEndsAt - clock - skewRef.current) / 1000) : 0;
  const canChoose = phase === 'choosing' && state?.status === 'playing' && !state?.myChoice && secondsLeft > 0;
  const isReveal = phase === 'summary' || phase === 'finished';
  const roundResult = state?.roundResult;
  const myRoundWin = roundResult?.winners?.includes(me);
  const foeRoundWin = roundResult?.winners?.includes(foe);

  function startAgain() {
    previousRef.current = '';
    setError('');
    findMatch(playerName);
  }

  function leave() {
    if (state?.status === 'playing') sendAction({ type: 'resign' });
    if (onBack) onBack();
    else window.location.hash = '#/';
  }

  function choose(side) {
    if (canChoose) sendRef.current({ type: 'choose', choice: side });
  }

  if (!state) {
    return (
      <section className="cf-lobby">
        <div className="cf-lobby__glow" aria-hidden="true" />
        <div className="cf-kicker">✦ КОРОТКАЯ ДУЭЛЬ · 2 ИГРОКА ОНЛАЙН</div>
        <div className="cf-lobby__coin"><Coin phase="idle" outcome={null} round={0} /></div>
        <h1>ОРЁЛ <span>ИЛИ</span> РЕШКА</h1>
        <p>Выбери сторону, дождись броска золотой монеты и проверь свою удачу вместе с соперником!</p>
        <div className="cf-feature-list"><span>🪙 7 раундов</span><span>🔒 Тайный выбор</span><span>🏆 Победа по очкам</span></div>
        {waiting ? (
          <div className="cf-waiting">
            <div className="cf-waiting__dots"><i /><i /><i /></div>
            <strong>ИЩЕМ СОПЕРНИКА…</strong>
            <p>Ожидаем второго игрока. Матч начнётся автоматически.</p>
            <button type="button" className="cf-button cf-button--quiet" onClick={cancelSearch}>Отменить поиск</button>
          </div>
        ) : (
          <button type="button" className="cf-button cf-button--gold cf-lobby__start" onClick={startAgain}>⚡ НАЙТИ СОПЕРНИКА <span>→</span></button>
        )}
        {error && <div className="cf-error" role="alert">{error}</div>}
        <div className="cf-lobby__hint">👆 На телефоне — касание, на компьютере — клавиши 1 и 2</div>
      </section>
    );
  }

  return (
    <section className="cf-game">
      <header className="cf-scoreboard">
        <div className="cf-score-player cf-score-player--mine">
          <div className="cf-score-player__avatar">🟣</div>
          <div className="cf-score-player__name"><small>ТЫ</small><strong title={mine?.name}>{mine?.name || playerName}</strong></div>
          <b className="cf-score-player__score">{mine?.score ?? 0}</b>
        </div>
        <div className="cf-scoreboard__vs">VS</div>
        <div className="cf-score-player cf-score-player--opponent">
          <b className="cf-score-player__score">{theirs?.score ?? 0}</b>
          <div className="cf-score-player__name"><small>СОПЕРНИК</small><strong title={theirs?.name}>{theirs?.name || 'Игрок'}</strong></div>
          <div className="cf-score-player__avatar">🔵</div>
        </div>
      </header>

      <div className="cf-round-track" role="group" aria-label={`Раунд ${state.round} из 7`}>
        {Array.from({ length: 7 }, (_, index) => {
          const rec = state.history?.find((item) => item.round === index + 1);
          return <div key={index} className={`cf-round-track__dot ${index + 1 === state.round ? 'is-current' : ''} ${rec?.winners?.includes(me) ? 'is-scored' : ''}`} title={`Раунд ${index + 1}: ${rec ? rec.outcome === 'heads' ? 'орёл' : 'решка' : 'впереди'}`}>{index + 1}</div>;
        })}
      </div>

      <div className="cf-meta">
        <div><small>РАУНД</small><strong>{state.round}<span> / 7</span></strong></div>
        <span className="cf-meta__phase">{phase === 'countdown' ? 'ПРИГОТОВЬСЯ' : phase === 'choosing' ? 'СДЕЛАЙ ВЫБОР' : phase === 'flipping' ? 'МОНЕТА В ВОЗДУХЕ' : phase === 'summary' ? 'РЕЗУЛЬТАТ БРОСКА' : 'МАТЧ ЗАВЕРШЁН'}</span>
        <div className="cf-meta__timer"><small>ТАЙМЕР</small><strong>{phase === 'finished' ? '—' : phase === 'choosing' ? secondsLeft.toFixed(1) : Math.ceil(secondsLeft)}<span> с</span></strong></div>
      </div>

      <main className={`cf-arena cf-arena--${phase}`}>
        <div className="cf-arena__grid" aria-hidden="true" />
        <div className="cf-arena__halo" aria-hidden="true" />
        <div className="cf-arena__sparks" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/></div>
        {phase === 'countdown' ? (
          <div className="cf-countdown" aria-live="polite">
            <span className="cf-arena__eyebrow">ПРИГОТОВЬСЯ К БРОСКУ</span>
            <b key={Math.ceil(secondsLeft)}>{Math.max(1, Math.ceil(secondsLeft))}</b>
            <small>Удача любит смелых!</small>
          </div>
        ) : (
          <>
            <div className="cf-arena__eyebrow">{phase === 'choosing' ? 'КАКАЯ СТОРОНА ВЫПАДЕТ?' : phase === 'flipping' ? 'ПОДБРАСЫВАЕМ МОНЕТУ...' : 'ВЫПАЛА СТОРОНА'}</div>
            <Coin phase={phase} outcome={isReveal ? state.outcome : null} round={state.round} />
            <div className="cf-coin-caption" aria-live="polite">{phase === 'flipping' ? 'Крутится…' : isReveal ? state.outcome === 'heads' ? '🦅 ОРЁЛ' : '✦ РЕШКА' : 'ВЫБЕРИ СТОРОНУ МОНЕТЫ'}</div>
            {phase === 'summary' && <div className={`cf-arena__outcome ${myRoundWin ? 'is-win' : ''}`} role="status">{myRoundWin ? '✨ +1 ОЧКО ТЕБЕ!' : foeRoundWin ? 'СОПЕРНИК УГАДАЛ!' : 'НИКТО НЕ УГАДАЛ'}</div>}
          </>
        )}
      </main>

      <div className="cf-decision">
        <div className="cf-decision__heading">{phase === 'choosing' ? 'ТВОЯ СТАВКА' : phase === 'flipping' ? 'ОЖИДАЕМ РЕЗУЛЬТАТ' : phase === 'summary' ? 'ВЫБОРЫ ИГРОКОВ' : 'КТО УГАДАЕТ?'}</div>
        <div className="cf-choice-buttons">
          {['heads', 'tails'].map((side, i) => (
            <button
              key={side}
              type="button"
              className={`cf-choice cf-choice--${side} ${state.myChoice === side ? 'is-selected' : ''} ${isReveal && state.outcome === side ? 'is-revealed' : ''}`}
              onClick={() => choose(side)}
              disabled={!canChoose}
              aria-pressed={state.myChoice === side}
            >
              <span className="cf-choice__icon"><SideIcon side={side} /></span>
              <span className="cf-choice__label"><small>{`КЛАВИША ${i + 1}`}</small><strong>{side === 'heads' ? 'ОРЁЛ' : 'РЕШКА'}</strong></span>
              <span className="cf-choice__check">{state.myChoice === side ? '✓' : '↗'}</span>
            </button>
          ))}
        </div>
        <div className="cf-ready" aria-live="polite">
          <div><span className={`cf-ready__light ${state.myChoice ? 'is-ready' : ''}`} />{state.myChoice ? 'Твой выбор принят' : phase === 'choosing' ? 'Ты ещё не выбрал' : 'Выбор закрыт'}</div>
          <div><span className={`cf-ready__light ${state.opponentReady ? 'is-ready' : ''}`} />{state.opponentReady ? 'Соперник готов' : phase === 'choosing' ? 'Соперник выбирает…' : 'Ожидаем следующий раунд'}</div>
        </div>
        {phase === 'summary' && roundResult && <div className="cf-summary-picks">ТЫ: <b>{roundResult.picks?.[me] === 'heads' ? 'ОРЁЛ' : roundResult.picks?.[me] === 'tails' ? 'РЕШКА' : '—'}</b> <span>·</span> СОПЕРНИК: <b>{roundResult.picks?.[foe] === 'heads' ? 'ОРЁЛ' : roundResult.picks?.[foe] === 'tails' ? 'РЕШКА' : '—'}</b></div>}
      </div>
      <footer className="cf-footer"><span>🪙 Оба угадали? Оба получают очко.</span><div><button type="button" onClick={() => setSoundEnabled(!soundEnabled)} aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'} title="Звук">{soundEnabled ? '🔊' : '🔇'}</button><button type="button" onClick={leave}>Выйти</button></div></footer>
      {error && <div className="cf-error" role="alert">{error}</div>}
      {state.status === 'finished' && <ResultOverlay state={state} me={me} mine={mine} foe={theirs} onAgain={startAgain} onBack={leave} />}
    </section>
  );
}
