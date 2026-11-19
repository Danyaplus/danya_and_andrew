import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import MarketArtText, { DEFAULT_ART_STYLE, normalizeArtStyle } from '../components/MarketArtText.jsx';
import AdminGlyph from './AdminGlyph.jsx';
import builtInCatalog from '../../../shared/cosmetics.json';
import './admin-ops.css';
import './admin-store-builder.css';
import './admin-market-premium.css';

const KINDS = {
  site: ['Фон сайта', '🌌'], background: ['Фон профиля', '🌄'], emoji: ['Эмодзи', '✨'],
  frame: ['Рамка', '🖼️'], title: ['Титул', '👑'], card: ['Карточка игры', '🎴'], bundle: ['Набор', '🎁'],
};
const icon = (name, size = 16) => <AdminGlyph name={name} size={size} />;
const fmt = v => Number(v || 0).toLocaleString('ru-RU');
const priceOf = p => Number(p.sale_price ?? p.price ?? 0);
const discountOf = p => p.sale_price == null || !Number(p.price) ? null : Math.round((1 - Number(p.sale_price) / Number(p.price)) * 100);
const NEW_ITEM = (kind = 'site') => ({ id: '', title: '', kind, description: '', price: '150', salePrice: '', categoryId: '', artMode: 'emoji', artSymbol: '', artStyle: { ...DEFAULT_ART_STYLE }, imageUrl: '', imagePath: '', active: true, bundleItems: [] });
const fromProduct = p => ({ id: p.id, title: p.title, kind: p.kind, description: p.description || '', price: String(p.price), salePrice: p.sale_price ?? '', categoryId: p.category_id || '', artMode: p.art_mode || (p.image_path ? 'image' : 'emoji'), artSymbol: p.art_symbol || '', artStyle: normalizeArtStyle(p.art_style), imageUrl: p.imageUrl || '', imagePath: p.image_path || '', active: p.active !== false, bundleItems: [...(p.bundle_items || [])] });
const isUrl = src => typeof src === 'string' && /^(https?:\/\/|\/)/.test(src);
const LEGACY_ART = { 'site-neocity': 'neon-city.webp', 'site-camp': 'night-camp.webp', 'site-orbit': 'space-orbit.webp' };

function Btn({ children, iconName, accent = false, ...props }) {
  return <button type="button" className={`ko-next-btn ${accent ? 'ko-next-btn--accent' : ''}`} {...props}>{iconName && icon(iconName, 17)}{children}</button>;
}
function IBtn({ name, title, onClick, disabled, danger = false }) {
  return <button type="button" className={`ko-next-icon ${danger ? 'is-danger' : ''}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>{icon(name, 16)}</button>;
}
function Art({ item, all = [], size = '' }) {
  const symbol = item?.art_symbol || item?.artSymbol || item?.icon || KINDS[item?.kind]?.[1] || '✨';
  const src = item?.imageUrl || (LEGACY_ART[item?.id] ? `${import.meta.env.BASE_URL}live-backgrounds/${LEGACY_ART[item.id]}` : null);
  const mode = item?.artMode || item?.art_mode || (src ? 'image' : 'emoji');
  const memberIds = item?.bundle_items || item?.bundleItems || [];
  const members = item?.kind === 'bundle' ? memberIds.map(id => all.find(p => p.id === id)).filter(Boolean) : [];
  return <div className={`ko-next-art ko-next-art--${item?.kind || 'site'} ${size ? `ko-next-art--${size}` : ''}`}>
    {mode === 'image' && isUrl(src) ? <img src={src} alt="" loading="lazy" /> : mode === 'text' ? <MarketArtText text={symbol} artStyle={item?.art_style || item?.artStyle} /> :
      members.length && !(item?.art_symbol || item?.artSymbol) ? <div className="ko-next-art__stack">{members.slice(0, 4).map(p => <span key={p.id}>{p.imageUrl && p.art_mode === 'image' ? <img src={p.imageUrl} alt=""/> : p.art_symbol || KINDS[p.kind]?.[1]}</span>)}</div> : <span className="ko-next-art__symbol">{symbol}</span>}
  </div>;
}
async function imageData(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 6_000_000) throw Error('Выбери PNG, JPG или WebP размером до 6 МБ.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Не удалось открыть изображение.')); image.src = url; });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    let output = '';
    for (let quality = .86; quality >= .3; quality -= .08) { output = canvas.toDataURL('image/webp', quality); if (output.length < 1_250_000) break; }
    if (output.length > 1_250_000) throw Error('Изображение слишком большое, уменьши исходный файл.');
    return { mime: 'image/webp', data: output.split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}
function ArtUpload({ preview, onFile, onClear, disabled }) {
  const input = useRef(null);
  return <div className="ko-next-upload">
    <label className="ko-next-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files[0]) void onFile(event.dataTransfer.files[0]); }}>
      {icon('image', 21)} <span>Загрузить или перетащить изображение</span><small>PNG, JPG, WebP · до 6 МБ</small>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; if (file) void onFile(file); event.target.value = ''; }}/>
    </label>
    {preview && <div className="ko-next-upload__attached"><img src={preview} alt="Прикреплённое изображение"/><span>Изображение прикреплено</span><IBtn name="trash" title="Удалить изображение" onClick={onClear} disabled={disabled}/></div>}
  </div>;
}
function TextStyleEditor({ style, onChange }) {
  const s = normalizeArtStyle(style);
  const change = (key, value) => onChange({ ...s, [key]: value });
  return <div className="ko-next-text-editor">
    <strong>Оформление надписи</strong>
    <div className="ko-next-style-line">
      <label>Шрифт<select value={s.font} onChange={e => change('font', e.target.value)}><option value="display">Классический</option><option value="modern">Современный</option><option value="elegant">Элегантный</option><option value="mono">Пиксельный</option></select></label>
      <label>Размер<select value={s.size} onChange={e => change('size', Number(e.target.value))}>{[18, 24, 30, 38, 48, 56, 64].map(x => <option value={x} key={x}>{x} px</option>)}</select></label>
      <label>Цвет<input type="color" value={s.color} onChange={e => change('color', e.target.value)}/></label>
    </div>
    <div className="ko-next-format-buttons">{[
      ['bold','B','Жирный'],['italic','I','Курсив'],['underline','U','Подчёркивание'],['glow','✧','Свечение'],['wave','〰','Волна'],
    ].map(([key, label, title]) => <button type="button" title={title} key={key} className={`${s[key]?'is-on':''} is-${key}`} aria-pressed={s[key]} onClick={() => change(key, !s[key])}>{label}</button>)}</div>
  </div>;
}
function ProductCard({ p, all, selected, categoryName, onEdit, onVisibility, onSale, onCopy, onDelete, busy, saleContext = false }) {
  const discounted = discountOf(p);
  return <article className={`ko-next-card ${selected ? 'is-selected' : ''} ${p.active === false ? 'is-hidden' : ''}`}>
    <button type="button" className="ko-next-card__open" onClick={onEdit} title="Открыть редактор товара">
      <Art item={p} all={all}/>
      {discounted != null && <span className="ko-next-card__sale">{icon('tag', 11)} Скидка −{discounted}%</span>}
      <span className="ko-next-card__info" title={p.description || 'Описание товара'}>i</span>
      <div className="ko-next-card__body"><strong>{p.title}</strong><div className="ko-next-card__tags"><span>{KINDS[p.kind]?.[1]} {KINDS[p.kind]?.[0]}</span><span>{categoryName || (p.legacy ? 'Стандартная' : 'Каталог')}</span></div>
        <div className="ko-next-card__price">{discounted != null && <del>{fmt(p.price)}</del>}<b><span>🪙</span> {fmt(priceOf(p))}</b></div>
      </div>
    </button>
    <div className="ko-next-card__footer"><span className={`ko-next-state ${p.active !== false ? 'is-live' : ''}`}><i/>{p.active !== false ? 'Активен' : 'Скрыт'}</span>
      <div className="ko-next-card__actions"><IBtn name="edit" title="Редактировать" onClick={onEdit}/>
        <IBtn name="eye" title={p.active !== false ? 'Скрыть из магазина' : 'Вернуть в магазин'} disabled={busy} onClick={onVisibility}/>
        {!p.legacy && <><IBtn name="tag" title="Быстрая скидка" disabled={busy} onClick={onSale}/><details className="ko-next-card__more"><summary title="Дополнительные действия" aria-label="Дополнительные действия">···</summary><div><button type="button" disabled={busy} onClick={onCopy}>{icon('copy', 14)} Копировать</button><button type="button" disabled={busy} onClick={onDelete}>{icon('trash', 14)} {saleContext ? 'Убрать скидку' : 'Удалить товар'}</button></div></details></>}
      </div>
    </div>
  </article>;
}
function BlockPreview({ section, items, legacy, focused, onFocus, onMove, onDropBlock, onDragBlock }) {
  const products = section.section_type === 'category' ? items.filter(p => p.active && p.category_id === section.category_id)
    : section.section_type === 'promotion' ? (section.item_ids || []).map(id => items.find(p => p.id === id)).filter(p => p?.active && p.sale_price != null)
      : items.filter(p => p.active && p.kind === section.kind && !p.category_id);
  const legacyProducts = section.section_type === 'legacy' ? legacy.filter(p => p.active !== false && p.kind === section.kind) : [];
  const all = [...legacyProducts, ...products];
  return <section className={`ko-next-preview-section ${focused ? 'is-focused' : ''} ${section.section_type === 'promotion' ? 'is-promotion' : ''}`} onClick={() => onFocus(section.id)}
    draggable onDragStart={e => onDragBlock(e, section.id)} onDragOver={e => e.preventDefault()} onDrop={e => onDropBlock(e, section.id)}>
    <header><div><small>{section.icon} {section.section_type === 'promotion' ? 'СПЕЦИАЛЬНОЕ ПРЕДЛОЖЕНИЕ' : 'КОЛЛЕКЦИЯ'}</small><h4>{section.title}</h4><p>{section.subtitle}</p></div><span>{section.section_type === 'color' ? 'ЦВЕТОВАЯ ПАЛИТРА' : `${all.length} вариантов`}</span></header>
    {section.section_type === 'color' ? <div className="ko-next-color-sample">🌈 <span>Выбрать цвет ника</span><div>🔴 🟠 🟡 🟢 🔵 🟣</div></div> : <div className="ko-next-preview-grid">{all.map(item => <div className="ko-next-preview-product" key={item.id}><Art item={item} all={items}/><strong>{item.title || item.name}</strong><small>{fmt(priceOf(item))} CODI</small></div>)}{!all.length && <p className="ko-next-preview-empty">В этой категории пока нет товаров</p>}</div>}
  </section>;
}

export default function AdminMarketPanel({ token }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [legacy, setLegacy] = useState(builtInCatalog);
  const [layout, setLayout] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [tab, setTab] = useState('products');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState('product');
  const [edit, setEdit] = useState(NEW_ITEM());
  const [legacyEdit, setLegacyEdit] = useState(null);
  const [memberDrafts, setMemberDrafts] = useState([]);
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sectionId, setSectionId] = useState('builtin:color');
  const [dragId, setDragId] = useState('');
  const [catDraft, setCatDraft] = useState({ name: '', kind: 'site', icon: '✨' });
  const [saleId, setSaleId] = useState('');
  const [saleValue, setSaleValue] = useState('');
  const [quickSaleId, setQuickSaleId] = useState('');
  const [quickSaleValue, setQuickSaleValue] = useState('');
  const chosenOnce = useRef(false);
  const importRef = useRef(null);
  const load = useCallback(async () => {
    const [market, store] = await Promise.all([adminRequest('market/products', { token }), adminRequest('market/layout', { token })]);
    setItems(market.products || []); setCategories(market.categories || []);
    setLegacy(store.legacyItems || builtInCatalog);
    setLayout(store.sections || []);
    setConfigured(Boolean(store.configured && market.configured !== false));
    if (!chosenOnce.current) {
      chosenOnce.current = true;
      const first = (market.products || []).find(x => x.kind !== 'bundle');
      if (first) setEdit(fromProduct(first));
      else setEditor(null);
    }
  }, [token]);
  useEffect(() => { void load().catch(e => setError(adminErrorText(e))); }, [load]);
  useEffect(() => setPage(0), [tab, search, kindFilter, categoryFilter, statusFilter, sort]);

  const change = (name, value) => setEdit(previous => ({ ...previous, [name]: value }));
  const editStyle = (value) => setEdit(previous => ({ ...previous, artStyle: value }));
  const legacyItems = useMemo(() => legacy.map(p => ({ ...p, title: p.name, legacy: true })), [legacy]);
  const filtered = useMemo(() => {
    const catalog = tab === 'bundles' ? items.filter(p => p.kind === 'bundle') : [...legacyItems, ...items.filter(p => p.kind !== 'bundle')];
    const q = search.trim().toLocaleLowerCase();
    return catalog.filter(p => (kindFilter === 'all' || p.kind === kindFilter) &&
      (statusFilter === 'all' || (statusFilter === 'active' ? p.active !== false : p.active === false)) &&
      (categoryFilter === 'all' || (categoryFilter === 'builtin' ? p.legacy : categoryFilter === 'uncategorized' ? !p.legacy && !p.category_id : p.category_id === categoryFilter)) &&
      `${p.title} ${p.description || ''} ${p.id}`.toLocaleLowerCase().includes(q))
      .sort((a, b) => sort === 'price-asc' ? priceOf(a) - priceOf(b) : sort === 'price-desc' ? priceOf(b) - priceOf(a) : sort === 'name' ? a.title.localeCompare(b.title) : (b.created_at || '').localeCompare(a.created_at || ''));
  }, [items, legacyItems, tab, kindFilter, categoryFilter, statusFilter, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const shown = filtered.slice(Math.min(page, pages - 1) * 10, (Math.min(page, pages - 1) + 1) * 10);
  const activeSales = items.filter(p => p.sale_price != null);
  const selectedSection = layout.find(s => s.id === sectionId) || layout[0];
  const selectedCategory = categories.find(c => c.id === selectedSection?.category_id);

  async function mutate(action, success, reload = true) {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (reload) await load(); setNotice(success); return true; }
    catch (e) { setError(adminErrorText(e) || e.message || 'Ошибка сохранения'); return false; }
    finally { setBusy(false); }
  }
  function beginNew(kind = 'site') { setLegacyEdit(null); setEdit(NEW_ITEM(kind)); setMemberDrafts([]); setNewMemberOpen(false); setEditor('product'); setError(''); setTab(kind === 'bundle' ? 'bundles' : 'products'); }
  function beginEdit(p) {
    setError(''); setMemberDrafts([]); setNewMemberOpen(false);
    if (p.legacy) { setLegacyEdit({ ...p, name: p.name || p.title, icon: p.icon || KINDS[p.kind]?.[1], description: p.description || '', imagePath: p.image_path || '', imageUrl: p.imageUrl || '', artMode: p.art_mode || (p.image_path ? 'image' : 'emoji'), artStyle: normalizeArtStyle(p.art_style), active: p.active !== false }); setEditor('legacy'); }
    else { setEdit(fromProduct(p)); setEditor('product'); setTab(p.kind === 'bundle' ? 'bundles' : 'products'); }
  }
  function copyProduct(p) { setEdit({ ...fromProduct(p), id: '', title: `${p.title} (копия)` }); setMemberDrafts([]); setNewMemberOpen(false); setEditor('product'); setTab(p.kind === 'bundle' ? 'bundles' : 'products'); }
  async function upload(file, target = 'product', draftIndex = -1) {
    if (!file || busy) return;
    setBusy(true); setError('');
    try {
      const { mime, data } = await imageData(file);
      const result = await adminRequest('market/upload', { token, body: { mime, data } });
      if (target === 'legacy') setLegacyEdit(previous => ({ ...previous, imagePath: result.imagePath, imageUrl: result.imageUrl, artMode: 'image' }));
      else if (target === 'member') setMemberDrafts(previous => previous.map((d, index) => index === draftIndex ? { ...d, imagePath: result.imagePath, imageUrl: result.imageUrl, artMode: 'image' } : d));
      else setEdit(previous => ({ ...previous, imagePath: result.imagePath, imageUrl: result.imageUrl, artMode: 'image' }));
      setNotice('Изображение загружено. Сохрани карточку, чтобы игроки увидели его.');
    } catch (e) { setError(e?.message || adminErrorText(e)); } finally { setBusy(false); }
  }
  async function saveProduct(event) {
    event.preventDefault();
    const p = edit;
    if (!Number.isSafeInteger(Number(p.price)) || Number(p.price) < 0) { setError('Укажи правильную целую цену.'); return; }
    if (p.salePrice !== '' && (Number(p.salePrice) >= Number(p.price) || Number(p.salePrice) < 0 || !Number.isSafeInteger(Number(p.salePrice)))) { setError('Акционная цена должна быть меньше обычной.'); return; }
    if (p.artMode === 'image' && !p.imagePath) { setError('Загрузи изображение или выбери эмодзи/текст.'); return; }
    if (p.kind === 'bundle' && (p.bundleItems.length + memberDrafts.length < 2 || p.bundleItems.length + memberDrafts.length > 10)) { setError('Набор должен содержать от 2 до 10 товаров.'); return; }
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const members = [...p.bundleItems];
      // Create staged products first: the bundle RPC accepts only real, existing product IDs.
      for (let index = 0; index < memberDrafts.length; index++) {
        const draft = memberDrafts[index];
        if (!draft.title.trim() || draft.title.trim().length < 2 || !Number.isSafeInteger(Number(draft.price)) || Number(draft.price) < 0) throw Error('Проверь название и цену каждого нового предмета набора.');
        if (draft.artMode === 'image' && !draft.imagePath) throw Error('Загрузи картинку для нового предмета или выбери эмодзи.');
        const result = await adminRequest('market/products', { token, body: draft });
        members.push(result.id);
        setEdit(previous => ({ ...previous, bundleItems: [...previous.bundleItems, result.id] }));
        setMemberDrafts(previous => previous.slice(1));
      }
      await adminRequest('market/products', { token, body: { ...p, bundleItems: members } });
      await load(); setMemberDrafts([]); setEditor(null);
      setNotice(p.kind === 'bundle' ? 'Набор и его товары сохранены. Покупка выдаёт все предметы комплекта.' : 'Товар сохранён в каталоге.');
    } catch (e) { setError(adminErrorText(e) || e.message || 'Не удалось сохранить товар.'); }
    finally { setBusy(false); }
  }
  async function saveLegacy(event) { event.preventDefault(); if (!legacyEdit) return; if (await mutate(() => adminRequest(`market/legacy/${encodeURIComponent(legacyEdit.id)}`, { token, method: 'PUT', body: { name: legacyEdit.name, icon: legacyEdit.icon, description: legacyEdit.description, imagePath: legacyEdit.imagePath, artMode: legacyEdit.artMode, artStyle: legacyEdit.artStyle, active: legacyEdit.active } }), 'Стандартный товар обновлён.')) setEditor(null); }
  async function toggleVisibility(p) {
    if (p.legacy) {
      await mutate(() => adminRequest(`market/legacy/${encodeURIComponent(p.id)}`, { token, method: 'PUT', body: { name: p.name, icon: p.icon, description: p.description || '', imagePath: p.image_path || '', active: p.active === false } }), p.active === false ? 'Предмет снова виден.' : 'Предмет скрыт из магазина.');
    } else await mutate(() => adminRequest(`market/products/${p.id}`, { token, method: 'PATCH', body: { active: !p.active } }), p.active ? 'Товар скрыт из магазина.' : 'Товар снова виден.');
  }
  function quickSale(p) {
    if (p.legacy || busy) return;
    setQuickSaleId(p.id); setQuickSaleValue(p.sale_price == null ? '' : String(p.sale_price)); setError('');
  }
  async function saveQuickSale(event) {
    event.preventDefault();
    const p = items.find(x => x.id === quickSaleId);
    if (!p) return;
    const value = quickSaleValue.trim() === '' ? null : Number(quickSaleValue);
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value >= p.price)) { setError('Цена со скидкой должна быть целым числом меньше обычной.'); return; }
    if (await mutate(() => adminRequest(`market/products/${p.id}`, { token, method: 'PATCH', body: { salePrice: value } }), value == null ? 'Скидка убрана.' : 'Скидка сохранена.')) setQuickSaleId('');
  }
  function removeProduct(p) { if (!window.confirm(`Удалить «${p.title}»? Купленные товары и предметы, добавленные в набор, удалять нельзя — их можно скрыть.`)) return; void mutate(() => adminRequest(`market/products/${p.id}`, { token, method: 'DELETE' }), 'Товар удалён.'); }
  function exportCatalog() {
    const blob = new Blob([JSON.stringify({ format: 'kodumi-market-backup-v2', exportedAt: new Date().toISOString(), products: items, categories, sections: layout, builtins: legacy }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'kodumi-market-catalog.json'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Каталог выгружен в JSON. Это резервная копия данных.');
  }
  async function importCatalog(file) {
    if (!file || busy) return;
    let created = 0;
    setError(''); setNotice('');
    try {
      if (file.size > 3_000_000) throw Error('JSON-файл слишком большой (не более 3 МБ).');
      const backup = JSON.parse(await file.text());
      if (!String(backup?.format || '').startsWith('kodumi-market-backup-') || !Array.isArray(backup.products)) throw Error('Это не резервная копия каталога Kodumi Games.');
      if (backup.products.length > 100) throw Error('В одном импорте допускается до 100 товаров.');
      const missing = backup.products.filter(x => !items.some(p => p.id === x.id));
      if (!missing.length) return setNotice('Все товары из файла уже присутствуют в магазине. Ничего не перезаписано.');
      if (!window.confirm(`Импортировать ${missing.length} новых товаров из файла? Существующие товары и их цены не изменятся.`)) return;
      setBusy(true);
      const lookup = new Map(items.map(x => [x.id, x.id]));
      const activeCategories = new Set(categories.map(x => x.id));
      async function insertProduct(p, bundle = false) {
        if (!Object.hasOwn(KINDS, p.kind) || typeof p.title !== 'string' || p.title.trim().length < 2) throw Error('В файле найден товар с неправильным названием или типом.');
        const mapped = (p.bundle_items || []).map(id => lookup.get(id)).filter(Boolean);
        if (bundle && mapped.length < 2) throw Error(`Набор «${p.title}» ссылается на отсутствующие предметы. Создай их прежде, чем импортировать набор.`);
        const draft = { ...fromProduct(p), id: '', categoryId: activeCategories.has(p.category_id) ? p.category_id : '', bundleItems: bundle ? mapped : [] };
        const result = await adminRequest('market/products', { token, body: draft });
        lookup.set(p.id, result.id); created++;
      }
      for (const p of missing.filter(x => x.kind !== 'bundle')) await insertProduct(p);
      for (const p of missing.filter(x => x.kind === 'bundle')) await insertProduct(p, true);
      await load(); setNotice(`${created} новых товаров добавлено в каталог. Уже существующие не изменялись.`);
    } catch (e) { if (created) await load().catch(() => {}); setError(`${e.message || 'Импорт не удался.'}${created ? ` Успешно добавлено до ошибки: ${created}.` : ''}`); }
    finally { setBusy(false); if (importRef.current) importRef.current.value = ''; }
  }
  function selectTab(next) { setTab(next); setEditor(null); setSearch(''); setStatusFilter('all'); setKindFilter('all'); setCategoryFilter('all'); setError(''); setNotice(''); }
  function moveSection(id, destination) {
    if (!id || id === destination) return;
    setLayout(previous => { const next = [...previous], from = next.findIndex(x => x.id === id), to = next.findIndex(x => x.id === destination); if (from < 0 || to < 0) return previous; const [entry] = next.splice(from, 1); next.splice(to, 0, entry); return next; });
    setSectionId(id);
  }
  function shiftSection(id, step) { const from = layout.findIndex(x => x.id === id); if (from < 0 || from + step < 0 || from + step >= layout.length) return; moveSection(id, layout[from + step].id); }
  function dragStart(event, id) { setDragId(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }
  function dropSection(event, id) { event.preventDefault(); event.stopPropagation(); moveSection(event.dataTransfer.getData('text/plain') || dragId, id); setDragId(''); }
  function changeSection(key, value) { setLayout(previous => previous.map(x => x.id === selectedSection?.id ? { ...x, [key]: value } : x)); }
  async function saveLayout() { if (!configured) { setError('Необходимо сначала активировать конструктор магазина в Supabase.'); return; } await mutate(() => adminRequest('market/layout', { token, method: 'PUT', body: { sections: layout } }), 'Порядок и настройки всех блоков сохранены для игроков.'); }
  async function createCategory(event) { event.preventDefault(); if (!configured) return setError('Необходимо активировать конструктор магазина в Supabase.');
    await mutate(async () => { const result = await adminRequest('market/categories', { token, body: catDraft }); setSectionId(`category:${result.category.id}`); setCatDraft({ name: '', kind: 'site', icon: '✨' }); }, 'Категория добавлена. Назначай товары в новом блоке.'); }
  async function saveCategory() { if (!selectedCategory) return; await mutate(() => adminRequest('market/categories', { token, body: { id: selectedCategory.id, name: selectedCategory.name, kind: selectedCategory.kind, icon: selectedCategory.icon } }), 'Категория обновлена.'); }
  async function deleteCategory() { if (!selectedCategory) return; if (items.some(p => p.category_id === selectedCategory.id)) return setError('Сначала перенеси товары в другую категорию.'); if (!window.confirm(`Удалить пустую категорию «${selectedCategory.name}»?`)) return; await mutate(async () => { await adminRequest(`market/categories/${selectedCategory.id}`, { token, method: 'DELETE' }); setSectionId('builtin:color'); }, 'Категория удалена.'); }
  function addPromotion() { const id = `promo:${crypto.randomUUID()}`; setLayout(prev => [...prev, { id, section_type: 'promotion', title: 'Специальные предложения', subtitle: 'Выгодные цены на товары и наборы', icon: '🔥', kind: null, category_id: null, item_ids: [], active: true, sort_order: prev.length * 100 }]); setTab('categories'); setSectionId(id); setNotice('Новый блок акции создан в редакторе. Выбери товары и сохрани витрину.'); }
  function deletePromotion() { if (!selectedSection || selectedSection.section_type !== 'promotion') return; if (!window.confirm('Удалить рекламный блок? Скидки у товаров останутся.')) return; setLayout(prev => prev.filter(x => x.id !== selectedSection.id)); setSectionId('builtin:color'); }
  async function setDiscount(event) { event.preventDefault(); const p = items.find(x => x.id === saleId); const value = Number(saleValue); if (!p || !Number.isSafeInteger(value) || value < 0 || value >= p.price) return setError('Выбери товар и цену по акции ниже обычной.'); if (await mutate(() => adminRequest(`market/products/${p.id}`, { token, method: 'PATCH', body: { salePrice: value } }), 'Скидка сохранена.')) { setSaleId(''); setSaleValue(''); } }
  const selectedProductId = editor === 'product' ? edit.id : legacyEdit?.id;

  return <div className="ko-next-market">
    <nav className="ko-next-tabs" aria-label="Разделы магазина">{[
      ['products', 'Товары', 'inventory'], ['bundles', 'Наборы', 'layers'], ['sales', 'Акции', 'tag'], ['categories', 'Конструктор витрины', 'folder'],
    ].map(([key, title, glyph]) => <button type="button" key={key} className={tab === key ? 'is-active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => selectTab(key)}>{icon(glyph, 20)}{title}</button>)}</nav>
    {error && <div className="ko-next-alert is-error" role="alert">{icon('alert', 17)} {error}</div>}
    {notice && <div className="ko-next-alert is-success" role="status">{icon('check', 17)} {notice}</div>}
    {!configured && <div className="ko-next-alert">Конструктор магазина ещё не активирован в Supabase. Нужны таблицы и функции из ранее подготовленной миграции витрины — в текущем архиве она отсутствует. Действующие функции старого магазина не удалены.</div>}

    {(tab === 'products' || tab === 'bundles') && <div className={`ko-next-workspace ${editor ? 'has-editor' : ''}`}>
      <section className="ko-next-catalog">
        <header className="ko-next-section-header"><div className="ko-next-section-title">{icon(tab === 'bundles' ? 'layers' : 'inventory', 25)}<div><h2>{tab === 'bundles' ? 'Каталог наборов' : 'Каталог товаров'}</h2><p>{tab === 'bundles' ? 'Собирай комплекты из готовых и новых предметов. Одна цена — за весь набор.' : 'Создавай и редактируй товары, цены, скидки, видимость и оформление.'}</p></div></div></header>
        <div className="ko-next-toolbar"><div><Btn accent iconName="plus" disabled={busy} onClick={() => beginNew(tab === 'bundles' ? 'bundle' : 'site')}>Добавить {tab === 'bundles' ? 'набор' : 'товар'}</Btn><Btn iconName="down" disabled={busy} onClick={() => importRef.current?.click()}>Импорт</Btn><input ref={importRef} className="ko-next-file-chooser" type="file" accept=".json,application/json" onChange={e => void importCatalog(e.target.files?.[0])}/><IBtn name="copy" title="Скачать резервную копию каталога" onClick={exportCatalog}/></div><div className="ko-next-search">{icon('search', 18)}<input type="search" placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)}/><small>Ctrl + K</small></div></div>
        <div className="ko-next-filters">
          <label>{icon('tag', 16)}<span>Категория:</span><select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">Все категории</option><option value="builtin">Стандартные</option><option value="uncategorized">Без категории</option>{categories.filter(c => tab === 'bundles' ? c.kind === 'bundle' : c.kind !== 'bundle').map(c => <option value={c.id} key={c.id}>{c.icon} {c.name}</option>)}</select></label>
          {tab === 'products' && <label>{icon('layers', 16)}<span>Тип:</span><select value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="all">Все типы</option>{Object.entries(KINDS).filter(([kind]) => kind !== 'bundle').map(([kind, [title]]) => <option key={kind} value={kind}>{title}</option>)}</select></label>}
          <label>{icon('eye', 16)}<span>Статус:</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">Все статусы</option><option value="active">Активные</option><option value="hidden">Скрытые</option></select></label>
          <label>{icon('filter', 16)}<span>Сортировка:</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Сначала новые</option><option value="name">По названию</option><option value="price-asc">Сначала дешёвые</option><option value="price-desc">Сначала дорогие</option></select></label>
        </div>
        <div className="ko-next-grid">{shown.map(p => <ProductCard key={`${p.legacy ? 'old' : 'new'}:${p.id}`} p={p} all={items} selected={selectedProductId === p.id} categoryName={categories.find(c => c.id === p.category_id)?.name} busy={busy}
          onEdit={() => beginEdit(p)} onVisibility={() => void toggleVisibility(p)} onSale={() => void quickSale(p)} onCopy={() => copyProduct(p)} onDelete={() => removeProduct(p)} />)}
          {!shown.length && <div className="ko-next-empty">{icon('inventory', 30)}<strong>Товары не найдены</strong><p>Сбрось фильтры или добавь новую карточку.</p></div>}
        </div>
        <div className="ko-next-paging"><span>{filtered.length ? `Показано ${Math.min(page, pages - 1) * 10 + 1}–${Math.min((Math.min(page, pages - 1) + 1) * 10, filtered.length)} из ${filtered.length}` : '0 товаров'}</span><div><IBtn name="back" title="Предыдущая страница" disabled={page === 0} onClick={() => setPage(x => Math.max(0, x - 1))}/>{Array.from({ length: pages }, (_, index) => index).filter(x => pages <= 7 || x === 0 || x === pages - 1 || Math.abs(x - page) <= 1).map((x, index, arr) => <span key={x}>{index > 0 && x - arr[index - 1] > 1 && <b>…</b>}<button type="button" className={page === x ? 'is-active' : ''} onClick={() => setPage(x)}>{x + 1}</button></span>)}<IBtn name="down" title="Следующая страница" disabled={page + 1 >= pages} onClick={() => setPage(x => Math.min(pages - 1, x + 1))}/></div></div>
      </section>

      {editor && <aside className="ko-next-editor"><div className="ko-next-editor__header">{icon('edit', 23)}<div><h2>{editor === 'legacy' ? 'Редактор стандартного товара' : edit.kind === 'bundle' ? 'Редактор набора' : 'Редактор товара'}</h2><p>Настрой параметры товара и его содержимое.</p></div><IBtn name="close" title="Закрыть редактор" onClick={() => setEditor(null)}/></div>
        {editor === 'legacy' ? <form className="ko-next-form" onSubmit={saveLegacy}>
          <Art item={legacyEdit} size="preview"/><div className="ko-next-fieldnote">У стандартного товара можно менять картинку, название, описание и видимость. Цена фиксирована в действующей системе покупок.</div>
          <label>Название<input required minLength={2} maxLength={90} value={legacyEdit.name} onChange={e => setLegacyEdit(v => ({ ...v, name: e.target.value }))}/></label>
          <div className="ko-next-mode"><strong>Режим содержимого</strong><div>{[['image','Изображение','image'],['emoji','Эмодзи','star'],['text','Текст','edit']].map(([key,label,glyph]) => <button key={key} type="button" className={legacyEdit.artMode===key?'is-active':''} onClick={() => setLegacyEdit(v => ({ ...v, artMode:key }))}>{icon(glyph, 17)}{label}</button>)}</div></div>
          {legacyEdit.artMode === 'image' ? <ArtUpload disabled={busy} preview={legacyEdit.imageUrl} onFile={file => upload(file, 'legacy')} onClear={() => setLegacyEdit(v => ({ ...v, imagePath: '', imageUrl: '', artMode: 'emoji' }))}/>
            : <><label>{legacyEdit.artMode === 'text' ? 'Надпись (до 20 символов)' : 'Эмодзи / символ'}<input maxLength={20} value={legacyEdit.icon} onChange={e => setLegacyEdit(v => ({ ...v, icon: e.target.value }))}/></label>{legacyEdit.artMode === 'text' && <TextStyleEditor style={legacyEdit.artStyle} onChange={style => setLegacyEdit(v => ({ ...v, artStyle: style }))}/>}</>}
          <label>Описание<textarea rows={3} maxLength={500} value={legacyEdit.description} onChange={e => setLegacyEdit(v => ({ ...v, description: e.target.value }))}/></label>
          <label className="ko-next-toggle"><input type="checkbox" checked={legacyEdit.active} onChange={e => setLegacyEdit(v => ({ ...v, active: e.target.checked }))}/><span>Активен в магазине</span></label>
          <div className="ko-next-form__buttons"><button className="ko-next-btn ko-next-btn--accent" type="submit" disabled={busy}>{icon('check')} Сохранить</button><Btn iconName="close" onClick={() => setEditor(null)}>Отмена</Btn></div>
        </form> : <form className="ko-next-form" onSubmit={saveProduct}>
          <Art item={edit} all={items} size="preview"/>
          <label>Название товара <b>*</b><input required minLength={2} maxLength={90} value={edit.title} placeholder="Например, Ночной город" onChange={e => change('title', e.target.value)}/></label>
          <div className="ko-next-row"><label>Тип товара <b>*</b><select value={edit.kind} disabled={Boolean(edit.id)} onChange={e => setEdit(v => ({ ...v, kind: e.target.value, categoryId: '', bundleItems: [] }))}>{Object.entries(KINDS).filter(([k]) => edit.kind === 'bundle' ? k === 'bundle' : k !== 'bundle').map(([k, [title]]) => <option key={k} value={k}>{title}</option>)}</select></label><label>Категория<select value={edit.categoryId} onChange={e => change('categoryId', e.target.value)}><option value="">Основной каталог</option>{categories.filter(c => c.kind === edit.kind).map(c => <option value={c.id} key={c.id}>{c.icon} {c.name}</option>)}</select></label></div>
          <div className="ko-next-row"><label>Цена (CODI) <b>*</b><div className="ko-next-coins"><span>🪙</span><input required type="number" min={0} max={1000000} value={edit.price} onChange={e => change('price', e.target.value)}/></div></label><label>Цена по акции<div className="ko-next-coins"><span>🪙</span><input type="number" min={0} max={1000000} placeholder="Без скидки" value={edit.salePrice} onChange={e => change('salePrice', e.target.value)}/></div></label></div>
          <div className="ko-next-mode"><strong>Режим содержимого <b>*</b></strong><div>{[['image','Изображение','image'],['emoji','Эмодзи','star'],['text','Текст','edit']].map(([key, label, glyph]) => <button type="button" key={key} className={edit.artMode === key ? 'is-active' : ''} onClick={() => change('artMode', key)}>{icon(glyph, 19)}{label}</button>)}</div></div>
          {edit.artMode === 'image' ? <ArtUpload preview={edit.imageUrl} onFile={file => upload(file)} onClear={() => setEdit(v => ({ ...v, imagePath: '', imageUrl: '', artMode: 'emoji' }))} disabled={busy}/>
            : <><label>{edit.artMode === 'text' ? 'Надпись на карточке' : 'Эмодзи / символ'}<input maxLength={32} value={edit.artSymbol} onChange={e => change('artSymbol', e.target.value)} placeholder={edit.artMode === 'text' ? 'VIP / Легенда / НЕОН' : 'Например, 🔥'}/></label>{edit.artMode === 'text' && <TextStyleEditor style={edit.artStyle} onChange={editStyle}/>}</>}
          {edit.kind === 'bundle' && <div className="ko-next-bundle-editor"><h3>{icon('layers', 19)} Состав набора <span>{edit.bundleItems.length + memberDrafts.length}/10</span></h3><p>После покупки игрок получит все указанные предметы. Набор имеет одну общую цену.</p>
            <div className="ko-next-bundle-picked">{edit.bundleItems.map(id => { const p = items.find(x => x.id === id); return p ? <div key={id}><Art item={p} size="small"/><span><strong>{p.title}</strong><small>Готовый товар · {fmt(priceOf(p))} CODI</small></span><IBtn name="close" title="Убрать из набора" onClick={() => change('bundleItems', edit.bundleItems.filter(x => x !== id))}/></div> : null; })}
              {memberDrafts.map((p, index) => <div key={p.draftKey}><Art item={p} size="small"/><span><strong>{p.title || 'Новый предмет'}</strong><small>Создастся при сохранении набора</small></span><IBtn name="close" title="Убрать из набора" onClick={() => setMemberDrafts(v => v.filter(x => x.draftKey !== p.draftKey))}/></div>)}</div>
            <details className="ko-next-existing"><summary>{icon('plus', 16)} Прикрепить существующий товар</summary><div>{items.filter(p => p.kind !== 'bundle').map(p => <label key={p.id}><input type="checkbox" disabled={!p.active && !edit.bundleItems.includes(p.id) || (!edit.bundleItems.includes(p.id) && edit.bundleItems.length + memberDrafts.length >= 10)} checked={edit.bundleItems.includes(p.id)} onChange={e => change('bundleItems', e.target.checked ? [...edit.bundleItems, p.id] : edit.bundleItems.filter(id => id !== p.id))}/><Art item={p} size="small"/><span>{p.title}<small>{p.active ? `${fmt(priceOf(p))} CODI` : 'Скрыт из магазина'}</small></span></label>)}</div></details>
            {memberDrafts.map((p, index) => <div className="ko-next-inline-create" key={p.draftKey}><header><strong>Новая карточка №{index + 1}</strong><IBtn name="close" title="Отменить создание" onClick={() => setMemberDrafts(v => v.filter(x => x.draftKey !== p.draftKey))}/></header>
              <div className="ko-next-row"><label>Название <b>*</b><input required minLength={2} maxLength={90} value={p.title} onChange={e => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, title: e.target.value } : x))}/></label><label>Тип <b>*</b><select value={p.kind} onChange={e => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, kind: e.target.value, categoryId: '' } : x))}>{Object.entries(KINDS).filter(([k]) => k !== 'bundle').map(([k, [title]]) => <option value={k} key={k}>{title}</option>)}</select></label></div>
              <div className="ko-next-row"><label>Цена предмета <input type="number" min={0} max={1000000} required value={p.price} onChange={e => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, price: e.target.value } : x))}/></label><label>Категория<select value={p.categoryId} onChange={e => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, categoryId: e.target.value } : x))}><option value="">Без категории</option>{categories.filter(c => c.kind === p.kind).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div>
              <div className="ko-next-row"><label>Оформление<select value={p.artMode} onChange={e => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, artMode: e.target.value } : x))}><option value="emoji">Эмодзи</option><option value="image">Изображение</option><option value="text">Текст</option></select></label><label>Символ / надпись<input maxLength={32} value={p.artSymbol} onChange={e => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, artSymbol: e.target.value } : x))}/></label></div>
              {p.artMode === 'image' && <ArtUpload disabled={busy} preview={p.imageUrl} onFile={file => upload(file, 'member', index)} onClear={() => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, imagePath: '', imageUrl: '' } : x))}/>}
              {p.artMode === 'text' && <TextStyleEditor style={p.artStyle} onChange={style => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, artStyle: style } : x))}/>}
              <label>Описание<textarea rows={2} maxLength={500} value={p.description} onChange={e => setMemberDrafts(v => v.map(x => x.draftKey === p.draftKey ? { ...x, description: e.target.value } : x))}/></label>
            </div>)}
            <Btn iconName="plus" disabled={busy || edit.bundleItems.length + memberDrafts.length >= 10} onClick={() => { setMemberDrafts(v => [...v, { ...NEW_ITEM('emoji'), price: '150', draftKey: crypto.randomUUID() }]); setNewMemberOpen(true); }}>Создать новый предмет внутри набора</Btn>
            {newMemberOpen && <div className="ko-next-fieldnote">Новые карточки сначала создаются как настоящие товары каталога. Затем их ID прикрепляются к набору автоматически.</div>}
            <strong className="ko-next-bundle-total">Цена предметов по отдельности: {fmt(items.filter(x => edit.bundleItems.includes(x.id)).reduce((sum, p) => sum + priceOf(p), 0) + memberDrafts.reduce((sum, p) => sum + Number(p.price || 0), 0))} CODI</strong>
          </div>}
          <label>Описание<textarea rows={3} maxLength={500} value={edit.description} onChange={e => change('description', e.target.value)} placeholder="Что получает игрок и как это выглядит?"/><small className="ko-next-count">{edit.description.length}/500</small></label>
          <label className="ko-next-toggle"><input type="checkbox" checked={edit.active} onChange={e => change('active', e.target.checked)}/><span>Активен в магазине</span></label>
          <div className="ko-next-form__buttons"><button className="ko-next-btn ko-next-btn--accent" type="submit" disabled={busy}>{icon('check', 18)} {busy ? 'Сохраняем…' : edit.id ? 'Сохранить' : edit.kind === 'bundle' ? 'Создать набор' : 'Создать товар'}</button><Btn iconName="close" onClick={() => setEditor(null)}>Отмена</Btn></div>
        </form>}
      </aside>}
    </div>}

    {tab === 'sales' && <div className="ko-next-sales">
      <section className="ko-next-panel"><header className="ko-next-panel__head"><div>{icon('tag', 23)}<div><h2>Акции и скидки</h2><p>Все уценённые товары и наборы в одном месте.</p></div></div><Btn accent iconName="plus" onClick={addPromotion}>Добавить рекламный блок</Btn></header>
        <form className="ko-next-sale-form" onSubmit={setDiscount}><label>Выбрать товар<select required value={saleId} onChange={e => { setSaleId(e.target.value); setSaleValue(''); }}><option value="">Выбери товар или набор</option>{items.filter(p => Number(p.price) > 0).map(p => <option value={p.id} key={p.id}>{p.title} · {fmt(p.price)} CODI</option>)}</select></label><label>Новая цена (CODI)<input type="number" required min={0} max={1000000} value={saleValue} onChange={e => setSaleValue(e.target.value)} placeholder="Цена по акции"/></label><button type="submit" className="ko-next-btn ko-next-btn--accent" disabled={busy}>{icon('check', 17)} Сохранить скидку</button></form>
      </section>
      <section className="ko-next-panel"><header className="ko-next-panel__head"><div>{icon('inventory', 23)}<div><h2>Уценённые товары · {activeSales.length}</h2><p>Редактируй цену или убирай предмет из акции, не удаляя сам товар.</p></div></div></header>
        <div className="ko-next-grid is-sales">{activeSales.map(p => <ProductCard key={p.id} p={p} all={items} selected={false} saleContext categoryName={categories.find(c => c.id === p.category_id)?.name} busy={busy} onEdit={() => beginEdit(p)} onVisibility={() => void toggleVisibility(p)} onSale={() => void quickSale(p)} onCopy={() => copyProduct(p)} onDelete={() => void mutate(() => adminRequest(`market/products/${p.id}`, { token, method: 'PATCH', body: { salePrice: null } }), 'Товар убран из акции.')}/>)}{!activeSales.length && <div className="ko-next-empty">Акционных товаров пока нет</div>}</div>
      </section>
    </div>}

    {tab === 'categories' && <div className="ko-next-builder">
      <section className="ko-next-panel ko-next-builder__blocks"><header className="ko-next-panel__head"><div>{icon('layers', 23)}<div><h2>Блоки магазина</h2><p>Перетаскивай разделы за ↕, чтобы изменить порядок их появления у игроков.</p></div></div><Btn accent iconName="check" onClick={() => void saveLayout()} disabled={busy || !configured}>Сохранить витрину</Btn></header>
        <div className="ko-next-block-list">{layout.map((s, i) => <div key={s.id} role="button" tabIndex={0} className={`ko-next-block ${sectionId === s.id ? 'is-selected' : ''} ${!s.active ? 'is-disabled' : ''}`} aria-pressed={sectionId === s.id} draggable onDragStart={e => dragStart(e, s.id)} onDragEnd={() => setDragId('')} onDragOver={e => e.preventDefault()} onDrop={e => dropSection(e, s.id)} onClick={() => setSectionId(s.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSectionId(s.id); } }}>
          <span className="ko-next-block__grab">↕</span><span className="ko-next-block__symbol">{s.icon}</span><span className="ko-next-block__body"><strong>{s.title}</strong><small>{s.section_type === 'color' ? 'Палитра' : s.section_type === 'promotion' ? 'Акция' : s.section_type === 'category' ? 'Категория' : 'Коллекция'} · {s.active ? 'Видна' : 'Скрыта'}</small></span>
          <div className="ko-next-block__move" onClick={e => e.stopPropagation()}><IBtn name="back" title="Переместить выше" disabled={i === 0} onClick={() => shiftSection(s.id, -1)}/><IBtn name="down" title="Переместить ниже" disabled={i === layout.length - 1} onClick={() => shiftSection(s.id, 1)}/></div>
        </div>)}</div><div className="ko-next-blocks-footer"><Btn iconName="plus" onClick={addPromotion}>Добавить блок акций</Btn></div>
      </section>
      <section className="ko-next-panel ko-next-builder__settings"><header className="ko-next-panel__head"><div>{icon('edit', 23)}<div><h2>Настройка блока</h2><p>Описание, значок, видимость и содержимое выбранного раздела.</p></div></div></header>
        {selectedSection && <div className="ko-next-settings-form"><label>Название блока<input maxLength={80} value={selectedSection.title} onChange={e => changeSection('title', e.target.value)}/></label><label>Подзаголовок<textarea maxLength={220} rows={3} value={selectedSection.subtitle || ''} onChange={e => changeSection('subtitle', e.target.value)}/></label><label>Эмодзи / значок<input maxLength={12} value={selectedSection.icon || ''} onChange={e => changeSection('icon', e.target.value)}/></label><label className="ko-next-toggle"><input type="checkbox" checked={selectedSection.active} onChange={e => changeSection('active', e.target.checked)}/><span>Показывать блок на сайте</span></label>
          {selectedSection.section_type === 'category' && selectedCategory && <div className="ko-next-settings-nest"><strong>Категория · {items.filter(p => p.category_id === selectedCategory.id).length} товаров</strong><label>Название категории<input maxLength={46} value={selectedCategory.name} onChange={e => setCategories(prev => prev.map(c => c.id === selectedCategory.id ? { ...c, name: e.target.value } : c))}/></label><label>Эмодзи категории<input maxLength={12} value={selectedCategory.icon} onChange={e => setCategories(prev => prev.map(c => c.id === selectedCategory.id ? { ...c, icon: e.target.value } : c))}/></label><div className="ko-next-inline-actions"><Btn iconName="check" onClick={() => void saveCategory()} disabled={busy || selectedCategory.name.trim().length < 2}>Сохранить категорию</Btn><Btn iconName="trash" disabled={busy} onClick={() => void deleteCategory()}>Удалить</Btn></div><Btn iconName="plus" onClick={() => { beginNew(selectedCategory.kind); setEdit(x => ({ ...x, categoryId: selectedCategory.id })); }}>Создать товар в категории</Btn></div>}
          {selectedSection.section_type === 'legacy' && <p className="ko-next-fieldnote">Здесь отображаются стандартные предметы и товары типа «{KINDS[selectedSection.kind]?.[0] || 'Набор'}» без собственной категории. Их можно редактировать в каталоге.</p>}
          {selectedSection.section_type === 'promotion' && <div className="ko-next-settings-nest"><strong>Товары и наборы рекламного блока</strong><small>Выбери активные товары со скидкой. Их можно перетаскивать вместе с блоком.</small><div className="ko-next-promotion-members">{activeSales.filter(p => p.active).map(p => <label key={p.id}><input type="checkbox" checked={(selectedSection.item_ids || []).includes(p.id)} onChange={e => changeSection('item_ids', e.target.checked ? [...(selectedSection.item_ids || []), p.id] : (selectedSection.item_ids || []).filter(id => id !== p.id))}/><Art item={p} size="small"/><span>{p.title}<small>−{discountOf(p)}% · {fmt(priceOf(p))} CODI</small></span></label>)}</div><Btn iconName="trash" onClick={deletePromotion}>Удалить блок акции</Btn></div>}
          <Btn accent iconName="check" onClick={() => void saveLayout()} disabled={busy || !configured}>Сохранить изменения</Btn>
        </div>}
        <form className="ko-next-create-category" onSubmit={createCategory}><h3>{icon('plus', 19)} Добавить категорию</h3><label>Название<input required minLength={2} maxLength={46} value={catDraft.name} placeholder="Например, Легендарные рамки" onChange={e => setCatDraft(x => ({ ...x, name: e.target.value }))}/></label><div className="ko-next-row"><label>Тип товара<select value={catDraft.kind} onChange={e => setCatDraft(x => ({ ...x, kind: e.target.value }))}>{Object.entries(KINDS).map(([k, [name]]) => <option key={k} value={k}>{name}</option>)}</select></label><label>Эмодзи<input maxLength={12} value={catDraft.icon} onChange={e => setCatDraft(x => ({ ...x, icon: e.target.value }))}/></label></div><button type="submit" className="ko-next-btn ko-next-btn--accent" disabled={busy || !configured}>{icon('plus', 16)} Добавить категорию и блок</button></form>
      </section>
      <section className="ko-next-panel ko-next-builder__preview"><header className="ko-next-panel__head"><div>{icon('eye', 23)}<div><h2>Живой предпросмотр страницы магазина</h2><p>Целые категории, все их товары и блоки акций. Перемещай прямо здесь или в списке слева.</p></div></div></header>
        <div className="ko-next-site-preview"><header className="ko-next-site-preview__head"><small>KODUMI GAMES · MARKET</small><h3>Магазин оформления</h3><p>Выбирай свой стиль. Купленные вещи остаются с тобой.</p><span>🪙 CODI</span></header>
          {layout.filter(s => s.active).map(s => <BlockPreview key={s.id} section={s} items={items} legacy={legacy} focused={sectionId === s.id} onFocus={setSectionId} onMove={moveSection} onDragBlock={dragStart} onDropBlock={dropSection}/>)}
        </div>
      </section>
    </div>}
    {quickSaleId && <div className="ko-next-modal-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setQuickSaleId(''); }}>
      <form className="ko-next-sale-modal" role="dialog" aria-modal="true" aria-labelledby="ko-next-sale-title" onSubmit={saveQuickSale}>
        <div className="ko-next-sale-modal__head"><span>{icon('tag', 22)}</span><div><h2 id="ko-next-sale-title">Быстрая акция</h2><p>{items.find(x => x.id === quickSaleId)?.title || 'Товар'}</p></div><IBtn name="close" title="Закрыть" disabled={busy} onClick={() => setQuickSaleId('')}/></div>
        <p>Обычная цена: <strong>{fmt(items.find(x => x.id === quickSaleId)?.price)} CODI</strong>. Укажи новую цену или оставь поле пустым, чтобы снять скидку.</p>
        <label>Цена по акции (CODI)<input autoFocus type="number" min={0} max={1000000} value={quickSaleValue} placeholder="Без скидки" onChange={e => setQuickSaleValue(e.target.value)}/></label>
        {error && <small className="ko-next-sale-modal__error">{error}</small>}
        <div><button type="submit" className="ko-next-btn ko-next-btn--accent" disabled={busy}>{icon('check', 16)} {busy ? 'Сохраняем…' : 'Сохранить скидку'}</button><Btn iconName="close" onClick={() => setQuickSaleId('')} disabled={busy}>Отмена</Btn></div>
      </form>
    </div>}
  </div>;
}
