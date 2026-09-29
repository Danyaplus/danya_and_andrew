import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './tank-artillery.css';

const WORLD_W = 1400;
const WORLD_H = 780;
const GRAVITY = 690;
const PREVIEW_TIME = 1.15;
const MAX_PREVIEW_POINTS = 18;

const SHOTS = [
  { id: 'standard', icon: '●', name: 'Обычный', desc: 'Надёжный снаряд', power: 1 },
  { id: 'heavy', icon: '◆', name: 'Тяжёлый', desc: 'Сильный взрыв', power: 0.9 },
  { id: 'cluster', icon: '✦', name: 'Кластер', desc: 'Три мини-взрыва', power: 0.96 },
  { id: 'fire', icon: '🔥', name: 'Огненный', desc: 'Поджигает цель', power: 0.94 },
  { id: 'ice', icon: '❄️', name: 'Ледяной', desc: 'Режет запас хода', power: 0.98 },
  { id: 'nuke', icon: '☢', name: 'Ядерный', desc: 'Только из ящика', power: 0.82, special: true },
];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  if (state.result?.draw) {
    return { title: 'НИЧЬЯ', text: state.result.message || 'Оба танка уничтожены одним взрывом.' };
  }
  const won = state.result?.winner === state.playerSeat;
  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || (won ? 'Твой танк остался в живых.' : 'Танк уничтожен.'),
  };
}

function trajectoryPoints(tank, angleDeg, power, wind, speedMultiplier = 1) {
  if (!tank) return [];
  const angle = (angleDeg * Math.PI) / 180;
  const facing = tank.facing || 1;
  const muzzle = {
    x: tank.x + Math.cos(angle) * 42 * facing,
    y: tank.y - 28 - Math.sin(angle) * 42,
  };
  const speed = (400 + power * 560) * speedMultiplier;
  let x = muzzle.x;
  let y = muzzle.y;
  let vx = Math.cos(angle) * speed * facing;
  let vy = -Math.sin(angle) * speed;
  const pts = [{ x, y }];
  const dt = PREVIEW_TIME / MAX_PREVIEW_POINTS;
  for (let i = 0; i < MAX_PREVIEW_POINTS; i += 1) {
    vx += (wind || 0) * dt;
    vy += GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    if (x < 0 || x > WORLD_W || y > WORLD_H) break;
    pts.push({ x, y });
  }
  return pts;
}

function aimGeometry(tank, angleDeg, power) {
  if (!tank) return null;
  const angle = (angleDeg * Math.PI) / 180;
  const facing = tank.facing || 1;
  const dx = Math.cos(angle) * facing;
  const dy = -Math.sin(angle);
  const start = {
    x: tank.x + dx * 48,
    y: tank.y - 31 + dy * 48,
  };
  const length = 92 + power * 235;
  return {
    start,
    end: {
      x: start.x + dx * length,
      y: start.y + dy * length,
    },
  };
}

function Tank({ tank, mine, dead, aimAngle = 42 }) {
  const flip = tank.facing < 0 ? -1 : 1;
  const slopeAngle = tank.slopeAngle || 0;
  const barrelAngle = tank.facing < 0 ? -180 + aimAngle : -aimAngle;
  return (
    <g transform={`translate(${tank.x} ${tank.y})`}>
      {dead ? (
        <g className="ta-grave">
          <rect x="-24" y="-42" width="48" height="46" rx="8" />
          <text x="0" y="-12" textAnchor="middle">RIP</text>
        </g>
      ) : (
        <g className={mine ? 'ta-tank ta-tank--mine' : 'ta-tank ta-tank--enemy'}>
          <g transform={`rotate(${slopeAngle}) scale(${flip} 1)`}>
            <ellipse cx="0" cy="0" rx="48" ry="13" className="ta-track" />
            <rect x="-42" y="-23" width="84" height="24" rx="11" className="ta-body" />
            <rect x="-19" y="-41" width="42" height="24" rx="11" className="ta-turret" />
            <circle cx="-23" cy="-11" r="8" className="ta-wheel" />
            <circle cx="0" cy="-11" r="8" className="ta-wheel" />
            <circle cx="23" cy="-11" r="8" className="ta-wheel" />
          </g>
          <g transform={`translate(3 -31) rotate(${barrelAngle})`}>
            <rect x="7" y="-5" width="64" height="10" rx="5" className="ta-barrel" />
            <circle cx="7" cy="0" r="8" className="ta-barrel-joint" />
          </g>
        </g>
      )}
    </g>
  );
}

export default function TankArtilleryGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [angle, setAngle] = useState(48);
  const [power, setPower] = useState(0.62);
  const [shotType, setShotType] = useState('standard');
  const [aimDragging, setAimDragging] = useState(false);
  const moveTimerRef = useRef(null);
  const arenaSvgRef = useRef(null);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('tank-artillery');

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myTank = me ? state?.tanks?.[me] : null;
  const enemyTank = foe ? state?.tanks?.[foe] : null;
  const myTurn = state?.status === 'playing' && state?.currentTurn === me && state?.phase === 'aim';
  const result = resultPresentation(state);

  useEffect(() => {
    if (!myTurn) {
      clearInterval(moveTimerRef.current);
      moveTimerRef.current = null;
    }
  }, [myTurn]);

  useEffect(() => () => clearInterval(moveTimerRef.current), []);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function beginMove(dir) {
    if (!myTurn) return;
    sendAction({ type: 'move', dir });
    clearInterval(moveTimerRef.current);
    moveTimerRef.current = setInterval(() => sendAction({ type: 'move', dir }), 70);
  }

  function stopMove() {
    clearInterval(moveTimerRef.current);
    moveTimerRef.current = null;
  }

  function pointerToWorld(event) {
    const svg = arenaSvgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * WORLD_W,
      y: ((event.clientY - rect.top) / rect.height) * WORLD_H,
    };
  }

  function updateAimFromPointer(event) {
    if (!myTurn || !myTank) return;
    const point = pointerToWorld(event);
    if (!point) return;
    const facing = myTank.facing || 1;
    const originX = myTank.x;
    const originY = myTank.y - 31;
    const forward = Math.max(14, (point.x - originX) * facing);
    const up = originY - point.y;
    const nextAngle = clamp((Math.atan2(up, forward) * 180) / Math.PI, 15, 85);
    const distance = Math.hypot(point.x - originX, point.y - originY);
    const nextPower = clamp((distance - 140) / 235, 0.18, 1);
    setAngle(nextAngle);
    setPower(nextPower);
  }

  function beginAim(event) {
    if (!myTurn) return;
    event.preventDefault();
    setAimDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateAimFromPointer(event);
  }

  function moveAim(event) {
    if (!aimDragging) return;
    event.preventDefault();
    updateAimFromPointer(event);
  }

  function endAim(event) {
    if (!aimDragging) return;
    updateAimFromPointer(event);
    setAimDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function fire() {
    if (!myTurn) return;
    sendAction({
      type: 'fire',
      angle,
      power,
      shotType,
    });
  }

  const selectedShot = SHOTS.find((s) => s.id === shotType) || SHOTS[0];

  const preview = useMemo(
    () => trajectoryPoints(myTank, angle, power, state?.wind || 0, selectedShot.power),
    [myTank, angle, power, selectedShot, state?.wind],
  );

  if (!state && !waiting) {
    return (
      <section className="ta-lobby">
        <div className="ta-lobby__icon">💥</div>
        <span className="eyebrow">Пошаговая баллистика · 2 игрока</span>
        <h1>Танковая артиллерия</h1>
        <p>
          Сначала ход одного игрока: можно немного проехать, пальцем потянуть прицел прямо на поле и затем выстрелить.
          После завершения взрыва ход автоматически переходит сопернику.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>
          Найти соперника
        </button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="ta-waiting">
        <div className="ta-loader">💣</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго танкиста…</h2>
        <p>Матч запустится автоматически, когда найдётся соперник.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;

  const terrainPath = `M 0 ${WORLD_H} ` +
    (state.terrain || []).map((p, i) => `${i ? 'L' : 'L'} ${p.x} ${p.y}`).join(' ') +
    ` L ${WORLD_W} ${WORLD_H} Z`;

  const turnFuel = me ? state.turnFuel?.[me] ?? 0 : 0;
  const maxTurnFuel = state.maxTurnFuel || 360;
  const hpMe = myTank?.hp ?? 0;
  const hpFoe = enemyTank?.hp ?? 0;
  const canUseNuke = (state.inventory?.[me]?.nuke || 0) > 0;
  const canFire = myTurn && (shotType !== 'nuke' || canUseNuke);
  const aimGuide = aimGeometry(myTank, angle, power);

  return (
    <section className="ta-shell">
      <header className="ta-top">
        <button type="button" className="ta-back" onClick={onBack}>← Все игры</button>
        <div className="ta-turn">
          {state.status === 'finished' ? 'Матч окончен' : myTurn ? 'ТВОЙ ХОД' : 'ХОД СОПЕРНИКА'}
        </div>
        <div className="ta-wind">Ветер {state.wind > 0 ? '→' : state.wind < 0 ? '←' : '•'} {Math.abs(state.wind || 0).toFixed(0)}</div>
      </header>

      <div className="ta-scorebar">
        <div>
          <strong>{state.players?.[me]?.name || playerName}</strong>
          <span>HP {hpMe}</span>
        </div>
        <div className="ta-round">Ход {state.turnNumber || 1}</div>
        <div>
          <strong>{state.players?.[foe]?.name || 'Соперник'}</strong>
          <span>HP {hpFoe}</span>
        </div>
      </div>

      <div className="ta-arena">
        <svg ref={arenaSvgRef} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="taSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#111735" />
              <stop offset="62%" stopColor="#26355f" />
              <stop offset="100%" stopColor="#654b42" />
            </linearGradient>
            <linearGradient id="taGround" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#678543" />
              <stop offset="100%" stopColor="#28361f" />
            </linearGradient>
          </defs>

          <rect width={WORLD_W} height={WORLD_H} fill="url(#taSky)" />
          <circle cx="1140" cy="112" r="58" className="ta-moon" />
          {[120,230,390,610,820,1040,1260].map((x, i) => (
            <circle key={x} cx={x} cy={70 + (i % 3) * 58} r={i % 2 ? 2 : 3} className="ta-star" />
          ))}

          <path d={terrainPath} fill="url(#taGround)" className="ta-terrain" />

          {(state.crates || []).map((crate) => (
            <g key={crate.id} transform={`translate(${crate.x} ${crate.y})`} className="ta-crate">
              <rect x="-24" y="-34" width="48" height="34" rx="5" />
              <path d="M-16 -29 L16 -5 M16 -29 L-16 -5" />
              <text x="0" y="-42" textAnchor="middle">?</text>
            </g>
          ))}

          {(state.cows || []).filter((c) => c.alive).map((cow) => (
            <g key={cow.id} transform={`translate(${cow.x} ${cow.y})`} className="ta-cow">
              <ellipse cx="0" cy="-17" rx="24" ry="15" />
              <circle cx="22" cy="-21" r="10" />
              <line x1="-12" y1="-5" x2="-14" y2="4" />
              <line x1="12" y1="-5" x2="14" y2="4" />
            </g>
          ))}

          {myTurn && aimGuide && (
            <g className={`ta-aim-guide ${aimDragging ? 'is-dragging' : ''}`}>
              <line
                className="ta-aim-guide__hit"
                x1={aimGuide.start.x}
                y1={aimGuide.start.y}
                x2={aimGuide.end.x}
                y2={aimGuide.end.y}
                onPointerDown={beginAim}
                onPointerMove={moveAim}
                onPointerUp={endAim}
                onPointerCancel={endAim}
              />
              <line
                className="ta-aim-guide__line"
                x1={aimGuide.start.x}
                y1={aimGuide.start.y}
                x2={aimGuide.end.x}
                y2={aimGuide.end.y}
              />
              <circle
                className="ta-aim-guide__handle-hit"
                cx={aimGuide.end.x}
                cy={aimGuide.end.y}
                r="42"
                onPointerDown={beginAim}
                onPointerMove={moveAim}
                onPointerUp={endAim}
                onPointerCancel={endAim}
              />
              <circle className="ta-aim-guide__handle" cx={aimGuide.end.x} cy={aimGuide.end.y} r="17" />
              <text className="ta-aim-guide__power" x={aimGuide.end.x} y={aimGuide.end.y - 29} textAnchor="middle">
                {Math.round(power * 100)}%
              </text>
            </g>
          )}

          {myTurn && preview.length > 1 && (
            <polyline
              className="ta-preview"
              points={preview.map((p) => `${p.x},${p.y}`).join(' ')}
            />
          )}

          {state.projectile && (
            <g transform={`translate(${state.projectile.x} ${state.projectile.y})`} className="ta-projectile">
              <circle r={state.projectile.type === 'nuke' ? 12 : 8} />
              <circle r={state.projectile.type === 'nuke' ? 22 : 15} className="ta-projectile__glow" />
            </g>
          )}

          {state.explosion && (
            <g transform={`translate(${state.explosion.x} ${state.explosion.y})`} className="ta-explosion">
              <circle r={state.explosion.radius * 0.45} />
              <circle r={state.explosion.radius * 0.75} className="ta-explosion__ring" />
            </g>
          )}

          {myTank && <Tank tank={myTank} mine dead={myTank.hp <= 0} aimAngle={angle} />}
          {enemyTank && <Tank tank={enemyTank} dead={enemyTank.hp <= 0} aimAngle={38} />}
        </svg>
      </div>

      <div className="ta-controls ta-controls--single">
        <div className="ta-move-card">
          <div className="ta-control-title">
            <span>ДВИЖЕНИЕ</span>
            <b>{Math.ceil(turnFuel)} / {maxTurnFuel}</b>
          </div>
          <div className="ta-fuel"><i style={{ width: `${clamp(turnFuel / maxTurnFuel, 0, 1) * 100}%` }} /></div>
          <div className="ta-move-buttons">
            <button
              type="button"
              disabled={!myTurn || turnFuel <= 0}
              onPointerDown={() => beginMove(-1)}
              onPointerUp={stopMove}
              onPointerCancel={stopMove}
              onPointerLeave={stopMove}
            >◀</button>
            <div className="ta-aim-readout">
              <span>Тяни линию на поле</span>
              <b>{Math.round(angle)}° · {Math.round(power * 100)}%</b>
            </div>
            <button
              type="button"
              disabled={!myTurn || turnFuel <= 0}
              onPointerDown={() => beginMove(1)}
              onPointerUp={stopMove}
              onPointerCancel={stopMove}
              onPointerLeave={stopMove}
            >▶</button>
          </div>
        </div>
      </div>
      <div className="ta-weapons">
        {SHOTS.map((shot) => {
          const disabled = !myTurn || (shot.id === 'nuke' && !canUseNuke);
          return (
            <button
              type="button"
              key={shot.id}
              className={`ta-weapon ${shotType === shot.id ? 'is-active' : ''}`}
              disabled={disabled}
              onClick={() => setShotType(shot.id)}
            >
              <span>{shot.icon}</span>
              <b>{shot.name}</b>
              <small>{shot.id === 'nuke' ? `×${state.inventory?.[me]?.nuke || 0}` : shot.desc}</small>
            </button>
          );
        })}
      </div>

      <button type="button" className="ta-fire" disabled={!canFire} onClick={fire}>
        {myTurn ? (canFire ? `ОГОНЬ · ${selectedShot.name}` : 'НЕТ ЭТОГО СНАРЯДА') : 'ЖДЁМ СОПЕРНИКА'}
      </button>

      {state.notice && <div className="ta-notice">{state.notice}</div>}

      {result && (
        <div className="ta-result">
          <div className="ta-result__card">
            <span>Танковая артиллерия</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="ta-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Новый соперник</button>
              <button type="button" className="secondary-button" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
