import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import AdminGlyph from './AdminGlyph.jsx';

const categories = { player_report: 'Жалоба на игрока', bug: 'Проблема с игрой', feedback: 'Отзыв об игре', suggestion: 'Предложение', other: 'Другое' };
const statuses = { new: 'Новый', reviewing: 'В работе', resolved: 'Решено', rejected: 'Закрыто' };
const kindLabels = { disconnect: 'Обрыв соединения', http_error: 'Ошибка API', match_error: 'Сбой матча', system: 'Системное событие' };
const fmtDate = date => date ? new Date(date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const personName = person => person?.displayName || person?.username || 'Удалённый игрок';
const tone = status => ({ new: 'purple', reviewing: 'blue', resolved: 'green', rejected: 'muted' })[status] || 'muted';

function Pill({ children, color = 'purple' }) { return <span className={`ko-pill ko-pill--${color}`}>{children}</span>; }
function ActionButton({ icon, children, variant = 'quiet', ...props }) { return <button type="button" className={`ko-button ko-button--${variant}`} {...props}><AdminGlyph name={icon} size={16}/>{children}</button>; }
function UserLine({ user, title, onOpenPlayer }) {
  return <div className="ko-person">
    <div className="ko-person__avatar">{user?.avatar?.startsWith('data:image/') ? <img src={user.avatar} alt="" /> : personName(user).slice(0, 2).toUpperCase()}</div>
    <div><small>{title}</small><strong>{personName(user)}</strong><span>@{user?.username || 'unknown'}</span></div>
    {user?.id && onOpenPlayer ? <button type="button" onClick={() => onOpenPlayer(user.id)} title="Открыть профиль"><AdminGlyph name="external" size={17}/></button> : null}
  </div>;
}

export function AdminSupportTickets({ token, onOpenPlayer }) {
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const [lightbox, setLightbox] = useState(-1);
  const selected = rows.find(row => row.id === selectedId) || null;
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const loadStats = useCallback(async () => { const r = await adminRequest('support/stats', { token }); setCounts({ total: r.total, ...r.counts }); }, [token]);
  const load = useCallback(async (next = 0, append = false) => {
    setBusy(true);
    try {
      const r = await adminRequest(`support/tickets?status=${status}&category=${category}&q=${encodeURIComponent(query)}&offset=${next}&limit=50`, { token });
      setRows(previous => append ? [...previous, ...(r.tickets || [])] : (r.tickets || []));
      setOffset(next + (r.tickets || []).length); setTotal(r.total || 0);
      if (!append) setSelectedId(previous => (r.tickets || []).some(row => row.id === previous) ? previous : (r.tickets?.[0]?.id || ''));
      setError('');
    } catch (err) { setError(adminErrorText(err)); }
    finally { setBusy(false); }
  }, [category, status, query, token]);
  const reload = useCallback(async () => { await Promise.all([load(), loadStats().catch(err => setError(adminErrorText(err)))]); }, [load, loadStats]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!selected?.images?.length) { setPhotos([]); setPhotoError(''); setLightbox(-1); return; }
    let alive = true;
    setPhotos([]); setPhotoError(''); setLightbox(-1);
    Promise.all(selected.images.map((_, index) => adminRequest(`support/tickets/${selected.id}/images/${index}`, { token })))
      .then(result => { if (alive) setPhotos(result.map(item => item.url)); })
      .catch(() => { if (alive) setPhotoError('Не удалось загрузить изображения. Попробуй выбрать обращение снова.'); });
    return () => { alive = false; };
  }, [selected?.id, token]);
  useEffect(() => { if (lightbox < 0) return; const key = event => { if (event.key === 'Escape') setLightbox(-1); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [lightbox]);
  async function changeStatus(value) {
    if (!selected || operation || selected.status === value) return;
    setOperation(true); setError('');
    try { await adminRequest(`support/tickets/${selected.id}`, { token, method: 'PATCH', body: { status: value } }); await reload(); }
    catch (err) { setError(adminErrorText(err)); } finally { setOperation(false); }
  }
  async function clear() {
    if (operation || !counts.total || !window.confirm('Удалить все обращения и прикреплённые фотографии? Восстановить их не получится.')) return;
    setOperation(true);
    try { await adminRequest('support/tickets', { token, method: 'DELETE', body: { confirmation: 'CLEAR_SUPPORT' } }); setRows([]); setSelectedId(''); await reload(); }
    catch (err) { setError(adminErrorText(err)); } finally { setOperation(false); }
  }
  return <div className="ko-screen ko-support">
    <div className="ko-toolbar">
      <label>Категория <select value={category} onChange={e => setCategory(e.target.value)}><option value="all">Все категории</option>{Object.entries(categories).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label>Статус <select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Все статусы</option>{Object.entries(statuses).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label className="ko-toolbar__search"><AdminGlyph name="search" size={19}/><input type="search" placeholder="Поиск по теме или тексту…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Поиск обращений" /></label>
      <ActionButton icon="refresh" variant="primary" disabled={busy} onClick={() => void reload()}>Обновить</ActionButton>
      <ActionButton icon="trash" disabled={operation || !counts.total} onClick={clear}>Очистить</ActionButton>
    </div>
    <div className="ko-metrics">
      {[['total', 'Всего', 'layers', 'violet'], ['new', 'Новые', 'star', 'purple'], ['reviewing', 'В работе', 'clock', 'blue'], ['resolved', 'Решено', 'check', 'green']].map(([key, label, icon, color]) => <div key={key} className={`ko-metric ko-metric--${color}`}><span className="ko-metric__icon"><AdminGlyph name={icon} size={25}/></span><div><span>{label}</span><strong>{counts[key] ?? '—'}</strong></div></div>)}
    </div>
    {error ? <div className="ko-alert" role="alert">{error}</div> : null}
    <div className="ko-split">
      <section className="ko-panel ko-ticket-list">
        <div className="ko-panel__heading"><h2>Входящие обращения</h2><small>{busy ? 'Загрузка…' : `Найдено ${total}`}</small></div>
        <div className="ko-ticket-list__scroll">
          {rows.map(row => <button type="button" key={row.id} onClick={() => setSelectedId(row.id)} className={`ko-ticket ${selectedId === row.id ? 'is-selected' : ''}`} aria-pressed={selectedId === row.id}>
            <div className="ko-ticket__avatar">{row.author?.avatar?.startsWith('data:image/') ? <img src={row.author.avatar} alt=""/> : <AdminGlyph name="user" size={24}/>}</div>
            <div className="ko-ticket__main"><div className="ko-ticket__title"><Pill color={row.category === 'player_report' ? 'red' : row.category === 'suggestion' ? 'green' : 'blue'}>{categories[row.category] || row.category}</Pill><strong>{row.title}</strong></div><p>{row.body}</p><div className="ko-ticket__foot"><span>{personName(row.author)} · @{row.author?.username || 'unknown'}</span><span>{fmtDate(row.created_at)}</span>{row.images?.length ? <AdminGlyph name="camera" size={16} /> : null}</div></div>
          </button>)}
          {!rows.length && !busy ? <div className="ko-empty"><AdminGlyph name="report" size={32}/><strong>Обращений не найдено</strong><span>Попробуй другие фильтры или очисти поиск.</span></div> : null}
          {offset < total ? <ActionButton icon="down" disabled={busy} onClick={() => void load(offset, true)}>Загрузить ещё 50</ActionButton> : null}
        </div>
      </section>
      <section className="ko-panel ko-ticket-detail">
        {selected ? <>
          <div className="ko-panel__heading"><div><h2>{selected.title}</h2><div className="ko-panel__subline"><Pill color={selected.category === 'player_report' ? 'red' : 'purple'}>{categories[selected.category] || selected.category}</Pill><span>ID: #{selected.id.slice(0, 8)}</span></div></div><label className="ko-detail-status">Статус обращения <select value={selected.status} disabled={operation} onChange={e => void changeStatus(e.target.value)}>{Object.entries(statuses).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label></div>
          <div className="ko-detail-scroll"><UserLine user={selected.author} title="Отправитель" onOpenPlayer={onOpenPlayer}/>
            {selected.target_user_id ? <UserLine user={selected.target} title="Жалоба на игрока" onOpenPlayer={onOpenPlayer}/> : null}
            <div className="ko-inline-meta"><AdminGlyph name="clock" size={16}/>{fmtDate(selected.created_at)}{selected.game_id ? <><AdminGlyph name="games" size={16}/>Игра: {selected.game_id}</> : null}</div>
            <div className="ko-message"><b><AdminGlyph name="report" size={17}/> Сообщение</b><p>{selected.body}</p></div>
            {selected.images?.length ? <div className="ko-attachments"><b><AdminGlyph name="camera" size={18}/> Вложения ({selected.images.length})</b>{photoError ? <div className="ko-alert">{photoError}</div> : null}<div className="ko-attachments__grid">{selected.images.map((_, index) => <button key={index} type="button" disabled={!photos[index]} onClick={() => setLightbox(index)} aria-label={`Увеличить фото ${index + 1}`}>{photos[index] ? <img src={photos[index]} alt={`Фото ${index + 1}`}/> : <span>Загрузка фото…</span>}</button>)}</div><small>Нажми на фото, чтобы увеличить внутри панели.</small></div> : null}
          </div>
          <div className="ko-detail-actions"><b>Действия</b><div>{Object.entries(statuses).map(([key, name]) => <button key={key} type="button" className={`ko-status-action ko-status-action--${tone(key)} ${key === selected.status ? 'is-active' : ''}`} disabled={operation} onClick={() => void changeStatus(key)}>{key === selected.status ? <AdminGlyph name="check" size={15}/> : null}{name}</button>)}</div><small>Статус меняется только в админке. Ответ игроку не отправляется.</small></div>
        </> : <div className="ko-empty ko-empty--detail"><AdminGlyph name="report" size={42}/><strong>Выбери обращение</strong><span>Его содержание, фотографии и статусы появятся здесь.</span></div>}
      </section>
    </div>
    {lightbox >= 0 && photos[lightbox] ? <div className="ko-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр вложения" onMouseDown={e => { if (e.target === e.currentTarget) setLightbox(-1); }}><button type="button" className="ko-lightbox__close" onClick={() => setLightbox(-1)} aria-label="Закрыть"><AdminGlyph name="close" size={22}/></button><img src={photos[lightbox]} alt={`Вложение ${lightbox + 1}`}/><div>{lightbox > 0 ? <ActionButton icon="back" onClick={() => setLightbox(x => x - 1)}>Назад</ActionButton> : null}<span>{lightbox + 1} / {photos.length}</span>{lightbox + 1 < photos.length ? <ActionButton icon="down" onClick={() => setLightbox(x => x + 1)}>Далее</ActionButton> : null}</div></div> : null}
  </div>;
}

export function AdminServerDiagnostics({ token, onOpenPlayer }) {
  const [hours, setHours] = useState('24');
  const [severity, setSeverity] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const selected = useMemo(() => events.find(row => row.id === selectedId), [events, selectedId]);
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const load = useCallback(async (next = 0, append = false) => {
    setBusy(true);
    try {
      const result = await adminRequest(`diagnostics?hours=${hours}&severity=${severity}&q=${encodeURIComponent(query)}&offset=${next}&limit=50`, { token });
      setEvents(previous => append ? [...previous, ...(result.events || [])] : result.events || []);
      setCounts(result.counts || {}); setTotal(result.total || 0); setOffset(next + (result.events || []).length);
      if (!append) setSelectedId(previous => (result.events || []).some(event => event.id === previous) ? previous : (result.events?.[0]?.id || ''));
      setError('');
    } catch (err) { setError(adminErrorText(err)); } finally { setBusy(false); }
  }, [hours, severity, query, token]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30000); return () => clearInterval(timer); }, [load]);
  async function markReview(state) {
    if (!selected || reviewing) return;
    setReviewing(true); setError('');
    try {
      await adminRequest(`diagnostics/${encodeURIComponent(selected.id)}`, { token, method: 'PATCH', body: { state } });
      setEvents(old => old.map(row => row.id === selected.id ? { ...row, review_state: state } : row));
    } catch (err) { setError(adminErrorText(err)); }
    finally { setReviewing(false); }
  }
  async function clear() {
    if (clearing || !window.confirm('Удалить всю историю событий сервера? Это необратимо.')) return;
    setClearing(true);
    try { await adminRequest('diagnostics', { token, method: 'DELETE', body: { confirmation: 'CLEAR_DIAGNOSTICS' } }); await load(); }
    catch (err) { setError(adminErrorText(err)); } finally { setClearing(false); }
  }
  return <div className="ko-screen ko-diagnostics">
    <div className="ko-toolbar">
      <label>Период <select value={hours} onChange={e => setHours(e.target.value)}><option value="1">1 час</option><option value="24">24 часа</option><option value="168">7 дней</option></select></label>
      <label>Уровень <select value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">Все события</option><option value="error">Ошибки</option><option value="warning">Предупреждения</option><option value="info">Информация</option></select></label>
      <label className="ko-toolbar__search"><AdminGlyph name="search" size={19}/><input type="search" placeholder="Поиск по деталям события…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Поиск событий"/></label>
      <ActionButton icon="refresh" variant="primary" disabled={busy} onClick={() => void load()}>Обновить</ActionButton>
      <ActionButton icon="trash" disabled={clearing || !counts.total} onClick={clear}>Очистить журнал</ActionButton>
    </div>
    <div className="ko-metrics">
      {[['disconnect', 'Обрывы', 'alert', 'violet'], ['http_error', 'Ошибки API', 'code', 'purple'], ['match_error', 'Сбои матчей', 'games', 'blue'], ['all', 'Всего событий', 'layers', 'green']].map(([key, title, icon, color]) => <div key={key} className={`ko-metric ko-metric--${color}`}><span className="ko-metric__icon"><AdminGlyph name={icon} size={25}/></span><div><span>{title}</span><strong>{key === 'all' ? (counts.total ?? '—') : counts[key] ?? '—'}</strong></div></div>)}
    </div>
    {error ? <div className="ko-alert" role="alert">{error}</div> : null}
    <div className="ko-split ko-split--diag">
      <section className="ko-panel ko-log-list"><div className="ko-panel__heading"><h2>Журнал событий</h2><small>{busy ? 'Обновление…' : `Найдено ${total} событий`}</small></div>
        <div className="ko-terminalbar"><span><span className="ko-terminalbar__dot"/> SERVER / ERROR CONSOLE</span><small>Автообновление · 30 сек.</small></div>
        <div className="ko-log-list__scroll" role="log" aria-label="События сервера">{events.map((row, index) => <button type="button" className={`ko-log-row ko-log-row--${row.severity || 'info'} ${selectedId === row.id ? 'is-selected' : ''}`} key={row.id} onClick={() => setSelectedId(row.id)}><span className="ko-log-icon"><AdminGlyph name={row.kind === 'http_error' ? 'code' : row.kind === 'match_error' ? 'games' : row.severity === 'info' ? 'check' : 'alert'} size={22}/></span><span className="ko-log-time">{fmtDate(row.created_at)}</span><span className={`ko-log-level ko-log-level--${row.severity || 'info'}`}>{row.severity === 'error' ? 'Ошибка' : row.severity === 'warning' ? 'Предупр.' : 'Инфо'}</span><span className="ko-log-desc"><strong>{kindLabels[row.kind] || row.kind || 'Событие'}</strong><small>{row.details || 'Без деталей'}</small></span><span className="ko-log-kind">{row.kind === 'http_error' ? 'API' : row.kind === 'match_error' ? 'MATCH' : 'SERVER'}</span></button>)}
        {!events.length && !busy ? <div className="ko-empty ko-terminal-empty"><strong>$ no events matched</strong><span>В выбранном периоде нет подходящих событий.</span></div> : null}</div>
        <div className="ko-console-foot"><code>kodumi@server:~$ {events.length} displayed / {total} matched</code><span>READ ONLY · ADMIN</span></div>
        {offset < total ? <ActionButton icon="down" disabled={busy} onClick={() => void load(offset, true)}>Показать ещё 50 событий</ActionButton> : null}
      </section>
      <section className="ko-panel ko-event-detail">{selected ? <><div className="ko-panel__heading"><h2>Подробности события</h2><small>#{String(selected.id).slice(0, 8)}</small></div>
        <div className="ko-event-detail__content"><div className="ko-event-lead"><span className={`ko-event-lead__icon ko-event-lead__icon--${selected.severity || 'info'}`}><AdminGlyph name={selected.kind === 'http_error' ? 'code' : selected.kind === 'match_error' ? 'games' : 'terminal'} size={34}/></span><div><h3>{kindLabels[selected.kind] || selected.kind}</h3><Pill color={selected.severity === 'error' ? 'red' : selected.severity === 'warning' ? 'gold' : 'green'}>{selected.severity === 'error' ? 'Ошибка' : selected.severity === 'warning' ? 'Предупреждение' : 'Информация'}</Pill><span>{fmtDate(selected.created_at)}</span><Pill color={selected.review_state === 'resolved' ? 'green' : selected.review_state === 'escalated' ? 'red' : selected.review_state === 'ignored' ? 'muted' : 'blue'}>{({ open: 'Не обработано', ignored: 'Игнорируется', resolved: 'Решено', escalated: 'Эскалация' })[selected.review_state || 'open'] || 'Не обработано'}</Pill></div></div>
          <div className="ko-event-meta">{[['Модуль', selected.kind || '—'], ['Игра', selected.game_id || '—'], ['Матч', selected.room_id || '—'], ['Игрок', selected.user?.displayName || selected.user_id || '—']].map(([key, val]) => <div key={key}><span>{key}</span><strong>{val}</strong></div>)}</div>
          <h4><AdminGlyph name="report" size={17}/> Описание</h4><p className="ko-event-description">{selected.details || 'Сервер не передал дополнительного описания.'}</p>
          <h4><AdminGlyph name="terminal" size={17}/> Технические данные</h4><pre className="ko-stacktrace">{[`TIME  ${selected.created_at || '—'}`, `LEVEL ${String(selected.severity || 'info').toUpperCase()}`, `KIND  ${selected.kind || '—'}`, `GAME  ${selected.game_id || '—'}`, `ROOM  ${selected.room_id || '—'}`, `USER  ${selected.user_id || '—'}`, '', selected.details || 'No additional event data'].join('\n')}</pre>
          {selected.user_id && onOpenPlayer ? <ActionButton icon="user" onClick={() => onOpenPlayer(selected.user_id)}>Открыть профиль игрока</ActionButton> : null}
          <div className="ko-event-privacy"><AdminGlyph name="shield" size={16}/> Здесь показываются только реально записанные сервером сведения. Стек вызовов недоступен, если сервер его не сохранил.</div>
        </div>
        <div className="ko-event-actions">
          <ButtonForEvent label="Игнорировать" icon="eye" active={selected.review_state === 'ignored'} disabled={reviewing} onClick={() => void markReview(selected.review_state === 'ignored' ? 'open' : 'ignored')}/>
          <ButtonForEvent label="Отметить решённым" icon="check" active={selected.review_state === 'resolved'} disabled={reviewing} onClick={() => void markReview(selected.review_state === 'resolved' ? 'open' : 'resolved')}/>
          <ButtonForEvent label="Эскалировать" icon="alert" active={selected.review_state === 'escalated'} disabled={reviewing} onClick={() => void markReview(selected.review_state === 'escalated' ? 'open' : 'escalated')}/>
        </div>
      </> : <div className="ko-empty ko-empty--detail"><AdminGlyph name="terminal" size={40}/><strong>Нет выбранного события</strong><span>Когда появятся события, их подробности будут здесь.</span></div>}</section>
    </div>
  </div>;
}

function ButtonForEvent({ label, icon, active, ...props }) { return <button type="button" className={`ko-event-action ${active ? 'is-active' : ''}`} {...props}><AdminGlyph name={icon} size={17}/>{label}</button>; }
