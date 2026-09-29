const WORLD = { width: 1400, height: 780 };
const PHYSICS_MS = 8;
const EMIT_MS = 50;
const GRAVITY = 690;
const MAX_HP = 100;
const MAX_TURN_FUEL = 360;
const MOVE_STEP = 20;
const MAX_DRIVE_SLOPE_DEG = 62;
const TANK_RADIUS = 38;
const EDGE = 48;
const MAX_PROJECTILE_SPEED = 980;

const WEAPONS = {
  standard: { speed: 1.0, damage: 34, radius: 64, crater: 48 },
  heavy: { speed: 0.90, damage: 46, radius: 82, crater: 64 },
  cluster: { speed: 0.96, damage: 25, radius: 58, crater: 38, cluster: true },
  fire: { speed: 0.94, damage: 27, radius: 62, crater: 42, burn: 8 },
  ice: { speed: 0.98, damage: 24, radius: 58, crater: 38, freeze: 0.55 },
  nuke: { speed: 0.82, damage: 72, radius: 145, crater: 110, nuke: true },
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function safeName(v) {
  const s = typeof v === 'string' ? v.trim().slice(0, 28) : '';
  return s || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function createTerrain() {
  const pts = [];
  const count = 71;
  const base = 575 + Math.random() * 28;
  const p1 = Math.random() * Math.PI * 2;
  const p2 = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i += 1) {
    const x = (WORLD.width * i) / (count - 1);
    let y = base
      + Math.sin(i * 0.23 + p1) * 58
      + Math.sin(i * 0.49 + p2) * 24;
    if (x < 220) y = Math.min(y, 605);
    if (x > WORLD.width - 220) y = Math.min(y, 605);
    pts.push({ x, y: clamp(y, 455, 665) });
  }
  return pts;
}

function terrainY(terrain, x) {
  const xx = clamp(x, 0, WORLD.width);
  const step = WORLD.width / (terrain.length - 1);
  const idx = clamp(Math.floor(xx / step), 0, terrain.length - 2);
  const a = terrain[idx];
  const b = terrain[idx + 1];
  const t = (xx - a.x) / Math.max(1, b.x - a.x);
  return a.y + (b.y - a.y) * t;
}

function terrainSlopeAngle(terrain, x) {
  const sample = 24;
  const left = terrainY(terrain, x - sample);
  const right = terrainY(terrain, x + sample);
  return clamp((Math.atan2(right - left, sample * 2) * 180) / Math.PI, -68, 68);
}

function craterTerrain(terrain, cx, cy, radius) {
  for (const p of terrain) {
    const dx = p.x - cx;
    if (Math.abs(dx) > radius) continue;
    const bowl = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    const target = cy + bowl * 0.42;
    if (target > p.y) p.y = Math.min(WORLD.height - 38, target);
  }
}

function spawnTank(terrain, seat) {
  const x = seat === 'a' ? 150 : WORLD.width - 150;
  return {
    x,
    y: terrainY(terrain, x),
    facing: seat === 'a' ? 1 : -1,
    slopeAngle: terrainSlopeAngle(terrain, x),
    hp: MAX_HP,
    burn: 0,
    freezeTurns: 0,
  };
}

function safePlayerPublic(t) {
  return {
    x: Math.round(t.x * 10) / 10,
    y: Math.round(t.y * 10) / 10,
    facing: t.facing,
    slopeAngle: Math.round((t.slopeAngle || 0) * 10) / 10,
    hp: Math.max(0, Math.round(t.hp)),
    burn: t.burn,
    freezeTurns: t.freezeTurns,
  };
}

export function createTankArtilleryRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name) },
  };

  let terrain = createTerrain();
  let tanks = { a: spawnTank(terrain, 'a'), b: spawnTank(terrain, 'b') };

  function syncTankPoses() {
    for (const seat of ['a', 'b']) {
      const tank = tanks[seat];
      tank.y = terrainY(terrain, tank.x);
      tank.slopeAngle = terrainSlopeAngle(terrain, tank.x);
    }
    tanks.a.facing = tanks.b.x >= tanks.a.x ? 1 : -1;
    tanks.b.facing = tanks.a.x >= tanks.b.x ? 1 : -1;
  }

  syncTankPoses();
  let currentTurn = Math.random() < 0.5 ? 'a' : 'b';
  let turnNumber = 1;
  let phase = 'aim';
  let status = 'playing';
  let result = null;
  let wind = Math.round((Math.random() * 2 - 1) * 70);
  let projectile = null;
  let explosion = null;
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let interval = null;
  let explosionTimer = null;
  let finishedOnce = false;
  let notice = 'Тяни светящуюся линию прямо на поле: направление = угол, длина = сила.';
  let turnFuel = { a: MAX_TURN_FUEL, b: MAX_TURN_FUEL };
  let inventory = {
    a: { nuke: 0 },
    b: { nuke: 0 },
  };
  let crates = [];
  let cows = [
    { id: 'cow-1', x: 520, y: terrainY(terrain, 520), alive: true },
    { id: 'cow-2', x: 890, y: terrainY(terrain, 890), alive: true },
  ];

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'tank-artillery',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      world: WORLD,
      terrain,
      tanks: {
        a: safePlayerPublic(tanks.a),
        b: safePlayerPublic(tanks.b),
      },
      currentTurn,
      turnNumber,
      phase,
      status,
      wind,
      turnFuel,
      maxTurnFuel: MAX_TURN_FUEL,
      inventory,
      crates,
      cows,
      projectile: projectile ? {
        x: Math.round(projectile.x * 10) / 10,
        y: Math.round(projectile.y * 10) / 10,
        type: projectile.type,
      } : null,
      explosion,
      notice,
      result,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_MS) return;
    lastEmitAt = now;
    io.to(bySeat.a.socketId).emit('game:state', snapshotFor(bySeat.a.socketId));
    io.to(bySeat.b.socketId).emit('game:state', snapshotFor(bySeat.b.socketId));
  }

  function finish(winner, draw = false, message = '') {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    projectile = null;
    clearInterval(interval);
    clearTimeout(explosionTimer);
    result = { winner: draw ? null : winner, draw, message };
    notice = message;
    emitState(true);
    if (!finishedOnce) {
      finishedOnce = true;
      setTimeout(() => {
        onFinish?.({ roomId, players: Object.values(bySeat) });
      }, 2500);
    }
  }

  function checkDeaths(sourceSeat) {
    const aDead = tanks.a.hp <= 0;
    const bDead = tanks.b.hp <= 0;
    if (aDead && bDead) {
      finish(null, true, 'Оба танка уничтожены одним взрывом.');
      return true;
    }
    if (aDead) {
      finish('b', false, `${bySeat.b.name} остался в живых.`);
      return true;
    }
    if (bDead) {
      finish('a', false, `${bySeat.a.name} остался в живых.`);
      return true;
    }
    return false;
  }

  function damageAt(x, y, radius, maxDamage, sourceSeat) {
    for (const seat of ['a', 'b']) {
      const t = tanks[seat];
      if (t.hp <= 0) continue;
      const dx = t.x - x;
      const dy = (t.y - 25) - y;
      const d = Math.hypot(dx, dy);
      if (d >= radius) continue;
      const factor = 1 - d / radius;
      t.hp -= Math.max(1, maxDamage * factor);
    }

    for (const cow of cows) {
      if (!cow.alive) continue;
      const d = Math.hypot(cow.x - x, (cow.y - 15) - y);
      if (d < radius * 0.72) {
        cow.alive = false;
        for (const seat of ['a', 'b']) {
          const t = tanks[seat];
          const td = Math.hypot(t.x - cow.x, (t.y - 22) - (cow.y - 14));
          if (td < 95) t.hp -= 18 * (1 - td / 95);
        }
      }
    }
  }

  function applyCrater(x, y, weapon) {
    craterTerrain(terrain, x, y, weapon.crater);
    syncTankPoses();
    for (const cow of cows) {
      if (cow.alive) cow.y = terrainY(terrain, cow.x);
    }
    for (const box of crates) box.y = terrainY(terrain, box.x);
  }

  function collectNearbyCrates(seat) {
    const tank = tanks[seat];
    const remaining = [];
    for (const box of crates) {
      if (Math.abs(box.x - tank.x) < 55) {
        if (box.kind === 'nuke') {
          inventory[seat].nuke += 1;
          notice = `${bySeat[seat].name} подобрал ядерный снаряд!`;
        } else if (box.kind === 'repair') {
          tank.hp = Math.min(MAX_HP, tank.hp + 22);
          notice = `${bySeat[seat].name} восстановил броню.`;
        } else {
          turnFuel[seat] = Math.min(MAX_TURN_FUEL, turnFuel[seat] + 150);
          notice = `${bySeat[seat].name} подобрал дополнительное топливо.`;
        }
      } else {
        remaining.push(box);
      }
    }
    crates = remaining;
  }

  function maybeSpawnCrate() {
    if (turnNumber % 3 !== 0 || crates.length >= 2) return;
    let x = 420 + Math.random() * 560;
    for (let tries = 0; tries < 8; tries += 1) {
      if (Math.abs(x - tanks.a.x) > 120 && Math.abs(x - tanks.b.x) > 120) break;
      x = 360 + Math.random() * 680;
    }
    const roll = Math.random();
    const kind = roll < 0.20 ? 'nuke' : roll < 0.55 ? 'repair' : 'fuel';
    crates.push({
      id: `box-${turnNumber}-${Math.random().toString(36).slice(2, 7)}`,
      x,
      y: terrainY(terrain, x),
      kind,
    });
  }

  function nextTurn() {
    if (status !== 'playing') return;
    currentTurn = opposite(currentTurn);
    turnNumber += 1;
    phase = 'aim';
    wind = Math.round((Math.random() * 2 - 1) * 70);
    turnFuel[currentTurn] = tanks[currentTurn].freezeTurns > 0
      ? Math.round(MAX_TURN_FUEL * 0.45)
      : MAX_TURN_FUEL;
    if (tanks[currentTurn].freezeTurns > 0) tanks[currentTurn].freezeTurns -= 1;
    if (tanks[currentTurn].burn > 0) {
      tanks[currentTurn].hp -= tanks[currentTurn].burn;
      tanks[currentTurn].burn = 0;
      if (checkDeaths(opposite(currentTurn))) return;
    }
    maybeSpawnCrate();
    notice = `Ход: ${bySeat[currentTurn].name}`;
    emitState(true);
  }

  function explodeProjectile(p) {
    const weapon = WEAPONS[p.type] || WEAPONS.standard;
    projectile = null;
    explosion = { x: p.x, y: p.y, radius: weapon.radius, type: p.type };

    damageAt(p.x, p.y, weapon.radius, weapon.damage, p.owner);
    applyCrater(p.x, p.y, weapon);

    if (weapon.cluster) {
      for (const ox of [-58, 58]) {
        damageAt(p.x + ox, p.y + 10, 48, 16, p.owner);
        craterTerrain(terrain, p.x + ox, p.y + 10, 27);
      }
    }

    for (const seat of ['a', 'b']) {
      const t = tanks[seat];
      const d = Math.hypot(t.x - p.x, (t.y - 25) - p.y);
      if (d < weapon.radius) {
        if (weapon.burn) t.burn = Math.max(t.burn, weapon.burn);
        if (weapon.freeze) t.freezeTurns = Math.max(t.freezeTurns, 1);
      }
    }

    if (checkDeaths(p.owner)) return;

    phase = 'explosion';
    notice = 'Взрыв!';
    emitState(true);
    clearTimeout(explosionTimer);
    explosionTimer = setTimeout(() => {
      explosion = null;
      nextTurn();
    }, weapon.nuke ? 1100 : 650);
  }

  function physicsStep(dt) {
    if (!projectile || status !== 'playing') return;
    const speed = Math.hypot(projectile.vx, projectile.vy);
    const substeps = clamp(Math.ceil((speed * dt) / 10), 1, 8);
    const subdt = dt / substeps;

    for (let i = 0; i < substeps; i += 1) {
      projectile.vx += wind * subdt;
      projectile.vy += GRAVITY * subdt;
      const v = Math.hypot(projectile.vx, projectile.vy);
      if (v > MAX_PROJECTILE_SPEED) {
        const s = MAX_PROJECTILE_SPEED / v;
        projectile.vx *= s;
        projectile.vy *= s;
      }
      projectile.x += projectile.vx * subdt;
      projectile.y += projectile.vy * subdt;

      if (projectile.x < -40 || projectile.x > WORLD.width + 40 || projectile.y > WORLD.height + 80) {
        phase = 'explosion';
        const owner = projectile.owner;
        projectile = null;
        notice = 'Снаряд ушёл за карту.';
        emitState(true);
        clearTimeout(explosionTimer);
        explosionTimer = setTimeout(nextTurn, 450);
        return;
      }

      if (projectile.y >= terrainY(terrain, projectile.x)) {
        explodeProjectile({ ...projectile });
        return;
      }

      for (const seat of ['a', 'b']) {
        const t = tanks[seat];
        if (t.hp <= 0) continue;
        if (seat === projectile.owner && projectile.age < 0.12) continue;
        const d = Math.hypot(projectile.x - t.x, projectile.y - (t.y - 27));
        if (d <= TANK_RADIUS) {
          explodeProjectile({ ...projectile, x: t.x, y: t.y - 24 });
          return;
        }
      }

      projectile.age += subdt;
    }
  }

  function handleMove(seat, dir) {
    if (status !== 'playing' || phase !== 'aim' || seat !== currentTurn) return;
    if (turnFuel[seat] <= 0) return;
    const direction = dir < 0 ? -1 : 1;
    const tank = tanks[seat];
    const step = Math.min(MOVE_STEP, turnFuel[seat]);
    const nx = clamp(tank.x + direction * step, EDGE, WORLD.width - EDGE);

    const ny = terrainY(terrain, nx);
    const slopeAngle = terrainSlopeAngle(terrain, nx);
    if (Math.abs(slopeAngle) > MAX_DRIVE_SLOPE_DEG) {
      notice = 'Здесь склон слишком крутой даже для гусениц.';
      emitState(true);
      return;
    }

    const other = tanks[opposite(seat)];
    if (Math.abs(nx - other.x) < TANK_RADIUS * 2.2) {
      notice = 'Слишком близко к танку соперника.';
      emitState(true);
      return;
    }

    tank.x = nx;
    tank.y = ny;
    tank.slopeAngle = slopeAngle;
    turnFuel[seat] -= step;
    syncTankPoses();
    collectNearbyCrates(seat);
    emitState(true);
  }

  function handleFire(seat, action) {
    if (status !== 'playing' || phase !== 'aim' || seat !== currentTurn) return;
    const type = WEAPONS[action.shotType] ? action.shotType : 'standard';
    if (type === 'nuke') {
      if (inventory[seat].nuke <= 0) return;
      inventory[seat].nuke -= 1;
    }

    const tank = tanks[seat];
    const angleDeg = clamp(Number(action.angle) || 45, 15, 85);
    const power = clamp(Number(action.power) || 0.55, 0.18, 1);
    const angle = (angleDeg * Math.PI) / 180;
    const weapon = WEAPONS[type];
    const facing = tank.facing || (seat === 'a' ? 1 : -1);

    const speed = (400 + power * 560) * weapon.speed;
    const muzzleX = tank.x + Math.cos(angle) * 46 * facing;
    const muzzleY = tank.y - 30 - Math.sin(angle) * 46;

    projectile = {
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(angle) * speed * facing,
      vy: -Math.sin(angle) * speed,
      type,
      owner: seat,
      age: 0,
    };
    phase = 'projectile';
    notice = `${bySeat[seat].name} стреляет: ${type}`;
    emitState(true);
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || typeof action.type !== 'string') return;
    if (action.type === 'move') handleMove(seat, action.dir);
    if (action.type === 'fire') handleFire(seat, action);
  }

  function handleDisconnect(socketId) {
    if (status === 'finished') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish(opposite(seat), false, `${bySeat[seat].name} отключился.`);
  }

  interval = setInterval(() => {
    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.035);

    if (projectile && status === 'playing') {
      physicsStep(dt);
      emitState(false);
    }
  }, PHYSICS_MS);

  return {
    id: roomId,
    gameId: 'tank-artillery',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState() {
      emitState(true);
    },
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(interval);
      clearTimeout(explosionTimer);
    },
  };
}
