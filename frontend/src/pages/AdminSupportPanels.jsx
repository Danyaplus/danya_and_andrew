import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import AdminGlyph from './AdminGlyph.jsx';
import './admin-support.css';

const categories = {
  player_report: 'Жалоба на игрока', bug: 'Проблема с игрой', feedback: 'Отзыв',
  suggestion: 'Предложение', other: 'Другое',
};
const statuses = { new: 'Новое', reviewing: 'В работе', resolved: 'Решено', rejected: 'Закрыто' };
const statusTone = (status) => status === 'resolved' ? 'success' : status === 'rejected' ? 'muted' : status === 'reviewing' ? 'active' : 'new';
const when = (date) => date ? new Date(date).toLocaleString('ru-RU', {dateStyle:'medium',timeStyle:'short'}) : 'Дата неизвестна';
const label = (user) => user?.displayName || user?.username || 'Удалённый игрок';

function Notice({error}) { return error ? <p className="kc-help-error" role="alert">{adminErrorText(error)}</p> : null; }
function Empty({title,description}) {return <div className="kc-help-empty"><AdminGlyph name="report" size={32}/><h3>{title}</h3><p>{description}</p></div>;}
function Person({user,onClick,caption}) {return <div className="kc-help-person">
  <span className="kc-help-person__avatar">{user?.avatar?.startsWith('data:image/')?<img src={user.avatar} alt=""/>:label(user).slice(0,2).toUpperCase()}</span>
  <div><small>{caption}</small><strong>{label(user)}</strong><span>@{user?.username || 'unknown'}</span></div>
  {user?.id ? <button type="button" onClick={()=>onClick(user.id)}>Профиль ↗</button> : null}
</div>;}

export function AdminSupportTickets({token,onOpenPlayer}) {
  const [status,setStatus]=useState('all');
  const [category,setCategory]=useState('all');
  const [rows,setRows]=useState([]);
  const [total,setTotal]=useState(0);
  const [counts,setCounts]=useState({});
  const [offset,setOffset]=useState(0);
  const [busy,setBusy]=useState(false);
  const [operation,setOperation]=useState(false);
  const [error,setError]=useState(null);
  const [selected,setSelected]=useState(null);
  const [photos,setPhotos]=useState([]);
  const [photoError,setPhotoError]=useState('');
  const [zoom,setZoom]=useState(-1);

  const load = useCallback(async (next=0,append=false) => {
    setBusy(true);setError(null);
    try {
      const result=await adminRequest(`support/tickets?status=${status}&category=${category}&offset=${next}&limit=30`,{token});
      setRows(old=>append?[...old,...(result.tickets||[])]:result.tickets||[]);
      setTotal(result.total||0);setOffset(next+(result.tickets||[]).length);
    }catch(cause){setError(cause);}finally{setBusy(false);}
  },[category,status,token]);
  const refreshStats=useCallback(async()=>{
    try {const data=await adminRequest('support/stats',{token});setCounts({total:data.total,...data.counts});}
    catch(cause){setError(cause);}
  },[token]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{void refreshStats();},[refreshStats]);
  useEffect(()=>{setSelected(null);},[category,status]);
  useEffect(()=>{
    if(!selected?.images?.length){setPhotos([]);setZoom(-1);setPhotoError('');return;}
    let valid=true;
    setZoom(-1);setPhotos([]);setPhotoError('');
    Promise.all(selected.images.map((_,i)=>adminRequest(`support/tickets/${selected.id}/images/${i}`,{token})))
      .then(results=>{if(valid)setPhotos(results.map((response)=>response.url));})
      .catch(()=>{if(valid)setPhotoError('Не удалось загрузить фотографии. Попробуй открыть обращение ещё раз.');});
    return()=>{valid=false;};
  },[selected?.id,token]);
  useEffect(()=>{
    if(!selected)return;
    const escape=event=>{if(event.key==='Escape'){if(zoom>=0)setZoom(-1);else setSelected(null);}};
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[selected,zoom]);

  async function update(nextStatus){
    if(!selected||operation||nextStatus===selected.status)return;
    setOperation(true);setError(null);
    try{
      await adminRequest(`support/tickets/${selected.id}`,{token,method:'PATCH',body:{status:nextStatus}});
      setSelected(previous=>previous?{...previous,status:nextStatus}:null);
      setRows(previous=>previous.map(item=>item.id===selected.id?{...item,status:nextStatus}:item));
      await Promise.all([load(),refreshStats()]);
    }catch(cause){setError(cause);}finally{setOperation(false);}
  }
  async function clearAll(){
    if(operation||!window.confirm('Удалить ВСЕ обращения игроков и прикреплённые фотографии? Это действие необратимо.'))return;
    setOperation(true);setError(null);
    try{
      await adminRequest('support/tickets',{token,method:'DELETE',body:{confirmation:'CLEAR_SUPPORT'}});
      setSelected(null);setRows([]);setTotal(0);setOffset(0);setCounts({total:0,new:0,reviewing:0,resolved:0,rejected:0});
      await Promise.all([load(),refreshStats()]);
    }catch(cause){setError(cause);}finally{setOperation(false);}
  }

  return <div className="kc-help-layout kc-help-layout--fresh">
    <div className="kc-help-toolbar">
      <div className="kc-help-filters">
        <label>Категория <select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Все категории</option>{Object.entries(categories).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
        <label>Статус <select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Все статусы</option>{Object.entries(statuses).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
        <button type="button" className="kc-help-primary" onClick={()=>{void load();void refreshStats();}} disabled={busy}><AdminGlyph name="refresh" size={17}/> Обновить</button>
        <button type="button" className="kc-help-danger" onClick={clearAll} disabled={operation||!counts.total}><AdminGlyph name="trash" size={17}/> Очистить</button>
      </div>
      <div className="kc-help-mini-stats">{[['total','Всего'],['new','Новые'],['reviewing','В работе'],['resolved','Решено']].map(([key,name])=><div key={key}><strong>{counts[key]??'—'}</strong><span>{name}</span></div>)}</div>
    </div>
    <Notice error={error}/>
    <section className="kc-help-tickets kc-help-tickets--grid">
      <div className="kc-help-sectionhead"><h3>Входящие обращения</h3><small>{busy?'Загрузка…':`Найдено ${total} · показано ${rows.length}`}</small></div>
      <div className="kc-help-ticketgrid">
      {rows.map(row=><button type="button" className="kc-help-ticket" key={row.id} onClick={()=>setSelected(row)}>
        <div className="kc-help-ticket__top"><span className="kc-help-category">{categories[row.category]||row.category}</span><span className={`kc-status-pill kc-status-pill--${statusTone(row.status)}`}>{statuses[row.status]||row.status}</span></div>
        <strong>{row.title}</strong><p>{label(row.author)} · @{row.author?.username||'unknown'}</p>
        <div className="kc-help-ticket__bottom"><small>{when(row.created_at)}</small>{row.images?.length>0?<span><AdminGlyph name="camera" size={14}/>{row.images.length}</span>:null}</div>
      </button>)}
      </div>
      {!rows.length&&!busy?<Empty title="Ничего не найдено" description="Попробуй выбрать другую категорию или статус. Новые обращения появятся здесь автоматически после отправки игроками."/>:null}
      {offset<total?<button type="button" className="kc-outlinebtn" disabled={busy} onClick={()=>load(offset,true)}>Загрузить ещё 30</button>:null}
    </section>
    {selected?<div className="kc-help-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
      <section className="kc-help-dialog" role="dialog" aria-modal="true" aria-label={`Обращение: ${selected.title}`}>
        <header className="kc-help-dialog__head"><div><div className="kc-help-detail__title"><span className="kc-help-category">{categories[selected.category]}</span><span className={`kc-status-pill kc-status-pill--${statusTone(selected.status)}`}>{statuses[selected.status]}</span></div><h2>{selected.title}</h2><small>{when(selected.created_at)} · #{selected.id.slice(0,8)}</small></div>
          <button type="button" className="kc-help-dialog__x" onClick={()=>setSelected(null)} aria-label="Закрыть обращение"><AdminGlyph name="close" size={22}/></button></header>
        <div className="kc-help-dialog__body">
          <div className="kc-help-detail__meta"><Person user={selected.author} caption="Отправитель" onClick={onOpenPlayer}/>{selected.target_user_id?<Person user={selected.target} caption="Жалоба на" onClick={onOpenPlayer}/>:null}</div>
          {selected.game_id?<div className="kc-help-game"><AdminGlyph name="games" size={17}/> Игра: <b>{selected.game_id}</b></div>:null}
          <div className="kc-help-message"><b>Текст обращения</b><p>{selected.body}</p></div>
          {selected.images?.length>0?<div className="kc-help-proof"><b>Прикреплённые фотографии · {selected.images.length}</b>{photoError?<p className="kc-help-error">{photoError}</p>:null}<div className="kc-help-proof__grid">{selected.images.map((_,i)=><button type="button" key={i} disabled={!photos[i]} onClick={()=>setZoom(i)} title="Открыть фотографию"><span>{photos[i]?<img src={photos[i]} alt={`Фото ${i+1}`} loading="lazy"/>:<AdminGlyph name="camera" size={28}/>}</span><small>Фото {i+1} · увеличить</small></button>)}</div></div>:null}
          <div className="kc-help-review"><h3>Решение по обращению</h3><p>Выбери этап обработки. Игроку не отправляется ответное сообщение.</p><div className="kc-help-actions">{Object.entries(statuses).map(([key,name])=><button type="button" disabled={operation} key={key} className={selected.status===key?'is-current':''} onClick={()=>update(key)}>{selected.status===key?<AdminGlyph name="check" size={15}/>:null}{name}</button>)}</div></div>
        </div>
      </section>
      {zoom>=0&&photos[zoom]?<div className="kc-help-lightbox" role="dialog" aria-modal="true" aria-label={`Фото ${zoom+1}`} onMouseDown={e=>{if(e.target===e.currentTarget)setZoom(-1);}}><button type="button" onClick={()=>setZoom(-1)} aria-label="Закрыть фото"><AdminGlyph name="close" size={23}/></button><img alt={`Вложение ${zoom+1}`} src={photos[zoom]}/><span>Фото {zoom+1} из {photos.length}</span></div>:null}
    </div>:null}
  </div>;
}

const kindText={disconnect:'Потеря соединения',http_error:'Ошибка API',match_error:'Сбой матча',system:'Системное событие'};
export function AdminServerDiagnostics({token,onOpenPlayer}) {
  const [hours,setHours]=useState('24');
  const [severity,setSeverity]=useState('all');
  const [rows,setRows]=useState([]);
  const [offset,setOffset]=useState(0);
  const [total,setTotal]=useState(0);
  const [busy,setBusy]=useState(false);
  const [clearing,setClearing]=useState(false);
  const [error,setError]=useState(null);
  const load=useCallback(async(next=0,append=false)=>{
    setBusy(true);setError(null);
    try{const result=await adminRequest(`diagnostics?hours=${hours}&offset=${next}&limit=50`,{token});setRows(old=>append?[...old,...result.events]:result.events);setOffset(next+result.events.length);setTotal(result.total);}
    catch(cause){setError(cause);}finally{setBusy(false);}
  },[hours,token]);
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer);},[load]);
  const filtered=useMemo(()=>rows.filter(row=>severity==='all'||row.severity===severity),[rows,severity]);
  const stats=useMemo(()=>({disconnect:rows.filter(x=>x.kind==='disconnect').length,http_error:rows.filter(x=>x.kind==='http_error').length,match_error:rows.filter(x=>x.kind==='match_error').length}),[rows]);
  async function clear(){
    if(clearing||!window.confirm('Безвозвратно очистить журнал ошибок и отключений на сервере?'))return;
    setClearing(true);setError(null);
    try{await adminRequest('diagnostics',{token,method:'DELETE',body:{confirmation:'CLEAR_DIAGNOSTICS'}});setRows([]);setOffset(0);setTotal(0);await load();}
    catch(cause){setError(cause);}finally{setClearing(false);}
  }
  return <div className="kc-diag kc-diag--terminal">
    <div className="kc-help-toolbar"><div className="kc-help-filters"><label>Период<select value={hours} onChange={e=>setHours(e.target.value)}><option value="1">Последний час</option><option value="24">24 часа</option><option value="168">7 дней</option></select></label><label>Уровень<select value={severity} onChange={e=>setSeverity(e.target.value)}><option value="all">Все события</option><option value="error">Ошибки</option><option value="warning">Предупреждения</option><option value="info">Информация</option></select></label><button className="kc-help-primary" type="button" onClick={()=>load()} disabled={busy}><AdminGlyph name="refresh" size={17}/> Обновить</button><button className="kc-help-danger" type="button" onClick={clear} disabled={clearing||!total}><AdminGlyph name="trash" size={17}/> Очистить журнал</button></div>
      <div className="kc-help-mini-stats kc-help-mini-stats--diag">{[['disconnect','Обрывы'],['http_error','Ошибки API'],['match_error','Сбои матчей']].map(([key,name])=><div key={key}><strong>{stats[key]}</strong><span>{name} в списке</span></div>)}<div><strong>{total}</strong><span>Всего событий</span></div></div></div>
    <Notice error={error}/>
    <section className="kc-diag-terminal"><div className="kc-diag-terminal__top"><span className="kc-diag-terminal__lights" aria-hidden="true"><i/><i/><i/></span><strong><AdminGlyph name="terminal" size={16}/> SERVER / ERROR CONSOLE</strong><span className="kc-diag-terminal__online"><i/> Автообновление · 30 сек.</span></div>
      <div className="kc-diag-terminal__body" role="log" aria-label="События сервера">
        {filtered.map((entry,i)=><article key={entry.id} className={`kc-diag-line kc-diag-line--${entry.severity==='error'?'error':entry.severity==='warning'?'warning':'info'}`}>
          <span className="kc-diag-line__index">{String(i+1).padStart(3,'0')}</span><time>{when(entry.created_at)}</time><span className="kc-diag-line__level">{(entry.severity||'INFO').toUpperCase()}</span>
          <div className="kc-diag-line__content"><b>{kindText[entry.kind]||entry.kind||'Событие'}</b><p>{entry.details||'Нет дополнительных сведений'}</p><div>{entry.game_id?<code>GAME: {entry.game_id}</code>:null}{entry.room_id?<code>ROOM: {entry.room_id}</code>:null}{entry.user_id?<button type="button" onClick={()=>onOpenPlayer(entry.user_id)}>USER: {entry.user?.displayName||entry.user_id} ↗</button>:null}</div></div>
        </article>)}
        {!filtered.length?<div className="kc-diag-terminal__empty">{busy?'$ loading events…':'$ no events matched your filters'}<span className="kc-diag-terminal__caret">▋</span></div>:null}
      </div>
      <footer className="kc-diag-terminal__footer"><span>kodumi@server:~$ <b>{busy?'updating…':`${filtered.length} displayed / ${total} total`}</b></span><span>READ ONLY · ADMIN</span></footer></section>
    {offset<total?<button className="kc-outlinebtn" type="button" onClick={()=>load(offset,true)} disabled={busy}>Показать ещё 50 событий</button>:null}
  </div>;
}
