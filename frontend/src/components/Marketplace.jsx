import {useEffect,useMemo,useState} from 'react';
import {apiRequest} from '../lib/socket.js';
import {SHOP_CATALOG} from '../lib/shopCatalog.js';
import '../styles/marketplace.css';
const KIND_LABELS={site:'Фон сайта',background:'Шапка профиля',emoji:'Символ',frame:'Рамка',title:'Титул',card:'Карточка',bundle:'Набор'};
function currency(n){return Number(n||0).toLocaleString('ru-RU');}
function Card({item,owned,equipped,onAction,busy,inventory=false}) {
 const sale=item.sale_price!=null,price=sale?item.sale_price:item.price;
 return <article className="kd-market-card">
   <div className="kd-market-card__art">{item.imageUrl?<img src={item.imageUrl} alt="" loading="lazy" />:<span>{item.kind==='bundle'?'🎁':item.kind==='emoji'?'✨':item.kind==='title'?'👑':'🌌'}</span>}{sale?<b className="kd-market-card__sale">SALE</b>:null}</div>
   <div className="kd-market-card__body"><small>{KIND_LABELS[item.kind]}</small><h4>{item.title}</h4>{item.description?<p>{item.description}</p>:null}
   <div className="kd-market-card__cost">{!inventory?(sale?<><del>{currency(item.price)}</del><strong>{currency(price)} CODI</strong></>:<strong>{currency(price)} CODI</strong>):null}</div>
   {inventory?<button disabled={busy||equipped||item.kind==='bundle'} onClick={()=>onAction('equip',item)}>{equipped?'✓ Надето':item.kind==='bundle'?'Набор получен':'Применить'}</button>
    :<button disabled={busy||owned} onClick={()=>onAction('buy',item)}>{owned?'✓ Куплено':busy?'Подождите…':`Купить за ${currency(price)} CODI`}</button>}
   </div>
 </article>;
}
function MarketArea({token,shop,onChanged,mode,showcase,onOpenShowcase}) {
 const [data,setData]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const load=()=>apiRequest('/api/market/me',{token}).then(setData).catch(e=>setError(e.message==='MARKET_UNAVAILABLE'?'Новый каталог ещё не настроен в Supabase.':'Не удалось получить инвентарь.'));
 useEffect(()=>{if(token)load();},[token]);
 const items=useMemo(()=>mode==='inventory'?(data?.products||[]).filter(p=>data?.owned?.includes(p.id)):(data?.products||[]),[data,mode]);
 async function action(type,item){setBusy(item.id);setError('');setSuccess('');try{const payload=await apiRequest(`/api/market/${type}`,{token,method:'POST',body:{productId:item.id}});setData(old=>({...old,...payload}));
   if(typeof payload.coins==='number')onChanged?.({...shop,coins:payload.coins});
   window.dispatchEvent(new Event('kodumi-market-updated'));setSuccess(type==='buy'?'Покупка завершена!':'Оформление применено!');
 }catch(e){setError(({INSUFFICIENT_COINS:'Недостаточно монет.',ALREADY_OWNED:'Уже куплено.',NOT_OWNED:'Сначала купи товар.',MARKET_UNAVAILABLE:'Сервер ещё не обновлён.'})[e.message]||'Не удалось выполнить действие.');}finally{setBusy('');}}
 return <section className="kd-market"><header><span>{mode==='inventory'?'МОЯ КОЛЛЕКЦИЯ':'НОВИНКИ KODUMI'}</span><h3>{mode==='inventory'?'Инвентарь':'Акции и наборы'}</h3><p>{mode==='inventory'?'Купленные предметы и оформление собраны в одном месте.':'Новые оформления, скидки и комплекты от Kodumi Games.'}</p></header>
   {success?<div className="kd-market__success">{success}</div>:null}{error?<div className="kd-market__error">{error}</div>:null}
   <div className="kd-market__grid">{items.map(item=><Card key={item.id} item={item} owned={data?.owned?.includes(item.id)} equipped={data?.equipped?.[item.kind]===item.id} onAction={action} busy={!!busy} inventory={mode==='inventory'} />)}</div>
   {mode==='inventory'?<BuiltinInventory token={token} shop={shop} onChanged={onChanged} onReload={load} showcase={showcase} onOpenShowcase={onOpenShowcase}/>:null}
   {!error&&!items.length?<div className="kd-market__empty">{mode==='inventory'?'Пока нет покупок в новом каталоге.':'Новые товары пока не добавлены.'}</div>:null}
 </section>;
}
export function MarketOffers(props){return <MarketArea {...props} mode="shop" />;}
export function MarketInventory(props){return <MarketArea {...props} mode="inventory" />;}

function BuiltinInventory({token,shop,onChanged,onReload,showcase,onOpenShowcase}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  const owned=new Set(shop?.owned||[]);
  const items=SHOP_CATALOG.filter(p=>p.price===0||owned.has(p.id));
  async function equip(item) {
    setBusy(item.id);setError('');
    try {const route=['site','emoji'].includes(item.kind)?'/api/shop/extra':'/api/shop/action';
      const data=await apiRequest(route,{token,method:'POST',body:{action:'equip',itemId:item.id}});
      onChanged?.(data);
      try {await apiRequest('/api/market/unequip',{token,method:'POST',body:{kind:item.kind}});}catch{ /* Legacy shop works without marketplace SQL. */ }
      window.dispatchEvent(new Event('kodumi-market-updated'));onReload();
    }catch(e){setError('Не удалось применить оформление: '+e.message);}
    finally{setBusy('');}
  }
  return <section className="kd-market__builtins"><h4>Мои стандартные оформления</h4>
    <div className="kd-market__builtin-grid">{items.map(p=><div key={p.id}><span>{p.icon}</span><b>{p.name}</b><button type="button" disabled={!!busy} onClick={()=>equip(p)}>Применить</button></div>)}</div>
    {showcase?.titles?.some(t=>t.owned)?<div className="kd-market__titles"><strong>Купленные титулы</strong>{showcase.titles.filter(t=>t.owned).map(t=><span key={t.id}>👑 {t.id}</span>)}<button onClick={onOpenShowcase}>Открыть витрину титулов →</button></div>:null}
    {error?<p className="kd-market__error">{error}</p>:null}
  </section>;
}
