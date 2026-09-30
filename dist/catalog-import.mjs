// Author: CA
import {isOptic,classifyOpticMounts} from './optics.mjs';
import {validateSource,validateCatalog} from './data-validation.mjs';
import {importBarters,BARTERS_URL} from './barters.mjs';
export const DATA_URL='https://json.tarkov.dev/regular/items';
export const NAMES_URL=DATA_URL+'_en';
const base=DATA_URL;
export async function normalizeExport(raw,names,overrides,barters){
const source = JSON.parse(raw.text).data;
const locale = JSON.parse(names.text).data;
if (!source?.items || !locale || Object.keys(source.items).length < 1000) throw new Error('Incomplete export; the existing data has been preserved.');
validateSource(source,locale);
const translate = value => locale[value] ?? value;
const items = {};
for (const item of Object.values(source.items)) {
  if (!item.types.some(type => ['gun', 'mods'].includes(type))) continue;
  const p = item.properties ?? {};
  const gun = item.types.includes('gun');
  items[item.id] = {
    id: item.id, name: translate(item.name), shortName: translate(item.shortName),
    types: item.types, categories: item.categories, category: translate(source.itemCategories[item.categories[0]]?.name ?? ''),
    wiki: item.wikiLink, link: item.link, iconSource: item.iconLink,
    imageSource: gun ? (source.items[p.defaultPreset]?.image512pxLink ?? item.image512pxLink) : undefined,
    icon: `images/${item.id}.webp`, image: gun ? `images/${item.id}-reference.webp` : undefined,
    ergo: gun ? p.ergonomics : item.ergonomicsModifier,
    recoil: gun ? 0 : (p.recoilModifier ?? (item.recoilModifier ?? 0) / 100),
    vertical: p.recoilVertical, horizontal: p.recoilHorizontal, weight: item.weight,
    caliber: gun ? translate(p.caliber) : undefined, capacity: p.capacity,
    zoomLevels: p.zoomLevels,
    offers: item.buyFromTrader.map(o=>({trader:o.trader,price:o.price,priceRUB:o.priceRUB,currency:o.currency,minTraderLevel:o.minTraderLevel,taskUnlock:o.taskUnlock??null})),
    statExtras: { accuracy:p.accuracyModifier??item.accuracyModifier??0, velocity:item.velocity??0, loudness:item.loudness??0, durabilityBurn:p.durabilityBurnFactor??1 },
    suppressor: overrides.items[item.id]?.suppressor ?? item.types.includes('suppressor'),
    override: overrides.items[item.id],
    conflicts: item.conflictingItems ?? [], blockedSlots: item.conflictingSlotIds ?? [],
    conflictCategories: item.conflictingCategories ?? [],
    slots: (p.slots ?? []).filter(slot => !(slot.filters?.allowedItems?.length && slot.filters.allowedItems.every(id=>source.items[id]?.types.includes('ammo')))).map(slot => ({ id: slot.id, name: translate(slot.name), key: slot.nameId, required: slot.required === true, ...slot.filters })),
    updated: item.updated
  };
  if (!Number.isFinite(items[item.id].ergo)) throw new Error(`Missing ergonomics value: ${item.id}`);
}
for (const item of Object.values(items)) {
  for (const slot of item.slots) {
    slot.allowed = Object.values(items).filter(candidate =>
      ((slot.allowedItems ?? []).includes(candidate.id) || (slot.allowedCategories ?? []).some(c => candidate.categories.includes(c))) &&
      !(slot.excludedItems ?? []).includes(candidate.id) && !(slot.excludedCategories ?? []).some(c => candidate.categories.includes(c))
    ).map(i => i.id);
    slot.missing = (slot.allowedItems ?? []).filter(id => !items[id]);
    for (const key of ['allowedItems','allowedCategories','excludedItems','excludedCategories']) delete slot[key];
  }
}
for(const item of Object.values(items))item.optic=isOptic(item);
classifyOpticMounts(items);
const barterCount=importBarters(barters,source,locale,items);
const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('catalog-v6-barters'+JSON.stringify(overrides)+raw.text+names.text+barters.text));
const version=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
const data = { meta: { schemaVersion:1, version, fetchedAt: raw.fetchedAt, sourceModified: raw.modified, source: base, localeSource: `${base}_en`, gameMode: 'regular', weaponCount: Object.values(items).filter(i => i.types.includes('gun')).length, modCount: Object.values(items).filter(i => !i.types.includes('gun')).length }, items };
validateCatalog(data);
data.meta.barterSource=BARTERS_URL;data.meta.barterFetchedAt=barters.fetchedAt??raw.fetchedAt;data.meta.barterCount=barterCount;
return data;
}
