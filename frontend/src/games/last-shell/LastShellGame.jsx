import { useEffect, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './last-shell.css';


let lsAudioContext = null;

function ensureLsAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!lsAudioContext) lsAudioContext = new AudioCtx();
    if (lsAudioContext.state === 'suspended') lsAudioContext.resume();
    return lsAudioContext;
  } catch {
    return null;
  }
}

function tone(ctx, frequency, duration, volume = 0.05, type = 'sine', delay = 0) {
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playLsSound(kind) {
  const ctx = ensureLsAudio();
  if (!ctx) return;
  if (kind === 'live') {
    tone(ctx, 92, .13, .12, 'sawtooth');
    tone(ctx, 48, .22, .08, 'square', .015);
    tone(ctx, 180, .06, .035, 'triangle', .01);
  } else if (kind === 'blank') {
    tone(ctx, 980, .028, .035, 'square');
    tone(ctx, 430, .055, .025, 'triangle', .035);
  } else if (kind === 'reload') {
    tone(ctx, 210, .045, .025, 'square');
    tone(ctx, 310, .05, .025, 'square', .08);
    tone(ctx, 160, .06, .02, 'square', .17);
  } else if (kind === 'item') {
    tone(ctx, 520, .05, .022, 'triangle');
    tone(ctx, 760, .08, .018, 'triangle', .05);
  } else if (kind === 'heal') {
    tone(ctx, 360, .12, .025, 'sine');
    tone(ctx, 520, .14, .022, 'sine', .08);
  }
}

const ITEM_META = {
  lens: { icon: '◉', short: 'Линза', description: 'Показывает текущий заряд только тебе.' },
  medgel: { icon: '+', short: 'Мед-гель', description: 'Восстанавливает 1 жизнь, пока контур не оборван.' },
  restraint: { icon: '⛓', short: 'Фиксатор', description: 'Соперник пропускает следующий ход.' },
  ejector: { icon: '↥', short: 'Экстрактор', description: 'Удаляет текущий заряд без выстрела.' },
  'barrel-file': { icon: '⌁', short: 'Напильник', description: 'Следующий боевой выстрел наносит 2 урона.' },
  scanner: { icon: '▣', short: 'Сканер', description: 'Показывает один заряд глубже в очереди.' },
  injector: { icon: '⇄', short: 'Инжектор', description: 'Крадёт случайный предмет соперника.' },
  inverter: { icon: '±', short: 'Инвертор', description: 'Меняет текущий заряд: боевой ↔ холостой.' },
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
  let subtitle = state.result?.message || 'Дуэль завершена.';
  if (state.result?.type === 'disconnect') subtitle = won ? 'Соперник отключился. Стол остался за тобой.' : 'Соединение с дуэлью потеряно.';
  if (state.result?.type === 'resign') subtitle = won ? 'Соперник покинул стол.' : 'Ты покинул стол.';
  return {
    won,
    title: won ? 'ТЫ ВЫИГРАЛ' : 'ТЫ ПРОИГРАЛ',
    subtitle,
  };
}

function LifeRail({ player, label }) {
  const maxHp = player?.maxHp || 5;
  const hp = player?.hp ?? maxHp;
  return (
    <div className="ls-vitals">
      <div className="ls-vitals__head">
        <span>{label}</span>
        <b>{hp}/{maxHp}</b>
      </div>
      <div className="ls-life-rail">
        {Array.from({ length: maxHp }, (_, index) => (
          <span
            key={index}
            className={`ls-life-cell ${index < hp ? 'is-live' : 'is-dead'} ${hp <= 2 && index < hp ? 'is-critical' : ''}`}
          />
        ))}
      </div>
      {player?.healLocked && <div className="ls-wire-lock">КОНТУР ОБОРВАН</div>}
    </div>
  );
}

function ItemCard({ item, disabled, opponent = false, onUse }) {
  const meta = ITEM_META[item.type] || { icon: '?', short: item.label || 'Предмет', description: '' };
  return (
    <button
      type="button"
      className={`ls-item-card ${opponent ? 'is-opponent' : ''}`}
      onClick={() => onUse?.(item.id)}
      disabled={disabled || opponent}
      aria-label={`${meta.short}. ${meta.description}`}
      title={meta.description}
    >
      <span className="ls-item-card__shine" />
      <span className="ls-item-icon">{meta.icon}</span>
      <span className="ls-item-copy">
        <strong>{meta.short}</strong>
        <small>{meta.description}</small>
      </span>
    </button>
  );
}

function BlockOpponent({ hit, restrained, critical }) {
  return (
    <div className={`ls-opponent ${hit ? 'is-hit' : ''} ${restrained ? 'is-restrained' : ''} ${critical ? 'is-critical' : ''}`} aria-hidden="true">
      <div className="ls-opponent__aura" />
      <div className="ls-opponent__shadow" />
      <div className="ls-opponent__chair" />
      <div className="ls-opponent__body">
        <div className="ls-opponent__head">
          <span className="ls-opponent__eye ls-opponent__eye--left" />
          <span className="ls-opponent__eye ls-opponent__eye--right" />
          <span className="ls-opponent__mouth" />
        </div>
        <div className="ls-opponent__torso" />
        <div className="ls-opponent__arm ls-opponent__arm--left" />
        <div className="ls-opponent__arm ls-opponent__arm--right" />
      </div>
      {restrained && <div className="ls-opponent__chains">⛓</div>}
    </div>
  );
}

function Weapon({ boosted, visualEvent }) {
  const firing = visualEvent?.type === 'shot';
  const blank = firing && visualEvent?.shell === 'blank';
  return (
    <div className={`ls-weapon-wrap ${firing ? 'is-firing' : ''} ${blank ? 'is-blank' : ''} ${boosted ? 'is-boosted' : ''}`} aria-hidden="true">
      <div className="ls-weapon-glow" />
      <div className="ls-weapon">
        <span className="ls-weapon__stock" />
        <span className="ls-weapon__receiver" />
        <span className="ls-weapon__hinge" />
        <span className="ls-weapon__barrel ls-weapon__barrel--top" />
        <span className="ls-weapon__barrel ls-weapon__barrel--bottom" />
        <span className="ls-weapon__muzzle" />
        <span className="ls-weapon__trigger" />
        <span className="ls-weapon__sight" />
      </div>
      <div className="ls-muzzle-flash"><i /><i /><i /></div>
      <div className="ls-smoke"><i /><i /><i /></div>
    </div>
  );
}

function ChamberStrip({ state }) {
  return (
    <div className="ls-chamber-panel">
      <div className="ls-chamber-panel__title">
        <span>ЗАРЯДКА #{state?.loadNumber ?? 0}</span>
        <strong>ПОРЯДОК СКРЫТ</strong>
      </div>
      <div className="ls-memory-note">
        <span>◌</span>
        <div>
          <strong>Считай сам</strong>
          <small>Количество боевых и холостых показывается только при зарядке.</small>
        </div>
      </div>
    </div>
  );
}

function ReloadSequence({ announcement, items = [] }) {
  if (!announcement) return null;

  return (
    <div className="ls-reload-overlay" key={announcement.id} aria-live="assertive">
      <div className="ls-reload-countdown" aria-hidden="true">
        <span className="ls-countdown-number ls-countdown-number--3">3</span>
        <span className="ls-countdown-number ls-countdown-number--2">2</span>
        <span className="ls-countdown-number ls-countdown-number--1">1</span>
      </div>

      <div className="ls-load-reveal">
        <small>ЗАРЯДКА #{announcement.loadNumber}</small>
        <h2>ЗАПОМНИ РАСКЛАД</h2>
        <div className="ls-load-reveal__counts">
          <div className="ls-load-reveal__count is-live">
            <span className="ls-load-shell">●</span>
            <b>{announcement.liveCount}</b>
            <em>БОЕВЫХ</em>
          </div>
          <div className="ls-load-reveal__count is-blank">
            <span className="ls-load-shell">○</span>
            <b>{announcement.blankCount}</b>
            <em>ХОЛОСТЫХ</em>
          </div>
        </div>
        <p>Порядок патронов неизвестен. После начала раунда подсказка исчезнет.</p>
      </div>

      <div className="ls-deal-reveal">
        <small>ВЫДАНО НА ЭТУ ЗАРЯДКУ</small>
        <h3>{items.length ? 'ТВОИ НОВЫЕ ПРЕДМЕТЫ' : 'НОВЫХ ПРЕДМЕТОВ НЕТ'}</h3>
        <div className="ls-deal-reveal__items">
          {items.map((item) => {
            const meta = ITEM_META[item.type] || { icon: '?', short: item.label || 'Предмет', description: '' };
            return (
              <div className="ls-dealt-item" key={item.id}>
                <span>{meta.icon}</span>
                <div><strong>{meta.short}</strong><small>{meta.description}</small></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PrivateNotice({ notice }) {
  if (!notice) return null;
  const shellClass = notice.shell ? ` is-${notice.shell}` : '';
  return (
    <div className={`ls-private-notice${shellClass}`}>
      <div className="ls-private-notice__eye">◉</div>
      <div>
        <small>ТОЛЬКО ДЛЯ ТЕБЯ</small>
        <strong>{notice.message}</strong>
      </div>
    </div>
  );
}

export default function LastShellGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [fx, setFx] = useState('');
  const [showRules, setShowRules] = useState(false);
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
  const myTurn = Boolean(state && state.status === 'playing' && state.phase === 'playing' && state.turn === mySeat);

  const eventIsShot = state?.lastEvent?.type === 'shot';
  const opponentWasHit = Boolean(eventIsShot && state?.lastEvent?.shell === 'live' && state?.lastEvent?.target === opponentSeat);
  const iWasHit = Boolean(eventIsShot && state?.lastEvent?.shell === 'live' && state?.lastEvent?.target === mySeat);

  useEffect(() => {
    const event = state?.visualEvent;
    if (!event?.id) return undefined;
    let nextFx = '';
    if (event.type === 'shot') nextFx = event.shell === 'live' ? (event.target === state?.playerSeat ? 'hit-me' : 'shot-live') : 'shot-blank';
    else if (event.type === 'reload') nextFx = 'reload';
    else if (event.type === 'heal') nextFx = 'heal';
    else if (event.type === 'wire-cut') nextFx = 'wire-cut';
    else if (event.type === 'critical') nextFx = 'critical';
    else if (event.type === 'eject') nextFx = 'eject';
    else if (event.type === 'item') nextFx = 'item';
    setFx(nextFx);
    if (event.type === 'shot') playLsSound(event.shell === 'live' ? 'live' : 'blank');
    else if (event.type === 'reload') playLsSound('reload');
    else if (event.type === 'heal') playLsSound('heal');
    else if (event.type === 'item' || event.type === 'eject') playLsSound('item');
    if (event.target === state?.playerSeat && event.type === 'shot' && event.shell === 'live') {
      try { navigator.vibrate?.([35, 25, 55]); } catch {}
    }
    if (!nextFx) return undefined;
    const timer = window.setTimeout(() => setFx(''), nextFx === 'wire-cut' ? 1800 : 950);
    return () => window.clearTimeout(timer);
  }, [state?.visualEvent?.id, state?.playerSeat]);

  function findMatch() {
    ensureLsAudio();
    setError('');
    startMatch(playerName);
  }

  function shoot(target) {
    ensureLsAudio();
    if (!myTurn) return;
    setError('');
    sendAction({ type: 'shoot', payload: { target } });
  }

  function useItem(itemId) {
    ensureLsAudio();
    if (!myTurn) return;
    setError('');
    sendAction({ type: 'use-item', payload: { itemId } });
  }

  function resign() {
    if (!state || state.status !== 'playing') return;
    sendAction({ type: 'resign' });
  }

  if (!state && !waiting) {
    return (
      <section className="ls-lobby">
        <div className="ls-lobby__noise" />
        <div className="ls-lobby__scene" aria-hidden="true">
          <div className="ls-lobby__lamp"><i /></div>
          <div className="ls-lobby__weapon"><Weapon boosted={false} /></div>
          <div className="ls-lobby__table" />
          <div className="ls-lobby__shells"><i /><i /><i /><i /><i /></div>
        </div>
        <div className="ls-lobby__content">
          <span className="ls-kicker">DANYA & ANDREW // SIGNATURE GAME</span>
          <h1>ПОСЛЕДНИЙ<br /><em>ЗАРЯД</em></h1>
          <p>Пять жизней. Неизвестный порядок зарядов. Один стол. Один выбор за ход.</p>
          <div className="ls-lobby__badges">
            <span>5 жизней</span><span>8 предметов</span><span>скрытая очередь</span><span>дуэль 1×1</span>
          </div>
          <div className="ls-lobby__actions">
            <button className="ls-main-cta" onClick={findMatch}>СЕСТЬ ЗА СТОЛ</button>
            <button className="ls-rules-button" onClick={() => setShowRules(true)}>Как играть</button>
          </div>
          {error && <div className="game-error">{error}</div>}
        </div>
        {showRules && (
          <div className="ls-rules-modal" role="dialog" aria-modal="true">
            <div className="ls-rules-card">
              <button className="ls-rules-close" onClick={() => setShowRules(false)}>×</button>
              <span className="ls-kicker">КРАТКО</span>
              <h2>Как пережить стол</h2>
              <p>В начале первой зарядки всегда 2 боевых и 2 холостых. Дальше зарядки случайные: от 4 до 10 патронов. Количество показывается один раз — потом считай сам.</p>
              <div className="ls-rule-grid">
                <div><b>01</b><span>Выбирай: направить выстрел в себя или в соперника.</span></div>
                <div><b>02</b><span>Холостой в себя сохраняет твой ход.</span></div>
                <div><b>03</b><span>После каждой новой зарядки каждый игрок получает максимум 2 новых предмета.</span></div>
                <div><b>04</b><span>На одной жизни лечебный контур блокируется.</span></div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="ls-waiting">
        <div className="ls-waiting__scanner"><i /><i /><i /></div>
        <span className="ls-kicker">КАНАЛ ОТКРЫТ</span>
        <h2>Ждём второго игрока</h2>
        <p>Стол уже подготовлен. Подключение соперника начнёт дуэль автоматически.</p>
        <button className="secondary-button" onClick={cancelSearch}>Встать из-за стола</button>
      </section>
    );
  }

  const myName = myPlayer?.name || playerName;
  const opponentName = opponentPlayer?.name || 'Соперник';
  const lastEventText = state.lastEvent?.message || 'Дуэль началась.';
  const opponentCritical = (opponentPlayer?.hp ?? 5) <= 2;
  const meCritical = (myPlayer?.hp ?? 5) <= 2;

  return (
    <section className={`ls-game ls-fx--${fx} ${myTurn ? 'is-my-turn' : 'is-opponent-turn'} ${iWasHit ? 'was-hit' : ''} ${meCritical ? 'is-critical-me' : ''}`}>
      <div className="ls-screen-grain" />
      <div className="ls-screen-vignette" />
      <div className="ls-hit-flash" />

      <div className="ls-hud">
        <div className="ls-hud-player ls-hud-player--enemy">
          <div className="ls-hud-player__name"><small>НАПРОТИВ</small><strong>{opponentName}</strong></div>
          <LifeRail player={opponentPlayer} label="Состояние" />
        </div>

        <div className={`ls-turn-core ${myTurn ? 'is-active' : ''}`}>
          <span className="ls-turn-core__pulse" />
          <small>{state.status === 'playing' ? 'ТЕКУЩИЙ ХОД' : 'СТАТУС'}</small>
          <strong>{state.status === 'playing' ? (myTurn ? 'ТВОЙ' : 'СОПЕРНИКА') : 'ЗАВЕРШЕНО'}</strong>
        </div>

        <div className="ls-hud-player ls-hud-player--me">
          <div className="ls-hud-player__name"><small>ТЫ</small><strong>{myName}</strong></div>
          <LifeRail player={myPlayer} label="Состояние" />
        </div>
      </div>

      <div className="ls-stage">
        <div className="ls-room-backdrop">
          <div className="ls-ceiling-light"><span /></div>
          <div className="ls-back-wall-grid" />
          <div className="ls-back-wall-sign">LAST // SHELL</div>
          <div className="ls-back-wall-cable ls-back-wall-cable--left" />
          <div className="ls-back-wall-cable ls-back-wall-cable--right" />
        </div>

        <div className="ls-opponent-zone">
          <BlockOpponent hit={opponentWasHit} restrained={opponentPlayer?.restrained} critical={opponentCritical} />
          <div className="ls-opponent-tag"><span>{opponentName}</span><small>{opponentPlayer?.itemCount ?? 0} предметов</small></div>
        </div>

        <div className="ls-weapon-zone">
          <Weapon boosted={state.damageBoosted} visualEvent={state.visualEvent} />
        </div>

        <div className="ls-table">
          <div className="ls-table__edge" />
          <div className="ls-table__reflection" />
          <div className="ls-table__mark ls-table__mark--one" />
          <div className="ls-table__mark ls-table__mark--two" />

          <div className="ls-table-center">
            <ChamberStrip state={state} />
            <div className="ls-event-terminal">
              <small>ПОСЛЕДНЕЕ СОБЫТИЕ</small>
              <p>{lastEventText}</p>
            </div>
            <PrivateNotice notice={state.privateNotice} />
          </div>

        </div>

        <div className="ls-hands" aria-hidden="true">
          <div className="ls-hand ls-hand--left"><i /><i /><i /></div>
          <div className="ls-hand ls-hand--right"><i /><i /><i /></div>
        </div>
      </div>

      <div className="ls-items-dock">
        <section className="ls-items-ui ls-items-ui--opponent" aria-label="Предметы соперника">
          <div className="ls-items-label"><span>НАПРОТИВ</span><strong>ПРЕДМЕТЫ СОПЕРНИКА</strong></div>
          <div className="ls-items-ui__grid">
            {(state.opponentItems || []).slice(0, 8).map((item) => (
              <ItemCard key={item.id} item={item} opponent />
            ))}
            {(state.opponentItems || []).length === 0 && <span className="ls-empty-items">У соперника пока нет предметов</span>}
          </div>
        </section>

        <section className="ls-items-ui ls-items-ui--mine" aria-label="Твои предметы">
          <div className="ls-items-label is-mine"><span>ТВОЯ СТОРОНА</span><strong>ТВОИ ПРЕДМЕТЫ</strong></div>
          <div className="ls-items-ui__grid">
            {(state.ownItems || []).map((item) => (
              <ItemCard key={item.id} item={item} disabled={!myTurn || state.status !== 'playing'} onUse={useItem} />
            ))}
            {(state.ownItems || []).length === 0 && <span className="ls-empty-items">Предметов пока нет</span>}
          </div>
        </section>
      </div>

      <div className="ls-command-deck">
        <div className="ls-command-deck__status">
          <span className={`ls-status-light ${myTurn ? 'is-ready' : ''}`} />
          <div>
            <small>{state.phase === 'loading' ? 'ИДЁТ ЗАРЯДКА' : (myTurn ? 'ОРУЖИЕ ДОСТУПНО' : 'ОРУЖИЕ ЗАБЛОКИРОВАНО')}</small>
            <strong>{state.phase === 'loading' ? 'Запомни патроны и предметы' : (myTurn ? 'Выбери направление' : 'Жди хода соперника')}</strong>
          </div>
        </div>

        <div className="ls-shot-actions">
          <button type="button" className="ls-shot-button ls-shot-button--self" disabled={!myTurn || state.status !== 'playing'} onClick={() => shoot('self')}>
            <span className="ls-shot-button__icon">↺</span>
            <span><small>РИСК</small><strong>В СЕБЯ</strong></span>
          </button>
          <button type="button" className="ls-shot-button ls-shot-button--enemy" disabled={!myTurn || state.status !== 'playing'} onClick={() => shoot('opponent')}>
            <span><small>АТАКА</small><strong>В СОПЕРНИКА</strong></span>
            <span className="ls-shot-button__icon">◎</span>
          </button>
        </div>

        <button type="button" className="ls-resign" onClick={resign} disabled={state.status !== 'playing'}>Покинуть стол</button>
      </div>

      {state.phase === 'loading' && (
        <ReloadSequence announcement={state.loadAnnouncement} items={state.newlyDealtItems || []} />
      )}

      {error && <div className="ls-floating-error">{error}</div>}

      {result && (
        <div className={`ls-result-overlay ${result.won ? 'is-win' : 'is-lose'}`} role="dialog" aria-modal="true">
          <div className="ls-result-lines"><i /><i /><i /></div>
          <div className="ls-result-card">
            <span className="ls-kicker">DUEL COMPLETE</span>
            <div className="ls-result-symbol">{result.won ? '◆' : '◇'}</div>
            <h2>{result.title}</h2>
            <p>{result.subtitle}</p>
            <div className="ls-result-actions">
              <button className="ls-main-cta" onClick={findMatch}>НОВАЯ ДУЭЛЬ</button>
              <button className="ls-rules-button" onClick={onBack}>В главное меню</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
