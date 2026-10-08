// Author: CA
import {replaceCompatibleAttachment} from './attachment-swaps.mjs';
import {thermalDominates} from './thermal-stats.mjs';
import {buildCost} from './traders.mjs';
// Improve only installed handguards. Keep every child, Ergo/recoil and other
// recorded performance stats; validate the full assembly and budget on each swap.
// Unknown values never establish dominance, and heat/cooling tradeoffs are not
// combined into an invented score. Weight and cost choose between incomparable
// improvements. Strict per-part improvement makes this loop terminate.
export function preferThermalHandguards(catalog,options,originalRows,validateBuild){
  let rows=originalRows,changed;
  const swaps=[];
  do{
    changed=false;
    for(let index=0;index<rows.length;index++){
      const current=catalog.items[rows[index].itemId];
      if(current.category!=='Handguard')continue;
      const parent=catalog.items[rows[index].parent===0?options.weaponId:rows[rows[index].parent-1].itemId];
      const slot=parent.slots.find(slot=>slot.id===rows[index].slotId),choices=[];
      for(const id of slot.allowed){
        const candidate=catalog.items[id];
        if(!candidate||!thermalDominates(candidate,current))continue;
        const next=replaceCompatibleAttachment(catalog,options,rows,index,id,validateBuild);
        if(next)choices.push({item:candidate,rows:next,cost:buildCost(catalog,options,next)});
      }
      const front=choices.filter(choice=>!choices.some(other=>other!==choice&&thermalDominates(other.item,choice.item)));
      const weight=(a,b)=>(a.item.weight??0)-(b.item.weight??0),price=(a,b)=>a.cost.unpriced-b.cost.unpriced||a.cost.priceRUB-b.cost.priceRUB;
      front.sort((a,b)=>(options.preferLighterParts!==false?weight(a,b)||price(a,b):price(a,b)||weight(a,b))||a.item.name.localeCompare(b.item.name,'en'));
      if(front.length){
        rows=front[0].rows;swaps.push({rowIndex:index,from:current.id,to:front[0].item.id});changed=true;
      }
    }
  }while(changed);
  return {rows,applied:swaps.length>0,swaps};
}
