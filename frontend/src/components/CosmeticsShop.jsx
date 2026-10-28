import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest } from '../lib/socket.js';
import { SHOP_CATALOG } from '../lib/shopCatalog.js';
import { titleInfo, paidTitleEmoji, PAID_TITLES } from '../lib/profileTitles.js';
import { useTranslation } from '../lib/i18n.jsx';
import '../styles/cosmetics.css';

const sections = [
  {id:'site',icon:'🌐',title:'Фон всего сайта',subtitle:'Меняй оформление всех страниц — классические и живые анимированные заставки'},
  {id:'background',icon:'🌄',title:'Шапка профиля',subtitle:'Фон за аватаром и игровым именем'},
  {id:'emoji',icon:'✦',title:'Символ профиля',subtitle:'Выбери украшение или отключи его совсем'},
  {id:'frame',icon:'◉',title:'Рамки аватара',subtitle:'Особенная рамка для твоего аватара'},
  {id:'card',icon:'▤',title:'Карточки игр',subtitle:'Стиль оформления игр в каталоге'},
  {id:'title',icon:'👑',title:'Титулы',subtitle:'Покупай титулы за CODI, затем устанавливай и раскрашивай их в витрине профиля'},
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
const LIVE_SITE_IDS = new Set(['site-orbit','site-camp','site-neocity']);
const LIVE_SITE_IMAGES = {
  'site-orbit':'space-orbit.webp',
  'site-camp':'night-camp.webp',
  'site-neocity':'neon-city.webp',
};
function rgbFromColor(color){
  const value=normalize(color);
  return [1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
}
function colorFromRgb(rgb){return '#'+rgb.map(value=>Math.max(0,Math.min(255,Number(value)||0)).toString(16).padStart(2,'0')).join('').toUpperCase();}

export default function CosmeticsShop({token,shop,user,onChanged,showcase,onShowcaseReload}){
  const { language, t } = useTranslation();
  const [data,setData]=useState(shop);
  const [busy,setBusy]=useState('');
  const [titleNotice,setTitleNotice]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [itemProblem,setItemProblem]=useState(null);
  const [favoriteArmed,setFavoriteArmed]=useState(null);
  const [deletePending,setDeletePending]=useState(null);
  const [deleteError,setDeleteError]=useState('');
  const [siteIssue,setSiteIssue]=useState('');
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
  const siteAnimationEnabled=selected.siteAnimationEnabled!==false;

  function chooseColor(next){setColor(normalize(next));setFavoriteArmed(null);setMessage('');}
  function chooseFavorite(saved){
    if(busy)return;
    if(favoriteArmed===saved){setDeleteError('');setDeletePending(saved);return;}
    setColor(normalize(saved));setFavoriteArmed(saved);setMessage('');
  }
  function dismissDelete(){if(!busy){setDeletePending(null);setDeleteError('');}}
  useEffect(()=>{
    if(!deletePending)return;
    const close=(event)=>{if(event.key==='Escape'&&!busy){setDeletePending(null);setDeleteError('');}};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[deletePending,busy]);
  function chooseRgb(channel,value){
    const next=rgb.map((v,i)=>i===channel ? Math.max(0,Math.min(255,Number(value)||0)) : v);
    setRgb(next);chooseColor(colorFromRgb(next));
  }
  function openPicker(){setRgb(rgbFromColor(color));setCustomOpen(true);setMessage('');}
  function mergeShop(result){setData(previous=>({...previous,...result}));onChanged?.(result);}

  async function action(type,item){
    if(busy)return;
    setItemProblem(null);setError('');setMessage('');
    const balance=Number(data?.coins);
    if(type==='buy' && data?.coins!==undefined && Number.isFinite(balance) && balance<item.price){
      setItemProblem({id:item.id,text:language === "en" ? `Not enough CODI: balance ${balance}, price ${item.price}.` : language === "uk" ? `Недостатньо CODI: баланс ${balance}, ціна ${item.price}.` : `Недостаточно CODI: на балансе ${balance}, а оформление стоит ${item.price}.`});
      return;
    }
    setBusy(item.id);
    try{
      const isExtra=item.kind==='site'||item.kind==='emoji';
      const result=await apiRequest(isExtra?'/api/shop/extra':'/api/shop/action',{
        token,method:'POST',body:{action:type,itemId:item.id},
      });
      if(!result?.ok||!result?.equipped)throw new Error('SHOP_UNAVAILABLE');
      mergeShop(result);
      setMessage(type==='buy'?'Куплено и применено!':'Оформление применено!');
    }catch(err){
      const balance=Number(data?.coins??0);
      const problem=err.message==='INSUFFICIENT_COINS'
        ? (language === "en" ? `Not enough CODI. This background costs ${item.price}; balance: ${balance}.` : language === "uk" ? `Бракує CODI. Цей фон коштує ${item.price}, на балансі ${balance}.` : `Не хватает CODI. Этот фон стоит ${item.price}, а на балансе ${balance}.`)
        : err.message==='ITEM_LOCKED'?'Сначала купи это оформление.'
        : err.message==='ITEM_UNKNOWN'?'Этот товар пока недоступен для покупки. Попробуй позже.'
        : 'Не удалось выполнить действие. Попробуй ещё раз позже.';
      setItemProblem({id:item.id,text:problem});
    }
    finally{setBusy('');}
  }
  async function buyTitle(title){
    if(busy || title.owned || !token) return;
    const balance = Number(data?.coins ?? 0);
    if(balance < title.price){
      setTitleNotice(language === 'en' ? 'Not enough CODI.' : language === 'uk' ? 'Недостатньо CODI.' : 'Недостаточно CODI.');
      return;
    }
    setBusy(`title-${title.id}`);
    setTitleNotice('');
    try {
      const result = await apiRequest('/api/profile/titles/buy', {token,method:'POST',body:{titleId:title.id}});
      if(!result?.ok) throw new Error('TITLE_PURCHASE_UNAVAILABLE');
      // The purchase succeeded. A later wallet refresh failure must not show
      // a misleading purchase error or encourage the user to buy twice.
      setData(previous=>({...previous, coins: result.coins}));
      try {
        const updated = await apiRequest('/api/shop/me',{token});
        mergeShop(updated);
      } catch { onChanged?.({...data, coins: result.coins}); }
      await onShowcaseReload?.();
      setTitleNotice(language === 'en' ? 'Title purchased! Equip it in your showcase.' : language === 'uk' ? 'Титул придбано! Встанови його у вітрині.' : 'Титул куплен! Установи его в витрине.');
    }catch(err){
      setTitleNotice(err.message === 'INSUFFICIENT_COINS' ? 'Недостаточно CODI.' : err.message === 'TITLE_ALREADY_OWNED' ? 'Уже куплено.' : 'Не удалось купить титул. Проверь подключение к серверу и SQL.');
      await onShowcaseReload?.();
    }finally{setBusy('');}
  }
  async function colorAction(actionName,targetColor=color){
    if(busy)return;
    setBusy(actionName==='remove-color' ? `remove-${targetColor}` : actionName);setError('');setMessage('');
    try{
      const result=await apiRequest('/api/shop/extra',{
        token,method:'POST',body:{action:actionName,color:normalize(targetColor)},
      });
      if(!result?.ok||!result?.equipped)throw new Error('SHOP_UNAVAILABLE');
      mergeShop(result);
      if(actionName==='save-color')setMessage('Цвет добавлен в избранную палитру.');
      else if(actionName==='remove-color'){
        setMessage('Цвет удалён из палитры.');
        setDeletePending(null);
        setFavoriteArmed(null);
      }else setMessage('Цвет ника применён!');
    }catch(err){
      if(actionName==='remove-color')setDeleteError('Не удалось удалить цвет. Повтори попытку позже.');
      else setError(errorText[err.message]||'Не получилось сохранить цвет. Попробуй позже.');
    }
    finally{setBusy('');}
  }
  async function toggleSiteAnimation(nextEnabled){
    if(busy)return;
    setBusy('site-animation');setError('');setSiteIssue('');setMessage('');
    try{
      const result=await apiRequest('/api/shop/extra',{
        token,method:'POST',body:{action:'site-animation',enabled:Boolean(nextEnabled)},
      });
      mergeShop(result);
      setMessage(nextEnabled?'Анимация фона включена.':'Анимация фона отключена.');
    }catch(err){setSiteIssue('Не получилось изменить анимацию. Попробуй позже.');}
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
            {PRESETS.map(item=><button key={item.value} type="button" className={color===item.value?'is-active':''} style={{'--swatch':item.value}} title={t(item.name)} aria-label={t(item.name)} aria-pressed={color===item.value} onClick={()=>chooseColor(item.value)}/>)}
            <button className="codumi-shop__picker-button" type="button" onClick={openPicker} aria-label="Создать свой RGB цвет" title="Свой RGB цвет">🎨 <span>Свой цвет</span></button>
          </div>
          <div className="codumi-shop__palette-label">Сохранённые цвета <small>{savedColors.length}/12</small></div>
          <div className="codumi-shop__saved" role="group" aria-label="Сохранённые цвета">
            {savedColors.length? savedColors.map(saved=><button
              key={saved}
              type="button"
              className={`codumi-shop__favorite ${favoriteArmed===saved?'is-armed':''}`}
              style={{'--swatch':saved}}
              title={favoriteArmed===saved?'Нажми ещё раз для удаления':'Выбрать сохранённый цвет'}
              aria-label={favoriteArmed===saved?`Удалить сохранённый цвет ${saved}`:`Выбрать сохранённый цвет ${saved}`}
              aria-pressed={favoriteArmed===saved}
              disabled={Boolean(busy)}
              onClick={()=>chooseFavorite(saved)}
            >{favoriteArmed===saved&&<span className="codumi-shop__favorite-cross" aria-hidden="true">×</span>}</button>)
              : <span className="codumi-shop__saved-empty">Пока пусто — создай свой цвет 🎨</span>}
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
      const titles = (showcase?.titles || PAID_TITLES).filter(item=>item.price>0);
      if(type.id==='title') return <section className="codumi-shop__section" key="title">
        <div className="codumi-shop__section-heading"><div><span className="codumi-shop__section-eyebrow">👑 КОЛЛЕКЦИЯ</span><h4>{language==='en'?'Titles':language==='uk'?'Титули':'Титулы'}</h4><p>{language==='en'?'Buy for CODI. Equip and customize in your showcase.':language==='uk'?'Купуй за CODI. Встановлюй і змінюй колір у вітрині.':'Покупай за CODI. Выставляй и меняй цвет в витрине.'}</p></div><span>{titles.length}</span></div>
        <div className="codumi-shop__grid">{titles.map(title=><article key={title.id} className={`codumi-shop__item codumi-shop__title-item ${title.owned?'is-equipped':'is-locked'}`}>
          <div className="codumi-shop__preview codumi-shop__title-preview" aria-hidden="true">{paidTitleEmoji[title.id] || '👑'}</div>
          <strong>{titleInfo(language,title.id)[0]}</strong><small className="codumi-shop__price">{titleInfo(language,title.id)[1]} · {title.price} CODI</small>
          <button type="button" disabled={!!busy || !!title.owned} onClick={()=>buyTitle(title)}>{title.owned?'✓ '+(language==='en'?'Owned':language==='uk'?'Придбано':'Куплено'):busy===`title-${title.id}`?'Покупаем…':`${language==='en'?'Buy':language==='uk'?'Придбати':'Купить'} · ${title.price} CODI`}</button>
        </article>)}</div>
        {titleNotice && <div className="codumi-shop__title-notice" role="status">{titleNotice}</div>}
      </section>;
      const items=SHOP_CATALOG.filter(item=>item.kind===type.id);
      const key={site:'siteId',background:'backgroundId',frame:'frameId',card:'cardStyleId',emoji:'emblemId'}[type.id];
      return <section className="codumi-shop__section" key={type.id}>
        <div className="codumi-shop__section-heading"><div><span className="codumi-shop__section-eyebrow">{type.icon} КОЛЛЕКЦИЯ</span><h4>{t(type.title)}</h4><p>{t(type.subtitle)}</p></div><span>{items.length} {t("вариантов")}</span></div>
        {type.id==='site'&&<><div className="codumi-shop__site-tools"><div className="codumi-shop__site-note"><strong>Живые фоны</strong><small>Для анимированных заставок можно отдельно включить или отключить движение.</small></div><button type="button" className={`codumi-shop__site-toggle ${siteAnimationEnabled?'is-on':'is-off'}`} disabled={Boolean(busy)} onClick={()=>toggleSiteAnimation(!siteAnimationEnabled)}>{busy==='site-animation'?'Сохраняем…':siteAnimationEnabled?'Отключить анимацию':'Включить анимацию'}</button></div>{siteIssue&&<div className="codumi-shop__item-error" role="alert">{siteIssue}</div>}</>}
        <div className="codumi-shop__grid">
          {items.map(item=>{
            const isOwned=item.price===0||owned.has(item.id);
            const isEquipped=selected[key]===item.id;
            return <article key={item.id} className={`codumi-shop__item ${isEquipped?'is-equipped':''} ${!isOwned?'is-locked':''}`}>
              <div className={`codumi-shop__preview codumi-shop__preview--${type.id} codumi-${type.id}--${item.id}`} style={item.kind==='site' && LIVE_SITE_IMAGES[item.id] ? {backgroundImage: `url(${import.meta.env.BASE_URL}live-backgrounds/${LIVE_SITE_IMAGES[item.id]})`} : undefined}>
                {type.id==='emoji'?<span className="codumi-shop__emoji">{item.id==='emoji-none'?'∅':item.icon}</span>:type.id==='site'?<span className="codumi-shop__site-mark">{item.icon}</span>:type.id==='background'?<><span className="codumi-shop__sun"/><i/><b/></>:type.id==='frame'?<div className={`user-avatar-frame user-avatar-frame--${item.id} codumi-shop__frame-example`}>👤</div>:<span className="codumi-shop__card-art">🎮<small>KODUMI</small></span>}
                {item.price>0&&!isOwned&&<span className="codumi-shop__preview-tag">✦ Премиум</span>}
                {item.kind==='site'&&LIVE_SITE_IDS.has(item.id)&&<span className="codumi-shop__preview-live">Живой</span>}
              </div>
              <strong>{t(item.name)}</strong>
              <small className="codumi-shop__price">{item.price===0?'Бесплатно':isOwned?'✓ Куплено':`🪙 ${item.price.toLocaleString('ru-RU')} CODI`}</small>
              <button disabled={Boolean(busy)||isEquipped} onClick={()=>action(isOwned?'equip':'buy',item)} type="button">{busy===item.id?(isOwned?'Применяем…':'Покупаем…'):isEquipped?'✓ Выбрано':isOwned?'Применить':`Купить · ${item.price} CODI`}</button>
              {itemProblem?.id===item.id&&<div className="codumi-shop__item-error" role="alert">{t(itemProblem.text)}</div>}
            </article>;
          })}
        </div>
      </section>;
    })}
    {deletePending&&createPortal(<div className="codumi-shop__dialog-layer">
      <div className="codumi-shop__dialog-backdrop" onClick={dismissDelete}/>
      <div className="codumi-shop__delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="codumi-color-delete-title" aria-describedby="codumi-color-delete-description">
        <div className="codumi-shop__dialog-icon" style={{'--swatch':deletePending}}/>
        <h4 id="codumi-color-delete-title">{t("Удалить любимый цвет?")}</h4>
        <p id="codumi-color-delete-description">{language === "en" ? `Color ${deletePending} will be removed from saved colors. Your nickname color will not change.` : language === "uk" ? `Колір ${deletePending} буде видалено зі збережених. Колір ніка не зміниться.` : `Цвет ${deletePending} исчезнет из сохранённых. Сам цвет ника останется без изменений.`}</p>
        {deleteError&&<p className="codumi-shop__dialog-error" role="alert">{t(deleteError)}</p>}
        <div className="codumi-shop__dialog-actions">
          <button type="button" autoFocus onClick={dismissDelete} disabled={Boolean(busy)}>{t("Отмена")}</button>
          <button type="button" className="codumi-shop__dialog-danger" disabled={Boolean(busy)} onClick={()=>colorAction('remove-color',deletePending)}>{t(busy==='remove-'+deletePending?'Удаляем…':'Да, удалить')}</button>
        </div>
      </div>
    </div>,document.body)}
  </div>;
}
