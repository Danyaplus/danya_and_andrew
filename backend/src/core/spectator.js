// An explicit allowlist prevents leaking private hands, decks and secret actions.
export const spectatableGameIds = new Set(['chess', 'checkers', 'reversi', 'tic-tac-toe', 'gomoku', 'domino']);

export function publicSpectatorSnapshot(state) {
  if (!state || !spectatableGameIds.has(state.gameId)) return null;
  const base = {
    gameId: state.gameId, roomId: state.roomId,
    players: state.players, turn: state.turn, status: state.status,
    result: state.result, lastMove: state.lastMove,
  };
  if (state.gameId === 'domino') {
    return { ...base,
      chain: state.chain, ends: state.ends, moveNumber: state.moveNumber,
      handCounts: state.handCounts, boneyardCount: state.boneyardCount,
      playHistory: state.playHistory,
    };
  }
  return { ...base, board: state.board,
    ...(state.gameId === 'reversi' ? { scores: state.scores, moveNumber: state.moveNumber } : {}),
    ...(state.gameId === 'gomoku' ? { boardSize: state.boardSize, winLength: state.winLength } : {}),
    ...(state.gameId === 'tic-tac-toe' ? { marks: state.marks } : {}),
    ...(state.gameId === 'chess' || state.gameId === 'checkers' ? { clocks: state.clocks } : {}),
  };
}
