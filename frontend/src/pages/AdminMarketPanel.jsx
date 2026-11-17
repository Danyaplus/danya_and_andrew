import AdminGlyph from './AdminGlyph.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { adminRequest, adminErrorText } from '../lib/adminApi.js';
import catalog from '../../../shared/cosmetics.json';
import './admin-market.css';

const kinds = {
  site: 'Фон сайта',
  background: 'Шапка профиля',
  emoji: 'Смайлики / иконки',
  frame: 'Рамка профиля',
  title: 'Титул',
  card: 'Стиль игровых карточек',
  bundle: 'Комплект',
};

const helpByKind={
  site:'Картинка станет фоном сайта после покупки и применения в инвентаре.',
  background:'Изображение будет оформлением шапки профиля.',
  emoji:'Изображение отображается как приобретённая иконка профиля.',
  frame:'Лучше загрузи PNG или WebP с прозрачным фоном: мы сохраним прозрачность рамки.',
  title:'Название титула появится в профиле. Можно добавить отдельную иконку.',
  card:'Изображение будет фоном игровых карточек на главной странице.',
  bundle:'Комплект содержит другие активные товары магазина. Выбери от двух до десяти предметов.',
};
const kindIcons={site:'🌌',background:'🏞️',emoji:'✨',frame:'🖼️',title:'👑',card:'🎴',bundle:'🎁'};

const blank = {
  id: '',
  title: '',
  description: '',
  kind: 'site',
  price: 150,
  salePrice: '',
  imagePath: '',
  imageUrl: '',
  active: true,
  bundleItems: [],
};

function compress(file, preserveTransparency = false) {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5e6) {
      reject(Error('Выбери картинку PNG/JPG/WebP до 5 МБ.'));
      return;
    }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(1, 1200 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const type=(preserveTransparency||file.type!=='image/jpeg')?'image/webp':'image/jpeg';
        let quality=0.85;
        let output='';
        do {
          output=canvas.toDataURL(type,quality);
          quality-=0.11;
        }while(output.length>620000&&quality>0.3);
        if(output.length>650000)throw Error('Изображение не удалось сжать до 650 КБ. Выбери изображение меньшего размера.');
        const actual=output.match(/^data:(image\/(?:png|jpeg|webp));base64,/i)?.[1];
        if(!actual)throw Error('Формат изображения не поддерживается.');
        resolve({mime:actual,data:output.split(',')[1]});
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Error('Ошибка изображения.'));
    };
    image.src = url;
  });
}

export default function AdminMarketPanel({ token }) {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [showBuiltins, setShowBuiltins] = useState(false);
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const fileInputRef = useRef(null);

  const refresh = async () => {
    try {
      const response = await adminRequest('market/products', { token });
      setItems(response.products || []);
      setError('');
    } catch (requestError) {
      setError(adminErrorText(requestError));
    }
  };

  useEffect(() => { refresh(); }, [token]);

  const productOptions = useMemo(
    () => items.filter((item) => item.kind !== 'bundle' && item.id !== edit.id),
    [items, edit.id],
  );

  const stats = useMemo(() => ({
    total: items.length,
    bundles: items.filter((item) => item.kind === 'bundle').length,
    sales: items.filter((item) => item.sale_price !== null && item.sale_price !== undefined).length,
    active: items.filter((item) => item.active).length,
  }), [items]);

  const filtered=useMemo(()=>items.filter(item=>(filter==='all'||item.kind===filter)&&
    `${item.title} ${item.description||''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),[items,filter,search]);
  const update = (key, value) => setEdit((state) => ({ ...state, [key]: value }));

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const image = await compress(file, edit.kind === 'frame');
      const response = await adminRequest('market/upload', { token, body: image });
      setEdit((state) => ({ ...state, imagePath: response.imagePath, imageUrl: response.imageUrl }));
    } catch (uploadError) {
      setError(uploadError.message || adminErrorText(uploadError));
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const price=Number(edit.price);
      if(edit.salePrice!==''&&(Number(edit.salePrice)>=price||Number(edit.salePrice)<0)) {
        setError('Цена по акции должна быть меньше обычной цены.');return;
      }
      if(edit.kind==='bundle'&&(edit.bundleItems.length<2||edit.bundleItems.length>10)){
        setError('Для комплекта нужно выбрать от 2 до 10 активных товаров.');return;
      }
      await adminRequest('market/products', { token, body: edit });
      await refresh();
      setEdit(blank);
      setDone('Товар сохранён.');
    } catch (saveError) {
      setError(adminErrorText(saveError));
    } finally {
      setBusy(false);
    }
  }

  const changeBundle = (id, enabled) => setEdit((state) => ({
    ...state,
    bundleItems: enabled ? [...state.bundleItems, id] : state.bundleItems.filter((itemId) => itemId !== id),
  }));

  return (
    <div className="kc-market-admin">
      <div className="kc-market-head">
        <div>
          <h2>Каталог и акции</h2>
          <p>Добавляй товары, настраивай скидки и собирай выгодные комплекты.</p>
        </div>
        <button type="button" onClick={() => { setEdit(blank); setError(''); setDone(''); }}><AdminGlyph name="store" size={17}/> + Новый товар</button>
      </div>

      <div className="kc-market-stats">
        <div><strong>{stats.total}</strong><span>Всего товаров</span></div>
        <div><strong>{stats.active}</strong><span>Активные</span></div>
        <div><strong>{stats.sales}</strong><span>Со скидкой</span></div>
        <div><strong>{stats.bundles}</strong><span>Комплекты</span></div>
      </div>

      <div className="kc-market-columns">
        <section className="kc-market-list">
          <div className="kc-market-sectionhead">
            <h3>Созданные товары</h3>
            <span>{items.length}</span>
          </div>

          <div className="kc-market-filters">
            <label aria-label="Поиск товаров"><AdminGlyph name="search" size={17}/><input type="search" placeholder="Найти товар…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
            <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Категория товаров"><option value="all">Все категории</option>{Object.entries(kinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
          </div>
          <p className="kc-market-filtercount">В списке {filtered.length} из {items.length} товаров</p>
          {filtered.length ? filtered.map((product) => (
            <button
              type="button"
              key={product.id}
              className={`kc-market-entry ${edit.id === product.id ? 'is-current' : ''}`}
              onClick={() => setEdit({
                id: product.id,
                title: product.title,
                description: product.description,
                kind: product.kind,
                price: product.price,
                salePrice: product.sale_price ?? '',
                imagePath: product.image_path || '',
                imageUrl: product.imageUrl || '',
                active: product.active,
                bundleItems: product.bundle_items || [],
              })}
            >
              <div className="kc-market-entry__image">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : '🎁'}</div>
              <span>
                <strong>{product.title}</strong>
                <small>{kinds[product.kind]} · {product.price} CODI</small>
                {product.sale_price !== null && product.sale_price !== undefined ? <em>{product.sale_price} CODI по акции</em> : null}
              </span>
              <i className={product.active ? 'is-live' : 'is-off'}>{product.active ? '●' : '○'}</i>
            </button>
          )) : <p className="kc-market-empty">{items.length?'Товары по фильтру не найдены.':'Созданных товаров ещё нет.'}</p>}

          <button type="button" className="kc-market-show" onClick={() => setShowBuiltins((state) => !state)}>
            {showBuiltins ? 'Скрыть стандартные товары' : 'Показать стандартные товары'} ({catalog.length})
          </button>

          {showBuiltins ? (
            <div className="kc-market-builtins">
              {catalog.map((product) => (
                <div key={product.id}>
                  <span>{product.icon} {product.name}</span>
                  <small>{product.price} CODI</small>
                </div>
              ))}
              <p>Стандартный каталог работает по прежним SQL-правилам. Его цены пока нельзя менять через этот редактор.</p>
            </div>
          ) : null}
        </section>

        <section className="kc-market-editor">
          <div className="kc-market-sectionhead">
            <h3>{edit.id ? 'Редактирование товара' : 'Новый товар'}</h3>
            <span>{edit.kind === 'bundle' ? 'Комплект' : kinds[edit.kind]}</span>
          </div>

          <div className="kc-market-guide"><span>{kindIcons[edit.kind]}</span><p>{helpByKind[edit.kind]}</p></div>
          <form onSubmit={save}>
            <div className="kc-market-grid">
              <label>
                Название
                <input required minLength={2} maxLength={90} value={edit.title} onChange={(event) => update('title', event.target.value)} />
              </label>
              <label>
                Категория
                <select value={edit.kind} onChange={(event) => { update('kind', event.target.value); update('bundleItems', []); }}>
                  {Object.entries(kinds).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>

            <label>
              Описание
              <textarea rows={3} maxLength={500} value={edit.description} onChange={(event) => update('description', event.target.value)} placeholder="Кратко опиши товар или набор" />
            </label>

            <div className="kc-market-prices">
              <label>
                Цена CODI
                <input type="number" required min={0} max={1000000} value={edit.price} onChange={(event) => update('price', event.target.value)} />
              </label>
              <label>
                Цена со скидкой
                <input type="number" min={0} max={1000000} placeholder="Нет скидки" value={edit.salePrice} onChange={(event) => update('salePrice', event.target.value)} />
              </label>
            </div>

            {edit.salePrice !== '' ? (
              <div className="kc-market-discount">
                <div>
                  <span>Старая цена</span>
                  <del>{edit.price} CODI</del>
                </div>
                <div>
                  <span>Цена по акции</span>
                  <strong>{edit.salePrice} CODI</strong>
                </div>
              </div>
            ) : null}

            {edit.kind === 'bundle' ? (
              <div className="kc-market-bundle">
                <b>Состав комплекта · выбери от 2 до 10 товаров</b>
                {productOptions.length ? productOptions.map((product) => (
                  <label key={product.id}>
                    <input type="checkbox" checked={edit.bundleItems.includes(product.id)} disabled={!product.active&&!edit.bundleItems.includes(product.id)} onChange={(event) => changeBundle(product.id, event.target.checked)} />
                    <span>{product.title} {!product.active?'· снят с продажи':''}</span>
                  </label>
                )) : <p>Сначала создай обычные товары, потом собери из них комплект.</p>}
              </div>
            ) : (
              <div className="kc-market-upload">
                <div>
                  <b>Обложка / иконка</b>
                  <small>PNG, JPG или WebP. Лучше выбирать яркое изображение без лишних деталей.</small>
                </div>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Выбрать файл</button>
                <input ref={fileInputRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={upload} />
                {edit.imageUrl ? <img className="kc-market-preview" src={edit.imageUrl} alt="Предпросмотр товара" /> : <div className="kc-market-preview kc-market-preview--placeholder">{kindIcons[edit.kind]}<small>Загрузи изображение</small></div>}
              </div>
            )}

            <label className="kc-market-active">
              <input type="checkbox" checked={edit.active} onChange={(event) => update('active', event.target.checked)} />
              <span>Товар доступен в магазине</span>
            </label>

            <div className="kc-market-storefront"><b>Предпросмотр для игроков</b><div className="kc-market-storefront__card"><div>{edit.kind==='bundle'?<span>🎁</span>:edit.imageUrl?<img src={edit.imageUrl} alt=""/>:<span>{kindIcons[edit.kind]}</span>}</div><section><small>{kinds[edit.kind]}</small><strong>{edit.title||'Название товара'}</strong><p>{edit.description||'Здесь будет описание товара'}</p><em>{edit.salePrice!==''?`${edit.salePrice} CODI · акция`:`${edit.price||0} CODI`}</em></section></div><small>{edit.active?'● Товар будет виден в магазине после сохранения.':'○ Товар скрыт из продажи (владельцы сохранят его в инвентаре).'}</small></div>
            {error ? <p className="kc-market-error">{error}</p> : null}
            {done ? <p className="kc-market-success">{done}</p> : null}

            <button className="kc-market-save" type="submit" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить товар'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
