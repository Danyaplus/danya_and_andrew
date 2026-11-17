import {useCallback,useEffect,useState} from 'react';
import {adminRequest,adminErrorText} from '../lib/adminApi.js';
import './admin-support.css';
const categories={player_report:'Жалобы на игроков',bug:'Ошибки игр',feedback:'Отзывы',suggestion:'Пожелания',other:'Общие вопросы'};
const statuses={new:'Новое',reviewing:'В работе',resolved:'Решено',rejected:'Закрыто'};
const when=x=>new Date(x).toLocaleString('ru-RU');
function Notice({error}){return error?<p className="kc-help-error" role="alert">{adminErrorText(error)}</p>:null;}
export function AdminSupportTickets({token,onOpenPlayer}) {
  const [status,setStatus]=useState('all'),[category,setCategory]=useState('all'),[rows,setRows]=useState([]),[total,setTotal]=useState(0),[offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(null),[selected,setSelected]=useState(null),[note,setNote]=useState('');
  const load=useCallback(async(next=0,append=false)=>{setBusy(true);setError(null);
    try{const r=await adminRequest(`support/tickets?status=${status}&category=${category}&offset=${next}&limit=30`,{token});setRows(old=>append?[...old,...r.tickets]:r.tickets);setTotal(r.total);setOffset(next+r.tickets.length);}
    catch(e){setError(e);}finally{setBusy(false);}},[status,category,token]);
  useEffect(()=>{void load();},[load]);
  async function update(next){if(!selected)return;try{await adminRequest(`support/tickets/${selected.id}`,{token,method:'PATCH',body:{status:next,note}});setSelected(null);load();}catch(e){setError(e);}}
  async function image(row,index){
    // Open synchronously on the click so popup blockers do not hide evidence.
    const tab=window.open('about:blank','_blank');
    if(tab)tab.opener=null;
    try {
      const r=await adminRequest(`support/tickets/${row.id}/images/${index}`,{token});
      if(tab)tab.location.replace(r.url);
      else window.location.assign(r.url);
    } catch(e){if(tab)tab.close();setError(e);}
  }
  return <div className="kc-help-layout">
    <div className="kc-help-filters"><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Все обращения</option>{Object.entries(categories).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Любой статус</option>{Object.entries(statuses).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><button onClick={()=>load()}>↻ Обновить</button><small>Всего: {total}</small></div>
    <Notice error={error}/>
    <div className="kc-help-columns"><div className="kc-help-tickets">{rows.map(row=><button key={row.id} className={`kc-help-ticket ${selected?.id===row.id?'is-current':''}`} onClick={()=>{setSelected(row);setNote(row.admin_note||'');}}><div><span className="kc-help-category">{categories[row.category]}</span><small>{when(row.created_at)}</small></div><strong>{row.title}</strong><div><span>{row.author?.displayName||'Удалённый игрок'} · @{row.author?.username||'unknown'}</span><i>{statuses[row.status]}</i></div></button>)}{!rows.length&&!busy?<div className="kc-empty">Обращений пока нет</div>:null}{offset<total?<button className="kc-outlinebtn" disabled={busy} onClick={()=>load(offset,true)}>Загрузить ещё 30</button>:null}</div>
    <div className="kc-help-detail">{selected?<><header><span>{categories[selected.category]}</span><h2>{selected.title}</h2><p>{when(selected.created_at)}</p></header><div className="kc-help-sender"><b>Отправитель</b><button onClick={()=>onOpenPlayer(selected.author_id)}>{selected.author?.displayName||'Аккаунт удалён'} <small>@{selected.author?.username}</small> ↗</button></div>{selected.target_user_id?<div className="kc-help-sender"><b>Жалоба на</b><button onClick={()=>onOpenPlayer(selected.target_user_id)}>{selected.target?.displayName||'Аккаунт удалён'} <small>@{selected.target?.username}</small> ↗</button></div>:null}<p className="kc-help-message">{selected.body}</p>{selected.images?.length>0?<div className="kc-help-proof"><b>Фотографии</b><div>{selected.images.map((img,i)=><button key={i} onClick={()=>image(selected,i)}>📷 Фото {i+1} ↗</button>)}</div></div>:null}<label>Заметка администратора<textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} maxLength={1000}/></label><div className="kc-help-actions">{Object.entries(statuses).map(([id,name])=><button key={id} className={selected.status===id?'is-current':''} onClick={()=>update(id)}>{name}</button>)}</div></>:<div className="kc-help-placeholder">Выбери обращение слева, чтобы увидеть подробности.</div>}</div></div>
  </div>;
}
export function AdminServerDiagnostics({token,onOpenPlayer}) {
  const [hours,setHours]=useState('24'),[rows,setRows]=useState([]),[offset,setOffset]=useState(0),[total,setTotal]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  const load=useCallback(async(next=0,append=false)=>{setBusy(true);setError(null);try{const r=await adminRequest(`diagnostics?hours=${hours}&offset=${next}&limit=50`,{token});setRows(old=>append?[...old,...r.events]:r.events);setOffset(next+r.events.length);setTotal(r.total);}catch(e){setError(e);}finally{setBusy(false);}},[hours,token]);
  useEffect(()=>{void load();const t=setInterval(()=>load(),30000);return()=>clearInterval(t);},[load]);
  const stats={disconnect:rows.filter(r=>r.kind==='disconnect').length,http_error:rows.filter(r=>r.kind==='http_error').length,match_error:rows.filter(r=>r.kind==='match_error').length};
  return <div className="kc-diag"><div className="kc-help-filters"><select value={hours} onChange={e=>setHours(e.target.value)}><option value="1">Последний час</option><option value="24">24 часа</option><option value="168">7 дней</option></select><button onClick={()=>load()}>↻ Обновить</button><small>Всего событий: {total}</small></div><div className="kc-diag-stats"><div><b>{stats.disconnect}</b><span>Обрывы (в выборке)</span></div><div><b>{stats.http_error}</b><span>Ошибки API (в выборке)</span></div><div><b>{stats.match_error}</b><span>Сбои матчей (в выборке)</span></div></div><Notice error={error}/><div className="kc-diag-log">{rows.map(e=><article key={e.id} className={`kc-diag-event kc-diag-event--${e.severity}`}><span>{when(e.created_at)}</span><b>{({disconnect:'Потеря соединения',http_error:'Ошибка API',match_error:'Ошибка матча',system:'Система'})[e.kind]}</b><p>{e.details}</p>{e.game_id?<small>Игра: {e.game_id}</small>:null}{e.room_id?<small>Матч: {e.room_id}</small>:null}{e.user_id?<button onClick={()=>onOpenPlayer(e.user_id)}>Игрок: {e.user?.displayName||e.user_id} ↗</button>:null}</article>)}{!rows.length&&!busy?<p className="kc-empty">За выбранный период ошибок не обнаружено. Сбор событий начинается после установки обновления.</p>:null}</div>{offset<total?<button className="kc-outlinebtn" disabled={busy} onClick={()=>load(offset,true)}>Загрузить ещё</button>:null}</div>;
}
