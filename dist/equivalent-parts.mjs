// Author: CA
import {factoryPartCount} from './factory-parts.mjs';
import {cheapestOffer} from './traders.mjs';
import {ironSightKinds} from './optics.mjs';
import {mountProfile,isSpecialMount} from './mount-profiles.mjs';

// Remove symmetric leaf choices only when replacing one cannot change any
// mounting, conflict, magazine, suppressor, ownership or budget constraint.
export function dominatedLeafNodes(catalog,options,nodes){
  const referenced=new Set(nodes.flatMap(n=>n.item.conflicts.filter(id=>id!==n.id))),groups=new Map(),removed=[];
  for(const node of nodes){
    const item=node.item;
    if(node.max!==1||node.incoming.length!==1||item.slots.length||item.id===options.scopeId||item.id===options.magazineId||referenced.has(item.id)||item.blockedSlots.length||item.conflictCategories.length||item.conflicts.some(id=>id!==item.id))continue;
    const slot=node.incoming[0].slot;
    const key=JSON.stringify([slot.id,slot.parent.id,item.category,[...item.categories].sort(),item.ergo,item.recoil,item.capacity??null,Boolean(item.suppressor),Boolean(item.opticMount),ironSightKinds(item,slot),mountProfile(item),isSpecialMount(item)]);
    const offer=cheapestOffer(item,options),owned=factoryPartCount(item,options,catalog)>0;
    const entry={node,weight:item.weight??0,unpriced:owned||offer?.priceRUB>0?0:1,price:owned?0:offer?.priceRUB??0};
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry);
  }
  for(const choices of groups.values()){
    const better=(a,b)=>{
      if(options.maxBudget!=null&&(a.unpriced>b.unpriced||a.price>b.price))return false;
      if(a.weight!==b.weight)return a.weight<b.weight;
      if(a.unpriced!==b.unpriced)return a.unpriced<b.unpriced;
      if(a.price!==b.price)return a.price<b.price;
      return a.node.index<b.node.index;
    };
    for(const choice of choices)if(choices.some(other=>other!==choice&&better(other,choice)))removed.push(choice.node);
  }
  return removed;
}
