import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './whack-a-mole.css';

const GAME_ID = 'whack-a-mole';
const HOLES = Array.from({ length: 9 }, (_, index) => index);

function getPlayerName() {
  const name = localStorage.getItem('danya-andrew-player-name');
  if (name) return name;
  const generated = `Игрок ${Math.floor(Math.random() * 9000 + 1000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function Mole({ kind = 'mole' }) {
  if (kind === 'trap') {
    return <span className="wm-bomb" aria-hidden="true"><span className="wm-bomb__spark">✦</span><span className="wm-bomb__body">!</span></span>;
  }
  return (
    <span className={`wm-mole wm-mole--${kind}`} aria-hidden="true">
      <span className="wm-mole__ear wm-mole__ear--left" />
      <span className="wm-mole__ear wm-mole__ear--right" />
      <span className="wm-mole__head">
        <span className="wm-mole__shine" />
        <span className="wm-mole__eye wm-mole__eye--left" />
        <span className="wm-mole__eye wm-mole__eye--right" />
        <span className="wm-mole__cheek wm-mole__cheek--left" />
        <span className="wm-mole__cheek wm-mole__cheek--right" />
        <span className="wm-mole__snout"><i /></span>
      </span>
      {kind === 'gold' && <span className="wm-mole__crown">✦</span>}
    </span>
  );
}

function Result({ state, onAgain, onBack }) {
  const me = state.playerSeat;
  const winner = state.result?.winner;
  const tied = !winner;
  const won = winner === me;
  const title = tied ? 'Ничья!' : won ? 'Победа!' : 'Матч окончен';
  const myScore = state.players?.[me]?.score ?? 0;
  const enemyScore = state.players?.[state.opponentSeat]?.score ?? 0;

  return (
    <div className="wm-result" role="dialog" aria-modal="true" aria-label={title}>
      <div className="wm-result__card">
        <div className="wm-result__icon" aria-hidden="true">{tied ? '🤝' : won ? '🏆' : '🐹'}</div>
        <span className="wm-eyebrow">Игра завершена</span>
        <h2>{title}</h2>
        <p>{state.result?.message}</p>
        <div className="wm-result__scores">
          <div><small>ТЫ</small><strong>{myScore}</strong></div>
          <span>:</span>
          <div><small>СОПЕРНИК</small><strong>{enemyScore}</strong></div>
        </div>
        <div className="wm-result__actions">
          <button type="button" className="wm-btn wm-btn--primary" onClick={onAgain}>Играть ещё</button>
          <button type="button" className="wm-btn wm-btn--secondary" onClick={onBack}>Все игры</button>
        </div>
      </div>
    </div>
  );
}

export default function WhackAMoleGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(Date.now);
  const [soundOn, setSoundOn] = useState(true);
  const [pressed, setPressed] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const localWave = useRef(null);
  const offset = useRef(0);
  const audio = useRef(null);
  const feedbackTimeout = useRef(null);
  const {
    waiting, state, error, setError, findMatch, cancelSearch, sendAction,
  } = useMultiplayerGame(GAME_ID);

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 90);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!state) return;
    offset.current = Date.now() - state.serverTime;
    const id = state.wave?.id ?? null;
    if (localWave.current !== id) {
      localWave.current = id;
      setPressed([]);
      setFeedback(null);
    }
  }, [state]);

  useEffect(() => () => {
    clearTimeout(feedbackTimeout.current);
    audio.current?.close?.();
  }, []);

  function tone(frequency, duration = 0.11) {
    if (!soundOn) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!audio.current) audio.current = new Context();
      const ctx = audio.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* Browsers may block audio until a tap. */ }
  }

  function startMatch() {
    setError('');
    setPressed([]);
    setFeedback(null);
    localWave.current = null;
    findMatch(playerName);
  }

  function hit(hole) {
    if (state?.status !== 'playing' || state?.phase !== 'playing' || !state.wave) return;
    if (pressed.includes(hole) || state.hitHoles?.includes(hole)) return;
    const target = state.wave.targets.find((item) => item.hole === hole);
    setPressed((before) => [...before, hole]);
    setFeedback({ hole, label: !target ? '−1' : target.kind === 'trap' ? '−2' : target.kind === 'gold' ? '+3' : '+1', id: Date.now() });
    clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 520);
    tone(!target || target.kind === 'trap' ? 175 : target.kind === 'gold' ? 840 : 520);
    sendAction({ type: 'hit', payload: { hole, waveId: state.wave.id } });
  }

  if (!state && !waiting) {
    return (
      <section className="wm-shell wm-lobby">
        <div className="wm-lobby__art" aria-hidden="true"><span className="wm-lobby__star">✦</span><Mole kind="gold" /><span className="wm-lobby__earth" /></div>
        <span className="wm-eyebrow">⚡ Онлайн · два игрока</span>
        <h1>Поймай крота!</h1>
        <p>Кроты выпрыгивают из норок. Лови их быстрее соперника, но не попадись на ловушку!</p>
        <div className="wm-rules">
          <span>🐹 Обычный +1</span><span>⭐ Золотой +3</span><span>💣 Ловушка −2</span><span>⏱ 50 секунд</span>
        </div>
        {error && <p className="wm-error" role="alert">{error}</p>}
        <button type="button" className="wm-btn wm-btn--primary wm-btn--large" onClick={startMatch}>Найти соперника →</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="wm-shell wm-waiting">
        <div className="wm-waiting__emoji">🐹<span>🔎</span></div>
        <span className="wm-eyebrow">Поиск матча</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только соперник подключится, начнётся отсчёт 3–2–1.</p>
        {error && <p className="wm-error" role="alert">{error}</p>}
        <button type="button" className="wm-btn wm-btn--secondary" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const me = state.playerSeat;
  const opponent = state.opponentSeat;
  const you = state.players?.[me];
  const enemy = state.players?.[opponent];
  const serverNow = clock - offset.current;
  const remaining = Math.max(0, Math.ceil((state.endsAt - serverNow) / 1000));
  const countdown = Math.max(1, Math.ceil((state.startsAt - serverNow) / 1000));
  const playing = state.status === 'playing' && state.phase === 'playing';
  const activeTargets = state.wave?.targets || [];
  const secondsElapsed = Math.min(50, Math.max(0, 50 - remaining));
  const stage = secondsElapsed < 17 ? 1 : secondsElapsed < 34 ? 2 : 3;
  const targetsByHole = new Map(activeTargets.map((target) => [target.hole, target]));

  return (
    <section className="wm-shell wm-game">
      <div className="wm-scoreboard">
        <div className="wm-player wm-player--me"><span>ТЫ</span><strong title={you?.name}>{you?.name || 'Ты'}</strong><b>{you?.score ?? 0}</b></div>
        <div className="wm-clock"><span>ОСТАЛОСЬ</span><strong className={remaining <= 10 ? 'wm-clock--urgent' : ''}>{remaining}<small>с</small></strong></div>
        <div className="wm-player wm-player--enemy"><span>СОПЕРНИК</span><strong title={enemy?.name}>{enemy?.name || 'Соперник'}</strong><b>{enemy?.score ?? 0}</b></div>
      </div>

      <div className="wm-progress" aria-label={`Прошло ${secondsElapsed} из 50 секунд`}><span style={{ width: `${secondsElapsed * 2}%` }} /></div>
      <div className="wm-match-info">
        <span><i className="wm-status-dot" /> {state.status === 'finished' ? 'Матч завершён' : `Этап ${stage} / 3`}</span>
        <span>🐹 Поймано: {you?.caught ?? 0}</span>
        <button type="button" className="wm-sound" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? 'Выключить звуки' : 'Включить звуки'}>{soundOn ? '🔊' : '🔇'}</button>
      </div>

      <div className="wm-field">
        <div className="wm-field__glow" aria-hidden="true" />
        <div className="wm-field__sky" aria-hidden="true"><i /><i /><i /></div>
        <div className="wm-field__header"><span>🌼 КРОТОВАЯ ПОЛЯНА</span><small>Лови быстро!</small></div>
        <div className="wm-holes">
          {HOLES.map((hole) => {
            const target = targetsByHole.get(hole);
            const tapped = pressed.includes(hole) || state.hitHoles?.includes(hole);
            const showMole = playing && target && !tapped;
            return (
              <button
                key={`${state.wave?.id || 'empty'}-${hole}`}
                type="button"
                className={`wm-hole ${showMole ? 'wm-hole--active' : ''} ${target?.kind === 'gold' ? 'wm-hole--gold' : ''} ${tapped ? 'wm-hole--tapped' : ''}`}
                onClick={() => hit(hole)}
                disabled={!playing || !state.wave || tapped}
                aria-label={showMole ? `Норка ${hole + 1}: ${target.kind === 'gold' ? 'золотой крот' : target.kind === 'trap' ? 'ловушка' : 'крот'}` : `Норка ${hole + 1}`}
              >
                <span className="wm-hole__ground" />
                <span className="wm-hole__tunnel" />
                {showMole && <Mole kind={target.kind} />}
                <span className="wm-hole__rim" />
                {feedback?.hole === hole && <span key={feedback.id} className={`wm-float-score ${feedback.label.startsWith('−') ? 'wm-float-score--bad' : ''}`}>{feedback.label}</span>}
              </button>
            );
          })}
        </div>
        <div className="wm-field__grass" aria-hidden="true" />
        {state.phase === 'countdown' && (
          <div className="wm-countdown"><span>ПРИГОТОВЬСЯ!</span><strong>{countdown}</strong><small>Лови кротов касанием</small></div>
        )}
      </div>

      <div className="wm-hint"><span>🐹 +1</span><span>🌟 +3</span><span>💣 −2</span><span>❌ Промах −1</span></div>
      {state.status === 'playing' && <button type="button" className="wm-quit" onClick={() => sendAction({ type: 'resign' })}>Сдаться</button>}
      {error && <p className="wm-error" role="alert">{error}</p>}
      {state.status === 'finished' && createPortal(<Result state={state} onAgain={startMatch} onBack={onBack} />, document.body)}
    </section>
  );
}
