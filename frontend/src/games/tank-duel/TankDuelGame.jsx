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

function TankShape({ tank, mine }) {
  if (!tank) return null;
  const degrees = (tank.angle * 180) / Math.PI;
  return (
    <g
      className={`tank-sprite tank-sprite--${tank.color} ${mine ? 'is-mine' : ''}`}
      transform={`translate(${tank.x} ${tank.y}) rotate(${degrees})`}
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

function Obstacle({ obstacle }) {
  if (obstacle.type === 'circle') {
    return (
      <g className="tank-bush" transform={`translate(${obstacle.x} ${obstacle.y})`}>
        <circle r={obstacle.r} />
        <circle cx="-15" cy="-5" r="15" />
        <circle cx="13" cy="-10" r="16" />
        <circle cx="7" cy="14" r="16" />
        <circle cx="-12" cy="14" r="14" />
        <circle className="tank-bush__core" r="11" />
      </g>
    );
  }

  return (
    <rect
      x={obstacle.x}
      y={obstacle.y}
      width={obstacle.w}
      height={obstacle.h}
      rx={obstacle.style === 'stone' ? 5 : 7}
      className={`tank-obstacle tank-obstacle--${obstacle.style}`}
    />
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
          <span>{state.phase === 'round-over' ? 'Раунд завершён' : 'Бой идёт'}</span>
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

      <div className="tank-arena-shell">
        <svg
          className="tank-arena"
          viewBox={`0 0 ${state.arena?.width || 1000} ${state.arena?.height || 620}`}
          role="img"
          aria-label="Арена танковой дуэли"
        >
          <defs>
            <pattern id="tank-sand-pattern" width="54" height="36" patternUnits="userSpaceOnUse">
              <path d="M0 20 C13 5 32 34 54 13" className="tank-sand-line" fill="none" />
              <circle cx="11" cy="8" r="2" className="tank-sand-speck" />
              <circle cx="41" cy="27" r="1.8" className="tank-sand-speck" />
            </pattern>
          </defs>
          <rect className="tank-sand" width="1000" height="620" rx="30" />
          <rect fill="url(#tank-sand-pattern)" width="1000" height="620" rx="30" />

          {(state.obstacles || []).map((obstacle) => <Obstacle key={obstacle.id} obstacle={obstacle} />)}

          {(state.bullets || []).map((bullet) => (
            <g key={bullet.id} className="tank-bullet" transform={`translate(${bullet.x} ${bullet.y})`}>
              <circle r="9" className="tank-bullet__glow" />
              <circle r="5.5" className="tank-bullet__core" />
            </g>
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
