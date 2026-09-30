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
const MAX_STROKES = 14;
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
    id: 'forest-maze',
    name: 'Лесной лабиринт',
    subtitle: 'Четыре поворота, узкие проходы и песчаные карманы',
    par: 7,
    start: { x: 110, y: 650 },
    hole: { x: 1110, y: 110 },
    fairway: 'M110 650 L430 650 L430 125 L680 125 L680 650 L920 650 L920 125 L1110 110',
    sand: [
      { x: 340, y: 585, w: 155, h: 105, rx: 42 },
      { x: 600, y: 75, w: 155, h: 105, rx: 42 },
      { x: 835, y: 585, w: 145, h: 105, rx: 42 },
    ],
    obstacles: [
      rect(290, 40, 52, 520, 'hedge', 0.8),
      rect(535, 200, 52, 520, 'hedge', 0.8),
      rect(780, 40, 52, 500, 'hedge', 0.8),
      rect(1010, 220, 52, 500, 'hedge', 0.8),
      circle(660, 635, 34, 'bumper', 0.99),
      circle(905, 135, 34, 'bumper', 0.99),
    ],
    decorations: [
      { type: 'tree', x: 160, y: 170, s: 1.0 },
      { type: 'tree', x: 430, y: 300, s: 0.82 },
      { type: 'tree', x: 690, y: 360, s: 0.82 },
      { type: 'tree', x: 935, y: 350, s: 0.86 },
      { type: 'flower', x: 1120, y: 610, s: 1 },
    ],
  },
  {
    id: 'stone-locks',
    name: 'Каменные шлюзы',
    subtitle: 'Серпантин между каменными стенами — ищи правильный угол',
    par: 8,
    start: { x: 115, y: 100 },
    hole: { x: 1080, y: 665 },
    fairway: 'M115 100 L1030 100 L1030 300 L170 300 L170 475 L1030 475 L1030 665 L1080 665',
    sand: [
      { x: 880, y: 245, w: 180, h: 90, rx: 36 },
      { x: 120, y: 420, w: 190, h: 92, rx: 36 },
      { x: 880, y: 600, w: 175, h: 90, rx: 36 },
    ],
    obstacles: [
      rect(40, 185, 820, 52, 'stone', 0.84),
      rect(330, 355, 830, 52, 'stone', 0.84),
      rect(40, 535, 820, 52, 'stone', 0.84),
      circle(935, 285, 35, 'bumper', 1.0),
      circle(250, 455, 35, 'bumper', 1.0),
      rect(970, 610, 70, 42, 'crate', 0.76),
    ],
    decorations: [
      { type: 'rock', x: 1050, y: 165, s: 0.75 },
      { type: 'rock', x: 155, y: 340, s: 0.7 },
      { type: 'tree', x: 1130, y: 430, s: 0.72 },
      { type: 'flower', x: 580, y: 680, s: 1 },
    ],
  },
  {
    id: 'sand-canyon',
    name: 'Песчаный каньон',
    subtitle: 'Ворота смещены друг относительно друга, а песок съедает скорость',
    par: 8,
    start: { x: 110, y: 650 },
    hole: { x: 1100, y: 105 },
    fairway: 'M110 650 L390 650 L390 545 L135 545 L135 120 L390 120 L390 110 L635 110 L635 545 L895 545 L895 110 L1100 105',
    sand: [
      { x: 320, y: 500, w: 165, h: 125, rx: 44 },
      { x: 525, y: 70, w: 165, h: 105, rx: 42 },
      { x: 815, y: 500, w: 165, h: 125, rx: 44 },
      { x: 995, y: 70, w: 125, h: 100, rx: 38 },
    ],
    obstacles: [
      rect(250, 40, 52, 450, 'wall', 0.86),
      rect(250, 600, 52, 120, 'wall', 0.86),
      rect(500, 170, 52, 550, 'wall', 0.86),
      rect(750, 40, 52, 450, 'wall', 0.86),
      rect(750, 600, 52, 120, 'wall', 0.86),
      rect(995, 180, 52, 540, 'wall', 0.86),
      circle(410, 545, 38, 'bumper', 1.0),
      circle(870, 110, 38, 'bumper', 1.0),
    ],
    decorations: [
      { type: 'rock', x: 110, y: 260, s: 0.75 },
      { type: 'rock', x: 650, y: 390, s: 0.68 },
      { type: 'rock', x: 1110, y: 420, s: 0.72 },
      { type: 'flower', x: 620, y: 680, s: 1 },
    ],
  },
  {
    id: 'pinball-garden',
    name: 'Пинбол-сад',
    subtitle: 'Два маршрута вокруг центрального сада и серия отбойников',
    par: 6,
    start: { x: 110, y: 380 },
    hole: { x: 1100, y: 380 },
    fairway: 'M110 380 C260 380 300 120 520 120 S780 120 900 380 C780 640 520 640 340 540 C230 480 240 380 110 380 M900 380 L1100 380',
    sand: [
      { x: 420, y: 75, w: 220, h: 105, rx: 44 },
      { x: 520, y: 575, w: 220, h: 105, rx: 44 },
    ],
    obstacles: [
      rect(360, 190, 480, 55, 'hedge', 0.8),
      rect(360, 515, 480, 55, 'hedge', 0.8),
      rect(360, 245, 55, 270, 'hedge', 0.8),
      rect(785, 245, 55, 270, 'hedge', 0.8),
      rect(970, 40, 50, 250, 'stone', 0.84),
      rect(970, 470, 50, 250, 'stone', 0.84),
      circle(210, 270, 30, 'bumper', 1.0),
      circle(210, 490, 30, 'bumper', 1.0),
      circle(900, 120, 28, 'bumper', 1.0),
      circle(900, 640, 28, 'bumper', 1.0),
    ],
    decorations: [
      { type: 'tree', x: 520, y: 350, s: 1.05 },
      { type: 'tree', x: 680, y: 385, s: 0.92 },
      { type: 'flower', x: 600, y: 300, s: 1.1 },
      { type: 'flower', x: 620, y: 455, s: 1.0 },
    ],
  },
  {
    id: 'old-fort',
    name: 'Старая крепость',
    subtitle: 'Комнаты, ворота и рикошеты от старых стен',
    par: 8,
    start: { x: 110, y: 650 },
    hole: { x: 1090, y: 100 },
    fairway: 'M110 650 L390 650 L390 385 L610 385 L610 175 L840 175 L840 385 L1090 385 L1090 100',
    sand: [
      { x: 305, y: 540, w: 165, h: 105, rx: 38 },
      { x: 540, y: 320, w: 170, h: 105, rx: 38 },
      { x: 985, y: 300, w: 135, h: 105, rx: 38 },
    ],
    obstacles: [
      rect(250, 40, 50, 300, 'fort', 0.88),
      rect(250, 450, 50, 270, 'fort', 0.88),
      rect(470, 250, 300, 50, 'fort', 0.88),
      rect(470, 300, 50, 260, 'fort', 0.88),
      rect(720, 430, 50, 290, 'fort', 0.88),
      rect(900, 40, 50, 300, 'fort', 0.88),
      rect(900, 450, 50, 270, 'fort', 0.88),
      circle(385, 565, 28, 'bumper', 1.0),
      circle(825, 185, 28, 'bumper', 1.0),
      rect(1045, 210, 74, 42, 'crate', 0.76),
    ],
    decorations: [
      { type: 'tree', x: 110, y: 120, s: 0.75 },
      { type: 'rock', x: 650, y: 660, s: 0.74 },
      { type: 'rock', x: 1080, y: 590, s: 0.7 },
      { type: 'flower', x: 660, y: 120, s: 1 },
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
          ? `Пять лунок сыграны. Победа по лункам и общему числу ударов.`
          : 'Пять лунок сыграны абсолютно вничью.'
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
