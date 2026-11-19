import { getProgressRecord, progressFromXp } from '../core/progression.js';
const sqlMissing = error => ['42P01','42883','PGRST202','PGRST205'].includes(error?.code);
export function registerDailyRewards(app, { db, requireUser, rateLimit, emitToUser }) {
  const fail=(res,error)=>{
    console.error('[daily-rewards]',error?.message||error);
    return res.status(503).json({ok:false,error:sqlMissing(error)?'DAILY_REWARDS_SQL_REQUIRED':'DAILY_REWARDS_UNAVAILABLE'});
  };
  app.get('/api/daily-rewards',rateLimit({prefix:'daily-rewards-status',limit:80,windowMs:60000}),async(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    try {
      const {data,error}=await db.rpc('codumi_daily_reward_status',{p_user:user.id});
      if(error)throw error;
      res.json({ok:true,...data});
    } catch(error){ fail(res,error); }
  });
  app.post('/api/daily-rewards/claim',rateLimit({prefix:'daily-rewards-claim',limit:12,windowMs:60000}),async(req,res)=>{
    const user=requireUser(req,res);if(!user)return;
    try {
      // Browser never chooses reward, user, day or clock; only server and SQL do.
      const {data,error}=await db.rpc('codumi_daily_reward_claim',{p_user:user.id});
      if(error)throw error;
      if(!data.alreadyClaimed) {
        if(data.coinsEarned)emitToUser(user.id,'wallet:updated',{coinsEarned:data.coinsEarned});
        if(data.xpEarned) {
          try {
            const progress=await getProgressRecord(db,user.id);
            emitToUser(user.id,'progress:updated',{level:progressFromXp(progress.xp)});
          } catch(e) {console.warn('[daily-rewards] Progress broadcast failed after payout:',e?.message||e);}
        }
        emitToUser(user.id,'daily-rewards:updated',{});
      }
      res.json({ok:true,...data});
    } catch(error){fail(res,error);}
  });
}
