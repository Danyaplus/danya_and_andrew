import { authTokenKey, serverUrl } from './socket.js';

function authHeader() {
  const token = localStorage.getItem(authTokenKey);
  if (!token) throw new Error('AUTH_REQUIRED');
  return { Authorization: `Bearer ${token}` };
}

async function mediaRequest(path, options = {}) {
  const response = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers: { ...authHeader(), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

export async function uploadDmMedia(friendId, blob, kind) {
  const mime = (blob.type || '').split(';')[0] || 'application/octet-stream';
  const query = new URLSearchParams({ friendId, kind });
  const response = await mediaRequest(`/api/dm/media?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: blob,
  });
  return response.json();
}

export async function downloadDmMedia(messageId, signal) {
  const response = await mediaRequest(`/api/dm/media/${encodeURIComponent(messageId)}`, { signal });
  return response.blob();
}
