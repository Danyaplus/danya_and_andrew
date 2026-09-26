import { useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './uno.css';

const COLOR_LABELS = {
  red: 'Красный',
  yellow: 'Жёлтый',
  green: 'Зелёный',
  blue: 'Синий',
};

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function cardText(card) {
  if (!card) return '';
  if (card.type === 'number') return String(card.value);
  if (card.type === 'skip') return '⊘';
  if (card.type === 'reverse') return '↻';
  if (card.type === 'draw2') return '+2';
  if (card.type === 'wild') return 'WILD';
  if (card.type === 'wild4') return '+4';
  return '?';
}

function cardLabel(card) {
  if (!card) return 'Карта';
  const color = card.color ? COLOR_LABELS[card.color] : 'Wild';
  const action = card.type === 'number'
    ? card.value
    : ({ skip: 'пропуск', reverse: 'реверс', draw2: '+2', wild: 'смена цвета', wild4: '+4' }[card.type] || card.type);
  return `${color}: ${action}`;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  let text = state.result?.message || 'Партия завершена.';
  if (state.result?.type === 'disconnect') {
    text = won ? 'Соперник отключился от игры.' : 'Соединение с матчем потеряно.';
  }
  if (state.result?.type === 'resign') {
    text = won ? 'Соперник сдался.' : 'Вы сдались.';
  }
  return {
    won,
    title: won ? 'Вы победили!' : 'Вы проиграли',
    icon: won ? '🏆' : '✦',
    text,
  };
}

function UnoCard({ card, playable = false, drawn = false, onClick, disabled = false, compact = false }) {
  const isWild = card && (card.type === 'wild' || card.type === 'wild4');
  return (
    <button
      type="button"
      className={`uno-card uno-card--${card?.color || 'wild'} ${isWild ? 'is-wild' : ''} ${playable ? 'is-playable' : ''} ${drawn ? 'is-drawn' : ''} ${compact ? 'is-compact' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={cardLabel(card)}
    >
      <span className="uno-card__corner uno-card__corner--top">{cardText(card)}</span>
      <span className="uno-card__oval">
        {isWild ? (
          <span className="uno-wild-wheel" aria-hidden="true">
            <i className="red" /><i className="yellow" /><i className="green" /><i className="blue" />
          </span>
        ) : (
          <strong>{cardText(card)}</strong>
        )}
      </span>
      <span className="uno-card__corner uno-card__corner--bottom">{cardText(card)}</span>
    </button>
  );
}

function CardBack({ small = false }) {
  return (
    <div className={`uno-card-back ${small ? 'is-small' : ''}`} aria-hidden="true">
      <span>UNO</span>
    </div>
  );
}

export default function UnoGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [wildChoice, setWildChoice] = useState(null);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('uno');

  const playable = useMemo(() => new Set(state?.playableCardIds || []), [state?.playableCardIds]);
  const result = resultPresentation(state);

  function findMatch() {
    setError('');
    setWildChoice(null);
    startMatch(playerName);
  }

  function chooseCard(card) {
    if (!state || state.status !== 'playing' || state.turn !== state.playerSeat) return;
    if (!playable.has(card.id)) return;
    if (card.type === 'wild' || card.type === 'wild4') {
      setWildChoice(card);
      return;
    }
    sendAction({ type: 'play', payload: { cardId: card.id } });
  }

  function playWild(color) {
    if (!wildChoice) return;
    sendAction({
      type: 'play',
      payload: { cardId: wildChoice.id, chosenColor: color },
    });
    setWildChoice(null);
  }

  if (!state && !waiting) {
    return (
      <section className="uno-lobby">
        <div className="uno-lobby__logo">UNO</div>
        <span className="eyebrow">Классическая партия на двоих</span>
        <h1>UNO</h1>
        <p>
          По 7 карт каждому. Совмещай цвет, число или символ, используй специальные карты,
          меняй цвет Wild-картами и первым избавься от всей руки.
        </p>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Найти соперника</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="uno-waiting">
        <div className="uno-waiting__cards"><CardBack /><CardBack /></div>
        <span className="eyebrow">Matchmaking</span>
        <h2>Ждём второго игрока…</h2>
        <p>Как только второй игрок нажмёт «Найти соперника», UNO начнётся автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  const mySeat = state.playerSeat;
  const opponentSeat = state.opponentSeat;
  const myTurn = state.turn === mySeat && state.status === 'playing';
  const myName = state.players?.[mySeat]?.name || playerName;
  const opponentName = state.players?.[opponentSeat]?.name || 'Соперник';
  const opponentCount = state.opponentCardCount ?? 0;
  const currentColor = state.currentColor;
  const canDraw = myTurn && !state.drawnCardId && !state.challenge;
  const canPass = myTurn && Boolean(state.drawnCardId) && !state.challenge;

  return (
    <section className="uno-match">
      <div className="uno-status-row">
        <div className={`uno-turn-pill ${myTurn ? 'is-my-turn' : ''}`}>
          <span className={`uno-color-dot uno-color-dot--${currentColor}`} />
          {state.status === 'finished'
            ? 'Партия завершена'
            : state.challenge
              ? 'Решение по +4'
              : myTurn ? 'Твой ход' : 'Ход соперника'}
        </div>
        <div className="uno-current-color">Цвет: <strong>{COLOR_LABELS[currentColor]}</strong></div>
      </div>

      <div className="uno-opponent">
        <div className="uno-player-line">
          <div>
            <strong>{opponentName}</strong>
            <small>{opponentCount} {opponentCount === 1 ? 'карта' : 'карт'}</small>
          </div>
          {state.unoVulnerable === opponentSeat && <span className="uno-alert">забыл UNO!</span>}
        </div>
        <div className="uno-opponent-hand" aria-label={`У соперника ${opponentCount} карт`}>
          {Array.from({ length: Math.min(opponentCount, 18) }, (_, index) => (
            <CardBack key={index} small />
          ))}
          {opponentCount > 18 && <span className="uno-extra-count">+{opponentCount - 18}</span>}
        </div>
      </div>

      <div className="uno-table">
        <div className="uno-pile-block">
          <span className="uno-pile-label">Прикуп · {state.drawCount}</span>
          <button
            type="button"
            className={`uno-draw-pile ${canDraw ? 'is-active' : ''}`}
            onClick={() => canDraw && sendAction({ type: 'draw' })}
            disabled={!canDraw}
            aria-label="Взять карту из прикупа"
          >
            <CardBack />
          </button>
        </div>

        <div className="uno-pile-arrow">→</div>

        <div className="uno-pile-block">
          <span className="uno-pile-label">Сброс · {state.discardCount}</span>
          <div className="uno-discard-card"><UnoCard card={state.topCard} disabled /></div>
        </div>
      </div>

      <div className="uno-actions-row">
        {state.canCallUno && (
          <button className="uno-call-button" onClick={() => sendAction({ type: 'call-uno' })}>UNO!</button>
        )}
        {state.canCatchUno && (
          <button className="uno-catch-button" onClick={() => sendAction({ type: 'catch-uno' })}>Поймать UNO! +2</button>
        )}
        {canPass && (
          <button className="secondary-button" onClick={() => sendAction({ type: 'pass' })}>Не играть взятую карту</button>
        )}
      </div>

      {state.lastAction?.message && <div className="uno-event-line">{state.lastAction.message}</div>}
      {error && <div className="game-error">{error}</div>}

      <div className="uno-me">
        <div className="uno-player-line">
          <div>
            <strong>{myName} <span className="uno-you">ты</span></strong>
            <small>{state.hand?.length || 0} карт</small>
          </div>
          <span>{myTurn ? 'Выбирай карту' : 'Ожидай ход'}</span>
        </div>

        <div className="uno-hand" aria-label="Твои карты">
          {(state.hand || []).map((card) => (
            <UnoCard
              key={card.id}
              card={card}
              playable={myTurn && playable.has(card.id)}
              drawn={state.drawnCardId === card.id}
              disabled={!myTurn || !playable.has(card.id) || Boolean(state.challenge)}
              onClick={() => chooseCard(card)}
            />
          ))}
        </div>
      </div>

      {state.status === 'playing' && (
        <div className="uno-bottom-controls">
          <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Сдаться</button>
        </div>
      )}

      {wildChoice && (
        <div className="uno-modal-backdrop" role="dialog" aria-modal="true" aria-label="Выбор цвета">
          <div className="uno-color-picker">
            <span className="eyebrow">Wild-карта</span>
            <h2>Выбери новый цвет</h2>
            <div className="uno-color-picker__grid">
              {Object.entries(COLOR_LABELS).map(([color, label]) => (
                <button key={color} className={`uno-color-choice uno-color-choice--${color}`} onClick={() => playWild(color)}>
                  {label}
                </button>
              ))}
            </div>
            <button className="secondary-button" onClick={() => setWildChoice(null)}>Отмена</button>
          </div>
        </div>
      )}

      {state.challenge && (
        <div className="uno-modal-backdrop" role="dialog" aria-modal="true" aria-label="Wild Draw Four">
          <div className="uno-challenge-card">
            <div className="uno-challenge-card__symbol">+4</div>
            <span className="eyebrow">Wild Draw Four</span>
            <h2>Соперник сыграл +4</h2>
            <p>
              Можно взять 4 карты и пропустить ход или оспорить. Если у соперника была карта текущего цвета,
              он возьмёт 4. Если +4 сыграна законно — ты возьмёшь 6.
            </p>
            <div className="uno-challenge-actions">
              <button className="primary-button" onClick={() => sendAction({ type: 'accept-wild4' })}>Взять 4</button>
              <button className="secondary-button" onClick={() => sendAction({ type: 'challenge-wild4' })}>Оспорить +4</button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="uno-modal-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`uno-result uno-result--${result.won ? 'win' : 'lose'}`}>
            <div className="uno-result__icon">{result.icon}</div>
            <span className="eyebrow">Партия завершена</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="uno-result__actions">
              <button className="primary-button" onClick={onBack}>Выйти в главное меню</button>
              <button className="secondary-button" onClick={findMatch}>Найти нового соперника</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
