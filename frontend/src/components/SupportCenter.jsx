import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/socket.js';
import '../styles/support-center.css';
const categories = [
  ['player_report','🛡️','Жалоба на игрока'],
  ['bug','🐛','Проблема с игрой'],
  ['feedback','💬','Отзыв об игре'],
  ['suggestion','💡','Предложение'],
  ['other','✉️','Другое'],
];
function picture(file) {
  return new Promise((resolve,reject)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))return reject(new Error('Можно прикреплять только PNG, JPG или WebP.'));
    if(file.size>5_000_000)return reject(new Error('Изображение слишком большое (максимум 5 МБ до сжатия).'));
    const image=new Image(); const url=URL.createObjectURL(file);
    image.onload=()=>{
      try {
        const ratio=Math.min(1,1200/Math.max(image.width,image.height));
        const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        let quality=.78, output='';
        do { output=canvas.toDataURL('image/jpeg',quality);quality-=.11; } while(output.length>1_280_000 && quality>.33);
        if(output.length>1_360_000)throw Error('Картинка слишком большая. Попробуй другую.');
        resolve({data:output.slice(output.indexOf(',')+1),mime:'image/jpeg',url:output});
      }catch(e){reject(e);}finally{URL.revokeObjectURL(url);}
    };
    image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Не удалось открыть изображение.'));};image.src=url;
  });
}
const ERRORS={SUPPORT_DAILY_LIMIT:'Лимит: три обращения в сутки. Следующее можно отправить завтра (UTC).',INVALID_SUPPORT_TICKET:'Проверь выбранного игрока, заголовок и описание.',SUPPORT_UNAVAILABLE:'Служба поддержки недоступна. Проверь обновление сервера и SQL.',IMAGE_TOO_LARGE:'Одно из изображений слишком большое.',TARGET_NOT_FOUND:'Указанного игрока больше нет.'};
export default function SupportCenter({token,onClose,initialGameId=''}) {
  const [category,setCategory]=useState('player_report');const [title,setTitle]=useState('');const [body,setBody]=useState('');const [game,setGame]=useState(initialGameId);
  const [q,setQ]=useState('');const [found,setFound]=useState([]);const [selected,setSelected]=useState(null);
  const [images,setImages]=useState([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [sent,setSent]=useState(false);
  const [mine,setMine]=useState([]);const inputRef=useRef(null);
  useEffect(()=>{apiRequest('/api/support/mine',{token}).then(r=>setMine(r.tickets||[])).catch(()=>{});},[token]);
  useEffect(()=>{if(category!=='player_report'||q.trim().length<2||selected){setFound([]);return;}
    let alive=true;const timer=setTimeout(()=>{apiRequest(`/api/support/players?q=${encodeURIComponent(q.trim())}`,{token})
      .then(r=>{if(alive)setFound(r.players||[]);}).catch(()=>{if(alive)setFound([]);});},270);
    return()=>{alive=false;clearTimeout(timer);};},[category,q,selected,token]);
  async function attach(event){setError('');const files=[...event.target.files||[]];event.target.value='';
    if(files.length+images.length>3){setError('Максимум 3 фотографии.');return;}
    try { const next=await Promise.all(files.map(picture));setImages(old=>[...old,...next].slice(0,3)); }catch(e){setError(e.message);}
  }
  async function submit(event){event.preventDefault();if(busy)return;setBusy(true);setError('');
    try {await apiRequest('/api/support/tickets',{token,method:'POST',timeoutMs:75000,body:{category,title,body,gameId:game,targetUserId:selected?.id,images:images.map(({mime,data})=>({mime,data}))}});
      setSent(true);
      // Sending succeeded. A history refresh failure must not invite a duplicate submission.
      try { const response=await apiRequest('/api/support/mine',{token});setMine(response.tickets||[]); } catch { /* noncritical */ }
    }catch(e){setError(ERRORS[e.message]||'Не удалось отправить обращение. Повтори попытку.');}finally{setBusy(false);}
  }
  return <div className="kd-support-layer" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="kd-support" role="dialog" aria-modal="true" aria-label="Центр поддержки">
      <header className="kd-support__head"><div><span>✦ KODUMI GAMES</span><h2>Центр поддержки</h2><p>Расскажи о проблеме или предложи идею</p></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
      {sent ? <div className="kd-support__success"><b>✓ Обращение отправлено</b><p>Оно появилось в панели поддержки. Спасибо!</p><button onClick={onClose}>Готово</button></div> : <form onSubmit={submit} className="kd-support__body">
        <div className="kd-support__types">{categories.map(([id,emoji,label])=><button type="button" key={id} className={category===id?'is-selected':''} onClick={()=>{setCategory(id);setSelected(null);setQ('');}}><span>{emoji}</span>{label}</button>)}</div>
        {category==='player_report' ? <div className="kd-support__lookup"><label>На какого игрока жалуешься?</label>
          {selected ? <div className="kd-support__selected"><b>{selected.displayName} <small>@{selected.username}</small></b><button type="button" onClick={()=>{setSelected(null);setQ('');}}>Изменить</button></div> : <>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Поиск по игровому имени или логину" autoComplete="off" />
            {found.length>0?<div className="kd-support__results">{found.map(u=><button type="button" key={u.id} onClick={()=>{setSelected(u);setFound([]);}}><span className="kd-support__avatar">{u.avatar?.startsWith('data:image/')?<img src={u.avatar} alt="" />:u.displayName.slice(0,2)}</span><span><b>{u.displayName}</b><small>@{u.username}</small></span></button>)}</div>:null}</>}
        </div> : <label>Игра (необязательно)<input value={game} onChange={e=>setGame(e.target.value)} maxLength={60} placeholder="Например: шахматы" /></label>}
        <label>Тема<input value={title} onChange={e=>setTitle(e.target.value)} minLength={5} maxLength={120} required placeholder="Кратко опиши обращение"/></label>
        <label>Описание<textarea value={body} onChange={e=>setBody(e.target.value)} minLength={15} maxLength={4000} required rows={5} placeholder="Что случилось? Укажи подробности, чтобы мы могли разобраться."/></label>
        <div className="kd-support__attachments"><div><b>Доказательства</b><small>До 3 фотографий · JPG / PNG / WebP</small></div><button type="button" onClick={()=>inputRef.current?.click()}>+ Добавить фото</button><input ref={inputRef} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={attach}/></div>
        {images.length>0?<div className="kd-support__images">{images.map((img,i)=><div key={i}><img src={img.url} alt={`Вложение ${i+1}`} /><button type="button" onClick={()=>setImages(old=>old.filter((_,j)=>i!==j))} aria-label="Удалить фото">×</button></div>)}</div>:null}
        {error?<p className="kd-support__error" role="alert">{error}</p>:null}
        <footer><span>До 3 обращений в день</span><button disabled={busy||title.trim().length<5||body.trim().length<15||(category==='player_report'&&!selected)}>{busy?'Отправляем…':'Отправить обращение →'}</button></footer>
      </form>}
      {mine.length>0?<div className="kd-support__history"><b>Мои последние обращения</b>{mine.slice(0,3).map(t=><div key={t.id}><span>{t.title}</span><small>{({new:'Получено',reviewing:'На рассмотрении',resolved:'Решено',rejected:'Закрыто'})[t.status]||t.status}</small></div>)}</div>:null}
    </section>
  </div>;
}
