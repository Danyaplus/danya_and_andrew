import { useMemo, useState } from 'react';
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
  const didWin = state.result?.winner === state.playerSide;

  let text = state.result?.message || 'Матч завершён.';
  if (state.result?.type === 'disconnect') {
    text = didWin ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  } else if (state.result?.type === 'resign') {
    text = didWin ? 'Соперник вышел из гонки.' : 'Вы покинули гонку.';
  }

  return {
    kind: didWin ? 'win' : 'lose',
    icon: didWin ? '🏆' : '💥',
    title: didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}

function phaseText(state) {
  if (!state) return '';
  if (state.phase === 'countdown') return 'Приготовься';
  if (state.phase === 'roundOver') return state.roundMessage || 'Раунд завершён';
  if (state.phase === 'playing') return 'Не врежься в световой след';
  return 'Матч завершён';
}

function countdownNumber(milliseconds) {
  if (milliseconds <= 0) return 'GO';
  return Math.max(1, Math.ceil(milliseconds / 1000));
}

export default function TronLightCyclesGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
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
    startMatch(playerName);
  }

  function turn(direction) {
    if (!state || state.status !== 'playing' || state.phase !== 'playing') return;
    sendAction({ type: 'turn', payload: { direction } });
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="tron-lobby">
        <div className="tron-lobby__icon" aria-hidden="true">◢━</div>
        <span className="eyebrow">Световая дуэль · до 3 побед</span>
        <h1>Tron: Light Cycles</h1>
        <p>
          Мотоцикл едет постоянно и оставляет за собой стену света. Поворачивай влево или вправо —
          кто первым врежется в край арены или любой световой след, тот проигрывает раунд.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>
          Найти соперника
        </button>
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
  const flipped = mySide === 'b';
  const result = resultPresentation(state);
  const controlsEnabled = state.status === 'playing' && state.phase === 'playing';

  const crashPoint = useMemo(() => {
    if (!state.lastCrash) return null;
    return state.lastCrash;
  }, [state.lastCrash]);

  return (
    <section className="tron-match">
      <div className="tron-scoreboard">
        <div className="tron-player tron-player--opponent" style={{ '--tron-color': opponent?.color }}>
          <div className="tron-player__dot" />
          <div className="tron-player__meta">
            <strong>{opponent?.name || 'Соперник'}</strong>
            <small>соперник</small>
          </div>
          <b>{opponent?.score ?? 0}</b>
        </div>

        <div className="tron-round-badge">
          <span>РАУНД</span>
          <strong>{state.round}</strong>
          <small>до {state.targetScore}</small>
        </div>

        <div className="tron-player tron-player--me" style={{ '--tron-color': me?.color }}>
          <b>{me?.score ?? 0}</b>
          <div className="tron-player__meta tron-player__meta--right">
            <strong>{me?.name || playerName}</strong>
            <small>ты</small>
          </div>
          <div className="tron-player__dot" />
        </div>
      </div>

      <div className="tron-status-pill">{phaseText(state)}</div>

      <div className="tron-arena-shell">
        <svg
          className="tron-arena"
          viewBox={`0 0 ${state.arena?.width || 100} ${state.arena?.height || 140}`}
          role="img"
          aria-label="Арена световых мотоциклов"
        >
          <defs>
            <pattern id={`tron-grid-${state.roomId}`} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" className="tron-grid-line" fill="none" />
            </pattern>
            <filter id={`tron-glow-${state.roomId}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="1.4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <clipPath id={`tron-clip-${state.roomId}`}>
              <rect x="1.2" y="1.2" width="97.6" height="137.6" rx="2" />
            </clipPath>
          </defs>

          <rect x="0.8" y="0.8" width="98.4" height="138.4" rx="2.5" className="tron-arena-bg" />
          <rect x="1.2" y="1.2" width="97.6" height="137.6" rx="2" fill={`url(#tron-grid-${state.roomId})`} />
          <path d="M 2 70 H 98" className="tron-center-line" />

          <g
            clipPath={`url(#tron-clip-${state.roomId})`}
            transform={flipped ? 'rotate(180 50 70)' : undefined}
          >
            {['a', 'b'].map((side) => {
              const player = state.players?.[side];
              const cycle = player?.cycle;
              if (!cycle) return null;

              return (
                <g key={side} style={{ '--cycle-color': player.color }}>
                  {(cycle.segments || []).map((segment, index) => (
                    <line
                      key={`${side}-trail-${index}`}
                      x1={segment.x1}
                      y1={segment.y1}
                      x2={segment.x2}
                      y2={segment.y2}
                      className="tron-trail"
                      stroke={player.color}
                      filter={`url(#tron-glow-${state.roomId})`}
                    />
                  ))}

                  <g
                    className="tron-cycle"
                    transform={`translate(${cycle.x} ${cycle.y}) rotate(${cycle.dir * 90})`}
                    filter={`url(#tron-glow-${state.roomId})`}
                  >
                    <circle r="2.15" fill={player.color} className="tron-cycle__halo" />
                    <rect x="-1.35" y="-1.15" width="2.9" height="2.3" rx="0.65" className="tron-cycle__body" />
                    <path d="M 3 0 L 0.6 -1.35 L 0.6 1.35 Z" fill={player.color} />
                    <circle cx="-0.6" cy="-1.45" r="0.55" className="tron-cycle__wheel" />
                    <circle cx="-0.6" cy="1.45" r="0.55" className="tron-cycle__wheel" />
                  </g>
                </g>
              );
            })}

            {crashPoint && (
              <g transform={`translate(${crashPoint.x} ${crashPoint.y})`} className="tron-crash">
                <circle r="2.3" />
                <circle r="5" />
                <path d="M-7 0H7M0-7V7M-5-5L5 5M5-5L-5 5" />
              </g>
            )}
          </g>

          {state.phase === 'countdown' && (
            <g className="tron-countdown">
              <rect x="34" y="58" width="32" height="24" rx="7" />
              <text x="50" y="74" textAnchor="middle">
                {countdownNumber(state.countdownMs)}
              </text>
            </g>
          )}

          {state.phase === 'roundOver' && (
            <g className="tron-round-overlay">
              <rect x="14" y="57" width="72" height="26" rx="7" />
              <text x="50" y="68" textAnchor="middle" className="tron-round-overlay__title">
                {state.roundWinner === mySide ? 'РАУНД ТВОЙ' : state.roundWinner ? 'РАУНД СОПЕРНИКА' : 'НИЧЬЯ'}
              </text>
              <text x="50" y="76" textAnchor="middle" className="tron-round-overlay__sub">
                следующий старт через секунду
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className="tron-controls" aria-label="Управление поворотами">
        <button
          type="button"
          className="tron-control tron-control--left"
          disabled={!controlsEnabled}
          onPointerDown={(event) => {
            event.preventDefault();
            turn('left');
          }}
        >
          <span>↶</span>
          <small>ВЛЕВО</small>
        </button>

        <div className="tron-control-hint">
          <strong>{controlsEnabled ? 'Едешь автоматически' : phaseText(state)}</strong>
          <small>Не разворачивайся в свой след</small>
        </div>

        <button
          type="button"
          className="tron-control tron-control--right"
          disabled={!controlsEnabled}
          onPointerDown={(event) => {
            event.preventDefault();
            turn('right');
          }}
        >
          <span>↷</span>
          <small>ВПРАВО</small>
        </button>
      </div>

      {error && <div className="game-error tron-error">{error}</div>}

      {state.status === 'playing' && (
        <button type="button" className="danger-button tron-resign" onClick={resign}>
          Покинуть матч
        </button>
      )}

      {result && (
        <div className="tron-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`tron-result-card tron-result-card--${result.kind}`}>
            <div className="tron-result-icon">{result.icon}</div>
            <span className="eyebrow">Гонка завершена</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="tron-result-score">
              <span style={{ '--score-color': me?.color }}>{me?.score ?? 0}</span>
              <b>:</b>
              <span style={{ '--score-color': opponent?.color }}>{opponent?.score ?? 0}</span>
            </div>
            <div className="tron-result-actions">
              <button type="button" className="primary-button" onClick={() => onBack?.()}>
                Выйти в главное меню
              </button>
              <button type="button" className="secondary-button" onClick={findMatch}>
                Найти нового соперника
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
