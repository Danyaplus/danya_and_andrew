import { io } from 'socket.io-client';

export const serverUrl = 'https://danya-and-andrew-backend.onrender.com';
export const authTokenKey = 'danya-and-andrew-auth-token';

const initialToken = localStorage.getItem(authTokenKey);

export const socket = io(serverUrl, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  auth: initialToken ? { token: initialToken } : {},
});

export function setSocketAuthToken(token) {
  socket.auth = token ? { token } : {};
  if (socket.connected) {
    if (token) socket.emit('auth:session', { token });
    else socket.emit('auth:logout');
  } else {
    socket.connect();
  }
}

// Render Free can need up to a minute to wake after inactivity. Avoid hanging forever
// when the backend is unavailable or a network request never completes.
export async function apiRequest(path, { token, method = 'GET', body, timeoutMs = 75000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serverUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = new Error(payload?.error || `HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('REQUEST_TIMEOUT');
    if (error instanceof TypeError) throw new Error('SERVER_UNAVAILABLE');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
