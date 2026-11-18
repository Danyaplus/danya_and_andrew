import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import AdminGlyph from './AdminGlyph.jsx';
import catalog from '../../../shared/cosmetics.json';

const kinds = {
  site: ['Фон сайта', '🌌'], background: ['Шапка профиля', '🏞️'], emoji: ['Смайлик / иконка', '✨'],
  frame: ['Рамка профиля', '🖼️'], title: ['Титул', '👑'], card: ['Стиль карточек', '🎴'], bundle: ['Набор', '🎁'],
};
const blank = (kind = 'site') => ({ id: '', title: '', description: '', kind, categoryId: '', price: '150', salePrice: '', imagePath: '', imageUrl: '', active: true, bundleItems: [] });
const fmt = n => Number(n || 0).toLocaleString('ru-RU');
const sellPrice = product => product.sale_price == null ? product.price : product.sale_price;
const salePercent = product => product.sale_price == null ? 0 : Math.round((1 - product.sale_price / Math.max(1, product.price)) * 100);
const productToForm = product => ({ id: product.id, title: product.title, description: product.description || '', kind: product.kind, categoryId: product.category_id || '', price: String(product.price), salePrice: product.sale_price ?? '', imagePath: product.image_path || '', imageUrl: product.imageUrl || '', active: product.active, bundleItems: product.bundle_items || [] });

function IconButton({ name, title, onClick, danger = false, disabled = false }) { return <button type="button" className={`ko-iconbtn ${danger ? 'ko-iconbtn--danger' : ''}`} title={title} aria-label={title} disabled={disabled} onClick={onClick}><AdminGlyph name={name} size={17}/></button>; }
function Button({ icon, children, variant = 'quiet', ...props }) { return <button type="button" className={`ko-button ko-button--${variant}`} {...props}><AdminGlyph name={icon} size={17}/>{children}</button>; }
function Artwork({ product, size = 'normal' }) {
  const icon = kinds[product.kind]?.[1] || '✨';
  return <div className={`ko-product-art ko-product-art--${product.kind} ko-product-art--${size}`}>
    {product.kind === 'bundle' && !product.imageUrl && Array.isArray(product.members) && product.members.length ? <div className="ko-art-stack">{product.members.slice(0, 3).map(item => <span key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt=""/> : kinds[item.kind]?.[1]}</span>)}</div>
      : product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{icon}</span>}
  </div>;
}
async function compressImage(file, preserveTransparency) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 6_000_000) throw Error('Выбери PNG, JPG или WebP до 6 МБ.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Не удалось прочитать изображение.')); image.src = url; });
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const preferred = preserveTransparency || file.type !== 'image/jpeg' ? 'image/webp' : 'image/jpeg';
    let dataUrl = '';
    for (let quality = .88; quality >= .36; quality -= .08) {
      dataUrl = canvas.toDataURL(preferred, quality);
      if (dataUrl.length <= 1_250_000) break;
    }
    if (dataUrl.length > 1_250_000) throw Error('Картинка слишком большая после сжатия. Выбери изображение меньшего размера.');
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/i);
    if (!match) throw Error('Формат изображения не поддерживается.');
    return { mime: match[1], data: match[2] };
  } finally { URL.revokeObjectURL(url); }
}

export default function AdminMarketPanel({ token }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryConfigured, setCategoryConfigured] = useState(true);
  const [tab, setTab] = useState('products');
  const [edit, setEdit] = useState(blank());
  const [editorOpen, setEditorOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showBuiltins, setShowBuiltins] = useState(false);
  const [categoryEdit, setCategoryEdit] = useState({ id: '', name: '', kind: 'site', icon: '✨' });
  const [promotionId, setPromotionId] = useState('');
  const [promotionSale, setPromotionSale] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [page, setPage] = useState(0);
  const inputRef = useRef(null);
  const load = useCallback(async () => {
    const result = await adminRequest('market/products', { token });
    setItems(result.products || []);
    setCategories(result.categories || []);
    setCategoryConfigured(result.configured !== false);
    return result;
  }, [token]);
  useEffect(() => { load().catch(err => setError(adminErrorText(err))); }, [load]);
  const editing = (field, value) => setEdit(old => ({ ...old, [field]: value }));
  const stats = useMemo(() => ({ total: items.length, bundles: items.filter(p => p.kind === 'bundle').length, sales: items.filter(p => p.active && p.sale_price != null).length, categories: Object.keys(kinds).length + categories.length }), [items, categories]);
  const options = useMemo(() => items.filter(p => p.kind !== 'bundle' && p.id !== edit.id), [items, edit.id]);
  const filtered = useMemo(() => items.filter(item => {
    if (tab === 'bundles' && item.kind !== 'bundle') return false;
    if (tab === 'products' && item.kind === 'bundle') return false;
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    if (categoryFilter !== 'all' && (item.category_id || item.kind) !== categoryFilter) return false;
    if (statusFilter === 'active' && !item.active || statusFilter === 'hidden' && item.active) return false;
    const haystack = `${item.title} ${item.description || ''} ${item.id}`.toLocaleLowerCase();
    return haystack.includes(search.trim().toLocaleLowerCase());
  }), [items, tab, kindFilter, categoryFilter, statusFilter, search]);
  const displayed = filtered.slice(page * 8, page * 8 + 8);
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  useEffect(() => { setPage(0); }, [tab, kindFilter, categoryFilter, statusFilter, search]);
  const categoryName = product => categories.find(c => c.id === product.category_id)?.name || kinds[product.kind]?.[0] || product.kind;
  function newItem(kind = tab === 'bundles' ? 'bundle' : 'site') { setEdit(blank(kind)); setEditorOpen(true); setError(''); setNotice(''); }
  function editItem(item) { setEdit(productToForm(item)); setEditorOpen(true); setError(''); setNotice(''); setTab(item.kind === 'bundle' ? 'bundles' : 'products'); }
  async function mutate(action, success) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); setNotice(success); }
    catch (err) { setError(adminErrorText(err)); }
    finally { setBusy(false); }
  }
  async function uploadImage(file) {
    if (!file || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = await compressImage(file, ['emoji', 'frame', 'title'].includes(edit.kind));
      const response = await adminRequest('market/upload', { token, body: payload });
      setEdit(old => ({ ...old, imagePath: response.imagePath, imageUrl: response.imageUrl }));
      setNotice('Изображение загружено. Сохрани товар, чтобы прикрепить его.');
    } catch (err) { setError(err?.message === 'INVALID_IMAGE' ? adminErrorText(err) : err?.message || adminErrorText(err)); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  }
  async function save(event) {
    event.preventDefault();
    const price = Number(edit.price);
    if (!Number.isSafeInteger(price) || price < 0) { setError('Укажи целое число монет.'); return; }
    if (edit.salePrice !== '' && (!Number.isSafeInteger(Number(edit.salePrice)) || Number(edit.salePrice) >= price || Number(edit.salePrice) < 0)) { setError('Цена по акции должна быть меньше обычной цены.'); return; }
    if (edit.kind === 'bundle' && (edit.bundleItems.length < 2 || edit.bundleItems.length > 10)) { setError('Выбери от 2 до 10 товаров в набор.'); return; }
    await mutate(async () => {
      await adminRequest('market/products', { token, body: edit });
      setEdit(blank(edit.kind));
    }, 'Товар сохранён и обновится на сайте после загрузки каталога.');
  }
  async function copy(item) {
    setEdit({ ...productToForm(item), id: '', title: `${item.title} (копия)` }); setEditorOpen(true); setTab(item.kind === 'bundle' ? 'bundles' : 'products');
    setNotice('Создан черновик копии. Измени название и нажми «Сохранить».');
  }
  function remove(item) {
    if (!window.confirm(`Удалить «${item.title}»? Если предмет уже куплен или входит в набор, удаление будет запрещено — его можно скрыть.`)) return;
    void mutate(() => adminRequest(`market/products/${item.id}`, { token, method: 'DELETE' }), 'Товар удалён.');
  }
  function flip(item) { void mutate(() => adminRequest(`market/products/${item.id}`, { token, method: 'PATCH', body: { active: !item.active } }), item.active ? 'Товар скрыт с витрины.' : 'Товар снова доступен.'); }
  function saveCategory(event) {
    event.preventDefault();
    if (!categoryConfigured) { setError('Сначала выполни SQL-миграцию категорий в Supabase.'); return; }
    void mutate(async () => {
      await adminRequest('market/categories', { token, body: categoryEdit });
      setCategoryEdit({ id: '', name: '', kind: 'site', icon: '✨' });
    }, 'Категория сохранена и доступна в магазине.');
  }
  function deleteCategory(item) {
    if (!window.confirm(`Удалить категорию «${item.name}»? Это возможно, только если в ней нет товаров.`)) return;
    void mutate(() => adminRequest(`market/categories/${item.id}`, { token, method: 'DELETE' }), 'Категория удалена.');
  }
  function setPromotion(event) {
    event.preventDefault();
    const item = items.find(p => p.id === promotionId);
    if (!item || item.kind === 'bundle' && item.price <= 0) { setError('Выбери товар для скидки.'); return; }
    const sale = Number(promotionSale);
    if (!Number.isSafeInteger(sale) || sale < 0 || sale >= item.price) { setError('Новая цена должна быть целой и ниже обычной.'); return; }
    void mutate(() => adminRequest(`market/products/${item.id}`, { token, method: 'PATCH', body: { salePrice: sale } }), 'Акция активирована. Цена на витрине обновлена.');
  }
  const allSales = items.filter(p => p.sale_price != null);
  const members = options.filter(p => edit.bundleItems.includes(p.id));
  const availableOptions = options.filter(p => p.title.toLocaleLowerCase().includes(memberQuery.toLocaleLowerCase()));
  const normalTotal = members.reduce((sum, p) => sum + Number(sellPrice(p)), 0);
  return <div className="ko-screen ko-market">
    <div className="ko-metrics">
      {[['Всего товаров', stats.total, 'store', 'violet'], ['Наборов', stats.bundles, 'layers', 'blue'], ['Активных акций', stats.sales, 'tag', 'purple'], ['Категорий', stats.categories, 'folder', 'gold']].map(([name, value, icon, color]) => <div key={name} className={`ko-metric ko-metric--${color}`}><span className="ko-metric__icon"><AdminGlyph name={icon} size={25}/></span><div><span>{name}</span><strong>{value}</strong></div></div>)}
    </div>
    <div className="ko-market-tabs" role="tablist" aria-label="Разделы магазина">{[['products', 'Товары', 'store'], ['bundles', 'Наборы', 'layers'], ['sales', 'Акции', 'tag'], ['categories', 'Категории', 'folder']].map(([id, label, icon]) => <button type="button" role="tab" aria-selected={tab === id} key={id} className={tab === id ? 'is-active' : ''} onClick={() => { setTab(id); setCategoryFilter('all'); setKindFilter('all'); setStatusFilter('all'); setSearch(''); if (id === 'bundles' || id === 'products') { setEdit(blank(id === 'bundles' ? 'bundle' : 'site')); setEditorOpen(true); } setError(''); setNotice(''); }}><AdminGlyph name={icon} size={19}/>{label}</button>)}</div>
    {error ? <div className="ko-alert" role="alert">{error}</div> : null}{notice ? <div className="ko-alert ko-alert--success" role="status">{notice}</div> : null}
    {(tab === 'products' || tab === 'bundles') ? <div className={`ko-market-columns ${!editorOpen ? 'ko-market-columns--wide' : ''}`}>
      <section className="ko-market-catalog">
        <div className="ko-market-actions"><Button icon="plus" variant="primary" onClick={() => newItem(tab === 'bundles' ? 'bundle' : 'site')}>Добавить {tab === 'bundles' ? 'набор' : 'товар'}</Button><span>Управление каталогом и витриной</span></div>
        <div className="ko-market-filters"><label className="ko-market-search"><AdminGlyph name="search" size={18}/><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию…" aria-label="Поиск товара"/></label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Категория"><option value="all">Все категории</option>{Object.entries(kinds).map(([kind, [name]]) => <option value={kind} key={kind}>{name}</option>)}{categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select>
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} aria-label="Тип"><option value="all">Все типы</option>{Object.entries(kinds).map(([kind, [name]]) => <option key={kind} value={kind}>{name}</option>)}</select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Доступность"><option value="all">Все статусы</option><option value="active">Активные</option><option value="hidden">Скрытые</option></select>
        </div>
        <div className="ko-market-tablewrap"><table className="ko-market-table"><thead><tr><th>Товар</th><th>Категория</th><th>Тип</th><th>Цена</th><th>Статус</th><th>Действия</th></tr></thead><tbody>
          {displayed.map(item => <tr key={item.id} className={edit.id === item.id ? 'is-edited' : ''}><td><div className="ko-market-productcell"><Artwork product={{ ...item, members: (item.bundle_items || []).map(id => items.find(p => p.id === id)).filter(Boolean) }} size="small"/><div><strong>{item.title}</strong><small>ID: #{item.id.slice(0, 8)}</small></div></div></td><td><span className="ko-market-category"><span>{categories.find(c => c.id === item.category_id)?.icon || kinds[item.kind]?.[1]}</span>{categoryName(item)}</span></td><td>{kinds[item.kind]?.[0]}</td><td><div className="ko-market-price">🟡 {fmt(sellPrice(item))}{item.sale_price != null ? <small><del>{fmt(item.price)}</del> −{salePercent(item)}%</small> : null}</div></td><td><span className={`ko-market-state ${item.active ? 'is-live' : ''}`}>{item.active ? 'Активен' : 'Скрыт'}</span></td><td><div className="ko-market-rowactions"><IconButton name="edit" title="Редактировать" onClick={() => editItem(item)}/><IconButton name="copy" title="Дублировать" onClick={() => copy(item)}/><IconButton name={item.active ? 'eye' : 'check'} title={item.active ? 'Скрыть с витрины' : 'Активировать'} disabled={busy} onClick={() => flip(item)}/><IconButton name="trash" title="Удалить" danger disabled={busy} onClick={() => remove(item)}/></div></td></tr>)}
        </tbody></table>{!displayed.length ? <div className="ko-empty"><AdminGlyph name="store" size={30}/><strong>Товары не найдены</strong><span>Добавь первый предмет или измени фильтры.</span></div> : null}</div>
        <div className="ko-market-bottom"><span>Показано {displayed.length} из {filtered.length}</span><div>{page > 0 ? <IconButton name="back" title="Предыдущая страница" onClick={() => setPage(p => p - 1)}/> : null}<b>{page + 1} / {pages}</b>{page < pages - 1 ? <IconButton name="down" title="Следующая страница" onClick={() => setPage(p => p + 1)}/> : null}</div></div>
        <button type="button" className="ko-market-builtins-toggle" onClick={() => setShowBuiltins(s => !s)}>{showBuiltins ? 'Скрыть' : 'Показать'} встроенную коллекцию ({catalog.length}) <AdminGlyph name="down" size={16}/></button>
        {showBuiltins ? <div className="ko-market-builtins">{catalog.map(p => <span key={p.id}>{p.icon} {p.name} · {fmt(p.price)} CODI</span>)}<small>Стандартные товары управляются отдельно от пользовательского каталога.</small></div> : null}
      </section>
      {editorOpen ? <aside className="ko-market-editor"><div className="ko-market-editor__head"><h2>{edit.id ? 'Редактировать' : tab === 'bundles' ? 'Создать набор' : 'Добавить товар'}</h2><IconButton name="close" title="Закрыть редактор" onClick={() => setEditorOpen(false)}/></div>
        <form onSubmit={save} className="ko-market-form"><label>Название товара <b>*</b><input required minLength={2} maxLength={90} placeholder="Например: Фиолетовая рамка" value={edit.title} onChange={e => editing('title', e.target.value)}/></label>
          <label>Тип товара <b>*</b><select value={edit.kind} onChange={e => setEdit(old => ({ ...old, kind: e.target.value, categoryId: '', bundleItems: [], imagePath: '', imageUrl: '' }))} disabled={tab === 'bundles' || Boolean(edit.id)}>{Object.entries(kinds).filter(([kind]) => tab === 'bundles' ? kind === 'bundle' : kind !== 'bundle').map(([kind, [label]]) => <option key={kind} value={kind}>{label}</option>)}</select>{edit.id ? <small className="ko-muted">Тип сохранённого товара менять нельзя. Для другого типа создай новый.</small> : null}</label>
          <label>Категория<select value={edit.categoryId} onChange={e => editing('categoryId', e.target.value)}><option value="">Стандартная: {kinds[edit.kind]?.[0]}</option>{categories.filter(c => c.kind === edit.kind).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
          <div className="ko-market-form__twocol"><label>Цена (CODI) <b>*</b><input type="number" required min={0} max={1000000} value={edit.price} onChange={e => editing('price', e.target.value)}/></label><label>Цена по акции<input type="number" min={0} max={1000000} placeholder="Без скидки" value={edit.salePrice} onChange={e => editing('salePrice', e.target.value)}/></label></div>
          <label className="ko-market-switch"><input type="checkbox" checked={edit.active} onChange={e => editing('active', e.target.checked)}/><span>Активен · виден на витрине</span></label>
          {edit.kind === 'bundle' ? <div className="ko-market-members"><b><AdminGlyph name="layers" size={17}/> Состав набора · {edit.bundleItems.length}/10</b><p>Выбери от 2 до 10 активных отдельных товаров. Неактивные нельзя добавить.</p><input type="search" value={memberQuery} onChange={e => setMemberQuery(e.target.value)} placeholder="Найти предмет для набора…"/><div className="ko-market-members__list">{availableOptions.map(item => <label key={item.id} className={!item.active ? 'is-disabled' : ''}><input type="checkbox" disabled={!item.active && !edit.bundleItems.includes(item.id)} checked={edit.bundleItems.includes(item.id)} onChange={e => editing('bundleItems', e.target.checked ? [...edit.bundleItems, item.id] : edit.bundleItems.filter(id => id !== item.id))}/><Artwork product={item} size="tiny"/><span>{item.title}<small>{fmt(sellPrice(item))} CODI</small></span></label>)}{!availableOptions.length ? <small>Сначала создай обычные товары.</small> : null}</div><div className="ko-market-members__total">Предметы по отдельности: <strong>{fmt(normalTotal)} CODI</strong></div></div>
          : null}
          <div className="ko-market-upload"><b>Изображение</b><label className="ko-upload-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void uploadImage(e.dataTransfer.files?.[0]); }}><AdminGlyph name="image" size={30}/><span>Перетащи изображение сюда или <u>выбери файл</u></span><small>PNG, JPG, WebP · до 6 МБ · автоматическое сжатие</small><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void uploadImage(e.target.files?.[0])} disabled={busy}/></label>{edit.imageUrl ? <div className="ko-upload-preview"><img src={edit.imageUrl} alt="Предпросмотр"/><span>Изображение прикреплено</span><IconButton name="trash" title="Убрать изображение" onClick={() => setEdit(old => ({ ...old, imagePath: '', imageUrl: '' }))}/></div> : <p className="ko-upload-hint">Без картинки магазин покажет {kinds[edit.kind]?.[1]} на цветном фоне. Для смайликов этот фон создаётся автоматически.</p>}</div>
          <label>Описание<textarea rows={3} maxLength={500} placeholder="Что получает игрок после покупки?" value={edit.description} onChange={e => editing('description', e.target.value)}/></label>
          <div className="ko-store-preview"><b>Предпросмотр на витрине</b><div className="ko-store-preview__card"><Artwork product={{ ...edit, members }}/><div><small>{categories.find(c => c.id === edit.categoryId)?.name || kinds[edit.kind]?.[0]}</small><strong>{edit.title || 'Название товара'}</strong><span>{edit.description || 'Описание появится здесь'}</span><b>🟡 {fmt(edit.salePrice === '' ? edit.price : edit.salePrice)} CODI</b></div></div></div>
          <div className="ko-market-editor__footer"><Button icon="close" onClick={() => { setEdit(blank(edit.kind)); setEditorOpen(false); }}>Отмена</Button><button type="submit" className="ko-button ko-button--primary" disabled={busy}><AdminGlyph name="plus" size={17}/>{busy ? 'Сохранение…' : edit.id ? 'Сохранить изменения' : 'Создать товар'}</button></div>
        </form>
      </aside> : <aside className="ko-market-editor ko-market-editor--closed"><AdminGlyph name="edit" size={34}/><h3>Редактор закрыт</h3><p>Выбери товар или создай новый.</p><Button icon="plus" variant="primary" onClick={() => newItem(tab === 'bundles' ? 'bundle' : 'site')}>Добавить</Button></aside>}
    </div> : null}
    {tab === 'sales' ? <div className="ko-market-management"><section className="ko-panel"><div className="ko-panel__heading"><h2>Управление акциями</h2><small>{allSales.length} скидок в каталоге</small></div><p>Установи акционную цену для конкретного товара. Она сразу будет показана игрокам вместо обычной стоимости.</p><form className="ko-market-manage-form" onSubmit={setPromotion}><label>Товар<select required value={promotionId} onChange={e => { setPromotionId(e.target.value); setPromotionSale(''); }}><option value="">Выбери товар</option>{items.filter(item => item.active && item.price > 0).map(item => <option value={item.id} key={item.id}>{item.title} · {fmt(item.price)} CODI</option>)}</select></label><label>Новая цена (CODI)<input type="number" required min={0} value={promotionSale} onChange={e => setPromotionSale(e.target.value)} placeholder="Например, 99"/></label><button className="ko-button ko-button--primary" type="submit" disabled={busy}><AdminGlyph name="tag" size={17}/>Применить скидку</button></form></section><section className="ko-panel"><div className="ko-panel__heading"><h2>Активные и сохранённые скидки</h2><small>{allSales.length}</small></div><div className="ko-sale-list">{allSales.map(item => <div className="ko-sale-item" key={item.id}><Artwork product={item} size="small"/><div><strong>{item.title}</strong><span><del>{fmt(item.price)}</del> → {fmt(item.sale_price)} CODI · −{salePercent(item)}%</span></div><PillSale active={item.active}/><Button icon="trash" disabled={busy} onClick={() => void mutate(() => adminRequest(`market/products/${item.id}`, { token, method: 'PATCH', body: { salePrice: null } }), 'Скидка отменена.')}>Отменить</Button></div>)}{!allSales.length ? <div className="ko-empty"><AdminGlyph name="tag" size={32}/><strong>Акций пока нет</strong><span>Выбери товар, установи цену со скидкой и сохрани.</span></div> : null}</div></section></div> : null}
    {tab === 'categories' ? <div className="ko-market-management"><section className="ko-panel"><div className="ko-panel__heading"><h2>{categoryEdit.id ? 'Редактировать категорию' : 'Новая категория'}</h2></div><p>Своя категория — это отдельный раздел магазина. Тип определяет, как купленные вещи применяются в инвентаре.</p>{!categoryConfigured ? <div className="ko-alert">Чтобы создавать категории, сначала выполни SQL-файл из обновления в Supabase.</div> : null}<form className="ko-market-manage-form" onSubmit={saveCategory}><label>Название категории <input value={categoryEdit.name} required minLength={2} maxLength={46} placeholder="Например, Неоновые рамки" onChange={e => setCategoryEdit(old => ({ ...old, name: e.target.value }))}/></label><label>Тип предметов<select value={categoryEdit.kind} onChange={e => setCategoryEdit(old => ({ ...old, kind: e.target.value }))}>{Object.entries(kinds).map(([key, [name]]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Иконка <input value={categoryEdit.icon} maxLength={12} placeholder="✨" onChange={e => setCategoryEdit(old => ({ ...old, icon: e.target.value }))}/></label><button type="submit" className="ko-button ko-button--primary" disabled={busy || !categoryConfigured}><AdminGlyph name="plus" size={17}/>{categoryEdit.id ? 'Сохранить категорию' : 'Добавить категорию'}</button>{categoryEdit.id ? <Button icon="close" onClick={() => setCategoryEdit({ id: '', name: '', kind: 'site', icon: '✨' })}>Отмена</Button> : null}</form></section><section className="ko-panel"><div className="ko-panel__heading"><h2>Разделы магазина</h2><small>{categories.length} пользовательских</small></div><h3>Стандартные</h3><div className="ko-category-chips">{Object.entries(kinds).map(([kind, [name, icon]]) => <span key={kind}>{icon} {name}</span>)}</div><h3>Созданные категории</h3><div className="ko-category-list">{categories.map(category => <div key={category.id}><span className="ko-category-icon">{category.icon}</span><div><strong>{category.name}</strong><small>{kinds[category.kind]?.[0]} · {items.filter(p => p.category_id === category.id).length} товаров</small></div><IconButton name="edit" title="Изменить" onClick={() => setCategoryEdit({ id: category.id, name: category.name, kind: category.kind, icon: category.icon })}/><IconButton name="trash" title="Удалить пустую категорию" danger disabled={busy} onClick={() => deleteCategory(category)}/></div>)}{!categories.length ? <p className="ko-muted">Добавь первую собственную категорию.</p> : null}</div></section></div> : null}
  </div>;
}
function PillSale({ active }) { return <span className={`ko-market-state ${active ? 'is-live' : ''}`}>{active ? 'Активна' : 'Скрыта'}</span>; }
