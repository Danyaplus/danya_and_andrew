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
  app.get('/api/admin/diagnostics',requireAdmin,async(req,res)=>{
    const hours=Math.min(168,Math.max(1,Number(req.query.hours)||24));
    const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
    const offset=Math.min(5000,Math.max(0,Number(req.query.offset)||0));
    const {data,error,count}=await db.from('codumi_server_events').select('*',{count:'exact'})
      .gte('created_at',new Date(Date.now()-hours*3600000).toISOString())
      .order('created_at',{ascending:false}).range(offset,offset+limit-1);
    if(error)return res.status(503).json({ok:false,error:'DIAGNOSTICS_UNAVAILABLE'});
    const rows=(data||[]).map(row=>({...row,user:row.user_id ? authStore.getPublicUser(row.user_id):null}));
    res.json({ok:true,total:count||0,events:rows,hours});
  });
}
