// Public cosmetics are decorative only: prices and ownership are enforced by SQL.
import catalog from '../../../shared/cosmetics.json' with { type: 'json' };
export const COSMETICS = catalog;

// Extra cosmetics live in a separate table so the existing SQL shop function is untouched.
export const EXTRA_IDS = new Set(COSMETICS.filter(item => item.kind === 'site' || item.kind === 'emoji').map(item => item.id));

export async function getCosmeticsProfile(db, userId) {
  const [wallet,owned,looks,extra,extraOwned] = await Promise.all([
    db.from('codumi_coin_wallets').select('coins').eq('user_id',userId).maybeSingle(),
    db.from('codumi_owned_cosmetics').select('item_id').eq('user_id',userId),
    db.from('codumi_profile_looks').select('background_id,frame_id,card_style_id,emblem_id').eq('user_id',userId).maybeSingle(),
    db.from('codumi_profile_extras').select('*').eq('user_id',userId).maybeSingle(),
    db.from('codumi_extra_purchases').select('item_id').eq('user_id',userId),
  ]);
  for(const entry of [wallet,owned,looks]) if(entry.error) throw entry.error;
  // Existing players can still use their original shop until the additive SQL is installed.
  const extrasReady = !extra.error && !extraOwned.error;
  if (!extrasReady && ![extra.error,extraOwned.error].every(err => !err || ['42P01','PGRST205','PGRST116'].includes(err.code))) {
    throw extra.error || extraOwned.error;
  }
  const extras = extrasReady ? extra.data : null;
  return {
    coins:Number(wallet.data?.coins || 0),
    owned:[...(owned.data||[]).map(item=>item.item_id),...(extrasReady?(extraOwned.data||[]).map(item=>item.item_id):[])],
    extrasReady,
    savedColors:Array.isArray(extras?.saved_colors) ? extras.saved_colors : [],
    equipped:{
      backgroundId:looks.data?.background_id||'sky', frameId:looks.data?.frame_id||'none',
      cardStyleId:looks.data?.card_style_id||'classic',
      emblemId:extras?.emblem_id || looks.data?.emblem_id || 'emoji-star',
      siteId:extras?.site_background_id || 'site-default',
      siteAnimationEnabled: extras?.site_animation_enabled !== false,
      nicknameColor:extras?.nickname_color || '#FFFFFF',
    },
  };
}
