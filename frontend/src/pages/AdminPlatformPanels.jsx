import { useEffect, useState } from 'react';
import { adminErrorText, adminRequest } from '../lib/adminApi.js';
import './admin-platform.css';

const prettyDate = value => value ? new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(Number(value))) : '—';
const statuses = [
  {id:'enabled',title:'Включена',short:'Активна'},
  {id:'matchmaking_off',title:'Подбор отключён',short:'Без подбора'},
  {id:'maintenance',title:'На обслуживании',short:'Техперерыв'},
  {id:'disabled',title:'Выключена',short:'Выключена'},
];
const actionLabels={account_ban:'Блокировка аккаунта',account_unban:'Разблокировка аккаунта',ip_ban:'IP-блокировка',ip_unban:'Снятие IP-блокировки',coins_adjusted:'Изменение баланса',account_deleted:'Удаление аккаунта',game_status_changed:'Статус игры изменён',announcement_published:'Объявление опубликовано',announcement_disabled:'Объявление снято'};
const actionTone=action => action?.includes('ban') || action === 'account_deleted' ? 'danger' : action?.includes('coins') ? 'gold' : action?.includes('game') ? 'cyan' : 'purple';
function Feedback({error,success}) {return <>{error?<div role="alert" className="kc-platform-error">{error?.message==='PLATFORM_NOT_CONFIGURED'?'Не выполнена SQL-миграция управления платформой.':adminErrorText(error)}</div>:null}{success?<div role="status" className="kc-platform-success">{success}</div>:null}</>}

export function AdminAnnouncements({token}) {
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(null),[success,setSuccess]=useState('');
  const [text,setText]=useState('');
  async function load(){try{const data=await adminRequest('platform/announcements',{token});setItems(data.announcements||[]);setError(null);}catch(err){setError(err);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[token]);
  async function publish(event){event.preventDefault();if(busy||!text.trim())return;setBusy(true);setError(null);setSuccess('');
    try{const result=await adminRequest('platform/announcements',{token,body:{text:text.trim()}});
      const item=result.announcement;
      setItems(old=>[{id:item.id,originalText:item.original_text,startAt:Number(item.start_at),endAt:Number(item.end_at),createdAt:Number(item.created_at),enabled:true},...old]);
      setText('');setSuccess('Объявление отправлено всем подключённым игрокам.');
    }catch(err){setError(err);}finally{setBusy(false);}}
  return <div className="kc-announcement-layout">
    <section className="kc-announcement-composer">
      <div className="kc-announcement-composer__top"><span className="kc-announcement-icon">✦</span><div><h2>Новое объявление</h2><p>Сообщение игрокам</p></div></div>
      <form onSubmit={publish}>
        <label className="kc-announcement-editor"><span className="kc-announcement-editor__brand">✦ &nbsp;Kodumi Games:</span><textarea value={text} onChange={e=>setText(e.target.value)} rows={4} maxLength={500} required placeholder="Напиши сообщение…" aria-label="Текст объявления"/><span className="kc-announcement-editor__limit">{text.length}/500</span></label>
        <div className="kc-announcement-actions"><span className="kc-announcement-duration">◷ &nbsp;10 секунд</span><button type="submit" className="kc-gradientbtn" disabled={busy||!text.trim()}>{busy?'Отправляем…':'✦ Опубликовать'}</button></div>
      </form><Feedback error={error} success={success}/>
    </section>
    <section className="kc-announcement-history"><div className="kc-platform-header-row"><h2>Последние объявления</h2><button className="kc-outlinebtn" type="button" onClick={load}>Обновить</button></div>
      {loading?<div className="kc-platform-empty">Загрузка…</div>:!items.length?<div className="kc-platform-empty">Пока ничего нет</div>:<div className="kc-announcement-history__scroll">{items.slice(0,20).map(item=>{
        const live=item.enabled&&Number(item.endAt)>Date.now();
        return <div className="kc-announcement-item" key={item.id}><div className="kc-announcement-item__meta"><span className={live?'is-live':''}>{live?'● В эфире':'Отправлено'}</span><time>{prettyDate(item.createdAt)}</time></div><p><b>Kodumi Games:</b> {item.originalText}</p></div>;
      })}</div>}
    </section>
  </div>;
}

export function AdminGameAvailability({token}) {
  const [games,setGames]=useState([]),[search,setSearch]=useState(''),[pending,setPending]=useState(''),[error,setError]=useState(null),[success,setSuccess]=useState(''),[loading,setLoading]=useState(true);
  async function load(){try{const data=await adminRequest('platform/games',{token});setGames(data.games||[]);setError(null);}catch(err){setError(err);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[token]);
  async function change(game,next){if(pending||next===game.status)return;
    const status=statuses.find(item=>item.id===next);if(!status)return;
    if(next!=='enabled'&&!window.confirm(`Изменить статус «${game.title}» на «${status.title}»?`))return;
    setPending(game.id);setError(null);setSuccess('');
    try{await adminRequest(`platform/games/${encodeURIComponent(game.id)}`,{token,method:'PATCH',body:{status:next}});setGames(old=>old.map(item=>item.id===game.id?{...item,status:next}:item));setSuccess(`Статус игры «${game.title}» изменён.`);}catch(err){setError(err);}finally{setPending('');}}
  const filtered=games.filter(game=>`${game.title} ${game.id}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <section className="kc-games-manager">
    <div className="kc-platform-header-row"><div><h2>Управление играми</h2><p>Выбирай игру и меняй доступность</p></div><div className="kc-games-manager__total">{games.length} игр</div></div>
    <div className="kc-games-manager__stats">{statuses.map(item=><div className={`kc-games-manager__stat kc-games-manager__stat--${item.id}`} key={item.id}><strong>{games.filter(game=>game.status===item.id).length}</strong><span>{item.title}</span></div>)}</div>
    <div className="kc-games-manager__toolbar"><label className="kc-games-manager__search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск игры…" aria-label="Поиск игры"/></label><span>{filtered.length} найдено</span></div>
    <Feedback error={error} success={success}/>
    {loading?<div className="kc-platform-empty">Загружаем игры…</div>:<div className="kc-games-manager__grid">{filtered.map(game=>{
      const status=statuses.find(item=>item.id===game.status)||statuses[0];
      return <article className={`kc-game-tile kc-game-tile--${status.id}`} key={game.id}>
        <div className="kc-game-tile__image"><img src={`${import.meta.env.BASE_URL}images/games/${encodeURIComponent(game.id)}.webp`} alt="" loading="lazy" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>{status.id!=='enabled'?<span className="kc-game-tile__overlay">{status.short}</span>:null}</div>
        <div className="kc-game-tile__body"><strong title={game.title}>{game.title}</strong><span className={`kc-game-tile__status kc-game-tile__status--${status.id}`}>{status.title}</span>
          <select value={game.status} onChange={e=>change(game,e.target.value)} disabled={pending===game.id} aria-label={`Изменить доступность: ${game.title}`}>{statuses.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>
        </div>
      </article>;
    })}</div>}
  </section>;
}

export function AdminAuditHistory({token}) {
  const [entries,setEntries]=useState([]),[total,setTotal]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  async function load(offset=0){setBusy(true);setError(null);try{const data=await adminRequest(`platform/audit?offset=${offset}&limit=50`,{token});setEntries(old=>offset?[...old,...data.entries]:data.entries);setTotal(data.total||0);}catch(err){setError(err);}finally{setBusy(false);}}
  useEffect(()=>{void load();},[token]);
  return <section className="kc-audit-console"><div className="kc-platform-header-row"><div><h2>Журнал действий</h2><p>История операций администратора</p></div><button className="kc-outlinebtn" type="button" onClick={()=>load()}>Обновить</button></div>
    <Feedback error={error}/>
    <div className="kc-audit-console__bar"><span className="kc-audit-console__lights" aria-hidden="true"><i/><i/><i/></span><span>ADMIN / ACTIVITY LOG</span><span className="kc-audit-console__count">{total} записей</span></div>
    <div className="kc-audit-console__feed" role="log" aria-label="История действий">
      {!entries.length?<div className="kc-platform-empty">{busy?'Загрузка…':'Записей пока нет'}</div>:entries.map(item=>{
        const subject=item.user_id||item.ip||item.detail?.gameId||'';
        const tone=actionTone(item.action);
        return <article className={`kc-audit-line kc-audit-line--${tone}`} key={item.id}>
          <time>{prettyDate(item.created_at)}</time><div className="kc-audit-line__main"><div><b>{actionLabels[item.action]||item.action}</b>{subject?<code title={subject}>{subject}</code>:null}</div>
            <span className="kc-audit-line__meta">{item.actor||'Администратор'}{item.amount!=null?` · ${item.amount>0?'+':''}${item.amount} монет`:''}</span>
            {item.reason?<p>{item.reason}</p>:null}
            {item.detail&&Object.keys(item.detail).length>0?<details><summary>Подробности</summary><pre>{JSON.stringify(item.detail,null,2)}</pre></details>:null}
          </div>
        </article>;
      })}
    </div>
    {entries.length<total?<div className="kc-audit-console__footer"><button type="button" className="kc-gradientbtn" disabled={busy} onClick={()=>load(entries.length)}>{busy?'Загрузка…':'Загрузить ещё 50'}</button></div>:null}
  </section>;
}
