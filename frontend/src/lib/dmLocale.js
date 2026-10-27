// UI-only labels. The text written by users is never translated.
const dictionary = {
  'Фото': ['Фото', 'Photo'],
  'Видео': ['Відео', 'Video'],
  'Голосовое сообщение': ['Голосове повідомлення', 'Voice message'],
  'Видеокружочек': ['Відеокружечок', 'Video message'],
  'Отправка файла…': ['Надсилання файлу…', 'Sending file…'],
  'Не удалось загрузить вложение': ['Не вдалося завантажити вкладення', 'Could not load attachment'],
  'Загрузка вложения…': ['Завантаження вкладення…', 'Loading attachment…'],
  'Вложение': ['Вкладення', 'Attachment'],
  'Открыть фото': ['Відкрити фото', 'Open photo'],
  'Фото из переписки': ['Фото з листування', 'Chat photo'],
  'Воспроизвести кружочек': ['Відтворити відеокружечок', 'Play video message'],
  'Видеосообщение': ['Відеоповідомлення', 'Video message'],
  'Пауза': ['Пауза', 'Pause'],
  'Видео из переписки': ['Відео з листування', 'Chat video'],
  'Голосовое сообщение (запись)': ['Голосове повідомлення (запис)', 'Record voice message'],
  'Выбрать фото или видео': ['Вибрати фото чи відео', 'Select photo or video'],
  'Фото и видео': ['Фото й відео', 'Photos and videos'],
  'Прикрепить фото или видео': ['Прикріпити фото чи відео', 'Attach a photo or video'],
  'Записать голосовое сообщение': ['Записати голосове повідомлення', 'Record a voice message'],
  'Записать видеокружочек': ['Записати відеокружечок', 'Record a video message'],
  'Отправить': ['Надіслати', 'Send'],
  'Отмена': ['Скасувати', 'Cancel'],
  'Запись': ['Запис', 'Record'],
  'Камера': ['Камера', 'Camera'],
  'Переключить камеру': ['Перемкнути камеру', 'Switch camera'],
  'Разреши использование микрофона': ['Дозволь доступ до мікрофона', 'Allow microphone access'],
  'Идёт запись': ['Триває запис', 'Recording'],
  'Разреши доступ к камере или микрофону в браузере.': ['Дозволь доступ до камери або мікрофона в браузері.', 'Allow camera or microphone access in your browser.'],
  'Формат вложения не поддерживается.': ['Формат вкладення не підтримується.', 'Unsupported attachment format.'],
  'Не удалось отправить файл. Проверь разрешения, формат и подключение.': ['Не вдалося надіслати файл. Перевір дозволи, формат і з’єднання.', 'Could not send the file. Check permissions, format, and connection.'],
  'Некоторые файлы не поддерживаются или слишком большие: фото до 8 МБ, видео до 20 МБ.': ['Деякі файли не підтримуються або завеликі: фото до 8 МБ, відео до 20 МБ.', 'Some files are unsupported or too large: photos up to 8 MB, videos up to 20 MB.'],
  'Запись получилась слишком большой.': ['Запис завеликий.', 'Recording is too large.'],
};

export function tDm(source) {
  const lang = document.documentElement.lang;
  if (lang === 'ru') return source;
  const value = dictionary[source];
  return value?.[lang === 'en' ? 1 : 0] || source;
}

export function dmMediaLabel(kind) {
  const label = { image: 'Фото', video: 'Видео', voice: 'Голосовое сообщение', circle: 'Видеокружочек' }[kind];
  return label ? tDm(label) : '';
}

export function dmFilesConfirmText(count) {
  const lang = document.documentElement.lang;
  if (lang === 'en') return `Send ${count} file(s)?`;
  if (lang === 'ru') return `Отправить ${count} файл(ов)?`;
  return `Надіслати ${count} файл(ів)?`;
}
