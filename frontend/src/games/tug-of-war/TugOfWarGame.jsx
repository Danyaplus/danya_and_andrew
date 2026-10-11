import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './tug-of-war.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const name = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', name);
  return name;
}

function Character({ x, color, flipped = false, pulling = false, mine = false }) {
  const blue = color === 'blue';
  return (
    <g transform={`translate(${x} 278) scale(${flipped ? -1 : 1} 1)`}
      className={`tug-character ${pulling ? 'is-pulling' : ''}`}>
      <ellipse cx="0" cy="90" rx="79" ry="12" fill="#0c3d30" opacity=".18" />
      <g className="tug-character__legs" stroke="#213b49" strokeWidth="15" strokeLinecap="round">
        <path d="M-19 48 L-38 79 L-61 79" fill="none" />
        <path d="M18 49 L43 79 L64 79" fill="none" />
      </g>
      <path d="M-38 12 Q0 -16 42 11 L32 64 Q0 80 -32 64Z" fill={blue ? '#388ef3' : '#ff655c'} stroke="#223448" strokeWidth="5" />
      <path d="M-31 23 Q0 6 32 23" fill="none" stroke={blue ? '#8ccaff' : '#ffb9a4'} strokeWidth="6" strokeLinecap="round" />
      <path d="M12 18 Q44 -1 68 -18" fill="none" stroke="#e9b78f" strokeWidth="17" strokeLinecap="round" />
      <path d="M-22 13 Q2 -3 35 -18" fill="none" stroke="#f2c39c" strokeWidth="15" strokeLinecap="round" />
      <g className="tug-character__head">
        <circle cx="0" cy="-36" r="37" fill="#ffd1a3" stroke="#293b48" strokeWidth="5" />
        <path d="M-36 -45 Q-35 -91 10 -79 Q43 -78 37 -47 Q21 -59 12 -66 Q-4 -51 -36 -45" fill={blue ? '#293b60' : '#62371f'} />
        <ellipse cx="-12" cy="-38" rx="5" ry="6" fill="#243442" />
        <ellipse cx="15" cy="-38" rx="5" ry="6" fill="#243442" />
        <path d="M-8 -19 Q2 -12 13 -20" fill="none" stroke="#a45e4f" strokeWidth="4" strokeLinecap="round" />
        <circle cx="-22" cy="-23" r="7" fill="#ff9d89" opacity=".65" />
        <circle cx="26" cy="-23" r="7" fill="#ff9d89" opacity=".65" />
      </g>
      <circle cx="65" cy="-19" r="10" fill="#ffd1a3" stroke="#253746" strokeWidth="3" />
      <circle cx="34" cy="-19" r="9" fill="#ffd1a3" stroke="#253746" strokeWidth="3" />
      {mine && <g transform="translate(0 -114)"><path d="M-25 -28 H25 Q35 -28 35 -18 V0 Q35 10 25 10 H6 L0 22 L-6 10 H-25 Q-35 10 -35 0 V-18 Q-35 -28 -25 -28" fill="#fffdf0" stroke="#2b4751" strokeWidth="3" /><text y="0" textAnchor="middle" fontWeight="900" fontSize="18" fill="#253746">ТЫ</text></g>}
    </g>
  );
}

function Arena({ state, me }) {
  const position = Math.max(-100, Math.min(100, state?.position ?? 0));
  const move = position * 1.8;
  const offset = position * 2.15;
  const markX = 480 + offset;
  return (
    <svg className="tug-arena" viewBox="0 0 960 430" role="img" aria-label={`Положение каната: ${position < -2 ? 'тянут красные' : position > 2 ? 'тянут синие' : 'по центру'}`}>
      <defs>
        <linearGradient id="tug-sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#89e3f5"/><stop offset="100%" stopColor="#e8ffef"/></linearGradient>
        <linearGradient id="tug-grass" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#67c974"/><stop offset="100%" stopColor="#247e55"/></linearGradient>
        <pattern id="tug-ground-dots" width="35" height="35" patternUnits="userSpaceOnUse"><circle cx="7" cy="12" r="3" fill="#fff" opacity=".09" /></pattern>
      </defs>
      <rect width="960" height="430" fill="url(#tug-sky)" />
      <g fill="#ffffff" opacity=".7"><ellipse cx="165" cy="84" rx="115" ry="26"/><ellipse cx="205" cy="59" rx="67" ry="39"/><ellipse cx="780" cy="94" rx="118" ry="28"/><ellipse cx="738" cy="68" rx="69" ry="40"/></g>
      <path d="M0 251 Q180 180 335 242 Q472 179 622 236 Q840 181 960 243 V430 H0Z" fill="#b4e5a2" />
      <path d="M0 295 Q180 247 370 297 Q540 244 710 291 Q840 251 960 287 V430 H0Z" fill="url(#tug-grass)" />
      <rect y="310" width="960" height="120" fill="url(#tug-ground-dots)" />
      <path d="M0 352 Q480 340 960 352" stroke="#f0d8a3" strokeWidth="54" fill="none" opacity=".83" />
      <path d="M0 352 Q480 340 960 352" stroke="#d6ac72" strokeWidth="3" strokeDasharray="18 16" fill="none" opacity=".7" />
      <g strokeWidth="4" strokeLinecap="round">
        <path d="M64 312 V188" stroke="#80624a"/><path d="M896 312 V188" stroke="#80624a"/>
      </g>
      <path d="M64 188 H159 Q160 221 64 221 Z" fill="#fa5358" stroke="#d03344" strokeWidth="3" />
      <path d="M896 188 H801 Q800 221 896 221 Z" fill="#468fff" stroke="#2665b8" strokeWidth="3" />
      <path d="M480 286 V385" stroke="#fff" strokeWidth="5" strokeDasharray="8 10" opacity=".85" />
      <path d="M480 276 L461 300 H499Z" fill="#fff" opacity=".85" />
      <g transform={`translate(${move} 0)`}>
        <path d="M171 258 Q340 268 480 258 Q640 251 789 258" fill="none" stroke="#674329" strokeWidth="20" strokeLinecap="round" />
        <path d="M171 255 Q340 265 480 255 Q640 248 789 255" fill="none" stroke="#d5a56d" strokeWidth="13" strokeLinecap="round" />
        <path d="M177 251 Q347 261 480 251 Q646 244 783 251" fill="none" stroke="#f7d6a1" strokeWidth="3" strokeDasharray="11 7" strokeLinecap="round" />
      </g>
      <Character x={170 + move} color="red" flipped={false} pulling={state?.pulling?.a} mine={me === 'a'} />
      <Character x={790 + move} color="blue" flipped pulling={state?.pulling?.b} mine={me === 'b'} />
      <g transform={`translate(${markX} 257)`}>
        <rect x="-11" y="-26" rx="7" width="22" height="54" fill="#fff8e2" stroke="#4b3a38" strokeWidth="4" />
        <path d="M-9 -17 H9 M-9 -2 H9 M-9 13 H9" stroke="#f46859" strokeWidth="7" />
        <path d="M0 33 L-13 55 H13Z" fill="#ffefac" stroke="#6e5634" strokeWidth="3" />
      </g>
      <g fill="#fff"><circle cx="104" cy="334" r="4" opacity=".45"/><circle cx="877" cy="329" r="4" opacity=".5"/></g>
    </svg>
  );
}

export default function TugOfWarGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const { waiting, state, error, setError, findMatch: startMatch, cancelSearch, sendAction } = useMultiplayerGame('tug-of-war');
  const sendRef = useRef(sendAction);
  const canPullRef = useRef(false);
  sendRef.current = sendAction;
  const canPull = state?.status === 'playing' && state?.phase === 'playing';
  canPullRef.current = Boolean(canPull);

  useEffect(() => {
    const keydown = (event) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const tag = event.target?.tagName?.toLowerCase();
      if (['button', 'input', 'textarea', 'select'].includes(tag) && !event.target?.classList?.contains('tug-pull-button')) return;
      if (!canPullRef.current) return;
      event.preventDefault();
      sendRef.current({ type: 'pull' });
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myScore = me ? state.scores?.[me] ?? 0 : 0;
  const foeScore = foe ? state.scores?.[foe] ?? 0 : 0;
  const myName = me ? state.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state.players?.[foe]?.name || 'Соперник' : 'Соперник';
  const count = state?.phase === 'countdown' ? Math.max(1, Math.ceil((state.countdownLeftMs ?? 0) / 1000)) : null;
  const timeLeft = Math.ceil((state?.roundLeftMs ?? 0) / 1000);
  const scoreLabel = state?.status === 'finished' ? 'Матч окончен' : state?.phase === 'countdown' ? 'Приготовься!' : state?.phase === 'round-over' ? 'Раунд завершён' : 'ТЯНИ!';
  const position = Math.max(-100, Math.min(100, state?.position ?? 0));
  const mineLeading = me === 'a' ? position < -2 : position > 2;
  const result = state?.result;
  const outcome = result?.winner === null ? 'Ничья!' : result?.winner === me ? 'Ты победил!' : 'Соперник победил';

  function pull(event) {
    event?.preventDefault?.();
    if (canPullRef.current) sendRef.current({ type: 'pull' });
  }

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  if (!state && !waiting) {
    return (
      <section className="tug-lobby">
        <div className="tug-lobby__symbol">🪢</div>
        <span className="tug-kicker">Онлайн · 2 игрока</span>
        <h1>Перетягивание каната</h1>
        <p>Красная команда против синей! После отсчёта жми кнопку как можно быстрее, чтобы перетянуть канат. Побеждает первый, кто выиграет два раунда.</p>
        <div className="tug-rules"><span>🏆 До 2 побед</span><span>⏱ 28 секунд на раунд</span><span>👆 Тап или пробел</span></div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="tug-lobby tug-waiting">
        <div className="tug-lobby__symbol tug-waiting__symbol">🪢</div>
        <span className="tug-kicker">Поиск матча</span>
        <h2>Ждём соперника…</h2>
        <p>Как только второй игрок подключится, начнётся обратный отсчёт.</p>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="tug-game">
      <div className="tug-hud">
        <div className={`tug-hud__player ${me === 'a' ? 'is-red' : 'is-blue'}`}><small>ТЫ</small><strong title={myName}>{myName}</strong><b>{myScore}</b></div>
        <div className="tug-hud__center"><small>Раунд {state.round}/{state.maxRounds}</small><strong>{scoreLabel}</strong><span>{state.phase === 'playing' ? `${timeLeft} сек` : `до ${state.winsRequired} побед`}</span></div>
        <div className={`tug-hud__player is-foe ${foe === 'a' ? 'is-red' : 'is-blue'}`}><small>СОПЕРНИК</small><strong title={foeName}>{foeName}</strong><b>{foeScore}</b></div>
      </div>

      <div className="tug-stage">
        <div className="tug-stage__header"><span className="tug-pill is-red">🔴 {state.players?.a?.name}</span><span className="tug-stage__vs">VS</span><span className="tug-pill is-blue">🔵 {state.players?.b?.name}</span></div>
        <Arena state={state} me={me} />
        {state.phase === 'countdown' && (
          <div className="tug-stage__overlay" aria-live="polite"><span>НА СТАРТ!</span><strong key={`${state.round}-${count}`}>{count}</strong><small>Приготовь палец!</small></div>
        )}
        {state.phase === 'round-over' && (
          <div className="tug-stage__overlay is-round-over" aria-live="polite"><span>РАУНД {state.round}</span><strong>{state.roundWinner === me ? '🏆' : state.roundWinner ? '⚡' : '🤝'}</strong><small>{state.roundWinner === me ? 'Ты выиграл раунд!' : state.roundWinner ? 'Очко сопернику' : 'Ничья в раунде!'}</small></div>
        )}
      </div>

      <div className="tug-meter" aria-label="Сила перетягивания">
        <div className="tug-meter__titles"><span>🔴 Красные</span><span>ЦЕНТР</span><span>Синие 🔵</span></div>
        <div className="tug-meter__track"><span className="tug-meter__middle"/><div className="tug-meter__fill" style={{ left: `${Math.min(50, 50 + position / 2)}%`, width: `${Math.abs(position) / 2}%`, background: position < 0 ? '#ff6763' : '#4b9eff' }}/><div className="tug-meter__marker" style={{ left: `${50 + position / 2}%` }}>▼</div></div>
        <p>{state.phase === 'playing' ? mineLeading ? '🔥 Отлично, ты ведёшь! Не останавливайся!' : '💪 Жми быстрее, чтобы перетянуть канат!' : 'Перетяни центральную отметку к своему финишу.'}</p>
      </div>

      <div className="tug-controls">
        <button type="button" className={`tug-pull-button ${canPull ? 'is-ready' : ''}`} disabled={!canPull}
          onPointerDown={pull} onClick={(event) => { if (event.detail === 0) pull(event); }}
          onContextMenu={(event) => event.preventDefault()} aria-label="Тянуть канат">
          <span className="tug-pull-button__icon">✊</span><strong>{canPull ? 'ТЯНИ!' : 'ЖДИ СТАРТА'}</strong><small>{canPull ? 'Нажимай быстро!' : 'Скоро начнём…'}</small>
        </button>
        <div className="tug-controls__hint"><strong>Как играть?</strong><span>На телефоне — быстро нажимай кнопку.</span><span>На компьютере — нажимай пробел или Enter.</span><span>У соперника такая же кнопка!</span></div>
      </div>

      {state.status === 'playing' && <button type="button" className="tug-resign danger-button" onClick={() => sendAction({ type: 'resign' })}>Сдаться</button>}
      {error && <div className="game-error">{error}</div>}
      {result && (
        <div className="tug-result-backdrop" role="dialog" aria-modal="true" aria-label={outcome}>
          <div className="tug-result"><div className="tug-result__emoji">{result.winner === null ? '🤝' : result.winner === me ? '🏆' : '🎯'}</div><span className="tug-kicker">Матч завершён</span><h2>{outcome}</h2><p>{result.message}</p><div className="tug-result__score">{myScore} : {foeScore}</div><div className="tug-result__actions"><button type="button" className="primary-button" onClick={findMatch}>Играть снова</button><button type="button" className="secondary-button" onClick={() => onBack?.()}>В меню</button></div></div>
        </div>
      )}
    </section>
  );
}
