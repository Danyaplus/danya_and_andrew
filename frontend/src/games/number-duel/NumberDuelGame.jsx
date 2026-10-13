import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './number-duel.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function attemptLabel(value) {
  if (value == null) return '—';
  return value > 10 ? 'Не угадал' : `${value} ${value === 1 ? 'попытка' : value < 5 ? 'попытки' : 'попыток'}`;
}

function outcome(state) {
  if (state?.status !== 'finished') return null;
  if (!state.result?.winner) return { icon: '🤝', title: 'НИЧЬЯ!', mood: 'draw' };
  const won = state.result.winner === state.playerSeat;
  return { icon: won ? '🏆' : '💫', title: won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ', mood: won ? 'win' : 'lose' };
}

export default function NumberDuelGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [draft, setDraft] = useState('');
  const [serverNow, setServerNow] = useState(0);
  const clockRef = useRef({ server: Date.now(), local: performance.now() });
  const inputRef = useRef(null);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('number-duel');

  useEffect(() => {
    if (!state?.serverTime) return;
    clockRef.current = { server: state.serverTime, local: performance.now() };
    setServerNow(state.serverTime);
  }, [state?.serverTime]);

  useEffect(() => {
    if (!state || state.status === 'finished') return undefined;
    const interval = setInterval(() => {
      const sync = clockRef.current;
      setServerNow(sync.server + performance.now() - sync.local);
    }, 100);
    return () => clearInterval(interval);
  }, [state?.roomId, state?.status]);

  useEffect(() => {
    setDraft('');
  }, [state?.round, state?.phase]);

  const me = state?.playerSeat;
  const foe = state?.opponentSeat;
  const mine = me ? state.players?.[me] : null;
  const opponent = foe ? state.players?.[foe] : null;
  const setting = me && me === state?.chooserSeat;
  const guessing = me && me === state?.guesserSeat;
  const phase = state?.phase;
  const canSet = state?.status === 'playing' && phase === 'pick' && setting;
  const canGuess = state?.status === 'playing' && phase === 'guess' && guessing;
  const canSubmit = canSet || canGuess;
  const guesses = state?.guesses || [];
  const guessedNumbers = new Set(guesses.map((entry) => entry.number));
  const lowest = guesses.reduce((lo, g) => g.hint === 'higher' ? Math.max(lo, g.number + 1) : lo, 1);
  const highest = guesses.reduce((hi, g) => g.hint === 'lower' ? Math.min(hi, g.number - 1) : hi, 100);
  const numeric = Number(draft);
  const valid = draft.trim() !== '' && /^\d{1,3}$/.test(draft) && Number.isInteger(numeric)
    && numeric >= 1 && numeric <= 100 && (!canGuess || (numeric >= lowest && numeric <= highest && !guessedNumbers.has(numeric)));
  const left = Math.max(0, Math.ceil(((state?.phaseEndsAt || serverNow) - (serverNow || state?.serverTime || 0)) / 1000));
  const result = outcome(state);
  const lastGuess = guesses[guesses.length - 1];
  const myName = mine?.name || playerName;
  const opponentName = opponent?.name || 'Соперник';

  function find() {
    setError('');
    setDraft('');
    findMatch(playerName);
  }

  function submit(event) {
    event?.preventDefault();
    if (!canSubmit || !valid) return;
    sendAction({ type: canSet ? 'pick' : 'guess', payload: { number: numeric } });
    setDraft('');
    inputRef.current?.blur();
  }

  if (!state && !waiting) {
    return (
      <section className="nd-lobby">
        <div className="nd-lobby__shine" />
        <div className="nd-lobby__hero" aria-hidden="true">
          <span className="nd-lobby__num nd-lobby__num--one">?</span>
          <span className="nd-lobby__num nd-lobby__num--two">50</span>
          <span className="nd-lobby__num nd-lobby__num--three">100</span>
        </div>
        <div className="nd-eyebrow">🔢 ДУЭЛЬ НА ЛОГИКУ · 2 ИГРОКА ОНЛАЙН</div>
        <h1>УГАДАЙ <span>ЧИСЛО</span></h1>
        <p>Загадай секретное число от 1 до 100. Соперник ищет его по подсказкам «больше» и «меньше». Затем вы поменяетесь ролями!</p>
        <div className="nd-lobby__features"><span>🔐 Два раунда</span><span>🎯 10 попыток</span><span>⚡ 65 секунд</span></div>
        <div className="nd-lobby__rule">🏆 Победит тот, кто угадает число за меньшее количество попыток.</div>
        {error && <p className="nd-error" role="alert">{error}</p>}
        <button type="button" className="nd-btn nd-btn--main" onClick={find}>НАЙТИ СОПЕРНИКА <span>→</span></button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="nd-lobby nd-lobby--waiting">
        <div className="nd-lobby__waiting" aria-hidden="true">🔐</div>
        <div className="nd-eyebrow">СВЯЗЫВАЕМ ВАС В РЕАЛЬНОМ ВРЕМЕНИ</div>
        <h2>Ищем соперника<span>...</span></h2>
        <p>Как только второй игрок найдётся, начнётся первый раунд.</p>
        {error && <p className="nd-error" role="alert">{error}</p>}
        <button type="button" className="nd-btn nd-btn--ghost" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  let title = 'Скоро начнём!';
  let subtitle = 'Приготовься: сейчас начнётся новый раунд.';
  if (phase === 'pick') {
    title = setting ? 'ЗАГАДАЙ ЧИСЛО' : 'Соперник загадывает…';
    subtitle = setting ? 'Выбери любое целое число от 1 до 100. Соперник его пока не увидит.' : 'Подожди немного, затем начни угадывать!';
  } else if (phase === 'guess') {
    title = guessing ? 'НАЙДИ ЧИСЛО!' : 'Соперник угадывает';
    subtitle = guessing ? 'Вводи числа и сужай диапазон по подсказкам.' : 'Следи за попытками соперника. Твоё число пока спрятано.';
  } else if (phase === 'review') {
    title = 'РАУНД ЗАВЕРШЁН';
    subtitle = `Было загадано число ${state.secret}. ${guesses.some((g) => g.hint === 'correct') ? 'Число найдено!' : 'Угадать не получилось.'}`;
  } else if (phase === 'finished') {
    title = 'МАТЧ ОКОНЧЕН';
    subtitle = 'Оба игрока побывали в роли угадывающего!';
  }

  return (
    <section className="nd-game">
      <div className="nd-scorebar">
        <div className="nd-scorebar__player nd-scorebar__player--mine">
          <span>🟣 ТЫ</span><strong title={myName}>{myName}</strong><small>{attemptLabel(mine?.attempts)}</small>
        </div>
        <div className="nd-scorebar__round"><small>РАУНД</small><strong>{state.round}<i>/</i>2</strong></div>
        <div className="nd-scorebar__player nd-scorebar__player--foe">
          <span>🔵 СОПЕРНИК</span><strong title={opponentName}>{opponentName}</strong><small>{attemptLabel(opponent?.attempts)}</small>
        </div>
      </div>

      <div className="nd-arena">
        <div className="nd-arena__shine" />
        <div className="nd-arena__top"><span>✦ СЕКРЕТНЫЙ КОД</span><span className={left <= 10 ? 'nd-arena__time is-urgent' : 'nd-arena__time'}>⏱ {phase === 'finished' ? 'ГОТОВО' : `${left} сек`}</span></div>
        <div className="nd-arena__heading"><h2>{title}</h2><p>{subtitle}</p></div>
        <div className="nd-progress"><span className={state.round === 1 ? 'is-active' : 'is-done'}>① Первый раунд</span><span className={state.round === 2 ? 'is-active' : ''}>② Смена ролей</span></div>
        <div className="nd-secret">
          <div className="nd-secret__glow" />
          <span className="nd-secret__top">{phase === 'review' || phase === 'finished' ? 'РАСКРЫТОЕ ЧИСЛО' : setting && state.secretIsSet ? 'ТВОЁ СЕКРЕТНОЕ ЧИСЛО' : 'ЗАГАДАННОЕ ЧИСЛО'}</span>
          <strong key={`${phase}-${state.round}-${state.secretIsSet}`} className="nd-secret__value">{state.secret ?? '?'}</strong>
          <small>{setting && state.secretIsSet && phase === 'guess' ? 'Только ты видишь этот код' : phase === 'pick' ? 'ОТ 1 ДО 100' : '🔒 СЕКРЕТ ПОД ЗАЩИТОЙ'}</small>
        </div>

        {phase === 'countdown' && <div className="nd-message nd-message--start"><span>🚀</span><strong>Начинаем через {left}...</strong><p>Роли сменятся после первого раунда.</p></div>}

        {phase === 'pick' && !setting && <div className="nd-message"><span>⏳</span><strong>Ожидаем число</strong><p>Соперник выбирает, а ты скоро начнёшь угадывать.</p></div>}
        {phase === 'guess' && !guessing && <div className="nd-message"><span>🧠</span><strong>Не подсказывай!</strong><p>Соперник пытается разгадать твоё число. Смотри на его попытки ниже.</p></div>}
        {phase === 'review' && <div className="nd-message nd-message--review"><span>{guesses.some((g) => g.hint === 'correct') ? '🎉' : '🔎'}</span><strong>{guesses.some((g) => g.hint === 'correct') ? `Угадано за ${guesses.length}!` : 'Число не угадано'}</strong><p>{state.round === 1 ? 'Сейчас вы поменяетесь ролями.' : 'Подсчитываем итоговые результаты…'}</p></div>}

        {canSubmit && <form className="nd-input-zone" onSubmit={submit}>
          {canGuess && <div className="nd-range"><span>ВОЗМОЖНОЕ ЧИСЛО</span><strong>{lowest} — {highest}</strong><small>Осталось попыток: {state.guessMax - guesses.length}</small></div>}
          <label htmlFor="nd-number-input">{canSet ? 'ТВОЁ ЧИСЛО' : 'ТВОЯ ДОГАДКА'}</label>
          <div className="nd-input-zone__row">
            <input
              ref={inputRef}
              id="nd-number-input"
              type="number"
              inputMode="numeric"
              enterKeyHint="go"
              min={canGuess ? lowest : 1}
              max={canGuess ? highest : 100}
              step="1"
              placeholder="?"
              autoComplete="off"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="nd-btn nd-btn--submit" disabled={!valid}>{canSet ? 'ЗАГАДАТЬ →' : 'ПРОВЕРИТЬ →'}</button>
          </div>
          {canSet && <button className="nd-lucky" type="button" onClick={() => setDraft(String(Math.ceil(Math.random() * 100)))}>🎲 Выбрать случайное число</button>}
          {canGuess && lastGuess && <div className={`nd-last-hint nd-last-hint--${lastGuess.hint}`}>
            {lastGuess.hint === 'higher' ? '⬆️ Загаданное число БОЛЬШЕ' : lastGuess.hint === 'lower' ? '⬇️ Загаданное число МЕНЬШЕ' : '✅ Угадано!'}
          </div>}
        </form>}

        {guesses.length > 0 && <div className="nd-history"><div className="nd-history__title"><strong>ИСТОРИЯ ПОПЫТОК</strong><span>{guesses.length} / {state.guessMax}</span></div><div className="nd-history__list">{guesses.map((item, index) => <div key={`${index}-${item.number}`} className={`nd-history__item nd-history__item--${item.hint}`}><small>#{index + 1}</small><b>{item.number}</b><span>{item.hint === 'higher' ? '↑ Больше' : item.hint === 'lower' ? '↓ Меньше' : '✓ Верно'}</span></div>)}</div></div>}

        {state.summaries.length > 0 && <div className="nd-round-results"><h3>ИТОГИ РАУНДОВ</h3>{state.summaries.map((summary) => <div key={summary.round}><span>Раунд {summary.round} · {state.players[summary.guesserSeat]?.name}</span><strong>{attemptLabel(summary.attempts)}</strong></div>)}</div>}
      </div>

      <div className="nd-footer"><span>💡 Число можно найти за 7 попыток, если каждый раз делить диапазон пополам.</span><button type="button" onClick={() => { if (window.confirm('Сдаться и завершить матч?')) sendAction({ type: 'resign' }); }}>Сдаться</button></div>

      {result && <div className="nd-result-backdrop" role="dialog" aria-modal="true" aria-label="Результат игры">
        <div className={`nd-result nd-result--${result.mood}`}>
          <div className="nd-result__icon">{result.icon}</div>
          <span className="nd-eyebrow">ИГРА ЗАВЕРШЕНА</span>
          <h2>{result.title}</h2>
          <p>{state.result?.message}</p>
          <div className="nd-result__comparison">
            <div><small>ТЫ</small><strong>{attemptLabel(mine?.attempts)}</strong></div><span>VS</span><div><small>СОПЕРНИК</small><strong>{attemptLabel(opponent?.attempts)}</strong></div>
          </div>
          <div className="nd-result__buttons"><button type="button" className="nd-btn nd-btn--main" onClick={find}>🔄 Играть ещё</button><button type="button" className="nd-btn nd-btn--ghost" onClick={onBack}>Все игры →</button></div>
        </div>
      </div>}
    </section>
  );
}
