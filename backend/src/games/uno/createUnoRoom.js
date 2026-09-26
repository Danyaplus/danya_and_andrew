const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_LABELS = {
  red: 'красный',
  yellow: 'жёлтый',
  green: 'зелёный',
  blue: 'синий',
};

function opposite(player) {
  return player === 'a' ? 'b' : 'a';
}

function safePlayerName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const trimmed = value.trim().slice(0, 28);
  return trimmed || 'Игрок';
}

function createCard(id, color, type, value = null) {
  return { id, color, type, value };
}

function createDeck() {
  let id = 1;
  const deck = [];

  for (const color of COLORS) {
    deck.push(createCard(`c${id++}`, color, 'number', 0));
    for (let number = 1; number <= 9; number += 1) {
      deck.push(createCard(`c${id++}`, color, 'number', number));
      deck.push(createCard(`c${id++}`, color, 'number', number));
    }

    for (let copy = 0; copy < 2; copy += 1) {
      deck.push(createCard(`c${id++}`, color, 'skip'));
      deck.push(createCard(`c${id++}`, color, 'reverse'));
      deck.push(createCard(`c${id++}`, color, 'draw2'));
    }
  }

  for (let copy = 0; copy < 4; copy += 1) {
    deck.push(createCard(`c${id++}`, null, 'wild'));
    deck.push(createCard(`c${id++}`, null, 'wild4'));
  }

  return deck;
}

function shuffle(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function publicCard(card) {
  if (!card) return null;
  return {
    id: card.id,
    color: card.color,
    type: card.type,
    value: card.value,
  };
}

function sameSymbol(a, b) {
  if (!a || !b) return false;
  if (a.type === 'number' && b.type === 'number') return a.value === b.value;
  return a.type !== 'number' && a.type === b.type && !['wild', 'wild4'].includes(a.type);
}

function canPlayCard(card, topCard, currentColor, hand) {
  if (!card || !topCard) return false;
  if (card.type === 'wild') return true;

  if (card.type === 'wild4') {
    // Wild Draw Four is legal only if the player has no card matching current color.
    return !hand.some((other) => other.id !== card.id && other.color === currentColor);
  }

  return card.color === currentColor || sameSymbol(card, topCard);
}

function canPhysicallyPlace(card, topCard, currentColor) {
  if (!card || !topCard) return false;
  if (card.type === 'wild' || card.type === 'wild4') return true;
  return card.color === currentColor || sameSymbol(card, topCard);
}

function createInitialGame(players) {
  let drawPile = shuffle(createDeck());
  const hands = { a: [], b: [] };

  for (let i = 0; i < 7; i += 1) {
    hands.a.push(drawPile.pop());
    hands.b.push(drawPile.pop());
  }

  // Classic setup: do not start with a Wild Draw Four. Wild is also redrawn here
  // so a match can begin immediately without an extra pre-game color picker.
  let starter = drawPile.pop();
  while (starter && (starter.type === 'wild' || starter.type === 'wild4')) {
    drawPile.unshift(starter);
    drawPile = shuffle(drawPile);
    starter = drawPile.pop();
  }

  const first = Math.random() < 0.5 ? 'a' : 'b';
  let turn = first;

  if (starter?.type === 'skip' || starter?.type === 'reverse') {
    turn = opposite(first);
  } else if (starter?.type === 'draw2') {
    hands[first].push(drawPile.pop(), drawPile.pop());
    turn = opposite(first);
  }

  return {
    drawPile,
    discardPile: [starter],
    hands,
    turn,
    currentColor: starter.color,
  };
}

export function createUnoRoom({ roomId, players, io, onFinish }) {
  const shuffledPlayers = Math.random() < 0.5 ? players : [...players].reverse();
  const bySeat = {
    a: { socketId: shuffledPlayers[0].socketId, name: safePlayerName(shuffledPlayers[0].name) },
    b: { socketId: shuffledPlayers[1].socketId, name: safePlayerName(shuffledPlayers[1].name) },
  };

  const initial = createInitialGame(players);
  let drawPile = initial.drawPile;
  const discardPile = initial.discardPile;
  const hands = initial.hands;
  let turn = initial.turn;
  let currentColor = initial.currentColor;
  let status = 'playing';
  let result = null;
  let lastAction = null;
  let drawnCardId = null;
  let unoArmed = null;
  let unoVulnerable = null;
  let challenge = null;
  let finishedOnce = false;

  function seatForSocket(socketId) {
    if (bySeat.a.socketId === socketId) return 'a';
    if (bySeat.b.socketId === socketId) return 'b';
    return null;
  }

  function topCard() {
    return discardPile[discardPile.length - 1];
  }

  function replenishDrawPile() {
    if (drawPile.length > 0 || discardPile.length <= 1) return;
    const top = discardPile.pop();
    drawPile = shuffle(discardPile.splice(0));
    discardPile.push(top);
  }

  function drawCards(seat, amount) {
    for (let i = 0; i < amount; i += 1) {
      replenishDrawPile();
      const card = drawPile.pop();
      if (!card) break;
      hands[seat].push(card);
    }
  }

  function finish(nextResult) {
    if (status === 'finished') return;
    status = 'finished';
    result = nextResult;
    challenge = null;
    drawnCardId = null;
    unoArmed = null;
    unoVulnerable = null;
    emitState();

    if (!finishedOnce) {
      finishedOnce = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function maybeExpireUnoCatch(actor) {
    if (unoVulnerable && unoVulnerable !== actor) {
      unoVulnerable = null;
    }
  }

  function playableIdsFor(seat) {
    if (status !== 'playing' || turn !== seat || challenge) return [];
    const hand = hands[seat];
    if (drawnCardId) {
      const drawn = hand.find((card) => card.id === drawnCardId);
      return drawn && canPhysicallyPlace(drawn, topCard(), currentColor) ? [drawn.id] : [];
    }
    return hand
      .filter((card) => canPhysicallyPlace(card, topCard(), currentColor))
      .map((card) => card.id);
  }

  function snapshotFor(socketId) {
    const playerSeat = seatForSocket(socketId);
    const opponentSeat = opposite(playerSeat);
    const pendingChallenge = challenge && challenge.victim === playerSeat
      ? {
          active: true,
          offenderName: bySeat[challenge.offender].name,
          chosenColor: challenge.chosenColor,
        }
      : null;

    return {
      gameId: 'uno',
      roomId,
      playerSeat,
      opponentSeat,
      players: {
        a: { name: bySeat.a.name, cardCount: hands.a.length },
        b: { name: bySeat.b.name, cardCount: hands.b.length },
      },
      hand: hands[playerSeat].map(publicCard),
      opponentCardCount: hands[opponentSeat].length,
      topCard: publicCard(topCard()),
      discardCount: discardPile.length,
      drawCount: drawPile.length,
      currentColor,
      turn,
      status,
      result,
      lastAction,
      drawnCardId: turn === playerSeat ? drawnCardId : null,
      playableCardIds: playableIdsFor(playerSeat),
      unoVulnerable,
      canCatchUno: Boolean(unoVulnerable && unoVulnerable === opponentSeat),
      canCallUno: status === 'playing' && (hands[playerSeat].length === 2 || unoVulnerable === playerSeat),
      challenge: pendingChallenge,
    };
  }

  function emitState() {
    for (const seat of ['a', 'b']) {
      const player = bySeat[seat];
      io.to(player.socketId).emit('game:state', snapshotFor(player.socketId));
    }
  }

  function emitError(socketId, message) {
    io.to(socketId).emit('game:error', { gameId: 'uno', roomId, message });
  }

  function nextTurnAfterNormalPlay(seat, card) {
    if (card.type === 'skip' || card.type === 'reverse') {
      // Official two-player rule: both work like a Skip, so the same player goes again.
      turn = seat;
      return;
    }

    if (card.type === 'draw2') {
      const victim = opposite(seat);
      drawCards(victim, 2);
      turn = seat;
      lastAction = {
        type: 'draw2',
        actor: seat,
        target: victim,
        message: `${bySeat[victim].name} берёт 2 карты.`,
      };
      return;
    }

    turn = opposite(seat);
  }

  function handlePlay(socketId, payload = {}) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat || turn !== seat) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }
    if (challenge) {
      emitError(socketId, 'Сначала нужно решить спор по Wild +4.');
      return;
    }

    maybeExpireUnoCatch(seat);

    const index = hands[seat].findIndex((card) => card.id === payload.cardId);
    if (index < 0) return;
    const card = hands[seat][index];

    if (drawnCardId && card.id !== drawnCardId) {
      emitError(socketId, 'После добора можно сыграть только только что взятую карту.');
      return;
    }

    if (!canPhysicallyPlace(card, topCard(), currentColor)) {
      emitError(socketId, 'Эта карта сейчас не подходит.');
      return;
    }

    const previousColor = currentColor;
    const hadMatchingColor = hands[seat].some((other) => other.id !== card.id && other.color === previousColor);

    if ((card.type === 'wild' || card.type === 'wild4') && !COLORS.includes(payload.chosenColor)) {
      emitError(socketId, 'Выбери цвет после Wild-карты.');
      return;
    }

    hands[seat].splice(index, 1);
    discardPile.push(card);
    drawnCardId = null;
    currentColor = card.color || payload.chosenColor;

    const hadUnoArmed = unoArmed === seat;
    unoArmed = null;
    if (hands[seat].length === 1) {
      unoVulnerable = hadUnoArmed ? null : seat;
    } else if (unoVulnerable === seat) {
      unoVulnerable = null;
    }

    lastAction = {
      type: 'play',
      actor: seat,
      card: publicCard(card),
      chosenColor: card.color ? null : currentColor,
      message: `${bySeat[seat].name} сыграл карту.`,
    };

    if (card.type === 'wild4') {
      const victim = opposite(seat);
      challenge = {
        offender: seat,
        victim,
        illegal: hadMatchingColor,
        chosenColor: currentColor,
        offenderWentOut: hands[seat].length === 0,
      };
      turn = victim;
      emitState();
      return;
    }

    if (card.type === 'draw2') {
      const victim = opposite(seat);
      drawCards(victim, 2);
      if (hands[seat].length === 0) {
        finish({ type: 'win', winner: seat, message: 'Все карты закончились.' });
        return;
      }
      turn = seat;
      lastAction = {
        type: 'draw2',
        actor: seat,
        target: victim,
        card: publicCard(card),
        message: `${bySeat[victim].name} берёт 2 карты и пропускает ход.`,
      };
      emitState();
      return;
    }

    if (hands[seat].length === 0) {
      finish({ type: 'win', winner: seat, message: 'Все карты закончились.' });
      return;
    }

    nextTurnAfterNormalPlay(seat, card);
    emitState();
  }

  function handleDraw(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat || turn !== seat) {
      emitError(socketId, 'Сейчас ход соперника.');
      return;
    }
    if (challenge) {
      emitError(socketId, 'Сначала нужно решить спор по Wild +4.');
      return;
    }
    if (drawnCardId) {
      emitError(socketId, 'Ты уже взял карту в этом ходу.');
      return;
    }

    maybeExpireUnoCatch(seat);
    drawCards(seat, 1);
    const drawn = hands[seat][hands[seat].length - 1];
    if (!drawn) return;

    lastAction = {
      type: 'draw',
      actor: seat,
      message: `${bySeat[seat].name} берёт карту.`,
    };

    if (canPhysicallyPlace(drawn, topCard(), currentColor)) {
      drawnCardId = drawn.id;
      emitState();
      return;
    }

    turn = opposite(seat);
    drawnCardId = null;
    emitState();
  }

  function handlePass(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat || turn !== seat || challenge) return;
    if (!drawnCardId) {
      emitError(socketId, 'Пропустить можно после добора карты.');
      return;
    }
    maybeExpireUnoCatch(seat);
    drawnCardId = null;
    turn = opposite(seat);
    lastAction = { type: 'pass', actor: seat, message: `${bySeat[seat].name} завершает ход.` };
    emitState();
  }

  function handleCallUno(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;

    if (hands[seat].length === 2 && turn === seat) {
      unoArmed = seat;
      lastAction = { type: 'uno', actor: seat, message: `${bySeat[seat].name}: UNO!` };
      emitState();
      return;
    }

    if (hands[seat].length === 1 && unoVulnerable === seat) {
      unoVulnerable = null;
      lastAction = { type: 'uno', actor: seat, message: `${bySeat[seat].name}: UNO!` };
      emitState();
      return;
    }

    emitError(socketId, 'UNO нужно объявлять, когда у тебя остаётся одна карта.');
  }

  function handleCatchUno(socketId) {
    if (status !== 'playing') return;
    const catcher = seatForSocket(socketId);
    if (!catcher) return;
    const target = opposite(catcher);
    if (unoVulnerable !== target || hands[target].length !== 1) {
      emitError(socketId, 'Сейчас некого ловить на UNO.');
      return;
    }

    drawCards(target, 2);
    unoVulnerable = null;
    lastAction = {
      type: 'uno-penalty',
      actor: catcher,
      target,
      message: `${bySeat[target].name} забыл сказать UNO и берёт 2 карты.`,
    };
    emitState();
  }

  function resolveChallenge(socketId, shouldChallenge) {
    if (status !== 'playing' || !challenge) return;
    const seat = seatForSocket(socketId);
    if (!seat || challenge.victim !== seat) return;

    const pending = challenge;
    challenge = null;
    const { offender, victim, offenderWentOut } = pending;

    if (!shouldChallenge) {
      drawCards(victim, 4);
      turn = offender;
      lastAction = {
        type: 'wild4-accepted',
        actor: offender,
        target: victim,
        message: `${bySeat[victim].name} берёт 4 карты.`,
      };
      if (offenderWentOut) {
        finish({ type: 'win', winner: offender, message: 'Все карты закончились.' });
        return;
      }
      emitState();
      return;
    }

    if (pending.illegal) {
      drawCards(offender, 4);
      turn = victim;
      lastAction = {
        type: 'wild4-challenge-won',
        actor: victim,
        target: offender,
        message: `Оспаривание успешно: ${bySeat[offender].name} берёт 4 карты.`,
      };
      emitState();
      return;
    }

    drawCards(victim, 6);
    turn = offender;
    lastAction = {
      type: 'wild4-challenge-lost',
      actor: victim,
      target: victim,
      message: `Оспаривание не удалось: ${bySeat[victim].name} берёт 6 карт.`,
    };
    if (offenderWentOut) {
      finish({ type: 'win', winner: offender, message: 'Все карты закончились.' });
      return;
    }
    emitState();
  }

  function handleResign(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({ type: 'resign', winner: opposite(seat), message: `${bySeat[seat].name} сдался.` });
  }

  function handleAction(socketId, action = {}) {
    if (action.type === 'play') handlePlay(socketId, action.payload);
    if (action.type === 'draw') handleDraw(socketId);
    if (action.type === 'pass') handlePass(socketId);
    if (action.type === 'call-uno') handleCallUno(socketId);
    if (action.type === 'catch-uno') handleCatchUno(socketId);
    if (action.type === 'accept-wild4') resolveChallenge(socketId, false);
    if (action.type === 'challenge-wild4') resolveChallenge(socketId, true);
    if (action.type === 'resign') handleResign(socketId);
  }

  function handleDisconnect(socketId) {
    if (status !== 'playing') return;
    const seat = seatForSocket(socketId);
    if (!seat) return;
    finish({ type: 'disconnect', winner: opposite(seat), message: 'Соперник отключился от игры.' });
  }

  return {
    id: roomId,
    gameId: 'uno',
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() {},
  };
}
