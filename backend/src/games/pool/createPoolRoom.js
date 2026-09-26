const TABLE_W = 1000;
const TABLE_H = 500;
const RAIL = 38;
const BALL_R = 13;
const POCKET_R = 29;
const TURN_MS = 30_000;
const PHYSICS_MS = 16;
const STATE_MS = 48;
const FRICTION = 0.988;
const STOP_SPEED = 7;
const MAX_SPEED = 1180;

const POCKETS = [
  { x: RAIL, y: RAIL },
  { x: TABLE_W / 2, y: RAIL - 2 },
  { x: TABLE_W - RAIL, y: RAIL },
  { x: RAIL, y: TABLE_H - RAIL },
  { x: TABLE_W / 2, y: TABLE_H - RAIL + 2 },
  { x: TABLE_W - RAIL, y: TABLE_H - RAIL },
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
  // WPA-style 8-ball rack: 8 in the middle; one solid and one stripe in rear corners.
  const spots = new Array(15).fill(null);
  spots[4] = 8; // row 3 center in our flattened triangle.

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
  const dx = Math.sqrt(3) * BALL_R + 0.8;
  const dy = BALL_R * 2 + 0.6;

  for (let row = 0; row < 5; row += 1) {
    const x = apexX + row * dx;
    for (let col = 0; col <= row; col += 1) {
      positions.push({
        x,
        y: centerY + (col - row / 2) * dy,
      });
    }
  }
  return positions;
}

function createBalls() {
  const balls = [{
    id: 'cue', number: 0, group: 'cue', x: 260, y: TABLE_H / 2, vx: 0, vy: 0, pocketed: false,
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
  return balls.every((ball) => ball.pocketed || (Math.abs(ball.vx) < STOP_SPEED && Math.abs(ball.vy) < STOP_SPEED));
}

function countRemaining(balls, group) {
  return balls.filter((ball) => !ball.pocketed && ball.group === group).length;
}

function findSafeCueSpot(balls) {
  const candidates = [
    { x: 260, y: 250 }, { x: 220, y: 200 }, { x: 220, y: 300 },
    { x: 300, y: 180 }, { x: 300, y: 320 }, { x: 180, y: 250 },
  ];
  for (const pos of candidates) {
    const blocked = balls.some((ball) => !ball.pocketed && ball.group !== 'cue' && distSq(pos.x, pos.y, ball.x, ball.y) < (BALL_R * 2.2) ** 2);
    if (!blocked) return pos;
  }
  return { x: 200, y: 250 };
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
      resetTurn(opponent, cueScratch ? 'На разбивке биток упал в лузу. Ход соперника.' : 'Разбивка завершена. Теперь можно определить группы.');
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
      const first = objectPocketed.map((n) => ({ n, idx: shotPocketed.indexOf(n) })).sort((a, b) => a.idx - b.idx)[0]?.n;
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

    if (cueScratch) {
      resetTurn(opponent, 'Биток попал в лузу. Ход переходит сопернику.');
    } else if (ownPocketed) {
      resetTurn(shooter, 'Есть забитый шар — продолжаешь ход.');
    } else {
      resetTurn(opponent, 'Ничего своего не забито. Ход соперника.');
    }
    emitState(true);
  }

  function snapshotFor(socketId) {
    const playerSlot = slotForSocket(socketId);
    return {
      gameId: 'pool',
      roomId,
      playerSlot,
      players: {
        a: playerPayload('a'),
        b: playerPayload('b'),
      },
      turn,
      phase,
      status,
      result,
      breakShot,
      shotNumber,
      turnMsLeft: phase === 'aiming' && status === 'playing' ? Math.max(0, turnDeadline - Date.now()) : TURN_MS,
      lastAction,
      balls: balls.map((ball) => ({
        number: ball.number,
        group: ball.group,
        x: ball.x,
        y: ball.y,
        pocketed: ball.pocketed,
      })),
      pocketed: pocketedNumbers(),
      table: { width: TABLE_W, height: TABLE_H, rail: RAIL, ballRadius: BALL_R, pockets: POCKETS },
    };
  }

  function emitState(force = false) {
    const now = Date.now();
    if (!force && now - lastStateEmit < STATE_MS) return;
    lastStateEmit = now;
    for (const slot of ['a', 'b']) {
      io.to(bySlot[slot].socketId).emit('game:state', snapshotFor(bySlot[slot].socketId));
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

    const normalizedPower = Math.max(0.18, Math.min(1, power));
    const speed = MAX_SPEED * normalizedPower;
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

  function simulate() {
    if (status !== 'playing') return;

    if (phase === 'aiming') {
      if (Date.now() >= turnDeadline) {
        resetTurn(other(turn), '30 секунд закончились. Ход переходит сопернику.');
        emitState(true);
      } else {
        emitState();
      }
      return;
    }

    if (phase !== 'moving') return;
    const dt = PHYSICS_MS / 1000;

    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      for (const pocket of POCKETS) {
        if (distSq(ball.x, ball.y, pocket.x, pocket.y) <= POCKET_R * POCKET_R) {
          pocketBall(ball);
          break;
        }
      }
      if (ball.pocketed) continue;

      if (ball.x - BALL_R < RAIL) {
        ball.x = RAIL + BALL_R;
        ball.vx = Math.abs(ball.vx) * 0.88;
      } else if (ball.x + BALL_R > TABLE_W - RAIL) {
        ball.x = TABLE_W - RAIL - BALL_R;
        ball.vx = -Math.abs(ball.vx) * 0.88;
      }

      if (ball.y - BALL_R < RAIL) {
        ball.y = RAIL + BALL_R;
        ball.vy = Math.abs(ball.vy) * 0.88;
      } else if (ball.y + BALL_R > TABLE_H - RAIL) {
        ball.y = TABLE_H - RAIL - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.88;
      }
    }

    for (let i = 0; i < balls.length; i += 1) {
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j += 1) {
        const b = balls[j];
        if (b.pocketed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = BALL_R * 2;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0 || d2 >= minDist * minDist) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = minDist - d;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const impulse = -rel * 0.98;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;
        }
      }
    }

    for (const ball of balls) {
      if (ball.pocketed) continue;
      ball.vx *= FRICTION;
      ball.vy *= FRICTION;
      if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
        ball.vx = 0;
        ball.vy = 0;
      }
    }

    emitState();
    if (allStopped(balls)) settleShot();
  }

  const physicsTimer = setInterval(simulate, PHYSICS_MS);

  return {
    id: roomId,
    gameId: 'pool',
    playerSocketIds: [bySlot.a.socketId, bySlot.b.socketId],
    emitState: () => emitState(true),
    handleAction,
    handleDisconnect,
    destroy() {
      clearInterval(physicsTimer);
    },
  };
}
