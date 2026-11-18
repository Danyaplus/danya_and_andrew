import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import AdminGlyph from './AdminGlyph.jsx';
import catalog from '../../../shared/cosmetics.json';
import '../styles/marketplace.css';
import './admin-ops.css';
import './admin-store-builder.css';
import './admin-market-premium.css';

const kinds = {
  site: ['Фон сайта', '🌌'], background: ['Шапка профиля', '🌄'], emoji: ['Смайлик / символ', '✨'],
  frame: ['Рамка', '🖼️'], title: ['Титул', '👑'], card: ['Карточка игры', '🎴'], bundle: ['Набор', '🎁'],
};
const fmt = n => Number(n || 0).toLocaleString('ru-RU');
const discount = p => p.sale_price == null ? null : Math.round((1 - p.sale_price / Math.max(1, p.price)) * 100);
const currentPrice = p => p.sale_price == null ? Number(p.price) : Number(p.sale_price);
const fresh = (kind = 'site') => ({ id: '', title: '', kind, description: '', price: '150', salePrice: '', categoryId: '', artMode: 'emoji', artSymbol: '', imageUrl: '', imagePath: '', active: true, bundleItems: [] });
const fromProduct = p => ({ id: p.id, title: p.title, kind: p.kind, description: p.description || '', price: String(p.price), salePrice: p.sale_price ?? '', categoryId: p.category_id || '', artMode: p.art_mode || (p.image_path ? 'image' : 'emoji'), artSymbol: p.art_symbol || '', imageUrl: p.imageUrl || '', imagePath: p.image_path || '', active: p.active, bundleItems: p.bundle_items || [] });
const isImage = src => typeof src === 'string' && /^https?:\/\//.test(src);

function Button({ icon, children, variant = 'quiet', ...props }) { return <button type="button" className={`ko-button ko-button--${variant}`} {...props}><AdminGlyph name={icon} size={17}/>{children}</button>; }
function IconButton({ name, title, onClick, danger, disabled }) { return <button className={`ko-iconbtn ${danger ? 'ko-iconbtn--danger' : ''}`} type="button" aria-label={title} title={title} onClick={onClick} disabled={disabled}><AdminGlyph name={name} size={17}/></button>; }
function Visual({ item, size = '', all = [] }) {
  const symbol = item.art_symbol || item.artSymbol || item.icon || kinds[item.kind]?.[1] || '✨';
  const builtinArtwork = { 'site-neocity': 'neon-city.webp', 'site-camp': 'night-camp.webp', 'site-orbit': 'space-orbit.webp' };
  const url = item.imageUrl || item.image_url || (builtinArtwork[item.id] ? `${import.meta.env.BASE_URL}live-backgrounds/${builtinArtwork[item.id]}` : null);
  const mode = item.art_mode || item.artMode || (url ? 'image' : 'emoji');
  const members = item.kind === 'bundle' ? (item.bundle_items || item.bundleItems || []).map(id => all.find(p => p.id === id)).filter(Boolean) : [];
  return <div className={`ko-item-art ko-item-art--${item.kind} ${size ? `ko-item-art--${size}` : ''}`}>
    {mode === 'image' && isImage(url) ? <img src={url} alt="" loading="lazy" /> : mode === 'text' ? <strong className="ko-item-art__text">{symbol}</strong> : members.length && !item.art_symbol ? <div className="ko-item-art__bundle">{members.slice(0,3).map(m=><span key={m.id}>{m.imageUrl && m.art_mode === 'image' ? <img src={m.imageUrl} alt=""/> : m.art_symbol || kinds[m.kind]?.[1]}</span>)}</div> : <span>{symbol}</span>}
  </div>;
}
async function imageData(file) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 6_000_000) throw Error('Выбери PNG, JPG или WebP до 6 МБ.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(Error('Не удалось открыть картинку.')); image.src = url; });
    const scale = Math.min(1,1600 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    let dataUrl;
    for (let quality = .86; quality >= .3; quality -= .08) { dataUrl = canvas.toDataURL('image/webp',quality); if (dataUrl.length < 1_250_000) break; }
    if (dataUrl.length > 1_250_000) throw Error('Картинка слишком большая, уменьши исходный файл.');
    return { mime:'image/webp',data:dataUrl.split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}
function StorePreview({ sections, items, legacy, categories, focus }) {
  return <div className="ko-builder-preview"><div className="ko-builder-preview__top"><small>ПРЕДПРОСМОТР МАГАЗИНА НА САЙТЕ</small><h3>Магазин оформления</h3><p>Выбирай свой стиль. Купленные вещи остаются с тобой.</p><span>🪙 CODI</span></div>
    {sections.filter(s=>s.active).map(s => {
      const products = s.section_type === 'category' ? items.filter(p=>p.active && p.category_id===s.category_id)
        : s.section_type === 'promotion' ? (s.item_ids || []).map(id=>items.find(p=>p.id===id)).filter(p=>p?.active && p.sale_price!=null)
          : items.filter(p=>p.active && p.kind===s.kind && !p.category_id);
      const builtin = s.section_type === 'legacy' ? legacy.filter(p=>p.active!==false && p.kind===s.kind) : [];
      return <section className={`ko-builder-preview__section ${focus===s.id?'is-focused':''} ${s.section_type==='promotion'?'is-promo':''}`} key={s.id}>
        <div className="ko-builder-preview__heading"><div><small>{s.icon} {s.section_type==='promotion'?'СПЕЦИАЛЬНОЕ ПРЕДЛОЖЕНИЕ':'КОЛЛЕКЦИЯ'}</small><h4>{s.title}</h4><p>{s.subtitle}</p></div><span>{s.section_type === 'color' ? '' : `${builtin.length + products.length} вариантов`}</span></div>
        {s.section_type === 'color' ? <div className="ko-builder-color"><span>Пример ника игрока</span><div>🔴 🟡 🟢 🔵 🟣 🎨</div></div> : <div className="ko-builder-preview__cards">{[...builtin,...products].slice(0,14).map(p=><div className="ko-builder-preview__product" key={p.id}><Visual item={p} all={items}/><strong>{p.title || p.name}</strong><span>{fmt(currentPrice(p))} CODI</span></div>)}{!builtin.length && !products.length ? <div className="ko-builder-preview__none">Здесь будут карточки добавленных товаров</div> : null}</div>}
      </section>;
    })}
  </div>;
}

export default function AdminMarketPanel({token}) {
  const [items,setItems] = useState([]);
  const [categories,setCategories] = useState([]);
  const [legacy,setLegacy] = useState(catalog);
  const [layout,setLayout] = useState([]);
  const [configured,setConfigured] = useState(false);
  const [tab,setTab] = useState('products');
  const [search,setSearch] = useState('');
  const [typeFilter,setTypeFilter] = useState('all');
  const [originFilter,setOriginFilter] = useState('all');
  const [editor,setEditor] = useState('product');
  const [edit,setEdit] = useState(fresh());
  const [legacyEdit,setLegacyEdit] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [sectionId,setSectionId] = useState('builtin:color');
  const [dragId,setDragId] = useState('');
  const [catDraft,setCatDraft] = useState({name:'',kind:'site',icon:'✨'});
  const [saleId,setSaleId] = useState('');
  const [saleValue,setSaleValue] = useState('');
  const [page,setPage] = useState(0);
  const uploadRef = useRef(null);
  const initialSelectionRef = useRef(false);
  const load = useCallback(async () => {
    const [market,sections] = await Promise.all([adminRequest('market/products',{token}),adminRequest('market/layout',{token})]);
    setItems(market.products || []); setCategories(market.categories || []);
    if (!initialSelectionRef.current) {
      initialSelectionRef.current = true;
      const first = (market.products || []).find(item => item.kind !== 'bundle') || (market.products || [])[0];
      if (first) { setEdit(fromProduct(first)); setEditor('product'); }
    }
    setLayout(sections.sections || []); setLegacy(sections.legacyItems || catalog); setConfigured(Boolean(sections.configured && market.configured !== false));
  },[token]);
  useEffect(()=>{load().catch(err=>setError(adminErrorText(err)));},[load]);
  useEffect(()=>setPage(0),[tab,search,typeFilter,originFilter]);
  const modify=(field,value)=>setEdit(e=>({...e,[field]:value}));
  const allLegacy=legacy.map(p=>({...p,title:p.name,legacy:true}));
  const list = useMemo(()=> (tab === 'bundles' ? items.filter(p=>p.kind==='bundle') : [...allLegacy,...items.filter(p=>p.kind!=='bundle')])
    .filter(p=>typeFilter==='all'||p.kind===typeFilter).filter(p=>originFilter==='all'||(originFilter==='builtin'?p.legacy:!p.legacy))
    .filter(p=>`${p.title} ${p.description||''} ${p.id}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[tab,items,legacy,search,typeFilter,originFilter]);
  const pageCount=Math.max(1,Math.ceil(list.length/20));
  const shown=list.slice(page*20,(page+1)*20);
  const activeSale=items.filter(p=>p.sale_price!=null);
  const selectedSection=layout.find(s=>s.id===sectionId) || layout[0];
  const changeSection=(field,value)=>setLayout(prev=>prev.map(s=>s.id===sectionId?{...s,[field]:value}:s));
  const selectedCategory=categories.find(c=>c.id===selectedSection?.category_id);
  const selectedPromo=selectedSection?.section_type==='promotion';
  async function mutate(action,message) {
    if(busy)return false;setBusy(true);setError('');setNotice('');
    try {await action();await load();setNotice(message);return true;}
    catch(err){setError(adminErrorText(err));return false;}
    finally{setBusy(false);}
  }
  function beginNew(kind='site'){setLegacyEdit(null);setEdit(fresh(kind));setEditor('product');setError('');}
  function beginEdit(p){setError('');if(p.legacy){setLegacyEdit({...p, name:p.name || p.title, icon:p.icon || kinds[p.kind]?.[1], description:p.description||'', imagePath:p.image_path||'', imageUrl:p.imageUrl||'', active:p.active!==false});setEditor('legacy');}
    else {setEdit(fromProduct(p));setEditor('product');setTab(p.kind==='bundle'?'bundles':'products');}}
  async function upload(file) {
    if(!file || busy)return;
    setBusy(true);setError('');
    try {const {mime,data}=await imageData(file);const result=await adminRequest('market/upload',{token,body:{mime,data}});
      if(editor==='legacy')setLegacyEdit(old=>({...old,imageUrl:result.imageUrl,imagePath:result.imagePath}));
      else setEdit(old=>({...old,imageUrl:result.imageUrl,imagePath:result.imagePath,artMode:'image'}));
      setNotice('Фото загружено. Нажми «Сохранить», чтобы оно появилось у игроков.');
    }catch(err){setError(err?.message === 'INVALID_IMAGE' ? adminErrorText(err) : (err.message || adminErrorText(err)));}
    finally{setBusy(false);if(uploadRef.current)uploadRef.current.value='';}
  }
  async function saveProduct(event){event.preventDefault();const p=edit;
    if(!Number.isSafeInteger(Number(p.price))||Number(p.price)<0) {setError('Укажи целую неотрицательную цену.');return;}
    if(p.salePrice!==''&&(!Number.isSafeInteger(Number(p.salePrice))||Number(p.salePrice)<0||Number(p.salePrice)>=Number(p.price))){setError('Цена по акции должна быть ниже обычной.');return;}
    if(p.kind==='bundle'&&(p.bundleItems.length<2||p.bundleItems.length>10)){setError('Для набора нужно от 2 до 10 отдельных предметов.');return;}
    if(await mutate(()=>adminRequest('market/products',{token,body:p}),'Изменения товара сохранены.'))setEditor(null);
  }
  async function saveLegacy(event){event.preventDefault();if(!legacyEdit)return;
    if(await mutate(()=>adminRequest(`market/legacy/${encodeURIComponent(legacyEdit.id)}`,{token,method:'PUT',body:{name:legacyEdit.name,icon:legacyEdit.icon,description:legacyEdit.description,imagePath:legacyEdit.imagePath,active:legacyEdit.active}}),'Оформление стандартной коллекции обновлено.'))setEditor(null);
  }
  function removeProduct(p){if(!window.confirm(`Удалить «${p.title}»? Купленные предметы удалить нельзя — их можно скрыть.`))return;
    void mutate(()=>adminRequest(`market/products/${p.id}`,{token,method:'DELETE'}),'Товар удалён.');}
  function flipProduct(p){void mutate(()=>adminRequest(`market/products/${p.id}`,{token,method:'PATCH',body:{active:!p.active}}),p.active?'Предмет скрыт.':'Предмет возвращён в магазин.');}
  function copyProduct(p){setEdit({...fromProduct(p),id:'',title:`${p.title} (копия)`});setEditor('product');setTab(p.kind==='bundle'?'bundles':'products');}
  function exportCatalog() {
    const content = JSON.stringify({ format: 'kodumi-market-backup-v1', exportedAt: new Date().toISOString(), products: items, categories, sections: layout, builtins: legacy }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'kodumi-market-catalog.json';
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Каталог, категории и порядок блоков сохранены в JSON.');
  }
  function moveSection(id,toId){if(id===toId)return;setLayout(old=>{const next=[...old];const a=next.findIndex(s=>s.id===id);const b=next.findIndex(s=>s.id===toId);if(a<0||b<0)return old;const [entry]=next.splice(a,1);next.splice(b,0,entry);return next;});setSectionId(id);}
  function shiftSection(id,amount){const i=layout.findIndex(s=>s.id===id),j=i+amount;if(i<0||j<0||j>=layout.length)return;moveSection(id,layout[j].id);}
  async function saveLayout(){if(!configured){setError('Сначала выполни SQL-миграцию конструктора магазина.');return;}
    await mutate(()=>adminRequest('market/layout',{token,method:'PUT',body:{sections:layout}}),'Расположение блоков сохранено. Теперь игроки видят этот порядок.');}
  async function createCategory(event){event.preventDefault();if(!configured){setError('Нужна SQL-миграция конструктора витрины.');return;}
    await mutate(async()=>{const result=await adminRequest('market/categories',{token,body:catDraft});setCatDraft({name:'',kind:'site',icon:'✨'});setSectionId(`category:${result.category.id}`);},'Новая категория и её блок созданы. Добавляй в неё товары.');}
  async function saveCategory(event){event.preventDefault();if(!selectedCategory)return;
    await mutate(()=>adminRequest('market/categories',{token,body:{id:selectedCategory.id,name:selectedCategory.name,kind:selectedCategory.kind,icon:selectedCategory.icon}}),'Название и значок категории обновлены.');}
  async function removeCategory(){if(!selectedCategory)return;
    if(items.some(item=>item.category_id===selectedCategory.id)){setError('В этой категории есть товары. Перемести их в другой блок, прежде чем удалять категорию.');return;}
    if(!window.confirm(`Удалить категорию «${selectedCategory.name}» и её блок? Товары не удаляются.`))return;
    const removedId=selectedCategory.id;
    await mutate(async()=>{await adminRequest(`market/categories/${removedId}`,{token,method:'DELETE'});setSectionId('builtin:color');},'Пустая категория удалена. Сохрани витрину, чтобы обновить порядок блоков.');}
  function addPromotion(){const id=`promo:${crypto.randomUUID()}`;
    const section={id,section_type:'promotion',title:'Специальное предложение',subtitle:'Выгодные предложения недели',icon:'🔥',kind:null,category_id:null,item_ids:[],active:true,sort_order:layout.length*100};
    setLayout(old=>[...old,section]);setSectionId(id);setTab('categories');setNotice('Блок акции добавлен в черновик. Выбери товары и сохрани витрину.');}
  async function setDiscount(event){event.preventDefault();const p=items.find(p=>p.id===saleId),value=Number(saleValue);
    if(!p||!Number.isSafeInteger(value)||value<0||value>=p.price){setError('Выбери товар и цену меньше обычной.');return;}
    if(await mutate(()=>adminRequest(`market/products/${p.id}`,{token,method:'PATCH',body:{salePrice:value}}),'Скидка сохранена. Можно поставить товар в рекламный блок.')){setSaleValue('');setSaleId('');}}
  return <div className="ko-screen ko-market ko-builder">
    <div className="ko-market-tabs" role="tablist">{[['products','Товары','store'],['bundles','Наборы','layers'],['sales','Акции','tag'],['categories','Конструктор витрины','folder']].map(([key,label,icon])=><button type="button" role="tab" key={key} aria-selected={tab===key} className={tab===key?'is-active':''} onClick={()=>{setTab(key);setEditor(null);setError('');setNotice('');setTypeFilter('all');setOriginFilter('all');setSearch('');}}><AdminGlyph name={icon} size={18}/>{label}</button>)}</div>
    {error&&<div className="ko-alert" role="alert">{error}</div>}{notice&&<div className="ko-alert ko-alert--success" role="status">{notice}</div>}
    {!configured&&<div className="ko-alert ko-alert--info">Конструктор ещё не активирован в Supabase. Выполни файл <code>backend/sql/2026-11-18-storefront-builder.sql</code> из обновления. До этого старый каталог и покупки остаются доступны.</div>}
    {(tab==='products'||tab==='bundles')&&<div className={`ko-builder-catalog-layout ${editor?'has-editor':''}`}><section className="ko-panel ko-builder-catalog">
      <div className="ko-builder-heading"><div><h2>{tab==='bundles'?'Все наборы':'Все товары каталога'}</h2><p>{tab==='bundles'?'Редактируй комплекты и составляй новые наборы из предметов.':'Стандартная коллекция и созданные товары — в одном списке. Нажми карточку, чтобы изменить.'}</p></div><div className="ko-builder-heading__tools"><span className="ko-builder-counter">{fmt(list.length)} предметов</span><Button icon="plus" variant="primary" onClick={()=>beginNew(tab==='bundles'?'bundle':'site')}>Добавить {tab==='bundles'?'набор':'товар'}</Button><Button icon="down" onClick={exportCatalog}>Экспорт</Button></div></div>
      <div className="ko-builder-filters"><label className="ko-builder-search"><AdminGlyph name="search" size={18}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Название, описание или ID..."/></label>{tab==='products'&&<><select aria-label="Происхождение" value={originFilter} onChange={e=>setOriginFilter(e.target.value)}><option value="all">Весь каталог</option><option value="builtin">Стандартные предметы</option><option value="custom">Добавленные товары</option></select><select aria-label="Тип товара" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">Все типы</option>{Object.entries(kinds).filter(([k])=>k!=='bundle').map(([k,[label]])=><option key={k} value={k}>{label}</option>)}</select></>}</div>
      <div className="ko-builder-grid">{shown.map(p=><article key={`${p.legacy?'builtin':'modern'}:${p.id}`} className={`ko-builder-item ${editor==='product'&&edit.id===p.id||editor==='legacy'&&legacyEdit?.id===p.id?'is-edited':''}`}><button type="button" className="ko-builder-item__open" onClick={()=>beginEdit(p)}><Visual item={p} all={items}/><span className="ko-builder-item__info" title={p.description||"Открыть редактор и описание"}>i</span><span className="ko-builder-item__copy"><small>{p.legacy?'Стандартная · ':''}{kinds[p.kind]?.[0]}</small><strong>{p.title}</strong><span>{p.active===false?'Скрыт':`${fmt(currentPrice(p))} CODI`}</span>{discount(p)!=null&&<em>−{discount(p)}%</em>}</span></button><div className="ko-builder-item__actions"><span className={`ko-market-state ${p.active!==false?'is-live':''}`}>{p.active!==false?'На витрине':'Скрыт'}</span><IconButton name="edit" title="Редактировать карточку" onClick={()=>beginEdit(p)}/>{!p.legacy&&<><IconButton name="copy" title="Создать копию" onClick={()=>copyProduct(p)}/><IconButton name="trash" title="Удалить товар" danger onClick={()=>removeProduct(p)} disabled={busy}/></>}</div></article>)}{shown.length===0&&<div className="ko-empty"><strong>Здесь пока нет товаров</strong><span>Измени фильтры или добавь новый предмет.</span></div>}</div>
      <div className="ko-builder-pagination"><span>Показано {shown.length} из {list.length}</span><div><IconButton name="back" title="Назад" disabled={!page} onClick={()=>setPage(p=>p-1)}/><b>{page+1} / {pageCount}</b><IconButton name="down" title="Далее" disabled={page+1>=pageCount} onClick={()=>setPage(p=>p+1)}/></div></div>
    </section>
    {editor&&<aside className="ko-panel ko-builder-editor"><div className="ko-builder-editor__head"><div className="ko-builder-editor__heading"><span className="ko-builder-editor__glyph"><AdminGlyph name="edit" size={22}/></span><div><h2>{editor==='legacy'?'Редактор стандартного товара':edit.kind==='bundle'?'Редактор набора':'Редактор товара'}</h2><p>{edit.id||editor==='legacy'?'Настрой параметры и внешний вид предмета.':'Создай новый предмет для витрины.'}</p></div></div><IconButton name="close" title="Закрыть" onClick={()=>setEditor(null)}/></div>
      {editor==='legacy'?<form className="ko-builder-form" onSubmit={saveLegacy}><Visual item={legacyEdit} size="large"/><p className="ko-builder-note">Это предмет стандартной коллекции. Можно менять его название, описание, символ, картинку и видимость. Цены и механизм применения защищены системой существующих покупок.</p><label>Название<input required minLength={2} maxLength={90} value={legacyEdit.name} onChange={e=>setLegacyEdit(p=>({...p,name:e.target.value}))}/></label><label>Эмодзи / символ<input maxLength={20} value={legacyEdit.icon} onChange={e=>setLegacyEdit(p=>({...p,icon:e.target.value}))}/></label><label>Описание<textarea rows={3} maxLength={500} value={legacyEdit.description} onChange={e=>setLegacyEdit(p=>({...p,description:e.target.value}))} placeholder="Что получает игрок?"/></label><ImageInput onFile={upload} refInput={uploadRef} preview={legacyEdit.imageUrl} onClear={()=>setLegacyEdit(p=>({...p,imagePath:'',imageUrl:''}))}/><label className="ko-builder-checkbox"><input type="checkbox" checked={legacyEdit.active} onChange={e=>setLegacyEdit(p=>({...p,active:e.target.checked}))}/>Показывать на сайте</label><p className="ko-muted">Цена фиксирована в старом SQL: {fmt(legacyEdit.price)} CODI.</p><div className="ko-builder-form__actions"><button className="ko-button ko-button--primary" type="submit" disabled={busy}>Сохранить</button><Button icon="close" onClick={()=>setEditor(null)}>Отмена</Button></div></form>
      :<form className="ko-builder-form" onSubmit={saveProduct}><div className="ko-builder-form__preview"><Visual item={{...edit,imageUrl:edit.imageUrl}} size="large" all={items}/><div className="ko-builder-preview-meta"><small>ПРЕДПРОСМОТР КАРТОЧКИ</small><strong>{edit.title||'Новый товар'}</strong><span>🪙 {fmt(edit.salePrice===''?edit.price:edit.salePrice)} CODI</span></div></div><label>Название<input required minLength={2} maxLength={90} value={edit.title} onChange={e=>modify('title',e.target.value)} placeholder="Название товара"/></label>
          <div className="ko-builder-form__row"><label>Тип<select value={edit.kind} disabled={!!edit.id} onChange={e=>setEdit(p=>({...p,kind:e.target.value,categoryId:'',bundleItems:[]}))}>{Object.entries(kinds).filter(([k])=>edit.kind==='bundle'?k==='bundle':k!=='bundle').map(([k,[name]])=><option value={k} key={k}>{name}</option>)}</select></label><label>Категория<select value={edit.categoryId} onChange={e=>modify('categoryId',e.target.value)}><option value="">Стандартный блок</option>{categories.filter(c=>c.kind===edit.kind).map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label></div>
          <div className="ko-builder-form__row"><label>Цена · CODI<input required min={0} max={1000000} type="number" value={edit.price} onChange={e=>modify('price',e.target.value)}/></label><label>Акционная цена<input min={0} max={1000000} type="number" placeholder="Без скидки" value={edit.salePrice} onChange={e=>modify('salePrice',e.target.value)}/></label></div>
          <div className="ko-builder-artmode"><strong>Режим содержимого</strong><div role="group" aria-label="Режим отображения товара">{[['image','Изображение','image'],['emoji','Эмодзи','store'],['text','Текст','edit']].map(([key,label,icon])=><button key={key} type="button" className={edit.artMode===key?'is-selected':''} aria-pressed={edit.artMode===key} onClick={()=>modify('artMode',key)}><AdminGlyph name={icon} size={18}/>{label}</button>)}</div></div>
          {edit.artMode!=='image'?<label>{edit.artMode==='text'?'Текст на карточке':'Эмодзи / символ'}<input value={edit.artSymbol} maxLength={32} onChange={e=>modify('artSymbol',e.target.value)} placeholder={edit.artMode==='text'?'Например, VIP':'Например, 🔥'}/></label>:<ImageInput onFile={upload} refInput={uploadRef} preview={edit.imageUrl} onClear={()=>setEdit(p=>({...p,imageUrl:'',imagePath:'',artMode:'emoji'}))}/>}
          {edit.kind==='bundle'&&<div className="ko-builder-members"><b>Состав набора · {edit.bundleItems.length}/10</b><p>Выбери 2–10 обычных активных товаров. Цена набора задаётся выше.</p><div>{items.filter(p=>p.kind!=='bundle').map(p=><label key={p.id}><input type="checkbox" checked={edit.bundleItems.includes(p.id)} disabled={!p.active&&!edit.bundleItems.includes(p.id)} onChange={e=>modify('bundleItems',e.target.checked?[...edit.bundleItems,p.id]:edit.bundleItems.filter(id=>id!==p.id))}/><Visual item={p} size="small"/><span>{p.title}<small>{fmt(currentPrice(p))} CODI</small></span></label>)}</div><strong>По отдельности: {fmt(items.filter(p=>edit.bundleItems.includes(p.id)).reduce((acc,p)=>acc+currentPrice(p),0))} CODI</strong></div>}
          <label>Описание для кнопки «i»<textarea rows={3} value={edit.description} maxLength={500} onChange={e=>modify('description',e.target.value)} placeholder="Что входит, как выглядит и что получает игрок?"/></label><label className="ko-builder-checkbox"><input type="checkbox" checked={edit.active} onChange={e=>modify('active',e.target.checked)}/>Показывать на сайте</label><div className="ko-builder-form__actions"><button className="ko-button ko-button--primary" type="submit" disabled={busy}>{busy?'Сохраняем…':edit.id?'Сохранить изменения':'Создать товар'}</button><Button icon="close" onClick={()=>setEditor(null)}>Отмена</Button></div></form>}
    </aside>}
    </div>}
    {tab==='sales'&&<div className="ko-builder-sales"><section className="ko-panel"><div className="ko-builder-heading"><div><h2>Настроить скидку</h2><p>Скидка применяется к конкретному товару или набору. В блоке акций появится специальная карточка.</p></div></div><form className="ko-builder-saleform" onSubmit={setDiscount}><label>Товар<select required value={saleId} onChange={e=>{setSaleId(e.target.value);setSaleValue('');}}><option value="">Выбери товар</option>{items.filter(p=>p.price>0).map(p=><option key={p.id} value={p.id}>{p.title} · {fmt(p.price)} CODI</option>)}</select></label><label>Цена со скидкой (CODI)<input required type="number" min={0} value={saleValue} onChange={e=>setSaleValue(e.target.value)}/></label><button className="ko-button ko-button--primary" type="submit" disabled={busy}>Установить скидку</button></form><Button icon="plus" onClick={addPromotion}>Создать рекламный блок на витрине</Button></section><section className="ko-panel"><div className="ko-builder-heading"><h2>Все уценённые товары · {activeSale.length}</h2></div><div className="ko-builder-grid ko-builder-grid--sales">{activeSale.map(p=><article key={p.id} className="ko-builder-item"><button type="button" className="ko-builder-item__open" onClick={()=>beginEdit(p)}><Visual item={p} all={items}/><span className="ko-builder-item__info" title={p.description||"Открыть редактор и описание"}>i</span><span className="ko-builder-item__copy"><small>{kinds[p.kind]?.[0]}</small><strong>{p.title}</strong><span><del>{fmt(p.price)}</del> {fmt(p.sale_price)} CODI</span><em>−{discount(p)}%</em></span></button><div className="ko-builder-item__actions"><span className={`ko-market-state ${p.active?'is-live':''}`}>{p.active?'Активна':'Скрыта'}</span><Button icon="trash" disabled={busy} onClick={()=>void mutate(()=>adminRequest(`market/products/${p.id}`,{token,method:'PATCH',body:{salePrice:null}}),'Скидка отменена.')}>Убрать скидку</Button></div></article>)}{!activeSale.length&&<div className="ko-empty">Скидок пока нет</div>}</div></section></div>}
    {tab==='categories'&&<div className="ko-builder-workspace"><section className="ko-panel ko-builder-layout"><div className="ko-builder-heading"><div><h2>Конструктор витрины</h2><p>Перетаскивай блоки за значок ↕ или используй стрелки. Порядок будет таким же на сайте.</p></div><Button icon="check" variant="primary" onClick={()=>void saveLayout()} disabled={busy||!configured}>Сохранить витрину</Button></div><div className="ko-builder-blocks">{layout.map((s,i)=><div role="button" tabIndex={0} aria-pressed={sectionId===s.id} key={s.id} className={`ko-builder-block ${sectionId===s.id?'is-current':''} ${!s.active?'is-hidden':''}`} onClick={()=>setSectionId(s.id)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setSectionId(s.id);}}} draggable onDragStart={e=>{setDragId(s.id);e.dataTransfer.effectAllowed='move';}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();moveSection(dragId,s.id);setDragId('');}} onDragEnd={()=>setDragId('')}><span className="ko-builder-block__grab" title="Перетащить">↕</span><span className="ko-builder-block__icon">{s.icon}</span><span className="ko-builder-block__copy"><strong>{s.title}</strong><small>{s.section_type==='color'?'Интерактивная палитра':s.section_type==='promotion'?'Акция':s.section_type==='category'?'Своя категория':'Стандартная коллекция'} · {s.active?'Показывается':'Скрыта'}{s.section_type==='category'?` · ${items.filter(p=>p.category_id===s.category_id).length} шт.`:s.section_type==='promotion'?` · ${(s.item_ids||[]).length} шт.`:''}</small></span><span className="ko-builder-block__actions" onClick={e=>e.stopPropagation()}><IconButton name="back" title="Поднять блок" disabled={!i} onClick={()=>shiftSection(s.id,-1)}/><IconButton name="down" title="Опустить блок" disabled={i===layout.length-1} onClick={()=>shiftSection(s.id,1)}/></span></div>)}</div><div className="ko-builder-layout__footer"><Button icon="plus" onClick={addPromotion}>Блок акции</Button><p>Новая категория создаст собственный блок автоматически.</p></div></section>
    <section className="ko-panel ko-builder-config"><div className="ko-builder-heading"><h2>Настройка блока</h2><small>{selectedSection?.section_type==='promotion'?'Акция':'Коллекция'}</small></div>{selectedSection&&<div className="ko-builder-form"><label>Название блока<input value={selectedSection.title} maxLength={80} onChange={e=>changeSection('title',e.target.value)}/></label><label>Подзаголовок<textarea rows={3} value={selectedSection.subtitle||''} maxLength={220} onChange={e=>changeSection('subtitle',e.target.value)}/></label><label>Значок<input maxLength={12} value={selectedSection.icon||''} onChange={e=>changeSection('icon',e.target.value)}/></label><label className="ko-builder-checkbox"><input type="checkbox" checked={selectedSection.active} onChange={e=>changeSection('active',e.target.checked)}/>Блок виден игрокам</label>
      {selectedSection.section_type==='category'&&selectedCategory&&<div className="ko-builder-category-editor"><strong>Категория «{selectedCategory.name}» · {items.filter(p=>p.category_id===selectedCategory.id).length} товаров</strong><p className="ko-builder-note">Название категории можно менять отдельно от заголовка блока. Товары назначаются во вкладке «Товары»; их количество считается автоматически.</p><div className="ko-builder-form__row"><label>Название категории<input required minLength={2} maxLength={46} value={selectedCategory.name} onChange={e=>setCategories(old=>old.map(c=>c.id===selectedCategory.id?{...c,name:e.target.value}:c))}/></label><label>Значок категории<input maxLength={12} value={selectedCategory.icon||''} onChange={e=>setCategories(old=>old.map(c=>c.id===selectedCategory.id?{...c,icon:e.target.value}:c))}/></label></div><div className="ko-builder-category-actions"><Button icon="check" disabled={busy||selectedCategory.name.trim().length<2} onClick={()=>void saveCategory({preventDefault(){}})}>Сохранить категорию</Button><Button icon="trash" disabled={busy||items.some(p=>p.category_id===selectedCategory.id)} onClick={()=>void removeCategory()}>Удалить пустую категорию</Button></div></div>}
      {selectedSection.section_type==='legacy'&&<p className="ko-builder-note">Включает стандартные {kinds[selectedSection.kind]?.[0].toLowerCase()} и новые товары того же типа без отдельной категории. Для изменения предмета перейди во вкладку «Товары».</p>}
      {selectedPromo&&<div className="ko-builder-members"><b>Товары рекламного блока</b><p>Сначала установи скидку во вкладке «Акции». Здесь выбери, что покажем на витрине.</p><div>{activeSale.filter(p=>p.active).map(p=><label key={p.id}><input type="checkbox" checked={(selectedSection.item_ids||[]).includes(p.id)} onChange={e=>changeSection('item_ids',e.target.checked?[...(selectedSection.item_ids||[]),p.id]:(selectedSection.item_ids||[]).filter(id=>id!==p.id))}/><Visual item={p} size="small"/><span>{p.title}<small>−{discount(p)}% · {fmt(currentPrice(p))} CODI</small></span></label>)}</div></div>}
      <Button icon="check" variant="primary" disabled={busy||!configured} onClick={()=>void saveLayout()}>Сохранить изменения витрины</Button></div>}
      <div className="ko-builder-create-category"><h3>Добавить свою категорию</h3><form onSubmit={createCategory}><label>Название<input required minLength={2} maxLength={46} value={catDraft.name} onChange={e=>setCatDraft(p=>({...p,name:e.target.value}))} placeholder="Например, Легендарные рамки"/></label><div className="ko-builder-form__row"><label>Тип вещей<select value={catDraft.kind} onChange={e=>setCatDraft(p=>({...p,kind:e.target.value}))}>{Object.entries(kinds).map(([k,[name]])=><option key={k} value={k}>{name}</option>)}</select></label><label>Эмодзи<input value={catDraft.icon} maxLength={12} onChange={e=>setCatDraft(p=>({...p,icon:e.target.value}))}/></label></div><button type="submit" className="ko-button ko-button--primary" disabled={busy||!configured}>Добавить категорию и блок</button></form></div>
    </section>
    <section className="ko-panel ko-builder-live"><div className="ko-builder-heading"><div><h2>Как выглядит магазин</h2><p>Предпросмотр реальных карточек и порядка блоков. Изменения попадут на сайт после сохранения.</p></div></div><StorePreview sections={layout} items={items} legacy={legacy} categories={categories} focus={sectionId}/></section>
    </div>}
  </div>;
}
function ImageInput({onFile,refInput,preview,onClear}) { return <div className="ko-builder-image"><b>Изображение товара</b><label onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void onFile(e.dataTransfer.files?.[0]);}}><AdminGlyph name="image" size={22}/><span>Перетащи сюда или выбери PNG, JPG, WebP · до 6 МБ</span><input type="file" accept="image/png,image/jpeg,image/webp" ref={refInput} onChange={e=>void onFile(e.target.files?.[0])}/></label>{preview&&<div className="ko-builder-image__attached"><img src={preview} alt="Превью"/><span>Картинка прикреплена</span><IconButton name="trash" title="Убрать картинку" onClick={onClear}/></div>}</div>; }
