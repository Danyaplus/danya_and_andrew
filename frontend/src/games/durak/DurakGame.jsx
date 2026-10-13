import { useEffect, useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './durak.css';

const SUITS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANKS = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
const cardRank = (rank) => RANKS[rank] || String(rank);
const isRed = (suit) => suit === 'hearts' || suit === 'diamonds';

function playerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const name = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', name);
  return name;
}

function Card({ card, faceDown = false, active = false, selected = false, trump = '', onClick, label, compact = false, highlighted = false }) {
  const tag = onClick ? 'button' : 'div';
  const Tag = tag;
  const classes = ['du-card', faceDown ? 'du-card--back' : '', compact ? 'du-card--small' : '',
    !faceDown && isRed(card?.suit) ? 'du-card--red' : '',
    selected ? 'is-selected' : '', active ? 'is-active' : '', highlighted ? 'is-target' : '',
    card?.suit === trump && !faceDown ? 'is-trump' : '',
  ].filter(Boolean).join(' ');
  return (
    <Tag type={onClick ? 'button' : undefined} className={classes} onClick={onClick} aria-label={label || (faceDown ? 'Закрытая карта' : `${cardRank(card.rank)} ${SUITS[card.suit]}`)} aria-pressed={onClick ? selected : undefined}>
      {faceDown ? <span className="du-card__back-mark">✧</span> : <>
        <span className="du-card__corner"><b>{cardRank(card.rank)}</b><i>{SUITS[card.suit]}</i></span>
        <span className="du-card__big">{SUITS[card.suit]}</span>
        <span className="du-card__corner du-card__corner--bottom"><b>{cardRank(card.rank)}</b><i>{SUITS[card.suit]}</i></span>
      </>}
    </Tag>
  );
}

function LobbyArt() {
  return (
    <div className="du-lobby-art" aria-hidden="true">
      <span className="du-lobby-glow" />
      <div className="du-fan du-fan--left"><Card card={{ rank: 14, suit: 'spades' }} /><Card card={{ rank: 10, suit: 'hearts' }} /></div>
      <div className="du-lobby-vs">VS</div>
      <div className="du-fan du-fan--right"><Card card={{ rank: 9, suit: 'diamonds' }} /><Card card={{ rank: 12, suit: 'clubs' }} /></div>
    </div>
  );
}

function Result({ state, onBack, onAgain }) {
  const me = state.playerSeat;
  const winner = state.result?.winner;
  const draw = winner == null;
  const won = winner === me;
  return (
    <div className="du-finish-overlay">
      <div className="du-finish-card">
        <div className="du-finish-icon">{draw ? '🤝' : won ? '🏆' : '🃏'}</div>
        <span className="du-eyebrow">ПАРТИЯ ЗАВЕРШЕНА</span>
        <h2>{draw ? 'Ничья!' : won ? 'Ты победил!' : 'Ты — дурак!'}</h2>
        <p>{state.result?.message}</p>
        <div className="du-finish-buttons">
          <button className="primary-button primary-button--large" type="button" onClick={onAgain}>Играть снова →</button>
          <button className="secondary-button" type="button" onClick={onBack}>К играм</button>
        </div>
      </div>
    </div>
  );
}

export default function DurakGame({ onBack }) {
  const [name] = useState(playerName);
  const [selected, setSelected] = useState(null);
  const { waiting, state, error, setError, findMatch: startMatch, cancelSearch, sendAction } = useMultiplayerGame('durak');

  const seat = state?.playerSeat;
  const opponent = state?.opponentSeat;
  const playing = state?.status === 'playing';
  const attacking = playing && state?.attacker === seat;
  const defending = playing && state?.defender === seat && state?.phase === 'battle';
  const attacks = state?.legalAttacks || [];
  const defenses = state?.legalDefenses || {};
  const selectedTargets = useMemo(() => defenses[selected] || [], [defenses, selected]);
  const isMyAction = attacking ? !!attacks.length || !!state?.canBeat || !!state?.canFinishPickup
    : defending ? !!state?.canTake || Object.keys(defenses).length > 0 : false;

  useEffect(() => { setSelected(null); }, [state?.boutId, state?.revision]);

  function findMatch() {
    setSelected(null);
    setError('');
    startMatch(name);
  }

  function move(type, values = {}) {
    if (!state || !playing) return;
    sendAction({ type, boutId: state.boutId, ...values });
    setSelected(null);
    setError('');
    navigator.vibrate?.(9);
  }

  function chooseCard(card) {
    if (attacking && attacks.includes(card.id)) {
      move('attack', { cardId: card.id });
      return;
    }
    if (defending) {
      const targets = defenses[card.id] || [];
      if (targets.length === 1) move('defend', { cardId: card.id, target: targets[0] });
      else if (targets.length > 1) setSelected((old) => old === card.id ? null : card.id);
    }
  }

  if (!state && !waiting) return (
    <section className="du-lobby">
      <span className="du-eyebrow">КАРТОЧНАЯ КЛАССИКА · 2 ИГРОКА ОНЛАЙН</span>
      <h1>🃏 Дурак</h1>
      <LobbyArt />
      <p>Подкидывай карты, отбивай их старшими картами той же масти или козырями. Побеждает тот, кто первым избавится от всех карт!</p>
      <div className="du-rule-tags"><span>🂠 Колода 36 карт</span><span>♠ Козырная масть</span><span>👥 Подкидной · 2 игрока</span></div>
      {error && <div className="game-error">{error}</div>}
      <button type="button" className="primary-button primary-button--large du-search" onClick={findMatch}>Найти соперника →</button>
    </section>
  );

  if (waiting) return (
    <section className="du-lobby du-waiting">
      <LobbyArt />
      <span className="du-eyebrow">ПОДКИДНОЙ ДУРАК · ОНЛАЙН</span>
      <h2>Ищем соперника…</h2>
      <p>Перемешиваем колоду. Вскоре начнётся партия!</p>
      {error && <div className="game-error">{error}</div>}
      <button type="button" className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
    </section>
  );

  if (!state) return null;
  const oppName = state.players?.[opponent]?.name || 'Соперник';
  const myName = state.players?.[seat]?.name || name;
  const oppCount = state.handCounts?.[opponent] ?? 0;
  const trumpSymbol = SUITS[state.trump];
  const actLabel = state.phase === 'pickup'
    ? attacking ? 'Соперник берёт · можешь подкинуть' : 'Ты берёшь карты · жди завершения'
    : attacking ? 'ТЫ АТАКУЕШЬ' : defending ? 'ТЫ ОТБИВАЕШЬСЯ' : 'ХОД СОПЕРНИКА';
  const hint = state.phase === 'pickup'
    ? attacking ? 'Подкинь карту подходящего достоинства или закончи взятие' : 'Соперник может подкинуть ещё карты'
    : defending ? selectedTargets.length > 1 ? 'Выбери на столе, какую карту отбить' : 'Отбей подсвеченной картой или нажми «Беру»'
      : attacking ? state.table.length === 0 ? 'Выбери карту для первого хода' : 'Подкидывай карты такого же достоинства или нажми «Бито»'
        : 'Соперник делает ход';

  return (
    <section className="du-game">
      <header className="du-header">
        <div><span className="du-eyebrow">Карточная дуэль онлайн</span><h1>🃏 Дурак</h1></div>
        <div className="du-trump-label">Козырь <strong className={isRed(state.trump) ? 'is-red' : ''}>{trumpSymbol}</strong></div>
      </header>

      <div className="du-board">
        <div className="du-opponent du-glass">
          <div className="du-user-line"><span className="du-avatar">🕶️</span><span><small>СОПЕРНИК</small><strong>{oppName}</strong></span><b className="du-hand-count">{oppCount} карт</b></div>
          <div className="du-opponent-cards" aria-label={`У соперника ${oppCount} закрытых карт`}>
            {Array.from({ length: Math.min(oppCount, 9) }, (_, index) => <Card key={index} faceDown compact />)}
            {oppCount > 9 && <span className="du-cards-more">+{oppCount - 9}</span>}
          </div>
        </div>

        <div className="du-table du-glass">
          <div className="du-statusbar">
            <span className={`du-turn-label ${isMyAction ? 'is-mine' : ''}`}>● {playing ? actLabel : 'ИГРА ОКОНЧЕНА'}</span>
            <span className="du-round">Раунд {state.boutId}</span>
          </div>
          <div className="du-table-main">
            <aside className="du-deck-area">
              <div className="du-deck-stack">
                {state.stockCount > 0 && <>
                  <div className="du-trump-bottom"><Card card={state.trumpCard} compact /></div>
                  <Card faceDown compact />
                </>}
                {state.stockCount === 0 && <span className="du-deck-empty">Пусто</span>}
              </div>
              <span className="du-deck-counter">Колода: <b>{state.stockCount}</b></span>
              <span className="du-discard-counter">Отбой: {state.discardCount}</span>
            </aside>
            <div className="du-table-cards">
              {!state.table?.length ? <div className="du-table-placeholder"><span>✦</span><p>Карты появятся здесь</p></div>
                : <div className="du-battle-pairs">
                    {state.table.map((pair, index) => {
                      const target = defending && selected && selectedTargets.includes(index) && !pair.defense;
                      return (
                        <div className={`du-pair ${target ? 'is-target' : ''}`} key={`${state.boutId}-${pair.attack.id}`}>
                          <div className="du-pair-attack">
                            <Card card={pair.attack} compact trump={state.trump} highlighted={target} onClick={target ? () => move('defend', { cardId: selected, target: index }) : undefined} label={target ? `Отбить карту ${cardRank(pair.attack.rank)} ${SUITS[pair.attack.suit]}` : undefined} />
                          </div>
                          {pair.defense ? <div className="du-pair-defense"><Card card={pair.defense} compact trump={state.trump} /></div>
                            : <span className="du-needs-defense">↗</span>}
                        </div>
                      );
                    })}
                  </div>}
            </div>
          </div>
          <div className="du-table-footer"><span>{state.eventText}</span><span>{state.table.length} / {state.attackLimit} атак</span></div>
        </div>

        <div className="du-me du-glass">
          <div className="du-user-line"><span className="du-avatar">✨</span><span><small>ТВОЯ РУКА</small><strong>{myName}</strong></span><b className="du-hand-count">{state.hand.length} карт</b></div>
          <div className="du-hint" aria-live="polite">{playing ? hint : 'Партия завершена'}</div>
          <div className="du-hand" aria-label="Твои карты">
            {state.hand.map((card) => {
              const active = attacking ? attacks.includes(card.id) : defending ? !!defenses[card.id]?.length : false;
              return <Card key={card.id} card={card} trump={state.trump} active={active} selected={selected === card.id} onClick={active ? () => chooseCard(card) : undefined} />;
            })}
            {!state.hand.length && <div className="du-no-cards">На руках больше нет карт 🎉</div>}
          </div>
          <div className="du-actions">
            {state.canBeat && <button className="du-action du-action--beat" type="button" onClick={() => move('beat')}>✅ Бито!</button>}
            {state.canTake && <button className="du-action du-action--take" type="button" onClick={() => move('take')}>📥 Беру</button>}
            {state.canFinishPickup && <button className="du-action du-action--beat" type="button" onClick={() => move('finishPickup')}>✓ Больше не подкидывать</button>}
            {playing && !state.canBeat && !state.canTake && !state.canFinishPickup && <span className="du-action-hint">{attacking && attacks.length ? 'Нажми на подсвеченную карту' : 'Ждём следующего действия…'}</span>}
          </div>
        </div>
      </div>
      {error && <div className="game-error du-error">{error}</div>}
      <footer className="du-footer"><span>Правила: 36 карт · не более 6 карт за атаку · козырь бьёт обычную масть</span><button type="button" disabled={!playing} onClick={() => move('resign')}>Сдаться</button></footer>
      {state.status === 'finished' && <Result state={state} onAgain={findMatch} onBack={onBack} />}
    </section>
  );
}
