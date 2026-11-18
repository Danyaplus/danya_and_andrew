import { requireAdmin } from './adminAuth.js';
import { COSMETICS } from '../core/cosmetics.js';

const KINDS = ['site', 'background', 'emoji', 'frame', 'card', 'title'];
const DEFAULTS = [
  { id: 'builtin:color', section_type: 'color', title: 'Цвет игрового ника', subtitle: 'Настрой цвет своего имени. Логин @username не меняется.', icon: '🎨', kind: null },
  { id: 'builtin:site', section_type: 'legacy', title: 'Фон всего сайта', subtitle: 'Классические и живые анимированные заставки', icon: '🌐', kind: 'site' },
  { id: 'builtin:background', section_type: 'legacy', title: 'Шапка профиля', subtitle: 'Фон за аватаром и игровым именем', icon: '🌄', kind: 'background' },
  { id: 'builtin:emoji', section_type: 'legacy', title: 'Символ профиля', subtitle: 'Выбери украшение или отключи его совсем', icon: '✦', kind: 'emoji' },
  { id: 'builtin:frame', section_type: 'legacy', title: 'Рамки аватара', subtitle: 'Особенная рамка для твоего аватара', icon: '◉', kind: 'frame' },
  { id: 'builtin:card', section_type: 'legacy', title: 'Карточки игр', subtitle: 'Стиль оформления игр в каталоге', icon: '▤', kind: 'card' },
  { id: 'builtin:title', section_type: 'legacy', title: 'Титулы', subtitle: 'Покупай и устанавливай титулы в профиле', icon: '👑', kind: 'title' },
  { id: 'builtin:bundle', section_type: 'legacy', title: 'Наборы и комплекты', subtitle: 'Несколько предметов по выгодной цене', icon: '🎁', kind: 'bundle' },
];
const missing = error => ['42P01', 'PGRST205', '42703', '42883'].includes(error?.code);
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const uuid = /^[a-f0-9]{8}-[a-f0-9-]{27,45}$/i;
const imagePath = path => !path || /^products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(path);

function defaultSections(categories = []) {
  const defaults = DEFAULTS.map((section, index) => ({ ...section, category_id: null, item_ids: [], active: true, sort_order: index * 100 }));
  for (const category of categories) defaults.push({ id: `category:${category.id}`, section_type: 'category', category_id: category.id, kind: category.kind, title: category.name, subtitle: '', icon: category.icon || '✨', item_ids: [], active: true, sort_order: defaults.length * 100 });
  return defaults;
}

export async function readMarketLayout(db, categories = []) {
  const [saved, legacy] = await Promise.all([
    db.from('codumi_market_sections').select('*').order('sort_order', { ascending: true }).limit(100),
    db.from('codumi_market_legacy_overrides').select('*').limit(300),
  ]);
  if (saved.error && !missing(saved.error)) throw saved.error;
  if (legacy.error && !missing(legacy.error)) throw legacy.error;
  const defaults = defaultSections(categories);
  const byId = new Map(defaults.map(item => [item.id, item]));
  for (const row of saved.data || []) {
    if (byId.has(row.id)) byId.set(row.id, { ...byId.get(row.id), ...row });
    else if (row.section_type === 'promotion') byId.set(row.id, row);
  }
  return {
    configured: !saved.error && !legacy.error,
    sections: [...byId.values()].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    legacyItems: COSMETICS.map(item => {
      const override = (legacy.data || []).find(row => row.item_id === item.id);
      return { ...item, ...override, imageUrl: override?.image_path
        ? db.storage.from('codumi-shop-public').getPublicUrl(override.image_path).data.publicUrl : null };
    }),
  };
}

const sendError = (res, error) => {
  const reason = String(error?.message || '');
  if (reason.includes('INVALID_LAYOUT') || reason.includes('INVALID_LEGACY_ITEM')) return res.status(400).json({ ok: false, error: reason.includes('INVALID_LAYOUT') ? 'INVALID_LAYOUT' : 'INVALID_LEGACY_ITEM' });
  console.error('[market layout]', error?.message || error);
  return res.status(503).json({ ok: false, error: missing(error) ? 'MARKET_LAYOUT_MIGRATION_REQUIRED' : 'MARKET_UNAVAILABLE' });
};

export function registerMarketLayout(app, { db, controls, categories }) {
  app.get('/api/market/layout', async (_req, res) => {
    try { res.json({ ok: true, ...await readMarketLayout(db, await categories()) }); } catch (error) { sendError(res, error); }
  });
  app.get('/api/admin/market/layout', requireAdmin, async (_req, res) => {
    try { res.json({ ok: true, ...await readMarketLayout(db, await categories()) }); } catch (error) { sendError(res, error); }
  });
  app.put('/api/admin/market/layout', requireAdmin, async (req, res) => {
    const sections = req.body?.sections;
    if (!Array.isArray(sections) || sections.length > 60 || sections.length < 1) return res.status(400).json({ ok: false, error: 'INVALID_LAYOUT' });
    try {
      const categoryRows = await categories();
      const known = new Map(categoryRows.map(cat => [cat.id, cat]));
      const normalized = sections.map((raw, index) => {
        const type = String(raw?.section_type || '');
        const id = text(raw?.id, 90);
        const defaults = DEFAULTS.find(item => item.id === id);
        const catId = raw?.category_id || null;
        const cat = catId ? known.get(catId) : null;
        if (!['color', 'legacy', 'category', 'promotion'].includes(type)
          || (defaults && defaults.section_type !== type)
          || (type === 'color' && id !== 'builtin:color')
          || (type === 'legacy' && (!defaults || defaults.kind !== raw.kind))
          || (type === 'category' && (!cat || id !== `category:${cat.id}`))
          || (type === 'promotion' && !/^promo:[a-f0-9-]{36}$/i.test(id))) throw Error('INVALID_LAYOUT');
        const title = text(raw.title, 80);
        if (title.length < 2) throw Error('INVALID_LAYOUT');
        const itemIds = type === 'promotion' ? (Array.isArray(raw.item_ids) ? [...new Set(raw.item_ids)] : []) : [];
        if (itemIds.length > 16 || itemIds.some(x => !uuid.test(x))) throw Error('INVALID_LAYOUT');
        return { id, section_type: type, kind: type === 'legacy' ? defaults.kind : type === 'category' ? cat.kind : null,
          category_id: type === 'category' ? catId : null,
          title, subtitle: text(raw.subtitle, 220), icon: text(raw.icon, 12) || '✨',
          item_ids: itemIds, sort_order: index * 100, active: raw.active !== false };
      });
      if (new Set(normalized.map(x => x.id)).size !== normalized.length || DEFAULTS.some(d => !normalized.find(x => x.id === d.id))) throw Error('INVALID_LAYOUT');
      // Validate promotional items: promotions only link existing discounted and active products.
      const promoIds = [...new Set(normalized.filter(s => s.section_type === 'promotion').flatMap(s => s.item_ids))];
      if (promoIds.length) {
        const result = await db.from('codumi_market_products').select('id,sale_price,active').in('id', promoIds);
        if (result.error) throw result.error;
        if (promoIds.some(id => !result.data.some(p => p.id === id && p.sale_price !== null && p.active))) throw Error('INVALID_LAYOUT');
      }
      const { error } = await db.rpc('codumi_market_replace_sections', { p_sections: normalized });
      if (error) throw error;
      await controls?.log?.('market_layout_changed', { reason: 'Обновлена витрина магазина', detail: { sections: normalized.length } }).catch(() => {});
      res.json({ ok: true, sections: normalized });
    } catch (error) { sendError(res, error); }
  });
  app.put('/api/admin/market/legacy/:id', requireAdmin, async (req, res) => {
    const item = COSMETICS.find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: 'INVALID_LEGACY_ITEM' });
    const name = text(req.body?.name, 90);
    if (name.length < 2 || !imagePath(req.body?.imagePath)) return res.status(400).json({ ok: false, error: 'INVALID_LEGACY_ITEM' });
    const entry = { item_id: item.id, name, icon: text(req.body?.icon, 20) || item.icon || '✨',
      description: text(req.body?.description, 500), image_path: req.body?.imagePath || null, active: req.body?.active !== false };
    try {
      const result = await db.from('codumi_market_legacy_overrides').upsert(entry).select('*').single();
      if (result.error) throw result.error;
      await controls?.log?.('market_legacy_changed', { reason: name, detail: { id: item.id, active: entry.active } }).catch(() => {});
      res.json({ ok: true, item: result.data });
    } catch (error) { sendError(res, error); }
  });
}

// Hiding a builtin item removes it from sale; an already-owned item remains usable.
export async function legacyItemCanBuy(db, id) {
  const result = await db.from('codumi_market_legacy_overrides').select('active').eq('item_id', id).maybeSingle();
  if (result.error) { if (missing(result.error)) return true; throw result.error; }
  return result.data?.active !== false;
}
