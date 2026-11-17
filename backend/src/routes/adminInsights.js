import { requireAdmin } from './adminAuth.js';
import { computeSuspiciousPairs } from '../core/adminAntiFarm.js';

const MAX_MATCHES = 100;
const MAX_LEDGER = 100;
const MAX_TELEMETRY = 4000;

function fail(res, error) {
  console.error('[admin-insights]', error?.code || error?.message || error);
  res.status(503).json({ ok: false, error: 'ADMIN_INSIGHTS_UNAVAILABLE' });
}

function pageParam(value, max, fallback = 0) {
  const v = Number(value);
  return Number.isInteger(v) && v >= 0 ? Math.min(v, max) : fallback;
}

async function recentEvents(db, limit) {
  const rows = [];
  for (let offset = 0; offset < limit; offset += 500) {
    const response = await db.from('codumi_admin_match_telemetry')
      .select('room_id,game_id,user_a,user_b,winner_id,elapsed_ms,settled,finished_at')
      .order('finished_at', { ascending: false }).range(offset, Math.min(offset + 499, limit - 1));
    if (response.error) throw response.error;
    rows.push(...(response.data || []));
    if (!response.data || response.data.length < 500) break;
  }
  return rows;
}

export function registerAdminInsights(app, { authStore, matchmaker, gameRegistry }) {
  const db = authStore.supabase;
  app.get('/api/admin/live-matches', requireAdmin, (req, res) => {
    const offset = pageParam(req.query.offset, 1_000_000);
    const limit = Math.max(1, pageParam(req.query.limit, MAX_MATCHES, MAX_MATCHES));
    const data = matchmaker.listAdminMatches({ offset, limit });
    const matches = data.matches.map(match => ({
      ...match, gameName: gameRegistry.get(match.gameId)?.title || match.gameId,
    }));
    res.json({ ok: true, offset, limit, total: data.total, matches, refreshedAt: Date.now() });
  });

  app.get('/api/admin/players/:id/coin-history', requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (!authStore.getUserRecord(id)) return res.status(404).json({ ok: false, error: 'PLAYER_NOT_FOUND' });
    const offset = pageParam(req.query.offset, 1_000_000);
    const limit = Math.max(1, pageParam(req.query.limit, MAX_LEDGER, 30));
    try {
      const response = await db.from('codumi_admin_coin_ledger')
        .select('id,delta,balance_after,source,reason,created_at', { count: 'exact' })
        .eq('user_id', id).order('created_at', { ascending: false })
        .order('id', { ascending: false }).range(offset, offset + limit - 1);
      if (response.error) throw response.error;
      res.json({ ok: true, offset, total: response.count ?? 0, entries: response.data || [],
        note: 'История автоматически собирается после установки SQL. Старые операции не восстановлены.' });
    } catch (error) { fail(res, error); }
  });

  app.post('/api/admin/suspicious-players/approve',requireAdmin,async(req,res)=>{
    const userId=String(req.body?.userId||'');
    const lastAt=Number(req.body?.lastAt);
    if(!/^[a-f0-9]{8}-[a-f0-9-]{27,45}$/i.test(userId)||!authStore.getUserRecord(userId)
       ||!Number.isSafeInteger(lastAt)||lastAt<=0)
      return res.status(400).json({ok:false,error:'INVALID_REVIEW'});
    try {
      const events=await recentEvents(db,MAX_TELEMETRY);
      const since=Date.now()-7*86400000;
      const current=computeSuspiciousPairs(events.filter(e=>Number(e.finished_at)>=since),{since});
      const matching=current.filter(a=>a.userIds.includes(userId)&&a.lastAt===lastAt);
      if(!matching.length)return res.status(409).json({ok:false,error:'REVIEW_OUTDATED'});
      const result=await db.from('codumi_admin_audit').insert({
        action:'anti_farm_approved',user_id:userId,reason:'Проверено администратором: нарушений не обнаружено',
        detail:{reviewedThrough:lastAt},actor:(process.env.ADMIN_USERNAME||'admin').trim(),created_at:Date.now(),
      });
      if(result.error)throw result.error;
      res.json({ok:true,userId,lastAt});
    }catch(error){fail(res,error);}
  });
  app.get('/api/admin/suspicious-players', requireAdmin, async (req, res) => {
    try {
      const events = await recentEvents(db, MAX_TELEMETRY);
      const since = Date.now() - 7 * 86400000;
      const recent = events.filter(event => Number(event.finished_at) >= since);
      const reviewed=await db.from('codumi_admin_audit').select('user_id,detail').eq('action','anti_farm_approved')
        .order('created_at',{ascending:false}).limit(2000);
      if(reviewed.error)throw reviewed.error;
      const lastApproved=new Map();
      for(const item of reviewed.data||[])lastApproved.set(item.user_id,Math.max(lastApproved.get(item.user_id)||0,Number(item.detail?.reviewedThrough)||0));
      const alerts = computeSuspiciousPairs(recent, { since }).map(alert => ({
        ...alert,
        players: alert.userIds.map(id => {
          const player = authStore.getUserRecord(id);
          return { id, displayName: player?.displayName || player?.username || 'Удалённый аккаунт', username: player?.username || null, approved: (lastApproved.get(id)||0)>=alert.lastAt };
        }),
        gameName: gameRegistry.get(alert.gameId)?.title || alert.gameId,
      })).filter(alert=>alert.players.some(player=>!player.approved));
      res.json({ ok: true, alerts: alerts.slice(0, 100), analyzedMatches: recent.length,
        sampleLimited: events.length >= MAX_TELEMETRY, windowDays: 7,
        rule: '≥6 подтверждённых матчей одной пары в одной игре за 7 дней, при ≥80% побед одного игрока либо ≥4 коротких матча; проверка вручную.',
      });
    } catch (error) { fail(res, error); }
  });
}
