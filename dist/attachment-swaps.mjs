// Author: CA
import {isOptic} from './optics.mjs';
import {isAvailable} from './availability.mjs';
import {buildCost} from './traders.mjs';
import {sameThermalStats} from './thermal-stats.mjs';
const equal=(a,b)=>Math.abs((a??0)-(b??0))<1e-8;
function sameNonThermalStats(a,b){
  return a.category===b.category && Boolean(a.suppressor)===Boolean(b.suppressor) &&
    ['ergo','recoil','capacity'].every(key=>equal(a[key],b[key])) &&
    [...new Set([...Object.keys(a.statExtras??{}),...Object.keys(b.statExtras??{})])].every(key=>equal(a.statExtras?.[key],b.statExtras?.[key]));
}
export const samePerformanceStats=(a,b)=>sameNonThermalStats(a,b)&&sameThermalStats(a,b);
const sameSwapStats=(a,b)=>sameNonThermalStats(a,b)&&(a.category==='Handguard'||sameThermalStats(a,b));
export const sameRecordedStats=(a,b)=>samePerformanceStats(a,b)&&equal(a.weight,b.weight);
export function alternativeWeightLabel(original,candidate){
  const grams=Math.round(((candidate.weight??0)-(original.weight??0))*1000);
  return equal(original.weight,candidate.weight)?'Same weight':`${grams>0?'+':''}${grams} g vs current part`;
}
export function replaceCompatibleAttachment(catalog,options,rows,rowIndex,itemId,validateBuild){
  const row=rows[rowIndex],original=catalog.items[row?.itemId],candidate=catalog.items[itemId];
  if(!isAvailable(candidate,options,catalog))return null;
  if(!row||!candidate||!original||candidate.id===original.id||isOptic(original)||isOptic(candidate)||!sameSwapStats(original,candidate))return null;
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
