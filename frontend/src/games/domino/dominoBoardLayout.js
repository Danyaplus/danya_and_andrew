// The board is measured in percent of its square width. These dimensions
// match the .do-tile--chain CSS (face + padding + border) exactly.
export const BOARD_SHORT = 4.1;
export const BOARD_LONG = 7.7;
const GAP = 0.34;
const MIN = 3.6;
const MAX = 96.4;
const NEXT = { right: 'up', up: 'left', left: 'down', down: 'right' };

function rectFor(tile, dir) {
  const horizontalPath = dir === 'right' || dir === 'left';
  const horizontalTile = tile.isDouble ? !horizontalPath : horizontalPath;
  return {
    width: horizontalTile ? BOARD_LONG : BOARD_SHORT,
    height: horizontalTile ? BOARD_SHORT : BOARD_LONG,
    orientation: horizontalTile ? 'horizontal' : 'vertical',
  };
}

function bounds(p) {
  return { l: p.x - p.width / 2, r: p.x + p.width / 2,
    t: p.y - p.height / 2, b: p.y + p.height / 2 };
}

function straight(prev, tile, dir) {
  const { width, height, orientation } = rectFor(tile, dir);
  const b = bounds(prev);
  let x = prev.x;
  let y = prev.y;
  if (dir === 'right') x = b.r + GAP + width / 2;
  if (dir === 'left') x = b.l - GAP - width / 2;
  if (dir === 'up') y = b.t - GAP - height / 2;
  if (dir === 'down') y = b.b + GAP + height / 2;
  return { x, y, width, height, orientation };
}

// At a corner the next tile really touches the previous tile's end:
// right -> up, up -> left, left -> down, down -> right.
function corner(prev, tile, previousDirection) {
  const dir = NEXT[previousDirection];
  const { width, height, orientation } = rectFor(tile, dir);
  const b = bounds(prev);
  let x = prev.x;
  let y = prev.y;
  if (previousDirection === 'right') {
    x = Math.min(b.r - width / 2, MAX - BOARD_LONG / 2);
    y = b.t - GAP - height / 2;
  } else if (previousDirection === 'up') {
    x = b.l - GAP - width / 2;
    y = Math.max(b.t + height / 2, MIN + BOARD_LONG / 2);
  } else if (previousDirection === 'left') {
    x = Math.max(b.l + width / 2, MIN + BOARD_LONG / 2);
    y = b.b + GAP + height / 2;
  } else {
    x = b.r + GAP + width / 2;
    y = Math.min(b.b - height / 2, MAX - BOARD_LONG / 2);
  }
  return { x, y, width, height, orientation };
}

function within(p) {
  const b = bounds(p);
  return b.l >= MIN && b.r <= MAX && b.t >= MIN && b.b <= MAX;
}

function blocksFutureDoubles(candidate, history, index, dir) {
  let prev = candidate;
  for (let j = index + 1; j < history.length && history[j].isDouble; j += 1) {
    prev = straight(prev, history[j], dir);
    if (!within(prev)) return true;
  }
  return false;
}

function valuesFacingOut(item, dir) {
  // The inner half must meet the matching half already on the board.
  const inner = item.side === 'left' ? item.right : item.left;
  const outer = item.side === 'left' ? item.left : item.right;
  return dir === 'right' || dir === 'down'
    ? { a: inner, b: outer }
    : { a: outer, b: inner };
}

function layoutArm(first, history, side) {
  const placed = [];
  let prev = first;
  let direction = side === 'right' ? 'right' : 'left';
  for (let i = 0; i < history.length; i += 1) {
    const item = history[i];
    let position = straight(prev, item, direction);
    // Never turn a double at the border. If a run of doubles follows a
    // normal tile, start the corner at that normal tile instead.
    if (!item.isDouble && (!within(position) || blocksFutureDoubles(position, history, i, direction))) {
      position = corner(prev, item, direction);
      direction = NEXT[direction];
    }
    if (!within(position)) {
      // A fallback for a run that reaches the border without a normal tile.
      // Normal double-six sets leave enough room to avoid this situation.
      position = corner(prev, item, direction);
      direction = NEXT[direction];
    }
    placed.push({
      key: `${item.id}-${item.moveNumber}`,
      id: item.id,
      ...position,
      ...valuesFacingOut(item, direction),
      isDouble: item.isDouble,
      side,
      direction,
    });
    prev = position;
  }
  return placed;
}

export function dominoBoardLayout(history = [], lastMove = null) {
  if (!history.length) return [];
  const first = history[0];
  const firstTile = rectFor(first, 'right');
  const middle = {
    key: `${first.id}-${first.moveNumber}`,
    id: first.id,
    x: 50, y: 50,
    ...firstTile,
    a: first.left, b: first.right,
    isDouble: first.isDouble,
    side: 'start', direction: 'right',
  };
  const left = layoutArm(middle, history.filter((item) => item.side === 'left'), 'left');
  const right = layoutArm(middle, history.filter((item) => item.side === 'right'), 'right');
  return [middle, ...left, ...right].map((piece) => ({
    ...piece,
    last: lastMove?.type === 'play' && lastMove.id === piece.id,
  }));
}
