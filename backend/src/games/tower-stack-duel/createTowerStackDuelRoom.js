const WORLD = {
  width: 1200,
  height: 720,
  goalY: 92,
  baseY: 650,
  laneLeft: { minX: 105, maxX: 545, centerX: 325 },
  laneRight: { minX: 655, maxX: 1095, centerX: 875 },
};

const BLOCK_HEIGHT = 32;
const BLOCK_KINDS = [
  { key: 'small', width: 86 },
  { key: 'medium', width: 122 },
  { key: 'large', width: 162 },
];

const ROUND_MS = 90_000;
const COUNTDOWN_MS = 1800;
const ROUND_END_MS = 1700;
const MATCH_WINS = 2;

const PHYSICS_MS = 12; // ~83Hz, enough for these slow rigid bodies
const EMIT_MS = 40;    // ~25 snapshots/s; client extrapolates active blocks to display refresh rate
const GRAVITY = 1280;
const SLIDE_SPEED_MIN = 150;
const SLIDE_SPEED_MAX = 225;
const SPAWN_GAP_Y = 88;
const RESPAWN_MS = 170;
const DROP_INPUT_COOLDOWN = 90;

const SUPPORT_MIN_OVERLAP = 0.24;
const STABILITY_MARGIN = 0.16;
const SOFTNESS = 0.60; // intentionally not perfectly rigid

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const name = value.trim().slice(0, 28);
  return name || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randomKind() {
  return BLOCK_KINDS[Math.floor(Math.random() * BLOCK_KINDS.length)];
}

function laneForSeat(seat) {
  return seat === 'a' ? WORLD.laneLeft : WORLD.laneRight;
}

function blockTop(block) {
  return block.y - block.height / 2;
}

function blockBottom(block) {
  return block.y + block.height / 2;
}

function overlapAmount(a, b) {
  const left = Math.max(a.x - a.width / 2, b.x - b.width / 2);
  const right = Math.min(a.x + a.width / 2, b.x + b.width / 2);
  return Math.max(0, right - left);
}

function towerTopY(lane) {
  if (!lane.blocks.length) return WORLD.baseY;
  let top = WORLD.baseY;
  for (const block of lane.blocks) {
    top = Math.min(top, blockTop(block));
  }
  return top;
}

function towerHeight(lane) {
  return Math.max(0, WORLD.baseY - towerTopY(lane));
}

function publicBlock(block) {
  return {
    id: block.id,
    owner: block.owner,
    kind: block.kind,
    x: Math.round(block.x * 10) / 10,
    y: Math.round(block.y * 10) / 10,
    width: block.width,
    height: block.height,
    angle: Math.round(block.angle * 10000) / 10000,
    vx: Math.round((block.vx || 0) * 10) / 10,
    vy: Math.round((block.vy || 0) * 10) / 10,
    status: block.status,
  };
}

export function createTowerStackDuelRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();

  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };

  let status = 'playing';
  let phase = 'countdown';
  let roundNumber = 1;
  let roundWins = { a: 0, b: 0 };
  let countdownEndsAt = Date.now() + COUNTDOWN_MS;
  let roundEndsAt = 0;
  let roundMessage = 'Приготовьтесь строить';
  let result = null;
  let finishedOnce = false;

  let nextBlockId = 1;
  let lastEmitAt = 0;
  let lastTickAt = Date.now();
  let physicsTimer = null;
  let phaseTimer = null;

  const lanes = {
    a: createLane('a'),
    b: createLane('b'),
  };

  function createLane(seat) {
    return {
      seat,
      blocks: [],
      debris: [],
      current: null,
      spawnAt: 0,
      lastDropAt: 0,
      placedCount: 0,
      missedCount: 0,
      wobbleUntil: 0,
    };
  }

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function spawnBlock(seat) {
    if (status !== 'playing' || phase !== 'playing') return;

    const lane = lanes[seat];
    if (lane.current) return;

    const laneBox = laneForSeat(seat);
    const kind = randomKind();
    const topY = towerTopY(lane);
    // Always keep the moving block above the tower. Near the finish it may
    // travel above the GOAL line instead of being spawned inside the stack.
    const y = Math.max(-58, topY - SPAWN_GAP_Y);
    const startFromLeft = Math.random() < 0.5;
    const half = kind.width / 2;
    const minX = laneBox.minX + half + 8;
    const maxX = laneBox.maxX - half - 8;

    lane.current = {
      id: `blk-${seat}-${nextBlockId++}`,
      owner: seat,
      kind: kind.key,
      x: startFromLeft ? minX : maxX,
      y,
      width: kind.width,
      height: BLOCK_HEIGHT,
      angle: 0,
      vx: (startFromLeft ? 1 : -1) * rand(SLIDE_SPEED_MIN, SLIDE_SPEED_MAX),
      vy: 0,
      angularVelocity: 0,
      status: 'moving',
    };
  }

  function scheduleSpawn(seat, delay = RESPAWN_MS) {
    const lane = lanes[seat];
    lane.spawnAt = Date.now() + delay;
  }

  function resetLane(seat) {
    lanes[seat] = createLane(seat);
  }

  function resetRound() {
    resetLane('a');
    resetLane('b');
    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    roundEndsAt = 0;
    roundMessage = `Раунд ${roundNumber}`;
    emitState(true);

    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      if (status !== 'playing') return;
      phase = 'playing';
      roundEndsAt = Date.now() + ROUND_MS;
      roundMessage = '';
      spawnBlock('a');
      spawnBlock('b');
      emitState(true);
    }, COUNTDOWN_MS);
    phaseTimer.unref?.();
  }

  function centerOfMass(blocks) {
    if (!blocks.length) return 0;
    let weightedX = 0;
    let total = 0;
    for (const block of blocks) {
      const mass = block.width;
      weightedX += block.x * mass;
      total += mass;
    }
    return total > 0 ? weightedX / total : 0;
  }

  function collapseFrom(lane, index, directionHint = 0) {
    const fallen = lane.blocks.splice(index);
    const now = Date.now();

    for (let i = 0; i < fallen.length; i += 1) {
      const block = fallen[i];
      const direction = directionHint || (block.x >= laneForSeat(lane.seat).centerX ? 1 : -1);
      lane.debris.push({
        ...block,
        status: 'debris',
        vx: direction * rand(90, 180) + rand(-35, 35),
        vy: rand(-180, -70),
        angularVelocity: direction * rand(1.8, 3.8),
        bornAt: now,
      });
    }
  }

  function stabilizeTower(lane) {
    if (lane.blocks.length < 2) return;

    // bottom -> top. At every joint, COM of everything above must stay
    // inside the support footprint with a forgiving margin.
    for (let i = 1; i < lane.blocks.length; i += 1) {
      const support = lane.blocks[i - 1];
      const upper = lane.blocks.slice(i);
      const comX = centerOfMass(upper);
      const safeHalf = support.width * (0.5 - STABILITY_MARGIN * SOFTNESS);
      const offset = comX - support.x;

      if (Math.abs(offset) > safeHalf) {
        collapseFrom(lane, i, Math.sign(offset));
        return;
      }
    }
  }

  function placeCurrent(lane, support, surfaceTop = null) {
    const block = lane.current;
    if (!block) return;

    const landingTop = surfaceTop ?? (support ? blockTop(support) : WORLD.baseY);
    block.y = landingTop - block.height / 2;
    block.vy = 0;
    block.vx = 0;

    // The table is one continuous rigid surface: a block may be placed at
    // any free X on it, not only on top of the previously placed block.
    const supportX = support ? support.x : block.x;
    const supportWidth = support ? support.width : block.width;
    const offset = block.x - supportX;
    const normalized = clamp(offset / Math.max(1, supportWidth * 0.5), -1, 1);

    block.angle = support ? clamp(normalized * 0.045 + rand(-0.008, 0.008), -0.065, 0.065) : 0;
    block.status = 'placed';
    block.angularVelocity = 0;

    lane.blocks.push(block);
    lane.current = null;
    lane.placedCount += 1;
    lane.wobbleUntil = Date.now() + 380;

    // With several independent stacks on the same table, the old linear
    // "previous block supports next block" model is invalid. Rigid landing
    // is handled by collision detection below, so blocks never interpenetrate.
    scheduleSpawn(lane.seat);
  }

  function trySettleCurrent(lane, previousBottom) {
    const block = lane.current;
    if (!block || block.status !== 'falling' || block.vy < 0) return false;

    const currentBottom = blockBottom(block);
    let bestSurface = null;

    // Continuous/swept vertical collision: choose the highest solid surface
    // crossed during this physics step. This prevents fast blocks tunnelling
    // into another block and then popping back out on the next frame.
    for (const support of lane.blocks) {
      const overlap = overlapAmount(block, support);
      const minOverlap = Math.min(block.width, support.width) * SUPPORT_MIN_OVERLAP;
      if (overlap < minOverlap) continue;

      const top = blockTop(support);
      if (previousBottom <= top + 0.5 && currentBottom >= top - 0.5) {
        if (!bestSurface || top < bestSurface.top) bestSurface = { support, top };
      }
    }

    // The whole tabletop is solid, from edge to edge.
    if (previousBottom <= WORLD.baseY + 0.5 && currentBottom >= WORLD.baseY - 0.5) {
      if (!bestSurface || WORLD.baseY < bestSurface.top) {
        bestSurface = { support: null, top: WORLD.baseY };
      }
    }

    if (!bestSurface) return false;
    placeCurrent(lane, bestSurface.support, bestSurface.top);
    return true;
  }

  function dropCurrent(seat) {
    const lane = lanes[seat];
    const block = lane.current;
    if (!block || block.status !== 'moving') return;

    // Preserve a little lateral inertia so the block feels physical rather
    // than freezing in midair the instant the button is tapped.
    block.vx *= 0.14;
    block.vy = 0;
    block.angularVelocity = rand(-0.12, 0.12);
    block.status = 'falling';
  }

  function updateMovingBlock(lane, dt) {
    const block = lane.current;
    if (!block || block.status !== 'moving') return;

    const box = laneForSeat(lane.seat);
    const half = block.width / 2;
    const minX = box.minX + half + 8;
    const maxX = box.maxX - half - 8;

    block.x += block.vx * dt;

    if (block.x <= minX) {
      block.x = minX;
      block.vx = Math.abs(block.vx);
    } else if (block.x >= maxX) {
      block.x = maxX;
      block.vx = -Math.abs(block.vx);
    }
  }

  function updateFallingBlock(lane, dt) {
    const block = lane.current;
    if (!block || block.status !== 'falling') return;

    const previousBottom = blockBottom(block);
    block.vy += GRAVITY * dt;
    block.x += block.vx * dt;
    block.y += block.vy * dt;
    block.angle += block.angularVelocity * dt;

    if (trySettleCurrent(lane, previousBottom)) return;

    if (block.y - block.height / 2 > WORLD.height + 70) {
      lane.current = null;
      lane.missedCount += 1;
      scheduleSpawn(lane.seat, 220);
    }
  }

  function updateDebris(lane, dt) {
    if (!lane.debris.length) return;

    for (const block of lane.debris) {
      block.vy += GRAVITY * dt;
      block.x += block.vx * dt;
      block.y += block.vy * dt;
      block.angle += block.angularVelocity * dt;
    }

    lane.debris = lane.debris.filter((block) => (
      block.y < WORLD.height + 120 &&
      block.x > -220 &&
      block.x < WORLD.width + 220
    ));
  }

  function updateLane(lane, dt) {
    if (!lane.current && lane.spawnAt && Date.now() >= lane.spawnAt) {
      lane.spawnAt = 0;
      spawnBlock(lane.seat);
    }

    updateMovingBlock(lane, dt);
    updateFallingBlock(lane, dt);
    updateDebris(lane, dt);
  }

  function roundHeight(seat) {
    return towerHeight(lanes[seat]);
  }

  function finishMatch(winner, message) {
    if (status === 'finished') return;

    status = 'finished';
    phase = 'finished';
    result = { winner, draw: false, message };
    emitState(true);
    clearPhaseTimer();
    stopPhysics();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finishRound(winner, reason) {
    if (phase !== 'playing') return;

    phase = 'round-over';

    if (winner) {
      roundWins = {
        ...roundWins,
        [winner]: roundWins[winner] + 1,
      };
      roundMessage = reason || `${bySeat[winner].name} выиграл раунд`;
    } else {
      roundMessage = reason || 'Ничья в раунде';
    }

    emitState(true);

    if (winner && roundWins[winner] >= MATCH_WINS) {
      clearPhaseTimer();
      phaseTimer = setTimeout(() => {
        finishMatch(winner, `${bySeat[winner].name} выиграл матч ${roundWins.a}:${roundWins.b}.`);
      }, ROUND_END_MS);
      phaseTimer.unref?.();
      return;
    }

    clearPhaseTimer();
    phaseTimer = setTimeout(() => {
      roundNumber += 1;
      resetRound();
    }, ROUND_END_MS);
    phaseTimer.unref?.();
  }

  function checkRoundEnd() {
    if (phase !== 'playing') return;

    const aReached = towerTopY(lanes.a) <= WORLD.goalY;
    const bReached = towerTopY(lanes.b) <= WORLD.goalY;

    if (aReached || bReached) {
      if (aReached && bReached) {
        const ah = roundHeight('a');
        const bh = roundHeight('b');
        if (Math.abs(ah - bh) < 3) {
          finishRound(null, 'Обе башни достигли цели одновременно');
        } else {
          const winner = ah > bh ? 'a' : 'b';
          finishRound(winner, `${bySeat[winner].name} первым добрался до линии`);
        }
      } else {
        const winner = aReached ? 'a' : 'b';
        finishRound(winner, `${bySeat[winner].name} первым добрался до линии`);
      }
      return;
    }

    if (Date.now() >= roundEndsAt) {
      const ah = roundHeight('a');
      const bh = roundHeight('b');

      if (Math.abs(ah - bh) > 5) {
        const winner = ah > bh ? 'a' : 'b';
        finishRound(winner, `${bySeat[winner].name} построил башню выше`);
        return;
      }

      const ac = lanes.a.blocks.length;
      const bc = lanes.b.blocks.length;
      if (ac !== bc) {
        const winner = ac > bc ? 'a' : 'b';
        finishRound(winner, `${bySeat[winner].name} поставил больше устойчивых блоков`);
        return;
      }

      finishRound(null, 'Высота одинаковая — раунд без очка');
    }
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);

    return {
      gameId: 'tower-stack-duel',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      status,
      phase,
      roundNumber,
      roundWins,
      winsToMatch: MATCH_WINS,
      countdownEndsAt,
      roundEndsAt,
      roundMessage,
      result,
      world: WORLD,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      lanes: {
        a: {
          blocks: lanes.a.blocks.map(publicBlock),
          debris: lanes.a.debris.map(publicBlock),
          current: lanes.a.current ? publicBlock(lanes.a.current) : null,
          height: Math.round(roundHeight('a') * 10) / 10,
          wobbling: Date.now() < lanes.a.wobbleUntil,
          placedCount: lanes.a.placedCount,
          missedCount: lanes.a.missedCount,
        },
        b: {
          blocks: lanes.b.blocks.map(publicBlock),
          debris: lanes.b.debris.map(publicBlock),
          current: lanes.b.current ? publicBlock(lanes.b.current) : null,
          height: Math.round(roundHeight('b') * 10) / 10,
          wobbling: Date.now() < lanes.b.wobbleUntil,
          placedCount: lanes.b.placedCount,
          missedCount: lanes.b.missedCount,
        },
      },
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_MS) return;
    lastEmitAt = now;

    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function clearPhaseTimer() {
    if (phaseTimer) clearTimeout(phaseTimer);
    phaseTimer = null;
  }

  function stopPhysics() {
    if (physicsTimer) clearInterval(physicsTimer);
    physicsTimer = null;
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || status !== 'playing') return;

    if (action.type === 'drop') {
      if (phase !== 'playing') return;
      const lane = lanes[seat];
      const now = Date.now();
      if (now - lane.lastDropAt < DROP_INPUT_COOLDOWN) return;
      lane.lastDropAt = now;
      dropCurrent(seat);
      emitState(true);
      return;
    }

    if (action.type === 'resign') {
      finishMatch(opposite(seat), `${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finishMatch(opposite(seat), `${bySeat[seat].name} отключился.`);
  }

  physicsTimer = setInterval(() => {
    if (phase !== 'playing' || status !== 'playing') return;

    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.035);

    const substeps = clamp(Math.ceil(dt / (1 / 120)), 1, 5);
    const stepDt = dt / substeps;

    for (let i = 0; i < substeps; i += 1) {
      updateLane(lanes.a, stepDt);
      updateLane(lanes.b, stepDt);
    }

    checkRoundEnd();
    emitState(false);
  }, PHYSICS_MS);
  physicsTimer.unref?.();

  resetRound();

  return {
    playerSocketIds: Object.values(bySeat).map((player) => player.socketId),
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      clearPhaseTimer();
      stopPhysics();
    },
  };
}
