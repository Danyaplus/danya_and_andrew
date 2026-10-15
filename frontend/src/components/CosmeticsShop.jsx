import { useEffect, useMemo, useState } from 'react';
import { apiRequest, socket } from '../lib/socket.js';
import '../styles/cosmetics.css';

const types = [
  {id:'background',title:'Фоны профиля',subtitle:'Оформление шапки твоего профиля'},
  {id:'frame',title:'Рамки аватара',subtitle:'Видны в профиле, шапке сайта и рейтинге'},
  {id:'card',title:'Стили карточек',subtitle:'Оформление игрового каталога'},
  {id:'emoji',title:'Символ профиля',subtitle:'Весёлый символ и анимация на шапке'},
];
const errors={INSUFFICIENT_COINS:'Не хватает CODI. Побеждай в играх и выполняй задания!',SHOP_UNAVAILABLE:'Магазин временно недоступен.',ITEM_LOCKED:'Сначала купи это оформление.'};

export default function CosmeticsShop({token,shop,onChanged}) {
  const [data,setData]=useState(shop);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>setData(shop),[shop]);
  useEffect(()=>{
    if(!token)return undefined;
    let live=true;
    apiRequest('/api/shop/me',{token}).then(payload=>{if(live){setData(payload);onChanged?.(payload);}})
      .catch(()=>{if(live)setError('Не удалось загрузить магазин. Проверь подключение и SQL-обновление.');});
    return()=>{live=false;};
  },[token]);
  const owned=useMemo(()=>new Set(data?.owned||[]),[data?.owned]);
  async function action(type,item){
    if(busy)return;
    setBusy(item.id);setError('');
    try{
      const next=await apiRequest('/api/shop/action',{token,method:'POST',body:{action:type,itemId:item.id}});
      setData(current=>({...current,...next}));onChanged?.(next);
    }catch(err){setError(errors[err.message]||'Не удалось применить оформление.');}
    finally{setBusy('');}
  }
  const selected=data?.equipped||{};
  return <div className="codumi-shop" role="tabpanel">
    <div className="codumi-shop__head">
      <div><h3>✨ Магазин оформления</h3><p>Покупки навсегда остаются в твоём аккаунте.</p></div>
      <strong className="codumi-shop__balance">🪙 {data?.coins??'…'} CODI</strong>
    </div>
    <div className="codumi-shop__hint">🏆 Победа +20 CODI · ☀️ ежедневное задание +5 · 🗓️ еженедельное +25</div>
    {error&&<div className="codumi-shop__error" role="alert">{error}</div>}
    {types.map(type=><section className="codumi-shop__section" key={type.id}>
      <h4>{type.title}</h4><p>{type.subtitle}</p>
      <div className="codumi-shop__grid">
        {(data?.catalog||[]).filter(item=>item.kind===type.id).map(item=>{
          const isOwned=item.price===0||owned.has(item.id);
          const isEquipped=selected[`${type.id==='background'?'background':type.id==='frame'?'frame':type.id==='card'?'cardStyle':'emblem'}Id`]===item.id;
          return <article key={item.id} className={`codumi-shop__item ${isEquipped?'is-equipped':''}`}>
            <div className={`codumi-shop__preview codumi-shop__preview--${type.id} codumi-${type.id}--${item.id}`}>
              {type.id==='emoji'?<span className="codumi-shop__emoji">{item.icon}</span>:type.id==='background'?<><span className="codumi-shop__sun"/><i/><b/></>:
                type.id==='frame'?<div className={`user-avatar-frame user-avatar-frame--${item.id} codumi-shop__frame-example`}>👤</div>:
                <span className="codumi-shop__card-art">🎮<small>CODUMI</small></span>}
            </div>
            <strong>{item.name}</strong>
            <small>{item.price===0?'Бесплатно':isOwned?'Уже куплено':`🪙 ${item.price} CODI`}</small>
            <button disabled={Boolean(busy)||isEquipped} onClick={()=>action(isOwned?'equip':'buy',item)} type="button">
              {busy===item.id?'Подождите…':isEquipped?'✓ Выбрано':isOwned?'Применить':`Купить · ${item.price}`}
            </button>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}
