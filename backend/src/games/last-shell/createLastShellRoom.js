import { randomUUID } from 'node:crypto';

const MAX_HP = 5;
const MAX_ITEMS = 8;

const ITEM_TYPES = [
  'lens',
  'medgel',
  'restraint',
  'ejector',
  'barrel-file',
  'scanner',
  'injector',
  'inverter',
];

const ITEM_LABELS = {
  lens: 'Смотровая линза',
  medgel: 'Мед-гель',
  restraint: 'Фиксатор',
  ejector: 'Экстрактор',
  'barrel-file': 'Напильник ствола',
  scanner: 'Карманный сканер',
  injector: 'Инжектор',
  inverter: 'Инвертор заряда',
};

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function shuffle(array) {
  const next = [...array];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function makeItem(type) {
  return {
    id: randomUUID(),
    type,
    label: ITEM_LABELS[type] || type,
  };
}

function shellCounts(chamber) {
  let live = 0;
  let blank = 0;
  for (const shell of chamber) {
    if (shell === 'live') live += 1;
    else blank += 1;
  }
  return { live, blank };
}

function buildChamber(previousSize = 0) {
  let size = 4 + Math.floor(Math.random() * 4); // 4..7
  if (previousSize === size && Math.random() < 0.45) size = size === 7 ? 5 : size + 1;

  const maxLive = Math.max(1, size - 1);
  const live = 1 + Math.floor(Math.random() * maxLive);
  const blank = size - live;
  return shuffle([
    ...Array.from({ length: live }, () => 'live'),
    ...Array.from({ length: blank }, () => 'blank'),
  ]);
}

export function createLastShellRoom({ roomId, players, io, onFinish }) {
  const shuffledPlayers = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffledPlayers[0].socketId, name: safePlayerName(shuffledPlayers[0].name) },
    b: { socketId: shuffledPlayers[1].socketId, name: safePlayerName(shuffledPlayers[1].name) },
  };

  const hp = { a: MAX_HP, b: MAX_HP };
  const healLocked = { a: false, b: false };
  const inventories = { a: [], b: [] };
  const damageBoost = { a: false, b: false };
  const skipNext = { a: 0, b: 0 };
  const privateNotice = { a: null, b: null };

  let chamber = [];
  let lastChamberSize = 0;
  let loadNumber = 0;
  let turn = Math.random() < 0.5 ? 'a' : 'b';
  let status = 'playing';
  let result = null;
  let lastEvent = null;
  let visualEvent = null;
  let eventCounter = 0;
  let visualCounter = 0;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function event(type, payload = {}) {
    eventCounter += 1;
    lastEvent = {
      id: eventCounter,
      type,
      at: Date.now(),
      ...payload,
    };
  }

  function visual(type, payload = {}) {
    visualCounter += 1;
    visualEvent = {
      id: visualCounter,
      type,
      at: Date.now(),
      ...payload,
    };
  }

  function addItems(seat, amount) {
    const space = Math.max(0, MAX_ITEMS - inventories[seat].length);
    const count = Math.min(space, amount);
    for (let i = 0; i < count; i += 1) {
      const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
      inventories[seat].push(makeItem(type));
    }
  }

  function reloadChamber({ initial = false, suppressVisual = false } = {}) {
    chamber = buildChamber(lastChamberSize);
    lastChamberSize = chamber.length;
    loadNumber += 1;
    privateNotice.a = null;
    privateNotice.b = null;

    if (!initial) {
      addItems('a', 2);
      addItems('b', 2);
    } else {
      addItems('a', 3);
      addItems('b', 3);
    }

    const counts = shellCounts(chamber);
    event('reload', {
      loadNumber,
      chamberSize: chamber.length,
      liveCount: counts.live,
      blankCount: counts.blank,
      message: `Заряжено: ${counts.live} боевых, ${counts.blank} холостых. Порядок неизвестен.`,
    });
    if (!suppressVisual) visual('reload', { loadNumber });
  }

  function passTurn(fromSeat) {
    const next = opposite(fromSeat);
    if (skipNext[next] > 0) {
      skipNext[next] -= 1;
      event('skip', {
        actor: fromSeat,
        target: next,
        message: `${bySeat[next].name} пропускает следующий ход.`,
      });
      turn = fromSeat;
      return;
    }
    turn = next;
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    event('finish', {
      winner: nextResult.winner,
      reason: nextResult.type,
      message: nextResult.message,
    });
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function afterDamage(target, previousHp) {
    if (hp[target] <= 1 && previousHp > 1) {
      healLocked[target] = true;
      event('wire-cut', {
        target,
        hp: hp[target],
        message: `Контур ${bySeat[target].name} оборван — восстановление больше невозможно.`,
      });
      visual('wire-cut', { target });
    } else if (hp[target] === 2 && previousHp > 2) {
      event('critical', {
        target,
        hp: hp[target],
        message: `${bySeat[target].name}: критический уровень. Защитный контур открыт.`,
      });
      visual('critical', { target });
    }
  }

  function removeItem(seat, itemId) {
    const index = inventories[seat].findIndex((item) => item.id === itemId);
    if (index < 0) return null;
    const [item] = inventories[seat].splice(index, 1);
    return item;
  }

  function handleShot(socketId, payload = {}) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat || turn !== seat) {
      io.to(socketId).emit('game:error', { gameId: 'last-shell', roomId, message: 'Сейчас ход соперника.' });
      return;
    }

    const target = payload.target === 'self' ? seat : opposite(seat);
    if (chamber.length === 0) reloadChamber();

    const shell = chamber.shift();
    const boost = damageBoost[seat];
    damageBoost[seat] = false;
    privateNotice[seat] = null;

    let damage = 0;
    if (shell === 'live') {
      damage = boost ? 2 : 1;
      const previousHp = hp[target];
      hp[target] = Math.max(0, hp[target] - damage);

      event('shot', {
        actor: seat,
        target,
        shell,
        damage,
        boosted: boost,
        selfShot: target === seat,
        message: target === seat
          ? `${bySeat[seat].name} получил ${damage} урона.`
          : `${bySeat[seat].name} попал в соперника: ${damage} урона.`,
      });
      visual('shot', { actor: seat, target, shell, damage, boosted: boost });

      if (hp[target] <= 0) {
        finish({
          type: 'elimination',
          winner: opposite(target),
          loser: target,
          message: `${bySeat[target].name} выбыл из дуэли.`,
        });
        return;
      }

      afterDamage(target, previousHp);
      passTurn(seat);
    } else {
      event('shot', {
        actor: seat,
        target,
        shell,
        damage: 0,
        boosted: boost,
        selfShot: target === seat,
        message: target === seat
          ? 'Холостой. Ты сохраняешь ход.'
          : 'Холостой. Ход переходит сопернику.',
      });
      visual('shot', { actor: seat, target, shell, damage: 0, boosted: boost });

      if (target !== seat) passTurn(seat);
      else turn = seat;
    }

    if (status === 'playing' && chamber.length === 0) reloadChamber({ suppressVisual: true });
    emitState();
  }

  function useLens(seat) {
    if (chamber.length === 0) reloadChamber();
    privateNotice[seat] = {
      kind: 'peek-current',
      shell: chamber[0],
      message: chamber[0] === 'live' ? 'Следующий патрон — боевой.' : 'Следующий патрон — холостой.',
    };
    event('item', { actor: seat, item: 'lens', message: `${bySeat[seat].name} проверяет патрон.` });
    visual('item', { actor: seat, item: 'lens' });
  }

  function useMedgel(seat, socketId) {
    if (healLocked[seat]) {
      io.to(socketId).emit('game:error', { gameId: 'last-shell', roomId, message: 'Контур повреждён: восстановление заблокировано.' });
      return false;
    }
    if (hp[seat] >= MAX_HP) {
      io.to(socketId).emit('game:error', { gameId: 'last-shell', roomId, message: 'Здоровье уже полное.' });
      return false;
    }
    hp[seat] = Math.min(MAX_HP, hp[seat] + 1);
    event('heal', { actor: seat, hp: hp[seat], message: `${bySeat[seat].name} восстанавливает 1 заряд.` });
    visual('heal', { actor: seat });
    return true;
  }

  function useRestraint(seat) {
    const target = opposite(seat);
    skipNext[target] = Math.min(1, skipNext[target] + 1);
    event('item', { actor: seat, target, item: 'restraint', message: `${bySeat[target].name} зафиксирован и пропустит один ход.` });
    visual('item', { actor: seat, item: 'restraint', target });
  }

  function useEjector(seat) {
    if (chamber.length === 0) reloadChamber();
    const shell = chamber.shift();
    privateNotice[seat] = {
      kind: 'ejected',
      shell,
      message: shell === 'live' ? 'Экстрактор выбросил боевой патрон.' : 'Экстрактор выбросил холостой патрон.',
    };
    event('eject', { actor: seat, shell, message: `${bySeat[seat].name} извлёк один патрон без выстрела.` });
    visual('eject', { actor: seat, shell });
    if (chamber.length === 0) reloadChamber({ suppressVisual: true });
  }

  function useBarrelFile(seat, socketId) {
    if (damageBoost[seat]) {
      io.to(socketId).emit('game:error', { gameId: 'last-shell', roomId, message: 'Ствол уже подготовлен к усиленному выстрелу.' });
      return false;
    }
    damageBoost[seat] = true;
    event('item', { actor: seat, item: 'barrel-file', message: `${bySeat[seat].name} усиливает следующий боевой выстрел.` });
    visual('item', { actor: seat, item: 'barrel-file' });
    return true;
  }

  function useScanner(seat, socketId) {
    if (chamber.length < 2) {
      io.to(socketId).emit('game:error', { gameId: 'last-shell', roomId, message: 'В барабане слишком мало патронов для сканирования.' });
      return false;
    }
    const index = 1 + Math.floor(Math.random() * (chamber.length - 1));
    const shell = chamber[index];
    privateNotice[seat] = {
      kind: 'scan-deep',
      index: index + 1,
      shell,
      message: `${index + 1}-й патрон в очереди — ${shell === 'live' ? 'боевой' : 'холостой'}.`,
    };
    event('item', { actor: seat, item: 'scanner', message: `${bySeat[seat].name} получает сигнал со сканера.` });
    visual('item', { actor: seat, item: 'scanner' });
    return true;
  }

  function useInjector(seat, socketId) {
    const target = opposite(seat);
    if (inventories[target].length === 0) {
      io.to(socketId).emit('game:error', { gameId: 'last-shell', roomId, message: 'У соперника нет предметов для перехвата.' });
      return false;
    }
    const index = Math.floor(Math.random() * inventories[target].length);
    const [stolen] = inventories[target].splice(index, 1);
    inventories[seat].push(stolen);
    privateNotice[seat] = {
      kind: 'stolen',
      message: `Перехвачен предмет: ${stolen.label}.`,
    };
    event('item', { actor: seat, target, item: 'injector', message: `${bySeat[seat].name} перехватывает предмет соперника.` });
    visual('item', { actor: seat, item: 'injector', target });
    return true;
  }

  function useInverter(seat) {
    if (chamber.length === 0) reloadChamber();
    chamber[0] = chamber[0] === 'live' ? 'blank' : 'live';
    privateNotice[seat] = {
      kind: 'invert',
      shell: chamber[0],
      message: `Текущий патрон изменён на ${chamber[0] === 'live' ? 'боевой' : 'холостой'}.`,
    };
    event('item', { actor: seat, item: 'inverter', message: `${bySeat[seat].name} меняет состояние текущего патрона.` });
    visual('item', { actor: seat, item: 'inverter' });
  }

  function handleUseItem(socketId, payload = {}) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat || turn !== seat) {
      io.to(socketId).emit('game:error', { gameId: 'last-shell', roomId, message: 'Предметы можно использовать только в свой ход.' });
      return;
    }

    const item = inventories[seat].find((entry) => entry.id === payload.itemId);
    if (!item) return;

    let consumed = true;
    if (item.type === 'lens') useLens(seat);
    else if (item.type === 'medgel') consumed = useMedgel(seat, socketId);
    else if (item.type === 'restraint') useRestraint(seat);
    else if (item.type === 'ejector') useEjector(seat);
    else if (item.type === 'barrel-file') consumed = useBarrelFile(seat, socketId);
    else if (item.type === 'scanner') consumed = useScanner(seat, socketId);
    else if (item.type === 'injector') consumed = useInjector(seat, socketId);
    else if (item.type === 'inverter') useInverter(seat);

    if (consumed) removeItem(seat, item.id);
    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({ type: 'resign', winner: opposite(seat), loser: seat, message: `${bySeat[seat].name} покинул дуэль.` });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'shoot') handleShot(socketId, action.payload);
    else if (action.type === 'use-item') handleUseItem(socketId, action.payload);
    else if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({ type: 'disconnect', winner: opposite(seat), loser: seat, message: 'Соперник отключился от игры.' });
  }

  function publicItems(seat) {
    return inventories[seat].map((item) => ({ id: item.id, type: item.type, label: item.label }));
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    const opponentSeat = opposite(playerSeat);
    const counts = shellCounts(chamber);

    return {
      gameId: 'last-shell',
      roomId,
      playerSeat,
      opponentSeat,
      players: {
        a: {
          name: bySeat.a.name,
          hp: hp.a,
          maxHp: MAX_HP,
          healLocked: healLocked.a,
          itemCount: inventories.a.length,
          restrained: skipNext.a > 0,
        },
        b: {
          name: bySeat.b.name,
          hp: hp.b,
          maxHp: MAX_HP,
          healLocked: healLocked.b,
          itemCount: inventories.b.length,
          restrained: skipNext.b > 0,
        },
      },
      turn,
      status,
      result,
      loadNumber,
      chamberRemaining: chamber.length,
      liveCount: counts.live,
      blankCount: counts.blank,
      lastEvent,
      visualEvent,
      ownItems: publicItems(playerSeat),
      opponentItems: publicItems(opponentSeat),
      privateNotice: privateNotice[playerSeat],
      damageBoosted: damageBoost[playerSeat],
      opponentDamageBoosted: damageBoost[opponentSeat],
    };
  }

  function emitState() {
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  reloadChamber({ initial: true });

  return {
    id: roomId,
    gameId: 'last-shell',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {},
  };
}
