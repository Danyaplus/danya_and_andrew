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

export async function apiRequest(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${serverUrl}${path}`, {
    method,
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
}
