const TOTAL_ROUNDS = 5;
const ROUND_INTRO_MS = 850;
const ROUND_GAP_MS = 650;
const RESULT_HOLD_MS = 2600;
const TICK_MS = 25;
const EMIT_EVERY_MS = 50;

const WORLD = { width: 1000, height: 600 };
const SLINGS = {
  a: { x: 105, y: 520 },
  b: { x: 895, y: 520 },
};

const PROJECTILE_SPEED = 790;
const PROJECTILE_RADIUS = 9;
const BIRD_RADIUS = 29;
const MAX_PROJECTILES = 18;
const INPUT_COOLDOWN_MS = 70;

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function cubic(a, b, c, d, t) {
  const u = 1 - t;
  return (u ** 3) * a + 3 * (u ** 2) * t * b + 3 * u * (t ** 2) * c + (t ** 3) * d;
}

function cubicDerivative(a, b, c, d, t) {
  const u = 1 - t;
  return 3 * (u ** 2) * (b - a) + 6 * u * t * (c - b) + 3 * (t ** 2) * (d - c);
}

function birdAt(bird, now) {
  if (!bird) return null;
  const t = clamp((now - bird.startAt) / bird.durationMs, 0, 1);
  const { p0, p1, p2, p3 } = bird;
  const x = cubic(p0.x, p1.x, p2.x, p3.x, t);
  const y = cubic(p0.y, p1.y, p2.y, p3.y, t);
  const dx = cubicDerivative(p0.x, p1.x, p2.x, p3.x, t);
  const dy = cubicDerivative(p0.y, p1.y, p2.y, p3.y, t);
  const length = Math.hypot(dx, dy) || 1;

  return {
    x,
    y,
    vx: dx / length,
    vy: dy / length,
    progress: t,
  };
}

function projectilePosition(projectile, now) {
  const age = Math.max(0, (now - projectile.bornAt) / 1000);
  return {
    x: projectile.startX + projectile.vx * age,
    y: projectile.startY + projectile.vy * age,
  };
}

function makeBird(round) {
  const leftToRight = Math.random() < 0.5;
  const startX = leftToRight ? -70 : WORLD.width + 70;
  const endX = leftToRight ? WORLD.width + 70 : -70;
  const startY = randomBetween(95, 285);
  const endY = randomBetween(100, 330);
  const wave = randomBetween(-115, 115);
  const p1Y = clamp(startY + wave + randomBetween(-35, 35), 70, 400);
  const p2Y = clamp(endY - wave + randomBetween(-35, 35), 70, 400);

  return {
    id: `bird-${round}-${Date.now()}`,
    startAt: Date.now(),
    durationMs: Math.round(randomBetween(5800, 7200)),
    p0: { x: startX, y: startY },
    p1: { x: leftToRight ? 285 : 715, y: p1Y },
    p2: { x: leftToRight ? 715 : 285, y: p2Y },
    p3: { x: endX, y: endY },
    facing: leftToRight ? 1 : -1,
  };
}

export function createBirdSlingshotDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };

  let status = 'playing';
  let phase = 'round-intro';
  let round = 1;
  let scores = { a: 0, b: 0 };
  let ammo = { a: 0, b: 0 };
  let roundHit = { a: false, b: false };
  let bird = null;
  let projectiles = [];
  let result = null;
  let message = 'Приготовьтесь';
  let introEndsAt = Date.now() + ROUND_INTRO_MS;
  let lastHit = null;
  let shotCounter = 1;
  let nextEmitAt = 0;
  let phaseTimer = null;
  let tickTimer = null;
  let finishedOnce = false;
  const lastInputAt = { a: 0, b: 0 };

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const now = Date.now();
    const playerSeat = seatForSocket(socketId);
    const birdState = bird ? { ...bird, ...birdAt(bird, now) } : null;

    return {
      gameId: 'bird-slingshot-duel',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      world: WORLD,
      slings: SLINGS,
      status,
      phase,
      totalRounds: TOTAL_ROUNDS,
      round,
      scores,
      ammo,
      roundHit,
      bird: birdState,
      projectiles: projectiles.map((p) => ({ ...p, ...projectilePosition(p, now) })),
      projectileSpeed: PROJECTILE_SPEED,
      birdRadius: BIRD_RADIUS,
      projectileRadius: PROJECTILE_RADIUS,
      introEndsAt,
      lastHit,
      message,
      result,
    };
  }

  function emitState() {
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function clearPhaseTimer() {
    if (phaseTimer) clearTimeout(phaseTimer);
    phaseTimer = null;
  }

  function schedulePhase(delay, fn) {
    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      phaseTimer = null;
      fn();
    }, delay);
    phaseTimer.unref?.();
  }

  function startFlying() {
    if (status !== 'playing') return;
    phase = 'flying';
    message = '';
    bird = makeBird(round);
    emitState();
  }

  function startRound() {
    if (status !== 'playing') return;
    phase = 'round-intro';
    bird = null;
    projectiles = [];
    roundHit = { a: false, b: false };
    ammo = { a: ammo.a + 1, b: ammo.b + 1 };
    message = `Раунд ${round} из ${TOTAL_ROUNDS}`;
    introEndsAt = Date.now() + ROUND_INTRO_MS;
    lastHit = null;
    emitState();
    schedulePhase(ROUND_INTRO_MS, startFlying);
  }

  function finishMatch() {
    status = 'finished';
    phase = 'finished';
    bird = null;
    projectiles = [];

    let winner = null;
    let draw = false;
    if (scores.a > scores.b) winner = 'a';
    else if (scores.b > scores.a) winner = 'b';
    else draw = true;

    result = {
      winner,
      draw,
      message: draw
        ? `Пять раундов закончились со счётом ${scores.a}:${scores.b}. Ничья.`
        : `${bySeat[winner].name} победил со счётом ${scores[winner]}:${scores[opposite(winner)]}.`,
      discardedAmmo: { ...ammo },
    };
    message = 'Матч окончен';
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      schedulePhase(RESULT_HOLD_MS, () => onFinish?.({ roomId, players: Object.values(bySeat) }));
    }
  }

  function endRound() {
    if (status !== 'playing' || phase !== 'flying') return;
    phase = 'round-over';
    bird = null;
    projectiles = [];
    message = `Раунд ${round} завершён`;
    emitState();

    if (round >= TOTAL_ROUNDS) {
      schedulePhase(ROUND_GAP_MS, finishMatch);
      return;
    }

    schedulePhase(ROUND_GAP_MS, () => {
      round += 1;
      startRound();
    });
  }

  function removeMissedProjectiles(now) {
    projectiles = projectiles.filter((projectile) => {
      const pos = projectilePosition(projectile, now);
      const margin = 28;
      return (
        pos.x >= -margin &&
        pos.x <= WORLD.width + margin &&
        pos.y >= -margin &&
        pos.y <= WORLD.height + margin
      );
    });
  }

  function checkHits(now) {
    if (!bird || phase !== 'flying') return;
    const b = birdAt(bird, now);
    if (!b) return;

    const survivors = [];
    for (const projectile of projectiles) {
      const pos = projectilePosition(projectile, now);
      const distance = Math.hypot(pos.x - b.x, pos.y - b.y);
      const seat = projectile.owner;

      if (!roundHit[seat] && distance <= BIRD_RADIUS + PROJECTILE_RADIUS) {
        roundHit = { ...roundHit, [seat]: true };
        scores = { ...scores, [seat]: scores[seat] + 1 };
        lastHit = {
          id: `hit-${round}-${seat}-${now}`,
          seat,
          x: b.x,
          y: b.y,
          at: now,
        };
        continue;
      }
      survivors.push(projectile);
    }
    projectiles = survivors;
  }

  function tick() {
    if (status !== 'playing') return;
    const now = Date.now();

    if (phase === 'flying' && bird) {
      checkHits(now);
      removeMissedProjectiles(now);

      if (now >= bird.startAt + bird.durationMs) {
        endRound();
        return;
      }
    }

    if (now >= nextEmitAt) {
      nextEmitAt = now + EMIT_EVERY_MS;
      emitState();
    }
  }

  function shoot(seat, action) {
    if (status !== 'playing' || phase !== 'flying' || !bird) return;
    if (roundHit[seat]) return;
    if (ammo[seat] <= 0) return;
    if (projectiles.filter((p) => p.owner === seat).length >= MAX_PROJECTILES) return;

    const now = Date.now();
    if (now - lastInputAt[seat] < INPUT_COOLDOWN_MS) return;
    lastInputAt[seat] = now;

    const targetX = Number(action.targetX);
    const targetY = Number(action.targetY);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    const sling = SLINGS[seat];
    let dx = clamp(targetX, -100, WORLD.width + 100) - sling.x;
    let dy = clamp(targetY, -100, WORLD.height + 100) - sling.y;
    const length = Math.hypot(dx, dy);
    if (length < 35) return;
    dx /= length;
    dy /= length;

    // Both slings must fire into the playable field, not backward into the UI.
    if (dy > 0.35) return;

    ammo = { ...ammo, [seat]: ammo[seat] - 1 };
    projectiles.push({
      id: `shot-${shotCounter++}`,
      owner: seat,
      startX: sling.x,
      startY: sling.y,
      vx: dx * PROJECTILE_SPEED,
      vy: dy * PROJECTILE_SPEED,
      bornAt: now,
    });

    emitState();
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || typeof action.type !== 'string') return;
    if (action.type === 'shoot') shoot(seat, action);
  }

  function dispose() {
    clearPhaseTimer();
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  tickTimer = setInterval(tick, TICK_MS);
  tickTimer.unref?.();
  startRound();

  return {
    handleAction,
    dispose,
    onPlayerLeft(socketId) {
      const leftSeat = seatForSocket(socketId);
      if (!leftSeat || status === 'finished') return;
      const winner = opposite(leftSeat);
      status = 'finished';
      phase = 'finished';
      bird = null;
      projectiles = [];
      result = {
        winner,
        draw: false,
        message: `${bySeat[leftSeat].name} вышел из матча.`,
        discardedAmmo: { ...ammo },
      };
      emitState();
      dispose();
      onFinish?.({ roomId, players: Object.values(bySeat) });
    },
  };
}
