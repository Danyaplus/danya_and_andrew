import { memo, useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './cannon-push-duel.css';

const WORLD_W = 1200;
const WORLD_H = 720;

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;

  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  if (state.result?.type === 'draw') {
    return {
      icon: '🤝',
      title: 'Ничья',
      text: state.result?.message || 'Время закончилось.',
    };
  }

  const won = state.result?.winner === state.playerSeat;
  return {
    icon: won ? '🏆' : '⚽',
    title: won ? 'Ты победил!' : 'Ты проиграл',
    text: state.result?.message || 'Матч окончен.',
  };
}

const Field = memo(function Field({ redZoneEnd, blueZoneStart }) {
  return (
    <>
      <defs>
        <linearGradient id="cpd-red" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff2730" />
          <stop offset="100%" stopColor="#ec3240" />
        </linearGradient>
        <linearGradient id="cpd-blue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3978ef" />
          <stop offset="100%" stopColor="#4c82ee" />
        </linearGradient>
        <pattern id="cpd-wood" width="88" height="720" patternUnits="userSpaceOnUse">
          <rect width="88" height="720" fill="#d8c48d" />
          <rect width="42" height="720" fill="#cfb97f" />
          <rect x="42" width="6" height="720" fill="#e3d19f" opacity=".55" />
        </pattern>
      </defs>

      <rect width={redZoneEnd} height={WORLD_H} fill="url(#cpd-red)" />
      <rect x={redZoneEnd} width={blueZoneStart - redZoneEnd} height={WORLD_H} fill="url(#cpd-wood)" />
      <rect x={blueZoneStart} width={WORLD_W - blueZoneStart} height={WORLD_H} fill="url(#cpd-blue)" />

      <line x1={WORLD_W / 2} x2={WORLD_W / 2} y1="20" y2={WORLD_H - 20} className="cpd-midline" />
      <line x1={redZoneEnd} x2={redZoneEnd} y1="20" y2={WORLD_H - 20} className="cpd-zone-line" />
      <line x1={blueZoneStart} x2={blueZoneStart} y1="20" y2={WORLD_H - 20} className="cpd-zone-line" />

      <rect x="18" y="18" width={WORLD_W - 36} height={WORLD_H - 36} rx="22" className="cpd-border" />
    </>
  );
});

function Cannon({ cannon, seat, now, serverTime }) {
  if (!cannon) return null;

  const dt = Math.max(0, Math.min(.055, (now - (serverTime || now)) / 1000));
  const angularVelocity = seat === 'a' ? -0.96 : 0.96;
  const angle = cannon.angle + angularVelocity * dt;
  const degrees = angle * 180 / Math.PI;

  return (
    <g className={`cpd-cannon cpd-cannon--${seat}`} transform={`translate(${cannon.x} ${cannon.y})`}>
      <circle className="cpd-cannon__halo" r="58" />
      <g transform={`rotate(${degrees})`}>
        <rect className="cpd-cannon__barrel" x="5" y="-11" width="72" height="22" rx="7" />
        <rect className="cpd-cannon__muzzle" x="65" y="-15" width="17" height="30" rx="4" />
      </g>
      <rect className="cpd-cannon__body" x="-36" y="-29" width="72" height="58" rx="14" />
      <rect className="cpd-cannon__core" x="-17" y="-12" width="34" height="24" rx="5" />
      <circle className={`cpd-ammo-dot ${cannon.loaded ? 'is-loaded' : ''}`} cx="0" cy="-51" r="7" />
    </g>
  );
}

function Bullet({ bullet, now, serverTime, seat }) {
  if (!bullet) return null;

  const dt = Math.max(0, Math.min(.055, (now - (serverTime || now)) / 1000));
  const x = bullet.x + bullet.vx * dt;
  const y = bullet.y + bullet.vy * dt;

  return (
    <g className={`cpd-bullet cpd-bullet--${seat}`} transform={`translate(${x} ${y})`}>
      <circle className="cpd-bullet__glow" r="18" />
      <circle className="cpd-bullet__core" r="8" />
    </g>
  );
}

function Ball({ ball, now, serverTime }) {
  if (!ball) return null;

  const dt = Math.max(0, Math.min(.055, (now - (serverTime || now)) / 1000));
  const x = ball.x + ball.vx * dt;
  const y = ball.y + ball.vy * dt;

  return (
    <g className="cpd-ball" transform={`translate(${x} ${y})`}>
      <circle className="cpd-ball__shadow" cy="7" r="40" />
      <circle className="cpd-ball__body" r="38" />
      <path className="cpd-ball__mark" d="M-18 -10 L2 -20 L19 -7 L7 2 L18 16 L-2 20 L-18 8 L-6 0 Z" />
    </g>
  );
}

export default function CannonPushDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const sendActionRef = useRef(null);
  const loadedRef = useRef(false);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('cannon-push-duel');

  sendActionRef.current = sendAction;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myPlayer = me ? state?.players?.[me] : null;
  const foePlayer = foe ? state?.players?.[foe] : null;
  const myCannon = me ? state?.cannons?.[me] : null;

  const loaded = Boolean(
    state?.status === 'playing' &&
    state?.phase === 'playing' &&
    myCannon?.loaded &&
    !state?.bullets?.[me]
  );
  loadedRef.current = loaded;

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;

    let raf = 0;
    let active = true;

    const frame = () => {
      if (!active) return;
      setNow(Date.now());
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [state?.roomId, state?.status]);

  useEffect(() => {
    function keyDown(event) {
      if (event.target?.matches?.('input, textarea, select, button')) return;
      if (event.code !== 'Space') return;

      event.preventDefault();
      if (!event.repeat && loadedRef.current) {
        sendActionRef.current?.({ type: 'fire' });
        navigator.vibrate?.(12);
      }
    }

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);

  const result = resultPresentation(state);
  const mirrored = me === 'b';
  const timeLeft = state ? Math.max(0, (state.endsAt || Date.now()) - now) : 0;

  function fire() {
    if (!loaded) return;
    sendAction({ type: 'fire' });
    navigator.vibrate?.(12);
  }

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  if (!state && !waiting) {
    return (
      <section className="cpd-lobby">
        <div className="cpd-lobby__icon">🔫 ⚽ 🔫</div>
        <span className="eyebrow">2 игрока · 90 секунд · физика и рикошеты</span>
        <h1>Cannon Push Duel</h1>
        <p>
          Пушки сами непрерывно вращаются. Выбирай момент выстрела: прямое попадание
          толкает мяч вперёд, удар в бок уводит его по диагонали, а промах можно спасти
          рикошетом от стены.
        </p>
        <div className="cpd-rules">
          <span>🔄 своя пушка всегда против часовой</span>
          <span>🔫 один патрон на оборот</span>
          <span>♻️ перезарядка, когда ствол смотрит в свою стену</span>
          <span>⚽ гол только когда весь мяч вошёл на территорию соперника</span>
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
      <section className="cpd-waiting">
        <div className="cpd-waiting__icon">🔄</div>
        <span className="eyebrow">Cannon Push Duel</span>
        <h2>Ищем соперника…</h2>
        <p>Матч длится полторы минуты. Побеждает тот, кто забьёт больше голов.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>
          Отменить поиск
        </button>
      </section>
    );
  }

  return (
    <section className="cpd-game">
      <div className="cpd-scorebar">
        <div className="cpd-score cpd-score--mine">
          <small>Ты</small>
          <strong>{myPlayer?.name || playerName}</strong>
          <b>{myPlayer?.score ?? 0}</b>
        </div>

        <div className="cpd-clock">
          <small>МАТЧ</small>
          <strong>{formatTime(timeLeft)}</strong>
          <span>{state.phase === 'goal-reset' ? 'ГОЛ!' : 'толкай мяч на чужую сторону'}</span>
        </div>

        <div className="cpd-score cpd-score--foe">
          <b>{foePlayer?.score ?? 0}</b>
          <strong>{foePlayer?.name || 'Соперник'}</strong>
          <small>Соперник</small>
        </div>
      </div>

      <div className="cpd-arena">
        <svg viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-label="Арена Cannon Push Duel">
          <g transform={mirrored ? `translate(${WORLD_W} 0) scale(-1 1)` : undefined}>
            <Field redZoneEnd={state.redZoneEnd} blueZoneStart={state.blueZoneStart} />
            <Ball ball={state.ball} now={now} serverTime={state.serverTime} />
            <Cannon cannon={state.cannons?.a} seat="a" now={now} serverTime={state.serverTime} />
            <Cannon cannon={state.cannons?.b} seat="b" now={now} serverTime={state.serverTime} />
            <Bullet bullet={state.bullets?.a} now={now} serverTime={state.serverTime} seat="a" />
            <Bullet bullet={state.bullets?.b} now={now} serverTime={state.serverTime} seat="b" />
          </g>
        </svg>

        {state.lastEvent?.type === 'goal' && (
          <div key={state.lastEvent.serial} className="cpd-goal-flash">
            ⚽ ГОООЛ!
          </div>
        )}
      </div>

      <div className="cpd-controls">
        <div className="cpd-reload">
          <span className={`cpd-reload__dot ${loaded ? 'is-ready' : ''}`} />
          <div>
            <small>ПАТРОН</small>
            <strong>{loaded ? 'ЗАРЯЖЕН' : 'ПЕРЕЗАРЯДКА'}</strong>
          </div>
        </div>

        <button
          type="button"
          className={`cpd-fire ${loaded ? 'is-ready' : ''}`}
          disabled={!loaded}
          onClick={fire}
        >
          <span>{loaded ? '💥' : '⏳'}</span>
          <strong>{loaded ? 'ВЫСТРЕЛ' : 'ЖДЁМ ОБОРОТ'}</strong>
        </button>
      </div>

      <p className="cpd-tip">
        Пушка вращается сама — тебе нужно только выбрать момент. Попади точно в центр мяча,
        чтобы толкнуть его прямо; ударь сбоку, чтобы изменить направление. На ПК можно стрелять клавишей <b>Space</b>.
      </p>

      {error && <div className="game-error">{error}</div>}

      {state.status === 'playing' && (
        <button type="button" className="danger-button cpd-resign" onClick={() => sendAction({ type: 'resign' })}>
          Выйти из матча
        </button>
      )}

      {result && (
        <div className="cpd-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className="cpd-result">
            <div className="cpd-result__icon">{result.icon}</div>
            <span className="eyebrow">Cannon Push Duel</span>
            <h2>{result.title}</h2>
            <div className="cpd-result__score">
              <strong>{myPlayer?.score ?? 0}</strong>
              <span>:</span>
              <strong>{foePlayer?.score ?? 0}</strong>
            </div>
            <p>{result.text}</p>
            <div className="cpd-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Сыграть ещё</button>
              <button type="button" className="secondary-button" onClick={onBack}>В меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
