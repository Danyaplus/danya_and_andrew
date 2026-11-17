import { useEffect, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';

const formatDate = date => date ? new Intl.DateTimeFormat('ru-RU', { day:'2-digit', month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' }).format(new Date(date)) : 'Навсегда';
const inputDate = (offset = 0) => {
  const t = new Date(Date.now() + offset);
  const pad = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
};

function BanForm({ action, player, initialIp, token, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [start, setStart] = useState(() => inputDate());
  const [end, setEnd] = useState(() => inputDate(7 * 86400000));
  const [permanent, setPermanent] = useState(action === 'account-permanent' || action === 'ip-permanent');
  const [ip, setIp] = useState(initialIp || '');
  const [amount, setAmount] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isBan = action.startsWith('account-') && action !== 'account-unban' || action.startsWith('ip-') && action !== 'ip-unban';
  const title = {
    'account-temporary': 'Временная блокировка аккаунта',
    'account-permanent': 'Бессрочная блокировка аккаунта',
    'account-unban': 'Разблокировать аккаунт',
    'ip-temporary': 'Временная блокировка IP',
    'ip-permanent': 'Бессрочная блокировка IP',
    'ip-unban': 'Снять IP-блокировку',
    coins: 'Изменение монет игрока',
    delete: 'Безвозвратное удаление аккаунта',
  }[action] || 'Подтверждение действия';

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setError(''); setSaving(true);
    try {
      const schedule = {
        startAt: new Date(start).getTime(),
        endsAt: permanent ? null : new Date(end).getTime(), reason: reason.trim(),
      };
      if (isBan && (!reason.trim() || !Number.isFinite(schedule.startAt) || (!permanent && !Number.isFinite(schedule.endsAt)))) {
        throw new Error('Заполни причину и корректные даты.');
      }
      if ((action === 'delete' || action === 'ip-temporary' || action === 'ip-permanent' || action === 'ip-unban') && !confirmation) {
        throw new Error('Подтверди опасную операцию.');
      }
      if (action.startsWith('ip-') && confirmation !== ip) throw new Error('Для подтверждения точно введи IP-адрес.');
      let path, data, method = 'POST';
      if (action === 'account-temporary' || action === 'account-permanent') {
        path = `players/${encodeURIComponent(player.id)}/ban`; data = schedule;
      } else if (action === 'account-unban') {
        path = `players/${encodeURIComponent(player.id)}/unban`; data = {};
      } else if (action === 'ip-temporary' || action === 'ip-permanent') {
        path = 'ip-bans'; data = { ...schedule, ip };
      } else if (action === 'ip-unban') {
        path = 'ip-bans/unban'; data = { ip };
      } else if (action === 'coins') {
        const parsed = Number(amount);
        if (!Number.isSafeInteger(parsed) || parsed === 0 || Math.abs(parsed) > 1000000 || !reason.trim()) throw new Error('Введи сумму от 1 до 1 000 000 и причину.');
        path = `players/${encodeURIComponent(player.id)}/coins`; data = { amount: parsed, reason: reason.trim() };
      } else {
        if (confirmation !== player.username) throw new Error('Для удаления введи точный логин игрока.');
        if (!reason.trim()) throw new Error('Нужна причина удаления.');
        path = `players/${encodeURIComponent(player.id)}`; data = { confirmation, reason: reason.trim() }; method = 'DELETE';
      }
      const result = await adminRequest(path, { token, body: data, method });
      await onSuccess(action, result);
      onClose();
    } catch (cause) { setError(cause?.status || /^[A-Z_]+$/.test(cause?.message || '') ? adminErrorText(cause) : cause?.message || 'Проверь данные.'); }
    finally { setSaving(false); }
  }

  return <div className="kc-action-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="kc-action-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="kc-action-modal__heading"><div><small>ADMIN ACTION</small><h3>{title}</h3></div><button type="button" className="kc-action-modal__x" onClick={onClose}>×</button></div>
      <p className="kc-action-modal__explain">{action.startsWith('ip-') ? 'Блокировка публичного IP может затронуть других людей в той же сети.' : action === 'delete' ? 'Все данные аккаунта будут безвозвратно удалены из базы. Действие нельзя отменить.' : action === 'coins' ? 'Изменение баланса происходит на сервере и сохраняется в журнале действий.' : 'Действие выполняется на сервере. Игрок потеряет доступ по окончании подтверждения.'}</p>
      <form className="kc-action-form" onSubmit={submit}>
        {action.startsWith('ip-') ? <label>Публичный IP-адрес<input value={ip} onChange={event => setIp(event.target.value)} placeholder="Например, 203.0.113.2" required /></label> : null}
        {isBan ? <><label>Начало блокировки<input type="datetime-local" value={start} onChange={event => setStart(event.target.value)} required /></label><label className="kc-checkline"><input type="checkbox" checked={permanent} onChange={event => setPermanent(event.target.checked)} /> Без срока окончания</label>{!permanent ? <label>До какого времени<input type="datetime-local" value={end} min={start} onChange={event => setEnd(event.target.value)} required /></label> : null}</> : null}
        {action === 'coins' ? <label>Изменить монеты (плюс = выдать, минус = списать)<input type="number" min="-1000000" max="1000000" step="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Например, 500" required /></label> : null}
        {(isBan || action === 'coins' || action === 'delete') ? <label>Причина действия<textarea value={reason} maxLength={500} onChange={event => setReason(event.target.value)} placeholder="Укажи причину для журнала модерации" required /></label> : null}
        {(action === 'delete' || action.startsWith('ip-')) ? <label>Подтверждение: введи {action === 'delete' ? `логин «${player.username}»` : `IP «${ip || '…'}»`}<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label> : null}
        {error ? <div className="kc-action-error" role="alert">{error}</div> : null}
        <div className="kc-action-modal__footer"><button type="button" className="kc-outlinebtn" onClick={onClose}>Отмена</button><button type="submit" className={`kc-gradientbtn ${action === 'delete' ? 'kc-gradientbtn--danger' : ''}`} disabled={saving}>{saving ? 'Выполняется…' : 'Подтвердить действие'}</button></div>
      </form>
    </section>
  </div>;
}

export function AdminPlayerActions({ player, token, onChanged, onDeleted }) {
  const [action, setAction] = useState('');
  const [selectedIp, setSelectedIp] = useState('');
  const [message, setMessage] = useState('');
  const open = (next, ip = '') => { setSelectedIp(ip); setAction(next); setMessage(''); };
  const onSuccess = async (kind, result) => {
    if (kind === 'delete') { onDeleted(); return; }
    await onChanged();
    setMessage(kind === 'coins' ? `Баланс обновлён: ${new Intl.NumberFormat('ru-RU').format(result.coins)} монет.` : 'Изменения сохранены на сервере.');
  };
  return <section className="kc-panel kc-actions-card">
    <div className="kc-panel__heading"><h2>🛡️ Управление аккаунтом</h2>{player.ban ? <span className="kc-ban-tag">Заблокирован</span> : <span className="kc-online">● Без блокировки</span>}</div>
    {player.ban ? <div className="kc-ban-summary">{player.ban.permanent ? 'Бессрочно' : `С ${formatDate(player.ban.startAt)} до ${formatDate(player.ban.endsAt)}`} · {player.ban.reason}</div> : null}
    <div className="kc-actions-toolbar">
      <button type="button" onClick={() => open('account-temporary')} className="kc-outlinebtn">Временный бан</button>
      <button type="button" onClick={() => open('account-permanent')} className="kc-outlinebtn">Бан навсегда</button>
      {player.ban && <button type="button" onClick={() => open('account-unban')} className="kc-outlinebtn kc-outlinebtn--safe">Разбанить</button>}
      <button type="button" onClick={() => open('coins')} className="kc-outlinebtn kc-outlinebtn--gold">Выдать / списать монеты</button>
      <button type="button" onClick={() => open('delete')} className="kc-outlinebtn kc-outlinebtn--danger">Удалить аккаунт</button>
    </div>
    <div className="kc-ip-section">
      <h3>Публичные IP-адреса</h3>
      {player.knownIps?.length ? <div className="kc-ip-list">{player.knownIps.map(row => <div className="kc-ip-row" key={row.ip}>
        <div><strong>{row.ip}</strong><small>Последний вход: {formatDate(row.lastSeenAt)}</small></div>
        <button type="button" className="kc-outlinebtn" onClick={() => open(row.banned ? 'ip-unban' : 'ip-permanent', row.ip)}>{row.banned ? 'Разбанить IP' : 'Забанить IP'}</button>
      </div>)}</div> : <p className="kc-subtle">История публичных IP появится после новых входов пользователей. Ранее она не собиралась.</p>}
    </div>
    {message ? <div className="kc-action-success" role="status">{message}</div> : null}
    {action ? <BanForm key={`${action}:${selectedIp}`} action={action} player={player} initialIp={selectedIp} token={token} onClose={() => setAction('')} onSuccess={onSuccess} /> : null}
  </section>;
}

export function AdminBansList({ token, onOpenPlayer }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const reload = () => adminRequest('bans', { token }).then(result => { setData(result); setError(''); }).catch(err => setError(adminErrorText(err)));
  useEffect(() => { reload(); }, [token]);
  async function remove(item, kind) {
    const id = kind === 'ip' ? item.ip : item.userId;
    if (!window.confirm(`Снять блокировку с ${id}?`)) return;
    setBusy(id); setError('');
    try {
      if (kind === 'ip') await adminRequest('ip-bans/unban', { token, body: { ip:id } });
      else await adminRequest(`players/${encodeURIComponent(id)}/unban`, { token, body:{} });
      await reload();
    } catch (err) { setError(adminErrorText(err)); }
    finally { setBusy(''); }
  }
  const all = [...(data?.accounts || []).map(item => ({...item, kind:'account'})), ...(data?.ips || []).map(item=>({...item,kind:'ip'}))]
    .sort((a,b)=>b.startAt-a.startAt);
  return <section className="kc-panel"><div className="kc-panel__heading"><h2>Реестр блокировок</h2><button className="kc-outlinebtn" type="button" onClick={reload}>Обновить</button></div>
    <p className="kc-subtle">Блокировки на уровне сервера. Временные автоматически прекращаются после срока; бессрочные снимаются только вручную.</p>
    {error ? <div className="kc-action-error" role="alert">{error}</div> : null}
    {!data && !error ? <div className="kc-loading">Загрузка блокировок…</div> : null}
    {data && !all.length ? <div className="kc-empty">Список блокировок пуст</div> : null}
    {all.length ? <div className="kc-tablebox"><table><thead><tr><th>Тип</th><th>Цель</th><th>Начало</th><th>Окончание</th><th>Причина</th><th>Действие</th></tr></thead><tbody>{all.map(item => { const id=item.kind === 'ip' ? item.ip : item.userId;const expired=item.endsAt && item.endsAt < Date.now();return <tr key={`${item.kind}:${id}`}><td>{item.kind === 'ip' ? 'IP' : 'Аккаунт'}</td><td>{item.kind === 'account' ? <button type="button" className="kc-textbutton" onClick={() => onOpenPlayer(id)}>{id}</button> : id}</td><td>{formatDate(item.startAt)}</td><td>{expired ? 'Истёк' : formatDate(item.endsAt)}</td><td>{item.reason}</td><td><button type="button" className="kc-outlinebtn" onClick={() => remove(item, item.kind)} disabled={busy === id}>Разбанить</button></td></tr>; })}</tbody></table></div> : null}
  </section>;
}
