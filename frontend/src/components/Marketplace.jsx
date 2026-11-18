import {useEffect,useMemo,useState} from 'react';
import {apiRequest} from '../lib/socket.js';
import {SHOP_CATALOG} from '../lib/shopCatalog.js';
import '../styles/marketplace.css';

const CATEGORIES=[
  {id:'all',label:'Все',icon:'✦'},
  {id:'site',label:'Фоны сайта',icon:'🌌'},
  {id:'background',label:'Шапки профиля',icon:'🏞️'},
  {id:'emoji',label:'Смайлики и иконки',icon:'✨'},
  {id:'frame',label:'Рамки профиля',icon:'🖼️'},
  {id:'title',label:'Титулы',icon:'👑'},
  {id:'card',label:'Стили карточек',icon:'🎴'},
  {id:'bundle',label:'Наборы',icon:'🎁'},
];
const kindText=Object.fromEntries(CATEGORIES.map(item=>[item.id,item.label]));
const kindIcon=Object.fromEntries(CATEGORIES.map(item=>[item.id,item.icon]));
const fmt=value=>Number(value||0).toLocaleString('ru-RU');
const legacyEquipped={site:'siteId',background:'backgroundId',frame:'frameId',card:'cardStyleId',emoji:'emblemId'};

function CategoryBar({selected,onChange,items,customCategories=[]}) {
  const counts=items.reduce((acc,item)=>{
    acc[item.kind]=(acc[item.kind]||0)+1;
    if(item.category_id)acc[item.category_id]=(acc[item.category_id]||0)+1;
    return acc;
  },{});
  const available=[...CATEGORIES,...customCategories.map(cat=>({id:cat.id,label:cat.name,icon:cat.icon||'✨',custom:true}))];
  return <nav className="kd-market__categories" aria-label="Категории магазина и инвентаря">{available.map(cat=><button type="button" key={cat.id} className={`${selected===cat.id?'is-selected':''} ${cat.custom?'kd-market__category-custom':''}`} onClick={()=>onChange(cat.id)} aria-pressed={selected===cat.id} title={cat.custom?`Пользовательская категория · ${kindText[customCategories.find(c=>c.id===cat.id)?.kind]||''}`:cat.label}>
    <span>{cat.icon}</span><b>{cat.label}</b><small>{cat.id==='all'?items.length:counts[cat.id]||0}</small>
  </button>)}</nav>;
}
function Art({imageUrl,kind,icon,members=[]}) {return <div className={`kd-market-card__art kd-market-card__art--${kind}`}>
  {imageUrl?<img src={imageUrl} alt="" loading="lazy"/>:kind==='bundle'&&members.length?<span className="kd-market-card__bundle-art">{members.slice(0,3).map(p=><span key={p.id}>{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy"/>:kindIcon[p.kind]||'✨'}</span>)}</span>:<span>{icon||kindIcon[kind]||'🎁'}</span>}
</div>;}
function ProductCard({item,owned,equipped,onAction,busy,inventory,allItems,categoryLabel}) {
  const sale=item.sale_price!=null,price=sale?item.sale_price:item.price;
  const members=item.kind==='bundle'?(item.bundle_items||[]).map(id=>allItems.find(p=>p.id===id)?.title).filter(Boolean):[];
  return <article className={`kd-market-card ${equipped?'kd-market-card--equipped':''}`}>
    <div className="kd-market-card__cover"><Art imageUrl={item.imageUrl} kind={item.kind} members={(item.bundle_items||[]).map(id=>allItems.find(p=>p.id===id)).filter(Boolean)}/>{sale&&!inventory?<b className="kd-market-card__sale">−{Math.round(100*(1-price/Math.max(1,item.price)))}%</b>:null}{equipped?<span className="kd-market-card__equipped">✓ Выбрано</span>:null}</div>
    <div className="kd-market-card__body"><small>{categoryLabel||kindText[item.kind]||item.kind}</small><h4>{item.title}</h4>{item.description?<p>{item.description}</p>:null}{members.length?<p className="kd-market-card__members">В наборе: {members.join(' · ')}</p>:null}
      {!inventory?<div className="kd-market-card__cost">{sale?<del>{fmt(item.price)}</del>:null}<strong>{fmt(price)} CODI</strong></div>:<div className="kd-market-card__cost"><strong>{item.active?'В коллекции':'Снято с продажи · в коллекции'}</strong></div>}
      {inventory?<button type="button" disabled={busy||equipped||item.kind==='bundle'} onClick={()=>onAction('equip',item)}>{equipped?'✓ Применено':item.kind==='bundle'?'Набор куплен':busy?'Применяем…':'Применить'}</button>
        :<button type="button" disabled={busy||owned} onClick={()=>onAction('buy',item)}>{owned?'✓ Куплено':busy?'Подождите…':`Купить · ${fmt(price)} CODI`}</button>}
    </div>
  </article>;
}
function LegacyItems({items,shop,token,onChanged,onReload,showcase,onOpenShowcase,busy,setBusy,setError}) {
  const equipped=shop?.equipped||{};
  async function equip(item){
    if(busy)return;
    setBusy(`legacy:${item.id}`);setError('');
    try{
      const route=['site','emoji'].includes(item.kind)?'/api/shop/extra':'/api/shop/action';
      const result=await apiRequest(route,{token,method:'POST',body:{action:'equip',itemId:item.id}});
      onChanged?.(result);
      try{await apiRequest('/api/market/unequip',{token,method:'POST',body:{kind:item.kind}});}catch{/* Legacy cosmetics work independently. */}
      window.dispatchEvent(new Event('kodumi-market-updated'));onReload();
    }catch(error){setError('Не удалось применить оформление: '+error.message);}
    finally{setBusy('');}
  }
  if(!items.length)return null;
  return <section className="kd-market__builtins"><div className="kd-market__group-heading"><h4>Стандартная коллекция</h4><span>{items.length} предметов</span></div>
    <div className="kd-market__grid">{items.map(item=>{
      const applied=equipped[legacyEquipped[item.kind]]===item.id;
      return <article className={`kd-market-card kd-market-card--legacy ${applied?'kd-market-card--equipped':''}`} key={item.id}>
        <Art kind={item.kind} icon={item.icon}/><div className="kd-market-card__body"><small>{kindText[item.kind]}</small><h4>{item.name}</h4><div className="kd-market-card__cost"><strong>{item.price===0?'Бесплатный предмет':'Приобретено'}</strong></div><button type="button" disabled={!!busy||applied} onClick={()=>equip(item)}>{applied?'✓ Применено':busy?'Подождите…':'Применить'}</button></div>
      </article>;
    })}</div>
    {showcase?.titles?.some(title=>title.owned)&&items.some(item=>item.kind==='title')?<button type="button" onClick={onOpenShowcase}>Открыть витрину титулов →</button>:null}
  </section>;
}
function MarketArea({token,shop,onChanged,mode,showcase,onOpenShowcase}) {
  const [data,setData]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState(''),[category,setCategory]=useState('all');
  const load=()=>apiRequest('/api/market/me',{token}).then(setData).catch(e=>setError(e.message==='MARKET_UNAVAILABLE'?'Новый каталог ещё не настроен в Supabase.':'Не удалось получить каталог.'));
  useEffect(()=>{if(token)void load();},[token]);
  const ownedSet=useMemo(()=>new Set(data?.owned||[]),[data?.owned]);
  const modern=useMemo(()=>mode==='inventory'?(data?.products||[]).filter(item=>ownedSet.has(item.id)):(data?.products||[]).filter(item=>item.active),[data,mode,ownedSet]);
  const legacy=useMemo(()=>mode==='inventory'?SHOP_CATALOG.filter(item=>item.price===0||(shop?.owned||[]).includes(item.id)):[],[shop?.owned,mode]);
  const ownedTitles=useMemo(()=>mode==='inventory'?(showcase?.titles||[]).filter(item=>item.owned).map(item=>({id:`paid:${item.id}`,kind:'title',name:item.title||item.name||item.id,icon:'👑',price:0,paidTitle:true})):[],[mode,showcase]);
  const allItems=useMemo(()=>[...modern,...legacy,...ownedTitles],[modern,legacy,ownedTitles]);
  const categories=data?.categories||[];
  const customIds=new Set(categories.map(cat=>cat.id));
  const shown=modern.filter(item=>category==='all'||(customIds.has(category)?item.category_id===category:item.kind===category));
  const shownLegacy=[...legacy,...ownedTitles].filter(item=>category==='all'||item.kind===category);
  async function action(type,item){
    if(busy)return;
    setBusy(item.id);setError('');setSuccess('');
    try{const payload=await apiRequest(`/api/market/${type}`,{token,method:'POST',body:{productId:item.id}});
      setData(old=>({...old,...payload}));if(typeof payload.coins==='number')onChanged?.({...shop,coins:payload.coins});
      window.dispatchEvent(new Event('kodumi-market-updated'));
      setSuccess(type==='buy'?'Предмет добавлен в инвентарь!':'Оформление применено!');
    }catch(e){setError(({INSUFFICIENT_COINS:'Недостаточно монет.',ALREADY_OWNED:'Предмет уже куплен.',NOT_OWNED:'Сначала купи товар.',MARKET_UNAVAILABLE:'Сервер пока не обновлён.',PRODUCT_NOT_AVAILABLE:'Товар больше не продаётся.'})[e.message]||'Не удалось выполнить действие.');}
    finally{setBusy('');}
  }
  return <section className="kd-market"><header><span>{mode==='inventory'?'ЛИЧНАЯ КОЛЛЕКЦИЯ':'KODUMI MARKET'}</span><h3>{mode==='inventory'?'Мой инвентарь':'Магазин оформлений'}</h3><p>{mode==='inventory'?'Выбери категорию, найди приобретённый предмет и примени его к своему профилю или сайту.':'Выбирай оформления, новые предметы, скидки и наборы. Купленные товары сохраняются в инвентаре.'}</p></header>
    <CategoryBar selected={category} onChange={setCategory} items={allItems} customCategories={categories}/>
    {success?<p className="kd-market__success" role="status">{success}</p>:null}{error?<p className="kd-market__error" role="alert">{error}</p>:null}
    {shown.length?<><div className="kd-market__group-heading"><h4>{mode==='inventory'?'Мои предметы из магазина':'Товары магазина'}</h4><span>{shown.length}</span></div><div className="kd-market__grid">{shown.map(item=><ProductCard key={item.id} item={item} owned={ownedSet.has(item.id)} equipped={data?.equipped?.[item.kind]===item.id} onAction={action} busy={!!busy} inventory={mode==='inventory'} allItems={data?.products||[]} categoryLabel={categories.find(c=>c.id===item.category_id)?.name}/>)}</div></>:null}
    {mode==='inventory'&&shownLegacy.length?<LegacyItems items={shownLegacy.filter(item=>!item.paidTitle)} shop={shop} token={token} onChanged={onChanged} onReload={load} showcase={showcase} onOpenShowcase={onOpenShowcase} busy={busy} setBusy={setBusy} setError={setError}/>:null}
    {mode==='inventory'&&shownLegacy.some(item=>item.paidTitle)?<section className="kd-market__builtins"><div className="kd-market__group-heading"><h4>Купленные титулы</h4></div><div className="kd-market__titles">{shownLegacy.filter(item=>item.paidTitle).map(item=><span key={item.id}>👑 {item.name}</span>)}<button type="button" onClick={onOpenShowcase}>Управлять в витрине титулов →</button></div></section>:null}
    {!error&&!shown.length&&!shownLegacy.length?<div className="kd-market__empty">{mode==='inventory'?'В этой категории пока нет предметов.':'В этой категории пока нет товаров.'}</div>:null}
  </section>;
}
export function MarketOffers(props){return <MarketArea {...props} mode="shop"/>;}
export function MarketInventory(props){return <MarketArea {...props} mode="inventory"/>;}
