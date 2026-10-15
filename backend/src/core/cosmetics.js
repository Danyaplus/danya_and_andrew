// Public cosmetics are decorative only: prices and ownership are enforced by SQL.
export const COSMETICS = [
  { id:'sky', kind:'background', name:'Небесные линии', price:0, icon:'☁️' },
  { id:'violet', kind:'background', name:'Лиловая волна', price:0, icon:'💜' },
  { id:'mint', kind:'background', name:'Ледяная мята', price:0, icon:'🍃' },
  { id:'sunset', kind:'background', name:'Золотой закат', price:120, icon:'🌅' },
  { id:'galaxy', kind:'background', name:'Галактика', price:220, icon:'🌌' },
  { id:'royal', kind:'background', name:'Королевский зал', price:360, icon:'👑' },
  { id:'none', kind:'frame', name:'Без рамки', price:0, icon:'○' },
  { id:'silver', kind:'frame', name:'Серебряная', price:0, icon:'🩶' },
  { id:'aqua', kind:'frame', name:'Неоновая', price:80, icon:'💠' },
  { id:'gold', kind:'frame', name:'Золотая', price:160, icon:'⭐' },
  { id:'prismatic', kind:'frame', name:'Призма', price:280, icon:'🌈' },
  { id:'emoji-none', kind:'emoji', name:'Без символа', price:0, icon:'✕' },
  { id:'emoji-crown', kind:'emoji', name:'Золотая корона', price:90, icon:'👑' },
  { id:'emoji-diamond', kind:'emoji', name:'Алмаз', price:160, icon:'💎' },
  { id:'emoji-fire', kind:'emoji', name:'Огненный след', price:210, icon:'🔥' },
  { id:'emoji-dragon', kind:'emoji', name:'Дракон', price:320, icon:'🐉' },
  { id:'emoji-game', kind:'emoji', name:'Геймпад', price:120, icon:'🎮' },
  { id:'emoji-star', kind:'emoji', name:'Звёздочка', price:0, icon:'🌟' },
  { id:'emoji-rocket', kind:'emoji', name:'Ракета', price:0, icon:'🚀' },
  { id:'emoji-bolt', kind:'emoji', name:'Молния', price:0, icon:'⚡' },
  { id:'emoji-heart', kind:'emoji', name:'Сердце', price:0, icon:'💜' },
  { id:'site-default', kind:'site', name:'Стандартный фон', price:0, icon:'◐' },
  { id:'site-aurora', kind:'site', name:'Северное сияние', price:150, icon:'🌈' },
  { id:'site-midnight', kind:'site', name:'Полуночный индиго', price:260, icon:'🌙' },
  { id:'site-grid', kind:'site', name:'Неоновая сетка', price:390, icon:'✨' },
  { id:'site-orbit', kind:'site', name:'Живой космос', price:520, icon:'🪐', animated:true },
  { id:'site-camp', kind:'site', name:'Ночной лес', price:680, icon:'🔥', animated:true },
  { id:'site-neocity', kind:'site', name:'Неоновый город', price:840, icon:'🌃', animated:true },
  { id:'classic', kind:'card', name:'Классика', price:0, icon:'▤' },
  { id:'glass', kind:'card', name:'Стекло', price:0, icon:'✧' },
  { id:'outline', kind:'card', name:'Контур', price:0, icon:'▣' },
  { id:'nebula', kind:'card', name:'Туманность', price:180, icon:'🌠' },
  { id:'platinum', kind:'card', name:'Платина', price:300, icon:'💎' },
  { id:'ember', kind:'card', name:'Искры', price:450, icon:'🔥' },
];

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
