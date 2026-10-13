const GAME_ID = 'whack-a-mole';
const COUNTDOWN_MS = 3000;
const GAME_MS = 50000;
const WAVE_BREAK_MS = 160;
const TICK_MS = 75;
const HIT_COOLDOWN_MS = 140;

function playerName(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 28) : 'Игрок';
}

function other(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

export function createWhackAMoleRoom({ roomId, players, io, onFinish }) {
  const order = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: order[0].socketId, name: playerName(order[0].name), score: 0, caught: 0, mistakes: 0, lastTap: -Infinity, hitHoles: new Set() },
    b: { socketId: order[1].socketId, name: playerName(order[1].name), score: 0, caught: 0, mistakes: 0, lastTap: -Infinity, hitHoles: new Set() },
  };

  let status = 'playing';
  let phase = 'countdown';
  let result = null;
  let waveNumber = 0;
  let wave = null;
  let nextWaveAt = null;
  let lastWaveHoles = [];
  let finishedOnce = false;
  const gameStartsAt = Date.now() + COUNTDOWN_MS;
  const gameEndsAt = gameStartsAt + GAME_MS;

  function seatOf(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshot(socketId, now) {
    const seat = seatOf(socketId);
    const visibleWave = wave && now < wave.expiresAt ? wave : null;
    return {
      gameId: GAME_ID,
      roomId,
      status,
      phase,
      playerSeat: seat,
      opponentSeat: seat ? other(seat) : null,
      serverTime: now,
      startsAt: gameStartsAt,
      endsAt: gameEndsAt,
      waveNumber,
      wave: visibleWave ? {
        id: visibleWave.id,
        expiresAt: visibleWave.expiresAt,
        targets: visibleWave.targets,
      } : null,
      hitHoles: seat ? [...bySeat[seat].hitHoles] : [],
      players: {
        a: { name: bySeat.a.name, score: bySeat.a.score, caught: bySeat.a.caught, mistakes: bySeat.a.mistakes },
        b: { name: bySeat.b.name, score: bySeat.b.score, caught: bySeat.b.caught, mistakes: bySeat.b.mistakes },
      },
      result,
    };
  }

  function emitState() {
    const now = Date.now();
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshot(bySeat[seat].socketId, now));
    }
  }

  function end(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = { winner, type, message };
    wave = null;
    clearInterval(ticker);
    emitState();
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function endByScore() {
    const a = bySeat.a.score;
    const b = bySeat.b.score;
    const winner = a === b ? null : a > b ? 'a' : 'b';
    const message = winner ? `${bySeat[winner].name} поймал больше кротов!` : 'Ничья! Оба игрока заработали одинаковое количество очков.';
    end(winner, winner ? 'score' : 'draw', message);
  }

  function newWave(now) {
    const progress = (now - gameStartsAt) / GAME_MS;
    const duration = Math.max(700, 1240 - Math.floor(progress * 470));
    const count = waveNumber > 4 && Math.random() < 0.28 ? 2 : 1;
    const available = Array.from({ length: 9 }, (_, i) => i).filter((i) => !lastWaveHoles.includes(i));
    const targets = [];
    for (let i = 0; i < count; i += 1) {
      const pick = randomInt(available.length);
      const hole = available.splice(pick, 1)[0];
      const luck = Math.random();
      const kind = waveNumber > 5 && luck < 0.11 ? 'trap' : luck < 0.29 ? 'gold' : 'mole';
      targets.push({ hole, kind });
    }
    lastWaveHoles = targets.map((target) => target.hole);
    waveNumber += 1;
    wave = { id: waveNumber, targets, expiresAt: Math.min(now + duration, gameEndsAt) };
    bySeat.a.hitHoles.clear();
    bySeat.b.hitHoles.clear();
    emitState();
  }

  function handleHit(socketId, payload) {
    if (status !== 'playing' || phase !== 'playing') return;
    const seat = seatOf(socketId);
    if (!seat) return;
    const now = Date.now();
    if (now >= gameEndsAt) {
      endByScore();
      return;
    }
    const hole = payload?.hole;
    if (!Number.isInteger(hole) || hole < 0 || hole > 8) return;
    // The server verifies the active appearance; a client cannot invent a winning hit.
    if (!wave || now >= wave.expiresAt || payload?.waveId !== wave.id) return;

    const player = bySeat[seat];
    if (player.hitHoles.has(hole) || now - player.lastTap < HIT_COOLDOWN_MS) return;
    player.lastTap = now;
    player.hitHoles.add(hole);

    const target = wave.targets.find((item) => item.hole === hole);
    if (!target) {
      player.score = Math.max(0, player.score - 1);
      player.mistakes += 1;
    } else if (target.kind === 'trap') {
      player.score = Math.max(0, player.score - 2);
      player.mistakes += 1;
    } else {
      player.score += target.kind === 'gold' ? 3 : 1;
      player.caught += 1;
    }
    emitState();
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'hit') handleHit(socketId, action.payload);
    if (action.type === 'resign' && status === 'playing') {
      const seat = seatOf(socketId);
      if (seat) end(other(seat), 'resign', `${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatOf(socketId);
    if (seat) end(other(seat), 'disconnect', 'Соперник отключился от игры.');
  }

  function tick() {
    if (status !== 'playing') return;
    const now = Date.now();
    if (now >= gameEndsAt) {
      endByScore();
      return;
    }
    if (phase === 'countdown') {
      if (now >= gameStartsAt) {
        phase = 'playing';
        newWave(now);
      } else if (now - lastTimerEmitAt >= 250) {
        lastTimerEmitAt = now;
        emitState();
      }
      return;
    }
    if (wave && now >= wave.expiresAt) {
      wave = null;
      nextWaveAt = now + WAVE_BREAK_MS;
      emitState();
    }
    if (!wave && nextWaveAt !== null && now >= nextWaveAt) {
      nextWaveAt = null;
      newWave(now);
    }
    // Update the shared timer even when nobody hits a mole.
    if (now - lastTimerEmitAt >= 400) {
      lastTimerEmitAt = now;
      emitState();
    }
  }

  let lastTimerEmitAt = 0;
  const ticker = setInterval(tick, TICK_MS);
  ticker.unref?.();
  emitState();

  return {
    id: roomId,
    gameId: GAME_ID,
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() { clearInterval(ticker); },
  };
}
