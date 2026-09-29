import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './pool.css';

const BALL_COLORS = {
  1: '#f3cf35', 2: '#2458c6', 3: '#d43b37', 4: '#7442a6', 5: '#e17a25', 6: '#209653', 7: '#762831',
  8: '#111216', 9: '#f3cf35', 10: '#2458c6', 11: '#d43b37', 12: '#7442a6', 13: '#e17a25', 14: '#209653', 15: '#762831',
};

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function groupLabel(group) {
  if (group === 'solid') return 'Однотонные';
  if (group === 'stripe') return 'Полосатые';
  return 'Группа открыта';
}

function drawBall(ctx, number, x, y, r, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = 'rgba(0,0,0,.24)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.22, y + r * 0.42, r * 0.9, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  if (number === 0) {
    const white = ctx.createRadialGradient(x - r * .38, y - r * .45, r * .06, x, y, r * 1.2);
    white.addColorStop(0, '#ffffff');
    white.addColorStop(.55, '#f5f2e8');
    white.addColorStop(1, '#c7c5bd');
    ctx.fillStyle = white;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  } else if (number >= 9) {
    ctx.fillStyle = '#f6f2e8';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = BALL_COLORS[number];
    ctx.fillRect(x - r, y - r * .42, r * 2, r * .84);
  } else {
    ctx.fillStyle = BALL_COLORS[number] || '#777';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const shade = ctx.createRadialGradient(x - r * .42, y - r * .52, r * .08, x + r * .12, y + r * .15, r * 1.25);
  shade.addColorStop(0, 'rgba(255,255,255,.62)');
  shade.addColorStop(.25, 'rgba(255,255,255,.07)');
  shade.addColorStop(.72, 'rgba(0,0,0,.04)');
  shade.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = shade;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,.36)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

  if (number !== 0) {
    ctx.fillStyle = '#f7f3e8';
    ctx.beginPath(); ctx.arc(x, y, r * .43, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = .7; ctx.stroke();
    ctx.fillStyle = '#15171b';
    ctx.font = `800 ${Math.max(7.5, r * .62)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(number), x, y + .4);
  }

  ctx.restore();
}

function BallMini({ number }) {
  const stripe = number >= 9;
  const color = BALL_COLORS[number];
  return (
    <span className={`pool-mini-ball ${stripe ? 'is-stripe' : ''} ${number === 8 ? 'is-eight' : ''}`} style={{ '--ball-color': color }}>
      <b>{number}</b>
    </span>
  );
}

function findGuideCollision(cue, balls, angle, maxDistance, ballRadius) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let best = null;
  const contactDistance = ballRadius * 2;

  for (const ball of balls) {
    if (ball.pocketed || ball.number === 0) continue;
    const rx = ball.x - cue.x;
    const ry = ball.y - cue.y;
    const along = rx * ux + ry * uy;
    if (along <= 0 || along > maxDistance + contactDistance) continue;
    const sideSq = rx * rx + ry * ry - along * along;
    if (sideSq > contactDistance * contactDistance) continue;
    const offset = Math.sqrt(Math.max(0, contactDistance * contactDistance - sideSq));
    const t = along - offset;
    if (t > 0 && t <= maxDistance && (!best || t < best.t)) {
      best = { ball, t };
    }
  }
  return best;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const win = state.result?.winner === state.playerSlot;
  return {
    win,
    icon: win ? '🏆' : '🎱',
    title: win ? 'Вы победили!' : 'Вы проиграли',
    text: state.result?.message || 'Партия завершена.',
  };
}

function drawCushionSegment(ctx, x1, y1, x2, y2, horizontal, inwardSign) {
  const depth = 17;
  ctx.save();
  const grad = horizontal
    ? ctx.createLinearGradient(0, y1, 0, y1 + depth * inwardSign)
    : ctx.createLinearGradient(x1, 0, x1 + depth * inwardSign, 0);
  grad.addColorStop(0, '#184d38');
  grad.addColorStop(.45, '#247c57');
  grad.addColorStop(1, '#10392b');
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(7,25,18,.65)';
  ctx.lineWidth = 1.3;

  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - 10, y2 + depth * inwardSign);
    ctx.lineTo(x1 + 10, y1 + depth * inwardSign);
  } else {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 + depth * inwardSign, y2 - 10);
    ctx.lineTo(x1 + depth * inwardSign, y1 + 10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTable(ctx, table) {
  const { width: w, height: h, rail: r, cornerMouth = 47, sideMouth = 46 } = table;

  const wood = ctx.createLinearGradient(0, 0, w, h);
  wood.addColorStop(0, '#4d2b1a');
  wood.addColorStop(.18, '#8a532c');
  wood.addColorStop(.55, '#6b3b20');
  wood.addColorStop(.82, '#9a6235');
  wood.addColorStop(1, '#3d2015');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#101419';
  ctx.fillRect(r - 17, r - 17, w - (r - 17) * 2, h - (r - 17) * 2);

  const felt = ctx.createRadialGradient(w * .47, h * .42, 40, w * .5, h * .5, w * .58);
  felt.addColorStop(0, '#209066');
  felt.addColorStop(.5, '#13714f');
  felt.addColorStop(1, '#0a5139');
  ctx.fillStyle = felt;
  ctx.fillRect(r, r, w - r * 2, h - r * 2);

  // Subtle cloth grain.
  ctx.save();
  ctx.globalAlpha = .06;
  ctx.strokeStyle = '#d9fff0';
  ctx.lineWidth = .55;
  for (let y = r + 8; y < h - r; y += 11) {
    ctx.beginPath(); ctx.moveTo(r, y); ctx.lineTo(w - r, y + 2); ctx.stroke();
  }
  ctx.restore();

  const cx = w / 2;
  drawCushionSegment(ctx, r + cornerMouth, r, cx - sideMouth, r, true, 1);
  drawCushionSegment(ctx, cx + sideMouth, r, w - r - cornerMouth, r, true, 1);
  drawCushionSegment(ctx, r + cornerMouth, h - r, cx - sideMouth, h - r, true, -1);
  drawCushionSegment(ctx, cx + sideMouth, h - r, w - r - cornerMouth, h - r, true, -1);
  drawCushionSegment(ctx, r, r + cornerMouth, r, h - r - cornerMouth, false, 1);
  drawCushionSegment(ctx, w - r, r + cornerMouth, w - r, h - r - cornerMouth, false, -1);

  // Pockets sit behind the cushion mouths.
  for (const pocket of table.pockets || []) {
    const radius = pocket.r || (pocket.kind === 'side' ? 31 : 34);
    const ring = ctx.createRadialGradient(pocket.x - 5, pocket.y - 7, 2, pocket.x, pocket.y, radius + 8);
    ring.addColorStop(0, '#050607');
    ring.addColorStop(.72, '#030405');
    ring.addColorStop(1, '#2c2018');
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(pocket.x, pocket.y, radius + 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3.5; ctx.stroke();
  }

  // Visible rounded jaw tips match the server's collision circles.
  for (const jaw of table.jaws || []) {
    const g = ctx.createRadialGradient(jaw.x - 2, jaw.y - 3, 1, jaw.x, jaw.y, (jaw.r || 9.5) + 4);
    g.addColorStop(0, '#318765');
    g.addColorStop(1, '#0d3729');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(jaw.x, jaw.y, (jaw.r || 9.5) + 2, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = 'rgba(248,229,181,.78)';
  for (let i = 1; i <= 7; i += 1) {
    const x = r + ((w - r * 2) * i / 8);
    if (Math.abs(x - cx) < sideMouth + 15) continue;
    ctx.save(); ctx.translate(x, 22); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.4, -2.4, 4.8, 4.8); ctx.restore();
    ctx.save(); ctx.translate(x, h - 22); ctx.rotate(Math.PI / 4); ctx.fillRect(-2.4, -2.4, 4.8, 4.8); ctx.restore();
  }
}

export default function PoolGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [aimAngle, setAimAngle] = useState(0);
  const [pullPower, setPullPower] = useState(0);
  const canvasRef = useRef(null);
  const aimDraggingRef = useRef(false);
  const powerDraggingRef = useRef(false);
  const pullRef = useRef(0);
  const {
    waiting, state, error, setError,
    findMatch: startMatch, cancelSearch, sendAction,
  } = useMultiplayerGame('pool');

  const mySlot = state?.playerSlot;
  const opponentSlot = mySlot === 'a' ? 'b' : 'a';
  const myPlayer = state?.players?.[mySlot];
  const opponentPlayer = state?.players?.[opponentSlot];
  const myTurn = state?.status === 'playing' && state?.phase === 'aiming' && state?.turn === mySlot;
  const result = resultPresentation(state);

  const groupBalls = useMemo(() => ({
    solid: [1, 2, 3, 4, 5, 6, 7],
    stripe: [9, 10, 11, 12, 13, 14, 15],
  }), []);

  function findMatch() {
    setError('');
    setPullPower(0);
    pullRef.current = 0;
    startMatch(playerName);
  }

  function resign() {
    if (state?.status === 'playing') sendAction({ type: 'resign' });
  }

  function updateAim(clientX, clientY) {
    if (!myTurn || !state || !canvasRef.current) return;
    const cue = state.balls?.find((ball) => ball.number === 0 && !ball.pocketed);
    if (!cue) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * state.table.width;
    const y = ((clientY - rect.top) / rect.height) * state.table.height;
    setAimAngle(Math.atan2(y - cue.y, x - cue.x));
  }

  function updatePowerFromPointer(clientY, element) {
    if (!myTurn) return 0;
    const rect = element.getBoundingClientRect();
    const normalized = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    pullRef.current = normalized;
    setPullPower(normalized);
    return normalized;
  }

  function releasePower() {
    if (!powerDraggingRef.current) return;
    powerDraggingRef.current = false;
    const power = pullRef.current;
    if (myTurn && power >= .07) {
      sendAction({ type: 'shoot', payload: { angle: aimAngle, power } });
    }
    pullRef.current = 0;
    setPullPower(0);
  }

  useEffect(() => {
    if (!myTurn) {
      pullRef.current = 0;
      setPullPower(0);
    }
  }, [myTurn]);

  useEffect(() => {
    if (!state || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const table = state.table;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = canvas.clientWidth || 1000;
    const cssHeight = cssWidth * table.height / table.width;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / table.width, 0, 0, canvas.height / table.height, 0, 0);
    ctx.clearRect(0, 0, table.width, table.height);

    drawTable(ctx, table);

    const cue = state.balls?.find((ball) => ball.number === 0 && !ball.pocketed);
    if (myTurn && cue) {
      const ux = Math.cos(aimAngle);
      const uy = Math.sin(aimAngle);
      const guideDistance = 300;
      const collision = findGuideCollision(cue, state.balls || [], aimAngle, guideDistance, table.ballRadius);
      const guideEnd = collision ? collision.t : guideDistance;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.78)';
      ctx.lineWidth = 2.1;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(cue.x + ux * (table.ballRadius + 5), cue.y + uy * (table.ballRadius + 5));
      ctx.lineTo(cue.x + ux * guideEnd, cue.y + uy * guideEnd);
      ctx.stroke();
      ctx.setLineDash([]);

      if (collision) {
        const ghostX = cue.x + ux * collision.t;
        const ghostY = cue.y + uy * collision.t;
        const nxRaw = collision.ball.x - ghostX;
        const nyRaw = collision.ball.y - ghostY;
        const nLen = Math.hypot(nxRaw, nyRaw) || 1;
        const nx = nxRaw / nLen;
        const ny = nyRaw / nLen;

        ctx.strokeStyle = 'rgba(255,218,89,.94)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(collision.ball.x + nx * (table.ballRadius + 4), collision.ball.y + ny * (table.ballRadius + 4));
        ctx.lineTo(collision.ball.x + nx * 86, collision.ball.y + ny * 86);
        ctx.stroke();

        const normalComponent = ux * nx + uy * ny;
        // Same equal-mass collision model as the server (restitution 0.965).
        const transferred = ((1 + 0.965) * normalComponent) / 2;
        const cueOutX = ux - transferred * nx;
        const cueOutY = uy - transferred * ny;
        const cueOutLen = Math.hypot(cueOutX, cueOutY);
        if (cueOutLen > .12) {
          ctx.strokeStyle = 'rgba(190,226,255,.75)';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(ghostX, ghostY);
          ctx.lineTo(ghostX + (cueOutX / cueOutLen) * 66, ghostY + (cueOutY / cueOutLen) * 66);
          ctx.stroke();
        }

        ctx.globalAlpha = .32;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(ghostX, ghostY, table.ballRadius, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffd956';
        ctx.beginPath(); ctx.arc(collision.ball.x - nx * table.ballRadius, collision.ball.y - ny * table.ballRadius, 3.5, 0, Math.PI * 2); ctx.fill();
      }

      // The cue on the table visibly pulls back with the right-side power control.
      const backGap = 22 + pullPower * 82;
      const cueLength = 172;
      const tipX = cue.x - ux * backGap;
      const tipY = cue.y - uy * backGap;
      const buttX = cue.x - ux * (backGap + cueLength);
      const buttY = cue.y - uy * (backGap + cueLength);

      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(tipX + 3, tipY + 4); ctx.lineTo(buttX + 3, buttY + 4); ctx.stroke();
      const cueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
      cueGrad.addColorStop(0, '#f3e2b8');
      cueGrad.addColorStop(.55, '#b88243');
      cueGrad.addColorStop(1, '#402819');
      ctx.strokeStyle = cueGrad; ctx.lineWidth = 7.5;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(buttX, buttY); ctx.stroke();
      ctx.strokeStyle = '#7bc6d3'; ctx.lineWidth = 3.3;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX - ux * 7, tipY - uy * 7); ctx.stroke();
      ctx.restore();
    }

    for (const ball of state.balls || []) {
      if (!ball.pocketed) drawBall(ctx, ball.number, ball.x, ball.y, table.ballRadius);
    }
  }, [state, aimAngle, pullPower, myTurn]);

  if (!state && !waiting) {
    return (
      <section className="pool-lobby">
        <div className="pool-lobby__icon">🎱</div>
        <span className="eyebrow">8-ball · 30 секунд на ход</span>
        <h1>Бильярд</h1>
        <p>Наводи удар прямо по столу, затем тяни кий справа вниз и отпускай. Чем сильнее оттянул — тем мощнее удар.</p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="pool-waiting-card">
        <div className="pool-waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только второй игрок откроет бильярд и нажмёт поиск, партия начнётся.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const sunk = state.pocketed || [];
  const myGroup = myPlayer?.group;
  const opponentGroup = opponentPlayer?.group;
  const mySunk = myGroup ? groupBalls[myGroup].filter((n) => sunk.includes(n)) : [];
  const opponentSunk = opponentGroup ? groupBalls[opponentGroup].filter((n) => sunk.includes(n)) : [];
  const timerSeconds = Math.max(0, Math.ceil((state.turnMsLeft || 0) / 1000));
  const powerPct = Math.round(pullPower * 100);

  return (
    <section className="pool-match">
      <div className={`pool-turn-banner ${myTurn ? 'is-mine' : ''}`}>
        <span>{state.breakShot ? 'Разбивка' : state.phase === 'moving' ? 'Шары движутся…' : myTurn ? 'Твой ход — наведи и оттяни кий' : 'Ход соперника'}</span>
        {state.phase === 'aiming' && state.status === 'playing' && <strong>{timerSeconds}</strong>}
      </div>

      <div className={`pool-player-strip ${state.turn === opponentSlot ? 'is-turn' : ''}`}>
        <div className="pool-player-id"><span className="pool-avatar">2</span><div><strong>{opponentPlayer?.name || 'Соперник'}</strong><small>{groupLabel(opponentGroup)}</small></div></div>
        <div className="pool-owned-balls">
          {opponentGroup ? groupBalls[opponentGroup].map((n) => <BallMini key={n} number={n} />) : <span className="pool-open-label">ещё не выбрано</span>}
        </div>
        <span className="pool-score">{opponentSunk.length}/7</span>
      </div>

      <div className="pool-table-wrap">
        <canvas
          ref={canvasRef}
          className={`pool-canvas ${myTurn ? 'is-aiming' : ''}`}
          onPointerDown={(e) => {
            if (!myTurn) return;
            aimDraggingRef.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            updateAim(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => { if (aimDraggingRef.current) updateAim(e.clientX, e.clientY); }}
          onPointerUp={(e) => {
            aimDraggingRef.current = false;
            e.currentTarget.releasePointerCapture?.(e.pointerId);
          }}
          onPointerCancel={() => { aimDraggingRef.current = false; }}
          aria-label="Бильярдный стол. Проведи пальцем для прицеливания."
        />

        <div
          className={`pool-power-cue ${myTurn ? 'is-enabled' : ''} ${powerDraggingRef.current ? 'is-pulling' : ''}`}
          onPointerDown={(e) => {
            if (!myTurn) return;
            powerDraggingRef.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            updatePowerFromPointer(e.clientY, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (powerDraggingRef.current) updatePowerFromPointer(e.clientY, e.currentTarget);
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture?.(e.pointerId);
            releasePower();
          }}
          onPointerCancel={releasePower}
          role="button"
          aria-label="Сила удара. Потяни кий вниз и отпусти."
        >
          <span className="pool-power-label">СИЛА</span>
          <span className="pool-power-track">
            <i className="pool-power-fill" style={{ height: `${powerPct}%` }} />
          </span>
          <span className="pool-power-stick" style={{ transform: `translateY(${pullPower * 62}px)` }}>
            <i className="pool-power-stick__tip" />
            <i className="pool-power-stick__shaft" />
            <i className="pool-power-stick__butt" />
          </span>
          <b>{powerPct}%</b>
          <small>{myTurn ? 'тяни вниз' : 'жди ход'}</small>
        </div>
      </div>

      <div className={`pool-player-strip pool-player-strip--me ${state.turn === mySlot ? 'is-turn' : ''}`}>
        <div className="pool-player-id"><span className="pool-avatar">1</span><div><strong>{myPlayer?.name || playerName} <em>ты</em></strong><small>{groupLabel(myGroup)}</small></div></div>
        <div className="pool-owned-balls">
          {myGroup ? groupBalls[myGroup].map((n) => <BallMini key={n} number={n} />) : <span className="pool-open-label">ещё не выбрано</span>}
        </div>
        <span className="pool-score">{mySunk.length}/7</span>
      </div>

      <div className="pool-controls">
        <div className="pool-status-card">
          <span className="eyebrow">Как играть</span>
          <strong>{state.lastAction}</strong>
          <small>{myTurn ? 'Пальцем наведи линию на столе. Затем потяни кий справа вниз и отпусти — это и есть удар.' : 'Сейчас играет соперник. Ты видишь движение шаров в реальном времени.'}</small>
        </div>
        <div className="pool-pocket-tray">
          <span>В лузах</span>
          <div>{sunk.length ? sunk.map((n) => <BallMini key={n} number={n} />) : <small>пока пусто</small>}</div>
        </div>
        {state.status === 'playing' && <button type="button" className="danger-button pool-resign" onClick={resign}>Сдаться</button>}
      </div>

      {error && <div className="game-error pool-error">{error}</div>}

      {result && (
        <div className="pool-result-backdrop" role="dialog" aria-modal="true">
          <div className={`pool-result-card ${result.win ? 'is-win' : 'is-lose'}`}>
            <div className="pool-result-icon">{result.icon}</div>
            <span className="eyebrow">Партия завершена</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <button className="primary-button" onClick={onBack}>Выйти в главное меню</button>
            <button className="secondary-button" onClick={findMatch}>Найти нового соперника</button>
          </div>
        </div>
      )}
    </section>
  );
}
