// Author: CA
import { isAvailable } from './availability.mjs';
const opticCategories = new Set(['Scope','Assault scope','Reflex sight','Compact reflex sight','Special scope']);
export const isOptic = item => Boolean(item?.optic || opticCategories.has(item?.category));
export const isIronSight = item => item?.category==='Ironsight';
export const isIronSightSlot = (slot,items) => ['mod_sight_front','mod_sight_rear'].includes(slot.key)&&slot.allowed.some(id=>isIronSight(items[id]));
export function availableIronSightKinds(catalog,weaponId){
  const seen=new Set(),kinds=new Set();
  function visit(id){
    if(seen.has(id))return;seen.add(id);
    const item=catalog.items[id];if(!item||isOptic(item))return;
    for(const slot of item.slots){
      if(isIronSightSlot(slot,catalog.items))kinds.add(slot.key);
      for(const child of slot.allowed)visit(child);
    }
  }
  visit(weaponId);return [...kinds];
}
export function magnification(item) {
  const values = (item.zoomLevels?.[0] ?? []).filter(v => Number.isFinite(v) && v > 0);
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}
export function zoomLabel(item) {
  const range=magnification(item);
  return range ? `${range[0]}${range[0]===range[1]?'':`–${range[1]}`}×` : 'Zoom not listed';
}
export function matchesOpticFilter(item, filter) {
  if(filter==='all')return true;
  const special=item.category==='Special scope';
  if(filter==='special')return special;
  if(special)return false;
  const range=magnification(item);if(!range)return filter==='other';
  if(filter==='1x')return range[0]===1&&range[1]===1;
  if(['1-4','1-6','1-8'].includes(filter))return range[0]===1&&range[1]===Number(filter.slice(2));
  return filter==='other' && !['1x','1-4','1-6','1-8'].some(f=>matchesOpticFilter(item,f));
}
// A mounting path is a preview; the optimizer still checks whole-build conflicts.
export function reachableOptics(catalog, weaponId, options={}) {
  const visited=new Set(), found=[];
  function visit(id){
    if(visited.has(id))return;visited.add(id);
    const item=catalog.items[id];if(!isAvailable(item,{...options,weaponId}))return;
    if(isOptic(item)){found.push(item);return;}
    for(const slot of item.slots)for(const child of slot.allowed)visit(child);
  }
  visit(weaponId);
  return found.sort((a,b)=>a.name.localeCompare(b.name,'en'));
}
// Dedicated optic adapters must serve a sight. General-purpose rails are excluded.
export function classifyOpticMounts(items) {
  const memo=new Map(),active=new Set();
  function inspect(id){
    if(memo.has(id))return memo.get(id);
    const item=items[id];
    if(isOptic(item))return {safe:true,optic:true};
    if(!item||!['Mount','Auxiliary Mod','Ironsight'].includes(item.category)||active.has(id))return {safe:false,optic:false};
    active.add(id);
    const children=item.slots.flatMap(s=>s.allowed).map(inspect);
    const result={safe:children.every(c=>c.safe),optic:children.some(c=>c.optic)};
    active.delete(id);memo.set(id,result);return result;
  }
  for(const item of Object.values(items)){
    const result=inspect(item.id);
    item.opticMount=item.category==='Mount'&&result.safe&&result.optic;
  }
}
