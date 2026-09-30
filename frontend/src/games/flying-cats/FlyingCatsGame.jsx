import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './flying-cats.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;

  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createMotionPoint() {
  return {
    y: 0,
    vy: 0,
    targetY: 0,
    targetVy: 0,
    receivedAt: 0,
    ready: false,
  };
}

function feedMotion(point, data, now = performance.now()) {
  if (!point || !data) return;

  if (!point.ready) {
    point.y = data.y;
    point.ready = true;
  }

  point.targetY = data.y;
  point.targetVy = data.vy || 0;
  point.receivedAt = now;
}

function smoothMotion(point, now, dt) {
  if (!point?.ready) return;

  const age = Math.min(80, Math.max(0, now - point.receivedAt)) / 1000;
  const predicted = point.targetY + point.targetVy * age;
  const alpha = 1 - Math.exp(-31 * dt);

  point.y += (predicted - point.y) * alpha;
}

function scorePaws(score, max) {
  return Array.from({ length: max }, (_, i) => (
    <span key={i} className={i < score ? 'is-won' : ''}>🐾</span>
  ));
}

function stageName(stage) {
  if (stage === 'green') return 'ЗЕЛЁНЫЙ';
  if (stage === 'blue') return 'СИНИЙ';
  return 'КРАСНЫЙ';
}

function stageIndex(stage) {
  return stage === 'green' ? 0 : stage === 'blue' ? 1 : 2;
}

function obstacleRects(obstacle, field) {
  const x = obstacle.x;
  const width = obstacle.width;

  if (obstacle.kind === 'green') {
    if (obstacle.side === 'top') {
      return [{
        x,
        y: field.top,
        width,
        height: obstacle.height,
      }];
    }

    return [{
      x,
      y: field.bottom - obstacle.height,
      width,
      height: obstacle.height,
    }];
  }

  if (obstacle.kind === 'blue') {
    return [
      {
        x,
        y: field.top,
        width,
        height: obstacle.topHeight,
      },
      {
        x,
        y: field.bottom - obstacle.bottomHeight,
        width,
        height: obstacle.bottomHeight,
      },
    ];
  }

  return [
    {
      x,
      y: field.top,
      width,
      height: obstacle.gapStart - field.top,
    },
    {
      x,
      y: obstacle.gapStart + obstacle.gapSize,
      width,
      height: field.bottom - (obstacle.gapStart + obstacle.gapSize),
    },
  ];
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  if (state.result?.draw) {
    return {
      title: 'НИЧЬЯ',
      text: state.result?.message || 'Матч завершился вничью.',
    };
  }

  const won = state.result?.winner === state.playerSeat;

  return {
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || '',
  };
}

export default function FlyingCatsGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clockNow, setClockNow] = useState(Date.now());

  const topCatRef = useRef(null);
  const bottomCatRef = useRef(null);
  const obstacleRefs = useRef(new Map());
  const animationRef = useRef(null);
  const lastFrameRef = useRef(0);
  const lastFlapRef = useRef(0);
  const stateRef = useRef(null);

  const motionRef = useRef({
    a: createMotionPoint(),
    b: createMotionPoint(),
  });

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('flying-cats');

  stateRef.current = state;

  const field = state?.field;
  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const result = resultPresentation(state);
  const canFlap = state?.status === 'playing' && state?.phase === 'playing';

  useEffect(() => {
    if (!state?.cats) return;

    const now = performance.now();
    feedMotion(motionRef.current.a, state.cats.a, now);
    feedMotion(motionRef.current.b, state.cats.b, now);
  }, [state?.cats]);

  useEffect(() => {
    if (!state) return undefined;

    const timer = setInterval(() => setClockNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    function frame(now) {
      const dt = lastFrameRef.current
        ? clamp((now - lastFrameRef.current) / 1000, 0, 0.05)
        : 1 / 60;

      lastFrameRef.current = now;

      smoothMotion(motionRef.current.a, now, dt);
      smoothMotion(motionRef.current.b, now, dt);

      const setCat = (ref, seat) => {
        if (!ref || !motionRef.current[seat].ready) return;
        ref.setAttribute(
          'transform',
          `translate(238 ${motionRef.current[seat].y})`,
        );
      };

      setCat(bottomCatRef.current, 'a');
      setCat(topCatRef.current, 'b');

      const snapshot = stateRef.current;

      if (snapshot?.phase === 'playing' && snapshot?.obstacles) {
        const age = Math.min(
          100,
          Math.max(0, Date.now() - (snapshot.serverTime || Date.now())),
        ) / 1000;

        for (const obstacle of snapshot.obstacles) {
          const node = obstacleRefs.current.get(obstacle.id);
          if (!node) continue;

          node.setAttribute(
            'transform',
            `translate(${-(obstacle.speed || 0) * age} 0)`,
          );
        }
      }

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function keyDown(event) {
      if (event.code !== 'Space') return;
      if (event.target?.matches?.('input, textarea, select, button')) return;

      event.preventDefault();

      if (!canFlap) return;

      const now = performance.now();
      if (now - lastFlapRef.current < 72) return;

      lastFlapRef.current = now;
      sendAction({ type: 'flap' });
    }

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [canFlap, sendAction]);

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function flap() {
    if (!canFlap) return;

    const now = performance.now();
    if (now - lastFlapRef.current < 72) return;

    lastFlapRef.current = now;
    sendAction({ type: 'flap' });
  }

  function arenaPointerDown(event) {
    if (!canFlap) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    flap();
  }

  if (!state && !waiting) {
    return (
      <section className="fc-lobby">
        <div className="fc-lobby__cats" aria-hidden="true">
          <span>🐱</span><span>🚀</span><span>🐱</span>
        </div>

        <span className="eyebrow">Реакция · одновременно · до 3 побед</span>
        <h1>Летающие котики</h1>

        <p>
          Оба котика летают в одном общем поле. Нижнего тянет вниз, верхнего —
          вверх, но каждый может перелететь хоть на противоположную сторону экрана.
        </p>

        <div className="fc-rules">
          <span><i className="is-green" />20 сек · одна случайная труба</span>
          <span><i className="is-blue" />20 сек · короткая + длинная</span>
          <span><i className="is-red" />20 сек · узкий проход</span>
        </div>

        {error && <div className="game-error">{error}</div>}

        <button
          type="button"
          className="primary-button primary-button--large"
          onClick={findMatch}
        >
          Найти соперника
        </button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="fc-waiting">
        <div className="fc-waiting__cat">🐱</div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго котика…</h2>
        <p>Как только соперник подключится — начнётся отсчёт.</p>

        <button
          type="button"
          className="secondary-button"
          onClick={cancelSearch}
        >
          Отменить поиск
        </button>
      </section>
    );
  }

  if (!state || !field) return null;

  const myScore = me ? state.scores?.[me] ?? 0 : 0;
  const foeScore = foe ? state.scores?.[foe] ?? 0 : 0;
  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';

  const remainingMs = state.phase === 'playing' && state.roundStartedAt
    ? Math.max(0, state.roundDurationMs - (clockNow - state.roundStartedAt))
    : state.roundDurationMs;

  const remainingSec = Math.ceil(remainingMs / 1000);

  const countdown = state.phase === 'countdown'
    ? Math.max(1, Math.ceil((state.countdownEndsAt - clockNow) / 800))
    : null;

  const stageElapsed = state.phase === 'playing' && state.roundStartedAt
    ? Math.max(0, (clockNow - state.roundStartedAt) / 1000)
    : 0;

  const stageRemaining = Math.max(0, 20 - (stageElapsed % 20));
  const progress = clamp(stageElapsed / 60, 0, 1);
  const currentStageIndex = stageIndex(state.stage);
  const myCatText = me === 'b' ? 'ТВОЙ КОТИК — СИНИЙ' : 'ТВОЙ КОТИК — КРАСНЫЙ';

  const renderedObstacles = (state.obstacles || []).map((obstacle) => {
    const colorClass = `fc-pipe fc-pipe--${obstacle.kind}`;
    const rects = obstacleRects(obstacle, field);

    return (
      <g
        key={obstacle.id}
        ref={(node) => {
          if (node) obstacleRefs.current.set(obstacle.id, node);
          else obstacleRefs.current.delete(obstacle.id);
        }}
      >
        {rects.map((rect, index) => {
          const attachedTop = Math.abs(rect.y - field.top) < 2;
          const lipY = attachedTop
            ? rect.y + Math.max(0, rect.height - 20)
            : rect.y;

          return (
            <g key={index} className={colorClass}>
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx="7"
                className="fc-pipe__body"
              />

              <rect
                x={rect.x - 6}
                y={lipY}
                width={rect.width + 12}
                height={Math.min(22, rect.height)}
                rx="7"
                className="fc-pipe__lip"
              />
            </g>
          );
        })}
      </g>
    );
  });

  return (
    <section className="fc-shell">
      <header className="fc-scorebar">
        <div className="fc-player">
          <span className="fc-player__dot fc-player__dot--me" />

          <div>
            <small>{myName}</small>
            <strong>{scorePaws(myScore, state.winsToMatch)}</strong>
          </div>
        </div>

        <div className="fc-round">
          <small>РАУНД {state.round}</small>
          <strong>{remainingSec}s</strong>
        </div>

        <div className="fc-player fc-player--right">
          <div>
            <small>{foeName}</small>
            <strong>{scorePaws(foeScore, state.winsToMatch)}</strong>
          </div>

          <span className="fc-player__dot fc-player__dot--foe" />
        </div>
      </header>

      <div className="fc-stage-strip">
        {['green', 'blue', 'red'].map((item, index) => (
          <div
            key={item}
            className={`fc-stage fc-stage--${item} ${
              index === currentStageIndex && state.phase === 'playing'
                ? 'is-active'
                : ''
            }`}
          >
            <span>{stageName(item)}</span>
            <b>
              {index === currentStageIndex && state.phase === 'playing'
                ? `${Math.ceil(stageRemaining)}с`
                : '20с'}
            </b>
          </div>
        ))}

        <i
          className="fc-stage-strip__progress"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div
        className={`fc-arena fc-arena--${state.stage}`}
        onPointerDown={arenaPointerDown}
        role="button"
        tabIndex={0}
        aria-label="Нажми, чтобы котик подпрыгнул"
      >
        <svg
          viewBox={`0 0 ${field.width} ${field.height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="fcSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#48c7f8" />
              <stop offset="48%" stopColor="#78ddff" />
              <stop offset="100%" stopColor="#39b9ed" />
            </linearGradient>

            <linearGradient id="fcGrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b7f45c" />
              <stop offset="100%" stopColor="#69c934" />
            </linearGradient>
          </defs>

          <rect width={field.width} height={field.height} fill="url(#fcSky)" />

          <g className="fc-clouds fc-clouds--top">
            <ellipse cx="170" cy="86" rx="150" ry="48" />
            <ellipse cx="410" cy="66" rx="205" ry="62" />
            <ellipse cx="785" cy="92" rx="240" ry="70" />
            <ellipse cx="1095" cy="70" rx="160" ry="52" />
          </g>

          <g className="fc-clouds fc-clouds--bottom">
            <ellipse cx="150" cy="632" rx="170" ry="52" />
            <ellipse cx="480" cy="650" rx="230" ry="68" />
            <ellipse cx="870" cy="626" rx="260" ry="74" />
            <ellipse cx="1150" cy="652" rx="160" ry="54" />
          </g>

          <rect x="0" y="0" width={field.width} height={field.top} className="fc-earth" />
          <rect x="0" y={field.top} width={field.width} height="10" fill="url(#fcGrass)" />

          <rect
            x="0"
            y={field.bottom - 10}
            width={field.width}
            height="10"
            fill="url(#fcGrass)"
          />

          <rect
            x="0"
            y={field.bottom}
            width={field.width}
            height={field.height - field.bottom}
            className="fc-earth"
          />

          {renderedObstacles}

          <g
            ref={topCatRef}
            transform={`translate(238 ${state.cats.b.y})`}
            className={`fc-cat ${me === 'b' ? 'is-mine' : ''}`}
          >
            <g transform="rotate(180)">
              <ellipse cx="-24" cy="4" rx="20" ry="12" className="fc-cat__flame" />
              <ellipse cx="0" cy="0" rx="36" ry="30" className="fc-cat__pod fc-cat__pod--blue" />
              <circle cx="0" cy="-4" r="24" className="fc-cat__head" />
              <path d="M-17 -19 L-10 -35 L-2 -19 M17 -19 L10 -35 L2 -19" className="fc-cat__ears" />
              <circle cx="-8" cy="-6" r="3" className="fc-cat__eye" />
              <circle cx="8" cy="-6" r="3" className="fc-cat__eye" />
              <path d="M-5 5 Q0 9 5 5" className="fc-cat__mouth" />
            </g>

            <g className={`fc-cat__tag ${me === 'b' ? 'is-me' : ''}`} transform="translate(0 46)">
              <rect x="-24" y="-10" width="48" height="20" rx="10" />
              <text x="0" y="4" textAnchor="middle">
                {me === 'b' ? 'ТЫ' : 'ОН'}
              </text>
            </g>
          </g>

          <g
            ref={bottomCatRef}
            transform={`translate(238 ${state.cats.a.y})`}
            className={`fc-cat ${me === 'a' ? 'is-mine' : ''}`}
          >
            <ellipse cx="-24" cy="4" rx="20" ry="12" className="fc-cat__flame" />
            <ellipse cx="0" cy="0" rx="36" ry="30" className="fc-cat__pod fc-cat__pod--red" />
            <circle cx="0" cy="-4" r="24" className="fc-cat__head" />
            <path d="M-17 -19 L-10 -35 L-2 -19 M17 -19 L10 -35 L2 -19" className="fc-cat__ears" />
            <circle cx="-8" cy="-6" r="3" className="fc-cat__eye" />
            <circle cx="8" cy="-6" r="3" className="fc-cat__eye" />
            <path d="M-5 5 Q0 9 5 5" className="fc-cat__mouth" />

            <g className={`fc-cat__tag ${me === 'a' ? 'is-me' : ''}`} transform="translate(0 -48)">
              <rect x="-24" y="-10" width="48" height="20" rx="10" />
              <text x="0" y="4" textAnchor="middle">
                {me === 'a' ? 'ТЫ' : 'ОН'}
              </text>
            </g>
          </g>
        </svg>

        {state.phase === 'countdown' && (
          <div className="fc-overlay">
            <span>РАУНД {state.round}</span>
            <strong>{countdown}</strong>
            <small>{myCatText}</small>
          </div>
        )}

        {state.phase === 'round-over' && (
          <div className="fc-overlay fc-overlay--round">
            <span>РАУНД ЗАВЕРШЁН</span>
            <strong>
              {state.roundWinner
                ? state.roundWinner === me
                  ? 'ТВОЙ!'
                  : 'СОПЕРНИКА'
                : 'НИЧЬЯ'}
            </strong>
            <small>{state.roundMessage}</small>
          </div>
        )}

        {state.phase === 'playing' && state.roundMessage && (
          <div className={`fc-stage-pop fc-stage-pop--${state.stage}`}>
            {state.roundMessage}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`fc-jump fc-jump--${state.stage}`}
        disabled={!canFlap}
        onPointerDown={(event) => {
          event.preventDefault();
          flap();
        }}
      >
        <span>🐾</span>
        <b>{canFlap ? 'ПРЫЖОК' : 'ЖДЁМ…'}</b>
        <small>или нажми прямо на поле</small>
      </button>

      <p className="fc-tip">
        Зелёный — одна случайная труба · Синий — одна сторона короткая, другая длинная · Красный — узкий общий проход
      </p>

      {result && (
        <div className="fc-result">
          <div className="fc-result__card">
            <span>Летающие котики</span>
            <div className="fc-result__cat">🐱🚀</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>

            <div className="fc-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>
                Новый соперник
              </button>

              <button type="button" className="secondary-button" onClick={onBack}>
                Все игры
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
