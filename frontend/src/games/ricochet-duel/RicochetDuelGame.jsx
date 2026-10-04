import { memo, useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './ricochet-duel.css';

const WORLD_W = 1000;
const WORLD_H = 620;
const TANK_RADIUS = 30;

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;

  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function normalizeAngle(angle) {
  let result = angle % (Math.PI * 2);
  if (result < 0) result += Math.PI * 2;
  return result;
}

function toDegrees(angle) {
  return Math.round(normalizeAngle(angle) * 180 / Math.PI);
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;

  return {
    icon: won ? '🏆' : '💥',
    title: won ? 'Ты победил!' : 'Ты проиграл',
    text: state.result?.message || 'Дуэль окончена.',
  };
}

const ArenaBackground = memo(function ArenaBackground({ obstacles }) {
  return (
    <>
      <defs>
        <linearGradient id="rd-floor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#141a2d" />
          <stop offset="48%" stopColor="#101522" />
          <stop offset="100%" stopColor="#191123" />
        </linearGradient>
        <pattern id="rd-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.035" />
        </pattern>
        <linearGradient id="rd-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5a6375" />
          <stop offset="45%" stopColor="#343b4b" />
          <stop offset="100%" stopColor="#232936" />
        </linearGradient>
      </defs>

      <rect width={WORLD_W} height={WORLD_H} fill="url(#rd-floor)" />
      <rect width={WORLD_W} height={WORLD_H} fill="url(#rd-grid)" />

      <rect x="8" y="8" width={WORLD_W - 16} height={WORLD_H - 16} rx="26" fill="none" stroke="#677087" strokeWidth="12" opacity="0.58" />
      <rect x="19" y="19" width={WORLD_W - 38} height={WORLD_H - 38} rx="20" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.08" />

      {(obstacles || []).map((wall) => (
        <g key={wall.id}>
          <rect
            x={wall.x}
            y={wall.y}
            width={wall.width}
            height={wall.height}
            rx="8"
            fill="url(#rd-wall)"
            stroke="#858da0"
            strokeWidth="3"
          />
          <rect
            x={wall.x + 5}
            y={wall.y + 5}
            width={Math.max(0, wall.width - 10)}
            height="5"
            rx="2.5"
            fill="#d2d7e0"
            opacity="0.22"
          />
        </g>
      ))}

      <path d="M500 36V154 M500 466V584" stroke="#ffffff" strokeDasharray="8 13" strokeWidth="3" opacity="0.09" />
    </>
  );
});


function Bumper({ bumper, now, serverTime }) {
  if (!bumper) return null;
  const dt = Math.max(0, Math.min(0.055, (now - (serverTime || now)) / 1000));
  const y = bumper.y + (bumper.vy || 0) * dt;

  return (
    <g className="rd-bumper" transform={`translate(${bumper.x} ${y})`}>
      <circle className="rd-bumper__glow" r="48" />
      <circle className="rd-bumper__body" r={bumper.radius || 34} />
      <circle className="rd-bumper__ring" r="18" />
      <path d="M-10 0 H10 M0 -10 V10" />
    </g>
  );
}

function EnergyCore({ core }) {
  if (!core?.active) return null;

  return (
    <g className="rd-core" transform={`translate(${core.x} ${core.y})`}>
      <circle className="rd-core__glow" r="34" />
      <circle className="rd-core__ring" r={core.radius || 20} />
      <path d="M0 -13 L8 -3 L4 2 L10 12 L0 7 L-10 12 L-4 2 L-8 -3 Z" />
    </g>
  );
}

function Tank({ tank, seat, mine, localAngle, now, serverTime }) {
  if (!tank) return null;
  const angle = mine ? localAngle : tank.angle;
  const degrees = angle * 180 / Math.PI;
  const colorClass = seat === 'a' ? 'red' : 'blue';
  const dt = Math.max(0, Math.min(0.055, (now - (serverTime || now)) / 1000));
  const y = Math.max(100, Math.min(520, tank.y + (tank.vy || 0) * dt));

  return (
    <g className={`rd-tank rd-tank--${colorClass}`} transform={`translate(${tank.x} ${y})`}>
      {mine && (
        <line
          className="rd-aim-guide"
          x1={TANK_RADIUS + 10}
          x2="145"
          y1="0"
          y2="0"
          transform={`rotate(${degrees})`}
        />
      )}

      <g transform={`rotate(${degrees})`}>
        <rect className="rd-turret" x="5" y="-8" width="48" height="16" rx="7" />
        <circle className="rd-turret-ring" cx="5" cy="0" r="13" />
      </g>

      <circle className="rd-tank-body" cx="0" cy="0" r="30" />
      <circle className="rd-tank-core" cx="0" cy="0" r="15" />
      <path className="rd-tank-track" d="M-27 -17 H-11 M-27 17 H-11 M11 -17 H27 M11 17 H27" />
    </g>
  );
}

function Bullet({ bullet, now, serverTime, seat }) {
  if (!bullet) return null;

  const dt = Math.max(0, Math.min(0.055, (now - (serverTime || now)) / 1000));
  const x = bullet.x + bullet.vx * dt;
  const y = bullet.y + bullet.vy * dt;

  return (
    <g className={`rd-bullet rd-bullet--${seat} ${bullet.charged ? 'is-charged' : ''}`} transform={`translate(${x} ${y})`}>
      <circle className="rd-bullet-glow" r="15" />
      <circle className="rd-bullet-core" r="7" />
    </g>
  );
}

export default function RicochetDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const [localAngle, setLocalAngle] = useState(0);
  const arenaRef = useRef(null);
  const angleRef = useRef(0);
  const aimingRef = useRef(false);
  const sendActionRef = useRef(null);
  const canFireRef = useRef(false);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('ricochet-duel');

  sendActionRef.current = sendAction;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myTank = me ? state?.tanks?.[me] : null;
  const foeTank = foe ? state?.tanks?.[foe] : null;
  const myBullet = me ? state?.bullets?.[me] : null;
  const foeBullet = foe ? state?.bullets?.[foe] : null;
  const result = resultPresentation(state);
  const canFire = state?.status === 'playing' && Boolean(myTank?.canFire);
  canFireRef.current = canFire;

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;
    let active = true;
    let raf = 0;

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
    if (!myTank || aimingRef.current) return;
    const next = normalizeAngle(myTank.angle || 0);
    angleRef.current = next;
    setLocalAngle(next);
  }, [myTank?.angle, state?.roomId]);

  useEffect(() => {
    function keyDown(event) {
      if (event.target?.matches?.('input, textarea, select, button')) return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat && canFireRef.current) {
          sendActionRef.current?.({ type: 'fire' });
          navigator.vibrate?.(12);
        }
        return;
      }

      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        event.preventDefault();
        nudgeAim(-0.045);
      }

      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        event.preventDefault();
        nudgeAim(0.045);
      }
    }

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);

  function publishAim(angle) {
    const normalized = normalizeAngle(angle);
    angleRef.current = normalized;
    setLocalAngle(normalized);
    sendActionRef.current?.({ type: 'aim', payload: { angle: normalized } });
  }

  function nudgeAim(delta) {
    publishAim(angleRef.current + delta);
  }

  function pointerAngle(event) {
    if (!arenaRef.current || !myTank) return null;
    const rect = arenaRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WORLD_W;
    const y = (event.clientY - rect.top) / rect.height * WORLD_H;
    return Math.atan2(y - myTank.y, x - myTank.x);
  }

  function beginAim(event) {
    if (!myTank || state?.status !== 'playing') return;
    if (event.target?.closest?.('.rd-fire-button,.rd-aim-button')) return;

    aimingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const angle = pointerAngle(event);
    if (angle != null) publishAim(angle);
  }

  function moveAim(event) {
    if (!aimingRef.current) return;
    const angle = pointerAngle(event);
    if (angle != null) publishAim(angle);
  }

  function endAim(event) {
    aimingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function fire() {
    if (!canFire) return;
    sendAction({ type: 'fire' });
    navigator.vibrate?.(14);
  }

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  if (!state && !waiting) {
    return (
      <section className="rd-lobby">
        <div className="rd-lobby__icon">💥</div>
        <span className="eyebrow">2 игрока · движущиеся цели · меняющаяся арена</span>
        <h1>Ricochet Duel</h1>
        <p>
          Теперь это не тир с одним запомненным углом: танки постоянно двигаются,
          арена меняется, по центру ездит отбойник, а энергоядро может усилить выстрел.
          Пока твоя пуля летит, второй выстрел всё равно сделать нельзя.
        </p>
        <div className="rd-rules">
          <span>🏆 первым до 7 очков</span>
          <span>💎 энергоядро = +1 к попаданию</span>
          <span>↗️ 3+ рикошета = ещё +1</span>
          <span>🔄 арена и позиции меняются</span>
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
      <section className="rd-waiting">
        <div className="rd-waiting__icon">🎯</div>
        <span className="eyebrow">Ricochet Duel</span>
        <h2>Ищем соперника…</h2>
        <p>Как только второй игрок подключится, можно сразу стрелять.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>
          Отменить поиск
        </button>
      </section>
    );
  }

  const myName = myTank?.name || playerName;
  const foeName = foeTank?.name || 'Соперник';
  const myScore = myTank?.score ?? 0;
  const foeScore = foeTank?.score ?? 0;
  const activeBounces = myBullet?.bounces ?? 0;
  const charged = Boolean(myBullet?.charged);

  return (
    <section className="rd-game">
      <div className="rd-scorebar">
        <div className="rd-player rd-player--mine">
          <span className={`rd-player__dot rd-player__dot--${me === 'a' ? 'red' : 'blue'}`} />
          <div>
            <small>Ты</small>
            <strong>{myName}</strong>
          </div>
          <b>{myScore}</b>
        </div>

        <div className="rd-target-score">
          <small>ДО</small>
          <strong>{state.pointsToWin || 7}</strong>
          <span>ОЧКОВ</span>
        </div>

        <div className="rd-player rd-player--foe">
          <b>{foeScore}</b>
          <div>
            <small>Соперник</small>
            <strong>{foeName}</strong>
          </div>
          <span className={`rd-player__dot rd-player__dot--${foe === 'a' ? 'red' : 'blue'}`} />
        </div>
      </div>

      <div
        className="rd-arena"
        ref={arenaRef}
        onPointerDown={beginAim}
        onPointerMove={moveAim}
        onPointerUp={endAim}
        onPointerCancel={endAim}
      >
        <div className="rd-arena-badge">
          <small>РАУНД {state.roundNumber || 1}</small>
          <strong>{state.arenaName || 'АРЕНА'}</strong>
        </div>

        <svg viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} aria-label="Арена Ricochet Duel">
          <ArenaBackground obstacles={state.obstacles} />

          <EnergyCore core={state.core} />
          <Bumper bumper={state.bumper} now={now} serverTime={state.serverTime} />

          <Tank tank={state.tanks?.a} seat="a" mine={me === 'a'} localAngle={localAngle} now={now} serverTime={state.serverTime} />
          <Tank tank={state.tanks?.b} seat="b" mine={me === 'b'} localAngle={localAngle} now={now} serverTime={state.serverTime} />

          <Bullet bullet={state.bullets?.a} now={now} serverTime={state.serverTime} seat="a" />
          <Bullet bullet={state.bullets?.b} now={now} serverTime={state.serverTime} seat="b" />
        </svg>

        {['hit', 'core', 'arena'].includes(state.lastEvent?.type) && (
          <div key={state.lastEvent.serial} className={`rd-hit-flash rd-hit-flash--${state.lastEvent.type}`}>
            {state.lastEvent.type === 'hit' ? '💥' : state.lastEvent.type === 'core' ? '💎' : '🔄'} {state.lastEvent.message}
          </div>
        )}
      </div>

      <div className="rd-controls">
        <button type="button" className="rd-aim-button" onPointerDown={() => nudgeAim(-0.052)}>
          ↶
          <small>-3°</small>
        </button>

        <div className="rd-angle">
          <small>УГОЛ</small>
          <strong>{toDegrees(localAngle)}°</strong>
          <span>
            {myBullet
              ? `${activeBounces}/${state.maxBounces} рикошетов${charged ? ' · ⚡ ЗАРЯЖЕНА' : ''}`
              : state.phase === 'reset'
                ? 'арена меняется…'
                : 'наведи пушку'}
          </span>
        </div>

        <button
          type="button"
          className={`rd-fire-button ${canFire ? '' : 'is-locked'}`}
          disabled={!canFire}
          onPointerDown={fire}
        >
          <span>{canFire ? '💥' : '⏳'}</span>
          <strong>{canFire ? 'ОГОНЬ' : 'ПУЛЯ ЛЕТИТ'}</strong>
        </button>

        <button type="button" className="rd-aim-button" onPointerDown={() => nudgeAim(0.052)}>
          ↷
          <small>+3°</small>
        </button>
      </div>

      <p className="rd-tip">
        Танки двигаются сами. 💎 Энергоядро заряжает пулю (+1 очко за попадание),
        а попадание после 3+ рикошетов даёт ещё +1. Между попаданиями арена перестраивается.
        На ПК: <b>A/D</b> или стрелки — угол, <b>Space</b> — выстрел.
      </p>

      {error && <div className="game-error">{error}</div>}

      {state.status === 'playing' && (
        <button type="button" className="danger-button rd-resign" onClick={() => sendAction({ type: 'resign' })}>
          Выйти из дуэли
        </button>
      )}

      {result && (
        <div className="rd-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className="rd-result">
            <div className="rd-result__icon">{result.icon}</div>
            <span className="eyebrow">Ricochet Duel</span>
            <h2>{result.title}</h2>
            <div className="rd-result__score">
              <strong>{myScore}</strong>
              <span>:</span>
              <strong>{foeScore}</strong>
            </div>
            <p>{result.text}</p>
            <div className="rd-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Сыграть ещё</button>
              <button type="button" className="secondary-button" onClick={onBack}>В меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
