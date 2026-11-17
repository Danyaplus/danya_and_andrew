import {randomUUID} from 'node:crypto';
import {requireAdmin} from './adminAuth.js';
const ID=/^[a-f0-9]{8}-[a-f0-9-]{27,45}$/i;
const KINDS=new Set(['site','background','emoji','frame','title','card','bundle']);
const MIME={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const fail=(res,error)=>{const text=String(error?.message||'');for(const code of ['PRODUCT_NOT_AVAILABLE','ALREADY_OWNED','INSUFFICIENT_COINS','NOT_OWNED','INVALID_PRODUCT','INVALID_IMAGE'])if(text.includes(code))return res.status(409).json({ok:false,error:code});console.error('[market]',error?.message||error);return res.status(503).json({ok:false,error:'MARKET_UNAVAILABLE'});};
function safeProduct(row,store) {return {...row,imageUrl:row.image_path?store.getPublicUrl(row.image_path).data.publicUrl:null};}
export function registerMarketplace(app,{authStore,requireUser,emitToUser,controls,getCosmeticsProfile}) {
 const db=authStore.supabase,store=db.storage.from('codumi-shop-public');
 async function catalog(all=false){let q=db.from('codumi_market_products').select('*').order('created_at',{ascending:false});if(!all)q=q.eq('active',true);const {data,error}=await q.limit(500);if(error)throw error;return (data||[]).map(x=>safeProduct(x,store));}
 async function myItems(userId){const [owned,eq]=await Promise.all([
  db.from('codumi_market_owned').select('product_id,purchased_at').eq('user_id',userId),
  db.from('codumi_market_equipped').select('kind,product_id').eq('user_id',userId)]);
  if(owned.error||eq.error)throw owned.error||eq.error;
  return {owned:(owned.data||[]).map(r=>r.product_id),equipped:Object.fromEntries((eq.data||[]).map(r=>[r.kind,r.product_id]))};
 }
 app.get('/api/market/catalog',async(req,res)=>{try{res.json({ok:true,products:await catalog()});}catch(e){fail(res,e);}});
 app.get('/api/market/me',async(req,res)=>{const u=requireUser(req,res);if(!u)return;try{res.json({ok:true,...await myItems(u.id),products:await catalog()});}catch(e){fail(res,e);}});
 app.post('/api/market/buy',async(req,res)=>{const u=requireUser(req,res);if(!u)return;
  if(!ID.test(req.body?.productId||''))return res.status(400).json({ok:false,error:'INVALID_PRODUCT'});
  try {const {data,error}=await db.rpc('codumi_market_buy',{p_user:u.id,p_product:req.body.productId});if(error)throw error;
   emitToUser(u.id,'wallet:updated',{coins:Number(data.coins)});
   res.json({ok:true,...await myItems(u.id),coins:Number(data.coins)});
  }catch(e){fail(res,e);}
 });
 app.post('/api/market/unequip',async(req,res)=>{
  const user=requireUser(req,res);if(!user)return;
  const kind=req.body?.kind;
  if(!KINDS.has(kind)||kind==='bundle')return res.status(400).json({ok:false,error:'INVALID_PRODUCT'});
  const {error}=await db.from('codumi_market_equipped').delete().eq('user_id',user.id).eq('kind',kind);
  if(error)return fail(res,error);
  res.json({ok:true});
 });
 app.post('/api/market/equip',async(req,res)=>{const u=requireUser(req,res);if(!u)return;
  if(!ID.test(req.body?.productId||''))return res.status(400).json({ok:false,error:'INVALID_PRODUCT'});
  try{const {error}=await db.rpc('codumi_market_equip',{p_user:u.id,p_product:req.body.productId});if(error)throw error;
   res.json({ok:true,...await myItems(u.id)});
  }catch(e){fail(res,e);}
 });
 app.get('/api/admin/market/products',requireAdmin,async(req,res)=>{try{res.json({ok:true,products:await catalog(true)});}catch(e){fail(res,e);}});
 app.post('/api/admin/market/upload',requireAdmin,async(req,res)=>{
  const {mime,data}=req.body||{};
  if(!MIME[mime]||typeof data!=='string'||data.length>1_400_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))return res.status(400).json({ok:false,error:'INVALID_IMAGE'});
  const buf=Buffer.from(data,'base64');
  if(!buf.length||buf.length>1_000_000 || (mime==='image/png'&&!buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    ||(mime==='image/jpeg'&&!(buf[0]===255&&buf[1]===216))
    ||(mime==='image/webp'&&!(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')))
    return res.status(400).json({ok:false,error:'INVALID_IMAGE'});
  const path=`products/${randomUUID()}.${MIME[mime]}`;
  const uploaded=await store.upload(path,buf,{contentType:mime,upsert:false});if(uploaded.error)return fail(res,uploaded.error);
  res.json({ok:true,imagePath:path,imageUrl:store.getPublicUrl(path).data.publicUrl});
 });
 app.post('/api/admin/market/products',requireAdmin,async(req,res)=>{
  const d=req.body||{};
  const bundle=d.kind==='bundle';const bundleItems=Array.isArray(d.bundleItems)?[...new Set(d.bundleItems)]:[];
  const price=Number(d.price),sale=d.salePrice===null||d.salePrice===''||d.salePrice===undefined?null:Number(d.salePrice);
  if(!KINDS.has(d.kind)||typeof d.title!=='string'||d.title.trim().length<2||d.title.trim().length>90
    ||!Number.isSafeInteger(price)||price<0||price>1e6||sale!==null&&(!Number.isInteger(sale)||sale<0||sale>=price)
    ||(bundle&&(bundleItems.length<2||bundleItems.length>10||bundleItems.some(id=>!ID.test(id))))
    ||(!bundle&&bundleItems.length)
    ||(d.imagePath&& (typeof d.imagePath!=='string'||!/^products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(d.imagePath))))
    return res.status(400).json({ok:false,error:'INVALID_PRODUCT'});
  try{
   if(bundle){const {data,error}=await db.from('codumi_market_products').select('id,kind,active').in('id',bundleItems);if(error)throw error;if(data?.length!==bundleItems.length||data.some(i=>!i.active||i.kind==='bundle'))throw Error('INVALID_PRODUCT');}
   const row={title:d.title.trim(),description:String(d.description||'').trim().slice(0,500),kind:d.kind,price,sale_price:sale,image_path:bundle?null:(d.imagePath||null),active:d.active!==false,bundle_items:bundle?bundleItems:[]};
   const mutate=d.id&&ID.test(d.id)?db.from('codumi_market_products').update({...row,updated_at:new Date().toISOString()}).eq('id',d.id).select('id').single()
     :db.from('codumi_market_products').insert(row).select('id').single();
   const {data,error}=await mutate;if(error)throw error;
   await controls.log('market_product_changed',{reason:row.title,detail:{id:data.id,kind:row.kind,price:row.price,sale:row.sale_price}});
   res.json({ok:true,id:data.id});
  }catch(e){fail(res,e);}
 });
}
