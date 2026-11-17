// Persistent platform configuration. Server only: never expose Supabase service key.
const validStatuses = new Set(['enabled', 'matchmaking_off', 'maintenance', 'disabled']);
const now = () => Date.now();
const maxDays = 90 * 86400000;

export function publicAnnouncement(row) {
  return { id: row.id, translations: row.translations, startsAt: Number(row.start_at),
    endsAt: Number(row.end_at) };
}

export async function translateAnnouncement(text) {
  const input = String(text || '').trim();
  if (!input || input.length > 500) throw new Error('INVALID_ANNOUNCEMENT');
  const libreUrl = process.env.LIBRETRANSLATE_URL?.trim();
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!libreUrl && !googleKey) throw new Error('TRANSLATION_NOT_CONFIGURED');
  const result = {};
  for (const target of ['uk', 'ru', 'en']) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      let response;
      if (libreUrl) {
        const url = new URL('/translate', libreUrl.endsWith('/') ? libreUrl : `${libreUrl}/`);
        if (url.protocol !== 'https:' && !(url.hostname === 'localhost' || url.hostname === '127.0.0.1')) throw new Error('TRANSLATION_NOT_CONFIGURED');
        response = await fetch(url, { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: input, source: 'auto', target, format: 'text', api_key: process.env.LIBRETRANSLATE_API_KEY || undefined }) });
      } else {
        response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(googleKey)}`, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: input, target, format: 'text' }),
        });
      }
      if (!response.ok) throw new Error('TRANSLATION_UNAVAILABLE');
      const body = await response.json();
      const raw = libreUrl ? body?.translatedText : body?.data?.translations?.[0]?.translatedText;
      if (typeof raw !== 'string' || !raw.trim()) throw new Error('TRANSLATION_UNAVAILABLE');
      // Google Translate's text output can HTML-escape punctuation.
      const decoded = raw.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|#39);/gi, (full, entity) => {
        const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
        if (known[entity.toLowerCase()]) return known[entity.toLowerCase()];
        if (entity[0] === '#') {
          const n = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
          return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : full;
        }
        return full;
      });
      result[target] = decoded.trim().slice(0, 2000);
    } catch (error) {
      if (error.message === 'TRANSLATION_NOT_CONFIGURED') throw error;
      throw new Error('TRANSLATION_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }
  return result;
}

export class PlatformControl {
  constructor(db, gameIds) {
    this.db = db;
    this.gameIds = new Set(gameIds);
    this.games = new Map();
    this.announcements = [];
    this.ready = false;
  }
  async refresh() {
    const [games, announcements] = await Promise.all([
      this.db.from('codumi_game_availability').select('game_id,status'),
      this.db.from('codumi_platform_announcements').select('id,original_text,translations,start_at,end_at,enabled,created_at').order('created_at', { ascending: false }).limit(250),
    ]);
    if (games.error || announcements.error) throw games.error || announcements.error;
    this.games = new Map((games.data || []).filter(row => this.gameIds.has(row.game_id) && validStatuses.has(row.status)).map(row => [row.game_id,row.status]));
    this.announcements = announcements.data || [];
    this.ready = true;
  }
  status(gameId) { return this.games.get(gameId) || 'enabled'; }
  canJoin(gameId) { return this.status(gameId) === 'enabled'; }
  publicState() {
    const current = now();
    return { updatedAt: current, games: Object.fromEntries(this.games), announcements: this.announcements
      .filter(row => row.enabled && Number(row.start_at) <= current && Number(row.end_at) > current)
      .map(publicAnnouncement) };
  }
  async setStatus(gameId, status) {
    if (!this.ready) throw new Error('PLATFORM_NOT_CONFIGURED');
    if (!this.gameIds.has(gameId)) throw new Error('GAME_NOT_FOUND');
    if (!validStatuses.has(status)) throw new Error('INVALID_GAME_STATUS');
    const { error } = await this.db.from('codumi_game_availability')
      .upsert({ game_id: gameId, status, updated_at: now() }, { onConflict: 'game_id' });
    if (error) throw error;
    this.games.set(gameId,status);
    return { gameId, status };
  }
  async createAnnouncement({ text, startAt, endAt }) {
    if (!this.ready) throw new Error('PLATFORM_NOT_CONFIGURED');
    const original = typeof text === 'string' ? text.trim() : '';
    if (!original || original.length > 500) throw new Error('INVALID_ANNOUNCEMENT');
    const start = Number(startAt), end = Number(endAt);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
       start < now() - 120000 || start > now() + maxDays || end <= start || end > start + maxDays)
      throw new Error('INVALID_SCHEDULE');
    // Publish only when ALL three translations succeed. No mixed-language fallback.
    const translations = await translateAnnouncement(original);
    const { data, error } = await this.db.from('codumi_platform_announcements')
      .insert({ original_text: original, translations, start_at: start, end_at: end, created_at: now(), enabled: true })
      .select('id,original_text,translations,start_at,end_at,enabled,created_at').single();
    if (error) throw error;
    this.announcements.unshift(data);
    return data;
  }
  async disableAnnouncement(id) {
    const { data, error } = await this.db.from('codumi_platform_announcements').update({ enabled: false })
      .eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ANNOUNCEMENT_NOT_FOUND');
    this.announcements = this.announcements.map(row => row.id === id ? { ...row, enabled: false } : row);
  }
  adminAnnouncements() { return this.announcements.slice(0,100).map(row => ({
    id: row.id, originalText: row.original_text, translations: row.translations,
    startAt: Number(row.start_at), endAt: Number(row.end_at),
    createdAt: Number(row.created_at), enabled: Boolean(row.enabled),
  })); }
}
