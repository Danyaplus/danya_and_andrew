import { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './shuffle-duel.css';

const CARD_IDS = ['a', 'b', 'n1', 'n2', 'n3'];
const SLOT_POSITIONS = [
  { x: 16, y: 53 },
  { x: 33, y: 48 },
  { x: 50, y: 52 },
  { x: 67, y: 48 },
  { x: 84, y: 53 },
];

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function applySteps(startOrder, plan, count) {
  const order = [...startOrder];
  for (let i = 0; i < Math.min(count, plan.length); i += 1) {
    for (const [a, b] of plan[i].swaps || []) {
      [order[a], order[b]] = [order[b], order[a]];
    }
  }
  return order;
}

function getResultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  if (state.result?.type === 'draw') {
    return {
      title: 'НИЧЬЯ!',
      text: state.result?.message || 'Вы закончили одинаково.',
      icon: '🤝',
    };
  }
  const won = state.result?.winner === state.playerSeat;
  return {
    title: won ? 'ТЫ ВЫИГРАЛ!' : 'ТЫ ПРОИГРАЛ',
    text: state.result?.message || (won ? 'Ты нашёл свою карточку.' : 'Соперник оказался внимательнее.'),
    icon: won ? '🏆' : '😵',
  };
}

function FaceIcon({ kind }) {
  if (kind === 'mine') {
    return (
      <div className="sh-face sh-face--mine" aria-hidden="true">
        <i className="sh-face__eye sh-face__eye--left" />
        <i className="sh-face__wink" />
        <i className="sh-face__mouth sh-face__mouth--wink" />
      </div>
    );
  }

  if (kind === 'foe') {
    return (
      <div className="sh-face sh-face--foe" aria-hidden="true">
        <i className="sh-face__eye sh-face__eye--left" />
        <i className="sh-face__eye sh-face__eye--right" />
        <i className="sh-face__mouth sh-face__mouth--smile" />
        <i className="sh-face__cheek sh-face__cheek--left" />
        <i className="sh-face__cheek sh-face__cheek--right" />
      </div>
    );
  }

  return <div className="sh-neutral-face" aria-hidden="true"><i /><i /><i /></div>;
}

function ShuffleCard({
  id,
  slot,
  me,
  foe,
  faceUp,
  canPick,
  selected,
  transitionMs,
  onChoose,
}) {
  const pos = SLOT_POSITIONS[slot] || SLOT_POSITIONS[0];
  const kind = id === me ? 'mine' : id === foe ? 'foe' : 'neutral';
  const label = kind === 'mine' ? 'ТВОЯ' : kind === 'foe' ? 'СОПЕРНИК' : 'ПУСТО';

  return (
    <button
      type="button"
      className={`sh-card sh-card--${kind} ${faceUp ? 'is-face-up' : 'is-closed'} ${selected ? 'is-selected' : ''} ${canPick ? 'is-pickable' : ''}`}
      style={{
        '--sh-x': `${pos.x}%`,
        '--sh-y': `${pos.y}%`,
        '--sh-move-ms': `${transitionMs}ms`,
      }}
      onClick={() => canPick && onChoose(slot)}
      disabled={!canPick}
      aria-label={canPick ? `Выбрать карточку ${slot + 1}` : label}
    >
      <span className="sh-card__inner">
        <span className="sh-card__back">
          <span className="sh-card__rings" />
          {selected && <span className="sh-card__selected-mark">✓</span>}
        </span>
        <span className="sh-card__front">
          <FaceIcon kind={kind} />
          {kind !== 'neutral' && <b>{label}</b>}
        </span>
      </span>
    </button>
  );
}

export default function ShuffleDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(Date.now());
  const serverOffsetRef = useRef(0);

  const { waiting, state, error, setError, findMatch: startMatch, cancelSearch, sendAction } = useMultiplayerGame('shuffle-duel');

  useEffect(() => {
    if (!Number.isFinite(state?.serverTime)) return;
    serverOffsetRef.current = state.serverTime - Date.now();
  }, [state?.serverTime]);

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), state.phase === 'shuffle' ? 28 : 80);
    return () => window.clearInterval(timer);
  }, [state?.status, state?.phase, state?.roomId]);

  const now = clock + serverOffsetRef.current;
  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const myName = me ? state?.players?.[me]?.name || playerName : playerName;
  const foeName = foe ? state?.players?.[foe]?.name || 'Соперник' : 'Соперник';

  const visibleOrder = useMemo(() => {
    if (!state) return CARD_IDS;
    if (state.phase === 'preview') return state.roundStartOrder || CARD_IDS;
    if (state.phase === 'shuffle') {
      const elapsed = now - (state.shuffleStartsAt || now);
      const steps = elapsed < 0
        ? 0
        : Math.min(
            state.shufflePlan?.length || 0,
            Math.floor(elapsed / Math.max(1, state.shuffleStepMs || 1)) + 1,
          );
      return applySteps(state.roundStartOrder || CARD_IDS, state.shufflePlan || [], steps);
    }
    return state.order || state.roundStartOrder || CARD_IDS;
  }, [state, now]);

  const slotByCard = useMemo(() => {
    const map = {};
    visibleOrder.forEach((id, index) => { map[id] = index; });
    return map;
  }, [visibleOrder]);

  const faceUp = state?.phase === 'preview' || state?.phase === 'reveal' || state?.status === 'finished';
  const canPick = state?.status === 'playing' && state?.phase === 'pick';
  const secondsLeft = state?.phaseEndsAt ? Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000)) : 0;
  const transitionMs = state?.phase === 'shuffle'
    ? Math.max(120, Math.round((state.shuffleStepMs || 320) * 0.78))
    : 360;

  const myRevealCorrect = state?.correct?.[me];
  const foeRevealCorrect = state?.correct?.[foe];
  const result = getResultPresentation(state);

  function findMatch() {
    setError('');
    setClock(Date.now());
    startMatch(playerName);
  }

  function choose(slot) {
    if (!canPick) return;
    sendAction({ type: 'choose', payload: { slot } });
  }

  if (!state && !waiting) {
    return (
      <section className="sh-lobby">
        <div className="sh-lobby__icon">👀</div>
        <span className="eyebrow">2 игрока · внимание · 3 уровня</span>
        <h1>Shuffle Duel</h1>
        <p>Запомни свою <b>синюю</b> карточку. Все пять закроются и начнут перемешиваться прямо на глазах. Потом у тебя будет 5 секунд, чтобы найти свою.</p>
        <div className="sh-rules">
          <span>🔵 синяя — твоя</span>
          <span>🔴 красная — соперника</span>
          <span>1️⃣ медленно → 2️⃣ средне → 3️⃣ быстро</span>
          <span>❌ ошибся один — проиграл</span>
          <span>🤝 ошиблись оба — ничья</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="sh-waiting">
        <div className="sh-waiting__cards"><i /><i /><i /></div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ищем второго игрока…</h2>
        <p>Приготовь глаза: третий уровень будет очень быстрым.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  if (!state) return null;

  const phaseCopy = state.phase === 'preview'
    ? { title: 'ЗАПОМНИ СИНЮЮ', text: 'Вот твоя карточка', timer: secondsLeft }
    : state.phase === 'shuffle'
      ? { title: 'СЛЕДИ!', text: 'Не теряй синюю карточку', timer: null }
      : state.phase === 'pick'
        ? { title: 'ГДЕ ТВОЯ?', text: 'Нажми на одну из пяти', timer: secondsLeft }
        : state.phase === 'reveal'
          ? { title: 'ОТКРЫВАЕМ', text: 'Смотрим, кто угадал', timer: secondsLeft }
          : { title: 'SHUFFLE DUEL', text: '', timer: null };

  return (
    <section className="sh-shell">
      <header className="sh-hud">
        <div className="sh-player sh-player--mine">
          <span className="sh-player__dot sh-player__dot--blue" />
          <div><small>ТЫ</small><strong>{myName}</strong></div>
        </div>

        <div className="sh-level">
          <small>УРОВЕНЬ</small>
          <strong>{state.level}<i>/{state.totalLevels}</i></strong>
          <span>{state.levelName}</span>
        </div>

        <div className="sh-player sh-player--foe">
          <div><small>СОПЕРНИК</small><strong>{foeName}</strong></div>
          <span className="sh-player__dot sh-player__dot--red" />
        </div>
      </header>

      <div className={`sh-stage sh-stage--level-${state.level}`}>
        <div className="sh-corner sh-corner--yellow" />
        <div className="sh-corner sh-corner--blue" />
        <div className="sh-corner sh-corner--red" />
        <div className="sh-corner sh-corner--green" />

        <div className="sh-phase-banner">
          <strong>{phaseCopy.title}</strong>
          <span>{phaseCopy.text}</span>
          {phaseCopy.timer !== null && <b>{phaseCopy.timer}</b>}
        </div>

        <div className="sh-target-key sh-target-key--mine">
          <span className="sh-mini-face sh-mini-face--blue">◕‿◕</span>
          <b>ТВОЯ</b>
        </div>
        <div className="sh-target-key sh-target-key--foe">
          <span className="sh-mini-face sh-mini-face--red">●‿●</span>
          <b>СОПЕРНИК</b>
        </div>

        <div className="sh-card-field">
          {CARD_IDS.map((id) => (
            <ShuffleCard
              key={id}
              id={id}
              slot={slotByCard[id] ?? 0}
              me={me}
              foe={foe}
              faceUp={faceUp}
              canPick={canPick}
              selected={state.myPick === (slotByCard[id] ?? -1)}
              transitionMs={transitionMs}
              onChoose={choose}
            />
          ))}
        </div>

        {state.phase === 'pick' && (
          <div className="sh-pick-footer">
            <span>{state.myPick === null ? 'Выбери карточку' : `Выбрана карточка ${state.myPick + 1}`}</span>
            <b>{secondsLeft}</b>
          </div>
        )}

        {state.phase === 'reveal' && (
          <div className="sh-reveal-strip">
            <div className={myRevealCorrect ? 'is-good' : 'is-bad'}>{myRevealCorrect ? '✓ ТЫ УГАДАЛ' : '✕ ТЫ ОШИБСЯ'}</div>
            <div className={foeRevealCorrect ? 'is-good' : 'is-bad'}>{foeRevealCorrect ? '✓ СОПЕРНИК УГАДАЛ' : '✕ СОПЕРНИК ОШИБСЯ'}</div>
          </div>
        )}
      </div>

      <div className="sh-help">
        <span>Сначала лица открыты</span>
        <i>→</i>
        <span>потом все одинаковые</span>
        <i>→</i>
        <span>следи за своей синей</span>
      </div>

      {result && (
        <div className="sh-result">
          <div className="sh-result__card">
            <span>SHUFFLE DUEL</span>
            <div className="sh-result__icon">{result.icon}</div>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="sh-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>Играть ещё</button>
              <button type="button" className="secondary-button" onClick={onBack}>Все игры</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
