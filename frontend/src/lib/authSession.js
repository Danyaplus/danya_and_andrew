import { authTokenKey } from './socket.js';

// localStorage already persists between normal Chrome tabs. IndexedDB is a
// second same-origin copy for mobile browsers that occasionally evict one store.
// Neither store can survive private-mode cleanup or switching to another host.
const DATABASE = 'kodumi-device-auth';
const STORE = 'sessions';
const KEY = 'current';
const LOGOUT_MARKER = 'kodumi-explicit-logout';

// Process same-tab writes in order: a pending backup must never resurrect an
// older login after the user explicitly signed out and logged in again.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

let pendingBackupWrite = Promise.resolve();

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function storedToken(operation, value) {
  const db = await openDatabase();
  if (!db) return '';
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, operation === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore(STORE);
      const req = operation === 'get' ? store.get(KEY)
        : operation === 'put' ? store.put(value, KEY) : store.delete(KEY);
      req.onsuccess = () => resolve(req.result || '');
      req.onerror = () => resolve('');
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    } catch { db.close(); resolve(''); }
  });
}

export function readLocalAuthToken() {
  try { return localStorage.getItem(authTokenKey) || ''; }
  catch { return ''; }
}

export async function recoverSavedAuthToken() {
  const current = readLocalAuthToken();
  if (current) return current;
  // A deliberate logout MUST NOT restore a stale IndexedDB backup.
  if (localStorage.getItem(LOGOUT_MARKER) === '1') return '';
  await pendingBackupWrite;
  if (localStorage.getItem(LOGOUT_MARKER) === '1') return '';
  const backedUp = await storedToken('get');
  if (backedUp && localStorage.getItem(LOGOUT_MARKER) !== '1') {
    localStorage.setItem(authTokenKey, backedUp);
    return backedUp;
  }
  return '';
}

export function saveAuthToken(token) {
  localStorage.removeItem(LOGOUT_MARKER);
  localStorage.setItem(authTokenKey, token);
  pendingBackupWrite = pendingBackupWrite.then(() => storedToken('put', token));
}

export function clearAuthToken() {
  // Synchronous marker makes concurrent backup writes harmless after logout.
  localStorage.setItem(LOGOUT_MARKER, '1');
  localStorage.removeItem(authTokenKey);
  pendingBackupWrite = pendingBackupWrite.then(() => storedToken('delete')); 
}
