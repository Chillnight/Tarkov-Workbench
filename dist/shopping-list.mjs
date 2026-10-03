// Author: CA
import {TRADERS,cheapestOffer,buildCost} from './traders.mjs';
import {factoryPartCount} from './factory-parts.mjs';
import {fleaOfferLabel} from './flea-market.mjs';

export function createShoppingList(catalog,options,rows){
  const groups=new Map(),unavailable=new Map(),included=new Map(),used=new Map();
  for(const row of rows){
    const item=catalog.items[row.itemId];
    if(!item)continue;
    const count=(used.get(item.id)??0)+1;used.set(item.id,count);
    if(count<=factoryPartCount(item,options,catalog)){
      const entry=included.get(item.id)??{item,quantity:0};
      entry.quantity++;included.set(item.id,entry);continue;
    }
    const offer=cheapestOffer(item,options);
    if(!offer){
      const entry=unavailable.get(item.id)??{item,quantity:0};
      entry.quantity++;unavailable.set(item.id,entry);continue;
    }
    const key=`${offer.trader}:${offer.kind??'cash'}`;
    if(!groups.has(key))groups.set(key,{traderId:offer.trader,traderName:offer.kind==='flea'?'Flea Market':TRADERS.find(t=>t.id===offer.trader)?.name??'Trader',kind:offer.kind??'cash',items:new Map()});
    const group=groups.get(key),entry=group.items.get(item.id)??{item,offer,quantity:0};
    entry.quantity++;group.items.set(item.id,entry);
  }
  return {
    groups:[...groups.values()].map(group=>({...group,items:[...group.items.values()].sort((a,b)=>a.item.name.localeCompare(b.item.name,'en'))})).sort((a,b)=>a.traderName.localeCompare(b.traderName,'en')||a.kind.localeCompare(b.kind)),
    unavailable:[...unavailable.values()].sort((a,b)=>a.item.name.localeCompare(b.item.name,'en')),
    included:[...included.values()].sort((a,b)=>a.item.name.localeCompare(b.item.name,'en')),
    cost:buildCost(catalog,options,rows)
  };
}

export function formatShoppingList(list){
  const lines=['Tarkov Workbench · shopping list','Attachments only · weapon excluded · saved offers, not live stock'];
  for(const group of list.groups){
    lines.push('',`${group.traderName} · ${group.kind==='barter'?'Barter':group.kind==='flea'?'Estimated prices':'Cash'}`);
    for(const {item,offer,quantity} of group.items){
      if(group.kind==='flea'){lines.push(`${quantity} × ${item.shortName} – ${item.name} | ${fleaOfferLabel(offer)}${offer.priceRUB!==null?` | estimated total ${(offer.priceRUB*quantity).toLocaleString('en-GB')} RUB`:''}`);continue;}
      const unlock=`LL${offer.minTraderLevel}${offer.taskUnlock?' · quest unlock assumed':''}`;
      if(group.kind==='barter'){
        const trades=Math.ceil(quantity/(offer.rewardCount||1));
        const ingredients=(offer.requiredItems??[]).map(required=>`${required.count*trades} × ${required.name}${Object.keys(required.attributes??{}).length?' ('+Object.entries(required.attributes).map(([key,value])=>`${key}: ${value}`).join(', ')+')':''}`).join(' + ');
        lines.push(`${quantity} × ${item.shortName} – ${item.name} | ${unlock} | ${trades} trade${trades===1?'':'s'}: ${ingredients||'ingredients unknown'}${Number.isFinite(offer.priceRUB)&&offer.priceRUB>0?` | estimated ${Math.round(offer.priceRUB*quantity).toLocaleString('en-GB')} RUB`:''}`);
      }else lines.push(`${quantity} × ${item.shortName} – ${item.name} | ${unlock} | ${offer.price.toLocaleString('en-GB')} ${offer.currency} each`);
    }
  }
  if(list.included?.length){lines.push('','Factory parts included with selected weapon · no purchase needed');for(const {item,quantity} of list.included)lines.push(`${quantity} × ${item.shortName} – ${item.name}`);}
  if(list.unavailable.length){lines.push('','No eligible trader offer / price unknown');for(const {item,quantity} of list.unavailable)lines.push(`${quantity} × ${item.shortName} – ${item.name}`);}
  lines.push('',`Estimated attachment value: ${Math.round(list.cost.priceRUB).toLocaleString('en-GB')} RUB${list.cost.unpriced?` + ${list.cost.unpriced} unpriced part(s)`:''}. Barter and Flea Market values are estimates; inventory and live stock are not checked.`);
  return lines.join('\n');
}
