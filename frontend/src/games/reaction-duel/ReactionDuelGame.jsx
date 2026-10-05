import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './reaction-duel.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function formatReaction(value) {
  if (value == null) return '—';
  return `${value} мс`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const winner = state.result?.winner;
  if (!winner) {
    return { title: 'НИЧЬЯ', icon: '🤝', tone: 'draw', text: state.result?.message || 'Результат одинаковый.' };
  }
  const won = winner === state.playerSeat;
  return {
    title: won ? 'ТЫ ПОБЕДИЛ' : 'ТЫ ПРОИГРАЛ',
    icon: won ? '⚡🏆' : '⏱️',
    tone: won ? 'win' : 'lose',
    text: state.result?.message || 'Раунд завершён.',
  };
}

export default function ReactionDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(0);
  const pointerIdRef = useRef(null);
  const holdingLocallyRef = useRef(false);
  const syncRef = useRef({ local: performance.now(), server: Date.now() });

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('reaction-duel');

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myRacer = me ? state?.racers?.[me] : null;
  const foeRacer = foe ? state?.racers?.[foe] : null;
  const myName = me ? state?.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state?.players?.[foe]?.name || 'Соперник' : 'Соперник';
  const result = resultPresentation(state);

  useEffect(() => {
    if (!state?.serverTime) return;
    syncRef.current = { local: performance.now(), server: state.serverTime };
  }, [state?.serverTime]);

  useEffect(() => {
    if (state?.phase !== 'go') {
      setClock(0);
      return undefined;
    }

    let frame = 0;
    const tick = () => {
      const sync = syncRef.current;
      const estimatedServerNow = sync.server + (performance.now() - sync.local);
      setClock(Math.max(0, estimatedServerNow - (state.goAt || estimatedServerNow)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state?.phase, state?.goAt]);

  useEffect(() => {
    holdingLocallyRef.current = Boolean(myRacer?.holding);
  }, [myRacer?.holding]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'Space' || event.repeat || !state || state.status !== 'playing') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (!holdingLocallyRef.current && state.phase === 'ready') {
        holdingLocallyRef.current = true;
        sendAction({ type: 'hold-start' });
      }
    };
    const onKeyUp = (event) => {
      if (event.code !== 'Space' || !holdingLocallyRef.current) return;
      event.preventDefault();
      holdingLocallyRef.current = false;
      sendAction({ type: 'hold-end' });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [sendAction, state]);

  const phaseLabel = useMemo(() => {
    if (!state) return '';
    if (state.phase === 'ready') {
      if (myRacer?.holding && foeRacer?.holding) return 'ГОТОВИМСЯ…';
      if (myRacer?.holding) return 'ЖДЁМ СОПЕРНИКА';
      if (foeRacer?.holding) return 'СОПЕРНИК ГОТОВ';
      return 'ЗАЖМИ И ДЕРЖИ';
    }
    if (state.phase === 'lights') return state.lightsLit >= state.lightCount ? 'НЕ ОТПУСКАЙ…' : 'СМОТРИ НА ОГНИ';
    if (state.phase === 'go') return myRacer?.released ? 'ВРЕМЯ ЗАФИКСИРОВАНО' : 'ОТПУСКАЙ!';
    return 'ФИНИШ';
  }, [state, myRacer?.holding, myRacer?.released, foeRacer?.holding]);

  function findMatch() {
    pointerIdRef.current = null;
    holdingLocallyRef.current = false;
    setError('');
    startMatch(playerName);
  }

  function pressHold(event) {
    event.preventDefault();
    if (!state || state.status !== 'playing' || state.phase !== 'ready' || holdingLocallyRef.current) return;
    holdingLocallyRef.current = true;
    pointerIdRef.current = event.pointerId;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    sendAction({ type: 'hold-start' });
  }

  function releaseHold(event) {
    if (!holdingLocallyRef.current) return;
    event?.preventDefault?.();
    holdingLocallyRef.current = false;
    pointerIdRef.current = null;
    sendAction({ type: 'hold-end' });
  }

  function exitToMenu() {
    if (typeof onBack === 'function') onBack();
    else window.location.hash = '#/';
  }

  if (!state && !waiting) {
    return (
      <section className="rd-lobby">
        <div className="rd-lobby__lights" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
        </div>
        <span className="eyebrow">Реакция · один сигнал · один победитель</span>
        <h1>Реакция: Старт</h1>
        <p>
          Оба зажимают кнопку. Пять красных ламп загораются по очереди, потом через случайные 0,1–3 секунды гаснут.
          Как только погасли — отпускай. Раньше сигнала отпустил — фальстарт и проигрыш.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="rd-waiting">
        <div className="rd-waiting__signal">● ● ● ● ●</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только соперник подключится, вы оба сможете зажать стартовую кнопку.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const lightCount = state.lightCount || 5;
  const lightsLit = state.phase === 'go' || state.phase === 'finished' ? 0 : (state.lightsLit || 0);
  const liveTimer = state.phase === 'go' && !myRacer?.released ? Math.min(clock, state.releaseTimeoutMs || 7000) : myRacer?.reactionMs;

  return (
    <section className="rd-shell">
      <header className="rd-hud">
        <div className="rd-player rd-player--you">
          <span className="rd-player__dot" />
          <div><small>ТЫ</small><strong>{myName}</strong></div>
        </div>
        <div className="rd-hud__center">
          <small>REACTION DUEL</small>
          <strong>{phaseLabel}</strong>
        </div>
        <div className="rd-player rd-player--foe">
          <div><small>СОПЕРНИК</small><strong>{foeName}</strong></div>
          <span className="rd-player__dot" />
        </div>
      </header>

      <div className={`rd-arena rd-arena--${state.phase}`}>
        <div className="rd-checkers rd-checkers--top" />
        <div className="rd-redline rd-redline--top" />

        <div className="rd-status-row">
          <div className={`rd-ready-state ${myRacer?.holding ? 'is-ready' : ''}`}>
            <span />
            <b>{myRacer?.holding ? 'ТЫ ДЕРЖИШЬ' : 'ЗАЖМИ КНОПКУ'}</b>
          </div>
          <div className="rd-phase-chip">{phaseLabel}</div>
          <div className={`rd-ready-state rd-ready-state--right ${foeRacer?.holding ? 'is-ready' : ''}`}>
            <b>{foeRacer?.holding ? 'СОПЕРНИК ДЕРЖИТ' : 'СОПЕРНИК ЖДЁТ'}</b>
            <span />
          </div>
        </div>

        <div className="rd-signal-box" aria-label="Стартовые огни">
          {Array.from({ length: lightCount }, (_, index) => (
            <div key={index} className={`rd-light ${index < lightsLit ? 'is-on' : ''}`}>
              <i />
            </div>
          ))}
        </div>

        <div className={`rd-timer ${state.phase === 'go' ? 'is-live' : ''}`}>
          <small>{state.phase === 'go' ? 'ТВОЯ РЕАКЦИЯ' : 'ТАЙМЕР'}</small>
          <strong>{liveTimer == null ? '0.000' : (liveTimer / 1000).toFixed(3)}</strong>
          <span>сек</span>
        </div>

        {state.phase === 'go' && !myRacer?.released && (
          <div className="rd-go-flash">ОТПУСКАЙ!</div>
        )}

        <div className="rd-redline rd-redline--bottom" />
        <div className="rd-checkers rd-checkers--bottom" />
      </div>

      <div className="rd-controls">
        <button
          type="button"
          className={`rd-hold-button ${myRacer?.holding ? 'is-held' : ''} ${state.phase === 'go' ? 'is-go' : ''} ${myRacer?.released ? 'is-released' : ''}`}
          onPointerDown={pressHold}
          onPointerUp={releaseHold}
          onPointerCancel={releaseHold}
          onLostPointerCapture={(event) => {
            if (pointerIdRef.current === event.pointerId) releaseHold(event);
          }}
          onContextMenu={(event) => event.preventDefault()}
          disabled={state.status !== 'playing' || myRacer?.released || myRacer?.timedOut || myRacer?.falseStart}
        >
          <span>{state.phase === 'go' ? '↑' : '●'}</span>
          <strong>{state.phase === 'go' ? 'ОТПУСТИ!' : myRacer?.holding ? 'ДЕРЖИ!' : 'ЗАЖМИ'}</strong>
          <small>{state.phase === 'ready' ? 'держи до погасания огней' : state.phase === 'lights' ? 'не отпускай раньше сигнала' : 'как можно быстрее'}</small>
        </button>

        <div className="rd-help">
          <span>⌨️ На ПК можно держать <b>ПРОБЕЛ</b></span>
          <span>⚠️ Фальстарт = мгновенный проигрыш</span>
          <span>⏱️ Не отпустил за 7 секунд = проигрыш</span>
        </div>
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="rd-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`rd-result rd-result--${result.tone}`}>
            <div className="rd-result__icon">{result.icon}</div>
            <span className="eyebrow">Раунд завершён</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>

            <div className="rd-result__times">
              <div>
                <small>ТЫ</small>
                <strong>{myRacer?.falseStart ? 'ФАЛЬСТАРТ' : myRacer?.timedOut ? '> 7 сек' : formatReaction(myRacer?.reactionMs)}</strong>
              </div>
              <span>VS</span>
              <div>
                <small>СОПЕРНИК</small>
                <strong>{foeRacer?.falseStart ? 'ФАЛЬСТАРТ' : foeRacer?.timedOut ? '> 7 сек' : formatReaction(foeRacer?.reactionMs)}</strong>
              </div>
            </div>

            <div className="rd-result__actions">
              <button className="primary-button" onClick={findMatch}>Ещё раз</button>
              <button className="secondary-button" onClick={exitToMenu}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
