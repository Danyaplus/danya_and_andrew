import { useCallback, useEffect, useState } from 'react';
import { games } from '../games/index.js';
import { apiRequest, socket } from '../lib/socket.js';
import { useTranslation } from '../lib/i18n.jsx';
import '../styles/arena.css';

export default function DuelModal({ token, friend, inviteId = null, onClose }) {
  const { t, language } = useTranslation();
  const [chosen, setChosen] = useState(games[0]?.id || 'chess');
  const [inbox, setInbox] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load=useCallback(async()=>{
    try { const data=await apiRequest('/api/duels/invites',{token});setInbox(data.invites||[]); }
    catch { setMessage('Не удалось получить приглашения.'); }
  },[token]);
  useEffect(()=>{void load();const refresh=()=>void load(); socket.on('duel:invite',refresh);
    return ()=>socket.off('duel:invite',refresh);},[load]);
  async function invite(){
    if (!friend?.id) return;
    setBusy(true);setMessage('');
    try { await apiRequest('/api/duels/invite',{token,method:'POST',body:{userId:friend.id,gameId:chosen}});
      setMessage(language === 'en' ? `Invitation sent to @${friend.username}. Waiting for a reply.` : language === 'uk' ? `Запрошення для @${friend.username} надіслано. Чекаємо на відповідь.` : `Приглашение @${friend.username} отправлено. Ждём ответа.`);
    } catch(e){setMessage(e.message==='DUEL_ALREADY_INVITED'?'Такое приглашение уже отправлено.':'Не удалось отправить приглашение.');}
    finally{setBusy(false);}
  }
  async function respond(id,accept){
    setBusy(true);setMessage('');
    try {await apiRequest(`/api/duels/${encodeURIComponent(id)}/respond`,{token,method:'POST',body:{accept}});
      if (accept) {setMessage('Принято! Открываем игру…'); onClose();}
      else {setInbox((prev)=>prev.filter((x)=>x.id!==id));}
    } catch(e) {setMessage(({FRIEND_OFFLINE:'Друг сейчас не в сети.',PLAYER_BUSY:'Кто-то из вас уже играет.',DUEL_EXPIRED:'Приглашение истекло.'})[e.message] || 'Не удалось принять приглашение.');}
    finally {setBusy(false);void load();}
  }
  return <div className="arena-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="arena-duel-modal" role="dialog" aria-modal="true" aria-label="Вызвать друга" onClick={(e)=>e.stopPropagation()}>
      <button className="arena-close" type="button" onClick={onClose}>×</button>
      <span className="arena-kicker">CODUMI DUEL</span><h2>⚔️ Дуэли с друзьями</h2>
      {friend && <div className="arena-duel-compose"><h3>Вызвать @{friend.username}</h3>
        <label>Выбери игру<select value={chosen} onChange={(e)=>setChosen(e.target.value)}>{games.map((game)=><option key={game.id} value={game.id}>{t(game.title)}</option>)}</select></label>
        <button className="arena-primary" onClick={invite} type="button" disabled={busy}>Отправить вызов →</button></div>}
      <h3>Входящие приглашения</h3>
      {inbox.filter((x)=>!inviteId || x.id===inviteId).length===0 && <p className="arena-muted">Пока нет активных приглашений.</p>}
      <div className="arena-inbox">{inbox.filter((x)=>!inviteId || x.id===inviteId).map((item)=><article key={item.id}>
        <div><b>@{item.fromUsername}</b><small>Приглашает в {t(games.find((g)=>g.id===item.game_id)?.title || item.game_id)} · действует 15 минут</small></div>
        <div><button type="button" disabled={busy} onClick={()=>respond(item.id,true)}>Принять</button><button type="button" disabled={busy} className="is-muted" onClick={()=>respond(item.id,false)}>Отказать</button></div>
      </article>)}</div>
      {message && <p className="arena-feedback">{message}</p>}
    </section>
  </div>;
}
