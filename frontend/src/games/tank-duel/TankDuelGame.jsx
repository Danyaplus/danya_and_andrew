import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './tank-duel.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function colorLabel(color) {
  return color === 'red' ? 'Красный танк' : 'Синий танк';
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  let text = state.result?.message || 'Матч завершён.';
  if (state.result?.type === 'disconnect') {
    text = won ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  } else if (state.result?.type === 'resign') {
    text = won ? 'Соперник покинул бой.' : 'Ты покинул бой.';
  }
  return {
    won,
    title: won ? 'Вы победили!' : 'Вы проиграли',
    text,
    icon: won ? '🏆' : '💥',
  };
}


function lerpAngle(current, target, alpha) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * alpha;
}

function useSmoothEntity(target, { snapDistance = 180, response = 22 } = {}) {
  const [frame, setFrame] = useState(target);
  const frameRef = useRef(target);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
    if (!target) {
      frameRef.current = target;
      setFrame(target);
      return;
    }
    const current = frameRef.current;
    if (!current || Math.hypot((target.x ?? 0) - (current.x ?? 0), (target.y ?? 0) - (current.y ?? 0)) > snapDistance) {
      frameRef.current = target;
      setFrame(target);
    }
  }, [target, snapDistance]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const wanted = targetRef.current;
      const current = frameRef.current;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;

      if (wanted && current) {
        const alpha = 1 - Math.exp(-response * dt);
        const next = {
          ...wanted,
          x: current.x + (wanted.x - current.x) * alpha,
          y: current.y + (wanted.y - current.y) * alpha,
        };
        if (Number.isFinite(wanted.angle) && Number.isFinite(current.angle)) {
          next.angle = lerpAngle(current.angle, wanted.angle, alpha);
        }
        frameRef.current = next;
        if (Math.abs(next.x - current.x) > 0.01 || Math.abs(next.y - current.y) > 0.01 || Math.abs((next.angle ?? 0) - (current.angle ?? 0)) > 0.0005) {
          setFrame(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [response]);

  return frame;
}

function TankShape({ tank, mine }) {
  const smoothTank = useSmoothEntity(tank, { snapDistance: 220, response: 24 });
  if (!smoothTank) return null;
  const degrees = (smoothTank.angle * 180) / Math.PI;
  return (
    <g
      className={`tank-sprite tank-sprite--${smoothTank.color} ${mine ? 'is-mine' : ''}`}
      transform={`translate(${smoothTank.x} ${smoothTank.y}) rotate(${degrees})`}
    >
      <ellipse className="tank-shadow" cx="0" cy="8" rx="31" ry="22" />
      <rect className="tank-track tank-track--top" x="-24" y="-23" width="45" height="12" rx="5" />
      <rect className="tank-track tank-track--bottom" x="-24" y="11" width="45" height="12" rx="5" />
      <rect className="tank-body" x="-22" y="-18" width="43" height="36" rx="8" />
      <rect className="tank-barrel" x="5" y="-5" width="36" height="10" rx="4" />
      <circle className="tank-turret" cx="4" cy="0" r="13" />
      <circle className="tank-turret-cap" cx="4" cy="0" r="6" />
      {mine && <path className="tank-mine-arrow" d="M-6 -34 L0 -45 L6 -34 Z" />}
    </g>
  );
}

function BulletShape({ bullet }) {
  const smoothBullet = useSmoothEntity(bullet, { snapDistance: 130, response: 34 });
  if (!smoothBullet) return null;
  return (
    <g className="tank-bullet" transform={`translate(${smoothBullet.x} ${smoothBullet.y})`}>
      <circle r="9" className="tank-bullet__glow" />
      <circle r="5.5" className="tank-bullet__core" />
    </g>
  );
}

function obstacleDamageLevel(obstacle) {
  if (!obstacle?.destructible || !Number.isFinite(obstacle.maxHp) || !Number.isFinite(obstacle.hp)) return 0;
  return Math.max(0, obstacle.maxHp - obstacle.hp);
}

function PineTree({ obstacle }) {
  const r = obstacle.r;
  const damage = obstacleDamageLevel(obstacle);
  return (
    <g className={`tank-pine tank-cover--damage-${Math.min(4, damage)}`} transform={`translate(${obstacle.x} ${obstacle.y})`}>
      <ellipse className="tank-pine__shadow" cx="6" cy="8" rx={r * 0.92} ry={r * 0.78} />
      <circle className="tank-pine__outer" r={r} />
      <circle className="tank-pine__mid" cx={-r * 0.18} cy={-r * 0.12} r={r * 0.7} />
      <circle className="tank-pine__mid" cx={r * 0.24} cy={r * 0.08} r={r * 0.64} />
      <circle className="tank-pine__inner" cx="0" cy={-r * 0.08} r={r * 0.42} />
      <circle className="tank-pine__trunk" r={Math.max(5, r * 0.14)} />
      {damage >= 1 && <path className="tank-cover-crack" d={`M${-r * 0.18} ${-r * 0.06} l${r * 0.18} ${r * 0.18} l${-r * 0.08} ${r * 0.17}`} />}
      {damage >= 3 && <path className="tank-cover-crack tank-cover-crack--2" d={`M${r * 0.23} ${-r * 0.2} l${-r * 0.17} ${r * 0.2} l${r * 0.14} ${r * 0.18}`} />}
    </g>
  );
}

function Rock({ obstacle }) {
  const r = obstacle.r;
  return (
    <g className="tank-rock tank-cover--indestructible" transform={`translate(${obstacle.x} ${obstacle.y})`}>
      <ellipse className="tank-rock__shadow" cx="6" cy="8" rx={r * 0.94} ry={r * 0.76} />
      <circle className="tank-rock__body" r={r} />
      <ellipse className="tank-rock__highlight" cx={-r * 0.2} cy={-r * 0.24} rx={r * 0.4} ry={r * 0.22} />
      <path className="tank-rock__crack" d={`M${-r * 0.08} ${-r * 0.15} l${r * 0.16} ${r * 0.18} l${-r * 0.1} ${r * 0.18}`} />
    </g>
  );
}

function RectObstacle({ obstacle }) {
  const { x, y, w, h, style } = obstacle;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const damage = obstacleDamageLevel(obstacle);

  if (style === 'crate') {
    return (
      <g className={`tank-crate tank-cover--damage-${Math.min(3, damage)}`}>
        <rect className="tank-crate__shadow" x={x + 5} y={y + 6} width={w} height={h} rx="8" />
        <rect className="tank-crate__box" x={x} y={y} width={w} height={h} rx="8" />
        <path className="tank-crate__brace" d={`M${x + 9} ${y + 9} L${x + w - 9} ${y + h - 9} M${x + w - 9} ${y + 9} L${x + 9} ${y + h - 9}`} />
        <rect className="tank-crate__rim" x={x + 7} y={y + 7} width={Math.max(0, w - 14)} height={Math.max(0, h - 14)} rx="4" />
        {damage >= 1 && (
          <path className="tank-cover-crack" d={`M${cx - w * 0.08} ${y + h * 0.1} l${-w * 0.06} ${h * 0.22} l${w * 0.12} ${h * 0.15} l${-w * 0.08} ${h * 0.24}`} />
        )}
        {damage >= 2 && (
          <>
            <path className="tank-cover-crack tank-cover-crack--2" d={`M${x + w * 0.78} ${y + h * 0.12} l${-w * 0.18} ${h * 0.22} l${w * 0.13} ${h * 0.18} l${-w * 0.18} ${h * 0.2}`} />
            <path className="tank-cover-splinter" d={`M${x + w * 0.12} ${y + h * 0.7} l${w * 0.22} ${-h * 0.08} l${-w * 0.07} ${h * 0.18} z`} />
          </>
        )}
      </g>
    );
  }

  if (style === 'log') {
    const horizontal = w >= h;
    return (
      <g className={`tank-log tank-cover--damage-${Math.min(4, damage)}`}>
        <rect className="tank-log__shadow" x={x + 4} y={y + 5} width={w} height={h} rx={Math.min(w, h) / 2} />
        <rect className="tank-log__wood" x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} />
        {horizontal ? (
          <>
            <line x1={x + w * 0.25} y1={y + 4} x2={x + w * 0.25} y2={y + h - 4} />
            <line x1={x + w * 0.55} y1={y + 4} x2={x + w * 0.55} y2={y + h - 4} />
            <line x1={x + w * 0.8} y1={y + 4} x2={x + w * 0.8} y2={y + h - 4} />
          </>
        ) : (
          <>
            <line x1={x + 4} y1={y + h * 0.25} x2={x + w - 4} y2={y + h * 0.25} />
            <line x1={x + 4} y1={y + h * 0.6} x2={x + w - 4} y2={y + h * 0.6} />
          </>
        )}
        {damage >= 1 && <path className="tank-cover-crack" d={`M${cx - 22} ${cy - 8} l18 7 l-12 10 l24 6`} />}
        {damage >= 2 && <path className="tank-cover-crack tank-cover-crack--2" d={`M${cx + 30} ${cy - 8} l-16 8 l14 8 l-20 7`} />}
        {damage >= 3 && <path className="tank-cover-split" d={`M${x + w * 0.18} ${cy} L${x + w * 0.82} ${cy}`} />}
      </g>
    );
  }

  if (style === 'sandbag') {
    const horizontal = w >= h;
    const count = horizontal ? Math.max(3, Math.round(w / 34)) : Math.max(3, Math.round(h / 34));
    return (
      <g className={`tank-sandbag tank-cover--damage-${Math.min(4, damage)}`}>
        <rect className="tank-sandbag__base" x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} />
        {Array.from({ length: count }, (_, index) => {
          const px = horizontal ? x + (index + 0.5) * (w / count) : cx;
          const py = horizontal ? cy : y + (index + 0.5) * (h / count);
          return <ellipse key={index} cx={px} cy={py} rx={horizontal ? w / count * 0.42 : w * 0.4} ry={horizontal ? h * 0.38 : h / count * 0.42} />;
        })}
        {damage >= 1 && <circle className="tank-sandbag__hole" cx={x + w * 0.36} cy={y + h * 0.48} r={Math.min(w, h) * 0.12} />}
        {damage >= 2 && <circle className="tank-sandbag__hole" cx={x + w * 0.68} cy={y + h * 0.42} r={Math.min(w, h) * 0.14} />}
        {damage >= 3 && <path className="tank-sandbag__tear" d={`M${x + w * 0.42} ${y + h * 0.18} l${w * 0.12} ${h * 0.64}`} />}
      </g>
    );
  }

  return (
    <g className={`tank-block tank-block--${style || 'wall'} tank-cover--indestructible`}>
      <rect className="tank-block__shadow" x={x + 5} y={y + 6} width={w} height={h} rx="6" />
      <rect className="tank-block__body" x={x} y={y} width={w} height={h} rx="6" />
      {style === 'ruin' && <path className="tank-block__crack" d={`M${cx - 18} ${y} l10 18 l-7 13 l16 18 M${cx + 24} ${y + h} l-8 -18 l10 -12`} />}
      {style === 'wall' && (
        <path className="tank-block__mortar" d={`M${x + w * 0.32} ${y + 4} v${h - 8} M${x + w * 0.66} ${y + 4} v${h - 8}`} />
      )}
    </g>
  );
}

function Obstacle({ obstacle }) {
  if (obstacle.type === 'circle' && obstacle.style === 'pine') return <PineTree obstacle={obstacle} />;
  if (obstacle.type === 'circle' && obstacle.style === 'rock') return <Rock obstacle={obstacle} />;
  if (obstacle.type === 'circle') {
    const damage = obstacleDamageLevel(obstacle);
    return (
      <g className={`tank-bush tank-cover--damage-${Math.min(2, damage)}`} transform={`translate(${obstacle.x} ${obstacle.y})`}>
        <circle r={obstacle.r} />
        <circle cx={-obstacle.r * 0.42} cy={-obstacle.r * 0.16} r={obstacle.r * 0.53} />
        <circle cx={obstacle.r * 0.4} cy={-obstacle.r * 0.28} r={obstacle.r * 0.56} />
        <circle cx={obstacle.r * 0.22} cy={obstacle.r * 0.42} r={obstacle.r * 0.55} />
        <circle className="tank-bush__core" r={obstacle.r * 0.38} />
        {damage >= 1 && <path className="tank-bush__scar" d={`M${-obstacle.r * 0.55} ${obstacle.r * 0.45} L${obstacle.r * 0.5} ${-obstacle.r * 0.45}`} />}
      </g>
    );
  }
  return <RectObstacle obstacle={obstacle} />;
}

function ObstacleImpact({ impact }) {
  const maxLife = impact.maxLife || 0.42;
  const progress = Math.max(0, Math.min(1, 1 - impact.life / maxLife));
  const opacity = Math.max(0, 1 - progress);

  if (impact.type === 'armor') {
    return (
      <g className="tank-impact tank-impact--armor" transform={`translate(${impact.x} ${impact.y})`} opacity={opacity}>
        <circle r={7 + progress * 17} />
        {[0, 60, 120, 180, 240, 300].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const inner = 10 + progress * 8;
          const outer = 20 + progress * 17;
          return <line key={angle} x1={Math.cos(rad) * inner} y1={Math.sin(rad) * inner} x2={Math.cos(rad) * outer} y2={Math.sin(rad) * outer} />;
        })}
      </g>
    );
  }

  if (impact.type === 'break') {
    return (
      <g className="tank-impact tank-impact--break" transform={`translate(${impact.x} ${impact.y})`} opacity={opacity}>
        {[0, 45, 95, 145, 210, 275, 325].map((angle, index) => {
          const rad = (angle * Math.PI) / 180;
          const distance = 12 + progress * (34 + index * 3);
          return (
            <rect
              key={angle}
              x={Math.cos(rad) * distance - 4}
              y={Math.sin(rad) * distance - 3}
              width={8 + (index % 2) * 3}
              height="6"
              rx="2"
              transform={`rotate(${angle + progress * 80} ${Math.cos(rad) * distance} ${Math.sin(rad) * distance})`}
            />
          );
        })}
        <circle className="tank-impact__dust" r={12 + progress * 28} />
      </g>
    );
  }

  return (
    <g className="tank-impact tank-impact--damage" transform={`translate(${impact.x} ${impact.y})`} opacity={opacity}>
      <circle r={5 + progress * 12} />
      <path d={`M${-12 - progress * 8} 0 H${12 + progress * 8} M0 ${-12 - progress * 8} V${12 + progress * 8}`} />
    </g>
  );
}

function Ground({ theme, width, height }) {
  return (
    <g className={`tank-ground tank-ground--${theme || 'forest'}`}>
      <rect className="tank-ground__base" width={width} height={height} rx="30" />
      <rect className="tank-ground__pattern" width={width} height={height} rx="30" fill="url(#tank-ground-pattern)" />
      {theme === 'forest' && (
        <>
          <path className="tank-ground__trail" d={`M0 ${height * 0.55} C${width * 0.25} ${height * 0.42}, ${width * 0.42} ${height * 0.7}, ${width * 0.62} ${height * 0.53} S${width * 0.84} ${height * 0.38}, ${width} ${height * 0.48}`} />
          <ellipse className="tank-ground__patch" cx={width * 0.28} cy={height * 0.22} rx="150" ry="70" />
          <ellipse className="tank-ground__patch" cx={width * 0.78} cy={height * 0.76} rx="170" ry="76" />
        </>
      )}
      {theme === 'fort' && (
        <>
          <rect className="tank-ground__fort-pad" x={width * 0.37} y={height * 0.28} width={width * 0.26} height={height * 0.44} rx="28" />
          <path className="tank-ground__fort-road" d={`M0 ${height * 0.5} H${width}`} />
        </>
      )}
      {theme === 'canyon' && (
        <>
          <path className="tank-ground__canyon-line" d={`M${width * 0.04} ${height * 0.23} C${width * 0.28} ${height * 0.12}, ${width * 0.35} ${height * 0.38}, ${width * 0.55} ${height * 0.3} S${width * 0.8} ${height * 0.12}, ${width * 0.97} ${height * 0.26}`} />
          <path className="tank-ground__canyon-line" d={`M${width * 0.05} ${height * 0.78} C${width * 0.25} ${height * 0.62}, ${width * 0.4} ${height * 0.88}, ${width * 0.6} ${height * 0.7} S${width * 0.8} ${height * 0.64}, ${width * 0.97} ${height * 0.79}`} />
        </>
      )}
    </g>
  );
}

export default function TankDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('tank-duel');

  const result = resultPresentation(state);
  const mySeat = state?.playerSeat;
  const opponentSeat = state?.opponentSeat;
  const myTank = mySeat ? state?.tanks?.[mySeat] : null;
  const opponentTank = opponentSeat ? state?.tanks?.[opponentSeat] : null;
  const myPlayer = mySeat ? state?.players?.[mySeat] : null;
  const opponentPlayer = opponentSeat ? state?.players?.[opponentSeat] : null;
  const canControl = state?.status === 'playing' && state?.phase === 'playing';

  const scoreText = useMemo(() => {
    if (!state || !mySeat || !opponentSeat) return '0 : 0';
    return `${state.scores?.[mySeat] ?? 0} : ${state.scores?.[opponentSeat] ?? 0}`;
  }, [state, mySeat, opponentSeat]);

  useEffect(() => {
    if (!canControl && pressedRef.current) {
      pressedRef.current = false;
      setPressed(false);
    }
  }, [canControl]);

  function findMatch() {
    setError('');
    pressedRef.current = false;
    setPressed(false);
    startMatch(playerName);
  }

  function controlDown(event) {
    if (!canControl || pressedRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressedRef.current = true;
    setPressed(true);
    sendAction({ type: 'control-down' });
  }

  function controlUp(event) {
    if (!pressedRef.current) return;
    event?.preventDefault?.();
    pressedRef.current = false;
    setPressed(false);
    sendAction({ type: 'control-up' });
  }

  if (!state && !waiting) {
    return (
      <section className="tank-lobby">
        <div className="tank-lobby__duel" aria-hidden="true">
          <span>🔴</span><b>VS</b><span>🔵</span>
        </div>
        <span className="eyebrow">Одна кнопка · матч до 2 побед</span>
        <h1>Танковая дуэль</h1>
        <p>
          Танки постоянно вращаются. Коротко нажми — выстрелишь и поменяешь направление вращения.
          Зажми кнопку — выстрелишь и поедешь вперёд, пока держишь.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="tank-waiting">
        <div className="tank-waiting__spinner">⚙</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второй танк…</h2>
        <p>Как только второй игрок нажмёт поиск, бой начнётся автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const myHeat = myTank?.heat ?? 0;
  const overheated = (myTank?.overheatedMs ?? 0) > 0;

  return (
    <section className="tank-game">
      <div className="tank-hud">
        <div className={`tank-player-card tank-player-card--${myTank?.color || 'red'}`}>
          <span className="tank-player-card__dot" />
          <div>
            <small>Твой танк</small>
            <strong>{myPlayer?.name || playerName}</strong>
            <span>{colorLabel(myTank?.color)}</span>
          </div>
          <b>{state.scores?.[mySeat] ?? 0}</b>
        </div>

        <div className="tank-scoreboard">
          <small>Раунд {state.round} · до {state.winsToMatch} побед</small>
          <strong>{scoreText}</strong>
          <span>{state.phase === 'round-over' ? 'Раунд завершён' : (state.map?.name || 'Бой идёт')}</span>
        </div>

        <div className={`tank-player-card tank-player-card--${opponentTank?.color || 'blue'} is-opponent`}>
          <b>{state.scores?.[opponentSeat] ?? 0}</b>
          <div>
            <small>Соперник</small>
            <strong>{opponentPlayer?.name || 'Игрок'}</strong>
            <span>{colorLabel(opponentTank?.color)}</span>
          </div>
          <span className="tank-player-card__dot" />
        </div>
      </div>

      <div className={`tank-arena-shell tank-arena-shell--${state.map?.theme || 'forest'}`}>
        <svg
          className={`tank-arena tank-arena--${state.map?.theme || 'forest'}`}
          viewBox={`0 0 ${state.arena?.width || 1400} ${state.arena?.height || 840}`}
          style={{ aspectRatio: `${state.arena?.width || 1400} / ${state.arena?.height || 840}` }}
          role="img"
          aria-label="Арена танковой дуэли"
        >
          <defs>
            <pattern id="tank-ground-pattern" width="70" height="54" patternUnits="userSpaceOnUse">
              <path d="M0 31 C18 10 43 52 70 22" className="tank-ground-speck-line" fill="none" />
              <circle cx="15" cy="12" r="2.3" className="tank-ground-speck" />
              <circle cx="53" cy="39" r="1.8" className="tank-ground-speck" />
            </pattern>
          </defs>
          <Ground theme={state.map?.theme} width={state.arena?.width || 1400} height={state.arena?.height || 840} />

          {(state.obstacles || []).map((obstacle) => <Obstacle key={obstacle.id} obstacle={obstacle} />)}

          {(state.obstacleImpacts || []).map((impact) => (
            <ObstacleImpact key={impact.id} impact={impact} />
          ))}

          {(state.bullets || []).map((bullet) => (
            <BulletShape key={bullet.id} bullet={bullet} />
          ))}

          {(state.explosions || []).map((explosion) => {
            const progress = Math.max(0, Math.min(1, 1 - explosion.life / 0.32));
            return (
              <g key={explosion.id} transform={`translate(${explosion.x} ${explosion.y})`} className="tank-explosion">
                <circle r={14 + progress * 28} opacity={1 - progress * 0.85} />
                <circle className="tank-explosion__core" r={7 + progress * 13} opacity={1 - progress} />
              </g>
            );
          })}

          <TankShape tank={state.tanks?.a} mine={mySeat === 'a'} />
          <TankShape tank={state.tanks?.b} mine={mySeat === 'b'} />
        </svg>

        <div className={`tank-heat ${overheated ? 'is-overheated' : ''}`}>
          <div className="tank-heat__head">
            <span>{overheated ? 'ПЕРЕГРЕВ' : 'Пушка'}</span>
            <b>{overheated ? `${Math.ceil((myTank?.overheatedMs || 0) / 100) / 10}с` : `${Math.round(myHeat)}%`}</b>
          </div>
          <div className="tank-heat__track"><i style={{ width: `${Math.min(100, myHeat)}%` }} /></div>
        </div>

        <button
          type="button"
          className={`tank-control tank-control--${myTank?.color || 'red'} ${pressed ? 'is-pressed' : ''} ${overheated ? 'is-overheated' : ''}`}
          onPointerDown={controlDown}
          onPointerUp={controlUp}
          onPointerCancel={controlUp}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Выстрелить или ехать вперёд"
        >
          <span className="tank-control__icon">☝</span>
          <small>{overheated ? 'ЕДЕМ' : pressed ? 'ЕДЕМ' : 'ОГОНЬ'}</small>
        </button>

        {state.phase === 'round-over' && state.status === 'playing' && (
          <div className="tank-round-banner" aria-live="polite">
            <span>{state.roundWinner === mySeat ? '🎯' : '💥'}</span>
            <strong>{state.roundWinner === mySeat ? 'Раунд твой!' : 'Раунд соперника'}</strong>
            <small>{state.roundMessage}</small>
          </div>
        )}
      </div>

      <div className="tank-help-row">
        <span><b>Тап</b> — выстрел + разворот вращения</span>
        <span><b>Зажать</b> — выстрел + ехать вперёд</span>
        <span><b>Укрытия</b> — дерево ломается, камень держит удар</span>
        <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти из боя</button>
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="tank-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`tank-result tank-result--${result.won ? 'win' : 'lose'}`}>
            <div className="tank-result__icon">{result.icon}</div>
            <span className="eyebrow">Матч завершён · {state.scores?.[mySeat] ?? 0}:{state.scores?.[opponentSeat] ?? 0}</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="tank-result__actions">
              <button className="primary-button" onClick={onBack}>Выйти в главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Найти нового соперника</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
