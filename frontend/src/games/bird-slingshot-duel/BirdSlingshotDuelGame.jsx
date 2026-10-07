import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './bird-slingshot-duel.css';

const VIEW_W = 1000;
const VIEW_H = 600;

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cubic(a, b, c, d, t) {
  const u = 1 - t;
  return (u ** 3) * a + 3 * (u ** 2) * t * b + 3 * u * (t ** 2) * c + (t ** 3) * d;
}

function cubicDerivative(a, b, c, d, t) {
  const u = 1 - t;
  return 3 * (u ** 2) * (b - a) + 6 * u * t * (c - b) + 3 * (t ** 2) * (d - c);
}

function birdAt(bird, serverNow) {
  if (!bird) return null;
  const t = clamp((serverNow - bird.startAt) / bird.durationMs, 0, 1);
  const { p0, p1, p2, p3 } = bird;
  const x = cubic(p0.x, p1.x, p2.x, p3.x, t);
  const y = cubic(p0.y, p1.y, p2.y, p3.y, t);
  const dx = cubicDerivative(p0.x, p1.x, p2.x, p3.x, t);
  const dy = cubicDerivative(p0.y, p1.y, p2.y, p3.y, t);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return { x, y, angle, progress: t };
}

function projectileAt(projectile, serverNow) {
  const age = Math.max(0, (serverNow - projectile.bornAt) / 1000);
  return {
    x: projectile.startX + projectile.vx * age,
    y: projectile.startY + projectile.vy * age,
  };
}

function pointerToWorld(event, node) {
  const rect = node.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width * VIEW_W, 0, VIEW_W),
    y: clamp((event.clientY - rect.top) / rect.height * VIEW_H, 0, VIEW_H),
  };
}

function resultText(state) {
  if (!state?.result) return null;
  if (state.result.draw) return { title: 'НИЧЬЯ', className: 'is-draw' };
  return state.result.winner === state.playerSeat
    ? { title: 'ТЫ ВЫИГРАЛ', className: 'is-win' }
    : { title: 'ТЫ ПРОИГРАЛ', className: 'is-lose' };
}

export default function BirdSlingshotDuelGame() {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(Date.now());
  const [aim, setAim] = useState(null);
  const arenaRef = useRef(null);
  const pointerIdRef = useRef(null);
  const aimRef = useRef(null);
  const serverOffsetRef = useRef(0);
  const lastHitIdRef = useRef(null);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('bird-slingshot-duel');

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      setClock(Date.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (state?.serverTime) {
      serverOffsetRef.current = state.serverTime - Date.now();
    }
  }, [state?.serverTime]);

  const serverNow = clock + serverOffsetRef.current;
  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mySling = me ? state?.slings?.[me] : null;

  const myAmmo = me ? state?.ammo?.[me] ?? 0 : 0;
  const foeAmmo = foe ? state?.ammo?.[foe] ?? 0 : 0;
  const myHit = me ? Boolean(state?.roundHit?.[me]) : false;
  const foeHit = foe ? Boolean(state?.roundHit?.[foe]) : false;

  const canAim = Boolean(
    state?.status === 'playing' &&
    state?.phase === 'flying' &&
    me &&
    myAmmo > 0 &&
    !myHit
  );

  const bird = birdAt(state?.bird, serverNow);
  const projectiles = (state?.projectiles || []).map((p) => ({
    ...p,
    ...projectileAt(p, serverNow),
  }));

  const presentation = resultText(state);
  const flightProgress = bird?.progress ?? 0;

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function setCurrentAim(value) {
    aimRef.current = value;
    setAim(value);
  }

  function fireCurrentAim() {
    const currentAim = aimRef.current;
    if (!currentAim || !mySling || !canAim) {
      setCurrentAim(null);
      return;
    }

    const distance = Math.hypot(currentAim.x - mySling.x, currentAim.y - mySling.y);
    if (distance >= 42) {
      sendAction({ type: 'shoot', targetX: currentAim.x, targetY: currentAim.y });
    }
    setCurrentAim(null);
  }

  function onPointerDown(event) {
    if (!canAim || !arenaRef.current) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    arenaRef.current.setPointerCapture?.(event.pointerId);
    setCurrentAim(pointerToWorld(event, arenaRef.current));
  }

  function onPointerMove(event) {
    if (pointerIdRef.current !== event.pointerId || !arenaRef.current) return;
    event.preventDefault();
    setCurrentAim(pointerToWorld(event, arenaRef.current));
  }

  function onPointerUp(event) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    fireCurrentAim();
  }

  function onPointerCancel(event) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    setCurrentAim(null);
  }

  if (!state && !waiting) {
    return (
      <section className="bsd-lobby">
        <div className="bsd-lobby__icon" aria-hidden="true">🎯</div>
        <span className="eyebrow">2 игрока · 5 пролётов · настоящее упреждение</span>
        <h1>Охота из рогатки</h1>
        <p>
          Птица летит по новой траектории в каждом раунде. Шарик имеет реальную скорость:
          целишься прямо в птицу — чаще всего опоздаешь. Бери упреждение.
        </p>
        <div className="bsd-rules">
          <span><b>+1</b> патрон каждый раунд</span>
          <span>не выстрелил — <b>патрон остаётся</b></span>
          <span><b>1 очко</b> максимум за раунд</span>
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
      <section className="bsd-waiting">
        <div className="bsd-lobby__icon" aria-hidden="true">🐦</div>
        <span className="eyebrow">Охота из рогатки</span>
        <h2>Ищем второго стрелка…</h2>
        <p>Как только соперник подключится, первый раунд запустится автоматически.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;

  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';
  const myScore = me ? state.scores?.[me] ?? 0 : 0;
  const foeScore = foe ? state.scores?.[foe] ?? 0 : 0;
  const hitFlash = state.lastHit && serverNow - state.lastHit.at < 420;

  return (
    <section className="bsd-shell">
      <header className="bsd-scorebar">
        <div className="bsd-player bsd-player--me">
          <span className="bsd-player__dot" />
          <div className="bsd-player__copy">
            <small>ТЫ · {myName}</small>
            <strong>{myScore}</strong>
          </div>
          <span className="bsd-ammo" title="Твои патроны">● × {myAmmo}</span>
        </div>

        <div className="bsd-round">
          <small>РАУНД</small>
          <strong>{state.round}/{state.totalRounds}</strong>
        </div>

        <div className="bsd-player bsd-player--foe">
          <span className="bsd-ammo" title="Патроны соперника">{foeAmmo} × ●</span>
          <div className="bsd-player__copy">
            <small>{foeName} · СОПЕРНИК</small>
            <strong>{foeScore}</strong>
          </div>
          <span className="bsd-player__dot" />
        </div>
      </header>

      <div
        ref={arenaRef}
        className={`bsd-arena ${canAim ? 'is-aimable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className="bsd-sky" aria-hidden="true">
          <span className="bsd-sun" />
          <span className="bsd-cloud bsd-cloud--a" />
          <span className="bsd-cloud bsd-cloud--b" />
          <span className="bsd-cloud bsd-cloud--c" />
          <span className="bsd-mountain bsd-mountain--a" />
          <span className="bsd-mountain bsd-mountain--b" />
          <span className="bsd-hills" />
          <span className="bsd-castle">♜</span>
        </div>

        {state.phase === 'flying' && (
          <div className="bsd-flightbar" aria-hidden="true">
            <span style={{ width: `${clamp(flightProgress * 100, 0, 100)}%` }} />
          </div>
        )}

        {bird && state.phase === 'flying' && (
          <div
            className={`bsd-bird ${hitFlash ? 'is-hit' : ''}`}
            style={{
              left: `${bird.x / VIEW_W * 100}%`,
              top: `${bird.y / VIEW_H * 100}%`,
              transform: `translate(-50%,-50%) rotate(${bird.angle}deg) scaleX(${state.bird?.facing === 1 ? 1 : -1})`,
            }}
            aria-hidden="true"
          >
            <span className="bsd-bird__tail" />
            <span className="bsd-bird__wing" />
            <span className="bsd-bird__body">
              <i className="bsd-bird__eye" />
              <i className="bsd-bird__beak" />
            </span>
          </div>
        )}

        {projectiles.map((projectile) => (
          <span
            key={projectile.id}
            className={`bsd-ball ${projectile.owner === me ? 'bsd-ball--mine' : 'bsd-ball--foe'}`}
            style={{ left: `${projectile.x / VIEW_W * 100}%`, top: `${projectile.y / VIEW_H * 100}%` }}
            aria-hidden="true"
          />
        ))}

        {['a', 'b'].map((seat) => {
          const sling = state.slings?.[seat];
          if (!sling) return null;
          const mine = seat === me;
          const currentAim = mine ? aim : null;
          const aimAngle = currentAim
            ? Math.atan2(currentAim.y - sling.y, currentAim.x - sling.x) * 180 / Math.PI + 90
            : 0;

          return (
            <div
              key={seat}
              className={`bsd-sling ${mine ? 'is-mine' : 'is-foe'} ${currentAim ? 'is-aiming' : ''}`}
              style={{
                left: `${sling.x / VIEW_W * 100}%`,
                top: `${sling.y / VIEW_H * 100}%`,
                '--aim-rotation': `${aimAngle}deg`,
              }}
              aria-hidden="true"
            >
              <span className="bsd-sling__rubber" />
              <span className="bsd-sling__fork" />
              <span className="bsd-sling__label">{mine ? 'ТЫ' : 'ОН'}</span>
            </div>
          );
        })}

        {aim && mySling && canAim && (
          <svg className="bsd-aim" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="bsdAimGradient" x1="0" x2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,.18)" />
                <stop offset="100%" stopColor="rgba(255,255,255,.95)" />
              </linearGradient>
            </defs>
            <line x1={mySling.x} y1={mySling.y} x2={aim.x} y2={aim.y} />
            <circle cx={aim.x} cy={aim.y} r="22" />
            <circle cx={aim.x} cy={aim.y} r="5" />
          </svg>
        )}

        {state.phase === 'round-intro' && (
          <div className="bsd-round-overlay">
            <span>ПАТРОН +1</span>
            <strong>РАУНД {state.round}</strong>
            <small>Приготовься</small>
          </div>
        )}

        {state.phase === 'round-over' && (
          <div className="bsd-round-toast">
            <b>{myHit ? 'ТЫ ПОПАЛ' : 'ПТИЦА УЛЕТЕЛА'}</b>
            <span>Следующий раунд…</span>
          </div>
        )}

        {state.phase === 'flying' && !canAim && state.status === 'playing' && (
          <div className="bsd-status-toast">
            {myHit
              ? 'ПОПАДАНИЕ! ЖДИ НОВЫЙ ПРОЛЁТ'
              : myAmmo <= 0
                ? 'ПАТРОНОВ НЕТ — ЖДИ НОВЫЙ РАУНД'
                : ''}
          </div>
        )}

        {canAim && !aim && (
          <div className="bsd-hint">
            <b>ЗАЖМИ И НАВЕДИ</b>
            <span>Бери упреждение перед птицей · отпусти для выстрела</span>
          </div>
        )}

        {aim && canAim && (
          <div className="bsd-release-hint">ОТПУСТИ — ВЫСТРЕЛ</div>
        )}

        <div className="bsd-hit-flags" aria-hidden="true">
          <span className={myHit ? 'is-done' : ''}>ТЫ {myHit ? '✓' : '○'}</span>
          <span className={foeHit ? 'is-done' : ''}>ОН {foeHit ? '✓' : '○'}</span>
        </div>

        {hitFlash && (
          <div
            className={`bsd-impact ${state.lastHit?.seat === me ? 'is-mine' : 'is-foe'}`}
            style={{
              left: `${state.lastHit.x / VIEW_W * 100}%`,
              top: `${state.lastHit.y / VIEW_H * 100}%`,
            }}
            aria-hidden="true"
          >
            ✦
          </div>
        )}
      </div>

      <div className="bsd-footer-note">
        Патроны копятся до 5-го раунда · промахнувшийся шарик сам улетает за край поля
      </div>

      {state.status === 'finished' && presentation && (
        <div className="bsd-result-wrap">
          <div className={`bsd-result ${presentation.className}`}>
            <small>ФИНАЛ · {myScore}:{foeScore}</small>
            <h2>{presentation.title}</h2>
            <p>{state.result?.message}</p>
            <div className="bsd-result__ammo">
              Неиспользованные патроны сгорели: у тебя {myAmmo}, у соперника {foeAmmo}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
