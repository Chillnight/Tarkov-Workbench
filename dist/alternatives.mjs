// Author: CA
import {validateBuild} from './optimizer.mjs';
import {cheapestOffer,buildCost} from './traders.mjs';
import {replaceCompatibleAttachment} from './attachment-swaps.mjs';
import {factoryPartCount} from './factory-parts.mjs';
export {samePerformanceStats,sameRecordedStats,alternativeWeightLabel} from './attachment-swaps.mjs';
export const replaceAttachment=(catalog,options,rows,rowIndex,itemId)=>replaceCompatibleAttachment(catalog,options,rows,rowIndex,itemId,validateBuild);

export function applyAlternative(catalog,options,result,rowIndex,itemId){
  const rows=replaceAttachment(catalog,options,result.rows,rowIndex,itemId);
  if(!rows)return null;
  const weight=[options.weaponId,...rows.map(r=>r.itemId)].reduce((sum,id)=>sum+(catalog.items[id].weight??0),0);
  return {...result,rows,weight,manualAlternative:true,cost:buildCost(catalog,options,rows)};
}
export function findAlternatives(catalog,options,rows){
  return rows.map((row,index)=>{
    const parent=catalog.items[row.parent===0?options.weaponId:rows[row.parent-1].itemId];
    const slot=parent?.slots.find(s=>s.id===row.slotId);
    const weight=(a,b)=>(catalog.items[a].weight??0)-(catalog.items[b].weight??0);
    // An unused factory part costs nothing; unknown prices sort last.
    const cost=id=>factoryPartCount(catalog.items[id],options,catalog)>rows.filter(r=>r.itemId===id).length?0:cheapestOffer(catalog.items[id],options)?.priceRUB??Infinity;
    const price=(a,b)=>cost(a)===cost(b)?0:cost(a)-cost(b);
    // List alternatives in the same order of preference as the optimizer.
    const order=options.preferLighterParts!==false?(a,b)=>weight(a,b)||price(a,b):(a,b)=>price(a,b)||weight(a,b);
    return (slot?.allowed??[]).filter(id=>replaceAttachment(catalog,options,rows,index,id)).sort((a,b)=>order(a,b)||catalog.items[a].name.localeCompare(catalog.items[b].name,'en'));
  });
}
