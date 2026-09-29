import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './spin-soccer.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function formatClock(ms = 0) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  let text = state.result?.message || 'Матч завершён.';
  if (state.result?.type === 'disconnect') text = won ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  if (state.result?.type === 'resign') text = won ? 'Соперник вышел из матча.' : 'Вы покинули матч.';
  return {
    won,
    icon: won ? '🏆' : '⚽',
    title: won ? 'Вы победили!' : 'Вы проиграли',
    text,
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

function PlayerShape({ player, mine }) {
  const smoothPlayer = useSmoothEntity(player, { snapDistance: 240, response: 23 });
  if (!smoothPlayer) return null;
  const degrees = (smoothPlayer.angle * 180) / Math.PI;
  return (
    <g className={`spin-player spin-player--${smoothPlayer.seat} ${mine ? 'is-mine' : ''}`} transform={`translate(${smoothPlayer.x} ${smoothPlayer.y}) rotate(${degrees})`}>
      {mine && <circle className="spin-player__halo" r="43" />}
      <ellipse className="spin-player__shadow" cx="-4" cy="9" rx="31" ry="24" />
      <circle className="spin-player__body" r="31" />
      <path className="spin-player__cap" d="M-25 -8 Q0 -35 27 -9 L20 6 Q0 -7 -20 7 Z" />
      <circle className="spin-player__face" cx="20" cy="0" r="10" />
      <circle className="spin-player__eye" cx="24" cy="-3" r="2.4" />
      <path className="spin-player__direction" d="M31 -8 L48 0 L31 8 Z" />
    </g>
  );
}

function SoccerBall({ ball }) {
  const smoothBall = useSmoothEntity(ball, { snapDistance: 260, response: 26 });
  if (!smoothBall) return null;
  return (
    <g className="spin-ball" transform={`translate(${smoothBall.x} ${smoothBall.y})`}>
      <circle className="spin-ball__shadow" cx="4" cy="6" r="23" />
      <circle className="spin-ball__base" r="21" />
      <polygon className="spin-ball__patch" points="0,-8 8,-2 5,8 -5,8 -8,-2" />
      <circle className="spin-ball__dot" cx="-13" cy="-8" r="4" />
      <circle className="spin-ball__dot" cx="14" cy="-7" r="4" />
      <circle className="spin-ball__dot" cx="-12" cy="12" r="4" />
      <circle className="spin-ball__dot" cx="13" cy="12" r="4" />
    </g>
  );
}

export default function SpinSoccerGame({ onBack }) {
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
  } = useMultiplayerGame('spin-soccer');

  const mySeat = state?.playerSeat;
  const opponentSeat = state?.opponentSeat;
  const canControl = state?.status === 'playing' && state?.phase === 'playing';
  const result = resultPresentation(state);
  const mirror = mySeat === 'b';
  const myScore = mySeat ? (state?.scores?.[mySeat] ?? 0) : 0;
  const opponentScore = opponentSeat ? (state?.scores?.[opponentSeat] ?? 0) : 0;
  const myName = mySeat ? (state?.players?.[mySeat]?.name || playerName) : playerName;
  const opponentName = opponentSeat ? (state?.players?.[opponentSeat]?.name || 'Соперник') : 'Соперник';

  useEffect(() => {
    if (!canControl && pressedRef.current) {
      pressedRef.current = false;
      setPressed(false);
    }
  }, [canControl]);

  function findMatch() {
    pressedRef.current = false;
    setPressed(false);
    setError('');
    startMatch(playerName);
  }

  function driveDown(event) {
    if (!canControl || pressedRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressedRef.current = true;
    setPressed(true);
    sendAction({ type: 'drive', active: true });
  }

  function driveUp(event) {
    if (!pressedRef.current) return;
    event?.preventDefault?.();
    pressedRef.current = false;
    setPressed(false);
    sendAction({ type: 'drive', active: false });
  }

  if (!state && !waiting) {
    return (
      <section className="spin-lobby">
        <div className="spin-lobby__icon" aria-hidden="true">⚽</div>
        <span className="eyebrow">Одна кнопка · первый до 3 побед</span>
        <h1>Футбольная дуэль</h1>
        <p>
          Пока стоишь — игрок постоянно вращается. Зажми кнопку в нужный момент: направление фиксируется,
          игрок бежит прямо и пинает мяч при столкновении. На каждый раунд даётся две с половиной минуты.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="spin-waiting">
        <div className="spin-waiting__ball">⚽</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Матч начнётся автоматически, как только второй игрок нажмёт поиск.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="spin-game">
      <div className="spin-hud">
        <div className="spin-hud__player spin-hud__player--red">
          <span className="spin-hud__avatar">●</span>
          <div><small>Ты · слева</small><strong>{myName}</strong><span>↻ по часовой</span></div>
          <b>{myScore}</b>
        </div>

        <div className="spin-score">
          <small>Раунд {state.round} · до {state.winsToMatch} побед</small>
          <strong>{myScore} : {opponentScore}</strong>
          <span className={state.timeLeftMs <= 10_000 ? 'is-low' : ''}>{formatClock(state.timeLeftMs)}</span>
        </div>

        <div className="spin-hud__player spin-hud__player--blue is-opponent">
          <b>{opponentScore}</b>
          <div><small>Справа · соперник</small><strong>{opponentName}</strong><span>↺ против часовой</span></div>
          <span className="spin-hud__avatar">●</span>
        </div>
      </div>

      <div className="spin-arena-shell">
        <svg className="spin-arena" viewBox="-72 0 1144 560" role="img" aria-label="Футбольное поле">
          <defs>
            <pattern id="spin-net" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M0 0 L12 12 M12 0 L0 12" className="spin-net-line" />
            </pattern>
          </defs>

          <g transform={mirror ? 'translate(1000 0) scale(-1 1)' : undefined}>
            <rect x="0" y="0" width="1000" height="560" rx="22" className="spin-field" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((stripe) => (
              <rect key={stripe} x={stripe * 125} y="0" width="125" height="560" className={`spin-stripe ${stripe % 2 ? 'is-alt' : ''}`} />
            ))}

            <rect x="8" y="8" width="984" height="544" rx="16" className="spin-line spin-line--outline" />
            <line x1="500" y1="8" x2="500" y2="552" className="spin-line" />
            <circle cx="500" cy="280" r="91" className="spin-line" />
            <circle cx="500" cy="280" r="5" className="spin-center-dot" />

            <rect x="8" y="160" width="175" height="240" rx="4" className="spin-line" />
            <rect x="817" y="160" width="175" height="240" rx="4" className="spin-line" />
            <rect x="8" y="210" width="78" height="140" rx="4" className="spin-line" />
            <rect x="914" y="210" width="78" height="140" rx="4" className="spin-line" />

            <g className="spin-goal spin-goal--left">
              <rect x="-58" y="150" width="67" height="260" rx="8" />
              <rect x="-58" y="150" width="67" height="260" rx="8" fill="url(#spin-net)" />
            </g>
            <g className="spin-goal spin-goal--right">
              <rect x="991" y="150" width="67" height="260" rx="8" />
              <rect x="991" y="150" width="67" height="260" rx="8" fill="url(#spin-net)" />
            </g>

            <PlayerShape player={state.actors?.a} mine={mySeat === 'a'} />
            <PlayerShape player={state.actors?.b} mine={mySeat === 'b'} />
            <SoccerBall ball={state.ball} />
          </g>
        </svg>

        <button
          type="button"
          className={`spin-run-button ${pressed ? 'is-pressed' : ''}`}
          onPointerDown={driveDown}
          onPointerUp={driveUp}
          onPointerCancel={driveUp}
          onLostPointerCapture={driveUp}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Бежать вперёд"
        >
          <span>➜</span>
          <small>{pressed ? 'БЕЖИМ' : 'БЕЖАТЬ'}</small>
        </button>

        {state.phase === 'round-over' && state.status === 'playing' && (
          <div className="spin-round-banner" aria-live="polite">
            <span>{state.roundWinner ? (state.roundWinner === mySeat ? '⚽✨' : '🥅') : '🤝'}</span>
            <strong>{state.roundWinner ? (state.roundWinner === mySeat ? 'Гол! Раунд твой' : 'Гол соперника') : 'Ничья'}</strong>
            <small>{state.roundMessage}</small>
          </div>
        )}
      </div>

      <div className="spin-help">
        <span><b>Стоишь</b> — крутишься</span>
        <span><b>Держишь кнопку</b> — бежишь прямо</span>
        <span><b>Касаешься мяча</b> — траектория зависит от точки удара</span>
        <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Выйти из матча</button>
      </div>

      {error && <div className="game-error">{error}</div>}

      {result && (
        <div className="spin-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`spin-result ${result.won ? 'is-win' : 'is-lose'}`}>
            <div className="spin-result__icon">{result.icon}</div>
            <span className="eyebrow">Матч завершён · {myScore}:{opponentScore}</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="spin-result__actions">
              <button className="primary-button" onClick={onBack}>Выйти в главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Найти нового соперника</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
