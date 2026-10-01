import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './tower-stack-duel.css';

const WORLD_W = 1200;
const WORLD_H = 720;


const CLIENT_LANES = {
  a: { minX: 105, maxX: 545 },
  b: { minX: 655, maxX: 1095 },
};

function advanceBouncedX(x, vx, dt, minX, maxX) {
  let nextX = x + vx * dt;
  let nextVx = vx;

  // A frame is clamped to a small delta, so this normally runs once at most.
  // The loop also makes recovery robust after a temporarily suspended tab.
  for (let i = 0; i < 4 && (nextX < minX || nextX > maxX); i += 1) {
    if (nextX < minX) {
      nextX = minX + (minX - nextX);
      nextVx = Math.abs(nextVx);
    }
    if (nextX > maxX) {
      nextX = maxX - (nextX - maxX);
      nextVx = -Math.abs(nextVx);
    }
  }

  return { x: Math.max(minX, Math.min(maxX, nextX)), vx: nextVx };
}

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;

  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function formatTime(ms) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || '',
  };
}

const StaticArena = memo(function StaticArena() {
  return (
    <>
      <defs>
        <linearGradient id="tsd-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9fbff" />
          <stop offset="45%" stopColor="#ccecf2" />
          <stop offset="100%" stopColor="#b6dee7" />
        </linearGradient>
        <linearGradient id="tsd-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8806e" />
          <stop offset="100%" stopColor="#8d493f" />
        </linearGradient>
        <linearGradient id="tsd-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a65d51" />
          <stop offset="100%" stopColor="#774039" />
        </linearGradient>
        <pattern id="tsd-wave" width="90" height="38" patternUnits="userSpaceOnUse">
          <path d="M0 20 Q22 0 45 20 T90 20" fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.48" />
        </pattern>
        <pattern id="tsd-flower-pattern" width="150" height="110" patternUnits="userSpaceOnUse">
          <g opacity="0.65" fill="none" stroke="#fff" strokeWidth="3">
            <circle cx="42" cy="42" r="6" fill="#fff" />
            <path d="M42 18 C30 18 27 32 37 38 C27 34 20 46 30 53 C20 53 18 67 31 67 C23 76 34 87 43 77 C49 89 63 82 58 69 C71 74 79 61 68 53 C80 47 72 34 59 38 C65 26 55 18 42 18Z" />
          </g>
        </pattern>
      </defs>

      <rect x="0" y="-110" width={WORLD_W} height="830" fill="url(#tsd-bg)" />
      <rect x="0" y="-110" width={WORLD_W} height="830" fill="url(#tsd-wave)" opacity="0.55" />
      <rect x="0" y="30" width={WORLD_W} height="600" fill="url(#tsd-flower-pattern)" opacity="0.45" />

      <rect x="0" y="-110" width="72" height="830" fill="url(#tsd-side)" />
      <rect x="1128" y="-110" width="72" height="830" fill="url(#tsd-side)" />
      <rect x="590" y="-110" width="20" height="830" fill="#ffffff" opacity="0.14" />

      <g className="tsd-lanterns">
        <rect x="105" y="-72" width="62" height="88" rx="19" />
        <rect x="1033" y="-72" width="62" height="88" rx="19" />
        <circle cx="136" cy="-27" r="10" />
        <circle cx="1064" cy="-27" r="10" />
        <path d="M136 16 v36 M1064 16 v36" />
      </g>

      <line x1="78" y1="92" x2="1122" y2="92" className="tsd-goal-line" />
      <rect x="526" y="62" width="148" height="54" rx="17" className="tsd-goal-tag" />
      <text x="600" y="98" textAnchor="middle" className="tsd-goal-text">ЦЕЛЬ</text>

      <g className="tsd-goal-sparks" opacity="0.7">
        <circle cx="470" cy="92" r="6" />
        <circle cx="730" cy="92" r="6" />
        <path d="M448 92 h-30 M752 92 h30" />
      </g>

      <rect x="185" y="650" width="280" height="70" rx="18" fill="url(#tsd-base)" stroke="#6f342e" strokeWidth="8" />
      <rect x="735" y="650" width="280" height="70" rx="18" fill="url(#tsd-base)" stroke="#6f342e" strokeWidth="8" />
      <rect x="210" y="645" width="230" height="16" rx="8" fill="#f2c8ad" opacity="0.62" />
      <rect x="760" y="645" width="230" height="16" rx="8" fill="#f2c8ad" opacity="0.62" />

      <g className="tsd-petals" opacity="0.62">
        <ellipse cx="245" cy="210" rx="12" ry="5" transform="rotate(-28 245 210)" />
        <ellipse cx="320" cy="330" rx="10" ry="4" transform="rotate(22 320 330)" />
        <ellipse cx="900" cy="260" rx="12" ry="5" transform="rotate(25 900 260)" />
        <ellipse cx="1010" cy="390" rx="10" ry="4" transform="rotate(-18 1010 390)" />
      </g>
    </>
  );
});

function blockPalette(owner, kind) {
  if (owner === 'a') {
    if (kind === 'small') return { body: '#ffb12a', rim: '#dd7514', cap: '#ffcf53' };
    if (kind === 'large') return { body: '#ef3044', rim: '#b9182d', cap: '#ff6370' };
    return { body: '#ff6655', rim: '#ce3429', cap: '#ff8e73' };
  }

  if (kind === 'small') return { body: '#2ac0ff', rim: '#0875ae', cap: '#5ed2ff' };
  if (kind === 'large') return { body: '#2687f4', rim: '#0b4fa3', cap: '#4ea1ff' };
  return { body: '#38a0ff', rim: '#1769be', cap: '#6fc0ff' };
}

function TowerBlockBody({ block, wobble = false }) {
  const palette = blockPalette(block.owner, block.kind);
  const halfW = block.width / 2;
  const halfH = block.height / 2;
  const faceY = 2;

  return (
    <g className={wobble ? 'tsd-block-inner is-wobbling' : 'tsd-block-inner'}>
      <rect
        x={-halfW}
        y={-halfH}
        width={block.width}
        height={block.height}
        rx="10"
        fill={palette.body}
        stroke={palette.rim}
        strokeWidth="5"
      />
      <rect
        x={-halfW + 7}
        y={-halfH + 4}
        width={Math.max(10, block.width - 14)}
        height="8"
        rx="4"
        fill={palette.cap}
        opacity="0.9"
      />
      <circle cx="-11" cy={faceY} r="2.8" fill="#40241d" />
      <circle cx="11" cy={faceY} r="2.8" fill="#40241d" />
      <path d="M-5 8 Q0 13 5 8" fill="none" stroke="#40241d" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

const TowerBlock = memo(function TowerBlock({ block, mirrored, wobble = false }) {
  const x = mirrored ? WORLD_W - block.x : block.x;
  const angle = mirrored ? -block.angle : block.angle;

  return (
    <g transform={`translate(${x} ${block.y}) rotate(${angle * 180 / Math.PI})`}>
      <TowerBlockBody block={block} wobble={wobble} />
    </g>
  );
}, (prev, next) => (
  prev.mirrored === next.mirrored &&
  prev.wobble === next.wobble &&
  prev.block.id === next.block.id &&
  prev.block.x === next.block.x &&
  prev.block.y === next.block.y &&
  prev.block.angle === next.block.angle &&
  prev.block.status === next.block.status &&
  prev.block.width === next.block.width &&
  prev.block.kind === next.block.kind
));

const SmoothMovingBlock = memo(function SmoothMovingBlock({ block, mirrored }) {
  const groupRef = useRef(null);
  const latestBlockRef = useRef(block);
  const motionRef = useRef({ id: block.id, x: block.x, vx: block.vx || 0 });
  latestBlockRef.current = block;

  const lane = CLIENT_LANES[block.owner] || CLIENT_LANES.a;
  const half = block.width / 2;
  const minX = lane.minX + half + 8;
  const maxX = lane.maxX - half - 8;

  useLayoutEffect(() => {
    const motion = motionRef.current;

    if (motion.id !== block.id) {
      motion.id = block.id;
      motion.x = block.x;
      motion.vx = block.vx || 0;
    } else {
      // Keep the client predictor gently tethered to the authoritative server
      // without snapping backward every time a 16 Hz network snapshot arrives.
      const error = block.x - motion.x;
      if (Math.abs(error) > 28) motion.x = block.x;
      else if (Math.abs(error) > 4) motion.x += error * 0.18;
      motion.vx = block.vx || motion.vx;
    }

    const visualX = mirrored ? WORLD_W - motion.x : motion.x;
    groupRef.current?.setAttribute('transform', `translate(${visualX} ${block.y}) rotate(0)`);
  }, [block.id, block.x, block.vx, block.y, mirrored]);

  useEffect(() => {
    let rafId = 0;
    let lastAt = performance.now();

    const animate = (at) => {
      const dt = Math.min(0.05, Math.max(0, (at - lastAt) / 1000));
      lastAt = at;

      const currentBlock = latestBlockRef.current;
      const motion = motionRef.current;

      if (currentBlock.status === 'moving') {
        const advanced = advanceBouncedX(motion.x, motion.vx, dt, minX, maxX);
        motion.x = advanced.x;
        motion.vx = advanced.vx;

        const visualX = mirrored ? WORLD_W - motion.x : motion.x;
        groupRef.current?.setAttribute(
          'transform',
          `translate(${visualX.toFixed(2)} ${currentBlock.y}) rotate(0)`,
        );
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [block.id, maxX, minX, mirrored]);

  return (
    <g ref={groupRef} className="tsd-moving-block">
      <TowerBlockBody block={block} />
    </g>
  );
}, (prev, next) => (
  prev.mirrored === next.mirrored &&
  prev.block.id === next.block.id &&
  prev.block.x === next.block.x &&
  prev.block.vx === next.block.vx &&
  prev.block.y === next.block.y &&
  prev.block.status === next.block.status &&
  prev.block.width === next.block.width &&
  prev.block.kind === next.block.kind
));

function ScoreFlower({ active }) {
  return <span className={active ? 'tsd-flower is-on' : 'tsd-flower'}>✿</span>;
}

export default function TowerStackDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [now, setNow] = useState(Date.now());
  const [dropFlash, setDropFlash] = useState(false);
  const canDropRef = useRef(false);
  const sendActionRef = useRef(null);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('tower-stack-duel');

  const result = resultPresentation(state);
  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mirrored = me === 'b';
  const canDrop = state?.status === 'playing' && state?.phase === 'playing' && state?.lanes?.[me]?.current?.status === 'moving';
  canDropRef.current = canDrop;
  sendActionRef.current = sendAction;

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [state?.status]);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target?.matches?.('input, textarea, button, select')) return;
      event.preventDefault();
      triggerDrop();
    }

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);

  const allBlocks = useMemo(() => {
    if (!state?.lanes) return [];
    const list = [];

    for (const seat of ['a', 'b']) {
      const lane = state.lanes[seat];
      const settled = lane.blocks || [];
      const lastSettledId = settled.length ? settled[settled.length - 1].id : null;

      for (const block of settled) {
        list.push({ block, wobble: lane.wobbling && block.id === lastSettledId });
      }
      for (const block of lane.debris || []) list.push({ block, wobble: false });
      if (lane.current) list.push({ block: lane.current, wobble: false });
    }

    return list;
  }, [state?.lanes]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function triggerDrop() {
    if (!canDropRef.current) return;
    sendActionRef.current?.({ type: 'drop' });
    setDropFlash(true);
    setTimeout(() => setDropFlash(false), 110);
    navigator.vibrate?.(12);
  }

  if (!state && !waiting) {
    return (
      <section className="tsd-lobby">
        <div className="tsd-lobby__icon">🏯</div>
        <span className="eyebrow">2 игрока · физика башни · до 2 побед</span>
        <h1>Башня на скорость</h1>
        <p>
          Блок ездит над башней. Нажми — он падает. Есть короткие, средние и длинные блоки.
          Чем хуже центр тяжести, тем сильнее башня шатается и тем больше шанс, что верхние блоки свалятся.
        </p>
        <div className="tsd-rules">
          <span>⏱ 90 секунд на раунд</span>
          <span>🎯 первым до линии — победа сразу</span>
          <span>🏆 матч до 2 побед</span>
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
      <section className="tsd-waiting">
        <div className="tsd-waiting__stack">▰<br />▰▰<br />▰▰▰</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем соперника…</h2>
        <p>У обоих башни начнут строиться одновременно.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;

  const myWins = me ? state.roundWins?.[me] ?? 0 : 0;
  const foeWins = foe ? state.roundWins?.[foe] ?? 0 : 0;
  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';
  const myHeight = me ? Math.round(state.lanes?.[me]?.height || 0) : 0;
  const foeHeight = foe ? Math.round(state.lanes?.[foe]?.height || 0) : 0;

  const timeLeft = state.phase === 'countdown'
    ? Math.max(0, state.countdownEndsAt - now)
    : Math.max(0, (state.roundEndsAt || now) - now);

  return (
    <section className="tsd-shell">
      <header className="tsd-scorebar">
        <div className="tsd-player">
          <strong>{myName}</strong>
          <div className="tsd-round-score">
            <ScoreFlower active={myWins >= 1} />
            <ScoreFlower active={myWins >= 2} />
          </div>
        </div>

        <div className="tsd-clock">
          <small>РАУНД {state.roundNumber}</small>
          <strong>{state.phase === 'countdown' ? Math.max(1, Math.ceil(timeLeft / 600)) : formatTime(timeLeft)}</strong>
        </div>

        <div className="tsd-player tsd-player--right">
          <strong>{foeName}</strong>
          <div className="tsd-round-score">
            <ScoreFlower active={foeWins >= 1} />
            <ScoreFlower active={foeWins >= 2} />
          </div>
        </div>
      </header>

      <div className="tsd-arena">
        <svg viewBox="0 -110 1200 830" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <StaticArena />

          <g className="tsd-height-labels">
            <text x="320" y="128" textAnchor="middle">{mirrored ? foeHeight : myHeight}px</text>
            <text x="880" y="128" textAnchor="middle">{mirrored ? myHeight : foeHeight}px</text>
          </g>

          {allBlocks.map(({ block, wobble }) => (
            block.status === 'moving'
              ? <SmoothMovingBlock key={block.id} block={block} mirrored={mirrored} />
              : <TowerBlock key={block.id} block={block} mirrored={mirrored} wobble={wobble} />
          ))}
        </svg>

        {state.phase === 'countdown' && (
          <div className="tsd-overlay">
            <span>РАУНД {state.roundNumber}</span>
            <strong>{Math.max(1, Math.ceil(timeLeft / 600))}</strong>
            <small>строй выше и не завали башню</small>
          </div>
        )}

        {state.phase === 'round-over' && (
          <div className="tsd-overlay tsd-overlay--round">
            <span>РАУНД ЗАВЕРШЁН</span>
            <strong>{state.roundMessage}</strong>
            <small>{state.roundWins.a}:{state.roundWins.b}</small>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`tsd-drop ${dropFlash ? 'is-flash' : ''}`}
        disabled={!canDrop}
        onPointerDown={(event) => {
          event.preventDefault();
          triggerDrop();
        }}
      >
        <span>👇</span>
        <b>{canDrop ? 'ПОСТАВИТЬ БЛОК' : 'ЖДИ БЛОК…'}</b>
      </button>

      <p className="tsd-tip">
        Маленький, средний и большой блок выпадают с одинаковым шансом. Ставь точно — верх башни может сорваться, если центр тяжести уйдёт в сторону.
      </p>

      {result && (
        <div className="tsd-result">
          <div className="tsd-result__card">
            <span>Башня на скорость</span>
            <div className="tsd-result__icon">🏯</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="tsd-result__score">
              <strong>{myWins}</strong><span>:</span><strong>{foeWins}</strong>
            </div>
            <div className="tsd-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Новый соперник</button>
              <button type="button" className="secondary-button" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
