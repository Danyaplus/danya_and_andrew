import { requireAdmin } from './adminAuth.js';
const validUuid = /^[0-9a-f]{8}-[0-9a-f-]{27,45}$/i;
const adminName = (process.env.ADMIN_USERNAME || 'admin').trim();
function errorResponse(res, error) {
  const code = error?.message || 'ADMIN_PLATFORM_FAILED';
  if (['INVALID_GAME_STATUS','INVALID_ANNOUNCEMENT','INVALID_SCHEDULE','GAME_NOT_FOUND','ANNOUNCEMENT_NOT_FOUND','PLATFORM_NOT_CONFIGURED'].includes(code)) {
    return res.status(['PLATFORM_NOT_CONFIGURED'].includes(code) ? 503 : 400).json({ ok:false,error:code });
  }
  console.error('[platform-admin]', error?.code || error?.message || error);
  return res.status(503).json({ ok:false,error:'ADMIN_PLATFORM_FAILED' });
}
export function registerAdminPlatform(app, { platform, controls, gameRegistry, matchmaker, io }) {
  const db = controls.db;
  const audit = async (action, detail) => {
    try { await controls.log(action, detail); } catch (error) { console.error('[admin-audit]', error?.message); }
  };
  const changed = () => io.emit('platform:changed', { at: Date.now() });
  app.get('/api/platform/state', (_req,res) => {
    res.set('Cache-Control','no-store');
    res.json({ ok:true,...platform.publicState() });
  });
  app.get('/api/admin/platform/games', requireAdmin, (_req,res) => res.json({ ok:true,ready:platform.ready,
    games:[...gameRegistry.values()].map(g => ({ id:g.id,title:g.title,status:platform.status(g.id) })) }));
  app.patch('/api/admin/platform/games/:id', requireAdmin, async (req,res) => {
    try {
      const { gameId, status } = await platform.setStatus(req.params.id, req.body?.status);
      if (status !== 'enabled') matchmaker.stopGameQueue(gameId);
      await audit('game_status_changed', { reason: `Статус игры: ${status}`, detail:{ gameId,status } });
      changed(); res.json({ok:true,gameId,status});
    } catch(error) {errorResponse(res,error);}
  });
  app.get('/api/admin/platform/announcements', requireAdmin, (_req,res) =>
    res.json({ok:true,ready:platform.ready,announcements:platform.adminAnnouncements()}));
  app.post('/api/admin/platform/announcements', requireAdmin, async (req,res) => {
    try {
      const item = await platform.createAnnouncement({text:req.body?.text});
      await audit('announcement_published', {reason:item.original_text,detail:{id:item.id,startAt:Number(item.start_at),endAt:Number(item.end_at)}});
      io.emit('platform:announcement', { id:item.id, text:item.original_text, startsAt:Number(item.start_at), endsAt:Number(item.end_at) });
      changed(); res.status(201).json({ok:true,announcement:item});
    } catch(error) {errorResponse(res,error);}
  });
  app.post('/api/admin/platform/announcements/:id/disable', requireAdmin, async(req,res) => {
    if(!validUuid.test(req.params.id)) return res.status(400).json({ok:false,error:'ANNOUNCEMENT_NOT_FOUND'});
    try {
      await platform.disableAnnouncement(req.params.id);
      await audit('announcement_disabled',{detail:{id:req.params.id}});
      changed();res.json({ok:true});
    } catch(error){errorResponse(res,error);}
  });
  app.delete('/api/admin/platform/audit',requireAdmin,async(req,res)=>{
    if(req.body?.confirmation!=='CLEAR_AUDIT')return res.status(400).json({ok:false,error:'CONFIRMATION_REQUIRED'});
    try {
      // Reviews must survive clearing the visible history; otherwise approved accounts
      // would immediately become suspicious again without any new match.
      const {error}=await db.from('codumi_admin_audit').delete().neq('action','anti_farm_approved');
      if(error)throw error;
      res.json({ok:true});
    }catch(error){errorResponse(res,error);}
  });
  app.delete('/api/admin/platform/announcements/:id',requireAdmin,async(req,res)=>{
    if(!validUuid.test(req.params.id))return res.status(400).json({ok:false,error:'ANNOUNCEMENT_NOT_FOUND'});
    try {await platform.deleteAnnouncement(req.params.id);changed();res.json({ok:true});}
    catch(error){errorResponse(res,error);}
  });
  app.delete('/api/admin/platform/announcements',requireAdmin,async(req,res)=>{
    if(req.body?.confirmation!=='CLEAR_ANNOUNCEMENTS')return res.status(400).json({ok:false,error:'CONFIRMATION_REQUIRED'});
    try {await platform.clearAnnouncements();changed();res.json({ok:true});}
    catch(error){errorResponse(res,error);}
  });
  app.get('/api/admin/platform/audit',requireAdmin,async(req,res)=>{
    try {
      const offset=Math.max(0,Math.min(100000,Number.parseInt(req.query.offset,10)||0));
      const limit= Math.max(1,Math.min(100,Number.parseInt(req.query.limit,10)||50));
      const { data,error,count }=await db.from('codumi_admin_audit')
        .select('id,action,user_id,ip,amount,reason,detail,created_at,actor',{count:'exact'})
        .neq('action','anti_farm_approved')
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+limit-1);
      if(error)throw error;
      res.json({ok:true,entries:data||[],total:count||0,offset});
    } catch(error){errorResponse(res,error);}
  });
  app.get('/api/admin/platform/audit/:id',requireAdmin,(_req,res)=>res.status(404).json({ok:false,error:'NOT_FOUND'}));
}
