import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/socket.js';
import { SHOP_CATALOG } from '../lib/shopCatalog.js';
import '../styles/cosmetics.css';

const sections = [
  {id:'site',icon:'🌐',title:'Фон всего сайта',subtitle:'Меняй настроение всех страниц — один бесплатный и три эксклюзивных оформления'},
  {id:'background',icon:'🌄',title:'Шапка профиля',subtitle:'Фон за аватаром и игровым именем'},
  {id:'emoji',icon:'✦',title:'Символ профиля',subtitle:'Выбери украшение или отключи его совсем'},
  {id:'frame',icon:'◉',title:'Рамки аватара',subtitle:'Особенная рамка для твоего аватара'},
  {id:'card',icon:'▤',title:'Карточки игр',subtitle:'Стиль оформления игр в каталоге'},
];
const PRESETS = [
  {value:'#FFFFFF',name:'Белый'},
  {value:'#FF525B',name:'Красный'},
  {value:'#55DF9A',name:'Зелёный'},
  {value:'#569BFF',name:'Синий'},
];
const errorText = {
  INSUFFICIENT_COINS:'Недостаточно CODI для покупки.',
  ITEM_LOCKED:'Сначала купи этот товар.',
  ITEM_UNKNOWN:'Не удалось найти это оформление. Обнови страницу.',
  SHOP_UNAVAILABLE:'Магазин временно недоступен. Попробуй позже.',
};
const normalize = color => /^#[\da-f]{6}$/i.test(String(color)) ? color.toUpperCase() : '#FFFFFF';
function rgbFromColor(color){
  const value=normalize(color);
  return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
}
function colorFromRgb(rgb){return '#'+rgb.map(value=>Math.max(0,Math.min(255,Number(value)||0)).toString(16).padStart(2,'0')).join('').toUpperCase();}

export default function CosmeticsShop({token,shop,user,onChanged}){
  const [data,setData]=useState(shop);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [color,setColor]=useState(normalize(shop?.equipped?.nicknameColor));
  const [customOpen,setCustomOpen]=useState(false);
  const [rgb,setRgb]=useState(()=>rgbFromColor(shop?.equipped?.nicknameColor));

  useEffect(()=>setData(shop),[shop]);
  useEffect(()=>{setColor(normalize(data?.equipped?.nicknameColor));},[data?.equipped?.nicknameColor]);
  useEffect(()=>{
    if(!token)return;
    let active=true;
    apiRequest('/api/shop/me',{token}).then(result=>{
      if(active){setData(result);onChanged?.(result);setError('');}
    }).catch(()=>{if(active)setError('Не удалось обновить баланс. Попробуй ещё раз позже.');});
    return()=>{active=false;};
  },[token]);

  // Always use the bundled catalogue for cards. The server owns coin balances, ownership
  // and all purchases, but missing/old API catalogues must not erase shop categories.
  const owned=useMemo(()=>new Set(data?.owned||[]),[data?.owned]);
  const selected=data?.equipped||{};
  const savedColors=Array.isArray(data?.savedColors)?data.savedColors:[];
  const previewBackground=selected.backgroundId||'sky';

  function chooseColor(next){setColor(normalize(next));setMessage('');}
  function chooseRgb(channel,value){
    const next=rgb.map((v,i)=>i===channel ? Math.max(0,Math.min(255,Number(value)||0)) : v);
    setRgb(next);chooseColor(colorFromRgb(next));
  }
  function openPicker(){setRgb(rgbFromColor(color));setCustomOpen(true);setMessage('');}
  function mergeShop(result){setData(previous=>({...previous,...result}));onChanged?.(result);}

  async function action(type,item){
    if(busy)return;
    setBusy(item.id);setError('');setMessage('');
    try{
      const isExtra=item.kind==='site'||item.kind==='emoji';
      const result=await apiRequest(isExtra?'/api/shop/extra':'/api/shop/action',{
        token,method:'POST',body:{action:type,itemId:item.id},
      });
      mergeShop(result);
      setMessage(type==='buy'?'Куплено и применено!':'Оформление применено!');
    }catch(err){setError(errorText[err.message]||'Не удалось завершить действие. Попробуй чуть позже.');}
    finally{setBusy('');}
  }
  async function colorAction(actionName){
    if(busy)return;
    setBusy(actionName);setError('');setMessage('');
    try{
      const result=await apiRequest('/api/shop/extra',{
        token,method:'POST',body:{action:actionName,color:normalize(color)},
      });
      mergeShop(result);
      if(actionName==='save-color')setMessage('Цвет добавлен в избранную палитру.');
      else setMessage('Цвет ника применён!');
    }catch(err){setError(errorText[err.message]||'Не получилось сохранить цвет. Попробуй позже.');}
    finally{setBusy('');}
  }

  return <div className="codumi-shop" role="tabpanel">
    <header className="codumi-shop__head">
      <div className="codumi-shop__head-copy"><span className="codumi-shop__eyebrow">ЛИЧНАЯ КОЛЛЕКЦИЯ</span><h3>Магазин оформления</h3><p>Выбирай свой стиль. Купленные вещи остаются с тобой.</p></div>
      <div className="codumi-shop__balance" title="Твой баланс CODI"><span className="codumi-shop__coin-symbol">🪙</span><span className="codumi-shop__coin-amount">{Number(data?.coins??0).toLocaleString('ru-RU')}<small>БАЛАНС CODI</small></span></div>
    </header>
    <div className="codumi-shop__hint"><span>🏆 Победа <b>+20 CODI</b></span><span>☀️ Ежедневное <b>+5</b></span><span>🗓️ Еженедельное <b>+25</b></span></div>
    {error&&<div className="codumi-shop__error" role="alert">{error}</div>}
    {message&&<div className="codumi-shop__success" role="status">✓ {message}</div>}
    <section className="codumi-shop__section codumi-shop__custom-color">
      <div className="codumi-shop__section-heading"><div><span className="codumi-shop__section-eyebrow">ЦВЕТА И СТИЛЬ</span><h4>🎨 Цвет игрового ника</h4><p>Настрой цвет своего имени. Логин @username не меняется.</p></div></div>
      <div className="codumi-shop__color-picker">
        <div className={`codumi-shop__color-demo codumi-background--${previewBackground}`} style={{'--codumi-nickname-color':color}}><span>{user?.displayName||user?.username||'Игрок'}</span><small>Как будет выглядеть в твоём профиле</small></div>
        <div className="codumi-shop__color-controls">
          <div className="codumi-shop__palette-label">Готовые цвета</div>
          <div className="codumi-shop__swatches" role="group" aria-label="Готовые цвета">
            {PRESETS.map(item=><button key={item.value} type="button" className={color===item.value?'is-active':''} style={{'--swatch':item.value}} title={item.name} aria-label={item.name} aria-pressed={color===item.value} onClick={()=>chooseColor(item.value)}/>)}
            <button className="codumi-shop__picker-button" type="button" onClick={openPicker} aria-label="Создать свой RGB цвет" title="Свой RGB цвет">🎨 <span>Свой цвет</span></button>
          </div>
          <div className="codumi-shop__palette-label">Сохранённые цвета <small>{savedColors.length}/12</small></div>
          <div className="codumi-shop__saved" aria-label="Сохранённые цвета">
            {savedColors.length? savedColors.map(saved=><button key={saved} type="button" title={saved} aria-label={`Сохранённый цвет ${saved}`} aria-pressed={color===saved} style={{'--swatch':saved}} className={color===saved?'is-active':''} onClick={()=>chooseColor(saved)}/> ) : <span className="codumi-shop__saved-empty">Пока пусто — создай свой цвет 🎨</span>}
          </div>
          <button className="codumi-shop__color-apply" type="button" disabled={Boolean(busy)||color===normalize(selected.nicknameColor)} onClick={()=>colorAction('color')}>{busy==='color'?'Применяем…':color===normalize(selected.nicknameColor)?'✓ Цвет уже применён':'Применить к нику'}</button>
        </div>
      </div>
      {customOpen&&<div className="codumi-shop__rgb-panel">
        <div className="codumi-shop__rgb-heading"><strong>Свой RGB цвет</strong><button type="button" onClick={()=>setCustomOpen(false)} aria-label="Закрыть палитру">×</button></div>
        <div className="codumi-shop__rgb-controls">
          <label className="codumi-shop__native-picker"><input type="color" value={normalize(color)} aria-label="Палитра цветов" onChange={e=>{const next=normalize(e.target.value);chooseColor(next);setRgb(rgbFromColor(next));}}/><span>Выбрать на палитре</span></label>
          <div className="codumi-shop__rgb-inputs">{['R','G','B'].map((letter,index)=><label key={letter}>{letter}<input type="number" min="0" max="255" value={rgb[index]} onChange={e=>chooseRgb(index,e.target.value)}/></label>)}</div>
          <strong className="codumi-shop__hex">{color}</strong>
        </div>
        <div className="codumi-shop__rgb-actions"><button type="button" className="codumi-shop__palette-save" disabled={Boolean(busy)||savedColors.includes(color)||savedColors.length>=12} onClick={()=>colorAction('save-color')}>{busy==='save-color'?'Сохраняем…':savedColors.includes(color)?'✓ Уже в палитре':'Сохранить в палитру'}</button><button type="button" className="codumi-shop__rgb-done" onClick={()=>setCustomOpen(false)}>Готово</button></div>
      </div>}
    </section>
    {sections.map(type=>{
      const items=SHOP_CATALOG.filter(item=>item.kind===type.id);
      const key={site:'siteId',background:'backgroundId',frame:'frameId',card:'cardStyleId',emoji:'emblemId'}[type.id];
      return <section className="codumi-shop__section" key={type.id}>
        <div className="codumi-shop__section-heading"><div><span className="codumi-shop__section-eyebrow">{type.icon} КОЛЛЕКЦИЯ</span><h4>{type.title}</h4><p>{type.subtitle}</p></div><span>{items.length} вариантов</span></div>
        <div className="codumi-shop__grid">
          {items.map(item=>{
            const isOwned=item.price===0||owned.has(item.id);
            const isEquipped=selected[key]===item.id;
            return <article key={item.id} className={`codumi-shop__item ${isEquipped?'is-equipped':''} ${!isOwned?'is-locked':''}`}>
              <div className={`codumi-shop__preview codumi-shop__preview--${type.id} codumi-${type.id}--${item.id}`}>
                {type.id==='emoji'?<span className="codumi-shop__emoji">{item.id==='emoji-none'?'∅':item.icon}</span>:type.id==='site'?<span className="codumi-shop__site-mark">{item.icon}</span>:type.id==='background'?<><span className="codumi-shop__sun"/><i/><b/></>:type.id==='frame'?<div className={`user-avatar-frame user-avatar-frame--${item.id} codumi-shop__frame-example`}>👤</div>:<span className="codumi-shop__card-art">🎮<small>KODUMI</small></span>}
                {item.price>0&&!isOwned&&<span className="codumi-shop__preview-tag">✦ Премиум</span>}
              </div>
              <strong>{item.name}</strong>
              <small className="codumi-shop__price">{item.price===0?'Бесплатно':isOwned?'✓ Куплено':`🪙 ${item.price.toLocaleString('ru-RU')} CODI`}</small>
              <button disabled={Boolean(busy)||isEquipped} onClick={()=>action(isOwned?'equip':'buy',item)} type="button">{busy===item.id?'Подождите…':isEquipped?'✓ Выбрано':isOwned?'Применить':`Купить · ${item.price} CODI`}</button>
            </article>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
