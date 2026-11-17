import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import './admin-support.css';

const categories = {
  player_report: 'Жалобы на игроков',
  bug: 'Проблемы с игрой',
  feedback: 'Отзывы',
  suggestion: 'Предложения',
  other: 'Другое',
};

const statuses = {
  new: 'Новое',
  reviewing: 'В работе',
  resolved: 'Решено',
  rejected: 'Закрыто',
};

const when = (value) => new Date(value).toLocaleString('ru-RU');
const statusTone = (status) => (status === 'resolved' ? 'success' : status === 'rejected' ? 'muted' : status === 'reviewing' ? 'active' : 'new');

function Notice({ error }) {
  return error ? <p className="kc-help-error" role="alert">{adminErrorText(error)}</p> : null;
}

function EmptyState({ title, text }) {
  return (
    <div className="kc-help-empty">
      <span>✦</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function AdminSupportTickets({ token, onOpenPlayer }) {
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async (next = 0, append = false) => {
    setBusy(true);
    setError(null);
    try {
      const response = await adminRequest(`support/tickets?status=${status}&category=${category}&offset=${next}&limit=30`, { token });
      setRows((old) => (append ? [...old, ...response.tickets] : response.tickets));
      setTotal(response.total);
      setOffset(next + response.tickets.length);
      if (!append && selected) {
        const refreshed = (response.tickets || []).find((item) => item.id === selected.id);
        if (refreshed) {
          setSelected(refreshed);
          setNote(refreshed.admin_note || '');
        }
      }
    } catch (loadError) {
      setError(loadError);
    } finally {
      setBusy(false);
    }
  }, [category, selected, status, token]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    total: rows.length,
    fresh: rows.filter((row) => row.status === 'new').length,
    active: rows.filter((row) => row.status === 'reviewing').length,
    resolved: rows.filter((row) => row.status === 'resolved').length,
  }), [rows]);

  async function update(nextStatus) {
    if (!selected) return;
    try {
      await adminRequest(`support/tickets/${selected.id}`, {
        token,
        method: 'PATCH',
        body: { status: nextStatus, note },
      });
      setSelected((old) => old ? { ...old, status: nextStatus, admin_note: note } : old);
      void load();
    } catch (updateError) {
      setError(updateError);
    }
  }

  async function image(row, index) {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const response = await adminRequest(`support/tickets/${row.id}/images/${index}`, { token });
      if (tab) tab.location.replace(response.url);
      else window.location.assign(response.url);
    } catch (imageError) {
      if (tab) tab.close();
      setError(imageError);
    }
  }

  return (
    <div className="kc-help-layout">
      <div className="kc-help-toolbar">
        <div className="kc-help-filters">
          <label>
            Категория
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">Все обращения</option>
              {Object.entries(categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>
            Статус
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Любой статус</option>
              {Object.entries(statuses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <button type="button" className="kc-help-primary" onClick={() => load()}>↻ Обновить</button>
        </div>
        <div className="kc-help-mini-stats">
          <div><strong>{total}</strong><span>Всего</span></div>
          <div><strong>{stats.fresh}</strong><span>Новые</span></div>
          <div><strong>{stats.active}</strong><span>В работе</span></div>
          <div><strong>{stats.resolved}</strong><span>Решено</span></div>
        </div>
      </div>

      <Notice error={error} />

      <div className="kc-help-columns">
        <div className="kc-help-tickets">
          <div className="kc-help-sectionhead">
            <h3>Список обращений</h3>
            <small>{busy ? 'Обновляем…' : `${rows.length} в текущей выборке`}</small>
          </div>
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`kc-help-ticket ${selected?.id === row.id ? 'is-current' : ''}`}
              onClick={() => {
                setSelected(row);
                setNote(row.admin_note || '');
              }}
            >
              <div className="kc-help-ticket__top">
                <span className="kc-help-category">{categories[row.category]}</span>
                <span className={`kc-status-pill kc-status-pill--${statusTone(row.status)}`}>{statuses[row.status]}</span>
              </div>
              <strong>{row.title}</strong>
              <p>{row.author?.displayName || 'Удалённый игрок'} · @{row.author?.username || 'unknown'}</p>
              <small>{when(row.created_at)}</small>
            </button>
          ))}
          {!rows.length && !busy ? (
            <EmptyState
              title="Обращений пока нет"
              text="Когда игроки начнут отправлять жалобы, отзывы и предложения, они появятся здесь."
            />
          ) : null}
          {offset < total ? <button type="button" className="kc-outlinebtn" disabled={busy} onClick={() => load(offset, true)}>Загрузить ещё 30</button> : null}
        </div>

        <div className="kc-help-detail">
          {selected ? (
            <>
              <header>
                <div className="kc-help-detail__title">
                  <span className="kc-help-category">{categories[selected.category]}</span>
                  <span className={`kc-status-pill kc-status-pill--${statusTone(selected.status)}`}>{statuses[selected.status]}</span>
                </div>
                <h2>{selected.title}</h2>
                <p>{when(selected.created_at)}</p>
              </header>

              <div className="kc-help-detail__meta">
                <div className="kc-help-sender">
                  <b>Отправитель</b>
                  <button type="button" onClick={() => onOpenPlayer(selected.author_id)}>
                    {selected.author?.displayName || 'Аккаунт удалён'} <small>@{selected.author?.username}</small> ↗
                  </button>
                </div>
                {selected.target_user_id ? (
                  <div className="kc-help-sender">
                    <b>Жалоба на</b>
                    <button type="button" onClick={() => onOpenPlayer(selected.target_user_id)}>
                      {selected.target?.displayName || 'Аккаунт удалён'} <small>@{selected.target?.username}</small> ↗
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="kc-help-message">
                <b>Описание</b>
                <p>{selected.body}</p>
              </div>

              {selected.images?.length > 0 ? (
                <div className="kc-help-proof">
                  <b>Прикреплённые фотографии</b>
                  <div>
                    {selected.images.map((imageData, index) => (
                      <button type="button" key={index} onClick={() => image(selected, index)}>📷 Фото {index + 1} ↗</button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="kc-help-note">
                Заметка администратора
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={1000} />
              </label>

              <div className="kc-help-actions">
                {Object.entries(statuses).map(([id, name]) => (
                  <button key={id} type="button" className={selected.status === id ? 'is-current' : ''} onClick={() => update(id)}>{name}</button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="Выбери обращение слева"
              text="Открой любой тикет, чтобы посмотреть описание, доказательства и статус рассмотрения."
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminServerDiagnostics({ token, onOpenPlayer }) {
  const [hours, setHours] = useState('24');
  const [rows, setRows] = useState([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (next = 0, append = false) => {
    setBusy(true);
    setError(null);
    try {
      const response = await adminRequest(`diagnostics?hours=${hours}&offset=${next}&limit=50`, { token });
      setRows((old) => (append ? [...old, ...response.events] : response.events));
      setOffset(next + response.events.length);
      setTotal(response.total);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setBusy(false);
    }
  }, [hours, token]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const stats = useMemo(() => ({
    disconnect: rows.filter((row) => row.kind === 'disconnect').length,
    http_error: rows.filter((row) => row.kind === 'http_error').length,
    match_error: rows.filter((row) => row.kind === 'match_error').length,
  }), [rows]);

  return (
    <div className="kc-diag">
      <div className="kc-help-toolbar">
        <div className="kc-help-filters">
          <label>
            Период
            <select value={hours} onChange={(event) => setHours(event.target.value)}>
              <option value="1">Последний час</option>
              <option value="24">24 часа</option>
              <option value="168">7 дней</option>
            </select>
          </label>
          <button type="button" className="kc-help-primary" onClick={() => load()}>↻ Обновить</button>
        </div>
        <div className="kc-help-mini-stats kc-help-mini-stats--diag">
          <div><strong>{stats.disconnect}</strong><span>Обрывы</span></div>
          <div><strong>{stats.http_error}</strong><span>Ошибки API</span></div>
          <div><strong>{stats.match_error}</strong><span>Сбои матчей</span></div>
          <div><strong>{total}</strong><span>Всего событий</span></div>
        </div>
      </div>

      <Notice error={error} />

      <div className="kc-diag-log">
        {rows.map((event) => (
          <article key={event.id} className={`kc-diag-event kc-diag-event--${event.severity}`}>
            <div className="kc-diag-event__head">
              <span>{({ disconnect: 'Потеря соединения', http_error: 'Ошибка API', match_error: 'Ошибка матча', system: 'Система' })[event.kind]}</span>
              <small>{when(event.created_at)}</small>
            </div>
            <p>{event.details}</p>
            <div className="kc-diag-event__meta">
              {event.game_id ? <span>Игра: {event.game_id}</span> : null}
              {event.room_id ? <span>Матч: {event.room_id}</span> : null}
              {event.user_id ? <button type="button" onClick={() => onOpenPlayer(event.user_id)}>Игрок: {event.user?.displayName || event.user_id} ↗</button> : null}
            </div>
          </article>
        ))}
        {!rows.length && !busy ? (
          <EmptyState
            title="Событий пока нет"
            text="После установки обновления здесь будут собираться обрывы соединения, ошибки API и сбои матчей."
          />
        ) : null}
      </div>

      {offset < total ? <button type="button" className="kc-outlinebtn" disabled={busy} onClick={() => load(offset, true)}>Загрузить ещё</button> : null}
    </div>
  );
}
