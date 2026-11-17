import { useEffect, useState } from 'react';
import { adminErrorText, adminRequest } from '../lib/adminApi.js';
import './admin-platform.css';

const formatter = new Intl.DateTimeFormat('ru-RU', {dateStyle:'short',timeStyle:'short'});
const fmt = ms => ms ? formatter.format(new Date(ms)) : '—';
const statuses = [
  { id:'enabled',title:'Включена',details:'Игра доступна и подбирает соперника.' },
  { id:'matchmaking_off',title:'Подбор отключён',details:'Игру видно в каталоге, но новые матчи недоступны.' },
  { id:'maintenance',title:'На обслуживании',details:'Серая карточка и сообщение о техническом перерыве.' },
  { id:'disabled',title:'Выключена',details:'Игра закрыта для новых матчей.' },
];
function readableError(err){
  const map={
    TRANSLATION_NOT_CONFIGURED:'Для автоматического перевода укажи GOOGLE_TRANSLATE_API_KEY или LIBRETRANSLATE_URL на backend в Render.',
    TRANSLATION_UNAVAILABLE:'Сервис перевода не ответил. Объявление не опубликовано; повтори попытку.',
    INVALID_SCHEDULE:'Неверный период: окончание должно быть позже начала, срок — не больше 90 дней.',
    INVALID_ANNOUNCEMENT:'Введи текст объявления (не более 500 символов).',
    PLATFORM_NOT_CONFIGURED:'Выполни SQL-миграцию управления платформой в Supabase и перезапусти backend.',
    ADMIN_PLATFORM_FAILED:'Не удалось сохранить данные в Supabase. Проверь сервер и SQL-миграцию.',
    INVALID_GAME_STATUS:'Неизвестный статус игры.',
  };
  return map[err?.message] || adminErrorText(err);
}
function Notice({error,success}){return <>{error ? <div className="kc-platform-error" role="alert">{readableError(error)}</div> : null}{success ? <div className="kc-platform-success" role="status">{success}</div> : null}</>}
function localInput(ms){
  const d=new Date(ms); const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminAnnouncements({token}){
  const [items,setItems]=useState([]), [loading,setLoading]=useState(true), [busy,setBusy]=useState(false),[error,setError]=useState(null),[success,setSuccess]=useState('');
  const [text,setText]=useState(''), [start,setStart]=useState(localInput(Date.now()+60000)),[end,setEnd]=useState(localInput(Date.now()+3600000));
  async function load(){setError(null);try{const data=await adminRequest('platform/announcements',{token});setItems(data.announcements||[]);}catch(e){setError(e);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[token]);
  async function publish(event){event.preventDefault();if(busy)return;setBusy(true);setError(null);setSuccess('');
    try{const result=await adminRequest('platform/announcements',{token,body:{text,startAt:new Date(start).getTime(),endAt:new Date(end).getTime()},timeoutMs:75000});
      setItems(old=>[{id:result.announcement.id,originalText:result.announcement.original_text,translations:result.announcement.translations,startAt:Number(result.announcement.start_at),endAt:Number(result.announcement.end_at),createdAt:Number(result.announcement.created_at),enabled:true},...old]);
      setText('');setSuccess('Объявление сохранено. Оно появится у игроков в назначенное время на их языке.');
    }catch(e){setError(e);}finally{setBusy(false);}}
  async function disable(id){if(!window.confirm('Снять это объявление с публикации?'))return;setBusy(true);setError(null);try{await adminRequest(`platform/announcements/${encodeURIComponent(id)}/disable`,{token,body:{}});setItems(old=>old.map(item=>item.id===id?{...item,enabled:false}:item));}catch(e){setError(e);}finally{setBusy(false);}}
  const now=Date.now();
  return <div className="kc-platform-layout">
    <section className="kc-platform-panel kc-platform-panel--compose">
      <div className="kc-platform-heading"><span className="kc-platform-icon">✦</span><div><h2>Новое объявление</h2><p>Одно сообщение — автоматический перевод на украинский, русский и английский.</p></div></div>
      <form onSubmit={publish} className="kc-platform-form">
        <label>Текст объявления<textarea required maxLength={500} rows={5} value={text} onChange={e=>setText(e.target.value)} placeholder="Например: Через 10 минут начнутся технические работы. Уже начатые матчи не прерываются."/><small>{text.length}/500 символов · автоматически определяется язык исходного текста</small></label>
        <div className="kc-platform-form__dates"><label>Начало показа<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label><label>Окончание<input type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
        <p className="kc-platform-hint">Письма и SMS не отправляются. Объявление появляется на сайте у всех игроков и исчезает после указанного времени. Перевод выполняется на сервере перед сохранением.</p>
        <button type="submit" className="kc-gradientbtn" disabled={busy||!text.trim()}>{busy?'Переводим и публикуем…':'Перевести и опубликовать'}</button>
      </form><Notice error={error} success={success}/>
    </section>
    <section className="kc-platform-panel"><div className="kc-platform-heading"><span className="kc-platform-icon">◷</span><div><h2>Объявления</h2><p>Запланированные, активные и завершённые</p></div><button type="button" className="kc-outlinebtn" onClick={load}>Обновить</button></div>
      {loading?<p>Загрузка…</p>:items.length===0?<div className="kc-platform-empty">Объявлений пока нет.</div>:<div className="kc-platform-announcements-list">{items.map(item=>{
        const status=!item.enabled?'Отключено':item.endAt<=now?'Завершено':item.startAt>now?'Запланировано':'Публикуется';
        return <article className="kc-platform-announcement" key={item.id}><div className="kc-platform-announcement__head"><b>{status}</b><span>{fmt(item.startAt)} – {fmt(item.endAt)}</span></div><p>{item.originalText}</p>
        <details><summary>Посмотреть переводы RU / UA / EN</summary>{['ru','uk','en'].map(lang=><div key={lang}><strong>{lang.toUpperCase()}</strong><p>{item.translations?.[lang]||'—'}</p></div>)}</details>
        {item.enabled&&item.endAt>now?<button type="button" className="kc-outlinebtn" disabled={busy} onClick={()=>disable(item.id)}>Снять с публикации</button>:null}</article>;
      })}</div>}
    </section>
  </div>;
}

export function AdminGameAvailability({token}){
  const [games,setGames]=useState([]),[search,setSearch]=useState(''),[pending,setPending]=useState(''),[error,setError]=useState(null),[success,setSuccess]=useState(''),[loading,setLoading]=useState(true);
  async function load(){try{const data=await adminRequest('platform/games',{token});setGames(data.games||[]);setError(null);}catch(e){setError(e);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[token]);
  async function change(game,next){if(pending)return;const target=statuses.find(i=>i.id===next);if(!target)return;
    if(next!=='enabled'&&!window.confirm(`Изменить статус игры «${game.title}» на «${target.title}»? Ожидающие в очереди будут отключены, текущие матчи продолжатся.`))return;
    setPending(game.id);setError(null);setSuccess('');
    try{await adminRequest(`platform/games/${encodeURIComponent(game.id)}`,{token,method:'PATCH',body:{status:next}});setGames(old=>old.map(item=>item.id===game.id?{...item,status:next}:item));setSuccess(`Статус «${game.title}» изменён.`);}catch(e){setError(e);}finally{setPending('');}}
  const filtered=games.filter(g=>`${g.title} ${g.id}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="kc-platform-panel"><div className="kc-platform-heading"><span className="kc-platform-icon">▣</span><div><h2>Управление играми</h2><p>Настройка доступности в каталоге и подборе соперника · уже начатые матчи не прерываются</p></div><span className="kc-platform-count">{games.length} игр</span></div>
    <div className="kc-platform-summary">{statuses.map(s=><div key={s.id}><b>{games.filter(g=>g.status===s.id).length}</b><span>{s.title}</span></div>)}</div>
    <input className="kc-platform-filter" type="search" placeholder="Найти игру…" value={search} onChange={e=>setSearch(e.target.value)}/><Notice error={error} success={success}/>
    {loading?<p>Загрузка игр…</p>:<div className="kc-platform-games">{filtered.map(game=><article key={game.id} className={`kc-platform-game ${game.status!=='enabled'?'kc-platform-game--off':''}`}>
      <div className="kc-platform-game__art"><img src={`${import.meta.env.BASE_URL}images/games/${encodeURIComponent(game.id)}.webp`} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>
        {game.status!=='enabled'?<span>{statuses.find(s=>s.id===game.status)?.title}</span>:null}</div>
      <div className="kc-platform-game__body"><strong>{game.title}</strong><small>{game.id}</small><select aria-label={`Статус ${game.title}`} value={game.status} disabled={pending===game.id} onChange={e=>change(game,e.target.value)}>{statuses.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
    </article>)}</div>}
    <p className="kc-platform-hint">Режим «Подбор отключён» запрещает новые матчи и реванши на сервере. Все недоступные игры в каталоге становятся серыми с пояснением. Уже идущие матчи не прерываются.</p>
  </section>;
}

const actionLabels={account_ban:'Бан аккаунта',account_unban:'Разбан аккаунта',ip_ban:'IP-блокировка',ip_unban:'Снятие IP-бана',coins_adjusted:'Изменение монет',account_deleted:'Удаление аккаунта',game_status_changed:'Статус игры изменён',announcement_published:'Объявление создано',announcement_disabled:'Объявление снято'};
export function AdminAuditHistory({token}){
  const [entries,setEntries]=useState([]),[total,setTotal]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(null);
  async function load(offset=0){if(busy)return;setBusy(true);setError(null);try{const result=await adminRequest(`platform/audit?offset=${offset}&limit=50`,{token});setEntries(old=>offset?[...old,...result.entries]:result.entries);setTotal(result.total||0);}catch(e){setError(e);}finally{setBusy(false);}}
  useEffect(()=>{void load();},[token]);
  return <section className="kc-platform-panel"><div className="kc-platform-heading"><span className="kc-platform-icon">≡</span><div><h2>История действий администратора</h2><p>Блокировки, разблокировки, монеты, удаление аккаунтов, объявления и статусы игр</p></div><button className="kc-outlinebtn" type="button" onClick={()=>load()}>Обновить</button></div>
    <Notice error={error}/><p className="kc-platform-hint">Журнал хранится в Supabase. Исторические действия отображаются только с момента включения аудита. Сейчас один администратор; будущие роли смогут записывать имя каждого оператора.</p>
    {entries.length?<div className="kc-platform-audit-table"><table><thead><tr><th>Дата</th><th>Действие</th><th>Администратор</th><th>Игрок / IP</th><th>Сумма</th><th>Причина / детали</th></tr></thead><tbody>{entries.map(item=><tr key={item.id}><td>{fmt(item.created_at)}</td><td><strong>{actionLabels[item.action]||item.action}</strong></td><td>{item.actor||'Администратор'}</td><td>{item.user_id||item.ip||item.detail?.gameId||'—'}</td><td>{item.amount==null?'—':item.amount>0?`+${item.amount}`:String(item.amount)}</td><td><details><summary>{item.reason?.slice(0,65)||'Детали'}</summary><pre>{JSON.stringify(item.detail||{},null,2)}</pre></details></td></tr>)}</tbody></table></div>:!busy?<div className="kc-platform-empty">Действий пока нет.</div>:null}
    {entries.length<total?<button type="button" className="kc-gradientbtn" disabled={busy} onClick={()=>load(entries.length)}>{busy?'Загрузка…':'Показать ещё 50'}</button>:null}
  </section>;
}
