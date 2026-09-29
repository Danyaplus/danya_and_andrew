import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './tron-light-cycles.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const winner = state.result?.winner ?? null;
  const isDraw = winner === null;
  const didWin = !isDraw && winner === state.playerSide;

  let text = state.result?.message || 'Матч завершён.';
  if (state.result?.type === 'disconnect') {
    text = didWin ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  } else if (state.result?.type === 'resign') {
    text = didWin ? 'Соперник вышел из гонки.' : 'Вы покинули гонку.';
  }

  return {
    kind: isDraw ? 'draw' : didWin ? 'win' : 'lose',
    icon: isDraw ? '⏱' : didWin ? '🏆' : '💥',
    title: isDraw ? 'Ничья' : didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}

function formatMatchTime(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function phaseText(state) {
  if (!state) return '';
  if (state.phase === 'countdown') return 'Приготовься';
  if (state.phase === 'roundOver') return state.roundMessage || 'Раунд завершён';
  if (state.phase === 'playing') return 'Красный след опасен, пока не исчез';
  return 'Матч завершён';
}

function countdownNumber(milliseconds) {
  if (milliseconds <= 0) return 'GO';
  return Math.max(1, Math.ceil(milliseconds / 1000));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function vectorFor(dir) {
  return [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ][dir] || [1, 0];
}

function trailOpacity(createdAt, now, lifetime) {
  const fade = 1600;
  const age = now - createdAt;
  if (age >= lifetime) return 0;
  if (age <= lifetime - fade) return 1;
  return clamp((lifetime - age) / fade, 0, 1);
}

function drawGrid(ctx, width, height) {
  ctx.fillStyle = '#070d16';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(109,180,224,.085)';
  ctx.lineWidth = .34;
  for (let x = 10; x < width; x += 10) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 10; y < height; y += 10) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(2, height / 2); ctx.lineTo(width - 2, height / 2); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(159,224,255,.34)';
  ctx.lineWidth = .7;
  ctx.strokeRect(1.2, 1.2, width - 2.4, height - 2.4);
}

function drawTrail(ctx, segments, serverNow, lifetime) {
  ctx.lineCap = 'round';
  for (const segment of segments || []) {
    const opacity = trailOpacity(segment.createdAt ?? serverNow, serverNow, lifetime);
    if (opacity <= 0) continue;

    ctx.strokeStyle = `rgba(255,0,31,${0.34 * opacity})`;
    ctx.lineWidth = 5.4;
    ctx.beginPath(); ctx.moveTo(segment.x1, segment.y1); ctx.lineTo(segment.x2, segment.y2); ctx.stroke();

    ctx.strokeStyle = `rgba(255,41,72,${0.98 * opacity})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255,0,31,.95)';
    ctx.shadowBlur = 4.8;
    ctx.beginPath(); ctx.moveTo(segment.x1, segment.y1); ctx.lineTo(segment.x2, segment.y2); ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawCycle(ctx, x, y, dir, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir * Math.PI / 2);

  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = .3;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, 0, 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 4;

  ctx.fillStyle = '#f7fbff';
  ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.lineWidth = .25;
  ctx.beginPath();
  ctx.roundRect?.(-1.35, -1.15, 2.9, 2.3, .65);
  if (ctx.roundRect) { ctx.fill(); ctx.stroke(); }
  else { ctx.fillRect(-1.35, -1.15, 2.9, 2.3); }

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(.6, -1.35); ctx.lineTo(.6, 1.35); ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#0a0e14';
  ctx.strokeStyle = color;
  ctx.lineWidth = .4;
  for (const wheelY of [-1.45, 1.45]) {
    ctx.beginPath(); ctx.arc(-.6, wheelY, .55, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawCrash(ctx, crash) {
  if (!crash) return;
  ctx.save();
  ctx.translate(crash.x, crash.y);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = .7;
  ctx.beginPath(); ctx.arc(0, 0, 2.3, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = .55;
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4;
    ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5); ctx.lineTo(Math.cos(angle) * 7, Math.sin(angle) * 7); ctx.stroke();
  }
  ctx.restore();
}

export default function TronLightCyclesGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const viewRef = useRef({ a: null, b: null });
  const serverOffsetRef = useRef(0);
  const ownDirOverrideRef = useRef(null);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('tron-light-cycles');

  function findMatch() {
    setError('');
    viewRef.current = { a: null, b: null };
    ownDirOverrideRef.current = null;
    startMatch(playerName);
  }

  function turn(direction) {
    const latest = stateRef.current;
    if (!latest || latest.status !== 'playing' || latest.phase !== 'playing') return;

    const side = latest.playerSide;
    const currentDir = ownDirOverrideRef.current?.until > performance.now()
      ? ownDirOverrideRef.current.dir
      : latest.players?.[side]?.cycle?.dir;
    if (Number.isInteger(currentDir)) {
      ownDirOverrideRef.current = {
        dir: direction === 'right' ? (currentDir + 1) % 4 : (currentDir + 3) % 4,
        until: performance.now() + 230,
      };
    }
    sendAction({ type: 'turn', payload: { direction } });
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  useEffect(() => {
    stateRef.current = state;
    if (!state) return;
    if (Number.isFinite(state.serverNow)) serverOffsetRef.current = Date.now() - state.serverNow;

    if (state.phase !== 'playing') {
      for (const side of ['a', 'b']) {
        const cycle = state.players?.[side]?.cycle;
        if (cycle) viewRef.current[side] = { x: cycle.x, y: cycle.y };
      }
    }
  }, [state]);

  useEffect(() => {
    if (!state?.roomId || !canvasRef.current) return undefined;

    const canvas = canvasRef.current;
    let raf = 0;
    let previousFrame = performance.now();
    let lastWidth = 0;
    let lastDpr = 0;

    function frame(nowPerf) {
      const latest = stateRef.current;
      if (!latest?.arena) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const width = latest.arena.width || 100;
      const height = latest.arena.height || 140;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = canvas.clientWidth || 430;
      const cssHeight = cssWidth * height / width;
      if (Math.abs(cssWidth - lastWidth) > .5 || dpr !== lastDpr || !canvas.width) {
        lastWidth = cssWidth;
        lastDpr = dpr;
        canvas.width = Math.max(1, Math.round(cssWidth * dpr));
        canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      }

      const ctx = canvas.getContext('2d');
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawGrid(ctx, width, height);

      ctx.save();
      ctx.beginPath(); ctx.rect(1.2, 1.2, width - 2.4, height - 2.4); ctx.clip();
      if (latest.playerSide === 'b') {
        ctx.translate(width, height);
        ctx.rotate(Math.PI);
      }

      const serverNow = Date.now() - serverOffsetRef.current;
      const elapsedFromSnapshot = Number.isFinite(latest.serverNow)
        ? clamp((serverNow - latest.serverNow) / 1000, 0, .11)
        : 0;
      const dt = Math.min(.05, Math.max(.001, (nowPerf - previousFrame) / 1000));
      previousFrame = nowPerf;
      const smoothing = 1 - Math.exp(-20 * dt);
      const lifetime = latest.trailLifetimeMs || 5000;

      for (const side of ['a', 'b']) {
        const player = latest.players?.[side];
        const cycle = player?.cycle;
        if (!cycle) continue;

        drawTrail(ctx, cycle.segments, serverNow, lifetime);

        let dir = cycle.dir;
        if (side === latest.playerSide && ownDirOverrideRef.current?.until > nowPerf) {
          dir = ownDirOverrideRef.current.dir;
        }

        const [vx, vy] = vectorFor(dir);
        const prediction = latest.phase === 'playing' ? elapsedFromSnapshot * (latest.cycleSpeed || 20) : 0;
        const targetX = cycle.x + vx * prediction;
        const targetY = cycle.y + vy * prediction;

        let view = viewRef.current[side];
        if (!view || latest.phase !== 'playing') {
          view = { x: cycle.x, y: cycle.y };
          viewRef.current[side] = view;
        } else {
          view.x += (targetX - view.x) * smoothing;
          view.y += (targetY - view.y) * smoothing;
        }

        // Continue the newest trail visually up to the interpolated bike head.
        if (latest.phase === 'playing' && cycle.segments?.length) {
          const tail = cycle.segments[cycle.segments.length - 1];
          ctx.strokeStyle = 'rgba(255,0,31,.32)';
          ctx.lineWidth = 5.4;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tail.x2, tail.y2); ctx.lineTo(view.x, view.y); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,41,72,.98)';
          ctx.lineWidth = 2.5;
          ctx.shadowColor = 'rgba(255,0,31,.95)'; ctx.shadowBlur = 4.8;
          ctx.beginPath(); ctx.moveTo(tail.x2, tail.y2); ctx.lineTo(view.x, view.y); ctx.stroke();
          ctx.shadowBlur = 0;
        }

        drawCycle(ctx, view.x, view.y, dir, player.color || '#35e8ff');
      }

      drawCrash(ctx, latest.lastCrash || null);
      ctx.restore();

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state?.roomId]);

  if (!state && !waiting) {
    return (
      <section className="tron-lobby">
        <div className="tron-lobby__icon" aria-hidden="true">◢━</div>
        <span className="eyebrow">Световая дуэль · до 3 побед · 2:30</span>
        <h1>Tron: Light Cycles</h1>
        <p>
          Мотоцикл едет постоянно и оставляет за собой красный световой след. Он постепенно исчезает.
          Врежешься в стену или в ещё видимый след — проигрываешь раунд.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="tron-waiting-card">
        <div className="tron-waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго гонщика…</h2>
        <p>Как только второй игрок нажмёт поиск, арена запустится автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const mySide = state.playerSide;
  const opponentSide = mySide === 'a' ? 'b' : 'a';
  const me = state.players?.[mySide];
  const opponent = state.players?.[opponentSide];
  const result = resultPresentation(state);
  const controlsEnabled = state.status === 'playing' && state.phase === 'playing';

  return (
    <section className="tron-match">
      <div className="tron-scoreboard">
        <div className="tron-player tron-player--opponent" style={{ '--tron-color': opponent?.color }}>
          <div className="tron-player__dot" />
          <div className="tron-player__meta"><strong>{opponent?.name || 'Соперник'}</strong><small>соперник</small></div>
          <b>{opponent?.score ?? 0}</b>
        </div>

        <div className="tron-round-badge">
          <span>МАТЧ</span>
          <strong>{formatMatchTime(state.matchRemainingMs)}</strong>
          <small>раунд {state.round} · до {state.targetScore}</small>
        </div>

        <div className="tron-player tron-player--me" style={{ '--tron-color': me?.color }}>
          <b>{me?.score ?? 0}</b>
          <div className="tron-player__meta tron-player__meta--right"><strong>{me?.name || playerName}</strong><small>ты</small></div>
          <div className="tron-player__dot" />
        </div>
      </div>

      <div className="tron-status-pill">{phaseText(state)}</div>

      <div className="tron-arena-shell">
        <canvas ref={canvasRef} className="tron-arena tron-arena-canvas" aria-label="Арена световых мотоциклов" />

        {state.phase === 'countdown' && (
          <div className="tron-canvas-overlay tron-canvas-overlay--countdown">
            <strong>{countdownNumber(state.countdownMs)}</strong>
          </div>
        )}

        {state.phase === 'roundOver' && (
          <div className="tron-canvas-overlay tron-canvas-overlay--round">
            <strong>{state.roundWinner === mySide ? 'РАУНД ТВОЙ' : state.roundWinner ? 'РАУНД СОПЕРНИКА' : 'НИЧЬЯ'}</strong>
            <small>следующий старт через секунду</small>
          </div>
        )}
      </div>

      <div className="tron-controls" aria-label="Управление поворотами">
        <button type="button" className="tron-control tron-control--left" disabled={!controlsEnabled} onPointerDown={(event) => { event.preventDefault(); turn('left'); }}>
          <span>↶</span><small>ВЛЕВО</small>
        </button>
        <div className="tron-control-hint"><strong>{controlsEnabled ? 'Едешь автоматически' : phaseText(state)}</strong><small>Красный след исчезает через несколько секунд</small></div>
        <button type="button" className="tron-control tron-control--right" disabled={!controlsEnabled} onPointerDown={(event) => { event.preventDefault(); turn('right'); }}>
          <span>↷</span><small>ВПРАВО</small>
        </button>
      </div>

      {error && <div className="game-error tron-error">{error}</div>}
      {state.status === 'playing' && <button type="button" className="danger-button tron-resign" onClick={resign}>Покинуть матч</button>}

      {result && (
        <div className="tron-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`tron-result-card tron-result-card--${result.kind}`}>
            <div className="tron-result-icon">{result.icon}</div>
            <span className="eyebrow">Гонка завершена</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="tron-result-score">
              <span style={{ '--score-color': me?.color }}>{me?.score ?? 0}</span><b>:</b><span style={{ '--score-color': opponent?.color }}>{opponent?.score ?? 0}</span>
            </div>
            <div className="tron-result-actions">
              <button type="button" className="primary-button" onClick={() => onBack?.()}>Выйти в главное меню</button>
              <button type="button" className="secondary-button" onClick={findMatch}>Найти нового соперника</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
