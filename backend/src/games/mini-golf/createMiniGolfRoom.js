const FIELD = { width: 1200, height: 760 };
const PHYSICS_TICK_MS = 8;       // ~125 Hz server simulation
const EMIT_EVERY_MS = 50;        // ~20 network snapshots/s
const BALL_RADIUS = 16;
const HOLE_RADIUS = 28;
const MAX_SHOT_SPEED = 930;
const MIN_SHOT_SPEED = 120;
const GRASS_DECEL = 132;
const SAND_DECEL = 520;
const STOP_SPEED = 18;
const WALL_RESTITUTION = 0.78;
const BUMPER_RESTITUTION = 0.94;
const BUMPER_BOOST = 1.065;
const MAX_BALL_SPEED = 1020;
const MAX_STROKES = 8;
const HOLE_TRANSITION_MS = 1500;
const EDGE = 20;

function rect(x, y, w, h, kind = 'crate', restitution = WALL_RESTITUTION) {
  return { shape: 'rect', x, y, w, h, kind, restitution };
}

function circle(x, y, r, kind = 'bumper', restitution = BUMPER_RESTITUTION) {
  return { shape: 'circle', x, y, r, kind, restitution };
}

const COURSES = [
  {
    id: 'pine-turn',
    name: 'Сосновая петля',
    subtitle: 'Змейка, песчаная ловушка и отбойная стойка',
    par: 4,
    start: { x: 118, y: 650 },
    hole: { x: 1080, y: 112 },
    fairway: 'M95 650 C220 600 220 470 370 440 S560 500 660 400 S780 230 1085 112',
    sand: [
      { x: 430, y: 470, w: 250, h: 125, rx: 50 },
      { x: 865, y: 125, w: 150, h: 92, rx: 40 },
    ],
    obstacles: [
      rect(290, 360, 220, 44, 'crate'),
      rect(735, 250, 225, 44, 'log', 0.73),
      rect(765, 475, 54, 185, 'stone', 0.82),
      circle(610, 365, 42, 'bumper', 0.98),
    ],
    decorations: [
      { type: 'tree', x: 170, y: 170, s: 1.0 },
      { type: 'tree', x: 1035, y: 560, s: 0.86 },
      { type: 'tree', x: 1090, y: 520, s: 0.7 },
      { type: 'flower', x: 650, y: 120, s: 1 },
    ],
  },
  {
    id: 'sand-serpent',
    name: 'Песчаный серпантин',
    subtitle: 'Длинный вираж с двумя медленными зонами',
    par: 5,
    start: { x: 118, y: 120 },
    hole: { x: 1070, y: 625 },
    fairway: 'M110 118 C310 130 350 290 515 300 S740 200 820 385 S910 585 1070 625',
    sand: [
      { x: 310, y: 188, w: 265, h: 122, rx: 48 },
      { x: 770, y: 455, w: 235, h: 128, rx: 46 },
    ],
    obstacles: [
      rect(255, 405, 240, 48, 'stone', 0.82),
      rect(625, 118, 50, 255, 'crate'),
      rect(535, 535, 218, 48, 'log', 0.72),
      circle(775, 310, 38, 'bumper', 0.99),
      circle(940, 305, 34, 'bumper', 0.99),
    ],
    decorations: [
      { type: 'rock', x: 150, y: 605, s: 1.0 },
      { type: 'tree', x: 1040, y: 165, s: 0.9 },
      { type: 'flower', x: 590, y: 430, s: 1 },
    ],
  },
  {
    id: 'ricochet-garden',
    name: 'Сад рикошетов',
    subtitle: 'Стойки помогают срезать путь — если правильно рассчитать угол',
    par: 5,
    start: { x: 125, y: 635 },
    hole: { x: 1070, y: 118 },
    fairway: 'M120 640 C300 575 330 420 510 425 S730 560 820 380 S925 170 1070 118',
    sand: [
      { x: 470, y: 235, w: 220, h: 122, rx: 50 },
    ],
    obstacles: [
      rect(300, 245, 54, 220, 'stone', 0.83),
      rect(805, 420, 58, 215, 'crate'),
      rect(865, 205, 170, 46, 'log', 0.73),
      circle(510, 505, 44, 'bumper', 1.0),
      circle(680, 435, 44, 'bumper', 1.0),
      circle(775, 315, 42, 'bumper', 1.0),
    ],
    decorations: [
      { type: 'tree', x: 160, y: 140, s: 0.95 },
      { type: 'tree', x: 1030, y: 600, s: 0.8 },
      { type: 'rock', x: 590, y: 655, s: 0.8 },
      { type: 'flower', x: 885, y: 350, s: 1 },
    ],
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function opposite(seat) {
  return seat === 'a' ? 'b' : 'a';
}

function pointInRoundedRect(point, zone) {
  return point.x >= zone.x && point.x <= zone.x + zone.w && point.y >= zone.y && point.y <= zone.y + zone.h;
}

function makeBall(course, seat) {
  const yOffset = seat === 'a' ? -18 : 18;
  return {
    x: course.start.x,
    y: clamp(course.start.y + yOffset, BALL_RADIUS + EDGE, FIELD.height - BALL_RADIUS - EDGE),
    vx: 0,
    vy: 0,
    moving: false,
    sunk: false,
    done: false,
    strokes: 0,
    scoreForHole: null,
    surface: 'grass',
  };
}

function publicBall(ball) {
  return {
    x: Math.round(ball.x * 10) / 10,
    y: Math.round(ball.y * 10) / 10,
    vx: Math.round(ball.vx * 10) / 10,
    vy: Math.round(ball.vy * 10) / 10,
    speed: Math.round(Math.hypot(ball.vx, ball.vy) * 10) / 10,
    moving: ball.moving,
    sunk: ball.sunk,
    done: ball.done,
    strokes: ball.strokes,
    scoreForHole: ball.scoreForHole,
    surface: ball.surface,
  };
}

function circleVsRect(ball, obstacle) {
  const closestX = clamp(ball.x, obstacle.x, obstacle.x + obstacle.w);
  const closestY = clamp(ball.y, obstacle.y, obstacle.y + obstacle.h);
  let dx = ball.x - closestX;
  let dy = ball.y - closestY;
  let distSq = dx * dx + dy * dy;

  if (distSq >= BALL_RADIUS * BALL_RADIUS) return null;

  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    return {
      nx: dx / dist,
      ny: dy / dist,
      penetration: BALL_RADIUS - dist,
    };
  }

  // Center is inside the rectangle. Choose the shortest escape axis.
  const left = Math.abs(ball.x - obstacle.x);
  const right = Math.abs(obstacle.x + obstacle.w - ball.x);
  const top = Math.abs(ball.y - obstacle.y);
  const bottom = Math.abs(obstacle.y + obstacle.h - ball.y);
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { nx: -1, ny: 0, penetration: BALL_RADIUS + left };
  if (min === right) return { nx: 1, ny: 0, penetration: BALL_RADIUS + right };
  if (min === top) return { nx: 0, ny: -1, penetration: BALL_RADIUS + top };
  return { nx: 0, ny: 1, penetration: BALL_RADIUS + bottom };
}

function circleVsCircle(ball, obstacle) {
  const dx = ball.x - obstacle.x;
  const dy = ball.y - obstacle.y;
  const minDist = BALL_RADIUS + obstacle.r;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDist * minDist) return null;

  if (distSq < 1e-9) {
    return { nx: 1, ny: 0, penetration: minDist };
  }

  const dist = Math.sqrt(distSq);
  return {
    nx: dx / dist,
    ny: dy / dist,
    penetration: minDist - dist,
  };
}

function reflectVelocity(ball, nx, ny, restitution) {
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return false;
  ball.vx -= (1 + restitution) * vn * nx;
  ball.vy -= (1 + restitution) * vn * ny;
  return true;
}

function capBallSpeed(ball, maxSpeed = MAX_BALL_SPEED) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= maxSpeed || speed < 1e-9) return;
  const scale = maxSpeed / speed;
  ball.vx *= scale;
  ball.vy *= scale;
}

export function createMiniGolfRoom({ roomId, players, io, onFinish }) {
  const shuffled = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffled[0].socketId, name: safePlayerName(shuffled[0].name) },
    b: { socketId: shuffled[1].socketId, name: safePlayerName(shuffled[1].name) },
  };

  const courseOrder = [...COURSES].sort(() => Math.random() - 0.5);
  const firstStarter = Math.random() < 0.5 ? 'a' : 'b';
  let courseIndex = 0;
  let course = courseOrder[courseIndex];
  let balls = { a: makeBall(course, 'a'), b: makeBall(course, 'b') };
  let currentTurn = firstStarter;
  let phase = 'aim';
  let status = 'playing';
  let result = null;
  let holeWins = { a: 0, b: 0 };
  let totalStrokes = { a: 0, b: 0 };
  let holeResult = null;
  let movingSeat = null;
  let lastTickAt = Date.now();
  let lastEmitAt = 0;
  let interval = null;
  let transitionTimer = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    return {
      gameId: 'mini-golf',
      roomId,
      serverTime: Date.now(),
      playerSeat,
      opponentSeat: playerSeat ? opposite(playerSeat) : null,
      players: {
        a: { name: bySeat.a.name },
        b: { name: bySeat.b.name },
      },
      field: {
        ...FIELD,
        ballRadius: BALL_RADIUS,
        holeRadius: HOLE_RADIUS,
        maxShotSpeed: MAX_SHOT_SPEED,
      },
      course,
      courseNumber: courseIndex + 1,
      courseCount: courseOrder.length,
      balls: {
        a: publicBall(balls.a),
        b: publicBall(balls.b),
      },
      currentTurn,
      movingSeat,
      phase,
      status,
      holeWins,
      totalStrokes,
      maxStrokes: MAX_STROKES,
      holeResult,
      result,
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastEmitAt < EMIT_EVERY_MS) return;
    lastEmitAt = now;
    for (const seat of ['a', 'b']) {
      io.to(bySeat[seat].socketId).emit('game:state', snapshotFor(bySeat[seat].socketId));
    }
  }

  function finishMatch(winner, type, message) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    movingSeat = null;
    result = { winner, type, message };
    if (interval) clearInterval(interval);
    interval = null;
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = null;
    emitState(true);

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function resolveMatchWinner() {
    if (holeWins.a !== holeWins.b) return holeWins.a > holeWins.b ? 'a' : 'b';
    if (totalStrokes.a !== totalStrokes.b) return totalStrokes.a < totalStrokes.b ? 'a' : 'b';
    return null;
  }

  function startNextCourse() {
    courseIndex += 1;
    if (courseIndex >= courseOrder.length) {
      const winner = resolveMatchWinner();
      finishMatch(
        winner,
        'score',
        winner
          ? `Три лунки сыграны. Победа по лункам и общему числу ударов.`
          : 'Три лунки сыграны абсолютно вничью.'
      );
      return;
    }

    course = courseOrder[courseIndex];
    balls = { a: makeBall(course, 'a'), b: makeBall(course, 'b') };
    currentTurn = courseIndex % 2 === 0 ? firstStarter : opposite(firstStarter);
    movingSeat = null;
    phase = 'aim';
    holeResult = null;
    lastTickAt = Date.now();
    emitState(true);
  }

  function endHole() {
    if (phase === 'hole-over' || status !== 'playing') return;
    phase = 'hole-over';
    movingSeat = null;

    const scoreA = balls.a.scoreForHole ?? MAX_STROKES + 1;
    const scoreB = balls.b.scoreForHole ?? MAX_STROKES + 1;
    totalStrokes = { a: totalStrokes.a + scoreA, b: totalStrokes.b + scoreB };

    let winner = null;
    if (scoreA < scoreB) winner = 'a';
    if (scoreB < scoreA) winner = 'b';
    if (winner) holeWins = { ...holeWins, [winner]: holeWins[winner] + 1 };

    holeResult = {
      winner,
      scores: { a: scoreA, b: scoreB },
      message: winner
        ? `${bySeat[winner].name} берёт лунку: ${scoreA}:${scoreB} по ударам.`
        : `Ничья на лунке: ${scoreA}:${scoreB}.`,
    };
    emitState(true);

    transitionTimer = setTimeout(startNextCourse, HOLE_TRANSITION_MS);
    transitionTimer.unref?.();
  }

  function chooseNextTurn(justPlayed) {
    const other = opposite(justPlayed);
    if (!balls[other].done) return other;
    if (!balls[justPlayed].done) return justPlayed;
    return null;
  }

  function finishTurn(seat, sunk = false) {
    const ball = balls[seat];
    ball.moving = false;
    ball.vx = 0;
    ball.vy = 0;
    movingSeat = null;

    if (sunk) {
      ball.sunk = true;
      ball.done = true;
      ball.scoreForHole = ball.strokes;
      ball.x = course.hole.x;
      ball.y = course.hole.y;
    } else if (ball.strokes >= MAX_STROKES) {
      ball.done = true;
      ball.scoreForHole = MAX_STROKES + 1;
    }

    if (balls.a.done && balls.b.done) {
      endHole();
      return;
    }

    const next = chooseNextTurn(seat);
    if (!next) {
      endHole();
      return;
    }
    currentTurn = next;
    phase = 'aim';
    emitState(true);
  }

  function ballInHole(ball) {
    const dx = ball.x - course.hole.x;
    const dy = ball.y - course.hole.y;
    const distance = Math.hypot(dx, dy);
    const speed = Math.hypot(ball.vx, ball.vy);
    return distance <= HOLE_RADIUS * 0.72 && speed <= 760;
  }

  function updateSurface(ball) {
    ball.surface = course.sand.some((zone) => pointInRoundedRect(ball, zone)) ? 'sand' : 'grass';
  }

  function applyRollingResistance(ball, dt) {
    updateSurface(ball);
    let speed = Math.hypot(ball.vx, ball.vy);
    if (speed <= 0) return;
    const decel = ball.surface === 'sand' ? SAND_DECEL : GRASS_DECEL;
    speed = Math.max(0, speed - decel * dt);
    if (speed <= STOP_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
      return;
    }
    const current = Math.hypot(ball.vx, ball.vy) || 1;
    const scale = speed / current;
    ball.vx *= scale;
    ball.vy *= scale;
  }

  function resolveOuterWalls(ball) {
    const minX = EDGE + BALL_RADIUS;
    const maxX = FIELD.width - EDGE - BALL_RADIUS;
    const minY = EDGE + BALL_RADIUS;
    const maxY = FIELD.height - EDGE - BALL_RADIUS;

    if (ball.x < minX) {
      ball.x = minX + (minX - ball.x);
      ball.vx = Math.abs(ball.vx) * WALL_RESTITUTION;
    } else if (ball.x > maxX) {
      ball.x = maxX - (ball.x - maxX);
      ball.vx = -Math.abs(ball.vx) * WALL_RESTITUTION;
    }

    if (ball.y < minY) {
      ball.y = minY + (minY - ball.y);
      ball.vy = Math.abs(ball.vy) * WALL_RESTITUTION;
    } else if (ball.y > maxY) {
      ball.y = maxY - (ball.y - maxY);
      ball.vy = -Math.abs(ball.vy) * WALL_RESTITUTION;
    }
  }

  function resolveObstacles(ball) {
    for (const obstacle of course.obstacles) {
      const hit = obstacle.shape === 'circle'
        ? circleVsCircle(ball, obstacle)
        : circleVsRect(ball, obstacle);
      if (!hit) continue;

      ball.x += hit.nx * (hit.penetration + 0.6);
      ball.y += hit.ny * (hit.penetration + 0.6);
      const reflected = reflectVelocity(ball, hit.nx, hit.ny, obstacle.restitution ?? WALL_RESTITUTION);

      if (reflected && obstacle.kind === 'bumper') {
        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed > 1) {
          const target = Math.min(MAX_BALL_SPEED, Math.max(speed + 35, speed * BUMPER_BOOST));
          const scale = target / speed;
          ball.vx *= scale;
          ball.vy *= scale;
        }
      }
      capBallSpeed(ball);
    }
  }

  function simulateMovingBall(dt) {
    if (!movingSeat || phase !== 'moving') return;
    const ball = balls[movingSeat];
    if (!ball.moving) return;

    const speed = Math.hypot(ball.vx, ball.vy);
    const distance = speed * dt;
    const distanceSteps = Math.ceil(distance / (BALL_RADIUS * 0.42));
    const timeSteps = Math.ceil(dt / (1 / 240));
    const substeps = clamp(Math.max(distanceSteps, timeSteps), 1, 14);
    const stepDt = dt / substeps;

    for (let i = 0; i < substeps; i += 1) {
      ball.x += ball.vx * stepDt;
      ball.y += ball.vy * stepDt;

      resolveOuterWalls(ball);
      resolveObstacles(ball);

      if (ballInHole(ball)) {
        finishTurn(movingSeat, true);
        return;
      }

      applyRollingResistance(ball, stepDt);
      if (Math.hypot(ball.vx, ball.vy) <= STOP_SPEED) {
        finishTurn(movingSeat, false);
        return;
      }
    }
  }

  function tick() {
    if (status !== 'playing') return;
    const now = Date.now();
    let dt = (now - lastTickAt) / 1000;
    lastTickAt = now;
    dt = clamp(dt, 0, 0.045);

    if (phase === 'moving') {
      simulateMovingBall(dt);
      emitState(false);
    }
  }

  function handleAction(socketId, action) {
    const seat = seatForSocket(socketId);
    if (!seat || !action || status !== 'playing') return;

    if (action.type === 'shoot') {
      if (phase !== 'aim' || currentTurn !== seat) return;
      const ball = balls[seat];
      if (ball.done || ball.moving) return;

      const angle = Number(action.angle);
      const power = Number(action.power);
      if (!Number.isFinite(angle) || !Number.isFinite(power)) return;

      const normalizedPower = clamp(power, 0.08, 1);
      const speed = MIN_SHOT_SPEED + (MAX_SHOT_SPEED - MIN_SHOT_SPEED) * Math.pow(normalizedPower, 1.08);
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
      ball.moving = true;
      ball.strokes += 1;
      ball.surface = 'grass';
      movingSeat = seat;
      phase = 'moving';
      lastTickAt = Date.now();
      emitState(true);
      return;
    }

    if (action.type === 'resign') {
      finishMatch(opposite(seat), 'resign', `${bySeat[seat].name} покинул матч.`);
    }
  }

  function handleDisconnect(socketId) {
    const seat = seatForSocket(socketId);
    if (!seat || status === 'finished') return;
    finishMatch(opposite(seat), 'disconnect', `${bySeat[seat].name} отключился.`);
  }

  function destroy() {
    if (interval) clearInterval(interval);
    interval = null;
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = null;
  }

  interval = setInterval(tick, PHYSICS_TICK_MS);
  interval.unref?.();
  emitState(true);

  return {
    playerSocketIds: Object.values(bySeat).map((player) => player.socketId),
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy,
  };
}
