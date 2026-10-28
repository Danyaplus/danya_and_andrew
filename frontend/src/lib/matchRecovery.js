// Match resume token belongs to THIS browser tab, not to all tabs of an account.
// sessionStorage survives reloads, while a new independent tab cannot hijack a match.
const STORAGE_KEY = 'kodumi-active-match-v1';

export function readMatchSession(gameId = null) {
  try {
    const session = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!session || typeof session.roomId !== 'string' || typeof session.resumeToken !== 'string'
      || typeof session.gameId !== 'string') return null;
    if (gameId && session.gameId !== gameId) return null;
    return session;
  } catch { return null; }
}

export function saveMatchSession(data) {
  if (!data?.roomId || !data?.gameId || !data?.resumeToken) return;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    roomId: data.roomId, gameId: data.gameId, resumeToken: data.resumeToken,
  })); } catch { /* Storage can be blocked; live socket keeps working. */ }
}

export function clearMatchSession(roomId = null) {
  try {
    const existing = readMatchSession();
    if (!roomId || !existing || existing.roomId === roomId) sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* no session storage */ }
}

export function requestMatchResume(socket, gameId) {
  const session = readMatchSession(gameId);
  if (!session || !socket.connected) return false;
  socket.emit('match:resume:request', session);
  return true;
}
