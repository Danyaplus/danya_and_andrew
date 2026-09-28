import { useEffect, useMemo, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './last-shell.css';

const ITEM_META = {
  lens: {
    icon: '◉',
    short: 'Линза',
    description: 'Показывает текущий патрон только тебе.',
  },
  medgel: {
    icon: '+',
    short: 'Мед-гель',
    description: 'Восстанавливает 1 жизнь, пока контур не оборван.',
  },
  restraint: {
    icon: '⛓',
    short: 'Фиксатор',
    description: 'Соперник пропускает следующий ход.',
  },
  ejector: {
    icon: '↥',
    short: 'Экстрактор',
    description: 'Извлекает текущий патрон без выстрела.',
  },
  'barrel-file': {
    icon: '⌁',
    short: 'Напильник',
    description: 'Следующий боевой выстрел наносит 2 урона.',
  },
  scanner: {
    icon: '▣',
    short: 'Сканер',
    description: 'Показывает один из патронов глубже в очереди.',
  },
  injector: {
    icon: '⇄',
    short: 'Инжектор',
    description: 'Крадёт случайный предмет у соперника.',
  },
  inverter: {
    icon: '±',
    short: 'Инвертор',
    description: 'Меняет текущий патрон: боевой ↔ холостой.',
  },
};

function getPlayerName() {
  const saved = localStorage.getItem('danya-andrew-player-name');
  if (saved) return saved;
  const generated = `Игрок ${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('danya-andrew-player-name', generated);
  return generated;
}

function resultPresentation(state) {
  if (!state || state.status !== 'finished') return null;
  const won = state.result?.winner === state.playerSeat;
  let text = state.result?.message || 'Дуэль завершена.';
  if (state.result?.type === 'disconnect') {
    text = won ? 'Соперник отключился. Дуэль твоя.' : 'Соединение с дуэлью потеряно.';
  }
  if (state.result?.type === 'resign') {
    text = won ? 'Соперник покинул стол.' : 'Ты покинул стол.';
  }
  return {
    won,
    title: won ? 'Ты пережил дуэль' : 'Дуэль окончена',
    subtitle: won ? 'Последний заряд остался за тобой.' : text,
  };
}

function LifeRail({ player, compact = false }) {
  const maxHp = player?.maxHp || 5;
  const hp = player?.hp ?? maxHp;
  return (
    <div className={`ls-life-rail ${compact ? 'is-compact' : ''}`}>
      {Array.from({ length: maxHp }, (_, index) => (
        <span
          key={index}
          className={`ls-life-cell ${index < hp ? 'is-live' : 'is-dead'} ${hp <= 2 && index < hp ? 'is-critical' : ''}`}
        />
      ))}
      {player?.healLocked && <span className="ls-wire-lock">контур оборван</span>}
    </div>
  );
}

function ItemCard({ item, disabled, onUse, opponent = false }) {
  const meta = ITEM_META[item.type] || { icon: '?', short: item.label || 'Предмет', description: '' };
  return (
    <button
      type="button"
      className={`ls-item-card ${opponent ? 'is-opponent' : ''}`}
      onClick={() => onUse?.(item.id)}
      disabled={disabled || opponent}
      title={meta.description}
    >
      <span className="ls-item-icon">{meta.icon}</span>
      <span className="ls-item-copy">
        <strong>{meta.short}</strong>
        {!opponent && <small>{meta.description}</small>}
      </span>
    </button>
  );
}

function ShellIcon({ type }) {
  return (
    <span className={`ls-shell ls-shell--${type}`}>
      <i />
      <b>{type === 'live' ? 'БОЕВОЙ' : 'ХОЛОСТОЙ'}</b>
    </span>
  );
}

function BlockOpponent({ hit = false, restrained = false }) {
  return (
    <div className={`ls-opponent ${hit ? 'is-hit' : ''} ${restrained ? 'is-restrained' : ''}`} aria-hidden="true">
      <div className="ls-opponent__shadow" />
      <div className="ls-opponent__head">
        <span className="ls-opponent__eye ls-opponent__eye--left" />
        <span className="ls-opponent__eye ls-opponent__eye--right" />
        <span className="ls-opponent__mouth" />
      </div>
      <div className="ls-opponent__torso" />
      <div className="ls-opponent__arm ls-opponent__arm--left" />
      <div className="ls-opponent__arm ls-opponent__arm--right" />
      {restrained && <div className="ls-opponent__restraint">⛓</div>}
    </div>
  );
}

export default function LastShellGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [fx, setFx] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const {
    waiting,
    state,
    error,
    setError,
    findMatch: startMatch,
    cancelSearch,
    sendAction,
  } = useMultiplayerGame('last-shell');

  const result = resultPresentation(state);
  const mySeat = state?.playerSeat;
  const opponentSeat = state?.opponentSeat;
  const myPlayer = mySeat ? state?.players?.[mySeat] : null;
  const opponentPlayer = opponentSeat ? state?.players?.[opponentSeat] : null;
  const myTurn = Boolean(state && state.status === 'playing' && state.turn === mySeat);

  const eventIsShot = state?.lastEvent?.type === 'shot';
  const opponentWasHit = Boolean(
    eventIsShot
    && state?.lastEvent?.shell === 'live'
    && state?.lastEvent?.target === opponentSeat,
  );
  const iWasHit = Boolean(
    eventIsShot
    && state?.lastEvent?.shell === 'live'
    && state?.lastEvent?.target === mySeat,
  );

  const chamberDots = useMemo(() => {
    if (!state) return [];
    return Array.from({ length: state.chamberRemaining || 0 }, (_, index) => index);
  }, [state?.chamberRemaining]);

  useEffect(() => {
    const event = state?.visualEvent;
    if (!event?.id) return undefined;

    let nextFx = '';
    if (event.type === 'shot') {
      if (event.shell === 'live') nextFx = event.target === state?.playerSeat ? 'hit-me' : 'shot-live';
      else nextFx = 'shot-blank';
    } else if (event.type === 'reload') nextFx = 'reload';
    else if (event.type === 'heal') nextFx = 'heal';
    else if (event.type === 'wire-cut') nextFx = 'wire-cut';
    else if (event.type === 'critical') nextFx = 'critical';
    else if (event.type === 'eject') nextFx = 'eject';
    else if (event.type === 'item') nextFx = 'item';

    setFx(nextFx);
    if (!nextFx) return undefined;
    const timer = window.setTimeout(() => setFx(''), nextFx === 'wire-cut' ? 1700 : 900);
    return () => window.clearTimeout(timer);
  }, [state?.visualEvent?.id, state?.playerSeat]);

  function findMatch() {
    setError('');
    setSelectedItem(null);
    startMatch(playerName);
  }

  function shoot(target) {
    if (!myTurn) return;
    setSelectedItem(null);
    sendAction({ type: 'shoot', payload: { target } });
  }

  function useItem(itemId) {
    if (!myTurn) return;
    setSelectedItem(itemId);
    sendAction({ type: 'use-item', payload: { itemId } });
    window.setTimeout(() => setSelectedItem(null), 450);
  }

  if (!state && !waiting) {
    return (
      <section className="ls-lobby">
        <div className="ls-lobby__scene" aria-hidden="true">
          <div className="ls-lobby__lamp" />
          <div className="ls-lobby__gun">⌁</div>
          <div className="ls-lobby__shells"><i /><i /><i /><i /></div>
        </div>
        <span className="eyebrow">Флагманская дуэль Danya & Andrew</span>
        <h1>Последний заряд</h1>
        <p>
          Пять жизней. Неизвестный порядок боевых и холостых патронов. Решай, куда направить следующий выстрел,
          используй предметы и читай соперника раньше, чем он прочитает тебя.
        </p>
        <div className="ls-lobby__features">
          <span>5 жизней</span><span>8 типов предметов</span><span>скрытый порядок патронов</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button className="primary-button primary-button--large" onClick={findMatch}>Сесть за стол</button>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="ls-waiting">
        <div className="ls-waiting__ring"><span /></div>
        <span className="eyebrow">Комната готова</span>
        <h2>Ждём второго игрока…</h2>
        <p>Свет уже включён. Как только соперник подключится, стол будет заряжен автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Встать из-за стола</button>
      </section>
    );
  }

  const myName = myPlayer?.name || playerName;
  const opponentName = opponentPlayer?.name || 'Соперник';
  const privateShell = state.privateNotice?.shell;
  const lastEventText = state.lastEvent?.message || 'Дуэль началась.';

  return (
    <section className={`ls-game ls-fx--${fx} ${myTurn ? 'is-my-turn' : 'is-opponent-turn'} ${iWasHit ? 'was-hit' : ''}`}>
      <div className="ls-hud">
        <div className="ls-player-hud ls-player-hud--enemy">
          <div>
            <small>НАПРОТИВ</small>
            <strong>{opponentName}</strong>
          </div>
          <LifeRail player={opponentPlayer} compact />
        </div>

        <div className={`ls-turn-sign ${myTurn ? 'is-active' : ''}`}>
          <span>{state.status === 'playing' ? (myTurn ? 'ТВОЙ ХОД' : 'ХОД СОПЕРНИКА') : 'ДУЭЛЬ ОКОНЧЕНА'}</span>
          <small>зарядка #{state.loadNumber}</small>
        </div>

        <div className="ls-player-hud ls-player-hud--me">
          <div>
            <small>ТЫ</small>
            <strong>{myName}</strong>
          </div>
          <LifeRail player={myPlayer} compact />
        </div>
      </div>

      <div className="ls-stage">
        <div className="ls-room-glow ls-room-glow--left" />
        <div className="ls-room-glow ls-room-glow--right" />
        <div className="ls-ceiling-lamp"><i /></div>
        <div className="ls-back-wall">
          <span className="ls-wall-line ls-wall-line--one" />
          <span className="ls-wall-line ls-wall-line--two" />
          <span className="ls-warning-sign">NO EXIT</span>
        </div>

        <BlockOpponent hit={opponentWasHit} restrained={opponentPlayer?.restrained} />

        <div className="ls-hand ls-hand--left" aria-hidden="true"><i /></div>
        <div className="ls-hand ls-hand--right" aria-hidden="true"><i /></div>

        <div className="ls-shotgun" aria-hidden="true">
          <div className="ls-shotgun__barrels"><i /><i /></div>
          <div className="ls-shotgun__receiver" />
          <div className="ls-shotgun__stock" />
          <span className="ls-shotgun__metal" />
          {state.damageBoosted && <span className="ls-shotgun__boost">×2</span>}
        </div>

        <div className="ls-muzzle-flash" aria-hidden="true" />
        <div className="ls-screen-hit" aria-hidden="true" />
        <div className="ls-wire-animation" aria-hidden="true"><span>✂</span><i /></div>

        <div className="ls-table">
          <div className="ls-table__grain" />
          <div className="ls-opponent-items">
            <span className="ls-rack-label">СТОРОНА СОПЕРНИКА</span>
            <div className="ls-item-rack ls-item-rack--opponent">
              {(state.opponentItems || []).length === 0 && <span className="ls-rack-empty">пусто</span>}
              {(state.opponentItems || []).map((item) => (
                <ItemCard key={item.id} item={item} opponent />
              ))}
            </div>
          </div>

          <div className="ls-chamber-board">
            <div className="ls-counts">
              <span className="ls-count ls-count--live"><b>{state.liveCount}</b> боевых</span>
              <span className="ls-count ls-count--blank"><b>{state.blankCount}</b> холостых</span>
            </div>
            <div className="ls-chamber-dots" aria-label={`${state.chamberRemaining} патронов осталось`}>
              {chamberDots.map((index) => <i key={index} />)}
            </div>
            <small>Порядок скрыт</small>
          </div>

          <div className="ls-event-strip">
            <span>{lastEventText}</span>
          </div>

          {state.privateNotice && (
            <div className="ls-private-card">
              <span>ТОЛЬКО ДЛЯ ТЕБЯ</span>
              {privateShell && <ShellIcon type={privateShell} />}
              <strong>{state.privateNotice.message}</strong>
            </div>
          )}

          <div className="ls-action-panel">
            <button
              type="button"
              className="ls-action-button ls-action-button--enemy"
              onClick={() => shoot('opponent')}
              disabled={!myTurn}
            >
              <span className="ls-action-crosshair">◎</span>
              <strong>В соперника</strong>
              <small>Боевой снимет {state.damageBoosted ? '2 жизни' : '1 жизнь'}</small>
            </button>
            <button
              type="button"
              className="ls-action-button ls-action-button--self"
              onClick={() => shoot('self')}
              disabled={!myTurn}
            >
              <span className="ls-action-crosshair">◌</span>
              <strong>В себя</strong>
              <small>Холостой оставит ход тебе</small>
            </button>
          </div>

          <div className="ls-my-items">
            <div className="ls-rack-heading">
              <span className="ls-rack-label">ТВОИ ПРЕДМЕТЫ</span>
              <small>{state.ownItems?.length || 0}/8</small>
            </div>
            <div className="ls-item-rack">
              {(state.ownItems || []).length === 0 && <span className="ls-rack-empty">На столе пусто</span>}
              {(state.ownItems || []).map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  disabled={!myTurn || selectedItem === item.id}
                  onUse={useItem}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ls-footer-status">
        <div>
          <span className={`ls-status-dot ${myTurn ? 'is-live' : ''}`} />
          <strong>{myTurn ? 'Решай.' : 'Смотри на соперника.'}</strong>
        </div>
        {myPlayer?.healLocked && <span className="ls-danger-note">Лечение заблокировано</span>}
        {error && <div className="game-error">{error}</div>}
        {state.status === 'playing' && (
          <button className="danger-button" onClick={() => sendAction({ type: 'resign' })}>Покинуть дуэль</button>
        )}
      </div>

      {result && (
        <div className="ls-result-backdrop" role="dialog" aria-modal="true" aria-label={result.title}>
          <div className={`ls-result-card ${result.won ? 'is-win' : 'is-loss'}`}>
            <div className="ls-result-mark">{result.won ? '◆' : '◇'}</div>
            <span className="eyebrow">Стол замолчал</span>
            <h2>{result.title}</h2>
            <p>{result.subtitle}</p>
            <div className="ls-result-actions">
              <button className="primary-button" onClick={findMatch}>Новая дуэль</button>
              <button className="secondary-button" onClick={onBack}>В главное меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
