import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/socket.js';
import { needsLightBackdrop } from '../lib/nicknameColor.js';
import '../styles/cosmetics.css';

const types = [
  {id:'background',title:'Фоны профиля',subtitle:'Оформление шапки твоего профиля'},
  {id:'site',title:'Фон всего сайта',subtitle:'Обои для главной страницы, каталога и остальных разделов'},
  {id:'frame',title:'Рамки аватара',subtitle:'Видны в профиле, шапке сайта и рейтинге'},
  {id:'card',title:'Стили карточек',subtitle:'Оформление игрового каталога'},
  {id:'emoji',title:'Символ профиля',subtitle:'Можно убрать символ совсем или выбрать редкий за CODI'},
];
const errors={INSUFFICIENT_COINS:'Не хватает CODI. Побеждай в играх и выполняй задания!',SHOP_UNAVAILABLE:'Магазин временно недоступен.',ITEM_LOCKED:'Сначала купи это оформление.'};

export default function CosmeticsShop({token,shop,user,onChanged}) {
  const [data,setData]=useState(shop);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [color,setColor]=useState('#FFFFFF');
  useEffect(()=>setColor(data?.equipped?.nicknameColor||'#FFFFFF'),[data?.equipped?.nicknameColor]);
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
      const isExtra=item.kind==='site'||item.kind==='emoji';
      const next=await apiRequest(isExtra?'/api/shop/extra':'/api/shop/action',{token,method:'POST',body:{action:type,itemId:item.id}});
      setData(current=>({...current,...next}));onChanged?.(next);
    }catch(err){setError(errors[err.message]||'Не удалось применить оформление.');}
    finally{setBusy('');}
  }
  async function saveColor(){
    if(busy)return;
    setBusy('color');setError('');
    try{
      const next=await apiRequest('/api/shop/extra',{token,method:'POST',body:{action:'color',color}});
      setData(current=>({...current,...next}));onChanged?.(next);
    }catch(err){setError(errors[err.message]||'Не удалось сохранить цвет. Проверь, применено ли SQL-обновление.');}
    finally{setBusy('');}
  }
  const selected=data?.equipped||{};
  return <div className="codumi-shop" role="tabpanel">
    <div className="codumi-shop__head">
      <div><h3>✨ Магазин оформления</h3><p>Покупки навсегда остаются в твоём аккаунте.</p></div>
      <div className="codumi-shop__balance"><span className="codumi-shop__coin-symbol">🪙</span><span className="codumi-shop__coin-amount">{(data?.coins??0).toLocaleString('ru-RU')}<small>CODI на счёте</small></span></div>
    </div>
    <div className="codumi-shop__hint">🏆 Победа +20 CODI · ☀️ ежедневное задание +5 · 🗓️ еженедельное +25</div>
    {!data?.extrasReady&&<div className="codumi-shop__notice">Новые фоны сайта, символы и цвет ника заработают после установки SQL-обновления из архива. Старые покупки доступны.</div>}
    {error&&<div className="codumi-shop__error" role="alert">{error}</div>}
    <section className="codumi-shop__section codumi-shop__custom-color">
      <div className="codumi-shop__section-heading"><div><h4>🎨 Цвет игрового ника</h4><p>Меняется только цвет отображаемого имени, а не логин @username.</p></div></div>
      <div className="codumi-shop__color-picker">
        <div className={`codumi-shop__color-demo codumi-background--mint ${needsLightBackdrop(color) ? 'is-dark-ink' : ''}`} style={{'--codumi-nickname-color':color}}><span>{user?.displayName||user?.username||'Игрок'}</span><small>Предпросмотр</small></div>
        <div className="codumi-shop__color-controls">
          <div className="codumi-shop__swatches" role="group" aria-label="Цвет ника">
            {['#FFFFFF','#121B36','#FFE08A','#7BF4F2','#CDA3FF','#FF8EAC','#87FFBC'].map(value=><button key={value} type="button" style={{'--swatch':value}} className={color.toUpperCase()===value?'is-active':''} aria-label={`Цвет ${value}`} title={value} onClick={()=>setColor(value)}/>)}
            <label className="codumi-shop__color-native" title="Свой цвет"><input type="color" value={color} onChange={event=>setColor(event.target.value.toUpperCase())} aria-label="Произвольный цвет"/></label>
          </div>
          <button className="codumi-shop__color-save" type="button" onClick={saveColor} disabled={Boolean(busy)||!data?.extrasReady||color.toUpperCase()===(selected.nicknameColor||'#FFFFFF').toUpperCase()}>{busy==='color'?'Сохраняем…':'Сохранить цвет'}</button>
        </div>
      </div>
    </section>
    {types.map(type=><section className="codumi-shop__section" key={type.id}>
      <div className="codumi-shop__section-heading"><div><h4>{type.title}</h4><p>{type.subtitle}</p></div><span>{(data?.catalog||[]).filter(item=>item.kind===type.id).length} вариантов</span></div>
      <div className="codumi-shop__grid">
        {(data?.catalog||[]).filter(item=>item.kind===type.id).map(item=>{
          const isOwned=item.price===0||owned.has(item.id);
          const key={background:'backgroundId',site:'siteId',frame:'frameId',card:'cardStyleId',emoji:'emblemId'}[type.id];
          const isEquipped=selected[key]===item.id;
          return <article key={item.id} className={`codumi-shop__item ${isEquipped?'is-equipped':''} ${!isOwned?'is-locked':''}`}>
            <div className={`codumi-shop__preview codumi-shop__preview--${type.id} codumi-${type.id}--${item.id}`}>
              {type.id==='emoji'?<span className="codumi-shop__emoji">{item.id==='emoji-none'?'Без значка':item.icon}</span>:type.id==='site'?<span className="codumi-shop__site-mark">{item.icon}</span>:type.id==='background'?<><span className="codumi-shop__sun"/><i/><b/></>:
                type.id==='frame'?<div className={`user-avatar-frame user-avatar-frame--${item.id} codumi-shop__frame-example`}>👤</div>:
                <span className="codumi-shop__card-art">🎮<small>CODUMI</small></span>}
            </div>
            <strong>{item.name}</strong>
            <small className="codumi-shop__price">{item.price===0?'Бесплатно':isOwned?'✓ Куплено':`🪙 ${item.price.toLocaleString('ru-RU')} CODI`}</small>
            <button disabled={Boolean(busy)||isEquipped||((type.id==='emoji'||type.id==='site')&&!data?.extrasReady)} onClick={()=>action(isOwned?'equip':'buy',item)} type="button">
              {busy===item.id?'Подождите…':isEquipped?'✓ Выбрано':isOwned?'Применить':`Купить · ${item.price} CODI`}
            </button>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}
