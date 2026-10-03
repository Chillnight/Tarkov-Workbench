// Author: CA
import {factoryPartCount} from './factory-parts.mjs';
import {fleaOffer,fleaOfferLabel} from './flea-market.mjs';
export const TRADERS = Object.freeze([
  {id:'54cb50c76803fa8b248b4571',name:'Prapor'},
  {id:'54cb57776803fa99248b456e',name:'Therapist'},
  {id:'579dc571d53a0658a154fbec',name:'Fence'},
  {id:'58330581ace78e27b8b10cee',name:'Skier'},
  {id:'5935c25fb3acc3127c3d8cd9',name:'Peacekeeper'},
  {id:'5a7c2eca46aef81a7ca2145d',name:'Mechanic'},
  {id:'5ac3b934156ae10c4430e83c',name:'Ragman'},
  {id:'5c0647fdd443bc2504c2d371',name:'Jaeger'},
  {id:'6617beeaa9cfa777ca915b7c',name:'Ref'}
]);
export const defaultTraderSettings = () => ({restrictTraders:true,includeQuestOffers:true,includeBarters:true,includeFleaMarket:true,traderLevels:Object.fromEntries(TRADERS.map(t=>[t.id,1]))});
export function normalizeTraderSettings(value){
  const defaults=defaultTraderSettings();
  return {restrictTraders:typeof value?.restrictTraders==='boolean'?value.restrictTraders:defaults.restrictTraders,
    includeQuestOffers:value?.includeQuestOffers!==false,includeBarters:value?.includeBarters!==false,includeFleaMarket:value?.includeFleaMarket!==false,
    traderLevels:Object.fromEntries(TRADERS.map(t=>[t.id,Number.isInteger(value?.traderLevels?.[t.id])&&value.traderLevels[t.id]>=0&&value.traderLevels[t.id]<=4?value.traderLevels[t.id]:1]))};
}
const unlocked=(offer,options)=>(options.traderLevels?.[offer.trader]??(options.restrictTraders?1:4))>=offer.minTraderLevel&&(!offer.taskUnlock||options.includeQuestOffers!==false);
const value=offer=>Number.isFinite(offer.priceRUB)&&offer.priceRUB>0?offer.priceRUB:Infinity;
export function eligibleOffers(item,options={}){
  const market=fleaOffer(item,options),rank=o=>o.kind==='flea'?2:o.kind==='barter'?1:0;
  return [...[...(item?.offers??[]),...(options.includeBarters===false?[]:item?.barters??[])].filter(o=>unlocked(o,options)),...(market?[market]:[])].sort((a,b)=>value(a)-value(b)||rank(a)-rank(b)||a.trader.localeCompare(b.trader));
}
export const cheapestOffer=(item,options)=>eligibleOffers(item,options)[0]??null;
const vendor=offer=>`${TRADERS.find(t=>t.id===offer.trader)?.name??'Trader'} LL${offer.minTraderLevel}`;
const recipe=offer=>offer.requiredItems.map(i=>`${i.count} × ${i.name}${Object.keys(i.attributes??{}).length?' ('+Object.entries(i.attributes).map(([k,v])=>`${k}: ${v}`).join(', ')+')':''}`).join(' + ');
export function offerLabel(item,options,catalog,occurrence=1){
  if(occurrence<=factoryPartCount(item,options,catalog))return 'Factory part · included with selected weapon';
  const offer=cheapestOffer(item,options);
  if(offer?.kind==='flea')return fleaOfferLabel(offer);
  if(!offer){
    if(item?.barters?.length)return options.includeBarters===false?'Barter offers disabled in Settings':`Barter available · ${item.barters.map(vendor).join(' / ')} · locked by current settings`;
    return 'No eligible trader offer'+(options.includeFleaMarket===true?(item.flea===undefined?' · update database for Flea Market data':item.flea.allowed?'':' · not available on Flea Market'):'');
  }
  const price=offer.kind==='barter'?`Barter: ${recipe(offer)}${offer.rewardCount!==1?` → ${offer.rewardCount} items`:''}${value(offer)<Infinity?` · estimated ${offer.priceRUB.toLocaleString('en-GB')} RUB/item`:' · value unknown'}`:`${offer.price.toLocaleString('en-GB')} ${offer.currency}`;
  return `${vendor(offer)} · ${price}${offer.taskUnlock?' · quest unlock assumed':''}`;
}
export function buildCost(catalog,options,rows){
  let priceRUB=0,unpriced=0,barterCount=0,factoryCount=0,fleaCount=0;
  const used=new Map();
  for(const row of rows){
    const item=catalog.items[row.itemId],count=(used.get(row.itemId)??0)+1;used.set(row.itemId,count);
    if(count<=factoryPartCount(item,options,catalog)){factoryCount++;continue;}
    const offer=cheapestOffer(item,options);if(offer?.kind==='barter')barterCount++;
    if(offer?.kind==='flea')fleaCount++;
    if(offer&&value(offer)<Infinity)priceRUB+=offer.priceRUB;else unpriced++;
  }
  return {priceRUB,unpriced,barterCount,factoryCount,fleaCount};
}
