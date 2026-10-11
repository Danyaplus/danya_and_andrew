// Authoritative two-player capture-the-flag. Clients send direction only; the
// server validates movement, hits, flag pickup, scoring and match result.
export const WORLD = { width: 1000, height: 620 };
export const BASES = { a: { x: 106, y: 310 }, b: { x: 894, y: 310 } };
export const MAPS = [
  { id: 'grove', title: 'Зачарованный лес', walls: [
    [286,135,68,116], [646,135,68,116], [286,369,68,116], [646,369,68,116],
    [468,70,64,156], [468,394,64,156], [432,288,44,44], [524,288,44,44],
  ] },
  { id: 'frost', title: 'Ледяной перевал', walls: [
    [285,250,82,120], [633,250,82,120], [414,143,66,83], [520,143,66,83],
    [414,394,66,83], [520,394,66,83], [473,267,54,86],
  ] },
  { id: 'canyon', title: 'Солнечный каньон', walls: [
    [318,106,74,118], [608,106,74,118], [318,396,74,118], [608,396,74,118],
    [439,244,122,132], [246,292,46,36], [708,292,46,36],
  ] },
];

const GAME_ID = 'capture-the-flag';
const RADIUS = 21;
const WALK = 246;
const CARRY_WALK = 215;
const CAPTURE_DIST = 44;
const TAG_DIST = 92;
const TAG_COOLDOWN = 8500;
const STUN_MS = 1750;
const DROP_RETURN_MS = 11500;
const READY_MS = 3000;
const BETWEEN_MS = 2200;
const MATCH_MS = 180000;
const WIN_SCORE = 3;
const STEP_MS = 16;
const EMIT_MS = 50;
const OPPOSITE = { a: 'b', b: 'a' };

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function safeName(name) { return typeof name === 'string' ? (name.trim().slice(0, 28) || 'Игрок') : 'Игрок'; }
function circleOverlapsWall(x, y, radius, wall) {
  const nx = clamp(x, wall.x, wall.x + wall.width);
  const ny = clamp(y, wall.y, wall.y + wall.height);
  return (x - nx) ** 2 + (y - ny) ** 2 < radius * radius;
}
function sightClear(a, b, walls) {
  // The freeze pulse must not go through stone or trees.
  const steps = Math.ceil(dist(a, b) / 10);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (walls.some((w) => x > w.x && x < w.x + w.width && y > w.y && y < w.y + w.height)) return false;
  }
  return true;
}
function createPlayer(seat, info) {
  const spawn = BASES[seat];
  return {
    seat, socketId: info.socketId, name: safeName(info.name),
    x: spawn.x + (seat === 'a' ? 85 : -85), y: spawn.y,
    vx: 0, vy: 0, input: { x: 0, y: 0 },
    stunnedUntil: 0, nextTagAt: 0, direction: seat === 'a' ? 1 : -1,
  };
}
function newFlag(seat) {
  return { seat, x: BASES[seat].x, y: BASES[seat].y, mode: 'home', carrier: null, returnAt: 0, pickupAt: 0 };
}

export function createCaptureTheFlagRoom({ roomId, players, io, onFinish }, options = {}) {
  const shuffled = options.shuffle === false ? players : (Math.random() < 0.5 ? players : [...players].reverse());
  const map = MAPS[options.mapIndex ?? Math.floor(Math.random() * MAPS.length)];
  const walls = map.walls.map(([x, y, width, height]) => ({ x, y, width, height }));
  const runners = { a: createPlayer('a', shuffled[0]), b: createPlayer('b', shuffled[1]) };
  const flags = { a: newFlag('a'), b: newFlag('b') };
  const scores = { a: 0, b: 0 };
  const bornAt = Date.now();
  let readyAt = bornAt + READY_MS;
  const endsAt = readyAt + MATCH_MS;
  let phase = 'countdown';
  let status = 'playing';
  let result = null;
  let event = { id: 0, kind: 'start', message: 'Защити свой флаг. Забери чужой!', at: bornAt };
  let timer;
  let lastTick = bornAt;
  let lastEmit = 0;
  let finished = false;

  function seatFor(socketId) {
    if (runners.a.socketId === socketId) return 'a';
    if (runners.b.socketId === socketId) return 'b';
    return null;
  }
  function announce(kind, message, now) {
    event = { id: event.id + 1, kind, message, at: now };
  }
  function snapshot(socketId, now = Date.now()) {
    const mySeat = seatFor(socketId);
    return {
      gameId: GAME_ID, roomId, serverTime: now, playerSeat: mySeat,
      opponentSeat: OPPOSITE[mySeat] || null,
      world: WORLD, map: { id: map.id, title: map.title, walls }, bases: BASES,
      players: Object.fromEntries(Object.entries(runners).map(([seat, p]) => [seat, {
        name: p.name, x: +p.x.toFixed(1), y: +p.y.toFixed(1),
        vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1),
        direction: p.direction,
        stunnedUntil: p.stunnedUntil, nextTagAt: p.nextTagAt,
      }])),
      flags: Object.fromEntries(Object.entries(flags).map(([seat, flag]) => [seat, {
        mode: flag.mode, x: +flag.x.toFixed(1), y: +flag.y.toFixed(1),
        carrier: flag.carrier, returnAt: flag.returnAt,
      }])),
      scores: { ...scores }, phase, status, result, readyAt, endsAt,
      targetScore: WIN_SCORE, event,
    };
  }
  function emit(force = false) {
    const now = Date.now();
    if (!force && now - lastEmit < EMIT_MS) return;
    lastEmit = now;
    for (const p of Object.values(runners)) io.to(p.socketId).emit('game:state', snapshot(p.socketId, now));
  }
  function stop(resultData, now) {
    if (status === 'finished') return;
    status = 'finished'; phase = 'finished'; result = resultData;
    announce('finish', resultData.message, now);
    clearInterval(timer);
    emit(true);
    if (!finished) {
      finished = true;
      onFinish?.({ roomId, players: Object.values(runners).map(({ socketId, name }) => ({ socketId, name })) });
    }
  }
  function finishByScore(now) {
    const winner = scores.a === scores.b ? null : scores.a > scores.b ? 'a' : 'b';
    stop(winner === null
      ? { type: 'draw', winner: null, loser: null, message: `Ничья ${scores.a}:${scores.b}! Оба защищали крепость до конца.` }
      : { type: 'winner', winner, loser: OPPOSITE[winner], message: `${runners[winner].name} захватил больше флагов!` }, now);
  }
  function resetRound(now) {
    for (const seat of ['a', 'b']) {
      const p = runners[seat];
      const spawn = BASES[seat];
      p.x = spawn.x + (seat === 'a' ? 85 : -85);
      p.y = spawn.y;
      p.vx = 0; p.vy = 0; p.input = { x: 0, y: 0 };
      p.stunnedUntil = 0; p.nextTagAt = now;
      flags[seat] = newFlag(seat);
    }
    phase = 'countdown';
    readyAt = now + BETWEEN_MS;
  }
  function score(seat, now) {
    scores[seat] += 1;
    announce('score', `${runners[seat].name} доставил флаг! ${scores.a}:${scores.b}`, now);
    if (scores[seat] >= WIN_SCORE) { finishByScore(now); return; }
    resetRound(now);
  }
  function returnFlag(flag, now, reason) {
    const home = BASES[flag.seat];
    flag.mode = 'home'; flag.carrier = null;
    flag.x = home.x; flag.y = home.y; flag.returnAt = 0; flag.pickupAt = 0;
    if (reason) announce('return', reason, now);
  }
  function dropFlag(seat, now) {
    const held = flags[OPPOSITE[seat]];
    if (held.mode !== 'carried' || held.carrier !== seat) return;
    held.mode = 'dropped'; held.carrier = null;
    held.x = runners[seat].x; held.y = runners[seat].y;
    held.pickupAt = now + 850;
    held.returnAt = now + DROP_RETURN_MS;
  }
  function tryFreeze(seat, now) {
    if (phase !== 'active' || status !== 'playing') return;
    const p = runners[seat];
    const target = runners[OPPOSITE[seat]];
    if (p.stunnedUntil > now || p.nextTagAt > now) return;
    // A miss still spends the pulse; no spam or through-wall targeting.
    p.nextTagAt = now + TAG_COOLDOWN;
    if (dist(p, target) > TAG_DIST || !sightClear(p, target, walls)) {
      announce('miss', `${p.name}: заморозка не попала`, now);
      return;
    }
    target.stunnedUntil = now + STUN_MS;
    target.vx = 0; target.vy = 0;
    target.input = { x: 0, y: 0 };
    dropFlag(OPPOSITE[seat], now);
    announce('freeze', `${p.name} заморозил соперника!`, now);
  }
  function handleAction(socketId, action = {}) {
    const seat = seatFor(socketId);
    if (!seat || status !== 'playing' || !action || typeof action !== 'object') return;
    const now = Date.now();
    if (action.type === 'resign') {
      stop({ type: 'winner', winner: OPPOSITE[seat], loser: seat, message: `${runners[seat].name} покинул матч.` }, now);
      return;
    }
    if (action.type === 'freeze') { tryFreeze(seat, now); emit(true); return; }
    if (action.type === 'move') {
      const x = Number(action.x), y = Number(action.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const length = Math.hypot(x, y);
      runners[seat].input = { x: length > 1 ? x / length : clamp(x, -1, 1), y: length > 1 ? y / length : clamp(y, -1, 1) };
    }
  }
  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat && status === 'playing') {
      stop({ type: 'winner', winner: OPPOSITE[seat], loser: seat, message: 'Соперник отключился от игры.' }, Date.now());
    }
  }
  function moveAxis(p, axis, displacement) {
    if (displacement === 0) return;
    const previous = p[axis];
    const min = axis === 'x' ? 43 : 42;
    const max = axis === 'x' ? WORLD.width - 43 : WORLD.height - 42;
    p[axis] = clamp(previous + displacement, min, max);
    if (walls.some((w) => circleOverlapsWall(p.x, p.y, RADIUS, w))) p[axis] = previous;
  }
  function updateRunner(seat, dt, now) {
    const p = runners[seat];
    if (p.stunnedUntil > now) { p.vx = 0; p.vy = 0; return; }
    const carries = flags[OPPOSITE[seat]].carrier === seat;
    const speed = carries ? CARRY_WALK : WALK;
    p.vx = p.input.x * speed;
    p.vy = p.input.y * speed;
    if (p.vx > 1) p.direction = 1;
    else if (p.vx < -1) p.direction = -1;
    moveAxis(p, 'x', p.vx * dt);
    moveAxis(p, 'y', p.vy * dt);
  }
  function flagInteractions(now) {
    // Fixed deterministic order. Simultaneous delivery may produce a draw at timeout.
    for (const seat of ['a', 'b']) {
      const p = runners[seat];
      if (p.stunnedUntil > now) continue;
      const own = flags[seat];
      const enemy = flags[OPPOSITE[seat]];
      if (own.mode === 'dropped' && dist(p, own) < CAPTURE_DIST) {
        returnFlag(own, now, `${p.name} вернул свой флаг!`);
      }
      if (enemy.mode !== 'carried' && now >= enemy.pickupAt && dist(p, enemy) < CAPTURE_DIST) {
        enemy.mode = 'carried'; enemy.carrier = seat; enemy.returnAt = 0;
        announce('pickup', `${p.name} украл флаг! Доставь его домой!`, now);
      }
      if (enemy.carrier === seat && own.mode === 'home' && dist(p, BASES[seat]) < 58) {
        score(seat, now);
        return;
      }
    }
  }
  function update(now = Date.now()) {
    if (status !== 'playing') return;
    const dt = clamp((now - lastTick) / 1000, 0, 0.04);
    lastTick = now;
    if (now >= endsAt) { finishByScore(now); return; }
    if (phase === 'countdown') {
      if (now >= readyAt) { phase = 'active'; announce('go', 'БЕГИ! Забери чужой флаг!', now); }
      else { emit(); return; }
    }
    for (const seat of ['a', 'b']) updateRunner(seat, dt, now);
    for (const flag of Object.values(flags)) {
      if (flag.mode === 'carried') {
        const p = runners[flag.carrier];
        flag.x = p.x; flag.y = p.y - 27;
      } else if (flag.mode === 'dropped' && now >= flag.returnAt) {
        returnFlag(flag, now, 'Упавший флаг вернулся на базу');
      }
    }
    flagInteractions(now);
    emit();
  }

  timer = setInterval(() => update(Date.now()), STEP_MS);
  timer.unref?.();
  emit(true);
  return {
    id: roomId, gameId: GAME_ID,
    playerSocketIds: [runners.a.socketId, runners.b.socketId],
    emitState: () => emit(true), handleAction, handleDisconnect,
    destroy() { clearInterval(timer); },
    // Non-network hooks used solely for deterministic physics tests.
    ...(options.testMode ? { _test: { snapshot, update, runners, flags, scores, get status() { return status; } } } : {}),
  };
}
