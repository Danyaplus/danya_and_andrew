import { useEffect, useMemo, useRef, useState } from 'react';
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
  return { x, y, angle };
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

  const serverOffset = state ? state.serverTime - clock : 0;
  const serverNow = clock + serverOffset;
  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mySling = me ? state?.slings?.[me] : null;
  const canAim = Boolean(
    state?.status === 'playing' &&
    state?.phase === 'flying' &&
    me &&
    state?.ammo?.[me] > 0 &&
    !state?.roundHit?.[me]
  );

  const bird = useMemo(() => birdAt(state?.bird, serverNow), [state?.bird, serverNow]);
  const projectiles = useMemo(
    () => (state?.projectiles || []).map((p) => ({ ...p, ...projectileAt(p, serverNow) })),
    [state?.projectiles, serverNow],
  );

  const presentation = resultText(state);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function releaseAim() {
    if (!aim || !mySling || !canAim) {
      setAim(null);
      return;
    }
    const distance = Math.hypot(aim.x - mySling.x, aim.y - mySling.y);
    if (distance >= 35) {
      sendAction({ type: 'shoot', targetX: aim.x, targetY: aim.y });
    }
    setAim(null);
  }

  function onPointerDown(event) {
    if (!canAim || !arenaRef.current) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    arenaRef.current.setPointerCapture?.(event.pointerId);
    setAim(pointerToWorld(event, arenaRef.current));
  }

  function onPointerMove(event) {
    if (pointerIdRef.current !== event.pointerId || !arenaRef.current) return;
    setAim(pointerToWorld(event, arenaRef.current));
  }

  function onPointerUp(event) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    releaseAim();
  }

  if (!state && !waiting) {
    return (
      <section className="bsd-lobby">
        <div className="bsd-lobby__icon">🐦🎯</div>
        <span className="eyebrow">2 игрока · 5 раундов · упреждение</span>
        <h1>Охота из рогатки</h1>
        <p>
          В каждом раунде прилетает новая птица. Патрон, который не выстрелил, остаётся у тебя на следующий раунд.
          Шарик летит не мгновенно — целься чуть впереди птицы.
        </p>
        <div className="bsd-rules">
          <span><b>+1</b> патрон в начале каждого раунда</span>
          <span><b>5</b> пролётов птицы</span>
          <span><b>1</b> очко за попадание в каждом раунде</span>
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
        <div className="bsd-lobby__icon">🪃🐦</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго стрелка…</h2>
        <p>Матч начнётся автоматически.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;

  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';
  const myScore = me ? state.scores?.[me] ?? 0 : 0;
  const foeScore = foe ? state.scores?.[foe] ?? 0 : 0;
  const myAmmo = me ? state.ammo?.[me] ?? 0 : 0;
  const foeAmmo = foe ? state.ammo?.[foe] ?? 0 : 0;
  const myHit = me ? Boolean(state.roundHit?.[me]) : false;
  const foeHit = foe ? Boolean(state.roundHit?.[foe]) : false;

  return (
    <section className="bsd-shell">
      <header className="bsd-scorebar">
        <div className="bsd-player bsd-player--me">
          <span className="bsd-player__dot" />
          <div><small>ТЫ · {myName}</small><strong>{myScore}</strong></div>
          <span className="bsd-ammo">● × {myAmmo}</span>
        </div>
        <div className="bsd-round">
          <small>РАУНД</small>
          <strong>{state.round}/{state.totalRounds}</strong>
        </div>
        <div className="bsd-player bsd-player--foe">
          <span className="bsd-ammo">{foeAmmo} × ●</span>
          <div><small>{foeName} · СОПЕРНИК</small><strong>{foeScore}</strong></div>
          <span className="bsd-player__dot" />
        </div>
      </header>

      <div
        ref={arenaRef}
        className={`bsd-arena ${canAim ? 'is-aimable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="bsd-sky" />
        <div className="bsd-cloud bsd-cloud--a" />
        <div className="bsd-cloud bsd-cloud--b" />
        <div className="bsd-cloud bsd-cloud--c" />
        <div className="bsd-hills" />

        {bird && state.phase === 'flying' && (
          <div
            className={`bsd-bird ${state.lastHit && serverNow - state.lastHit.at < 260 ? 'is-hit' : ''}`}
            style={{
              left: `${bird.x / VIEW_W * 100}%`,
              top: `${bird.y / VIEW_H * 100}%`,
              transform: `translate(-50%,-50%) rotate(${bird.angle}deg) scaleX(${state.bird?.facing === 1 ? 1 : -1})`,
            }}
          >
            <span className="bsd-bird__wing" />
            <span className="bsd-bird__body">🐦</span>
          </div>
        )}

        {projectiles.map((projectile) => (
          <span
            key={projectile.id}
            className={`bsd-ball bsd-ball--${projectile.owner === me ? 'mine' : 'foe'}`}
            style={{ left: `${projectile.x / VIEW_W * 100}%`, top: `${projectile.y / VIEW_H * 100}%` }}
          />
        ))}

        {['a', 'b'].map((seat) => {
          const sling = state.slings?.[seat];
          if (!sling) return null;
          const mine = seat === me;
          return (
            <div
              key={seat}
              className={`bsd-sling ${mine ? 'is-mine' : 'is-foe'}`}
              style={{ left: `${sling.x / VIEW_W * 100}%`, top: `${sling.y / VIEW_H * 100}%` }}
            >
              <span className="bsd-sling__fork">Y</span>
              <span className="bsd-sling__label">{mine ? 'ТЫ' : 'ОН'}</span>
            </div>
          );
        })}

        {aim && mySling && canAim && (
          <svg className="bsd-aim" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" aria-hidden="true">
            <line x1={mySling.x} y1={mySling.y} x2={aim.x} y2={aim.y} />
            <circle cx={aim.x} cy={aim.y} r="18" />
            <circle cx={aim.x} cy={aim.y} r="4" />
          </svg>
        )}

        {state.phase === 'round-intro' && (
          <div className="bsd-round-overlay">
            <span>РАУНД</span>
            <strong>{state.round}</strong>
          </div>
        )}

        {state.phase === 'round-over' && (
          <div className="bsd-round-toast">Птица улетела · следующий раунд</div>
        )}

        {state.phase === 'flying' && !canAim && state.status === 'playing' && (
          <div className="bsd-status-toast">
            {myHit ? 'ПОПАДАНИЕ! ЖДИ СЛЕДУЮЩИЙ РАУНД' : myAmmo <= 0 ? 'НЕТ ПАТРОНОВ — ЖДИ СЛЕДУЮЩИЙ РАУНД' : ''}
          </div>
        )}

        {canAim && !aim && (
          <div className="bsd-hint">Зажми поле, наведи с упреждением и отпусти</div>
        )}

        <div className="bsd-hit-flags" aria-hidden="true">
          <span className={myHit ? 'is-done' : ''}>ТЫ {myHit ? '✓' : '○'}</span>
          <span className={foeHit ? 'is-done' : ''}>ОН {foeHit ? '✓' : '○'}</span>
        </div>
      </div>

      <div className="bsd-footer-note">
        Неиспользованный патрон переносится дальше. После 5-го раунда оставшиеся патроны сгорают.
      </div>

      {state.status === 'finished' && presentation && (
        <div className="bsd-result-wrap">
          <div className={`bsd-result ${presentation.className}`}>
            <small>ФИНАЛ · {myScore}:{foeScore}</small>
            <h2>{presentation.title}</h2>
            <p>{state.result?.message}</p>
            <div className="bsd-result__ammo">Осталось патронов: у тебя {myAmmo}, у соперника {foeAmmo}</div>
          </div>
        </div>
      )}
    </section>
  );
}
