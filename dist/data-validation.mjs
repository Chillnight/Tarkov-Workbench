// Author: CA
const idPattern=/^[a-f0-9]{24}$/;
const imagePattern=/^images\/[a-f0-9]{24}(?:-reference)?\.webp$/;
const fail=message=>{throw new Error(`Data validation failed: ${message}`);};
const ids=value=>Array.isArray(value)&&value.length<40000&&value.every(id=>typeof id==='string'&&idPattern.test(id));
const validOffers=value=>Array.isArray(value)&&value.length<100&&value.every(o=>idPattern.test(o.trader)&&Number.isFinite(o.price)&&o.price>0&&Number.isFinite(o.priceRUB)&&o.priceRUB>0&&['RUB','USD','EUR'].includes(o.currency)&&Number.isInteger(o.minTraderLevel)&&o.minTraderLevel>=1&&o.minTraderLevel<=4&&(o.taskUnlock==null||idPattern.test(o.taskUnlock)));
export function validateImageSource(value){
  try {const url=new URL(value);return url.protocol==='https:'&&url.hostname==='assets.tarkov.dev'&&!url.port&&!url.username&&!url.password&&/^\/(?:[a-f0-9]{24}-(?:icon|512)\.webp|unknown-item-(?:icon\.jpg|512\.webp))$/.test(url.pathname)&&!url.search&&!url.hash;}catch{return false;}
}
export function validateSource(source,locale){
  if(!source?.items||!source.itemCategories||!locale||typeof locale!=='object')fail('unsupported export format');
  const all=Object.values(source.items);
  if(all.length<1000||all.length>40000)fail('incomplete or oversized export');
  for(const item of all){
    if(!Array.isArray(item.types))fail('missing item types');
    if(!item.types.some(type=>['gun','mods'].includes(type)))continue;
    if(!idPattern.test(item.id)||!ids(item.categories))fail('invalid item identity');
    if(typeof (locale[item.name]??item.name)!=='string'||typeof (locale[item.shortName]??item.shortName)!=='string')fail('missing English names');
    if(!validateImageSource(item.iconLink))fail('unsupported item image source');
    if(!validOffers(item.buyFromTrader))fail('invalid or missing trader purchase offers');
    for(const slot of item.properties?.slots??[]){
      if(!idPattern.test(slot.id)||typeof slot.nameId!=='string')fail('invalid attachment slot');
      for(const value of Object.values(slot.filters??{}))if(!ids(value))fail('invalid attachment filter');
    }
  }
}
export function validateCatalog(catalog,previous){
  if(!catalog?.meta||!catalog.items||!/^[a-f0-9]{16}$/.test(catalog.meta.version))fail('invalid snapshot');
  if(catalog.meta.schemaVersion!==undefined&&catalog.meta.schemaVersion!==1)fail('this data needs a newer app');
  if(!Number.isFinite(Date.parse(catalog.meta.fetchedAt)))fail('invalid retrieval date');
  const all=Object.values(catalog.items),guns=all.filter(i=>i.types?.includes('gun'));
  if(guns.length<100||all.length-guns.length<1000||all.length>15000)fail('incomplete weapon database');
  if(previous&&all.length<Object.keys(previous.items).length*.9)fail('more than 10% of items are missing');
  if(guns.length!==catalog.meta.weaponCount||all.length-guns.length!==catalog.meta.modCount)fail('item totals do not match');
  const visited=new Set(),active=new Set();
  for(const [id,item] of Object.entries(catalog.items)){
    if(!idPattern.test(id)||id!==item.id||typeof item.name!=='string'||!item.name||typeof item.shortName!=='string')fail('invalid item');
    if(![item.ergo,item.recoil,item.weight].every(Number.isFinite)||item.weight<0)fail(`missing stats for ${item.shortName}`);
    if(!validOffers(item.offers))fail('missing trader offers; update the database with this app version');
    if(!Array.isArray(item.barters)||item.barters.some(o=>!/^[a-zA-Z0-9_-]{1,80}$/.test(o.id)||o.kind!=='barter'||!idPattern.test(o.trader)||!Number.isInteger(o.minTraderLevel)||o.minTraderLevel<1||o.minTraderLevel>4||(o.taskUnlock!=null&&!idPattern.test(o.taskUnlock))||!(o.rewardCount>0)||!Number.isFinite(o.rewardCount)||(o.priceRUB!==null&&(!Number.isFinite(o.priceRUB)||o.priceRUB<=0))||!Array.isArray(o.requiredItems)||!o.requiredItems.length||o.requiredItems.some(i=>typeof i.id!=='string'||typeof i.name!=='string'||!i.name||!Number.isFinite(i.count)||i.count<=0)))fail('missing or invalid barter offers; update the database with this app version');
    if(!ids(item.categories)||!ids(item.conflicts)||!ids(item.conflictCategories)||!ids(item.blockedSlots))fail('invalid compatibility restrictions');
    if(!imagePattern.test(item.icon)||!validateImageSource(item.iconSource))fail('invalid local image path');
    if(item.types.includes('gun')&&(![item.vertical,item.horizontal].every(Number.isFinite)||!imagePattern.test(item.image)||!validateImageSource(item.imageSource)))fail(`missing weapon data for ${item.shortName}`);
    if(!Array.isArray(item.slots))fail('missing attachment slots');
    for(const slot of item.slots){
      if(!idPattern.test(slot.id)||typeof slot.key!=='string'||!ids(slot.allowed)||slot.allowed.some(id=>!catalog.items[id])||slot.missing?.length)fail('incomplete attachment references');
      if(slot.required&&!slot.allowed.length)fail('required attachment slot has no candidates');
    }
  }
  function visit(id){
    if(active.has(id))fail('cyclic attachment graph');if(visited.has(id))return;
    active.add(id);for(const slot of catalog.items[id].slots)for(const next of slot.allowed)visit(next);
    active.delete(id);visited.add(id);
  }
  for(const item of all)visit(item.id);
  return catalog;
}
