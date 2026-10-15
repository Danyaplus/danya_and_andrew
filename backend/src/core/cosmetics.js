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
  { id:'emoji-star', kind:'emoji', name:'Звёздочка', price:0, icon:'🌟' },
  { id:'emoji-rocket', kind:'emoji', name:'Ракета', price:0, icon:'🚀' },
  { id:'emoji-bolt', kind:'emoji', name:'Молния', price:0, icon:'⚡' },
  { id:'emoji-heart', kind:'emoji', name:'Сердце', price:0, icon:'💜' },
  { id:'classic', kind:'card', name:'Классика', price:0, icon:'▤' },
  { id:'glass', kind:'card', name:'Стекло', price:0, icon:'✧' },
  { id:'outline', kind:'card', name:'Контур', price:0, icon:'▣' },
  { id:'nebula', kind:'card', name:'Туманность', price:180, icon:'🌠' },
  { id:'platinum', kind:'card', name:'Платина', price:300, icon:'💎' },
  { id:'ember', kind:'card', name:'Искры', price:450, icon:'🔥' },
];

export async function getCosmeticsProfile(db, userId) {
  const [wallet,owned,looks] = await Promise.all([
    db.from('codumi_coin_wallets').select('coins').eq('user_id',userId).maybeSingle(),
    db.from('codumi_owned_cosmetics').select('item_id').eq('user_id',userId),
    db.from('codumi_profile_looks').select('background_id,frame_id,card_style_id,emblem_id').eq('user_id',userId).maybeSingle(),
  ]);
  for(const entry of [wallet,owned,looks]) if(entry.error) throw entry.error;
  return { coins:Number(wallet.data?.coins || 0), owned:(owned.data||[]).map(item=>item.item_id),
    equipped:{ backgroundId:looks.data?.background_id||'sky', frameId:looks.data?.frame_id||'none',
      cardStyleId:looks.data?.card_style_id||'classic', emblemId:looks.data?.emblem_id||'emoji-star' } };
}
