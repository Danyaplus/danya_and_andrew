import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './even-odd.css';

const HANDS = ['☝️', '✌️', '🤟', '🖖', '🖐️'];

function getPlayerName() {
  const name = localStorage.getItem('danya-andrew-player-name');
  if (name) return name;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function roleName(role) {
  return role === 'even' ? 'ЧЁТ' : 'НЕЧЁТ';
}

function ScoreCard({ name, score, role, own, ready, target }) {
  return (
    <div className={`eo-score-card ${own ? 'eo-score-card--me' : 'eo-score-card--foe'}`}>
      <div className="eo-score-card__top">
        <span className="eo-score-card__label">{own ? 'ТЫ' : 'СОПЕРНИК'}</span>
        <span className={`eo-role eo-role--${role}`}>{roleName(role)}</span>
      </div>
      <strong className="eo-score-card__name" title={name}>{name}</strong>
      <div className="eo-score-card__bottom">
        <div className="eo-score-card__dots" aria-label={`${score} из ${target} очков`}>
          {Array.from({ length: target }, (_, index) => <span key={index} className={index < score ? 'is-lit' : ''} />)}
        </div>
        <span className="eo-score-card__points">{score}<small> / {target}</small></span>
      </div>
      <div className={`eo-score-card__state ${ready ? 'is-ready' : ''}`}>{ready ? '✓ Выбор сделан' : '○ Выбирает'}</div>
    </div>
  );
}

function HandDisplay({ title, number, hidden, own }) {
  return (
    <div className={`eo-hand ${own ? 'eo-hand--me' : 'eo-hand--foe'}`}>
      <small>{title}</small>
      <div className={`eo-hand__bubble ${hidden ? 'is-secret' : 'is-open'}`}>
        <span aria-hidden="true">{hidden ? '❔' : HANDS[number - 1] || '✊'}</span>
      </div>
      <b>{hidden ? 'СЕКРЕТ' : `${number} ${number === 1 ? 'палец' : number < 5 ? 'пальца' : 'пальцев'}`}</b>
    </div>
  );
}

export default function EvenOddGame() {
  const [playerName] = useState(getPlayerName);
  const [clock, setClock] = useState(Date.now());
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(null);
  const timeOffset = useRef(0);
  const { state, waiting, error, setError, findMatch, cancelSearch, sendAction } = useMultiplayerGame('even-odd');

  useEffect(() => {
    if (Number.isFinite(state?.serverTime)) timeOffset.current = state.serverTime - Date.now();
  }, [state?.serverTime]);

  useEffect(() => {
    if (!state || state.status !== 'playing') return;
    const interval = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(interval);
  }, [state?.roomId, state?.status]);

  useEffect(() => {
    pendingRef.current = null;
    setPending(null);
  }, [state?.roomId, state?.round, state?.phase, state?.myChoice]);

  function start() {
    pendingRef.current = null;
    setPending(null);
    setError('');
    findMatch(playerName);
  }

  function choose(fingers) {
    if (!state || state.status !== 'playing' || state.phase !== 'choosing' ||
        state.myChoice !== null || pendingRef.current !== null) return;
    if (Date.now() + timeOffset.current >= state.phaseEndAt) return;
    pendingRef.current = fingers;
    setPending(fingers);
    sendAction({ type: 'choose', payload: { fingers, round: state.round } });
  }

  const seat = state?.playerSeat;
  const opponent = state?.opponentSeat;
  const myName = state?.players?.[seat]?.name || playerName;
  const foeName = state?.players?.[opponent]?.name || 'Соперник';
  const myRole = state?.roles?.[seat] || 'even';
  const foeRole = state?.roles?.[opponent] || 'odd';
  const picked = state?.myChoice ?? pending;
  const reveal = state?.phase === 'reveal' || state?.status === 'finished' && Boolean(state.lastRound);
  const last = state?.lastRound;
  const leftMs = Math.max(0, (state?.phaseEndAt ?? clock) - (clock + timeOffset.current));
  const seconds = Math.ceil(leftMs / 1000);
  const canChoose = state?.status === 'playing' && state.phase === 'choosing' && picked === null && leftMs > 0;
  const iWon = state?.result?.winner === seat;
  const roundWon = last?.winner === seat;

  if (!state && !waiting) {
    return (
      <section className="eo-root eo-lobby">
        <span className="eo-kicker"><i /> ИГРА ДЛЯ ДВОИХ ОНЛАЙН</span>
        <div className="eo-lobby__symbol" aria-hidden="true"><span>✌️</span><b>VS</b><span>🖐️</span></div>
        <h1>ЧЁТ <span>ИЛИ</span><br /><em>НЕЧЁТ?</em></h1>
        <p className="eo-lobby__description">Выбирайте от <b>1 до 5 пальцев</b> одновременно и втайне. Сложите числа: чётная сумма — очко игроку за чёт, нечётная — игроку за нечёт!</p>
        <div className="eo-lobby__rules">
          <span>✌️ 1–5 пальцев</span><span>🔒 Тайный выбор</span><span>🏆 До 3 очков</span>
        </div>
        {error && <p className="eo-error" role="alert">{error}</p>}
        <button className="eo-primary" type="button" onClick={start}>Найти соперника <span aria-hidden="true">↗</span></button>
        <small className="eo-lobby__hint">На выбор 18 секунд · роли меняются каждый раунд</small>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="eo-root eo-waiting" aria-live="polite">
        <span className="eo-kicker"><i /> ПОИСК ИГРОКА</span>
        <div className="eo-waiting__hands" aria-hidden="true"><span>✌️</span><span>🖐️</span></div>
        <h2>Ищем соперника…</h2>
        <p>Ожидаем второго игрока. Как только он присоединится, матч начнётся автоматически.</p>
        <button type="button" className="eo-secondary" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="eo-root eo-match">
      <header className="eo-match__heading">
        <div><span className="eo-kicker"><i /> МАТЧ В РЕАЛЬНОМ ВРЕМЕНИ</span><h2>Чёт <span>или</span> нечёт?</h2></div>
        <span className="eo-round-pill">РАУНД {state.round} / 5</span>
      </header>

      <div className="eo-scores">
        <ScoreCard name={myName} own score={state.scores?.[seat] || 0} role={myRole} ready={state.ready?.[seat]} target={state.targetPoints} />
        <div className="eo-scores__vs">VS</div>
        <ScoreCard name={foeName} score={state.scores?.[opponent] || 0} role={foeRole} ready={state.ready?.[opponent]} target={state.targetPoints} />
      </div>

      <div className="eo-arena" key={`${state.roomId}-${state.round}-${state.phase}`}>
        <div className="eo-arena__header"><span>АРЕНА ЖЕСТОВ</span><span>{state.phase === 'choosing' ? `⏱ ${seconds} с` : state.phase === 'intro' ? 'ПРИГОТОВЬСЯ' : 'РЕЗУЛЬТАТ'}</span></div>
        <div className="eo-arena__hands">
          <HandDisplay title="ТВОЯ РУКА" own number={reveal ? last?.[seat] : picked} hidden={!reveal && picked === null} />
          <div className="eo-arena__center">+</div>
          <HandDisplay title="РУКА СОПЕРНИКА" number={last?.[opponent]} hidden={!reveal} />
        </div>
        {state.phase === 'intro' && <div className="eo-arena__message">⚡ Приготовь пальцы! Скоро начинаем…</div>}
        {state.phase === 'choosing' && <div className="eo-arena__message" role="status">{picked !== null ? '🔒 Твой выбор сохранён. Ждём соперника!' : '👇 Нажми на число пальцев ниже'}</div>}
        {reveal && (
          <div className={`eo-result ${roundWon ? 'is-win' : 'is-loss'}`} role="status">
            <div className="eo-result__equation"><b>{last?.[seat]}</b><span>+</span><b>{last?.[opponent]}</b><span>=</span><strong>{last?.sum}</strong></div>
            <div className="eo-result__parity">{last?.parity === 'even' ? '✦ ЧЁТНОЕ ЧИСЛО' : '✦ НЕЧЁТНОЕ ЧИСЛО'}</div>
            <h3>{roundWon ? '🏆 ТВОЁ ОЧКО!' : '⚡ ОЧКО СОПЕРНИКУ'}</h3>
            {last?.automatic?.a || last?.automatic?.b ? <small>Пропущенный выбор заменён случайным числом</small> : <small>+1 очко победителю раунда</small>}
          </div>
        )}
      </div>

      {state.status === 'finished' ? (
        <div className={`eo-finish ${iWon ? 'is-champion' : ''}`} role="status">
          <div className="eo-finish__icon">{iWon ? '🏆' : '🤝'}</div>
          <h2>{iWon ? 'ПОБЕДА!' : 'МАТЧ ОКОНЧЕН'}</h2>
          <p>{state.result?.message || 'Игра окончена.'}</p>
          <div className="eo-finish__score">{state.scores?.[seat]} : {state.scores?.[opponent]}</div>
          <button type="button" className="eo-primary" onClick={start}>Новый соперник <span aria-hidden="true">↗</span></button>
        </div>
      ) : (
        <div className="eo-controls">
          <div className="eo-controls__title"><strong>{state.phase === 'intro' ? 'СКОРО НАЧАЛО' : state.phase === 'reveal' ? 'РАУНД ЗАВЕРШЁН' : picked !== null ? 'ТВОЙ ВЫБОР ПРИНЯТ ✓' : 'СКОЛЬКО ПАЛЬЦЕВ ПОКАЖЕШЬ?'}</strong><span>{state.phase === 'choosing' ? 'Выбери от 1 до 5' : 'Ожидаем следующий раунд'}</span></div>
          <div className="eo-controls__numbers">
            {HANDS.map((hand, index) => {
              const fingers = index + 1;
              return (
                <button type="button" key={fingers} className={`eo-choice ${picked === fingers && state.phase === 'choosing' ? 'is-selected' : ''}`} disabled={!canChoose} onClick={() => choose(fingers)} aria-pressed={picked === fingers && state.phase === 'choosing'} aria-label={`${fingers} ${fingers === 1 ? 'палец' : fingers < 5 ? 'пальца' : 'пальцев'}`}>
                  <span className="eo-choice__hand" aria-hidden="true">{hand}</span><b>{fingers}</b>
                </button>
              );
            })}
          </div>
          {error && <p className="eo-error" role="alert">{error}</p>}
          <p className="eo-controls__helper">{picked !== null && state.phase === 'choosing' ? 'Второй раз выбрать нельзя. Соперник не видит твоё число.' : 'Если время закончится, сервер выберет случайное число.'}</p>
          <button type="button" className="eo-resign" onClick={() => { if (window.confirm('Сдаться и завершить матч?')) sendAction({ type: 'resign' }); }}>Выйти из матча</button>
        </div>
      )}
    </section>
  );
}
