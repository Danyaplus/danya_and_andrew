// The admin portal MUST use the same backend host as the game client.
// Do not import socket.js: doing so would open a player Socket.IO connection
// from the administrator login screen.
export const adminServerOrigin = (import.meta.env.VITE_SERVER_URL?.trim() || (import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://danya-and-andrew-backend.onrender.com')).replace(/\/$/u, '');

export async function adminRequest(path, { token, body, timeoutMs = 75_000, method } = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${adminServerOrigin}/api/admin/${path}`, {
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
    case 'CONFIRMATION_REQUIRED': return 'Очистка не подтверждена. Попробуй ещё раз.';
    case 'INVALID_REVIEW': return 'Не удалось подтвердить проверку аккаунта. Обнови список.';
    case 'REVIEW_OUTDATED': return 'Появились новые матчи или проверка устарела. Обнови список и повтори проверку.';
    case 'PRODUCT_IN_USE': return 'Этот товар уже приобретён или входит в набор. Скрыть его с продажи можно кнопкой со значком глаза.';
    case 'CATEGORY_IN_USE': return 'В категории есть товары. Сначала перенеси их в другой раздел.';
    case 'INVALID_CATEGORY': return 'Проверь название и тип категории. В категории могут находиться товары только одного типа.';
    case 'MARKET_MIGRATION_REQUIRED': return 'Не установлена SQL-миграция категорий магазина. Выполни SQL-файл из обновления в Supabase.';
    case 'INVALID_PRODUCT': return 'Проверь название, цену, скидку, состав комплекта и изображение товара.';
    case 'INVALID_IMAGE': return 'Картинка не подходит по формату или размеру. Используй PNG, JPG или WebP.';
    case 'INVALID_CATEGORY': return 'Укажи правильное название и тип категории.';
    case 'CATEGORY_IN_USE': return 'Категория уже содержит товары. Сначала перемести их в другую категорию.';
    case 'PRODUCT_IN_USE': return 'Этот товар уже куплен или входит в набор. Вместо удаления его можно скрыть.';
    case 'SUPPORT_UNAVAILABLE': return 'Центр обращений пока недоступен. Проверь SQL и backend.';
    case 'DIAGNOSTICS_MIGRATION_REQUIRED': return 'Для пометок событий необходимо выполнить SQL-миграцию обновления в Supabase.';
    case 'INVALID_EVENT_REVIEW': return 'Не удалось изменить пометку события. Обнови журнал.';
    case 'EVENT_NOT_FOUND': return 'Событие уже удалено из журнала.';
    case 'DIAGNOSTICS_UNAVAILABLE': return 'Журнал ошибок пока недоступен. Проверь SQL.';
    case 'MARKET_UNAVAILABLE': return 'Новый магазин пока недоступен. Проверь SQL-мigration и backend.';
    case 'INVALID_CREDENTIALS': return 'Неверный логин или пароль.';
    case 'ADMIN_NOT_CONFIGURED': return 'Админ-доступ не настроен на сервере. Проверь переменные ADMIN_USERNAME и ADMIN_PASSWORD в Render.';
    case 'ADMIN_ENDPOINT_MISSING': return 'На сервере ещё нет API админки. Опубликуй обновлённый backend на Render.';
    case 'ADMIN_INSIGHTS_UNAVAILABLE': return 'Новые данные пока недоступны. Установи SQL-миграцию истории монет и матчей в Supabase и обнови backend.';
    case 'ADMIN_DATA_UNAVAILABLE': return 'Не удалось получить данные из базы. Проверь подключение Supabase на сервере.';
    case 'ADMIN_TIMEOUT': return 'Сервер долго не отвечает. Бесплатный Render может просыпаться до минуты — повтори попытку.';
    case 'ADMIN_NETWORK_UNAVAILABLE': return 'Нет связи с игровым сервером. Проверь VITE_SERVER_URL, Render и интернет.';
    case 'ADMIN_MODERATION_NOT_CONFIGURED': return 'Сначала выполни SQL-миграцию модерации в Supabase и перезапусти backend.';
    case 'INVALID_BAN_DATES': return 'Проверь даты: начало не должно быть в прошлом, окончание позже начала.';
    case 'REASON_REQUIRED': return 'Укажи причину действия (минимум 3 символа).';
    case 'INVALID_COINS': return 'Неверное количество монет. Допустимо от −1 000 000 до 1 000 000, кроме нуля.';
    case 'PLAYER_MUST_BE_OFFLINE': return 'Нельзя удалить аккаунт, пока игрок онлайн. Дождись выхода.';
    case 'DELETE_CONFIRMATION_MISMATCH': return 'Логин введён неправильно. Удаление отменено.';
    case 'WALLET_MISSING_OR_LIMIT': return 'Кошелёк игрока не найден или баланс вышел за допустимые пределы.';
    case 'ADMIN_ACTION_FAILED': return 'Сервер не смог выполнить операцию. Проверь SQL и ограничения базы.';
    case 'INVALID_IP': return 'Проверь правильность IP-адреса.';
    case 'TRANSLATION_NOT_CONFIGURED': return 'Нужно настроить Google Translate API или LibreTranslate на сервере.';
    case 'TRANSLATION_UNAVAILABLE': return 'Не удалось перевести текст. Объявление не опубликовано.';
    case 'PLATFORM_NOT_CONFIGURED': return 'Установи миграцию управления платформой в Supabase.';
    case 'ADMIN_PLATFORM_FAILED': return 'Ошибка в системе управления платформой. Проверь базу данных.';
    case 'ADMIN_AUTH_REQUIRED': return 'Время админской сессии истекло. Войди снова.';
    case 'TOO_MANY_REQUESTS': return 'Слишком много попыток входа. Подожди около 15 минут.';
    default: return error?.status === 429 ? 'Слишком много попыток входа. Подожди 15 минут.' : 'Не удалось выполнить запрос. Проверь подключение к серверу.';
  }
}
