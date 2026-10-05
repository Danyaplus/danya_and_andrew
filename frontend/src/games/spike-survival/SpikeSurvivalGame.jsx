import { memo, useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './spike-survival.css';

const WORLD_W = 1000;
const WORLD_H = 620;
const TAU = Math.PI * 2;

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function angleDelta(target, current) { return normalizeAngle(target - current); }

function motionPoint() {
  return { x: 0, y: 0, angle: 0, vx: 0, vy: 0, tx: 0, ty: 0, ta: 0, tvx: 0, tvy: 0, receivedAt: 0, ready: false };
}

function feedMotion(point, source, stamp) {
  if (!source) { point.ready = false; return; }
  if (!point.ready) {
    point.x = source.x;
    point.y = source.y;
    point.angle = source.heading ?? 0;
    point.ready = true;
  }
  point.tx = source.x;
  point.ty = source.y;
  point.ta = source.heading ?? point.angle;
  point.tvx = source.vx || 0;
  point.tvy = source.vy || 0;
  point.receivedAt = stamp;
}

function smoothMotion(point, stamp, dt) {
  if (!point.ready) return;
  const age = Math.min(95, Math.max(0, stamp - point.receivedAt)) / 1000;
  const px = point.tx + point.tvx * age;
  const py = point.ty + point.tvy * age;
  const posAlpha = 1 - Math.exp(-28 * dt);
  const angAlpha = 1 - Math.exp(-34 * dt);
  point.x += (px - point.x) * posAlpha;
  point.y += (py - point.y) * posAlpha;
  point.angle += angleDelta(point.ta, point.angle) * angAlpha;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  return {
    title: won ? 'ТЫ ВЫЖИЛ!' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || (won ? 'Шипастый мяч попал в соперника.' : 'Шипастый мяч добрался до тебя.'),
  };
}

function Flower({ x, y, color = '#ff5d86', scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {Array.from({ length: 7 }, (_, i) => (
        <ellipse key={i} cx="0" cy="-14" rx="10" ry="17" fill={color} transform={`rotate(${i * (360 / 7)})`} />
      ))}
      <circle r="9" fill="#ffd33d" />
    </g>
  );
}

const ArenaArt = memo(function ArenaArt() {
  const inner = '180,70 820,70 930,170 930,450 820,550 180,550 70,450 70,170';
  const mid = '150,42 850,42 964,150 964,470 850,578 150,578 36,470 36,150';
  const outer = '135,20 865,20 990,138 990,482 865,600 135,600 10,482 10,138';

  return (
    <>
      <defs>
        <pattern id="ss-grass" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="#28cd72" />
          <path d="M7 6l5 8-8-2zM26 5l-3 8-6-7zM10 27l8-2-3 7zM29 24l-7 4 2-8z" fill="#20bd66" opacity=".30" />
        </pattern>
        <pattern id="ss-tile" width="118" height="88" patternUnits="userSpaceOnUse">
          <rect width="118" height="88" fill="#f5d99d" />
          <rect x="10" y="8" width="49" height="42" rx="5" fill="#e9c482" opacity=".70" />
          <rect x="67" y="18" width="41" height="52" rx="5" fill="#e8c17c" opacity=".56" />
          <rect x="21" y="59" width="17" height="13" rx="3" fill="#dbb16c" opacity=".52" />
          <rect x="48" y="65" width="12" height="9" rx="2" fill="#dbb16c" opacity=".45" />
          <rect x="93" y="5" width="13" height="12" rx="2" fill="#dcb36f" opacity=".48" />
        </pattern>
        <linearGradient id="ss-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d99a53" />
          <stop offset="100%" stopColor="#bd7838" />
        </linearGradient>
        <linearGradient id="ss-woodInner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2a55f" />
          <stop offset="100%" stopColor="#c98946" />
        </linearGradient>
        <clipPath id="ss-arena-clip"><polygon points={inner} /></clipPath>
      </defs>

      <rect width={WORLD_W} height={WORLD_H} fill="url(#ss-grass)" />
      <Flower x={78} y={56} color="#ff6f80" scale=".92" />
      <Flower x={123} y={94} color="#e526a8" scale=".72" />
      <Flower x={55} y={525} color="#ff7b7a" scale=".75" />
      <Flower x={912} y={88} color="#f6c635" scale=".82" />
      <Flower x={952} y={122} color="#e727a9" scale=".70" />
      <Flower x={925} y={532} color="#ff7387" scale=".88" />
      <Flower x={866} y={569} color="#f7c93d" scale=".74" />

      <polygon points={outer} fill="#9b622d" opacity=".95" />
      <polygon points={mid} fill="url(#ss-wood)" />
      <polygon points={inner} fill="url(#ss-tile)" stroke="#8d5628" strokeWidth="9" />
      <polygon points={mid} fill="none" stroke="#e9b36c" strokeWidth="17" opacity=".38" />
      <polygon points={inner} fill="none" stroke="#77471f" strokeWidth="5" opacity=".58" />

      <g clipPath="url(#ss-arena-clip)" opacity=".18">
        <path d="M170 204H840M140 396H875" stroke="#fff8df" strokeWidth="2" strokeDasharray="10 18" />
      </g>
    </>
  );
});

function Runner({ seat, name, nodeRef }) {
  const blue = seat === 'b';
  return (
    <g ref={nodeRef} className={`ss-runner ss-runner--${blue ? 'blue' : 'pink'}`}>
      <ellipse className="ss-runner__shadow" cx="-5" cy="8" rx="31" ry="20" />
      <circle className="ss-runner__body" r="27" />
      <circle className="ss-runner__cap" cx="-5" cy="-18" r="11" />
      <ellipse className="ss-runner__arm" cx="-4" cy="-31" rx="9" ry="6" />
      <ellipse className="ss-runner__arm" cx="-4" cy="31" rx="9" ry="6" />
      <circle className="ss-runner__face" cx="20" cy="0" r="16" />
      <circle className="ss-runner__eye" cx="24" cy="-6" r="2.8" />
      <circle className="ss-runner__eye" cx="24" cy="6" r="2.8" />
      <path className="ss-runner__mouth" d="M31 -3Q35 0 31 3" />
      <g transform="translate(0 -42) rotate(0)">
        <rect className="ss-runner__nameplate" x="-34" y="-12" width="68" height="18" rx="9" />
        <text className="ss-runner__name" x="0" y="1" textAnchor="middle">{name}</text>
      </g>
    </g>
  );
}

function SpikeBall({ nodeRef }) {
  const spikes = Array.from({ length: 14 }, (_, i) => {
    const a = i * (360 / 14);
    return <path key={i} d="M0 -21 L-6 -34 L6 -34 Z" transform={`rotate(${a})`} className="ss-ball__spike" />;
  });
  return (
    <g ref={nodeRef} className="ss-ball">
      <circle className="ss-ball__shadow" cx="5" cy="7" r="25" />
      {spikes}
      <circle className="ss-ball__body" r="23" />
      <path className="ss-ball__plate" d="M-14 -12L0 -19L14 -10L18 5L6 18L-9 16L-18 4Z" />
      <circle cx="-8" cy="-6" r="3" className="ss-ball__bolt" />
      <circle cx="9" cy="8" r="3" className="ss-ball__bolt" />
    </g>
  );
}

function DirectionWarning({ angle }) {
  const deg = angle * 180 / Math.PI;
  return (
    <g className="ss-warning" transform="translate(500 310)">
      <circle r="58" className="ss-warning__halo" />
      <circle r="48" className="ss-warning__ring" />
      <g transform={`rotate(${deg})`}>
        <path d="M-16 0H38" className="ss-warning__shaft" />
        <path d="M36 -14L58 0L36 14Z" className="ss-warning__arrow" />
        <circle cx="-28" cy="0" r="7" className="ss-warning__dot" />
      </g>
      <text y="83" textAnchor="middle" className="ss-warning__text">СЮДА ПОЛЕТИТ МЯЧ</text>
    </g>
  );
}

export default function SpikeSurvivalGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [headingDeg, setHeadingDeg] = useState(0);
  const stateRef = useRef(null);
  const sendActionRef = useRef(null);
  const playerARef = useRef(null);
  const playerBRef = useRef(null);
  const ballRef = useRef(null);
  const padRef = useRef(null);
  const dragRef = useRef(null);
  const headingRef = useRef(0);
  const lastSentRef = useRef(0);
  const lastFrameRef = useRef(0);
  const rafRef = useRef(null);
  const keyRef = useRef({ up: false, down: false, left: false, right: false });
  const motionRef = useRef({ a: motionPoint(), b: motionPoint(), ball: motionPoint() });

  const { waiting, state, error, setError, findMatch: startMatch, cancelSearch, sendAction } = useMultiplayerGame('spike-survival');
  stateRef.current = state;
  sendActionRef.current = sendAction;

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const canSteer = state?.status === 'playing' && (state?.phase === 'warning' || state?.phase === 'survival');
  const result = resultPresentation(state);
  const myName = me ? state?.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state?.players?.[foe]?.name || 'Соперник' : 'Соперник';

  useEffect(() => {
    if (!state?.runners) return;
    const stamp = performance.now();
    feedMotion(motionRef.current.a, state.runners.a, stamp);
    feedMotion(motionRef.current.b, state.runners.b, stamp);
    if (state.ball) {
      const source = { ...state.ball, heading: Math.atan2(state.ball.vy, state.ball.vx) };
      feedMotion(motionRef.current.ball, source, stamp);
    } else {
      motionRef.current.ball.ready = false;
    }
  }, [state?.runners, state?.ball]);

  useEffect(() => {
    if (!me || dragRef.current) return;
    const serverHeading = state?.runners?.[me]?.heading;
    if (!Number.isFinite(serverHeading)) return;
    headingRef.current = serverHeading;
    setHeadingDeg(serverHeading * 180 / Math.PI);
  }, [me, state?.roomId, state?.runners?.[me]?.heading]);

  useEffect(() => {
    let alive = true;
    function frame(stamp) {
      if (!alive) return;
      const dt = lastFrameRef.current ? clamp((stamp - lastFrameRef.current) / 1000, 0, .04) : 1 / 60;
      lastFrameRef.current = stamp;
      smoothMotion(motionRef.current.a, stamp, dt);
      smoothMotion(motionRef.current.b, stamp, dt);
      smoothMotion(motionRef.current.ball, stamp, dt);

      const placeRunner = (node, point) => {
        if (!node || !point.ready) return;
        node.setAttribute('transform', `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${(point.angle * 180 / Math.PI).toFixed(2)})`);
      };
      placeRunner(playerARef.current, motionRef.current.a);
      placeRunner(playerBRef.current, motionRef.current.b);

      if (ballRef.current && motionRef.current.ball.ready) {
        const ball = motionRef.current.ball;
        const spin = (stamp * .22) % 360;
        ballRef.current.setAttribute('transform', `translate(${ball.x.toFixed(2)} ${ball.y.toFixed(2)}) rotate(${spin.toFixed(1)})`);
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = 0;
    };
  }, []);

  function publishHeading(angle, force = false) {
    const normalized = normalizeAngle(angle);
    headingRef.current = normalized;
    setHeadingDeg(normalized * 180 / Math.PI);

    if (me && motionRef.current[me]?.ready) {
      const point = motionRef.current[me];
      point.angle = normalized;
      point.ta = normalized;
      const speed = stateRef.current?.playerSpeed || 205;
      point.tvx = Math.cos(normalized) * speed;
      point.tvy = Math.sin(normalized) * speed;
    }

    if (!canSteer) return;
    const now = performance.now();
    if (!force && now - lastSentRef.current < 28) return;
    lastSentRef.current = now;
    sendActionRef.current?.({ type: 'steer', heading: normalized });
  }

  function pointerAngle(event) {
    const box = padRef.current?.getBoundingClientRect();
    if (!box) return headingRef.current;
    return Math.atan2(event.clientY - (box.top + box.height / 2), event.clientX - (box.left + box.width / 2));
  }

  function onPadDown(event) {
    if (!canSteer) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* noop */ }
    dragRef.current = event.pointerId;
    publishHeading(pointerAngle(event), true);
  }
  function onPadMove(event) {
    if (dragRef.current !== event.pointerId) return;
    event.preventDefault();
    publishHeading(pointerAngle(event));
  }
  function onPadUp(event) {
    if (dragRef.current !== event.pointerId) return;
    dragRef.current = null;
    publishHeading(headingRef.current, true);
  }

  useEffect(() => {
    function updateFromKeys() {
      const x = (keyRef.current.right ? 1 : 0) - (keyRef.current.left ? 1 : 0);
      const y = (keyRef.current.down ? 1 : 0) - (keyRef.current.up ? 1 : 0);
      if (x || y) publishHeading(Math.atan2(y, x), true);
    }
    function down(event) {
      if (event.target?.matches?.('input,textarea,select,button')) return;
      let changed = true;
      if (event.code === 'ArrowUp' || event.code === 'KeyW') keyRef.current.up = true;
      else if (event.code === 'ArrowDown' || event.code === 'KeyS') keyRef.current.down = true;
      else if (event.code === 'ArrowLeft' || event.code === 'KeyA') keyRef.current.left = true;
      else if (event.code === 'ArrowRight' || event.code === 'KeyD') keyRef.current.right = true;
      else changed = false;
      if (changed) { event.preventDefault(); updateFromKeys(); }
    }
    function up(event) {
      let changed = true;
      if (event.code === 'ArrowUp' || event.code === 'KeyW') keyRef.current.up = false;
      else if (event.code === 'ArrowDown' || event.code === 'KeyS') keyRef.current.down = false;
      else if (event.code === 'ArrowLeft' || event.code === 'KeyA') keyRef.current.left = false;
      else if (event.code === 'ArrowRight' || event.code === 'KeyD') keyRef.current.right = false;
      else changed = false;
      if (changed) { event.preventDefault(); updateFromKeys(); }
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [canSteer, me]);

  function findMatch() {
    setError('');
    motionRef.current = { a: motionPoint(), b: motionPoint(), ball: motionPoint() };
    headingRef.current = 0;
    setHeadingDeg(0);
    startMatch(playerName);
  }

  if (!state && !waiting) {
    return (
      <section className="ss-lobby">
        <div className="ss-lobby__icon">⚙️</div>
        <span className="eyebrow">2 игрока · реакция · рикошеты</span>
        <h1>Spike Survival</h1>
        <p>Оба игрока всё время бегут с одинаковой скоростью. Крути джойстик направления — персонаж сразу меняет курс. После подсказки появляется шипастый мяч и бесконечно рикошетит от стен, пока не заденет одного из вас.</p>
        <div className="ss-rules">
          <span>🕹️ направление меняется мгновенно</span>
          <span>⚙️ мяч быстрый и не исчезает</span>
          <span>💥 одно касание — поражение</span>
          <span>🏆 последний живой побеждает</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="ss-waiting">
        <div className="ss-waiting__ball">⚙️</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго игрока…</h2>
        <p>Как только соперник найдётся, вы сразу начнёте бегать.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;

  const myColor = me ? state.players?.[me]?.color : '#ff2769';
  const foeColor = foe ? state.players?.[foe]?.color : '#2f7df4';

  return (
    <section className="ss-shell">
      <header className="ss-hud">
        <div className="ss-player"><span style={{ background: myColor }} /><div><small>ТЫ</small><strong>{myName}</strong></div></div>
        <div className="ss-hud__center"><small>{state.phase === 'warning' ? 'СМОТРИ НАПРАВЛЕНИЕ' : state.phase === 'survival' ? 'УВОРАЧИВАЙСЯ!' : 'РАУНД ОКОНЧЕН'}</small><strong>SPIKE SURVIVAL</strong></div>
        <div className="ss-player ss-player--foe"><div><small>СОПЕРНИК</small><strong>{foeName}</strong></div><span style={{ background: foeColor }} /></div>
      </header>

      <div className="ss-stage">
        <svg viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} className="ss-arena" aria-label="Арена Spike Survival">
          <ArenaArt />
          {state.phase === 'warning' && <DirectionWarning angle={state.launchAngle || 0} />}
          <Runner seat="a" name={state.players?.a?.name || 'Игрок'} nodeRef={playerARef} />
          <Runner seat="b" name={state.players?.b?.name || 'Игрок'} nodeRef={playerBRef} />
          {state.ball && <SpikeBall nodeRef={ballRef} />}
        </svg>
      </div>

      <div className="ss-controls">
        <div className="ss-control-copy">
          <strong>{state.phase === 'warning' ? 'Мяч сейчас появится в центре' : 'Не останавливайся'}</strong>
          <span>{state.phase === 'warning' ? 'Стрелка заранее показывает первый полёт.' : 'Он будет рикошетить от стен бесконечно.'}</span>
        </div>
        <div
          ref={padRef}
          className={`ss-pad ${canSteer ? '' : 'is-disabled'}`}
          onPointerDown={onPadDown}
          onPointerMove={onPadMove}
          onPointerUp={onPadUp}
          onPointerCancel={onPadUp}
          onLostPointerCapture={onPadUp}
        >
          <div className="ss-pad__inner" />
          <div className="ss-pad__vector" style={{ transform: `rotate(${headingDeg}deg)`, '--ss-color': myColor }}>
            <i />
          </div>
          <div className="ss-pad__hub" style={{ background: myColor }} />
        </div>
        <div className="ss-control-copy ss-control-copy--right">
          <strong>Веди пальцем по кругу</strong>
          <span>Куда показывает стрелка — туда персонаж бежит сразу.</span>
        </div>
      </div>

      {result && (
        <div className="ss-result">
          <div className="ss-result__card">
            <span>SPIKE SURVIVAL</span>
            <div className="ss-result__icon">{result.title.includes('ВЫЖИЛ') ? '🏆' : '💥'}</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="ss-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Ещё раз</button>
              <button type="button" className="secondary-button" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
