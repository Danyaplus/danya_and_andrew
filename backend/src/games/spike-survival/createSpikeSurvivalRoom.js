const WORLD = { width: 1000, height: 620 };
const ARENA = [
  [180, 70], [820, 70], [930, 170], [930, 450],
  [820, 550], [180, 550], [70, 450], [70, 170],
];
const CENTER = { x: 500, y: 310 };
const PLAYER_RADIUS = 25;
const PLAYER_SPEED = 205;
const BALL_RADIUS = 20;
const BALL_SPEED = 430;
const PHYSICS_MS = 8;
const EMIT_MS = 40;
const WARNING_MS = 1750;
const SURVIVAL_MS = 60000;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function opposite(seat) { return seat === 'a' ? 'b' : 'a'; }
function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const name = value.trim().slice(0, 28);
  return name || 'Игрок';
}
function normalizeAngle(angle) {
  let a = Number(angle) || 0;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

const EDGES = ARENA.map((a, index) => {
  const b = ARENA[(index + 1) % ARENA.length];
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const midX = (a[0] + b[0]) * 0.5;
  const midY = (a[1] + b[1]) * 0.5;
  let nx = -ey / len;
  let ny = ex / len;
  if ((CENTER.x - midX) * nx + (CENTER.y - midY) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { ax: a[0], ay: a[1], bx: b[0], by: b[1], nx, ny };
});

function keepCircleInside(body, radius, bounce) {
  let touched = false;
  for (const edge of EDGES) {
    const distance = (body.x - edge.ax) * edge.nx + (body.y - edge.ay) * edge.ny;
    if (distance >= radius) continue;

    const push = radius - distance + 0.2;
    body.x += edge.nx * push;
    body.y += edge.ny * push;
    const vn = body.vx * edge.nx + body.vy * edge.ny;
    if (vn < 0) {
      if (bounce) {
        body.vx -= 2 * vn * edge.nx;
        body.vy -= 2 * vn * edge.ny;
      } else {
        body.vx -= vn * edge.nx;
        body.vy -= vn * edge.ny;
      }
    }
    touched = true;
  }
  return touched;
}

function makeRunner(seat) {
  const left = seat === 'a';
  const heading = left ? 0 : Math.PI;
  return {
    x: left ? 270 : 730,
    y: left ? 405 : 215,
    vx: Math.cos(heading) * PLAYER_SPEED,
    vy: Math.sin(heading) * PLAYER_SPEED,
    heading,
    alive: true,
  };
}

function publicRunner(runner) {
  return {
    x: Math.round(runner.x * 10) / 10,
    y: Math.round(runner.y * 10) / 10,
    vx: Math.round(runner.vx * 10) / 10,
    vy: Math.round(runner.vy * 10) / 10,
    heading: Math.round(runner.heading * 10000) / 10000,
    alive: runner.alive,
  };
}

function publicBall(ball) {
  if (!ball) return null;
  return {
    x: Math.round(ball.x * 10) / 10,
    y: Math.round(ball.y * 10) / 10,
    vx: Math.round(ball.vx * 10) / 10,
    vy: Math.round(ball.vy * 10) / 10,
    radius: BALL_RADIUS,
    spin: ball.spin,
  };
}

function chooseLaunchAngle() {
  // Avoid almost-horizontal/vertical starts so the opening ricochets are interesting.
  const choices = [24, 38, 52, 128, 142, 156, 204, 218, 232, 308, 322, 336];
  const deg = choices[Math.floor(Math.random() * choices.length)] + (Math.random() - 0.5) * 10;
  return deg * Math.PI / 180;
}

function separateRunners(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  const minimum = PLAYER_RADIUS * 2;
  if (d >= minimum) return;
  if (d < 0.001) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d;
  const ny = dy / d;
  const push = (minimum - d) * 0.52;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
}

export function createSpikeSurvivalRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safeName(shuffled[0].name), color: '#ff2769' },
    b: { socketId: shuffled[1].socketId, name: safeName(shuffled[1].name), color: '#2f7df4' },
  };

  const runners = { a: makeRunner('a'), b: makeRunner('b') };
  const launchAngle = chooseLaunchAngle();
  const launchAt = Date.now() + WARNING_MS;
  const survivalEndsAt = launchAt + SURVIVAL_MS;
  let phase = 'warning';
  let ball = null;
  let status = 'playing';
  let result = null;
  let lastPhysicsAt = Date.now();
  let lastEmitAt = 0;
  let timer = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'spike-survival',
      roomId,
      serverTime: now,
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name, color: bySeat.a.color },
        b: { name: bySeat.b.name, color: bySeat.b.color },
      },
      world: WORLD,
      arena: ARENA,
      playerRadius: PLAYER_RADIUS,
      playerSpeed: PLAYER_SPEED,
      ballRadius: BALL_RADIUS,
      ballSpeed: BALL_SPEED,
      runners: { a: publicRunner(runners.a), b: publicRunner(runners.b) },
      ball: publicBall(ball),
      launchAngle,
      launchAt,
      survivalEndsAt,
      survivalMs: SURVIVAL_MS,
      phase,
      status,
      result,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId, now));
    }
  }

  function completeRound(resultData) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = resultData;
    if (timer) clearInterval(timer);
    timer = null;
    emitState(true);
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function finish(winner, loser, message) {
    runners[loser].alive = false;
    completeRound({ type: 'winner', winner, loser, message });
  }

  function finishDraw() {
    completeRound({
      type: 'draw',
      winner: null,
      loser: null,
      message: 'Вы оба продержались 1 минуту. Ничья!',
    });
  }

  function handleAction(socketId, action = {}) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    if (action.type === 'steer') {
      const heading = Number(action.heading);
      if (!Number.isFinite(heading)) return;
      runners[seat].heading = normalizeAngle(heading);
      return;
    }

    if (action.type === 'resign') {
      finish(opposite(seat), seat, `${bySeat[seat].name} покинул арену.`);
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (seat) finish(opposite(seat), seat, 'Соперник отключился.');
  }

  function simulateRunner(runner, dt) {
    runner.vx = Math.cos(runner.heading) * PLAYER_SPEED;
    runner.vy = Math.sin(runner.heading) * PLAYER_SPEED;
    runner.x += runner.vx * dt;
    runner.y += runner.vy * dt;
    keepCircleInside(runner, PLAYER_RADIUS, false);
  }

  function spawnBall() {
    ball = {
      x: CENTER.x,
      y: CENTER.y,
      vx: Math.cos(launchAngle) * BALL_SPEED,
      vy: Math.sin(launchAngle) * BALL_SPEED,
      spin: Math.random() < 0.5 ? -1 : 1,
    };
    phase = 'survival';
  }

  function simulateBall(dt) {
    if (!ball) return;
    // Two substeps keep collision reliable on slower servers and fast phones.
    const steps = 2;
    const subDt = dt / steps;
    for (let step = 0; step < steps; step += 1) {
      ball.x += ball.vx * subDt;
      ball.y += ball.vy * subDt;
      keepCircleInside(ball, BALL_RADIUS, true);

      const hitA = distSq(ball.x, ball.y, runners.a.x, runners.a.y) <= (BALL_RADIUS + PLAYER_RADIUS - 2) ** 2;
      const hitB = distSq(ball.x, ball.y, runners.b.x, runners.b.y) <= (BALL_RADIUS + PLAYER_RADIUS - 2) ** 2;

      if (hitA && hitB) {
        // Extremely rare simultaneous touch: closest center loses.
        const da = distSq(ball.x, ball.y, runners.a.x, runners.a.y);
        const db = distSq(ball.x, ball.y, runners.b.x, runners.b.y);
        if (da <= db) finish('b', 'a', `${bySeat.a.name} задел шипастый мяч.`);
        else finish('a', 'b', `${bySeat.b.name} задел шипастый мяч.`);
        return;
      }
      if (hitA) { finish('b', 'a', `${bySeat.a.name} задел шипастый мяч.`); return; }
      if (hitB) { finish('a', 'b', `${bySeat.b.name} задел шипастый мяч.`); return; }
    }
  }

  function update(now) {
    if (status !== 'playing') return;
    const dt = clamp((now - lastPhysicsAt) / 1000, 0, 0.04);
    lastPhysicsAt = now;

    simulateRunner(runners.a, dt);
    simulateRunner(runners.b, dt);
    separateRunners(runners.a, runners.b);
    keepCircleInside(runners.a, PLAYER_RADIUS, false);
    keepCircleInside(runners.b, PLAYER_RADIUS, false);

    if (!ball && now >= launchAt) spawnBall();
    if (phase === 'survival' && now >= survivalEndsAt) {
      finishDraw();
      return;
    }
    if (ball) simulateBall(dt);
    emitState();
  }

  timer = setInterval(() => update(Date.now()), PHYSICS_MS);
  timer.unref?.();
  emitState(true);

  return {
    id: roomId,
    gameId: 'spike-survival',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() { if (timer) clearInterval(timer); },
  };
}
