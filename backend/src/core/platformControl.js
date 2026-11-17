// Persistent platform configuration. Server only: never expose Supabase service key.
const validStatuses = new Set(['enabled', 'matchmaking_off', 'maintenance', 'disabled']);
const now = () => Date.now();
const maxDays = 90 * 86400000;

export function publicAnnouncement(row) {
  return { id: row.id, text: row.original_text, startsAt: Number(row.start_at),
    endsAt: Number(row.end_at) };
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
  async createAnnouncement({ text }) {
    if (!this.ready) throw new Error('PLATFORM_NOT_CONFIGURED');
    const original = typeof text === 'string' ? text.trim() : '';
    if (!original || original.length > 500) throw new Error('INVALID_ANNOUNCEMENT');
    // Notifications are live, one-shot and last exactly 10 seconds.
    // The original message is stored unchanged, without any translator API.
    const start = now();
    const end = start + 10000;
    // Keep translations in existing SQL schema for backward compatibility.
    const translations = { uk: original, ru: original, en: original };
    const { data, error } = await this.db.from('codumi_platform_announcements')
      .insert({ original_text: original, translations, start_at: start, end_at: end, created_at: start, enabled: true })
      .select('id,original_text,translations,start_at,end_at,enabled,created_at').single();
    if (error) throw error;
    this.announcements.unshift(data);
    this.announcements = this.announcements.slice(0, 250);
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
