const TOTAL_ROUNDS = 5;
const ROUND_INTRO_MS = 1050;
const ROUND_GAP_MS = 900;
const RESULT_HOLD_MS = 3200;
const TICK_MS = 16;
const EMIT_EVERY_MS = 50;

const WORLD = { width: 1000, height: 600 };
const SLINGS = {
  a: { x: 118, y: 520 },
  b: { x: 882, y: 520 },
};

const PROJECTILE_SPEED = 735;
const PROJECTILE_RADIUS = 10;
const BIRD_RADIUS = 30;
const INPUT_COOLDOWN_MS = 85;
const MAX_PROJECTILES_PER_PLAYER = 10;

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

function distanceFromOriginToSegment(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0.0001) return Math.hypot(ax, ay);
  const t = clamp(-(ax * dx + ay * dy) / len2, 0, 1);
  return Math.hypot(ax + dx * t, ay + dy * t);
}

function makeBird(round, now) {
  const leftToRight = Math.random() < 0.5;
  const startX = leftToRight ? -85 : WORLD.width + 85;
  const endX = leftToRight ? WORLD.width + 85 : -85;

  const lanes = [
    [145, 245],
    [205, 120],
    [105, 315],
    [285, 165],
    [175, 265],
  ];
  const [baseStartY, baseEndY] = lanes[(round - 1) % lanes.length];
  const startY = clamp(baseStartY + randomBetween(-35, 35), 85, 330);
  const endY = clamp(baseEndY + randomBetween(-35, 35), 85, 350);
  const bend = randomBetween(70, 155) * (Math.random() < 0.5 ? -1 : 1);

  const p1Y = clamp(startY + bend, 65, 410);
  const p2Y = clamp(endY - bend * randomBetween(0.55, 1.0), 65, 410);
  const durationMs = Math.round(randomBetween(6500, 7800));

  return {
    id: `bird-${round}-${now}-${Math.floor(Math.random() * 9999)}`,
    startAt: now,
    durationMs,
    endAt: now + durationMs,
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
  let phaseEndsAt = 0;
  let round = 1;
  let scores = { a: 0, b: 0 };
  let ammo = { a: 0, b: 0 };
  let roundHit = { a: false, b: false };
  let bird = null;
  let projectiles = [];
  let result = null;
  let message = '';
  let lastHit = null;
  let shotCounter = 1;
  let nextEmitAt = 0;
  let tickTimer = null;
  let finishedAt = 0;
  let finishNotified = false;
  let lastTickAt = Date.now();
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
      phaseEndsAt,
      totalRounds: TOTAL_ROUNDS,
      round,
      scores: { ...scores },
      ammo: { ...ammo },
      roundHit: { ...roundHit },
      bird: birdState,
      projectiles: projectiles.map((p) => ({ ...p, ...projectilePosition(p, now) })),
      projectileSpeed: PROJECTILE_SPEED,
      birdRadius: BIRD_RADIUS,
      projectileRadius: PROJECTILE_RADIUS,
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

  function beginRound(now = Date.now()) {
    phase = 'round-intro';
    phaseEndsAt = now + ROUND_INTRO_MS;
    bird = null;
    projectiles = [];
    roundHit = { a: false, b: false };
    ammo = { a: ammo.a + 1, b: ammo.b + 1 };
    lastHit = null;
    message = `Раунд ${round}`;
    emitState();
  }

  function beginFlight(now = Date.now()) {
    phase = 'flying';
    phaseEndsAt = 0;
    bird = makeBird(round, now);
    projectiles = [];
    message = '';
    emitState();
  }

  function beginRoundOver(now = Date.now()) {
    if (phase !== 'flying') return;
    phase = 'round-over';
    phaseEndsAt = now + ROUND_GAP_MS;
    bird = null;
    projectiles = [];
    message = roundHit.a || roundHit.b ? 'Раунд завершён' : 'Птица улетела';
    emitState();
  }

  function finishMatch(now = Date.now()) {
    status = 'finished';
    phase = 'finished';
    phaseEndsAt = 0;
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
      scores: { ...scores },
      discardedAmmo: { ...ammo },
      message: draw
        ? `Пять раундов закончились со счётом ${scores.a}:${scores.b}. Ничья.`
        : `${bySeat[winner].name} победил ${scores[winner]}:${scores[opposite(winner)]}.`,
    };
    message = 'Матч окончен';
    finishedAt = now;
    emitState();
  }

  function advancePhase(now) {
    if (status !== 'playing') return;

    if (phase === 'round-intro' && now >= phaseEndsAt) {
      beginFlight(now);
      return;
    }

    if (phase === 'round-over' && now >= phaseEndsAt) {
      if (round >= TOTAL_ROUNDS) {
        finishMatch(now);
      } else {
        round += 1;
        beginRound(now);
      }
    }
  }

  function removeMissedProjectiles(now) {
    const margin = 55;
    projectiles = projectiles.filter((projectile) => {
      const pos = projectilePosition(projectile, now);
      return (
        pos.x >= -margin &&
        pos.x <= WORLD.width + margin &&
        pos.y >= -margin &&
        pos.y <= WORLD.height + margin
      );
    });
  }

  function checkHits(previousNow, now) {
    if (!bird || phase !== 'flying' || projectiles.length === 0) return;

    const birdPrev = birdAt(bird, previousNow);
    const birdNow = birdAt(bird, now);
    if (!birdPrev || !birdNow) return;

    const survivors = [];
    for (const projectile of projectiles) {
      const seat = projectile.owner;
      if (roundHit[seat]) continue;

      const pPrev = projectilePosition(projectile, previousNow);
      const pNow = projectilePosition(projectile, now);

      const relAx = pPrev.x - birdPrev.x;
      const relAy = pPrev.y - birdPrev.y;
      const relBx = pNow.x - birdNow.x;
      const relBy = pNow.y - birdNow.y;
      const distance = distanceFromOriginToSegment(relAx, relAy, relBx, relBy);

      if (distance <= BIRD_RADIUS + PROJECTILE_RADIUS) {
        roundHit = { ...roundHit, [seat]: true };
        scores = { ...scores, [seat]: scores[seat] + 1 };
        lastHit = {
          id: `hit-${round}-${seat}-${now}`,
          seat,
          x: birdNow.x,
          y: birdNow.y,
          at: now,
        };
        continue;
      }

      survivors.push(projectile);
    }

    projectiles = survivors;
  }

  function shoot(seat, action) {
    if (status !== 'playing' || phase !== 'flying' || !bird) return;
    if (roundHit[seat] || ammo[seat] <= 0) return;

    const activeShots = projectiles.filter((p) => p.owner === seat).length;
    if (activeShots >= MAX_PROJECTILES_PER_PLAYER) return;

    const now = Date.now();
    if (now - lastInputAt[seat] < INPUT_COOLDOWN_MS) return;
    lastInputAt[seat] = now;

    const targetX = Number(action.targetX);
    const targetY = Number(action.targetY);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    const sling = SLINGS[seat];
    let dx = clamp(targetX, -60, WORLD.width + 60) - sling.x;
    let dy = clamp(targetY, -40, WORLD.height + 20) - sling.y;
    const length = Math.hypot(dx, dy);
    if (length < 42) return;

    dx /= length;
    dy /= length;

    // The projectile must leave the slingshot toward the arena.
    if (dy > 0.18) return;

    ammo = { ...ammo, [seat]: ammo[seat] - 1 };
    projectiles.push({
      id: `shot-${round}-${seat}-${shotCounter++}`,
      owner: seat,
      startX: sling.x,
      startY: sling.y,
      vx: dx * PROJECTILE_SPEED,
      vy: dy * PROJECTILE_SPEED,
      bornAt: now,
    });

    emitState();
  }

  function tick() {
    const now = Date.now();
    const previousNow = lastTickAt;
    lastTickAt = now;

    if (status === 'playing') {
      advancePhase(now);

      if (phase === 'flying' && bird) {
        checkHits(previousNow, now);
        removeMissedProjectiles(now);

        if (now >= bird.endAt) {
          beginRoundOver(now);
        }
      }
    } else if (
      status === 'finished' &&
      !finishNotified &&
      finishedAt &&
      now - finishedAt >= RESULT_HOLD_MS
    ) {
      finishNotified = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }

    if (now >= nextEmitAt) {
      nextEmitAt = now + EMIT_EVERY_MS;
      emitState();
    }
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || typeof action.type !== 'string') return;
    if (action.type === 'shoot') shoot(seat, action);
  }

  function dispose() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  tickTimer = setInterval(tick, TICK_MS);
  beginRound(Date.now());

  return {
    handleAction,
    dispose,
    onPlayerLeft(socketId) {
      const leftSeat = seatForSocket(socketId);
      if (!leftSeat || status === 'finished') return;

      const winner = opposite(leftSeat);
      status = 'finished';
      phase = 'finished';
      phaseEndsAt = 0;
      bird = null;
      projectiles = [];
      result = {
        winner,
        draw: false,
        scores: { ...scores },
        discardedAmmo: { ...ammo },
        message: `${bySeat[leftSeat].name} вышел из матча.`,
      };
      emitState();
      finishNotified = true;
      dispose();
      onFinish?.({ roomId, players: Object.values(bySeat) });
    },
  };
}
