import UserAvatar from './UserAvatar.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/socket.js';
import '../styles/support-center.css';

const categoryMeta = {
  player_report: {
    emoji: '🛡️',
    label: 'Жалоба на игрока',
    intro: 'Выбери игрока, опиши ситуацию и приложи доказательства. Так нам будет проще быстро проверить жалобу.',
    titleLabel: 'Тема',
    titlePlaceholder: 'Например: оскорбления в чате',
    bodyLabel: 'Описание',
    bodyPlaceholder: 'Что произошло? Опиши нарушение, когда оно было и что именно нужно проверить.',
  },
  bug: {
    emoji: '🐛',
    label: 'Проблема с игрой',
    intro: 'Расскажи, в какой игре возникла ошибка, что ты делал перед этим и что пошло не так.',
    gameLabel: 'Какая игра?',
    gamePlaceholder: 'Например: шахматы, 2048, реверси',
    titleLabel: 'Тема',
    titlePlaceholder: 'Например: матч зависает при старте',
    bodyLabel: 'Описание проблемы',
    bodyPlaceholder: 'Что именно не работает? Опиши шаги, чтобы мы смогли воспроизвести ошибку.',
  },
  feedback: {
    emoji: '💬',
    label: 'Отзыв об игре',
    intro: 'Оставь отзыв: что понравилось, чего не хватает и что можно улучшить.',
    gameLabel: 'О какой игре идёт речь?',
    gamePlaceholder: 'Например: бильярд',
    titleLabel: 'Тема',
    titlePlaceholder: 'Например: игра классная, но хочется больше режимов',
    bodyLabel: 'Твой отзыв',
    bodyPlaceholder: 'Напиши, что тебе понравилось или не понравилось, и почему.',
  },
  suggestion: {
    emoji: '💡',
    label: 'Предложение',
    intro: 'Здесь можно оставить идею, пожелание или предложить новую функцию. Внеси свой вклад в развитие Kodumi Games.',
    gameLabel: 'Если идея относится к игре — укажи её',
    gamePlaceholder: 'Необязательно',
    titleLabel: 'Краткое описание идеи',
    titlePlaceholder: 'Например: добавить ежедневные бонусы',
    bodyLabel: 'Подробности предложения',
    bodyPlaceholder: 'Опиши свою идею подробнее: что именно стоит добавить и чем это будет полезно.',
  },
  other: {
    emoji: '✉️',
    label: 'Другое',
    intro: 'Если обращение не подходит ни под одну категорию, просто напиши нам здесь.',
    gameLabel: 'Игра (необязательно)',
    gamePlaceholder: 'Если обращение связано с конкретной игрой',
    titleLabel: 'Тема',
    titlePlaceholder: 'Кратко опиши обращение',
    bodyLabel: 'Описание',
    bodyPlaceholder: 'Напиши подробнее, что ты хочешь сообщить команде Kodumi Games.',
  },
};

const ERRORS = {
  SUPPORT_DAILY_LIMIT: 'Лимит: три обращения в сутки. Следующее можно отправить завтра (UTC).',
  INVALID_SUPPORT_TICKET: 'Проверь заполнение формы: тема, описание и выбранный игрок для жалобы обязательны.',
  SUPPORT_UNAVAILABLE: 'Служба поддержки временно недоступна. Проверь обновление сервера и SQL-миграции.',
  IMAGE_TOO_LARGE: 'Одно из изображений слишком большое.',
  TARGET_NOT_FOUND: 'Указанного игрока больше нет.',
};

function picture(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Можно прикреплять только PNG, JPG или WebP.'));
      return;
    }
    if (file.size > 5_000_000) {
      reject(new Error('Изображение слишком большое (максимум 5 МБ до сжатия).'));
      return;
    }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const ratio = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.78;
        let output = '';
        do {
          output = canvas.toDataURL('image/jpeg', quality);
          quality -= 0.11;
        } while (output.length > 1_280_000 && quality > 0.33);
        if (output.length > 1_360_000) throw Error('Картинка слишком большая. Попробуй другую.');
        resolve({ data: output.slice(output.indexOf(',') + 1), mime: 'image/jpeg', url: output });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Error('Не удалось открыть изображение.'));
    };
    image.src = url;
  });
}

export default function SupportCenter({ token, onClose, initialGameId = '' }) {
  const [category, setCategory] = useState('player_report');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [game, setGame] = useState(initialGameId);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [selected, setSelected] = useState(null);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState([]);
  const inputRef = useRef(null);

  const meta = categoryMeta[category] || categoryMeta.other;
  const canSend = title.trim().length >= 5
    && body.trim().length >= 15
    && (category !== 'player_report' || Boolean(selected));
  const disabledReason = category === 'player_report' && !selected
    ? 'Для жалобы нужно сначала выбрать игрока.'
    : title.trim().length < 5
      ? 'Добавь тему обращения.'
      : body.trim().length < 15
        ? 'Опиши проблему или идею чуть подробнее.'
        : '';

  useEffect(() => {
    apiRequest('/api/support/mine', { token }).then((response) => setMine(response.tickets || [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (category !== 'player_report' || q.trim().length < 2 || selected) {
      setFound([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      apiRequest(`/api/support/players?q=${encodeURIComponent(q.trim())}`, { token })
        .then((response) => {
          if (alive) setFound(response.players || []);
        })
        .catch(() => {
          if (alive) setFound([]);
        });
    }, 270);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [category, q, selected, token]);

  async function attach(event) {
    setError('');
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (files.length + images.length > 3) {
      setError('Максимум 3 фотографии.');
      return;
    }
    try {
      const next = await Promise.all(files.map(picture));
      setImages((old) => [...old, ...next].slice(0, 3));
    } catch (attachError) {
      setError(attachError.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !canSend) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/support/tickets', {
        token,
        method: 'POST',
        timeoutMs: 75_000,
        body: {
          category,
          title,
          body,
          gameId: game,
          targetUserId: selected?.id,
          images: images.map(({ mime, data }) => ({ mime, data })),
        },
      });
      setSent(true);
      try {
        const response = await apiRequest('/api/support/mine', { token });
        setMine(response.tickets || []);
      } catch {
        /* history refresh is noncritical */
      }
    } catch (submitError) {
      setError(ERRORS[submitError.message] || 'Не удалось отправить обращение. Повтори попытку.');
    } finally {
      setBusy(false);
    }
  }

  const historyPreview = useMemo(
    () => mine.slice(0, 3),
    [mine],
  );

  return (
    <div className="kd-support-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="kd-support" role="dialog" aria-modal="true" aria-label="Центр поддержки">
        <header className="kd-support__head">
          <div>
            <span>✦ KODUMI GAMES</span>
            <h2>Центр поддержки</h2>
            <p>Жалобы, идеи, отзывы и помощь по играм — в одном месте.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        {sent ? (
          <div className="kd-support__success">
            <b>✓ Обращение отправлено</b>
            <p>Оно уже поступило в центр обращений администратора. Спасибо за обратную связь!</p>
            <button type="button" onClick={onClose}>Готово</button>
          </div>
        ) : (
          <form onSubmit={submit} className="kd-support__body">
            <div className="kd-support__types">
              {Object.entries(categoryMeta).map(([id, item]) => (
                <button
                  type="button"
                  key={id}
                  className={category === id ? 'is-selected' : ''}
                  onClick={() => {
                    setCategory(id);
                    setSelected(null);
                    setQ('');
                    setError('');
                  }}
                >
                  <span>{item.emoji}</span>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="kd-support__hint">
              <strong>{meta.label}</strong>
              <p>{meta.intro}</p>
            </div>

            {category === 'player_report' ? (
              <div className="kd-support__lookup">
                <label>На какого игрока жалуешься?</label>
                {selected ? (
                  <div className="kd-support__selected">
                    <UserAvatar user={selected} size={42} />
                    <b>{selected.displayName} <small>@{selected.username}</small></b>
                    <button type="button" onClick={() => { setSelected(null); setQ(''); }}>Изменить</button>
                  </div>
                ) : (
                  <>
                    <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск по игровому имени или логину" autoComplete="off" />
                    {found.length > 0 ? (
                      <div className="kd-support__results">
                        {found.map((user) => (
                          <button type="button" key={user.id} onClick={() => { setSelected(user); setFound([]); }}>
                            <UserAvatar user={user} size={40} />
                            <span>
                              <b>{user.displayName}</b>
                              <small>@{user.username}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <small className="kd-support__subtext">Начни вводить ник или логин — мы предложим подходящих игроков.</small>
                    )}
                  </>
                )}
              </div>
            ) : (
              <label>
                {meta.gameLabel || 'Игра (необязательно)'}
                <input
                  value={game}
                  onChange={(event) => setGame(event.target.value)}
                  maxLength={60}
                  placeholder={meta.gamePlaceholder || 'Например: шахматы'}
                />
              </label>
            )}

            <label>
              {meta.titleLabel}
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={5}
                maxLength={120}
                required
                placeholder={meta.titlePlaceholder}
              />
            </label>

            <label>
              {meta.bodyLabel}
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                minLength={15}
                maxLength={4000}
                required
                rows={6}
                placeholder={meta.bodyPlaceholder}
              />
            </label>

            <div className="kd-support__attachments">
              <div>
                <b>Доказательства</b>
                <small>До 3 фотографий · JPG / PNG / WebP</small>
              </div>
              <button type="button" onClick={() => inputRef.current?.click()}>+ Добавить фото</button>
              <input ref={inputRef} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={attach} />
            </div>

            {images.length > 0 ? (
              <div className="kd-support__images">
                {images.map((img, index) => (
                  <div key={index}>
                    <img src={img.url} alt={`Вложение ${index + 1}`} />
                    <button type="button" onClick={() => setImages((old) => old.filter((_, imageIndex) => index !== imageIndex))} aria-label="Удалить фото">×</button>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? <p className="kd-support__error" role="alert">{error}</p> : null}

            <footer className="kd-support__footer">
              <div>
                <span>До 3 обращений в день</span>
                {disabledReason ? <small>{disabledReason}</small> : <small>После отправки обращение сразу появится в админ-центре.</small>}
              </div>
              <button type="submit" disabled={busy || !canSend}>{busy ? 'Отправляем…' : 'Отправить обращение →'}</button>
            </footer>
          </form>
        )}

        {historyPreview.length > 0 ? (
          <div className="kd-support__history">
            <b>Мои последние обращения</b>
            {historyPreview.map((ticket) => (
              <div key={ticket.id}>
                <span>{ticket.title}</span>
                <small>{({ new: 'Получено', reviewing: 'На рассмотрении', resolved: 'Решено', rejected: 'Закрыто' })[ticket.status] || ticket.status}</small>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
