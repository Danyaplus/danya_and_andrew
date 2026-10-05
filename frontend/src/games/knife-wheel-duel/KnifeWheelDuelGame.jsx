import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './knife-wheel-duel.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  if (state.result?.type === 'draw') {
    return { won: null, icon: '🤝', title: 'Ничья', text: state.result.message || 'Поровну.' };
  }
  const won = state.result?.winner === state.playerSeat;
  return {
    won,
    icon: won ? '🏆' : '🗡️',
    title: won ? 'Ты победил!' : 'Ты проиграл',
    text: state.result?.message || 'Матч завершён.',
  };
}

function KnifeIcon({ color = 'red', small = false }) {
  return (
    <span className={`kwd-knife kwd-knife--${color} ${small ? 'is-small' : ''}`} aria-hidden="true">
      <i className="kwd-knife__blade" />
      <i className="kwd-knife__guard" />
      <i className="kwd-knife__handle" />
      <i className="kwd-knife__ring" />
    </span>
  );
}

function Target({ state }) {
  const knives = state?.wheel?.knives || [];
  const angle = state?.wheel?.angle || 0;

  return (
    <div className="kwd-target-wrap">
      <div className="kwd-target-shadow" />
      <div className="kwd-target" style={{ transform: `rotate(${angle}deg)` }}>
        <div className="kwd-target__ring kwd-target__ring--outer" />
        <div className="kwd-target__ring kwd-target__ring--mid" />
        <div className="kwd-target__ring kwd-target__ring--white" />
        <div className="kwd-target__bull" />
        {knives.map((knife) => (
          <div
            key={knife.id}
            className="kwd-stuck"
            style={{ transform: `rotate(${knife.localAngle}deg)` }}
          >
            <KnifeIcon color={knife.seat === 'a' ? 'red' : 'blue'} small />
          </div>
        ))}
      </div>
    </div>
  );
}

function KnifeStack({ count, color, side }) {
  return (
    <div className={`kwd-stack kwd-stack--${side}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="kwd-stack__item">
          <KnifeIcon color={color} small />
        </div>
      ))}
    </div>
  );
}

export default function KnifeWheelDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const sendActionRef = useRef(null);
  const canThrowRef = useRef(false);
  const [shotFlash, setShotFlash] = useState(0);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('knife-wheel-duel');

  sendActionRef.current = sendAction;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myRunner = me ? state?.runners?.[me] : null;
  const foeRunner = foe ? state?.runners?.[foe] : null;
  const myPlayer = me ? state?.players?.[me] : null;
  const foePlayer = foe ? state?.players?.[foe] : null;
  const result = resultPresentation(state);
  const myColor = me === 'a' ? 'red' : 'blue';
  const foeColor = foe === 'a' ? 'red' : 'blue';
  const canThrow = state?.status === 'playing' && state?.phase === 'playing' && !myRunner?.failed && !myRunner?.completed;
  canThrowRef.current = canThrow;

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(timer);
  }, [state?.roomId, state?.status]);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target?.matches?.('input, textarea, select, button')) return;
      event.preventDefault();
      if (canThrowRef.current) {
        sendActionRef.current?.({ type: 'throw' });
        setShotFlash((value) => value + 1);
      }
    }
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);

  const roundCountdown = state?.phase === 'round-intro'
    ? Math.max(1, Math.ceil(((state.phaseEndsAt || now) - now) / 500))
    : null;

  const totalKnives = state?.knivesPerPlayer || 5;
  const myScore = me ? state?.scores?.[me] ?? 0 : 0;
  const foeScore = foe ? state?.scores?.[foe] ?? 0 : 0;
  const myName = myPlayer?.name || playerName;
  const foeName = foePlayer?.name || 'Соперник';

  const statusText = useMemo(() => {
    if (!state) return '';
    if (state.phase === 'round-intro') return `Раунд ${state.round} · приготовься`;
    if (state.phase === 'round-result') {
      const mine = me ? state.roundScores?.[me] : false;
      const theirs = foe ? state.roundScores?.[foe] : false;
      if (mine && theirs) return 'Оба поставили все кинжалы · +1 каждому';
      if (mine) return 'Раунд твой · +1';
      if (theirs) return 'Раунд соперника';
      return 'Никто не получает очко';
    }
    if (myRunner?.failed) return 'Ты попал в кинжал — жди соперника';
    if (myRunner?.completed) return 'Все твои кинжалы стоят — жди соперника';
    return 'Метай в свободное место';
  }, [state, me, foe, myRunner]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function throwKnife(event) {
    event?.preventDefault?.();
    if (!canThrow) return;
    setShotFlash((value) => value + 1);
    sendAction({ type: 'throw' });
    navigator.vibrate?.(12);
  }

  function exitToMenu() {
    if (typeof onBack === 'function') onBack();
    else window.location.hash = '#/';
  }

  if (!state && !waiting) {
    return (
      <section className="kwd-lobby">
        <div className="kwd-lobby__icon">🗡️</div>
        <span className="eyebrow">2 игрока · 3 раунда</span>
        <h1>Кинжалы</h1>
        <p>
          Мишень постоянно меняет скорость и направление. Втыкай все свои кинжалы, но не попади в уже стоящий клинок.
          Ошибся — в этом раунде больше не бросаешь, а соперник докидывает свои.
        </p>
        <div className="kwd-rules">
          <span>🎯 5 → 6 → 7 кинжалов</span>
          <span>🔄 случайная скорость и направление</span>
          <span>🏆 3 раунда</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="kwd-waiting">
        <div className="kwd-waiting__spinner">🗡️</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго игрока…</h2>
        <p>Игра начнётся автоматически.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="kwd-game">
      <div className="kwd-scorebar">
        <div className="kwd-scorebar__player">
          <span className={`kwd-color-dot kwd-color-dot--${myColor}`} />
          <div><small>Ты</small><strong>{myName}</strong></div>
          <b>{myScore}</b>
        </div>
        <div className="kwd-scorebar__round">
          <small>РАУНД</small>
          <strong>{state.round}/{state.roundCount}</strong>
        </div>
        <div className="kwd-scorebar__player kwd-scorebar__player--foe">
          <b>{foeScore}</b>
          <div><small>Соперник</small><strong>{foeName}</strong></div>
          <span className={`kwd-color-dot kwd-color-dot--${foeColor}`} />
        </div>
      </div>

      <div className="kwd-stage">
        <div className="kwd-bamboo kwd-bamboo--left" aria-hidden="true" />
        <div className="kwd-bamboo kwd-bamboo--right" aria-hidden="true" />
        <div className="kwd-cloud kwd-cloud--top" aria-hidden="true" />
        <div className="kwd-cloud kwd-cloud--bottom" aria-hidden="true" />

        <div className="kwd-round-banner">
          <small>КИНЖАЛЫ</small>
          <strong>{myRunner?.remaining ?? 0}</strong>
        </div>

        <KnifeStack count={myRunner?.remaining ?? 0} color={myColor} side="mine" />
        <KnifeStack count={foeRunner?.remaining ?? 0} color={foeColor} side="foe" />

        <Target state={state} />

        <div className={`kwd-launcher kwd-launcher--${myColor} ${canThrow ? 'is-ready' : ''}`} key={shotFlash}>
          <KnifeIcon color={myColor} />
        </div>

        <button
          type="button"
          className={`kwd-throw-button kwd-throw-button--${myColor} ${canThrow ? '' : 'is-disabled'}`}
          onPointerDown={throwKnife}
          disabled={!canThrow}
        >
          <span>🗡️</span>
          <strong>{myRunner?.failed ? 'МИМО' : myRunner?.completed ? 'ГОТОВО' : 'БРОСИТЬ'}</strong>
          <small>{myRunner?.remaining ?? 0} из {totalKnives}</small>
        </button>

        <div className={`kwd-status ${myRunner?.failed ? 'is-fail' : myRunner?.completed ? 'is-done' : ''}`}>
          {statusText}
        </div>

        {state.phase === 'round-intro' && (
          <div className="kwd-countdown" aria-live="polite">
            <span>РАУНД {state.round}</span>
            <strong>{roundCountdown}</strong>
          </div>
        )}

        {state.phase === 'round-result' && (
          <div className="kwd-round-result" aria-live="polite">
            <span>РАУНД {state.round} ЗАВЕРШЁН</span>
            <strong>{state.roundScores?.[me] ? '+1' : '0'} : {state.roundScores?.[foe] ? '+1' : '0'}</strong>
            <small>{statusText}</small>
          </div>
        )}
      </div>

      <div className="kwd-help">
        <span>Клик / тап по кнопке или <b>ПРОБЕЛ</b></span>
        <span>Если попал в кинжал — твой раунд закончен.</span>
        {state.status === 'playing' && (
          <button type="button" className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти</button>
        )}
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="kwd-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`kwd-result ${result.won === true ? 'is-win' : result.won === false ? 'is-lose' : 'is-draw'}`}>
            <div className="kwd-result__icon">{result.icon}</div>
            <span className="eyebrow">3 раунда завершены</span>
            <h2>{result.title}</h2>
            <div className="kwd-result__score"><strong>{myScore}</strong><span>:</span><strong>{foeScore}</strong></div>
            <p>{result.text}</p>
            <div className="kwd-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Сыграть ещё</button>
              <button type="button" className="secondary-button" onClick={exitToMenu}>В меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
