import { randomUUID } from 'node:crypto';
import { requireAdmin } from './adminAuth.js';
import { readMarketLayout, registerMarketLayout } from './marketLayout.js';

const ID = /^[a-f0-9]{8}-[a-f0-9-]{27,45}$/i;
const KINDS = new Set(['site', 'background', 'emoji', 'frame', 'title', 'card', 'bundle']);
const MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const missingTable = e => ['42P01', 'PGRST205', '42703'].includes(e?.code);
const cleanText = (s, max) => String(s || '').trim().slice(0, max);
const fail = (res, error) => {
  const message = String(error?.message || '');
  const known = ['PRODUCT_NOT_AVAILABLE', 'ALREADY_OWNED', 'INSUFFICIENT_COINS', 'NOT_OWNED', 'INVALID_PRODUCT', 'INVALID_IMAGE', 'INVALID_CATEGORY', 'CATEGORY_IN_USE', 'PRODUCT_IN_USE'];
  const found = known.find(code => message.includes(code));
  if (found) return res.status(409).json({ ok: false, error: found });
  console.error('[market]', error?.message || error);
  return res.status(503).json({ ok: false, error: missingTable(error) ? 'MARKET_MIGRATION_REQUIRED' : 'MARKET_UNAVAILABLE' });
};
const safeProduct = (row, storage) => ({ ...row, imageUrl: row.image_path ? storage.getPublicUrl(row.image_path).data.publicUrl : null });

export function registerMarketplace(app, { authStore, requireUser, emitToUser, controls }) {
  const db = authStore.supabase;
  const storage = db.storage.from('codumi-shop-public');
  async function catalog(all = false) {
    let query = db.from('codumi_market_products').select('*').order('created_at', { ascending: false });
    if (!all) query = query.eq('active', true);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return (data || []).map(item => safeProduct(item, storage));
  }
  async function categories() {
    const result = await db.from('codumi_market_categories').select('id,name,kind,icon,created_at').order('created_at');
    if (result.error) {
      if (missingTable(result.error)) return { categories: [], configured: false };
      throw result.error;
    }
    return { categories: result.data || [], configured: true };
  }
  registerMarketLayout(app, { db, controls, categories: async () => (await categories()).categories });
  async function myItems(userId) {
    const [owned, equipped] = await Promise.all([
      db.from('codumi_market_owned').select('product_id,purchased_at').eq('user_id', userId),
      db.from('codumi_market_equipped').select('kind,product_id').eq('user_id', userId),
    ]);
    if (owned.error || equipped.error) throw owned.error || equipped.error;
    return { owned: (owned.data || []).map(item => item.product_id), equipped: Object.fromEntries((equipped.data || []).map(item => [item.kind, item.product_id])) };
  }
  app.get('/api/market/catalog', async (_req, res) => {
    try { res.json({ ok: true, products: await catalog(), ...await categories(), ...await readMarketLayout(db, (await categories()).categories) }); } catch (error) { fail(res, error); }
  });
  app.get('/api/market/me', async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    try {
      const state = await myItems(user.id);
      const products = await catalog(true);
      res.json({ ok: true, ...state, products: products.filter(item => item.active || state.owned.includes(item.id)), ...await categories() });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/market/buy', async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    if (!ID.test(req.body?.productId || '')) return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
    try {
      const { data, error } = await db.rpc('codumi_market_buy', { p_user: user.id, p_product: req.body.productId });
      if (error) throw error;
      emitToUser(user.id, 'wallet:updated', { coins: Number(data.coins) });
      res.json({ ok: true, ...await myItems(user.id), coins: Number(data.coins) });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/market/unequip', async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    const kind = req.body?.kind;
    if (!KINDS.has(kind) || kind === 'bundle') return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
    const { error } = await db.from('codumi_market_equipped').delete().eq('user_id', user.id).eq('kind', kind);
    if (error) return fail(res, error);
    res.json({ ok: true });
  });
  app.post('/api/market/equip', async (req, res) => {
    const user = requireUser(req, res); if (!user) return;
    if (!ID.test(req.body?.productId || '')) return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
    try {
      const { error } = await db.rpc('codumi_market_equip', { p_user: user.id, p_product: req.body.productId });
      if (error) throw error;
      res.json({ ok: true, ...await myItems(user.id) });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/admin/market/products', requireAdmin, async (_req, res) => {
    try { res.json({ ok: true, products: await catalog(true), ...await categories() }); } catch (error) { fail(res, error); }
  });
  app.post('/api/admin/market/categories', requireAdmin, async (req, res) => {
    const { id, kind } = req.body || {};
    const name = cleanText(req.body?.name, 46);
    const icon = cleanText(req.body?.icon, 12) || '✨';
    if (!name || name.length < 2 || !KINDS.has(kind) || (id && !ID.test(id)))
      return res.status(400).json({ ok: false, error: 'INVALID_CATEGORY' });
    try {
      if (id) {
        const current = await db.from('codumi_market_categories').select('kind').eq('id', id).single();
        if (current.error) throw current.error;
        if (current.data.kind !== kind) {
          const used = await db.from('codumi_market_products').select('id', { count: 'exact', head: true }).eq('category_id', id);
          if (used.error) throw used.error;
          if (used.count) throw Error('CATEGORY_IN_USE');
        }
      }
      const row = { name, kind, icon };
      const query = id ? db.from('codumi_market_categories').update(row).eq('id', id) : db.from('codumi_market_categories').insert(row);
      const { data, error } = await query.select('id,name,kind,icon').single();
      if (error) throw error;
      await controls.log('market_category_changed', { reason: name, detail: { id: data.id } }).catch(() => {});
      res.json({ ok: true, category: data });
    } catch (error) { fail(res, error); }
  });
  app.delete('/api/admin/market/categories/:id', requireAdmin, async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ ok: false, error: 'INVALID_CATEGORY' });
    try {
      const used = await db.from('codumi_market_products').select('id', { count: 'exact', head: true }).eq('category_id', req.params.id);
      if (used.error) throw used.error;
      if (used.count) throw Error('CATEGORY_IN_USE');
      const { error } = await db.from('codumi_market_categories').delete().eq('id', req.params.id);
      if (error) throw error;
      await controls.log('market_category_deleted', { reason: req.params.id }).catch(() => {});
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/admin/market/upload', requireAdmin, async (req, res) => {
    const { mime, data } = req.body || {};
    if (!MIME[mime] || typeof data !== 'string' || data.length > 1_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
      return res.status(400).json({ ok: false, error: 'INVALID_IMAGE' });
    const buffer = Buffer.from(data, 'base64');
    const realMime = mime === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : mime === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216
        : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!buffer.length || buffer.length > 1_000_000 || !realMime)
      return res.status(400).json({ ok: false, error: 'INVALID_IMAGE' });
    try {
      const path = `products/${randomUUID()}.${MIME[mime]}`;
      const uploaded = await storage.upload(path, buffer, { contentType: mime, upsert: false });
      if (uploaded.error) throw uploaded.error;
      res.json({ ok: true, imagePath: path, imageUrl: storage.getPublicUrl(path).data.publicUrl });
    } catch (error) { fail(res, error); }
  });
  app.post('/api/admin/market/products', requireAdmin, async (req, res) => {
    const d = req.body || {};
    const bundle = d.kind === 'bundle';
    const members = Array.isArray(d.bundleItems) ? [...new Set(d.bundleItems)] : [];
    const title = cleanText(d.title, 90);
    const price = Number(d.price);
    const sale = d.salePrice === null || d.salePrice === '' || d.salePrice === undefined ? null : Number(d.salePrice);
    if (!KINDS.has(d.kind) || title.length < 2 || title.length > 90
      || !Number.isSafeInteger(price) || price < 0 || price > 1e6
      || (sale !== null && (!Number.isSafeInteger(sale) || sale < 0 || sale >= price))
      || (bundle && (members.length < 2 || members.length > 10 || members.some(id => !ID.test(id))))
      || (!bundle && members.length)
      || (d.id && !ID.test(d.id))
      || (d.categoryId && !ID.test(d.categoryId))
      || (d.imagePath && (typeof d.imagePath !== 'string' || !/^products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(d.imagePath))))
      return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
    try {
      // A product's kind determines equip/ownership semantics and must remain stable.
      if (d.id) {
        const current = await db.from('codumi_market_products').select('kind').eq('id', d.id).single();
        if (current.error) throw current.error;
        if (current.data.kind !== d.kind) throw Error('INVALID_PRODUCT');
      }
      if (members.length) {
        const { data, error } = await db.from('codumi_market_products').select('id,kind,active').in('id', members);
        if (error) throw error;
        if (data?.length !== members.length || data.some(item => !item.active || item.kind === 'bundle')) throw Error('INVALID_PRODUCT');
      }
      if (d.categoryId) {
        const { data, error } = await db.from('codumi_market_categories').select('kind').eq('id', d.categoryId).single();
        if (error) throw error;
        if (data.kind !== d.kind) throw Error('INVALID_CATEGORY');
      }
      const row = {
        art_mode: ['image','emoji','text'].includes(d.artMode) ? d.artMode : 'emoji',
        art_symbol: cleanText(d.artSymbol, 32),
        title, description: cleanText(d.description, 500), kind: d.kind, price, sale_price: sale,
        image_path: d.imagePath || null, active: d.active !== false,
        bundle_items: bundle ? members : [], category_id: d.categoryId || null,
      };
      const query = d.id ? db.from('codumi_market_products').update({ ...row, updated_at: new Date().toISOString() }).eq('id', d.id)
        : db.from('codumi_market_products').insert(row);
      const { data, error } = await query.select('id').single();
      if (error) throw error;
      await controls.log('market_product_changed', { reason: row.title, detail: { id: data.id, kind: row.kind, price: row.price, sale: row.sale_price } }).catch(() => {});
      res.json({ ok: true, id: data.id });
    } catch (error) { fail(res, error); }
  });
  app.patch('/api/admin/market/products/:id', requireAdmin, async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
    const change = {};
    if (typeof req.body?.active === 'boolean') change.active = req.body.active;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'salePrice')) {
      const value = req.body.salePrice;
      if (value !== null && value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0))
        return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
      change.sale_price = value === null || value === '' ? null : Number(value);
    }
    if (!Object.keys(change).length) return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
    try {
      const current = await db.from('codumi_market_products').select('price,title').eq('id', req.params.id).single();
      if (current.error) throw current.error;
      if (change.sale_price !== undefined && change.sale_price !== null && change.sale_price >= current.data.price) throw Error('INVALID_PRODUCT');
      const { error } = await db.from('codumi_market_products').update({ ...change, updated_at: new Date().toISOString() }).eq('id', req.params.id);
      if (error) throw error;
      await controls.log('market_product_changed', { reason: current.data.title, detail: { id: req.params.id, ...change } }).catch(() => {});
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  });
  app.delete('/api/admin/market/products/:id', requireAdmin, async (req, res) => {
    if (!ID.test(req.params.id)) return res.status(400).json({ ok: false, error: 'INVALID_PRODUCT' });
    try {
      const [owned, equipped, products] = await Promise.all([
        db.from('codumi_market_owned').select('product_id', { count: 'exact', head: true }).eq('product_id', req.params.id),
        db.from('codumi_market_equipped').select('product_id', { count: 'exact', head: true }).eq('product_id', req.params.id),
        db.from('codumi_market_products').select('id,bundle_items'),
      ]);
      if (owned.error || equipped.error || products.error) throw owned.error || equipped.error || products.error;
      if (owned.count || equipped.count || products.data.some(item => (item.bundle_items || []).includes(req.params.id))) throw Error('PRODUCT_IN_USE');
      const { error } = await db.from('codumi_market_products').delete().eq('id', req.params.id);
      if (error) throw error;
      await controls.log('market_product_deleted', { reason: req.params.id }).catch(() => {});
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  });
}
