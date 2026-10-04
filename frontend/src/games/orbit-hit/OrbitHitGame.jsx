import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './orbit-hit.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function normalizeDeg(value) {
  let angle = value % 360;
  if (angle < 0) angle += 360;
  return angle;
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  if (state.result?.type === 'draw') {
    return { won: null, icon: '🤝', title: 'Ничья', text: state.result.message || 'Одинаковый счёт.' };
  }
  const won = state.result?.winner === state.playerSeat;
  return {
    won,
    icon: won ? '🏆' : '🎯',
    title: won ? 'Ты победил!' : 'Ты проиграл',
    text: state.result?.message || 'Матч завершён.',
  };
}

const OrbitRing = memo(function OrbitRing({ runner, angle, color, mine, event }) {
  const arc = Math.max(0, Math.min(180, runner?.target?.arcDeg ?? 30));
  const start = normalizeDeg((runner?.target?.centerDeg ?? 0) - arc / 2);
  const dash = arc / 360 * 100;
  const eventClass = event?.type === 'hit' ? 'is-hit' : event?.type === 'miss' ? 'is-miss' : '';

  return (
    <div className={`orbit-ring orbit-ring--${color} ${mine ? 'is-mine' : ''} ${eventClass}`}>
      <svg className="orbit-ring__svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="orbit-ring__base" cx="50" cy="50" r="41" pathLength="100" />
        <circle
          className="orbit-ring__target"
          cx="50"
          cy="50"
          r="41"
          pathLength="100"
          strokeDasharray={`${dash} ${100 - dash}`}
          transform={`rotate(${start - 90} 50 50)`}
        />
      </svg>
      <div className="orbit-ring__arm" style={{ transform: `rotate(${angle}deg)` }}>
        <span className="orbit-ring__orb" />
      </div>
      <div className="orbit-ring__center">
        <small>СЕРИЯ</small>
        <strong>×{Math.max(1, runner?.streak || 1)}</strong>
      </div>
      {event && (
        <div key={event.serial} className={`orbit-ring__event orbit-ring__event--${event.type}`}>
          {event.type === 'hit' ? `+${event.gained}` : 'МИМО'}
        </div>
      )}
    </div>
  );
});

export default function OrbitHitGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const rafRef = useRef(0);
  const sendActionRef = useRef(null);
  const canTapRef = useRef(false);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('orbit-hit');

  sendActionRef.current = sendAction;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myRunner = me ? state?.runners?.[me] : null;
  const foeRunner = foe ? state?.runners?.[foe] : null;
  const myPlayer = me ? state?.players?.[me] : null;
  const foePlayer = foe ? state?.players?.[foe] : null;
  const result = resultPresentation(state);
  const canTap = state?.status === 'playing' && state?.phase === 'playing' && now < (state?.endsAt ?? 0);
  canTapRef.current = canTap;

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;

    let active = true;
    const frame = () => {
      if (!active) return;
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [state?.roomId, state?.status]);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target?.matches?.('input, textarea, select, button')) return;
      event.preventDefault();
      if (canTapRef.current) sendActionRef.current?.({ type: 'tap' });
    }

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);

  function angleFor(runner) {
    if (!state || !runner) return 0;
    const elapsedMs = Math.max(0, now - state.startsAt);
    return normalizeDeg((runner.phaseDeg ?? 0) + elapsedMs * (state.rotationSpeedDegPerSec ?? 120) / 1000);
  }

  const myAngle = angleFor(myRunner);
  const foeAngle = angleFor(foeRunner);
  const timeLeft = state ? Math.max(0, state.endsAt - now) : 60_000;
  const countdown = state?.phase === 'countdown'
    ? Math.max(1, Math.ceil(((state.startsAt ?? now) - now) / 800))
    : null;

  const myScore = myRunner?.score ?? 0;
  const foeScore = foeRunner?.score ?? 0;
  const myName = myPlayer?.name || playerName;
  const foeName = foePlayer?.name || 'Соперник';

  const streakDots = useMemo(() => (
    Array.from({ length: 5 }, (_, index) => index < (myRunner?.streak ?? 0))
  ), [myRunner?.streak]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function hitButton(event) {
    event?.preventDefault?.();
    if (!canTap) return;
    sendAction({ type: 'tap' });
    navigator.vibrate?.(10);
  }

  function exitToMenu() {
    if (typeof onBack === 'function') onBack();
    else window.location.hash = '#/';
  }

  if (!state && !waiting) {
    return (
      <section className="orbit-lobby">
        <div className="orbit-lobby__icon">🎯</div>
        <span className="eyebrow">2 игрока · 60 секунд · серия ×5</span>
        <h1>Орбита</h1>
        <p>
          Белый шар постоянно вращается по кругу. Нажми в момент, когда он проходит по серой зоне.
          Первое точное попадание даёт +1, следующее подряд +2 и так до +5. Промах сбрасывает серию.
        </p>
        <div className="orbit-rules">
          <span>⏱️ 60 секунд</span>
          <span>🎯 новая зона после попадания</span>
          <span>🔥 максимум серии ×5</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="orbit-waiting">
        <div className="orbit-waiting__spinner">◎</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго игрока…</h2>
        <p>Матч начнётся автоматически, когда соперник подключится.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="orbit-game">
      <div className="orbit-scorebar">
        <div className="orbit-scorebar__player orbit-scorebar__player--mine">
          <span className="orbit-scorebar__dot orbit-scorebar__dot--pink" />
          <div><small>Ты</small><strong>{myName}</strong></div>
          <b>{myScore}</b>
        </div>

        <div className="orbit-scorebar__time">
          <small>{state.phase === 'countdown' ? 'СТАРТ' : 'ОСТАЛОСЬ'}</small>
          <strong>{state.phase === 'countdown' ? countdown : formatTime(timeLeft)}</strong>
        </div>

        <div className="orbit-scorebar__player orbit-scorebar__player--foe">
          <b>{foeScore}</b>
          <div><small>Соперник</small><strong>{foeName}</strong></div>
          <span className="orbit-scorebar__dot orbit-scorebar__dot--blue" />
        </div>
      </div>

      <div className="orbit-stage">
        <div className="orbit-opponent-card">
          <div className="orbit-opponent-card__head">
            <span>{foeName}</span>
            <strong>{foeScore}</strong>
          </div>
          <OrbitRing
            runner={foeRunner}
            angle={foeAngle}
            color="blue"
            mine={false}
            event={foeRunner?.lastEvent}
          />
        </div>

        <div className="orbit-divider">
          <span>VS</span>
        </div>

        <div className="orbit-me-card">
          <div className="orbit-me-card__head">
            <div>
              <small>ТВОЯ СЕРИЯ</small>
              <div className="orbit-streak-dots">
                {streakDots.map((on, index) => <i key={index} className={on ? 'is-on' : ''} />)}
              </div>
            </div>
            <strong>{myScore} очк.</strong>
          </div>

          <button
            type="button"
            className="orbit-ring-button"
            onPointerDown={hitButton}
            disabled={!canTap}
            aria-label="Попасть по серой зоне"
          >
            <OrbitRing
              runner={myRunner}
              angle={myAngle}
              color="pink"
              mine
              event={myRunner?.lastEvent}
            />
          </button>

          <button
            type="button"
            className={`orbit-hit-button ${canTap ? '' : 'is-disabled'}`}
            onPointerDown={hitButton}
            disabled={!canTap}
          >
            <span>👆</span>
            <strong>{state.phase === 'countdown' ? 'ГОТОВЬСЯ' : 'ЖМИ!'}</strong>
            <small>когда белый шар на серой зоне</small>
          </button>
        </div>

        {state.phase === 'countdown' && (
          <div className="orbit-countdown" aria-live="polite">
            <span>СТАРТ ЧЕРЕЗ</span>
            <strong>{countdown}</strong>
          </div>
        )}
      </div>

      <div className="orbit-help">
        <span>Попал подряд: <b>+1 → +2 → +3 → +4 → +5</b></span>
        <span>Промах: серия сбрасывается, очки не снимаются.</span>
        {state.status === 'playing' && (
          <button type="button" className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти</button>
        )}
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="orbit-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`orbit-result ${result.won === true ? 'is-win' : result.won === false ? 'is-lose' : 'is-draw'}`}>
            <div className="orbit-result__icon">{result.icon}</div>
            <span className="eyebrow">60 секунд закончились</span>
            <h2>{result.title}</h2>
            <div className="orbit-result__score"><strong>{myScore}</strong><span>:</span><strong>{foeScore}</strong></div>
            <p>{result.text}</p>
            <div className="orbit-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Сыграть ещё</button>
              <button type="button" className="secondary-button" onClick={exitToMenu}>В меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
