import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './chess.css';

// U+FE0E forces text presentation on iOS/Safari.
// Without it, especially ♟ may be rendered as a large glossy emoji.
const TEXT_VARIATION = '\uFE0E';
const PIECES = {
  wp: `♙${TEXT_VARIATION}`, wn: `♘${TEXT_VARIATION}`, wb: `♗${TEXT_VARIATION}`, wr: `♖${TEXT_VARIATION}`, wq: `♕${TEXT_VARIATION}`, wk: `♔${TEXT_VARIATION}`,
  bp: `♟${TEXT_VARIATION}`, bn: `♞${TEXT_VARIATION}`, bb: `♝${TEXT_VARIATION}`, br: `♜${TEXT_VARIATION}`, bq: `♛${TEXT_VARIATION}`, bk: `♚${TEXT_VARIATION}`,
};

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function formatClock(milliseconds = 0) {
  const safe = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function squareColor(row, col) {
  return (row + col) % 2 === 0 ? 'light' : 'dark';
}


function secretEventType(event) {
  if (!event) return null;

  // New server versions send visualType/eventType explicitly.
  // The extra checks make the client compatible with an older/cached payload too.
  if (
    event.visualType === 'airstrike' ||
    event.eventType === 'airstrike' ||
    event.type === 'airstrike' ||
    String(event.id || '').startsWith('airstrike-') ||
    (Array.isArray(event.impacts) && event.impacts.length > 0)
  ) {
    return 'airstrike';
  }

  if (
    event.visualType === 'host-roulette' ||
    event.eventType === 'host-roulette' ||
    event.type === 'host-roulette' ||
    String(event.id || '').startsWith('secret-')
  ) {
    return 'host-roulette';
  }

  return event.type || null;
}

function statusText(state) {
  if (!state) return '';
  if (state.eventLocked) return 'Секретное шоу…';
  if (state.status === 'finished') return state.result?.message || 'Матч завершён';
  if (state.turn === state.playerColor) return 'Твой ход';
  return 'Ход соперника';
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  const result = state.result || {};
  const isDraw = !result.winner;
  const didWin = result.winner === state.playerColor;

  if (isDraw) {
    return {
      kind: 'draw',
      icon: '🤝',
      title: 'Ничья',
      text: result.message || 'Партия завершилась вничью.',
    };
  }

  let text = result.message || 'Партия завершена.';

  if (result.type === 'disconnect' && didWin) {
    text = 'Соперник отключился от игры.';
  } else if (result.type === 'timeout') {
    text = didWin ? 'У соперника закончилось время.' : 'У вас закончилось время.';
  } else if (result.type === 'resign') {
    text = didWin ? 'Соперник сдался.' : 'Вы сдались.';
  } else if (result.type === 'checkmate') {
    text = didWin ? 'Вы поставили мат сопернику.' : 'Соперник поставил вам мат.';
  }

  return {
    kind: didWin ? 'win' : 'lose',
    icon: didWin ? '🏆' : '♟',
    title: didWin ? 'Вы победили!' : 'Вы проиграли',
    text,
  };
}


function hostOutcomeText(event, myColor) {
  if (!event?.outcome) return '';
  const mine = event.targetColor === myColor;

  if (event.outcome.type === 'clock') {
    return mine
      ? 'Ох! Вам не повезло. Вы теряете целую минуту времени!'
      : 'Ох! Сопернику не повезло. Минус одна минута времени!';
  }

  return mine
    ? `Ох! Вам не повезло. Вы теряете ${event.outcome.speech}!`
    : `Ох! Сопернику не повезло. Он теряет ${event.outcome.speech}!`;
}

function speakSecretHost(text, extra = '') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${text}${extra ? ` ${extra}` : ''}`);
    utterance.lang = 'ru-RU';
    utterance.rate = 0.93;
    utterance.pitch = 0.86;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const russian = voices.find((voice) => voice.lang?.toLowerCase().startsWith('ru'));
    if (russian) utterance.voice = russian;

    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is optional. Some mobile browsers may block it.
  }
}

function wheelStopFor(outcomeKey) {
  const stops = {
    knights: -22,
    rooks: -112,
    bishops: -202,
    pawns: -292,
    clock: -337,
  };
  return stops[outcomeKey] ?? -22;
}

function squareVisualPoint(square, playerColor) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const sourceRow = 8 - rank;
  const sourceCol = file;
  const row = playerColor === 'b' ? 7 - sourceRow : sourceRow;
  const col = playerColor === 'b' ? 7 - sourceCol : sourceCol;

  return {
    x: (col + 0.5) * 12.5,
    y: (row + 0.5) * 12.5,
  };
}

function playAirstrikeSound(kind = 'flyby') {
  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const now = context.currentTime;
    const master = context.createGain();
    master.connect(context.destination);

    if (kind === 'boom') {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.55);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.72);

      const length = Math.floor(context.sampleRate * 0.42);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const noise = context.createBufferSource();
      const noiseGain = context.createGain();
      noise.buffer = buffer;
      noiseGain.gain.setValueAtTime(0.13, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      noise.connect(noiseGain);
      noiseGain.connect(master);
      noise.start(now);
    } else {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(82, now + 1.8);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.25);
      gain.gain.linearRampToValueAtTime(0.035, now + 1.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 2.15);
    }

    window.setTimeout(() => context.close?.(), 2400);
  } catch {
    // Optional sound effect.
  }
}

function airstrikeResultText(event, myColor) {
  const count = event?.removedPieces?.length || 0;
  const mine = event?.targetColor === myColor;

  if (mine) {
    return `Прямое попадание! С вашей стороны выбито фигур: ${count}.`;
  }

  return `Авиаудар завершён. У соперника выбито фигур: ${count}.`;
}

export default function ChessGame({ onBack, adminMode = false }) {
  const fighterImageUrl = `${import.meta.env.BASE_URL}images/chess/fighter.webp`;
  const [selected, setSelected] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [playerName] = useState(getPlayerName);
  const spokenSecretRef = useRef(new Set());
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch: cancelMatchSearch,
    sendAction,
  } = useMultiplayerGame('chess');


  useEffect(() => {
    if (!adminMode || !state?.roomId) return;

    sendAction({
      type: 'admin:unlock',
      payload: { code: 'admin' },
    });
  }, [adminMode, state?.roomId]);

  useEffect(() => {
    const event = state?.chessEvent;
    if (!event?.id) return undefined;

    const key = `${event.id}:${event.phase}`;
    if (spokenSecretRef.current.has(key)) return undefined;
    spokenSecretRef.current.add(key);

    if (secretEventType(event) === 'airstrike') {
      if (event.phase === 'incoming') {
        speakSecretHost('Цели подтверждены. Бомбардировщики заходят на цель!');
        playAirstrikeSound('flyby');

        const boomOne = window.setTimeout(() => playAirstrikeSound('boom'), 4050);
        const boomTwo = window.setTimeout(() => playAirstrikeSound('boom'), 4800);

        return () => {
          window.clearTimeout(boomOne);
          window.clearTimeout(boomTwo);
        };
      }

      if (event.phase === 'resolved') {
        speakSecretHost(airstrikeResultText(event, state.playerColor));
      }

      return undefined;
    }

    if (event.phase === 'spinning') {
      speakSecretHost('Крутим барабан!');
      return undefined;
    }

    if (event.phase === 'resolved') {
      const horse = event.outcome?.type === 'n' ? ' И-го-го! Кавалерия покидает доску!' : '';
      speakSecretHost(hostOutcomeText(event, state.playerColor), horse);
    }

    return undefined;
  }, [state?.chessEvent?.id, state?.chessEvent?.phase, state?.playerColor]);

  const orientedBoard = useMemo(() => {
    if (!state?.board) return [];
    const squares = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const sourceRow = state.playerColor === 'b' ? 7 - row : row;
        const sourceCol = state.playerColor === 'b' ? 7 - col : col;
        const piece = state.board[sourceRow][sourceCol];
        const file = String.fromCharCode(97 + sourceCol);
        const rank = 8 - sourceRow;
        squares.push({
          row,
          col,
          sourceRow,
          sourceCol,
          square: `${file}${rank}`,
          piece,
        });
      }
    }
    return squares;
  }, [state]);

  const legalTargets = useMemo(() => {
    if (!selected || !state?.legalMoves) return new Set();
    return new Set(
      state.legalMoves
        .filter((move) => move.from === selected)
        .map((move) => move.to),
    );
  }, [selected, state]);


  const removedGhosts = useMemo(() => {
    const map = new Map();
    if (state?.chessEvent?.phase !== 'resolved') return map;

    for (const piece of state.chessEvent.removedPieces || []) {
      map.set(piece.square, piece);
    }

    return map;
  }, [state?.chessEvent]);

  function findMatch() {
    setError('');
    setSelected(null);
    setPromotion(null);
    startMatch(playerName);
  }

  function cancelSearch() {
    cancelMatchSearch();
  }

  function sendMove(from, to, promotionPiece = 'q') {
    sendAction({
      type: 'move',
      payload: { from, to, promotion: promotionPiece },
    });
    setSelected(null);
    setPromotion(null);
  }

  function handleSquareClick(square, piece) {
    if (!state || state.status !== 'playing' || state.eventLocked) return;
    if (state.turn !== state.playerColor) return;

    if (!selected) {
      if (piece?.color === state.playerColor) setSelected(square);
      return;
    }

    if (piece?.color === state.playerColor) {
      setSelected(square);
      return;
    }

    if (!legalTargets.has(square)) {
      setSelected(null);
      return;
    }

    const selectedPiece = state.board.flat().find((item) => item?.square === selected);
    const reachesPromotionRank = selectedPiece?.type === 'p' && (square.endsWith('8') || square.endsWith('1'));

    if (reachesPromotionRank) {
      setPromotion({ from: selected, to: square });
      return;
    }

    sendMove(selected, square);
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }


  function runHostRoulette() {
    if (!adminMode || !state || state.status !== 'playing' || state.chessEvent) return;

    // Immediate local voice feedback on the button press helps iOS allow audio.
    speakSecretHost('Крутим барабан!');

    sendAction({ type: 'admin:roulette' });
  }


  function runAirstrike() {
    if (!adminMode || !state || state.status !== 'playing' || state.chessEvent) return;

    // This phrase is fired directly from the user gesture so iOS is much more
    // likely to allow speech/audio without an extra permission tap.
    speakSecretHost('Запрашиваю авиационное подкрепление!');
    playAirstrikeSound('flyby');

    sendAction({ type: 'admin:airstrike' });
  }

  if (!state && !waiting) {
    return (
      <section className="chess-lobby">
        <div className="chess-lobby__icon">♟</div>
        <span className="eyebrow">10 минут каждому</span>
        <h1>Шахматы</h1>
        <p>
          Полные правила: рокировка, взятие на проходе, превращение пешки,
          шах, мат, пат и стандартные ничьи.
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
      <section className="waiting-card">
        <div className="waiting-spinner" />
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только кто-то ещё нажмёт «Найти соперника», матч начнётся автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const myColor = state.playerColor;
  const opponentColor = myColor === 'w' ? 'b' : 'w';
  const myName = state.players?.[myColor]?.name || playerName;
  const opponentName = state.players?.[opponentColor]?.name || 'Соперник';
  const result = resultPresentation(state);

  const myClock = state.clocks?.[myColor] ?? 0;
  const opponentClock = state.clocks?.[opponentColor] ?? 0;

  return (
    <section className="chess-match">
      <div className="chess-match__topbar">
        <div>
          <span className="eyebrow">Матч #{state.roomId.slice(0, 6)}</span>
          <h1>Шахматы</h1>
        </div>
        <div className={`turn-chip ${state.turn === myColor && state.status === 'playing' ? 'is-active' : ''}`}>
          {statusText(state)}
        </div>
      </div>

      <div className="chess-layout">
        <div className="board-column">
          <div className={`player-bar player-bar--opponent ${state.turn === opponentColor && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="player-meta">
              <span className={`color-dot ${opponentColor === 'w' ? 'white' : 'black'}`} />
              <div>
                <strong>{opponentName}</strong>
                <small>{opponentColor === 'w' ? 'Белые' : 'Чёрные'}</small>
              </div>
            </div>
            <div className={`clock ${state.turn === opponentColor && state.status === 'playing' ? 'is-running' : ''} ${opponentClock <= 60000 ? 'is-low' : ''}`}>
              {formatClock(opponentClock)}
            </div>
          </div>

          <div className="chess-board" role="grid" aria-label="Шахматная доска">
            {orientedBoard.map(({ row, col, square, piece }) => {
              const isSelected = selected === square;
              const isTarget = legalTargets.has(square);
              const lastMove = state.lastMove;
              const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={square}
                  className={`chess-square ${squareColor(row, col)} ${isSelected ? 'is-selected' : ''} ${isTarget ? 'is-target' : ''} ${isLastMove ? 'is-last-move' : ''}`}
                  onClick={() => handleSquareClick(square, piece)}
                  aria-label={square}
                >
                  {piece && (
                    <span className={`piece piece--${piece.color}`}>
                      {PIECES[`${piece.color}${piece.type}`]}
                    </span>
                  )}
                  {!piece && removedGhosts.has(square) && (
                    <span
                      className={`piece piece--${removedGhosts.get(square).color} ${secretEventType(state.chessEvent) === 'airstrike' ? 'chess-secret-piece-blast' : `chess-secret-piece-exit chess-secret-piece-exit--${removedGhosts.get(square).type}`}`}
                    >
                      {PIECES[`${removedGhosts.get(square).color}${removedGhosts.get(square).type}`]}
                    </span>
                  )}
                  {isTarget && <span className={`target-dot ${piece ? 'capture' : ''}`} />}
                  {col === 0 && <span className="rank-label">{square[1]}</span>}
                  {row === 7 && <span className="file-label">{square[0]}</span>}
                </button>
              );
            })}

            {secretEventType(state.chessEvent) === 'airstrike' && (
              <div className={`chess-airstrike chess-airstrike--${state.chessEvent.phase}`} aria-hidden="true">
                <div className="chess-airstrike__banner">
                  ✈️ АВИАЦИОННАЯ ПОДДЕРЖКА
                </div>

                <div className="chess-airstrike__plane chess-airstrike__plane--one">
                  <span className="chess-airstrike__plane-fallback">✈️</span>
                  <img
                    src={fighterImageUrl}
                    alt=""
                    draggable="false"
                    className="chess-airstrike__plane-image"
                    onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                </div>

                <div className="chess-airstrike__plane chess-airstrike__plane--two">
                  <span className="chess-airstrike__plane-fallback">✈️</span>
                  <img
                    src={fighterImageUrl}
                    alt=""
                    draggable="false"
                    className="chess-airstrike__plane-image"
                    onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                </div>

                {(state.chessEvent.impacts || []).map((impact, index) => {
                  const point = squareVisualPoint(impact.centerSquare, myColor);

                  return (
                    <div
                      key={impact.id || impact.centerSquare}
                      className={`chess-airstrike__impact chess-airstrike__impact--${index + 1}`}
                      style={{
                        '--impact-x': `${point.x}%`,
                        '--impact-y': `${point.y}%`,
                        '--impact-delay': `${index * 0.72}s`,
                      }}
                    >
                      <span className="chess-airstrike__reticle" />
                      <span className="chess-airstrike__bomb">💣</span>
                      <span className="chess-airstrike__blast">💥</span>
                      <span className="chess-airstrike__smoke">☁️</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={`player-bar player-bar--me ${state.turn === myColor && state.status === 'playing' ? 'is-turn' : ''}`}>
            <div className="player-meta">
              <span className={`color-dot ${myColor === 'w' ? 'white' : 'black'}`} />
              <div>
                <strong>{myName} <span className="you-label">ты</span></strong>
                <small>{myColor === 'w' ? 'Белые' : 'Чёрные'}</small>
              </div>
            </div>
            <div className={`clock ${state.turn === myColor && state.status === 'playing' ? 'is-running' : ''} ${myClock <= 60000 ? 'is-low' : ''}`}>
              {formatClock(myClock)}
            </div>
          </div>
        </div>

        <aside className="match-panel">
          <div className="match-panel__block">
            <span className="eyebrow">Статус</span>
            <h3>{statusText(state)}</h3>
            <p>
              {state.status === 'playing'
                ? `Ходят ${state.turn === 'w' ? 'белые' : 'чёрные'}.`
                : 'Партия завершена.'}
            </p>
          </div>

          {error && <div className="game-error">{error}</div>}

          {state.status === 'playing' && (
            <button className="danger-button" onClick={resign}>Сдаться</button>
          )}

          {adminMode && (
            <div className="chess-secret-actions" aria-label="Секретные действия">
              <button
                type="button"
                className="chess-secret-action--host"
                title="Крутить секретный барабан"
                aria-label="Крутить секретный барабан"
                onClick={runHostRoulette}
                disabled={state.status !== 'playing' || !!state.chessEvent}
              >
                🥸
              </button>
              <button type="button" title="Скоро" aria-label="Оружие — скоро" disabled>🔫</button>
              <button
                type="button"
                className="chess-secret-action--bomb"
                title="Вызвать авиационную поддержку"
                aria-label="Вызвать авиационную поддержку"
                onClick={runAirstrike}
                disabled={state.status !== 'playing' || !!state.chessEvent}
              >
                💣
              </button>
              <button type="button" title="Скоро" aria-label="Ядерный взрыв — скоро" disabled>☢️💥</button>
            </div>
          )}
        </aside>
      </div>

      {secretEventType(state.chessEvent) === 'host-roulette' && (
        <div className={`chess-secret-show chess-secret-show--${state.chessEvent.phase}`}>
          <div className="chess-secret-show__stage">
            <div className="chess-secret-host" aria-hidden="true">
              <div className="chess-secret-host__hat">🎩</div>
              <div className="chess-secret-host__head">
                <span className="chess-secret-host__eye chess-secret-host__eye--left" />
                <span className="chess-secret-host__eye chess-secret-host__eye--right" />
                <span className="chess-secret-host__nose" />
                <span className="chess-secret-host__moustache">〰</span>
              </div>
              <div className="chess-secret-host__body">🎙️</div>
              <div className="chess-secret-host__hand">👉</div>
            </div>

            <div className="chess-secret-show__main">
              <div className="chess-secret-speech">
                {state.chessEvent.phase === 'spinning'
                  ? 'Крутим барабан!'
                  : hostOutcomeText(state.chessEvent, myColor)}
              </div>

              <div className="chess-secret-wheel-wrap">
                <div className="chess-secret-wheel__pointer">▼</div>
                <div
                  className={`chess-secret-wheel ${state.chessEvent.phase === 'spinning' ? 'is-spinning' : 'is-resolved'}`}
                  style={{ '--wheel-stop': `${wheelStopFor(state.chessEvent.outcome?.key)}deg` }}
                >
                  <div className="chess-secret-wheel__segment chess-secret-wheel__segment--one">🐴<small>КОНИ</small></div>
                  <div className="chess-secret-wheel__segment chess-secret-wheel__segment--two">🏰<small>ЛАДЬИ</small></div>
                  <div className="chess-secret-wheel__segment chess-secret-wheel__segment--three">♝<small>СЛОНЫ</small></div>
                  <div className="chess-secret-wheel__segment chess-secret-wheel__segment--four">♟<small>ПЕШКИ</small></div>
                </div>
              </div>

              {state.chessEvent.phase === 'resolved' && (
                <div className="chess-secret-prize">
                  <strong>{state.chessEvent.outcome?.icon}</strong>
                  <span>{state.chessEvent.outcome?.label}</span>
                  {state.chessEvent.outcome?.type === 'n' && <em>И-ГО-ГО! 🐎💨</em>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {promotion && (
        <div className="modal-backdrop">
          <div className="promotion-modal">
            <span className="eyebrow">Превращение пешки</span>
            <h3>Выбери фигуру</h3>
            <div className="promotion-options">
              {['q', 'r', 'b', 'n'].map((type) => (
                <button key={type} onClick={() => sendMove(promotion.from, promotion.to, type)}>
                  {PIECES[`${myColor}${type}`]}
                </button>
              ))}
            </div>
            <button className="secondary-button" onClick={() => setPromotion(null)}>Отмена</button>
          </div>
        </div>
      )}

      {result && (
        <div className="result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`result-card result-card--${result.kind}`}>
            <span className="result-spark result-spark--one">✦</span>
            <span className="result-spark result-spark--two">✦</span>
            <span className="result-spark result-spark--three">✦</span>
            <div className="result-icon" aria-hidden="true">{result.icon}</div>
            <span className="result-kicker">Партия завершена</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="result-actions">
              <button className="primary-button result-main-button" onClick={onBack}>
                Выйти в главное меню
              </button>
              <button className="secondary-button result-rematch-button" onClick={findMatch}>
                Найти нового соперника
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
