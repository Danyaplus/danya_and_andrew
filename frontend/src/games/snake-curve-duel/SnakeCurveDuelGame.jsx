import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './snake-curve-duel.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function lerpAngle(current, target, alpha) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * alpha;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const winner = state.result?.winner ?? null;
  const isDraw = winner == null;
  const won = !isDraw && winner === state.playerSeat;
  return {
    won,
    draw: isDraw,
    title: isDraw ? 'Ничья' : won ? 'Вы победили!' : 'Вы проиграли',
    icon: isDraw ? '🤝' : won ? '🏆' : '💥',
    text: state.result?.message || 'Матч завершён.',
  };
}

function drawArena(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#d9edf1');
  grad.addColorStop(1, '#c8dde2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(64,103,113,.11)';
  ctx.lineWidth = .22;
  for (let x = 5; x < width; x += 10) {
    for (let y = 4; y < height; y += 8) {
      ctx.beginPath();
      ctx.moveTo(x, y + 2.5);
      ctx.lineTo(x + 3.6, y - 1.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 5.2, y + 1.3, .22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(64,103,113,.15)';
      ctx.fill();
    }
  }

  ctx.shadowColor = '#ff7a1a';
  ctx.shadowBlur = 2.2;
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = .75;
  ctx.strokeRect(1.3, 1.3, width - 2.6, height - 2.6);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.lineWidth = .25;
  ctx.strokeRect(1.85, 1.85, width - 3.7, height - 3.7);
}

function drawApple(ctx, apple) {
  if (!apple) return;
  ctx.save();
  ctx.translate(apple.x, apple.y);
  ctx.shadowColor = 'rgba(255,48,66,.55)';
  ctx.shadowBlur = 3;
  ctx.fillStyle = '#f12f43';
  ctx.beginPath();
  ctx.arc(-.9, .3, 1.65, 0, Math.PI * 2);
  ctx.arc(.9, .3, 1.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#7d241d';
  ctx.fillRect(-.18, -2.55, .42, 1.35);
  ctx.fillStyle = '#34a955';
  ctx.beginPath();
  ctx.ellipse(1.05, -2.2, 1.15, .55, -.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function smoothBody(oldBody, newBody, alpha) {
  if (!oldBody?.length || oldBody.length !== newBody?.length) return newBody || [];
  return newBody.map((point, i) => ({
    x: oldBody[i].x + (point.x - oldBody[i].x) * alpha,
    y: oldBody[i].y + (point.y - oldBody[i].y) * alpha,
  }));
}

function drawSnake(ctx, snake, color, mine, pressed) {
  if (!snake?.body?.length) return;
  const body = snake.body;
  const rgb = color === '#ff334d' ? '255,51,77' : '47,140,255';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = `rgba(${rgb},.25)`;
  ctx.shadowBlur = mine ? 3.3 : 2.1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.45;
  ctx.beginPath();
  ctx.moveTo(body[0].x, body[0].y);
  for (let i = 1; i < body.length; i += 1) ctx.lineTo(body[i].x, body[i].y);
  ctx.stroke();

  ctx.shadowBlur = 0;
  for (let i = Math.max(0, body.length - 18); i < body.length - 1; i += 2) {
    const p = body[i];
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(6,23,56,.72)';
    ctx.lineWidth = .28;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const angle = snake.angle || 0;
  const hx = snake.x;
  const hy = snake.y;
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(6,23,56,.88)';
  ctx.lineWidth = .35;
  ctx.beginPath();
  ctx.ellipse(.15, 0, 2.65, 2.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff8dc';
  ctx.beginPath();
  ctx.arc(1.35, -.72, .52, 0, Math.PI * 2);
  ctx.arc(1.35, .72, .52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#17264b';
  ctx.beginPath();
  ctx.arc(1.53, -.72, .21, 0, Math.PI * 2);
  ctx.arc(1.53, .72, .21, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = pressed ? '#fff36b' : '#ffb23f';
  ctx.beginPath();
  ctx.moveTo(2.75, 0);
  ctx.lineTo(1.65, -.42);
  ctx.lineTo(1.65, .42);
  ctx.closePath();
  ctx.fill();

  if (mine) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = .32;
    ctx.beginPath();
    ctx.arc(0, 0, 3.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export default function SnakeCurveDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const renderRef = useRef({ a: null, b: null });

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('snake-curve-duel');

  stateRef.current = state;
  const canControl = state?.status === 'playing' && state?.phase === 'playing';
  const me = state?.playerSeat;
  const opponent = state?.opponentSeat;
  const myScore = me ? state?.players?.[me]?.score ?? 0 : 0;
  const oppScore = opponent ? state?.players?.[opponent]?.score ?? 0 : 0;
  const result = resultPresentation(state);

  useEffect(() => {
    if (!canControl && pressedRef.current) {
      pressedRef.current = false;
      setPressed(false);
    }
  }, [canControl]);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space' || event.repeat || event.target?.matches?.('input,textarea,select,button')) return;
      if (!canControl || pressedRef.current) return;
      event.preventDefault();
      pressedRef.current = true;
      setPressed(true);
      sendAction({ type: 'steer', active: true });
    }
    function keyUp(event) {
      if (event.code !== 'Space' || !pressedRef.current) return;
      event.preventDefault();
      pressedRef.current = false;
      setPressed(false);
      sendAction({ type: 'steer', active: false });
    }
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, [canControl, sendAction]);

  useEffect(() => {
    if (!state?.roomId || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    let raf = 0;
    let last = performance.now();

    function frame(now) {
      const latest = stateRef.current;
      const arena = latest?.arena;
      if (!arena) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(pixelWidth / arena.width, 0, 0, pixelHeight / arena.height, 0, 0);

      const dt = Math.min(.05, Math.max(.001, (now - last) / 1000));
      last = now;
      const alpha = 1 - Math.exp(-20 * dt);

      for (const seat of ['a', 'b']) {
        const target = latest.snakes?.[seat];
        if (!target) continue;
        const current = renderRef.current[seat];
        if (!current) {
          renderRef.current[seat] = JSON.parse(JSON.stringify(target));
          continue;
        }
        current.x += (target.x - current.x) * alpha;
        current.y += (target.y - current.y) * alpha;
        current.angle = lerpAngle(current.angle ?? target.angle, target.angle, alpha);
        current.body = smoothBody(current.body, target.body, alpha);
        current.pressed = target.pressed;
      }

      drawArena(ctx, arena.width, arena.height);
      drawApple(ctx, latest.apple);
      for (const seat of ['a', 'b']) {
        drawSnake(
          ctx,
          renderRef.current[seat],
          latest.players?.[seat]?.color || (seat === 'a' ? '#ff334d' : '#2f8cff'),
          seat === latest.playerSeat,
          seat === latest.playerSeat ? pressed : Boolean(latest.snakes?.[seat]?.pressed),
        );
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state?.roomId, pressed]);

  function findMatch() {
    pressedRef.current = false;
    setPressed(false);
    renderRef.current = { a: null, b: null };
    setError('');
    startMatch(playerName);
  }

  function steerDown(event) {
    if (!canControl || pressedRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressedRef.current = true;
    setPressed(true);
    sendAction({ type: 'steer', active: true });
  }

  function steerUp(event) {
    if (!pressedRef.current) return;
    event?.preventDefault?.();
    pressedRef.current = false;
    setPressed(false);
    sendAction({ type: 'steer', active: false });
  }

  if (!state && !waiting) {
    return (
      <section className="snake-lobby">
        <div className="snake-lobby__icon">🐍</div>
        <span className="eyebrow">Одна кнопка · до 2 побед</span>
        <h1>Змейки: один поворот</h1>
        <p>
          Змейка всегда едет и сама закручивается. Пока кнопку не держишь — поворачивает в одну сторону,
          зажимаешь — плавно начинает крутить в другую. Частыми короткими нажатиями можно почти ехать прямо.
          Ешь яблоки, становись длиннее и перекрывай путь сопернику.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="snake-waiting">
        <div className="snake-waiting__worms">🐍  ·  🐍</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только найдётся соперник, начнётся первый раунд.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="snake-game">
      <div className="snake-hud">
        <div className="snake-player snake-player--me">
          <span className="snake-dot" style={{ background: state.players?.[me]?.color }} />
          <div><small>Ты</small><strong>{state.players?.[me]?.name || playerName}</strong></div>
          <b>{myScore}</b>
        </div>
        <div className="snake-round">
          <small>РАУНД</small>
          <strong>{state.round}</strong>
          <span>до {state.winsToMatch} побед</span>
        </div>
        <div className="snake-player snake-player--opp">
          <b>{oppScore}</b>
          <div><small>Соперник</small><strong>{state.players?.[opponent]?.name || 'Игрок'}</strong></div>
          <span className="snake-dot" style={{ background: state.players?.[opponent]?.color }} />
        </div>
      </div>

      <div className="snake-arena-wrap">
        <canvas ref={canvasRef} className="snake-canvas" aria-label="Арена змей" />

        {state.phase === 'countdown' && (
          <div className="snake-countdown">
            <strong>{Math.max(1, Math.ceil((state.countdownMs || 0) / 1000))}</strong>
            <span>приготовься</span>
          </div>
        )}

        {state.phase === 'round-over' && state.status === 'playing' && (
          <div className="snake-round-banner" aria-live="polite">
            <strong>{state.roundWinner ? (state.roundWinner === me ? 'Раунд твой!' : 'Раунд соперника') : 'Ничья'}</strong>
            <span>{state.roundMessage}</span>
          </div>
        )}
      </div>

      <div className="snake-controls">
        <button
          type="button"
          className={`snake-steer ${pressed ? 'is-pressed' : ''}`}
          onPointerDown={steerDown}
          onPointerUp={steerUp}
          onPointerCancel={steerUp}
          onLostPointerCapture={steerUp}
          onContextMenu={(event) => event.preventDefault()}
          disabled={!canControl}
          aria-label="Сменить направление поворота"
        >
          <span>{pressed ? '↺' : '↻'}</span>
          <small>{pressed ? 'ДЕРЖИШЬ — ВЛЕВО' : 'ОТПУЩЕНО — ВПРАВО'}</small>
        </button>
      </div>

      <div className="snake-help">
        <span><b>Отпустил:</b> поворот вправо</span>
        <span><b>Зажал:</b> плавный поворот влево</span>
        <span><b>Яблоко:</b> хвост становится длиннее</span>
        <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти</button>
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="snake-result-backdrop" role="dialog" aria-modal="true">
          <div className={`snake-result ${result.won ? 'is-win' : result.draw ? 'is-draw' : 'is-lose'}`}>
            <div className="snake-result__icon">{result.icon}</div>
            <span className="eyebrow">Матч завершён · {myScore}:{oppScore}</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="snake-result__actions">
              <button className="primary-button" onClick={onBack}>В главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Новый соперник</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
