import { getPlayerName } from '../../lib/playerName.js';
import { useEffect, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';
import './turtle-race.css';

const GAME_ID = 'turtle-race';


const between = (number, min, max) => Math.max(min, Math.min(max, number));
const seconds = (ms) => `${Math.max(0, ms / 1000).toFixed(1)} с`;

// Один расчёт положения и для анимации, и для момента нажатия.
function needleAt(now, game) {
  const period = game.needlePeriodMs || 1600;
  const elapsed = (((now - game.startAt + (game.meterOffsetMs || 0)) % period) + period) % period;
  const fraction = elapsed / period;
  return fraction < 0.5 ? fraction * 2 : (1 - fraction) * 2;
}

function Turtle({ color = 'coral', racing = false, boosted = false }) {
  return (
    <svg className={`tr-turtle tr-turtle--${color} ${racing ? 'is-running' : ''} ${boosted ? 'is-boosted' : ''}`}
      viewBox="0 0 132 88" aria-hidden="true">
      <ellipse className="tr-turtle__shadow" cx="61" cy="79" rx="52" ry="6" />
      <g className="tr-turtle__legs">
        <ellipse cx="40" cy="68" rx="13" ry="11" fill="#71ba76" stroke="#356a4a" strokeWidth="3" />
        <ellipse cx="87" cy="70" rx="14" ry="11" fill="#71ba76" stroke="#356a4a" strokeWidth="3" />
      </g>
      <path d="M16 51C23 15 43 10 70 12c31 0 42 24 44 44-16 17-79 20-98-5Z" fill="var(--tr-shell)" stroke="var(--tr-shell-dark)" strokeWidth="5" />
      <path d="M45 18 66 13 86 24 82 44 57 51 37 37Z" fill="var(--tr-shell-light)" stroke="var(--tr-shell-dark)" strokeWidth="3" strokeLinejoin="round" />
      <path d="m17 48 20-11 20 14-2 18M82 44l27 7M66 13l-1 8" fill="none" stroke="var(--tr-shell-dark)" strokeWidth="3" strokeLinecap="round" />
      <path d="M100 47c7-17 21-14 26-7 5 8 3 21-5 26-10 6-22 2-26-9" fill="#89d998" stroke="#397756" strokeWidth="4" />
      <ellipse cx="116" cy="44" rx="5" ry="7" fill="#f6ffff" />
      <ellipse cx="118" cy="45" rx="2.5" ry="4" fill="#243643" />
      <path d="m117 57 5 1" stroke="#397756" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="24" cy="57" rx="12" ry="6" fill="#78c684" />
    </svg>
  );
}

function Track({ label, name, color, racer, phase, now, mine, roadRef, runnerRef, progressRef }) {
  const distance = between(racer?.distance ?? 0, 0, 100);
  const running = phase === 'racing';
  const boosted = running && racer?.boostUntil > now;
  return (
    <div className={`tr-lane tr-lane--${color}`}>
      <div className="tr-lane__head">
        <span className="tr-lane__tag">{label}</span>
        <strong title={name}>{name}</strong>
        <span className="tr-lane__metres">{Math.floor(distance)} м <small>/ 100</small></span>
      </div>
      <div className="tr-road" ref={roadRef}>
        <div className="tr-road__pattern" />
        <span className="tr-road__start" aria-hidden="true">СТАРТ</span>
        <span className="tr-road__finish" aria-hidden="true">🏁</span>
        <div className="tr-runner" ref={runnerRef}>
          {boosted && <span className="tr-runner__trail">✦ ✦</span>}
          <Turtle color={color} racing={running} boosted={boosted} />
          {boosted && <i className="tr-runner__boost">⚡</i>}
        </div>
      </div>
      <div className="tr-progress" aria-label={`${name}: ${Math.floor(distance)} метров`}>
        <div ref={progressRef} />
      </div>
      {mine && <span className="tr-lane__mine" aria-hidden="true">★</span>}
    </div>
  );
}

function LobbyStage() {
  return (
    <div className="tr-lobby-stage" aria-hidden="true">
      <div className="tr-lobby-stage__flag">🏁</div>
      <div className="tr-lobby-stage__runner tr-lobby-stage__runner--top"><Turtle color="coral" racing /></div>
      <div className="tr-lobby-stage__runner tr-lobby-stage__runner--bottom"><Turtle color="cyan" racing /></div>
      <div className="tr-lobby-stage__line" />
    </div>
  );
}

export default function TurtleRaceGame({ onBack }) {
  const [playerName] = useState(getPlayerName);
  const [time, setTime] = useState(Date.now());
  const [feedback, setFeedback] = useState('');
  const lastFeedbackRef = useRef(0);
  const lastLocalTapRef = useRef(-Infinity);
  const needleRef = useRef(null);
  const visibleNeedleRef = useRef(0.5);
  const myRoadRef = useRef(null);
  const foeRoadRef = useRef(null);
  const myRunnerRef = useRef(null);
  const foeRunnerRef = useRef(null);
  const myProgressRef = useRef(null);
  const foeProgressRef = useRef(null);
  const widthsRef = useRef({ meter: 0, mine: 0, foe: 0 });
  const packetRef = useRef(null);
  const visualRef = useRef({ round: null, mine: 0, foe: 0, frameAt: 0 });
  const clockRef = useRef({ round: null, server: Date.now(), local: performance.now() });
  const tapRef = useRef(() => {});
  const { waiting, state, error, findMatch, cancelSearch, sendAction } = useMultiplayerGame(GAME_ID);

  // Привязка ко времени сервера устанавливается лишь раз за заезд.
  // Иначе задержка каждого сетевого пакета заставляет стрелку дёргаться.
  useEffect(() => {
    if (!state?.serverTime) return;
    const receivedAt = performance.now();
    const roundKey = `${state.roomId}:${state.round}`;
    if (clockRef.current.round !== roundKey) {
      clockRef.current = { round: roundKey, server: state.serverTime, local: receivedAt };
      visualRef.current = { round: roundKey, mine: 0, foe: 0, frameAt: receivedAt };
      lastLocalTapRef.current = -Infinity;
    }
    packetRef.current = { state, receivedAt };
  }, [state]);

  const serverNow = (localNow) => clockRef.current.server + localNow - clockRef.current.local;

  // Таймер обновляет только надписи. Движение полностью вынесено в RAF.
  useEffect(() => {
    if (!state) return undefined;
    const updateTime = () => setTime(serverNow(performance.now()));
    updateTime();
    const timer = setInterval(updateTime, 100);
    return () => clearInterval(timer);
  }, [Boolean(state)]);

  // Размеры измеряются на ResizeObserver, а не на каждом кадре.
  useEffect(() => {
    if (!state) return undefined;
    const updateWidths = () => {
      widthsRef.current = {
        meter: needleRef.current?.parentElement?.clientWidth || 0,
        mine: myRoadRef.current?.clientWidth || 0,
        foe: foeRoadRef.current?.clientWidth || 0,
      };
    };
    updateWidths();
    const observer = new ResizeObserver(updateWidths);
    for (const element of [needleRef.current?.parentElement, myRoadRef.current, foeRoadRef.current]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [Boolean(state)]);

  // Плавное рисование на частоте экрана; позиция прогнозируется между
  // сетевыми обновлениями и мягко подстраивается под данные сервера.
  useEffect(() => {
    if (!state) return undefined;
    let frameId;
    const animate = (stamp) => {
      const packet = packetRef.current;
      if (packet) {
        const game = packet.state;
        const visual = visualRef.current;
        const deltaMs = Math.min(50, Math.max(0, stamp - visual.frameAt));
        visual.frameAt = stamp;
        const smoothing = 1 - Math.exp(-deltaMs / 75);
        for (const [key, racer, road, runner, progress] of [
          ['mine', game.racers?.[game.playerSeat], 'mine', myRunnerRef.current, myProgressRef.current],
          ['foe', game.racers?.[game.opponentSeat], 'foe', foeRunnerRef.current, foeProgressRef.current],
        ]) {
          if (!racer) continue;
          const sincePacket = Math.min(450, Math.max(0, stamp - packet.receivedAt));
          const predicted = between(racer.distance + (game.phase === 'racing' ? racer.speed * sincePacket / 1000 : 0), 0, 100);
          visual[key] = game.phase === 'countdown' ? 0 : Math.max(visual[key], visual[key] + (predicted - visual[key]) * smoothing);
          if (runner) runner.style.transform = `translate3d(calc(-50% + ${visual[key] * 0.0082 * widthsRef.current[road]}px),0,0)`;
          if (progress) progress.style.transform = `scaleX(${visual[key] / 100})`;
        }
        if (needleRef.current) {
          const position = needleAt(serverNow(stamp), game);
          visibleNeedleRef.current = position;
          needleRef.current.style.transform = `translate3d(${position * widthsRef.current.meter}px,0,0) translateX(-50%)`;
        }
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [Boolean(state)]);

  // Сохраняем координату именно нарисованной стрелки в момент касания,
  // а не пересчитываем её на сервере после сетевой задержки.
  tapRef.current = () => {
    const game = packetRef.current?.state;
    if (!game || game.status !== 'playing' || game.phase !== 'racing') return;
    const localNow = performance.now();
    const player = game.racers?.[game.playerSeat];
    const cooldown = game.tapCooldownMs || 760;
    if (localNow - lastLocalTapRef.current < cooldown) return;
    if (player?.lastTapAt != null && serverNow(localNow) - player.lastTapAt < cooldown) return;
    lastLocalTapRef.current = localNow;
    sendAction({ type: 'tap', needlePosition: visibleNeedleRef.current });
  };

  useEffect(() => {
    const keyDown = (event) => {
      if ((event.code !== 'Space' && event.code !== 'Enter') || event.repeat) return;
      if (event.target?.closest?.('button,input,textarea,select')) return;
      event.preventDefault();
      tapRef.current();
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);

  const mySeat = state?.playerSeat;
  const foeSeat = state?.opponentSeat;
  const mine = mySeat ? state?.racers?.[mySeat] : null;
  const theirs = foeSeat ? state?.racers?.[foeSeat] : null;
  const meName = mySeat ? state?.players?.[mySeat]?.name || playerName : playerName;
  const foeName = foeSeat ? state?.players?.[foeSeat]?.name || 'Соперник' : 'Соперник';
  const myScore = mySeat ? state?.scores?.[mySeat] ?? 0 : 0;
  const foeScore = foeSeat ? state?.scores?.[foeSeat] ?? 0 : 0;
  const racing = state?.status === 'playing' && state?.phase === 'racing';
  const cooldownLeft = mine?.lastTapAt == null ? 0 : Math.max(0, (state?.tapCooldownMs ?? 760) - (time - mine.lastTapAt));
  const canTap = racing && cooldownLeft <= 0;
  const countdown = state?.phase === 'countdown' ? Math.max(1, Math.ceil(((state.startAt ?? time) - time) / 1000)) : 0;
  const timeLeft = state?.phase === 'racing' ? Math.max(0, (state.endAt ?? time) - time) : 0;
  const matchResult = state?.status === 'finished' ? state.result : null;
  const wasWinner = matchResult && matchResult.winner === mySeat;
  const isDraw = matchResult && !matchResult.winner;

  useEffect(() => {
    if (!mine?.lastQualityAt || mine.lastQualityAt === lastFeedbackRef.current) return;
    lastFeedbackRef.current = mine.lastQualityAt;
    setFeedback(mine.lastQuality);
    const timer = setTimeout(() => setFeedback(''), 900);
    return () => clearTimeout(timer);
  }, [mine?.lastQualityAt, mine?.lastQuality]);

  function start() {
    lastFeedbackRef.current = 0;
    lastLocalTapRef.current = -Infinity;
    setFeedback('');
    findMatch(playerName);
  }

  function goBack() {
    if (typeof onBack === 'function') onBack();
    else window.location.hash = '#/';
  }

  if (!state && !waiting) {
    return (
      <section className="tr-lobby">
        <span className="tr-eyebrow">🐢 ГОНКА В РЕАЛЬНОМ ВРЕМЕНИ</span>
        <h1>Гонка <span>черепах</span></h1>
        <p>Попадай в зелёную зону и разгоняй свою черепаху. Идеальное попадание даёт турбоускорение, промах ненадолго тормозит. У кого больше побед за три заезда — тот чемпион!</p>
        <LobbyStage />
        <div className="tr-rules">
          <span>🎯 Лови зелёную зону</span><span>⚡ Получай ускорение</span><span>🏁 До 3 заездов</span>
        </div>
        {error && <div className="game-error">{error}</div>}
        <button className="tr-primary" type="button" onClick={start}>Найти соперника <span>→</span></button>
        <p className="tr-small">Управление: кнопка на телефоне · пробел или Enter на компьютере</p>
      </section>
    );
  }

  if (waiting) {
    return (
      <section className="tr-lobby tr-lobby--waiting">
        <div className="tr-waiting-icon">🐢</div>
        <span className="tr-eyebrow">ПОДКЛЮЧАЕМ ЗАЕЗД</span>
        <h2>Ищем соперника…</h2>
        <p>Пока черепаха разминается, ждём второго гонщика. Старт будет общим для обоих.</p>
        <button type="button" className="tr-secondary" onClick={cancelSearch}>Отменить поиск</button>
      </section>
    );
  }

  return (
    <section className="tr-game">
      <div className="tr-hud">
        <div className="tr-hud__player tr-hud__player--you">
          <small>🔴 ТЫ</small><strong>{meName}</strong><b>{myScore}</b>
        </div>
        <div className="tr-hud__center">
          <small>ЗАЕЗД {state.round} ИЗ {state.maxRounds}</small>
          <strong>{myScore} <span>:</span> {foeScore}</strong>
          <em>{state.phase === 'racing' ? seconds(timeLeft) : state.phase === 'countdown' ? 'ГОТОВЬСЯ' : 'ФИНИШ'}</em>
        </div>
        <div className="tr-hud__player tr-hud__player--foe">
          <small>🔵 СОПЕРНИК</small><strong>{foeName}</strong><b>{foeScore}</b>
        </div>
      </div>

      <div className="tr-stadium">
        <div className="tr-stadium__sky"><span>☁️</span><span>☀️</span><span>☁️</span></div>
        <div className="tr-stadium__title">🏆 ТУРНИР ЧЕРЕПАХ · 100 МЕТРОВ</div>
        <Track name={foeName} label="СОПЕРНИК" color="cyan" racer={theirs} phase={state.phase} now={time} roadRef={foeRoadRef} runnerRef={foeRunnerRef} progressRef={foeProgressRef} />
        <div className="tr-stadium__divider"><span>VS</span></div>
        <Track name={meName} label="ТВОЯ ЧЕРЕПАХА" color="coral" racer={mine} phase={state.phase} now={time} roadRef={myRoadRef} runnerRef={myRunnerRef} progressRef={myProgressRef} mine />

        {state.phase === 'countdown' && (
          <div className="tr-stage-banner"><span>ПРИГОТОВЬСЯ!</span><strong>{countdown}</strong><small>Жди сигнала старта</small></div>
        )}
        {state.phase === 'round-over' && (
          <div className="tr-stage-banner tr-stage-banner--result"><span>ЗАЕЗД {state.round} ЗАВЕРШЁН</span>
            <strong>{!state.roundWinner ? '🤝' : state.roundWinner === mySeat ? '🏆' : '🏁'}</strong>
            <small>{state.roundMessage}</small></div>
        )}
      </div>

      <div className="tr-controls">
        <div className="tr-controls__top"><span>ИНДИКАТОР УСКОРЕНИЯ</span><strong>{feedback === 'perfect' ? '⚡ ИДЕАЛЬНО!' : feedback === 'good' ? '✨ ОТЛИЧНО!' : feedback === 'miss' ? '❌ МИМО!' : 'ПОЙМАЙ ЗЕЛЁНУЮ ЗОНУ'}</strong></div>
        <div className={`tr-meter ${feedback ? `tr-meter--${feedback}` : ''}`}>
          <div className="tr-meter__zone" style={{ left: `${state.greenMin * 100}%`, width: `${(state.greenMax - state.greenMin) * 100}%` }}>
            <div className="tr-meter__perfect" style={{ left: `${((state.perfectMin - state.greenMin) / (state.greenMax - state.greenMin)) * 100}%`, width: `${((state.perfectMax - state.perfectMin) / (state.greenMax - state.greenMin)) * 100}%` }}/>
          </div>
          <div className="tr-meter__needle" ref={needleRef} />
        </div>
        <div className="tr-meter__legend"><span>ПРОМАХ</span><span>ИДЕАЛЬНО</span><span>ПРОМАХ</span></div>
        <button type="button" disabled={!canTap}
          className={`tr-tap ${feedback ? `tr-tap--${feedback}` : ''}`}
          onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); tapRef.current(); } }}
          onClick={(event) => { if (event.detail === 0) tapRef.current(); }}>
          <span>{racing ? cooldownLeft > 0 ? '⏳' : '⚡' : '🏁'}</span>
          <strong>{!racing ? 'ЖДИ СТАРТА' : cooldownLeft > 0 ? 'ВОССТАНОВЛЕНИЕ' : 'УСКОРИТЬ!'}</strong>
          <small>{cooldownLeft > 0 && racing ? `${Math.ceil(cooldownLeft / 100) / 10} с` : 'Нажми, когда стрелка в зелёном'}</small>
        </button>
        <div className="tr-controls__footer"><span>✅ Точные попадания: <b>{mine?.goodTaps ?? 0}</b></span><span>⭐ Идеальные: <b>{mine?.perfectTaps ?? 0}</b></span></div>
      </div>

      <div className="tr-bottom">
        <span>⌨️ Пробел / Enter · на телефоне — большая кнопка</span>
        {state.status === 'playing' && <button type="button" onClick={() => sendAction({ type: 'resign' })}>Сдаться</button>}
      </div>
      {error && <div className="game-error">{error}</div>}

      {matchResult && (
        <div className="tr-finish-backdrop" role="dialog" aria-modal="true" aria-label="Результат гонки">
          <div className={`tr-finish ${isDraw ? 'tr-finish--draw' : wasWinner ? 'tr-finish--win' : 'tr-finish--lose'}`}>
            <div className="tr-finish__emoji">{isDraw ? '🤝' : wasWinner ? '🏆' : '🏁'}</div>
            <span className="tr-eyebrow">ТУРНИР ЗАВЕРШЁН</span>
            <h2>{isDraw ? 'НИЧЬЯ!' : wasWinner ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</h2>
            <p>{matchResult.message}</p>
            <div className="tr-finish__scores"><div><small>ТЫ</small><strong>{myScore}</strong></div><span>:</span><div><small>СОПЕРНИК</small><strong>{foeScore}</strong></div></div>
            <div className="tr-finish__buttons"><button type="button" className="tr-primary" onClick={start}>Играть ещё</button><button type="button" className="tr-secondary" onClick={goBack}>Все игры</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
