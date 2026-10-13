import { useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './loto.css';

const GAME_ID = 'loto';

function playerName() {
  const stored = localStorage.getItem('danya-andrew-player-name');
  if (stored) return stored;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function Barrel({ number, large = false, muted = false }) {
  return (
    <div className={`loto-barrel ${large ? 'loto-barrel--large' : ''} ${muted ? 'loto-barrel--muted' : ''}`}>
      <span className="loto-barrel__rim"><strong>{number ?? '?'}</strong></span>
    </div>
  );
}

function Bag({ shaking = false }) {
  return (
    <svg viewBox="0 0 250 248" className={`loto-bag-svg ${shaking ? 'is-shaking' : ''}`} aria-label="Мешочек с бочонками" role="img">
      <defs>
        <linearGradient id="lotoFabric" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f8d68c"/><stop offset=".45" stopColor="#ba7840"/><stop offset="1" stopColor="#754121"/></linearGradient>
        <linearGradient id="lotoFabricTop" x1="0" x2="1"><stop offset="0" stopColor="#f8dda0"/><stop offset="1" stopColor="#a4602e"/></linearGradient>
      </defs>
      <ellipse cx="126" cy="220" rx="90" ry="15" fill="#0e0e23" opacity=".4"/>
      <path d="M99 54 C85 41 93 21 106 18 Q125 10 144 19 C155 30 161 48 148 56 L159 81 Q219 112 218 166 Q213 223 126 225 Q35 223 32 166 Q31 108 93 82 Z" fill="url(#lotoFabric)" stroke="#653c25" strokeWidth="6" strokeLinejoin="round"/>
      <path d="M100 61 Q124 54 151 60 L158 78 Q126 89 91 78Z" fill="url(#lotoFabricTop)" stroke="#663b24" strokeWidth="4"/>
      <path d="M95 82 Q124 93 159 82" fill="none" stroke="#ffdc8a" strokeWidth="8" strokeLinecap="round"/>
      <path d="M94 83 Q124 94 159 83" fill="none" stroke="#734322" strokeWidth="3" strokeDasharray="6 6"/>
      <path d="M79 106 Q55 142 70 185" fill="none" stroke="#fff0bd" opacity=".21" strokeWidth="15" strokeLinecap="round"/>
      <path d="M171 110 Q200 144 186 177" fill="none" stroke="#4b281e" opacity=".28" strokeWidth="12" strokeLinecap="round"/>
      <path d="M92 50 Q124 59 154 51" fill="none" stroke="#76451f" strokeWidth="5"/>
      <ellipse cx="126" cy="151" rx="63" ry="43" fill="#6c3c20" opacity=".33"/>
      <text x="126" y="147" textAnchor="middle" fontSize="17" fontWeight="900" fill="#fff2c5" letterSpacing="5">ЛОТО</text>
      <text x="126" y="175" textAnchor="middle" fontSize="19" fontWeight="900" fill="#ffdc7e">1—90</text>
      <path d="M161 80 Q183 83 195 104" fill="none" stroke="#e7b36b" strokeWidth="6" strokeLinecap="round"/>
      <circle cx="196" cy="107" r="6" fill="#dca76e"/>
    </svg>
  );
}

function Ticket({ name, card = [], marked = [], mine, progress = 0, currentNumber, canMark, phase, onMark }) {
  const covered = new Set(marked);
  const hasTarget = currentNumber !== null && phase === 'marking' && card.some((row) => row.includes(currentNumber));
  return (
    <section className={`loto-ticket ${mine ? 'loto-ticket--mine' : 'loto-ticket--opponent'}`} aria-label={mine ? 'Твоя карточка' : 'Карточка соперника'}>
      <div className="loto-ticket__top">
        <div className="loto-ticket__identity">
          <div className="loto-ticket__avatar">{mine ? '👑' : '🎩'}</div>
          <div className="loto-ticket__names"><span>{mine ? 'ТВОЯ КАРТОЧКА' : 'КАРТОЧКА СОПЕРНИКА'}</span><strong title={name}>{name || 'Игрок'}</strong></div>
        </div>
        <div className="loto-ticket__count"><b>{progress}</b><span>/ 15</span></div>
      </div>
      <div className="loto-ticket__paper">
        <div className="loto-ticket__ornament" aria-hidden="true">✦ № {mine ? '01' : '02'} · СЧАСТЛИВЫЙ БИЛЕТ ✦</div>
        <div className="loto-ticket__grid">
          {card.map((row, rowIndex) => row.map((number, colIndex) => {
            const filled = number !== null && covered.has(number);
            const target = number !== null && number === currentNumber && !filled && hasTarget;
            const playable = mine && target && canMark;
            return number === null ? (
              <div key={`${rowIndex}-${colIndex}`} className="loto-ticket__cell loto-ticket__cell--blank" aria-hidden="true" />
            ) : (
              <button key={`${rowIndex}-${colIndex}`} type="button" className={`loto-ticket__cell loto-ticket__cell--number ${filled ? 'is-filled' : ''} ${target ? 'is-target' : ''} ${playable ? 'is-playable' : ''}`}
                onClick={() => { if (playable) onMark(number); }} disabled={!playable}
                aria-label={`${number}${filled ? ', закрыто' : playable ? ', поставить бочонок' : ''}`}>
                <span className="loto-ticket__printed">{number}</span>
                {filled && <span className="loto-ticket__covered" key={`${number}-covered`}><span>{number}</span></span>}
                {playable && <span className="loto-ticket__hint" aria-hidden="true">+</span>}
              </button>
            );
          }))}
        </div>
        <div className="loto-ticket__signature">{mine ? '★ ТВОЙ СЧАСТЛИВЫЙ БИЛЕТ ★' : '★ ИГРАЕМ ЧЕСТНО ★'}</div>
      </div>
      <div className="loto-ticket__progress" aria-label={`Закрыто ${progress} из 15`}>
        <span style={{ width: `${progress / 15 * 100}%` }} />
      </div>
    </section>
  );
}

function LotoResult({ state, mySeat, onAgain, onBack }) {
  const won = state.result?.winner === mySeat;
  const draw = state.result?.winner === null;
  return (
    <div className="loto-finish-backdrop" role="dialog" aria-modal="true" aria-label="Результат лото">
      <div className="loto-finish-card">
        <div className="loto-finish-card__icon">{draw ? '🤝' : won ? '🏆' : '🎱'}</div>
        <small>ИГРА ОКОНЧЕНА</small>
        <h2>{draw ? 'НИЧЬЯ!' : won ? 'ТВОЯ ПОБЕДА!' : 'ПОБЕДИЛ СОПЕРНИК'}</h2>
        <p>{state.result?.message}</p>
        <div className="loto-finish-card__points"><span>Ты <b>{state.progress?.[mySeat]}</b> / 15</span><span>Соперник <b>{state.progress?.[state.opponentSeat]}</b> / 15</span></div>
        <button type="button" className="loto-button loto-button--main" onClick={onAgain}>↻ Сыграть ещё</button>
        <button type="button" className="loto-button loto-button--outline" onClick={onBack}>← Все игры</button>
      </div>
    </div>
  );
}

export default function LotoGame({ onBack }) {
  const [myName] = useState(playerName);
  const { waiting, state, error, findMatch, cancelSearch, sendAction } = useMultiplayerGame(GAME_ID);
  const sentRef = useRef(null);
  const me = state?.playerSeat;
  const enemy = state?.opponentSeat;
  const own = me ? state.players?.[me] : null;
  const foe = enemy ? state.players?.[enemy] : null;
  const pending = Boolean(state?.waitingFor?.includes(me));
  const rivalPending = Boolean(state?.waitingFor?.includes(enemy));
  const number = state?.currentNumber ?? null;
  const drawing = state?.phase === 'drawing';
  const canMark = state?.status === 'playing' && state?.phase === 'marking' && pending;
  const isNewDraw = sentRef.current?.number !== number || sentRef.current?.roomId !== state?.roomId;
  if (isNewDraw) sentRef.current = { roomId: state?.roomId, number, sent: false };

  function mark(value) {
    if (!canMark || value !== number || sentRef.current?.sent) return;
    sentRef.current = { roomId: state?.roomId, number, sent: true };
    sendAction({ type: 'mark', number: value });
  }

  function leave() {
    if (state?.status === 'playing') sendAction({ type: 'resign' });
    onBack?.();
  }

  if (!state) {
    return (
      <section className="loto-game loto-lobby">
        <div className="loto-lobby__lights" aria-hidden="true">✦ ✧ ✦</div>
        <div className="loto-eyebrow">🎟️ НАСТОЯЩЕЕ ЛОТО · 2 ИГРОКА ОНЛАЙН</div>
        <h1>ЗОЛОТОЕ <span>ЛОТО</span></h1>
        <div className="loto-lobby__art"><div className="loto-lobby__bag"><Bag /></div><div className="loto-lobby__barrels"><Barrel number={17} /><Barrel number={42} /><Barrel number={80} /></div></div>
        <p>Следи за бочонками из мешочка и закрывай выпавшие числа на своей карточке. Кто первым заполнит все 15 клеток с числами — победил!</p>
        <div className="loto-lobby__features"><span>🎱 Бочонки 1–90</span><span>🎟️ Карточки 3×9</span><span>✨ Автоотметка через 10 секунд</span></div>
        {waiting ? (
          <div className="loto-lobby__waiting"><div className="loto-spinner"/><strong>Ищем соперника…</strong><button type="button" className="loto-button loto-button--outline" onClick={cancelSearch}>Отменить поиск</button></div>
        ) : <button type="button" className="loto-button loto-button--main loto-lobby__start" onClick={() => findMatch(myName)}>Найти соперника <span>→</span></button>}
        {error && <div className="game-error" role="alert">{error}</div>}
      </section>
    );
  }

  let hint = 'Готовим новый бочонок…';
  if (drawing) hint = 'Мешочек трясётся… Сейчас появится число!';
  else if (state.phase === 'rest') hint = 'Смотрим число — достаём следующий бочонок!';
  else if (state.phase === 'marking') {
    if (canMark) hint = '✨ Число есть у тебя! Нажми на подсвеченную клетку.';
    else if (rivalPending) hint = 'Соперник отмечает число на своей карточке…';
    else hint = 'Число отмечено. Следующий бочонок скоро!';
  }

  return (
    <section className="loto-game loto-match">
      <div className="loto-match__heading"><div><span className="loto-eyebrow">🏆 КТО ПЕРВЫМ ЗАПОЛНИТ КАРТОЧКУ?</span><h1>ЗОЛОТОЕ ЛОТО</h1></div><div className="loto-match__round"><strong>{state.drawnCount}</strong><span>из 90 бочонков</span></div></div>
      <div className="loto-arena">
        <Ticket name={own?.name} card={state.cards?.[me] || []} marked={state.marked?.[me] || []}
          mine progress={state.progress?.[me] || 0} currentNumber={number} phase={state.phase} canMark={canMark} onMark={mark} />
        <div className="loto-draw-zone" aria-live="polite">
          <div className="loto-draw-zone__title">✦ БОЧОНОК ИЗ МЕШОЧКА ✦</div>
          <div className="loto-draw-zone__scene">
            <div className="loto-draw-zone__glow" />
            <Bag shaking={drawing} />
            <div key={`${number}-${state.phase === 'drawing' ? 'draw' : 'shown'}`} className={`loto-draw-zone__barrel ${drawing ? 'is-hidden' : ''}`}>
              {number !== null && !drawing ? <Barrel number={number} large /> : <div className="loto-draw-zone__mystery">?</div>}
            </div>
          </div>
          <div className={`loto-draw-zone__message ${canMark ? 'is-action' : ''}`}>{hint}</div>
          {canMark && <button type="button" className="loto-button loto-button--mark" onClick={() => mark(number)}>🎱 Поставить {number} на карточку</button>}
          {canMark && <div className="loto-draw-zone__auto">Если не нажмёшь — поставится само через 10 секунд</div>}
          <div className="loto-draw-zone__history"><div>УЖЕ ВЫПАЛИ</div><div className="loto-draw-zone__history-list">{(state.lastDrawn || []).map((value) => <span key={value}>{value}</span>)}{state.drawnCount === 0 && <small>Пока пусто</small>}</div></div>
        </div>
        <Ticket name={foe?.name} card={state.cards?.[enemy] || []} marked={state.marked?.[enemy] || []}
          mine={false} progress={state.progress?.[enemy] || 0} currentNumber={number} phase={state.phase} canMark={false} onMark={() => {}} />
      </div>
      <div className="loto-match__bottom"><span>🎟️ Закрой все 15 чисел быстрее соперника. Пустые клетки закрывать не нужно.</span><button type="button" onClick={() => sendAction({ type: 'resign' })} disabled={state.status !== 'playing'}>Сдаться</button></div>
      {error && <div className="game-error" role="alert">{error}</div>}
      {state.result && <LotoResult state={state} mySeat={me} onAgain={() => { sentRef.current = null; findMatch(myName); }} onBack={leave} />}
    </section>
  );
}
