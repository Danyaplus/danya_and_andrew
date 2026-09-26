import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './pool.css';

const BALL_COLORS = {
  1: '#f2d13d', 2: '#315bc6', 3: '#d7433d', 4: '#7045a5', 5: '#df7a2d', 6: '#2f9a58', 7: '#7d2930',
  8: '#111318', 9: '#f2d13d', 10: '#315bc6', 11: '#d7433d', 12: '#7045a5', 13: '#df7a2d', 14: '#2f9a58', 15: '#7d2930',
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
  if (number === 0) {
    ctx.fillStyle = '#f7f5ed';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    return;
  }

  const color = BALL_COLORS[number] || '#777';
  ctx.fillStyle = number === 8 ? '#111318' : color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  if (number >= 9) {
    ctx.fillStyle = '#f5f2e8';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.93, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - r * 0.42, r * 2, r * 0.84);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillRect(x - r, y - r * 0.42, r * 2, r * 0.84);
    ctx.restore();
  }

  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.12, x, y, r);
  grad.addColorStop(0, 'rgba(255,255,255,.42)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.05)');
  grad.addColorStop(1, 'rgba(0,0,0,.22)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#f4f1e8';
  ctx.beginPath(); ctx.arc(x, y, r * 0.44, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17191d';
  ctx.font = `700 ${Math.max(7, r * 0.62)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), x, y + 0.4);
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
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = null;

  for (const ball of balls) {
    if (ball.pocketed || ball.number === 0) continue;
    const rx = ball.x - cue.x;
    const ry = ball.y - cue.y;
    const projection = rx * dx + ry * dy;
    if (projection <= 0 || projection > maxDistance + ballRadius * 2) continue;
    const perpSq = rx * rx + ry * ry - projection * projection;
    const hitRadius = ballRadius * 2;
    if (perpSq > hitRadius * hitRadius) continue;
    const offset = Math.sqrt(Math.max(0, hitRadius * hitRadius - perpSq));
    const t = projection - offset;
    if (t > 0 && (!best || t < best.t)) best = { ball, t };
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

export default function PoolGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [aimAngle, setAimAngle] = useState(0);
  const [power, setPower] = useState(0.62);
  const canvasRef = useRef(null);
  const draggingRef = useRef(false);
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
    startMatch(playerName);
  }

  function shoot() {
    if (!myTurn) return;
    sendAction({ type: 'shoot', payload: { angle: aimAngle, power } });
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

    // Wood surround and cushions.
    const wood = ctx.createLinearGradient(0, 0, table.width, table.height);
    wood.addColorStop(0, '#6b3b1f'); wood.addColorStop(0.5, '#8d572b'); wood.addColorStop(1, '#4e2a18');
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, table.width, table.height);

    ctx.fillStyle = '#173e31';
    ctx.fillRect(table.rail - 12, table.rail - 12, table.width - (table.rail - 12) * 2, table.height - (table.rail - 12) * 2);
    const felt = ctx.createRadialGradient(table.width * .45, table.height * .4, 40, table.width * .5, table.height * .5, table.width * .55);
    felt.addColorStop(0, '#21875d'); felt.addColorStop(1, '#0f5c41');
    ctx.fillStyle = felt;
    ctx.fillRect(table.rail, table.rail, table.width - table.rail * 2, table.height - table.rail * 2);

    // Diamonds.
    ctx.fillStyle = 'rgba(255,244,211,.65)';
    for (let i = 1; i <= 7; i += 1) {
      const x = table.rail + ((table.width - table.rail * 2) * i / 8);
      ctx.beginPath(); ctx.arc(x, 20, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, table.height - 20, 3.2, 0, Math.PI * 2); ctx.fill();
    }

    for (const pocket of table.pockets) {
      ctx.fillStyle = '#08090a';
      ctx.beginPath(); ctx.arc(pocket.x, pocket.y, 27, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6; ctx.stroke();
    }

    const cue = state.balls?.find((ball) => ball.number === 0 && !ball.pocketed);
    if (myTurn && cue) {
      const ux = Math.cos(aimAngle);
      const uy = Math.sin(aimAngle);
      const guideDistance = 190;
      const collision = findGuideCollision(cue, state.balls || [], aimAngle, guideDistance, table.ballRadius);
      const guideEnd = collision ? collision.t : guideDistance;

      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.72)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([7, 9]);
      ctx.beginPath();
      ctx.moveTo(cue.x + ux * (table.ballRadius + 4), cue.y + uy * (table.ballRadius + 4));
      ctx.lineTo(cue.x + ux * guideEnd, cue.y + uy * guideEnd);
      ctx.stroke();
      ctx.setLineDash([]);

      if (collision) {
        const hitX = cue.x + ux * collision.t;
        const hitY = cue.y + uy * collision.t;
        const bx = collision.ball.x - hitX;
        const by = collision.ball.y - hitY;
        const len = Math.hypot(bx, by) || 1;
        const nx = bx / len;
        const ny = by / len;
        ctx.strokeStyle = 'rgba(255,235,143,.82)';
        ctx.lineWidth = 2.3;
        ctx.beginPath();
        ctx.moveTo(collision.ball.x, collision.ball.y);
        ctx.lineTo(collision.ball.x + nx * 58, collision.ball.y + ny * 58);
        ctx.stroke();

        const tangentX = -ny;
        const tangentY = nx;
        const tangentSign = ux * tangentX + uy * tangentY >= 0 ? 1 : -1;
        ctx.strokeStyle = 'rgba(225,241,255,.55)';
        ctx.beginPath();
        ctx.moveTo(hitX, hitY);
        ctx.lineTo(hitX + tangentX * tangentSign * 42, hitY + tangentY * tangentSign * 42);
        ctx.stroke();
      }

      // Cue stick behind the white ball.
      const backGap = 24 + power * 25;
      const cueLength = 145;
      const x1 = cue.x - ux * backGap;
      const y1 = cue.y - uy * backGap;
      const x2 = cue.x - ux * (backGap + cueLength);
      const y2 = cue.y - uy * (backGap + cueLength);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d9bd82'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#47311e'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(cue.x - ux * (backGap + 55), cue.y - uy * (backGap + 55)); ctx.stroke();
      ctx.restore();
    }

    for (const ball of state.balls || []) {
      if (ball.pocketed) continue;
      drawBall(ctx, ball.number, ball.x, ball.y, table.ballRadius);
    }
  }, [state, aimAngle, power, myTurn]);

  if (!state && !waiting) {
    return (
      <section className="pool-lobby">
        <div className="pool-lobby__icon">🎱</div>
        <span className="eyebrow">8-ball · 30 секунд на ход</span>
        <h1>Бильярд</h1>
        <p>Разбей треугольник, получи однотонные или полосатые и первым забей свою группу, а затем чёрную восьмёрку.</p>
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

  return (
    <section className="pool-match">
      <div className={`pool-turn-banner ${myTurn ? 'is-mine' : ''}`}>
        <span>{state.breakShot ? 'Разбивка' : state.phase === 'moving' ? 'Шары движутся…' : myTurn ? 'Твой ход' : 'Ход соперника'}</span>
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
          onPointerDown={(e) => { draggingRef.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); updateAim(e.clientX, e.clientY); }}
          onPointerMove={(e) => { if (draggingRef.current) updateAim(e.clientX, e.clientY); }}
          onPointerUp={(e) => { draggingRef.current = false; e.currentTarget.releasePointerCapture?.(e.pointerId); }}
          onPointerCancel={() => { draggingRef.current = false; }}
          aria-label="Бильярдный стол"
        />
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
          <span className="eyebrow">Состояние</span>
          <strong>{state.lastAction}</strong>
          <small>{state.breakShot ? 'Шары, забитые на разбивке, пока никому не назначают группу.' : 'Первый забитый после разбивки однотонный/полосатый шар определяет твою группу.'}</small>
        </div>

        <div className="pool-pocket-tray">
          <span>В лузах</span>
          <div>{sunk.length ? sunk.map((n) => <BallMini key={n} number={n} />) : <small>пока пусто</small>}</div>
        </div>

        <div className={`pool-shot-panel ${myTurn ? 'is-enabled' : ''}`}>
          <label>
            <span>Сила удара</span>
            <input type="range" min="18" max="100" value={Math.round(power * 100)} disabled={!myTurn} onChange={(e) => setPower(Number(e.target.value) / 100)} />
          </label>
          <button type="button" className="primary-button pool-shoot-button" disabled={!myTurn} onClick={shoot}>Удар</button>
          {state.status === 'playing' && <button type="button" className="danger-button pool-resign" onClick={resign}>Сдаться</button>}
        </div>
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
