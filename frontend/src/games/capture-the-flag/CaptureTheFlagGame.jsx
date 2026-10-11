import { memo, useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './capture-the-flag.css';

const W = 1000;
const H = 620;
const PALETTE = {
  grove: { grass: '#9cd789', dark: '#7bbb75', deep: '#619e61', path: '#d9c89e', block: '#6b8d62', cap: '#accf7e' },
  frost: { grass: '#c5e6ed', dark: '#a3d2db', deep: '#85b7cf', path: '#e3f4f4', block: '#69a1bd', cap: '#d3f1fd' },
  canyon: { grass: '#e9bd88', dark: '#dba46d', deep: '#bc854e', path: '#f8daaf', block: '#ad7047', cap: '#e9b176' },
};
const COLORS = { a: '#ff456e', b: '#238bff' };
const S = { a: '🍒', b: '💎' };

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}
function formatTime(ms) {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function pointMotion() { return { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, time: 0, ready: false }; }
function feedPoint(item, pos) {
  if (!pos) return;
  if (!item.ready || Math.hypot(item.x - pos.x, item.y - pos.y) > 250) {
    item.x = pos.x; item.y = pos.y; item.ready = true;
  }
  item.tx = pos.x; item.ty = pos.y;
  item.vx = pos.vx || 0; item.vy = pos.vy || 0;
  item.time = performance.now();
}
function useClock(serverTime) {
  const offsetRef = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (Number.isFinite(serverTime)) offsetRef.current = serverTime - Date.now();
  }, [serverTime]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return now + offsetRef.current;
}

const Landscape = memo(function Landscape({ map }) {
  const theme = PALETTE[map?.id] || PALETTE.grove;
  return (
    <>
      <defs>
        <pattern id="cf-texture" width="56" height="52" patternUnits="userSpaceOnUse">
          <path d="M10 22l-5-11m5 11 5-9m30 30-5-10m5 10 4-11" fill="none" stroke={theme.deep} strokeWidth="2" opacity=".22" strokeLinecap="round" />
          <circle cx="32" cy="12" r="2.6" fill="#ffffff" opacity=".23" />
        </pattern>
        <linearGradient id="cf-river" x1="0" y1="0" x2="1" y2="0"><stop stopColor={theme.dark} /><stop offset=".5" stopColor={theme.grass} /><stop offset="1" stopColor={theme.dark} /></linearGradient>
        <linearGradient id="cf-wall" x1="0" y1="0" x2="0" y2="1"><stop stopColor={theme.cap} /><stop offset=".3" stopColor={theme.block} /><stop offset="1" stopColor={theme.deep} /></linearGradient>
        <radialGradient id="cf-glow"><stop stopColor="#fff" stopOpacity=".55"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width={W} height={H} rx="26" fill={theme.grass} />
      <rect width={W} height={H} fill="url(#cf-texture)" opacity=".8" />
      <path d="M-20 270 C205 248 345 340 500 305 S795 260 1020 305" fill="none" stroke={theme.path} strokeWidth="133" opacity=".43" />
      <rect x="488" y="20" width="24" height="580" rx="12" fill="url(#cf-river)" opacity=".4" />
      <path d="M500 36V584" stroke="#ffffff" strokeWidth="3" strokeDasharray="7 15" opacity=".64" />
      {[{seat:'a',x:105,color:'#ff456e'},{seat:'b',x:895,color:'#238bff'}].map(({seat,x,color}) => (
        <g key={seat}>
          <circle cx={x} cy="310" r="122" fill={color} opacity=".10" />
          <circle cx={x} cy="310" r="88" fill="none" stroke={color} strokeWidth="5" strokeDasharray="10 10" opacity=".55" />
          <circle cx={x} cy="310" r="56" fill="url(#cf-glow)" />
          <circle cx={x} cy="310" r="32" fill={color} opacity=".16" />
          <text x={x} y="430" fill={color} textAnchor="middle" fontSize="18" fontWeight="1000" letterSpacing="3">{seat === 'a' ? 'КРАСНАЯ БАЗА' : 'СИНЯЯ БАЗА'}</text>
        </g>
      ))}
      {Array.from({ length: 24 }, (_, index) => {
        const x = 43 + (index * 137) % 925;
        const y = 43 + (index * 179) % 510;
        // Decorations only, no hitbox.
        return <g key={index} transform={`translate(${x} ${y})`} opacity=".65">
          {index % 4 === 0 ? <><circle r="11" fill={theme.deep} /><circle cx="-4" cy="-4" r="5" fill={theme.cap} /></> :
            <path d="M-5 4L0 -6L4 3 M0 5L9 -4" fill="none" stroke={theme.deep} strokeWidth="3" strokeLinecap="round"/>}
        </g>;
      })}
      {(map?.walls || []).map((wall, i) => <g key={i}>
        <rect x={wall.x + 5} y={wall.y + 10} width={wall.width} height={wall.height} rx="11" fill="#365032" opacity=".23" />
        <rect x={wall.x} y={wall.y} width={wall.width} height={wall.height} rx="10" fill="url(#cf-wall)" stroke={theme.deep} strokeWidth="5" />
        <path d={`M${wall.x + 7} ${wall.y + wall.height - 11}V${wall.y + 13}Q${wall.x + 7} ${wall.y + 8} ${wall.x + 15} ${wall.y + 8}H${wall.x + wall.width - 13}`} fill="none" stroke="#fff" strokeWidth="5" opacity=".26" strokeLinecap="round" />
        <path d={`M${wall.x + 14} ${wall.y + 20}l9 5m${Math.max(wall.x + 14, wall.x + wall.width - 27)} ${wall.y + wall.height - 22}l8 -6`} stroke={theme.deep} strokeWidth="3" opacity=".5" />
      </g>)}
      <rect width={W} height={H} rx="25" fill="none" stroke="#ffffff" strokeWidth="15" opacity=".55" />
      <rect x="13" y="13" width="974" height="594" rx="17" fill="none" stroke={theme.deep} strokeWidth="4" opacity=".30" />
    </>
  );
});

function Flag({ flag, seat, nodeRef }) {
  return <g ref={nodeRef} className={`cf-flag cf-flag--${seat}`}>
    <ellipse cx="5" cy="7" rx="30" ry="13" fill="#000" opacity=".15" />
    <circle r="22" fill={COLORS[seat]} opacity=".18" />
    <path d="M-2 9V-69" stroke="#533725" strokeWidth="8" strokeLinecap="round" />
    <path d="M2 -64Q31 -79 56 -59L48 -35Q24 -50 2 -37Z" fill={COLORS[seat]} stroke="#ffffff" strokeWidth="3" className="cf-banner" />
    <path d="M8 -58Q23 -64 38 -55" stroke="#fff" strokeWidth="4" fill="none" opacity=".52" />
    <circle cx="-2" cy="-73" r="7" fill="#ffdc63" stroke="#fff1bb" strokeWidth="2" />
    {flag?.mode === 'dropped' && <circle r="38" stroke="#ffef6a" strokeWidth="5" strokeDasharray="8 8" fill="none" className="cf-drop-ring" />}
  </g>;
}

function Player({ nodeRef, seat, info, mine, carried, now }) {
  if (!info) return null;
  const stunned = info.stunnedUntil > now;
  const direction = info.direction || (seat === 'a' ? 1 : -1);
  return <g ref={nodeRef} className={`cf-character cf-character--${seat} ${stunned ? 'is-stunned' : ''} ${mine ? 'is-me' : ''}`}>
    <ellipse cx="0" cy="27" rx="29" ry="9" fill="#21283a" opacity=".18" />
    <g className="cf-character__bounce">
      <path d="M-19 12L-27 27L-14 32L-3 16Z M12 13L5 29L18 31L24 15Z" fill="#30405c" stroke="#263047" strokeWidth="3" />
      <path d="M-15 -7Q-29 -12 -31 2L-21 22L-5 12Z" fill={COLORS[seat]} stroke="#fff" strokeWidth="3" opacity=".85" />
      <g transform={`scale(${direction} 1)`}>
        <path d="M-9 -19Q-35 -21 -31 1L-12 11Z" fill={seat === 'a' ? '#b72350' : '#1365b4'} />
        <path d="M-25 -9Q-6 -28 19 -11L21 16Q-2 30 -23 15Z" fill={COLORS[seat]} stroke="#fff" strokeWidth="4" />
        <circle cx="1" cy="-16" r="22" fill="#ffe1b3" stroke="#ffffff" strokeWidth="4" />
        <path d="M-20 -24Q-14 -51 10 -43Q30 -39 25 -24L19 -24Q15 -37 -12 -28Z" fill={seat === 'a' ? '#b71c46' : '#0861c9'} stroke="#fff" strokeWidth="3" />
        <path d="M-10 -8Q0 -1 11 -9" fill="none" stroke="#b77855" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="-17" r="4" fill="#273b4b" />
        <circle cx="9" cy="-18.5" r="1.5" fill="#fff" />
        <path d="M16 6L31 2L32 14L22 19Z" fill="#fff1d5" stroke="#785e52" strokeWidth="2" />
      </g>
      {carried && <g transform="translate(0 -39)"><path d="M0 0L-14 -15M0 0L14 -15" stroke="#fff1ac" strokeWidth="4" strokeLinecap="round"/><circle r="7" fill="#ffd848" /></g>}
      {stunned && <g className="cf-snowflakes" fill="#dcfaff" fontSize="20" fontWeight="1000"><text x="-37" y="-37">❄</text><text x="18" y="-48">❄</text></g>}
    </g>
    <g transform="translate(0 53)">
      <rect x="-53" y="-11" width="106" height="21" rx="10" fill="#192c42" opacity=".85" />
      <text textAnchor="middle" y="4" fontSize="12" fontWeight="900" fill="#fff">{info.name?.slice(0, 15)}</text>
    </g>
  </g>;
}

function ScorePlate({ seat, name, score, active }) {
  return <div className={`cf-team ${seat === 'b' ? 'cf-team--right' : ''}`}>
    <span className="cf-team__orb" style={{ background: COLORS[seat] }}>{S[seat]}</span>
    <div className="cf-team__name"><small>{active ? 'ТЫ' : 'СОПЕРНИК'}</small><strong title={name}>{name}</strong></div>
    <strong className="cf-team__score">{score}</strong>
  </div>;
}

export default function CaptureTheFlagGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const { waiting, state, error, setError, findMatch: startMatch, cancelSearch, sendAction } = useMultiplayerGame('capture-the-flag');
  const now = useClock(state?.serverTime);
  const stateRef = useRef(null);
  const actionRef = useRef(null);
  const nodesRef = useRef({ a: null, b: null, flags: { a: null, b: null } });
  const motionRef = useRef({ a: pointMotion(), b: pointMotion() });
  const stickRef = useRef(null);
  const pointerRef = useRef(null);
  const keysRef = useRef(new Set());
  const inputRef = useRef({ x: 0, y: 0, last: 0 });
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [soundOn, setSoundOn] = useState(true);
  const audioRef = useRef(null);
  const prevEventRef = useRef(null);
  const me = state?.playerSeat;
  const enemy = state?.opponentSeat;
  const canPlay = state?.status === 'playing' && state?.phase === 'active';
  const isFinished = state?.status === 'finished';
  const freezeLeft = me ? Math.max(0, (state?.players?.[me]?.nextTagAt || 0) - now) : 0;
  const stunned = me ? (state?.players?.[me]?.stunnedUntil || 0) > now : false;
  const countdown = state?.phase === 'countdown' ? Math.max(1, Math.ceil((state.readyAt - now) / 1000)) : 0;
  const canFreeze = canPlay && !stunned && freezeLeft === 0;
  const myName = state?.players?.[me]?.name || playerName;
  const enemyName = state?.players?.[enemy]?.name || 'Противник';
  stateRef.current = state;
  actionRef.current = sendAction;

  useEffect(() => {
    if (!state?.players) return;
    for (const seat of ['a', 'b']) feedPoint(motionRef.current[seat], state.players[seat]);
  }, [state?.players]);

  useEffect(() => {
    let raf;
    function animate(stamp) {
      for (const seat of ['a', 'b']) {
        const p = motionRef.current[seat];
        if (!p.ready) continue;
        const age = Math.min(75, Math.max(0, stamp - p.time)) / 1000;
        const alpha = .31;
        p.x += ((p.tx + p.vx * age) - p.x) * alpha;
        p.y += ((p.ty + p.vy * age) - p.y) * alpha;
        const character = nodesRef.current[seat];
        if (character) character.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
        const flagNode = nodesRef.current.flags[seat];
        const flag = stateRef.current?.flags?.[seat];
        if (flagNode && flag) {
          const holder = flag.carrier ? motionRef.current[flag.carrier] : null;
          const fx = holder?.ready ? holder.x : flag.x;
          const fy = holder?.ready ? holder.y - 27 : flag.y;
          flagNode.setAttribute('transform', `translate(${fx.toFixed(2)} ${fy.toFixed(2)})`);
        }
      }
      raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!state?.event || state.event.id === prevEventRef.current || !state.roomId) return;
    prevEventRef.current = state.event.id;
    if (!soundOn || state.event.kind === 'start') return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = audioRef.current || new AudioContextClass();
      audioRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const node = ctx.createOscillator();
      const gain = ctx.createGain();
      node.type = 'sine';
      const hz = state.event.kind === 'score' ? 660 : state.event.kind === 'freeze' ? 250 : 480;
      node.frequency.setValueAtTime(hz, ctx.currentTime);
      node.frequency.exponentialRampToValueAtTime(Math.max(100, hz * 1.4), ctx.currentTime + .18);
      gain.gain.setValueAtTime(.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .23);
      node.connect(gain); gain.connect(ctx.destination);
      node.start(); node.stop(ctx.currentTime + .24);
    } catch { /* Audio is optional on restricted mobile browsers. */ }
  }, [state?.event, state?.roomId, soundOn]);
  useEffect(() => () => { if (audioRef.current) void audioRef.current.close().catch(() => {}); }, []);

  function sendVector(x, y, force = false) {
    const input = inputRef.current;
    const time = performance.now();
    const len = Math.hypot(x, y);
    const nx = len > 1 ? x / len : x;
    const ny = len > 1 ? y / len : y;
    if (!force && time - input.last < 55 && input.x === nx && input.y === ny) return;
    input.x = nx; input.y = ny; input.last = time;
    if (stateRef.current?.phase === 'active') actionRef.current?.({ type: 'move', x: nx, y: ny });
  }
  function keyVector() {
    const keys = keysRef.current;
    let x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    let y = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }
  useEffect(() => {
    const moveCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const down = (e) => {
      if (e.target?.closest?.('input, textarea, select')) return;
      if (moveCodes.has(e.code)) {
        e.preventDefault(); keysRef.current.add(e.code);
        const v = keyVector(); if (pointerRef.current === null) sendVector(v.x, v.y, true);
      } else if ((e.code === 'Space' || e.code === 'KeyF') && !e.repeat) {
        e.preventDefault();
        if (stateRef.current?.phase === 'active') actionRef.current?.({ type: 'freeze' });
      }
    };
    const up = (e) => {
      if (!moveCodes.has(e.code)) return;
      e.preventDefault(); keysRef.current.delete(e.code);
      const v = keyVector(); if (pointerRef.current === null) sendVector(v.x, v.y, true);
    };
    const blur = () => { keysRef.current.clear(); sendVector(0, 0, true); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  useEffect(() => {
    if (!canPlay) { sendVector(0, 0, true); return undefined; }
    const timer = setInterval(() => {
      if (pointerRef.current === null) {
        const v = keyVector(); sendVector(v.x, v.y, true);
      } else sendVector(inputRef.current.x, inputRef.current.y, true);
    }, 90);
    return () => clearInterval(timer);
  }, [canPlay]);

  function setJoystick(e) {
    const box = stickRef.current?.getBoundingClientRect();
    if (!box) return;
    let x = (e.clientX - box.left - box.width / 2) / (box.width * .36);
    let y = (e.clientY - box.top - box.height / 2) / (box.height * .36);
    const n = Math.hypot(x, y);
    if (n > 1) { x /= n; y /= n; }
    setStick({ x, y });
    sendVector(x, y, true);
  }
  function padDown(e) {
    if (!canPlay) return;
    e.preventDefault();
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setJoystick(e);
  }
  function padMove(e) {
    if (pointerRef.current !== e.pointerId) return;
    e.preventDefault(); setJoystick(e);
  }
  function padUp(e) {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    setStick({ x: 0, y: 0 });
    const keys = keyVector(); sendVector(keys.x, keys.y, true);
  }
  function rematch() {
    prevEventRef.current = null;
    motionRef.current = { a: pointMotion(), b: pointMotion() };
    pointerRef.current = null; keysRef.current.clear();
    inputRef.current = { x: 0, y: 0, last: 0 };
    setStick({ x: 0, y: 0 });
    setError(''); startMatch(playerName);
  }
  function freeze() {
    if (canFreeze) actionRef.current?.({ type: 'freeze' });
  }

  if (!state && !waiting) return <section className="cf-lobby">
    <div className="cf-lobby__art"><span>🚩</span><span>🏰</span><span>🚩</span></div>
    <span className="cf-eyebrow">CODUMI GAMES · 2 ИГРОКА ОНЛАЙН</span>
    <h1>УКРАДИ <em>ФЛАГ</em></h1>
    <p>Две крепости. Один флаг у каждой. Проберись на чужую базу, схвати флаг и доставь его к своему — не дай сопернику заморозить тебя по дороге!</p>
    <div className="cf-rules"><span>🏁 Первым до 3 очков</span><span>⏱️ Матч 3 минуты</span><span>❄️ Заморозка на 1,75 с</span><span>🗺️ 3 разные карты</span></div>
    <div className="cf-lobby__hint">🕹️ Телефон: джойстик + кнопка ❄️ · Компьютер: WASD / стрелки + пробел</div>
    {error && <div className="game-error">{error}</div>}
    <div className="cf-lobby__actions"><button type="button" className="primary-button primary-button--large" onClick={rematch}>Найти соперника</button><button type="button" className="secondary-button" onClick={onBack}>Все игры</button></div>
  </section>;

  if (waiting) return <section className="cf-lobby cf-waiting">
    <div className="cf-lobby__art cf-waiting__pulse">🏰</div>
    <span className="cf-eyebrow">ПОИСК СОПЕРНИКА</span><h2>Готовим крепости...</h2>
    <p>Ищем второго игрока. Как только соперник подключится, начнётся отсчёт 3, 2, 1!</p>
    <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
  </section>;
  if (!state) return null;

  const mine = state.scores?.[me] || 0;
  const theirs = state.scores?.[enemy] || 0;
  const myFlag = state.flags?.[me];
  const hostileFlag = state.flags?.[enemy];
  const carrying = hostileFlag?.carrier === me;
  const enemyCarrying = myFlag?.carrier === enemy;
  const recentEvent = state.event && now - state.event.at < 2000 ? state.event : null;
  const outcome = isFinished ? (state.result?.type === 'draw' ? 'НИЧЬЯ!' : state.result?.winner === me ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ') : '';
  return <section className="cf-shell">
    <div className="cf-top">
      <ScorePlate seat={me || 'a'} name={myName} score={mine} active />
      <div className="cf-top__center"><small>{state.map?.title}</small><strong>{formatTime(state.endsAt - now)}</strong><span>ДО {state.targetScore} ФЛАГОВ</span></div>
      <ScorePlate seat={enemy || 'b'} name={enemyName} score={theirs} />
    </div>
    <div className="cf-stage">
      <svg className="cf-arena" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Поле игры укради флаг">
        <Landscape map={state.map} />
        {['a','b'].map((seat) => <Flag key={seat} seat={seat} flag={state.flags[seat]} nodeRef={(el) => { nodesRef.current.flags[seat] = el; }} />)}
        {['a','b'].map((seat) => <Player key={seat} nodeRef={(el) => { nodesRef.current[seat] = el; }} seat={seat} info={state.players[seat]} mine={me === seat} carried={state.flags?.[seat === 'a' ? 'b' : 'a']?.carrier === seat} now={now} />)}
      </svg>
      <div className="cf-stage__title">{carrying ? '🚩 НЕСИ ФЛАГ ДОМОЙ!' : enemyCarrying ? '🚨 ТВОЙ ФЛАГ УКРАЛИ!' : stunned ? '❄️ ТЕБЯ ЗАМОРОЗИЛИ!' : '⚔️ ЗАХВАТИ ФЛАГ СОПЕРНИКА'}</div>
      {recentEvent && recentEvent.kind !== 'start' && recentEvent.kind !== 'go' && <div key={recentEvent.id} className={`cf-toast cf-toast--${recentEvent.kind}`}>{recentEvent.message}</div>}
      {state.phase === 'countdown' && <div className="cf-countdown"><small>ПРИГОТОВЬСЯ!</small><strong key={countdown}>{countdown}</strong><span>Захвати флаг и возвращайся!</span></div>}
      {isFinished && <div className="cf-result"><div className="cf-result__card">
        <span className="cf-eyebrow">МАТЧ ОКОНЧЕН</span><div className="cf-result__emoji">{state.result?.type === 'draw' ? '🤝' : state.result?.winner === me ? '🏆' : '🏳️'}</div>
        <h2>{outcome}</h2><p>{state.result?.message}</p>
        <div className="cf-result__score"><b>{mine}</b><span>:</span><b>{theirs}</b></div>
        <div className="cf-result__buttons"><button type="button" className="primary-button" onClick={rematch}>Играть ещё</button><button type="button" className="secondary-button" onClick={onBack}>Все игры</button></div>
      </div></div>}
    </div>
    <div className="cf-panel">
      <div className="cf-panel__tip"><strong>{carrying ? '🏃 БЕГИ НА СВОЮ БАЗУ!' : myFlag?.mode !== 'home' ? '🛡️ Верни свой флаг!' : '🚩 Укради флаг!'}</strong><span>Подойди к чужому флагу, затем вернись к своему. Для очка твой флаг должен быть дома.</span></div>
      <div className={`cf-joystick ${!canPlay || stunned ? 'is-disabled' : ''}`} ref={stickRef}
        onPointerDown={padDown} onPointerMove={padMove} onPointerUp={padUp} onPointerCancel={padUp} onLostPointerCapture={padUp}>
        <div className="cf-joystick__rings" /><span className="cf-joystick__arrows">✦</span>
        <div className="cf-joystick__knob" style={{ transform: `translate(${stick.x * 29}px, ${stick.y * 29}px)` }}><span>✥</span></div>
      </div>
      <button type="button" className={`cf-freeze ${canFreeze ? 'is-ready' : ''}`} disabled={!canFreeze} onClick={freeze}>
        <span className="cf-freeze__icon">❄️</span><strong>{stunned ? 'ЗАМОРОЖЕН' : freezeLeft ? formatTime(freezeLeft) : 'ЗАМОРОЗИТЬ'}</strong><small>{freezeLeft ? 'перезарядка' : 'в радиусе атаки'}</small>
      </button>
      <button type="button" className="cf-sound" aria-label={soundOn ? 'Выключить звуки' : 'Включить звуки'} onClick={() => setSoundOn((v) => !v)}>{soundOn ? '🔊' : '🔇'}</button>
    </div>
    <div className="cf-footer"><span>⌨️ WASD / стрелки — движение · Пробел / F — заморозка</span><button type="button" onClick={() => actionRef.current?.({type:'resign'})}>Сдаться</button></div>
  </section>;
}
