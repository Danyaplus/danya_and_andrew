const TABLE_W = 1000;
const TABLE_H = 520;
const RAIL = 46;
const BALL_R = 13.5;
const TURN_MS = 30_000;
const TICK_MS = 10;
const SUBSTEPS = 2;
// Physics stays high-frequency, but network snapshots are intentionally much rarer.
// The client interpolates them at display refresh rate.
const MOVING_STATE_MS = 66; // ~15 snapshots/s while balls are moving
const AIMING_STATE_MS = 1000; // only keep the 30s clock fresh while nobody is moving
const MAX_SPEED = 1500;
const ROLLING_DECEL = 165;
const STOP_SPEED = 3.5;
const BALL_RESTITUTION = 0.965;
const CUSHION_RESTITUTION = 0.88;

const CORNER_CAPTURE = 34;
const SIDE_CAPTURE = 31;
const CORNER_MOUTH = 47;
const SIDE_MOUTH = 46;
const JAW_R = 9.5;

const POCKETS = [
  { x: RAIL - 5, y: RAIL - 5, r: CORNER_CAPTURE, kind: 'corner' },
  { x: TABLE_W / 2, y: RAIL - 7, r: SIDE_CAPTURE, kind: 'side' },
  { x: TABLE_W - RAIL + 5, y: RAIL - 5, r: CORNER_CAPTURE, kind: 'corner' },
  { x: RAIL - 5, y: TABLE_H - RAIL + 5, r: CORNER_CAPTURE, kind: 'corner' },
  { x: TABLE_W / 2, y: TABLE_H - RAIL + 7, r: SIDE_CAPTURE, kind: 'side' },
  { x: TABLE_W - RAIL + 5, y: TABLE_H - RAIL + 5, r: CORNER_CAPTURE, kind: 'corner' },
];

const JAWS = [
  { x: RAIL + CORNER_MOUTH, y: RAIL + 2 },
  { x: RAIL + 2, y: RAIL + CORNER_MOUTH },
  { x: TABLE_W - RAIL - CORNER_MOUTH, y: RAIL + 2 },
  { x: TABLE_W - RAIL - 2, y: RAIL + CORNER_MOUTH },
  { x: RAIL + CORNER_MOUTH, y: TABLE_H - RAIL - 2 },
  { x: RAIL + 2, y: TABLE_H - RAIL - CORNER_MOUTH },
  { x: TABLE_W - RAIL - CORNER_MOUTH, y: TABLE_H - RAIL - 2 },
  { x: TABLE_W - RAIL - 2, y: TABLE_H - RAIL - CORNER_MOUTH },
  { x: TABLE_W / 2 - SIDE_MOUTH, y: RAIL + 2 },
  { x: TABLE_W / 2 + SIDE_MOUTH, y: RAIL + 2 },
  { x: TABLE_W / 2 - SIDE_MOUTH, y: TABLE_H - RAIL - 2 },
  { x: TABLE_W / 2 + SIDE_MOUTH, y: TABLE_H - RAIL - 2 },
];

function safeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function other(slot) {
  return slot === 'a' ? 'b' : 'a';
}

function ballGroup(number) {
  if (number >= 1 && number <= 7) return 'solid';
  if (number >= 9 && number <= 15) return 'stripe';
  if (number === 8) return 'eight';
  return 'cue';
}

function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function rackNumbers() {
  const spots = new Array(15).fill(null);
  spots[4] = 8;

  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const solidCorner = solids.splice(Math.floor(Math.random() * solids.length), 1)[0];
  const stripeCorner = stripes.splice(Math.floor(Math.random() * stripes.length), 1)[0];

  if (Math.random() < 0.5) {
    spots[10] = solidCorner;
    spots[14] = stripeCorner;
  } else {
    spots[10] = stripeCorner;
    spots[14] = solidCorner;
  }

  const remaining = shuffled([...solids, ...stripes]);
  let cursor = 0;
  for (let i = 0; i < spots.length; i += 1) {
    if (spots[i] === null) spots[i] = remaining[cursor++];
  }
  return spots;
}

function rackPositions() {
  const positions = [];
  const apexX = 700;
  const centerY = TABLE_H / 2;
  const dx = Math.sqrt(3) * BALL_R + 0.75;
  const dy = BALL_R * 2 + 0.55;

  for (let row = 0; row < 5; row += 1) {
    const x = apexX + row * dx;
    for (let col = 0; col <= row; col += 1) {
      positions.push({ x, y: centerY + (col - row / 2) * dy });
    }
  }
  return positions;
}

function createBalls() {
  const balls = [{
    id: 'cue', number: 0, group: 'cue', x: 258, y: TABLE_H / 2, vx: 0, vy: 0, pocketed: false,
  }];
  const numbers = rackNumbers();
  const positions = rackPositions();
  for (let i = 0; i < numbers.length; i += 1) {
    const number = numbers[i];
    balls.push({
      id: `ball-${number}`,
      number,
      group: ballGroup(number),
      x: positions[i].x,
      y: positions[i].y,
      vx: 0,
      vy: 0,
      pocketed: false,
    });
  }
  return balls;
}

function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function allStopped(balls) {
  return balls.every((ball) => ball.pocketed || Math.hypot(ball.vx, ball.vy) < STOP_SPEED);
}

function countRemaining(balls, group) {
  return balls.filter((ball) => !ball.pocketed && ball.group === group).length;
}

function findSafeCueSpot(balls) {
  const candidates = [
    { x: 258, y: TABLE_H / 2 }, { x: 225, y: 205 }, { x: 225, y: 315 },
    { x: 300, y: 180 }, { x: 300, y: 340 }, { x: 185, y: TABLE_H / 2 },
  ];
  for (const pos of candidates) {
    const blocked = balls.some((ball) => !ball.pocketed && ball.group !== 'cue' && distSq(pos.x, pos.y, ball.x, ball.y) < (BALL_R * 2.15) ** 2);
    if (!blocked) return pos;
  }
  return { x: 190, y: TABLE_H / 2 };
}

function isTopOpening(x) {
  return x < RAIL + CORNER_MOUTH || x > TABLE_W - RAIL - CORNER_MOUTH || Math.abs(x - TABLE_W / 2) < SIDE_MOUTH;
}
function isBottomOpening(x) { return isTopOpening(x); }
function isLeftOpening(y) {
  return y < RAIL + CORNER_MOUTH || y > TABLE_H - RAIL - CORNER_MOUTH;
}
function isRightOpening(y) { return isLeftOpening(y); }

function collideStaticCircle(ball, cx, cy, radius) {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const minDist = BALL_R + radius;
  const d2 = dx * dx + dy * dy;
  if (d2 <= 0 || d2 >= minDist * minDist) return;

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = minDist - d;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  const into = ball.vx * nx + ball.vy * ny;
  if (into < 0) {
    ball.vx -= (1 + CUSHION_RESTITUTION) * into * nx;
    ball.vy -= (1 + CUSHION_RESTITUTION) * into * ny;
  }
}

function resolveCushions(ball) {
  for (const jaw of JAWS) collideStaticCircle(ball, jaw.x, jaw.y, JAW_R);

  const minX = RAIL + BALL_R;
  const maxX = TABLE_W - RAIL - BALL_R;
  const minY = RAIL + BALL_R;
  const maxY = TABLE_H - RAIL - BALL_R;

  if (ball.y < minY && !isTopOpening(ball.x)) {
    ball.y = minY;
    if (ball.vy < 0) ball.vy = -ball.vy * CUSHION_RESTITUTION;
  }
  if (ball.y > maxY && !isBottomOpening(ball.x)) {
    ball.y = maxY;
    if (ball.vy > 0) ball.vy = -ball.vy * CUSHION_RESTITUTION;
  }
  if (ball.x < minX && !isLeftOpening(ball.y)) {
    ball.x = minX;
    if (ball.vx < 0) ball.vx = -ball.vx * CUSHION_RESTITUTION;
  }
  if (ball.x > maxX && !isRightOpening(ball.y)) {
    ball.x = maxX;
    if (ball.vx > 0) ball.vx = -ball.vx * CUSHION_RESTITUTION;
  }

  // Safety backstops behind pocket mouths: they keep a fast ball from escaping the table
  // if it passes a mouth at an unusual angle without reaching the pocket centre.
  const back = BALL_R + 5;
  if (ball.x < -back) { ball.x = RAIL; ball.vx = Math.abs(ball.vx) * 0.45; }
  if (ball.x > TABLE_W + back) { ball.x = TABLE_W - RAIL; ball.vx = -Math.abs(ball.vx) * 0.45; }
  if (ball.y < -back) { ball.y = RAIL; ball.vy = Math.abs(ball.vy) * 0.45; }
  if (ball.y > TABLE_H + back) { ball.y = TABLE_H - RAIL; ball.vy = -Math.abs(ball.vy) * 0.45; }
}

function resolveBallPair(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const minDist = BALL_R * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 <= 0 || d2 >= minDist * minDist) return;

  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = minDist - d;

  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return;

  const impulse = -((1 + BALL_RESTITUTION) * rel) / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}

function applyRollingFriction(ball, dt) {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed <= STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    return;
  }
  const nextSpeed = Math.max(0, speed - ROLLING_DECEL * dt);
  if (nextSpeed <= STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    return;
  }
  const factor = nextSpeed / speed;
  ball.vx *= factor;
  ball.vy *= factor;
}

export function createPoolRoom({ roomId, players, io, onFinish }) {
  const shuffledPlayers = Math.random() < 0.5 ? players : [...players].reverse();
  const bySlot = {
    a: { socketId: shuffledPlayers[0].socketId, name: safeName(shuffledPlayers[0].name), group: null },
    b: { socketId: shuffledPlayers[1].socketId, name: safeName(shuffledPlayers[1].name), group: null },
  };

  const balls = createBalls();
  let turn = Math.random() < 0.5 ? 'a' : 'b';
  let phase = 'aiming';
  let status = 'playing';
  let result = null;
  let breakShot = true;
  let shotNumber = 0;
  let shotPocketed = [];
  let turnDeadline = Date.now() + TURN_MS;
  let lastAction = 'Разбивка. Группы пока открыты.';
  let finishedOnce = false;
  let lastStateEmit = 0;

  function slotForSocket(socketId) {
    if (bySlot.a.socketId === socketId) return 'a';
    if (bySlot.b.socketId === socketId) return 'b';
    return null;
  }

  function playerPayload(slot) {
    const player = bySlot[slot];
    return { name: player.name, group: player.group };
  }

  function pocketedNumbers() {
    return balls.filter((ball) => ball.pocketed && ball.group !== 'cue').map((ball) => ball.number).sort((a, b) => a - b);
  }

  function resetTurn(nextTurn, message) {
    turn = nextTurn;
    phase = 'aiming';
    turnDeadline = Date.now() + TURN_MS;
    if (message) lastAction = message;
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    phase = 'finished';
    result = nextResult;
    emitState(true);
    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySlot) });
    }
  }

  function respotCue() {
    const cue = balls.find((ball) => ball.group === 'cue');
    const pos = findSafeCueSpot(balls);
    cue.pocketed = false;
    cue.x = pos.x;
    cue.y = pos.y;
    cue.vx = 0;
    cue.vy = 0;
  }

  function respotEight() {
    const eight = balls.find((ball) => ball.number === 8);
    if (!eight?.pocketed) return;
    eight.pocketed = false;
    eight.x = 700;
    eight.y = TABLE_H / 2;
    eight.vx = 0;
    eight.vy = 0;
  }

  function assignGroups(shooter, group) {
    if (bySlot.a.group || bySlot.b.group) return;
    if (group !== 'solid' && group !== 'stripe') return;
    bySlot[shooter].group = group;
    bySlot[other(shooter)].group = group === 'solid' ? 'stripe' : 'solid';
  }

  function settleShot() {
    if (status !== 'playing' || phase !== 'moving') return;

    const shooter = turn;
    const opponent = other(shooter);
    const cueScratch = shotPocketed.includes(0);
    const eightPocketed = shotPocketed.includes(8);
    const objectPocketed = shotPocketed.filter((n) => n !== 0 && n !== 8);

    if (cueScratch) respotCue();

    if (breakShot) {
      if (eightPocketed) respotEight();
      breakShot = false;
      shotNumber += 1;
      shotPocketed = [];
      resetTurn(opponent, cueScratch ? 'На разбивке биток упал в лузу. Ход соперника.' : 'Разбивка завершена. Группы всё ещё открыты.');
      emitState(true);
      return;
    }

    if (eightPocketed) {
      const group = bySlot[shooter].group;
      const readyForEight = group && countRemaining(balls, group) === 0;
      if (readyForEight && !cueScratch) {
        finish({ type: 'eight-win', winner: shooter, message: 'Восьмёрка забита после своей группы.' });
      } else {
        finish({ type: 'eight-early', winner: opponent, message: 'Восьмёрка забита слишком рано.' });
      }
      return;
    }

    if (!cueScratch && !bySlot.a.group && !bySlot.b.group && objectPocketed.length > 0) {
      const first = objectPocketed[0];
      const group = ballGroup(first);
      assignGroups(shooter, group);
      if (bySlot[shooter].group) {
        lastAction = `${bySlot[shooter].name}: ${bySlot[shooter].group === 'solid' ? 'однотонные' : 'полосатые'}.`;
      }
    }

    const shooterGroup = bySlot[shooter].group;
    const ownPocketed = shooterGroup ? objectPocketed.some((n) => ballGroup(n) === shooterGroup) : objectPocketed.length > 0;

    shotNumber += 1;
    shotPocketed = [];

    if (cueScratch) resetTurn(opponent, 'Биток попал в лузу. Ход соперника.');
    else if (ownPocketed) resetTurn(shooter, 'Забил свой шар — продолжаешь ход.');
    else resetTurn(opponent, 'Свой шар не забит. Ход соперника.');
    emitState(true);
  }

  function snapshotFor(socketId, now = Date.now()) {
    const playerSlot = slotForSocket(socketId);
    return {
      serverNow: now,
      gameId: 'pool',
      roomId,
      playerSlot,
      players: { a: playerPayload('a'), b: playerPayload('b') },
      turn,
      phase,
      status,
      result,
      breakShot,
      shotNumber,
      turnMsLeft: phase === 'aiming' && status === 'playing' ? Math.max(0, turnDeadline - now) : TURN_MS,
      lastAction,
      balls: balls.map((ball) => ({
        number: ball.number, group: ball.group, x: ball.x, y: ball.y, pocketed: ball.pocketed,
      })),
      pocketed: pocketedNumbers(),
      table: {
        width: TABLE_W,
        height: TABLE_H,
        rail: RAIL,
        ballRadius: BALL_R,
        pockets: POCKETS.map(({ x, y, r, kind }) => ({ x, y, r, kind })),
        jaws: JAWS.map(({ x, y }) => ({ x, y, r: JAW_R })),
        cornerMouth: CORNER_MOUTH,
        sideMouth: SIDE_MOUTH,
      },
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    const minGap = phase === 'moving' ? MOVING_STATE_MS : AIMING_STATE_MS;
    if (!force && now - lastStateEmit < minGap) return;
    lastStateEmit = now;
    for (const slot of ['a', 'b']) {
      io.to(bySlot[slot].socketId).emit('game:state', snapshotFor(bySlot[slot].socketId, now));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: 'pool', roomId, message });
  }

  function shoot(socketId, payload = {}) {
    if (status !== 'playing' || phase !== 'aiming') return;
    const slot = slotForSocket(socketId);
    if (!slot || turn !== slot) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }
    if (Date.now() >= turnDeadline) return;

    const angle = Number(payload.angle);
    const power = Number(payload.power);
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return;

    const cue = balls.find((ball) => ball.group === 'cue');
    if (!cue || cue.pocketed) return;

    const normalizedPower = Math.max(0.1, Math.min(1, power));
    const easedPower = 0.16 + 0.84 * Math.pow(normalizedPower, 1.15);
    const speed = MAX_SPEED * easedPower;
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    shotPocketed = [];
    phase = 'moving';
    lastAction = `${bySlot[slot].name} бьёт.`;
    emitState(true);
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'shoot') shoot(socketId, action.payload);
    if (action.type === 'resign' && status === 'playing') {
      const slot = slotForSocket(socketId);
      if (slot) finish({ type: 'resign', winner: other(slot), message: 'Соперник сдался.' });
    }
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const slot = slotForSocket(socketId);
    if (!slot) return;
    finish({ type: 'disconnect', winner: other(slot), message: 'Соперник отключился от игры.' });
  }

  function pocketBall(ball) {
    if (ball.pocketed) return;
    ball.pocketed = true;
    ball.vx = 0;
    ball.vy = 0;
    shotPocketed.push(ball.number);
  }

  function tryPocket(ball) {
    for (const pocket of POCKETS) {
      const capture = pocket.r;
      if (distSq(ball.x, ball.y, pocket.x, pocket.y) <= capture * capture) {
        pocketBall(ball);
        return true;
      }
    }
    return false;
  }

  function simulateStep(dt) {
    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (tryPocket(ball)) continue;
      resolveCushions(ball);
      if (tryPocket(ball)) continue;
    }

    // Two collision passes greatly reduce visible overlap in clustered shots / break shots.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < balls.length; i += 1) {
        const a = balls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < balls.length; j += 1) {
          const b = balls[j];
          if (b.pocketed) continue;
          resolveBallPair(a, b);
        }
      }
    }

    for (const ball of balls) {
      if (!ball.pocketed) applyRollingFriction(ball, dt);
    }
  }

  function simulate() {
    if (status !== 'playing') return;

    if (phase === 'aiming') {
      if (Date.now() >= turnDeadline) {
        resetTurn(other(turn), '30 секунд закончились. Ход переходит сопернику.');
        emitState(true);
      } else emitState();
      return;
    }

    if (phase !== 'moving') return;
    const dt = (TICK_MS / 1000) / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i += 1) simulateStep(dt);

    emitState();
    if (allStopped(balls)) settleShot();
  }

  const physicsTimer = setInterval(simulate, TICK_MS);

  return {
    id: roomId,
    gameId: 'pool',
    playerSocketIds: [bySlot.a.socketId, bySlot.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() { clearInterval(physicsTimer); },
  };
}
