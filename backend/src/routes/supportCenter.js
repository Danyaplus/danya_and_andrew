import { randomUUID } from 'node:crypto';
import { requireAdmin } from './adminAuth.js';

const allowedCategories = new Set(['player_report','bug','feedback','suggestion','other']);
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9-]{27,45}$/i;
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 1_000_000;
const MAX_IMAGES = 3;

function validImage(buffer, mime) {
  return mime === 'image/png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8
      : mime === 'image/webp' ? buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP' : false;
}
function fail(res, e) {
  const msg = String(e?.message || 'SUPPORT_UNAVAILABLE');
  const known = ['SUPPORT_DAILY_LIMIT','INVALID_SUPPORT_TICKET','TARGET_NOT_FOUND','INVALID_IMAGE','IMAGE_TOO_LARGE','AUTH_REQUIRED'];
  if (known.some(code => msg.includes(code))) return res.status(msg.includes('SUPPORT_DAILY_LIMIT') ? 429 : 400).json({ok:false,error:known.find(code=>msg.includes(code))});
  console.error('[support]', e?.message || e);
  return res.status(503).json({ok:false,error:'SUPPORT_UNAVAILABLE'});
}
function userSummary(authStore, id) {
  const user = id ? authStore.getUserRecord(id) : null;
  return user ? {id:user.id,displayName:user.displayName||user.username,username:user.username,avatar:user.avatar||null} : null;
}
function decodeImages(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_IMAGES) throw Error('INVALID_IMAGE');
  return raw.map(entry=>{
    if (!entry || !IMAGE_TYPES[entry.mime] || typeof entry.data !== 'string'
      || entry.data.length > 1_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.data)) throw Error('INVALID_IMAGE');
    const buffer=Buffer.from(entry.data,'base64');
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw Error('IMAGE_TOO_LARGE');
    if (!validImage(buffer,entry.mime)) throw Error('INVALID_IMAGE');
    return {buffer,mime:entry.mime,ext:IMAGE_TYPES[entry.mime]};
  });
}

export function registerSupportCenter(app, {authStore, requireUser, controls}) {
  const db=authStore.supabase;
  const storage=db.storage.from('codumi-support');
  app.get('/api/support/players', (req,res)=>{
    const tokenUser=requireUser(req,res);if(!tokenUser)return;
    const term=String(req.query.q||'').trim().toLocaleLowerCase();
    if (term.length<2 || term.length>40) return res.json({ok:true,players:[]});
    const users=authStore.data.users.filter(u=>u.id!==tokenUser.id &&
      (u.username?.toLocaleLowerCase().includes(term)||u.displayName?.toLocaleLowerCase().includes(term)))
      .slice(0,8).map(u=>({id:u.id,username:u.username,displayName:u.displayName||u.username,avatar:u.avatar||null}));
    res.json({ok:true,players:users});
  });
  app.get('/api/support/mine',async(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    const {data,error}=await db.from('codumi_support_tickets').select('id,title,category,status,created_at')
      .eq('author_id',user.id).order('created_at',{ascending:false}).limit(10);
    if(error)return fail(res,error);
    res.json({ok:true,tickets:data||[]});
  });
  app.post('/api/support/tickets',async(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    const {category,title,body,gameId,targetUserId,images:rawImages=[]}=req.body||{};
    if(!allowedCategories.has(category)||typeof title!=='string'||typeof body!=='string'
      ||title.trim().length<5||title.trim().length>120||body.trim().length<15||body.trim().length>4000
      ||(category==='player_report' && (!targetUserId||!uuidPattern.test(targetUserId)||targetUserId===user.id)))
      return res.status(400).json({ok:false,error:'INVALID_SUPPORT_TICKET'});
    let images;
    try { images=decodeImages(rawImages); } catch(e) { return fail(res,e); }
    try {
      const {data:id,error}=await db.rpc('codumi_support_submit',{
        p_author:user.id,p_category:category,p_target:category==='player_report'?targetUserId:null,
        p_game:gameId||null,p_title:title.trim(),p_body:body.trim(),
      });
      if(error)throw error;
      const paths=[];
      try {
        for(let i=0;i<images.length;i++) {
          const img=images[i];const objectPath=`${user.id}/${id}/${randomUUID()}.${img.ext}`;
          const uploaded=await storage.upload(objectPath,img.buffer,{contentType:img.mime,upsert:false});
          if(uploaded.error)throw uploaded.error;
          paths.push({path:objectPath,mime:img.mime});
        }
        if(paths.length){
          const updated=await db.from('codumi_support_tickets').update({images:paths}).eq('id',id).eq('author_id',user.id);
          if(updated.error)throw updated.error;
        }
      } catch(error) {
        if(paths.length)await storage.remove(paths.map(p=>p.path)).catch(()=>{});
        await db.from('codumi_support_tickets').delete().eq('id',id).eq('author_id',user.id);
        throw error;
      }
      res.status(201).json({ok:true,id});
    } catch(error) {fail(res,error);}
  });
  app.get('/api/admin/support/stats',requireAdmin,async(_req,res)=>{
    const statusList=['new','reviewing','resolved','rejected'];
    const results=await Promise.all([
      db.from('codumi_support_tickets').select('id',{head:true,count:'exact'}),
      ...statusList.map(status=>db.from('codumi_support_tickets').select('id',{head:true,count:'exact'}).eq('status',status)),
    ]);
    if(results.some(result=>result.error))return fail(res,results.find(result=>result.error).error);
    res.json({ok:true,total:results[0].count||0,counts:Object.fromEntries(statusList.map((key,i)=>[key,results[i+1].count||0]))});
  });
  app.delete('/api/admin/support/tickets',requireAdmin,async(req,res)=>{
    if(req.body?.confirmation!=='CLEAR_SUPPORT')return res.status(400).json({ok:false,error:'CONFIRMATION_REQUIRED'});
    try {
      let deleted=0;
      for(let page=0;page<1000;page++){
        const {data,error}=await db.from('codumi_support_tickets').select('id,images').order('created_at',{ascending:true}).limit(200);
        if(error)throw error;
        if(!data?.length)break;
        const result=await db.from('codumi_support_tickets').delete().in('id',data.map(x=>x.id));
        if(result.error)throw result.error;
        deleted+=data.length;
        const paths=data.flatMap(x=>(Array.isArray(x.images)?x.images:[]).map(img=>img.path).filter(Boolean));
        for(let i=0;i<paths.length;i+=100){
          const removed=await storage.remove(paths.slice(i,i+100));
          if(removed.error)console.warn('[support] Attachment cleanup:',removed.error.message);
        }
      }
      res.json({ok:true,deleted});
    } catch(error){fail(res,error);}
  });
  app.get('/api/admin/support/tickets',requireAdmin,async(req,res)=>{
    const status=String(req.query.status||'all');
    const category=String(req.query.category||'all');
    const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
    const search=String(req.query.q||'').trim().slice(0,80).replace(/[%_,().]/g,' ');
    const offset=Math.min(100000,Math.max(0,Number(req.query.offset)||0));
    let query=db.from('codumi_support_tickets').select('*',{count:'exact'});
    if(['new','reviewing','resolved','rejected'].includes(status))query=query.eq('status',status);
    if(allowedCategories.has(category))query=query.eq('category',category);
    if(search)query=query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    const {data,count,error}=await query.order('created_at',{ascending:false}).range(offset,offset+limit-1);
    if(error)return fail(res,error);
    res.json({ok:true,total:count||0,tickets:(data||[]).map(row=>({...row,
      author:userSummary(authStore,row.author_id),target:userSummary(authStore,row.target_user_id),
      images:(row.images||[]).map((img,i)=>({index:i,mime:img.mime}))
    }))});
  });
  app.patch('/api/admin/support/tickets/:id',requireAdmin,async(req,res)=>{
    if(!uuidPattern.test(req.params.id)||!['new','reviewing','resolved','rejected'].includes(req.body?.status))
      return res.status(400).json({ok:false,error:'INVALID_SUPPORT_TICKET'});
    const patch={status:req.body.status,updated_at:new Date().toISOString()};
    if(Object.prototype.hasOwnProperty.call(req.body||{},'note'))patch.admin_note=String(req.body.note||'').trim().slice(0,1000);
    const {error}=await db.from('codumi_support_tickets').update(patch).eq('id',req.params.id);
    if(error)return fail(res,error);
    try { await controls?.log?.('support_ticket_reviewed',{reason:req.body.status,detail:{ticketId:req.params.id}}); }
    catch(e){console.warn('[support] Audit entry:',e?.message);}
    res.json({ok:true});
  });
  app.get('/api/admin/support/tickets/:id/images/:index',requireAdmin,async(req,res)=>{
    if(!uuidPattern.test(req.params.id))return res.status(404).end();
    const {data,error}=await db.from('codumi_support_tickets').select('images').eq('id',req.params.id).maybeSingle();
    if(error)return fail(res,error);
    const i=Number(req.params.index);const attachment=Array.isArray(data?.images)&&Number.isInteger(i)?data.images[i]:null;
    if(!attachment?.path||!attachment.path.includes(`/${req.params.id}/`))return res.status(404).end();
    const signed=await storage.createSignedUrl(attachment.path,600);
    if(signed.error)return fail(res,signed.error);
    res.json({ok:true,url:signed.data.signedUrl});
  });
}
