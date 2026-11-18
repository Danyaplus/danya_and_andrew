import { requireAdmin } from './adminAuth.js';
const safeText=(value)=>String(value||'').slice(0,260).replace(/([Bb]earer\s+)\S+/g,'$1[hidden]');
export function createDiagnostics(db) {
  let lastError=''; let lastAt=0;
  function record(kind,{userId=null,gameId=null,roomId=null,detail='',severity='warning'}={}) {
    const now=Date.now();const signature=`${kind}|${userId}|${gameId}|${roomId}|${detail}`;
    // Drop bursts of identical signals, don't write user messages or credentials.
    if(signature===lastError && now-lastAt<20000)return;
    lastError=signature;lastAt=now;
    void db.from('codumi_server_events').insert({kind,severity,user_id:userId||null,
      game_id:gameId||null,room_id:roomId||null,details:safeText(detail)})
      .then(({error})=>{if(error && !['42P01','PGRST205'].includes(error.code))console.warn('[diagnostics]',error.message);})
      .catch(e=>console.warn('[diagnostics]',e?.message));
  }
  return {record};
}
export function registerAdminDiagnostics(app,db,authStore) {
  app.delete('/api/admin/diagnostics',requireAdmin,async(req,res)=>{
    if(req.body?.confirmation!=='CLEAR_DIAGNOSTICS')return res.status(400).json({ok:false,error:'CONFIRMATION_REQUIRED'});
    const {error}=await db.from('codumi_server_events').delete().gte('created_at','1970-01-01T00:00:00.000Z');
    if(error)return res.status(503).json({ok:false,error:'DIAGNOSTICS_UNAVAILABLE'});
    res.json({ok:true});
  });
  // Administrative triage; a label never changes or hides the original server event.
  app.patch('/api/admin/diagnostics/:id', requireAdmin, async (req, res) => {
    const id = String(req.params.id || '');
    const state = String(req.body?.state || '');
    if (!/^(?:[a-f0-9-]{36}|[1-9][0-9]{0,18})$/i.test(id) || !['open','ignored','resolved','escalated'].includes(state))
      return res.status(400).json({ ok: false, error: 'INVALID_EVENT_REVIEW' });
    try {
      const result = await db.from('codumi_server_events').update({ review_state: state }).eq('id', id).select('id').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return res.status(404).json({ ok: false, error: 'EVENT_NOT_FOUND' });
      res.json({ ok: true, state });
    } catch (error) {
      console.error('[diagnostics triage]', error?.message || error);
      res.status(503).json({ ok: false, error: 'DIAGNOSTICS_MIGRATION_REQUIRED' });
    }
  });
  app.get('/api/admin/diagnostics', requireAdmin, async (req, res) => {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.min(5000, Math.max(0, Number(req.query.offset) || 0));
    const severity = String(req.query.severity || 'all');
    const search = String(req.query.q || '').trim().slice(0, 80).replace(/[%_,().]/g, ' ');
    const threshold = new Date(Date.now() - hours * 3600000).toISOString();
    const base = () => db.from('codumi_server_events');
    let query = base().select('*', { count: 'exact' }).gte('created_at', threshold);
    if (['error', 'warning', 'info'].includes(severity)) query = query.eq('severity', severity);
    if (search) query = query.or(`details.ilike.%${search}%,game_id.ilike.%${search}%,room_id.ilike.%${search}%`);
    try {
      const [results, totals] = await Promise.all([
        query.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
        Promise.all([...['disconnect', 'http_error', 'match_error', 'system'].map(kind =>
          base().select('id', { head: true, count: 'exact' }).gte('created_at', threshold).eq('kind', kind)),
          base().select('id', { head: true, count: 'exact' }).gte('created_at', threshold)]),
      ]);
      if (results.error || totals.some(result => result.error)) throw results.error || totals.find(result => result.error).error;
      const events = (results.data || []).map(row => ({ ...row, user: row.user_id ? authStore.getPublicUser(row.user_id) : null }));
      res.json({ ok: true, total: results.count || 0, events, hours, counts: Object.fromEntries([...['disconnect', 'http_error', 'match_error', 'system'].map((key, i) => [key, totals[i].count || 0]), ['total', totals[4].count || 0]]) });
    } catch (error) {
      console.error('[diagnostics]', error?.message || error);
      res.status(503).json({ ok: false, error: 'DIAGNOSTICS_UNAVAILABLE' });
    }
  });
}
