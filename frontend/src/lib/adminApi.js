// The admin portal MUST use the same backend host as the game client.
// Do not import socket.js: doing so would open a player Socket.IO connection
// from the administrator login screen.
const apiOrigin = (import.meta.env.VITE_SERVER_URL?.trim() || (import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://danya-and-andrew-backend.onrender.com')).replace(/\/$/u, '');

export async function adminRequest(path, { token, body, timeoutMs = 75_000, method } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiOrigin}/api/admin/${path}`, {
      method: method || (body !== undefined ? 'POST' : 'GET'),
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(json?.error || (response.status === 404 ? 'ADMIN_ENDPOINT_MISSING' : `HTTP_${response.status}`));
      error.status = response.status;
      throw error;
    }
    if (!json || typeof json !== 'object' || json.ok === false) throw new Error(json?.error || 'INVALID_SERVER_RESPONSE');
    return json;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('ADMIN_TIMEOUT');
    if (error instanceof TypeError) throw new Error('ADMIN_NETWORK_UNAVAILABLE');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function adminErrorText(error) {
  switch (error?.message) {
    case 'INVALID_CREDENTIALS': return 'Неверный логин или пароль.';
    case 'ADMIN_NOT_CONFIGURED': return 'Админ-доступ не настроен на сервере. Проверь переменные ADMIN_USERNAME и ADMIN_PASSWORD в Render.';
    case 'ADMIN_ENDPOINT_MISSING': return 'На сервере ещё нет API админки. Опубликуй обновлённый backend на Render.';
    case 'ADMIN_DATA_UNAVAILABLE': return 'Не удалось получить данные из базы. Проверь подключение Supabase на сервере.';
    case 'ADMIN_TIMEOUT': return 'Сервер долго не отвечает. Бесплатный Render может просыпаться до минуты — повтори попытку.';
    case 'ADMIN_NETWORK_UNAVAILABLE': return 'Нет связи с игровым сервером. Проверь VITE_SERVER_URL, Render и интернет.';
    case 'ADMIN_AUTH_REQUIRED': return 'Время админской сессии истекло. Войди снова.';
    case 'TOO_MANY_REQUESTS': return 'Слишком много попыток входа. Подожди около 15 минут.';
    default: return error?.status === 429 ? 'Слишком много попыток входа. Подожди 15 минут.' : 'Не удалось выполнить запрос. Проверь подключение к серверу.';
  }
}
