// Подкидной дурак, 36 карт. Все правила и карты хранятся на сервере.
const GAME_ID = 'durak';
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const other = (seat) => seat === 'a' ? 'b' : 'a';
const nameOf = (name) => typeof name === 'string' ? name.trim().slice(0, 28) || 'Игрок' : 'Игрок';

function shuffledDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 6; rank <= 14; rank++) deck.push({ id: `${suit}-${rank}`, suit, rank });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function beats(card, attack, trump) {
  if (card.suit === attack.suit) return card.rank > attack.rank;
  return card.suit === trump && attack.suit !== trump;
}

function sortedHand(cards, trump) {
  return [...cards].sort((a, b) => (a.suit === trump) - (b.suit === trump) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank);
}

export function createDurakRoom({ roomId, players, io, onFinish }) {
  const bySeat = {
    a: { socketId: players[0].socketId, name: nameOf(players[0].name) },
    b: { socketId: players[1].socketId, name: nameOf(players[1].name) },
  };
  const deck = shuffledDeck();
  const hands = { a: [], b: [] };
  for (let i = 0; i < 6; i++) {
    hands.a.push(deck.pop());
    hands.b.push(deck.pop());
  }
  // Нижняя карта колоды показывает козырь и берётся последней.
  const trumpCard = { ...deck[0] };
  const trump = trumpCard.suit;
  const lowestTrump = (seat) => Math.min(...hands[seat].filter((card) => card.suit === trump).map((card) => card.rank), Infinity);
  let attacker = lowestTrump('a') === lowestTrump('b')
    ? (Math.random() < 0.5 ? 'a' : 'b')
    : lowestTrump('a') < lowestTrump('b') ? 'a' : 'b';
  let defender = other(attacker);
  let attackLimit = Math.min(6, hands[defender].length);
  let table = [];
  let phase = 'battle'; // battle или pickup (защитник решил взять)
  let status = 'playing';
  let result = null;
  let discardCount = 0;
  let boutId = 1;
  let revision = 0;
  let eventText = 'Козырь открыт. Первым ходит игрок с младшим козырем.';
  let destroyed = false;
  let didFinish = false;

  function seatFor(socketId) {
    if (socketId === bySeat.a.socketId) return 'a';
    if (socketId === bySeat.b.socketId) return 'b';
    return null;
  }

  const isCovered = () => table.length > 0 && table.every((pair) => pair.defense);
  const openIndices = () => table.flatMap((pair, i) => pair.defense ? [] : [i]);

  function possibleAttacks() {
    if (table.length >= attackLimit) return [];
    const ranks = new Set(table.flatMap((pair) => [pair.attack.rank, pair.defense?.rank].filter(Boolean)));
    return hands[attacker].filter((card) => table.length === 0 || ranks.has(card.rank)).map((card) => card.id);
  }

  function possibleDefenses() {
    const targets = openIndices();
    const choices = {};
    for (const card of hands[defender]) {
      const indices = targets.filter((i) => beats(card, table[i].attack, trump));
      if (indices.length) choices[card.id] = indices;
    }
    return choices;
  }

  function snapshot(socketId) {
    const seat = seatFor(socketId);
    const mine = seat === attacker;
    const open = openIndices();
    return {
      gameId: GAME_ID,
      roomId,
      playerSeat: seat,
      opponentSeat: other(seat),
      players: { a: { name: bySeat.a.name }, b: { name: bySeat.b.name } },
      status, result,
      hand: sortedHand(hands[seat], trump),
      handCounts: { a: hands.a.length, b: hands.b.length },
      table: table.map((pair) => ({ attack: { ...pair.attack }, defense: pair.defense ? { ...pair.defense } : null })),
      trump, trumpCard,
      stockCount: deck.length, discardCount,
      attacker, defender, phase, attackLimit,
      boutId, revision, eventText,
      legalAttacks: status === 'playing' && mine ? possibleAttacks() : [],
      legalDefenses: status === 'playing' && !mine && phase === 'battle' ? possibleDefenses() : {},
      canTake: status === 'playing' && !mine && phase === 'battle' && open.length > 0,
      canBeat: status === 'playing' && mine && phase === 'battle' && isCovered(),
      canFinishPickup: status === 'playing' && mine && phase === 'pickup',
    };
  }

  function emitState() {
    if (destroyed) return;
    io.to(bySeat.a.socketId).emit('game:state', snapshot(bySeat.a.socketId));
    io.to(bySeat.b.socketId).emit('game:state', snapshot(bySeat.b.socketId));
  }

  function error(socketId, text) {
    io.to(socketId).emit('game:error', { gameId: GAME_ID, roomId, message: text });
  }

  function finish(winner, type, message) {
    if (status !== 'playing' || destroyed) return;
    status = 'finished';
    result = { winner, loser: winner ? other(winner) : null, type, message };
    revision++;
    emitState();
    if (!didFinish) {
      didFinish = true;
      onFinish?.({ roomId, players: Object.values(bySeat) });
    }
  }

  function refill(seat) {
    while (hands[seat].length < 6 && deck.length > 0) hands[seat].push(deck.pop());
  }

  function endBout(taken) {
    const previousAttacker = attacker;
    const previousDefender = defender;
    if (taken) {
      for (const pair of table) {
        hands[previousDefender].push(pair.attack);
        if (pair.defense) hands[previousDefender].push(pair.defense);
      }
    } else {
      discardCount += table.reduce((sum, pair) => sum + (pair.defense ? 2 : 1), 0);
    }
    // Добирать карты всегда начинает атакующий, затем защищающийся.
    refill(previousAttacker);
    refill(previousDefender);
    table = [];
    phase = 'battle';
    revision++;

    if (deck.length === 0 && (!hands.a.length || !hands.b.length)) {
      if (!hands.a.length && !hands.b.length) {
        finish(null, 'draw', 'Оба игрока вышли без карт. Ничья!');
      } else {
        const winner = hands.a.length === 0 ? 'a' : 'b';
        finish(winner, 'cards', `${bySeat[winner].name} избавился от всех карт. ${bySeat[other(winner)].name} — дурак!`);
      }
      return;
    }

    attacker = taken ? previousAttacker : previousDefender;
    defender = other(attacker);
    attackLimit = Math.min(6, hands[defender].length);
    boutId++;
    eventText = taken
      ? `${bySeat[previousDefender].name} забрал карты. Снова ходит ${bySeat[attacker].name}.`
      : `Бито! Теперь ходит ${bySeat[attacker].name}.`;
    emitState();
  }

  function attack(socketId, cardId) {
    const seat = seatFor(socketId);
    if (seat !== attacker) return;
    const allowed = possibleAttacks();
    if (!allowed.includes(cardId)) { error(socketId, 'Эту карту сейчас нельзя подкинуть.'); return; }
    const index = hands[attacker].findIndex((card) => card.id === cardId);
    const [card] = hands[attacker].splice(index, 1);
    table.push({ attack: card, defense: null });
    revision++;
    eventText = `${bySeat[attacker].name} ${table.length === 1 ? 'атакует' : 'подкидывает'} карту.`;
    if (phase === 'pickup' && !possibleAttacks().length) {
      endBout(true);
    } else {
      emitState();
    }
  }

  function defend(socketId, cardId, target) {
    const seat = seatFor(socketId);
    if (seat !== defender || phase !== 'battle') return;
    const options = possibleDefenses();
    if (!options[cardId]?.includes(target)) {
      error(socketId, 'Этой картой нельзя отбить выбранную карту.');
      return;
    }
    const index = hands[defender].findIndex((card) => card.id === cardId);
    const [card] = hands[defender].splice(index, 1);
    table[target].defense = card;
    revision++;
    eventText = `${bySeat[defender].name} отбил карту.`;
    if (isCovered() && possibleAttacks().length === 0) {
      endBout(false);
    } else {
      emitState();
    }
  }

  function handleAction(socketId, action = {}) {
    const seat = seatFor(socketId);
    if (!seat || status !== 'playing' || !action || typeof action !== 'object') return;
    // Старые нажатия из уже закончившегося раунда не должны попадать в новый.
    if (action.boutId !== boutId) return;
    if (action.type === 'attack') attack(socketId, action.cardId);
    else if (action.type === 'defend') defend(socketId, action.cardId, action.target);
    else if (action.type === 'take' && seat === defender && phase === 'battle' && openIndices().length) {
      phase = 'pickup';
      revision++;
      eventText = `${bySeat[defender].name} берёт карты. Атакующий может подкинуть ещё.`;
      if (!possibleAttacks().length) endBout(true);
      else emitState();
    } else if (action.type === 'beat' && seat === attacker && phase === 'battle' && isCovered()) {
      endBout(false);
    } else if (action.type === 'finishPickup' && seat === attacker && phase === 'pickup') {
      endBout(true);
    } else if (action.type === 'resign') {
      finish(other(seat), 'resign', `${bySeat[seat].name} сдался.`);
    }
  }

  function handleDisconnect(socketId) {
    const seat = seatFor(socketId);
    if (seat && status === 'playing') finish(other(seat), 'disconnect', 'Соперник отключился.');
  }

  return {
    playerSocketIds: [bySeat.a.socketId, bySeat.b.socketId],
    emitState,
    handleAction,
    handleDisconnect,
    destroy() { destroyed = true; },
  };
}
