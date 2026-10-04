import { useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './memory-battle.css';

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;

  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;

  if (state.result?.type === 'draw') {
    return {
      kind: 'draw',
      icon: '🤝',
      title: 'Ничья',
      text: state.result?.message || 'Вы собрали одинаковое количество пар.',
    };
  }

  const won = state.result?.winner === state.playerSeat;
  return {
    kind: won ? 'win' : 'lose',
    icon: won ? '🏆' : '🃏',
    title: won ? 'Ты победил!' : 'Ты проиграл',
    text: state.result?.message || 'Все пары собраны.',
  };
}

function Collection({ player, mine }) {
  return (
    <div className={`memory-collection ${mine ? 'is-mine' : ''}`}>
      <div className="memory-collection__score">
        <small>{mine ? 'ТВОИ ПАРЫ' : 'ПАРЫ СОПЕРНИКА'}</small>
        <strong>{player?.score ?? 0}</strong>
      </div>
      <div className="memory-collection__items" aria-label="Собранные пары">
        {(player?.pairs || []).map((symbol, index) => (
          <span key={`${symbol}-${index}`}>{symbol}</span>
        ))}
        {!player?.pairs?.length && <em>пока пусто</em>}
      </div>
    </div>
  );
}

export default function MemoryBattleGame({ onBack }) {
  const [playerName] = useState(getPlayerName);

  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('memory-battle');

  function findMatch() {
    setError('');
    startMatch(playerName);
  }

  function flipCard(cardId) {
    if (!state || state.status !== 'playing') return;
    if (state.turn !== state.playerSeat || state.locked) return;

    const card = state.cards?.[cardId];
    if (!card || card.revealed || card.matchedBy) return;

    setError('');
    sendAction({ type: 'flip', payload: { cardId } });
    navigator.vibrate?.(8);
  }

  function resign() {
    if (state?.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="memory-lobby">
        <div className="memory-lobby__cards" aria-hidden="true">
          <span>🍓</span><span>?</span><span>🚀</span><span>?</span>
        </div>
        <span className="eyebrow">2 игрока · 8 пар · память и удача</span>
        <h1>Memory Battle</h1>
        <p>
          Все карточки закрыты. Открывай по две: если картинки одинаковые —
          пара твоя и ты сразу ходишь ещё раз. Если разные — карточки снова
          закрываются, а ход переходит сопернику.
        </p>
        <div className="memory-rules">
          <span>🃏 16 карточек</span>
          <span>✨ совпала пара — дополнительный ход</span>
          <span>🏆 в конце побеждает тот, у кого больше пар</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button type="button" className="primary-button primary-button--large" onClick={findMatch}>
          Найти соперника
        </button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="memory-waiting">
        <div className="memory-waiting__icon">🃏</div>
        <span className="eyebrow">Memory Battle · 2 игрока</span>
        <h2>Ищем второго игрока…</h2>
        <p>Как только соперник подключится, карточки перемешаются и матч начнётся.</p>
        <button type="button" className="secondary-button" onClick={cancelSearch}>
          Отменить поиск
        </button>
      </section>
    );
  }

  const me = state.playerSeat;
  const foe = state.opponentSeat;
  const myPlayer = state.players?.[me];
  const foePlayer = state.players?.[foe];
  const myTurn = state.status === 'playing' && state.turn === me;
  const result = resultPresentation(state);
  const event = state.lastEvent;

  return (
    <section className="memory-game">
      <div className="memory-scorebar">
        <div className={`memory-player ${myTurn ? 'is-turn' : ''}`}>
          <span className="memory-player__avatar">🧠</span>
          <div>
            <small>Ты</small>
            <strong>{myPlayer?.name || playerName}</strong>
          </div>
          <b>{myPlayer?.score ?? 0}</b>
        </div>

        <div className="memory-turn">
          <small>ХОД</small>
          <strong>
            {state.status === 'finished'
              ? 'Матч окончен'
              : myTurn
                ? (state.locked ? 'Проверяем…' : 'Твой ход')
                : 'Ход соперника'}
          </strong>
          <span>{(state.cards || []).filter((card) => card.matchedBy).length / 2}/{state.pairCount} пар открыто</span>
        </div>

        <div className={`memory-player memory-player--right ${!myTurn && state.status === 'playing' ? 'is-turn' : ''}`}>
          <b>{foePlayer?.score ?? 0}</b>
          <div>
            <small>Соперник</small>
            <strong>{foePlayer?.name || 'Игрок'}</strong>
          </div>
          <span className="memory-player__avatar">🎴</span>
        </div>
      </div>

      <div className="memory-layout">
        <div className="memory-main">
          <div className="memory-board" role="grid" aria-label="Поле Memory Battle">
            {(state.cards || []).map((card) => {
              const isOpen = Boolean(card.symbol);
              const isMatched = Boolean(card.matchedBy);
              const canFlip = myTurn && !state.locked && !isOpen && !isMatched;

              return (
                <button
                  key={card.id}
                  type="button"
                  role="gridcell"
                  className={[
                    'memory-card',
                    isOpen ? 'is-open' : '',
                    isMatched ? `is-matched is-matched-${card.matchedBy}` : '',
                    canFlip ? 'is-clickable' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={!canFlip}
                  onClick={() => flipCard(card.id)}
                  aria-label={isOpen ? `Карточка ${card.symbol}` : 'Закрытая карточка'}
                >
                  <span className="memory-card__inner">
                    <span className="memory-card__back">
                      <i>✦</i>
                    </span>
                    <span className="memory-card__front">
                      <b>{card.symbol || '✦'}</b>
                      {isMatched && <small>{card.matchedBy === me ? 'твоя' : 'соперника'}</small>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {event && (
            <div key={event.serial} className={`memory-event memory-event--${event.type}`}>
              <strong>{event.type === 'match' ? `${event.symbol} ПАРА!` : 'НЕ СОВПАЛО'}</strong>
              <span>{event.message}</span>
            </div>
          )}
        </div>

        <aside className="memory-side">
          <Collection player={myPlayer} mine />
          <Collection player={foePlayer} />

          <div className="memory-tip">
            <span>💡</span>
            <p>
              Запоминай, где видел одинаковые картинки. За найденную пару ход
              <strong> не переходит</strong> сопернику.
            </p>
          </div>

          {error && <div className="game-error">{error}</div>}

          {state.status === 'playing' && (
            <button type="button" className="danger-button" onClick={resign}>
              Сдаться
            </button>
          )}
        </aside>
      </div>

      {result && (
        <div className="memory-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`memory-result memory-result--${result.kind}`}>
            <div className="memory-result__icon">{result.icon}</div>
            <span className="eyebrow">Все пары собраны</span>
            <h2>{result.title}</h2>
            <p>{result.text}</p>
            <div className="memory-result__score">
              <strong>{myPlayer?.score ?? 0}</strong>
              <span>:</span>
              <strong>{foePlayer?.score ?? 0}</strong>
            </div>
            <div className="memory-result__actions">
              <button type="button" className="primary-button" onClick={findMatch}>
                Сыграть ещё
              </button>
              <button type="button" className="secondary-button" onClick={onBack}>
                В меню
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
