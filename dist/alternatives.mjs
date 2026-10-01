// Author: CA
import { validateBuild } from './optimizer.mjs';
import { isOptic } from './optics.mjs';
import { isAvailable } from './availability.mjs';
import {cheapestOffer,buildCost} from './traders.mjs';

const equal=(a,b)=>Math.abs((a??0)-(b??0))<1e-8;
export function samePerformanceStats(a,b){
  return a.category===b.category && Boolean(a.suppressor)===Boolean(b.suppressor) &&
    ['ergo','recoil','capacity'].every(key=>equal(a[key],b[key])) &&
    [...new Set([...Object.keys(a.statExtras??{}),...Object.keys(b.statExtras??{})])].every(key=>equal(a.statExtras?.[key],b.statExtras?.[key]));
}
export const sameRecordedStats=(a,b)=>samePerformanceStats(a,b)&&equal(a.weight,b.weight);
export function alternativeWeightLabel(original,candidate){
  const grams=Math.round(((candidate.weight??0)-(original.weight??0))*1000);
  return equal(original.weight,candidate.weight)?'Same weight':`${grams>0?'+':''}${grams} g vs current part`;
}
export function replaceAttachment(catalog,options,rows,rowIndex,itemId){
  const row=rows[rowIndex],original=catalog.items[row?.itemId],candidate=catalog.items[itemId];
  if(!isAvailable(candidate,options,catalog))return null;
  if(!row||!candidate||!original||candidate.id===original.id||isOptic(original)||isOptic(candidate)||!samePerformanceStats(original,candidate))return null;
  const parent=rows[row.parent-1]?.itemId??options.weaponId;
  if(!catalog.items[parent]?.slots.find(s=>s.id===row.slotId)?.allowed.includes(itemId))return null;
  const next=rows.map(r=>({...r}));next[rowIndex].itemId=itemId;
  const children=next.filter(r=>r.parent===rowIndex+1).map(row=>({row,key:original.slots.find(s=>s.id===row.slotId)?.key})),used=new Set();
  // Only installed children need matching slots. Unused capabilities and
  // conflicts with absent items do not invalidate a swap in this assembly.
  function assign(index){
    if(index===children.length)return validateBuild(catalog,options,next).length===0;
    const {row:child,key}=children[index];
    for(const slot of candidate.slots){
      if(used.has(slot.id)||slot.key!==key||!slot.allowed.includes(child.itemId))continue;
      used.add(slot.id);child.slotId=slot.id;child.slotName=slot.name;
      if(assign(index+1))return true;
      used.delete(slot.id);
    }
    return false;
  }
  if(!assign(0))return null;
  if(options.maxBudget!=null){
    const cost=buildCost(catalog,options,next);
    if(cost.unpriced||cost.priceRUB>options.maxBudget+0.01)return null;
  }
  const paths=[catalog.items[options.weaponId].shortName];
  next.forEach((r,i)=>{
    r.path=`${paths[r.parent]} › ${r.slotName}`;
    paths[i+1]=`${paths[r.parent]} › ${catalog.items[r.itemId].shortName}`;
  });
  return next;
}
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
    return (slot?.allowed??[]).filter(id=>replaceAttachment(catalog,options,rows,index,id)).sort((a,b)=>(catalog.items[a].weight??0)-(catalog.items[b].weight??0)||(cheapestOffer(catalog.items[a],options)?.priceRUB??Infinity)-(cheapestOffer(catalog.items[b],options)?.priceRUB??Infinity)||catalog.items[a].name.localeCompare(catalog.items[b].name,'en'));
  });
}
