// Author: CA
import {isAvailable} from './availability.mjs';
import {isOptic} from './optics.mjs';
import {compatibleChoice} from './attachment-choices.mjs';

export function suppressorVariants(catalog,weaponId,options={}){
  const weapon=catalog?.items[weaponId],seen=new Set();
  let silenced=false;
  function visit(id){
    if(seen.has(id))return;seen.add(id);
    const item=catalog.items[id];
    if(!isAvailable(item,{...options,weaponId},catalog)||isOptic(item))return;
    if(item.suppressor)silenced=true;
    for(const slot of item.slots)for(const child of slot.allowed)visit(child);
  }
  if(weapon)visit(weaponId);
  const memo=new Map(),active=new Set();
  function withoutSuppressor(id){
    if(memo.has(id))return memo.get(id);
    const item=catalog.items[id];
    if(!item||item.suppressor||active.has(id)||!isAvailable(item,{...options,weaponId},catalog))return false;
    active.add(id);
    const possible=item.slots.filter(slot=>slot.required).every(slot=>slot.allowed.some(withoutSuppressor));
    active.delete(id);memo.set(id,possible);return possible;
  }
  return {silenced,unsilenced:Boolean(weapon&&withoutSuppressor(weaponId))};
}

// Prove weapon variants independently of pinned accessories and spending caps.
// Those choices remain unchanged and are validated by the full build calculation.
export function verifySuppressorVariants(catalog,weaponId,options,solver){
  const reachable=suppressorVariants(catalog,weaponId,options);
  const physical={...options,weaponId,scopeId:null,magazineId:null,magazine:1,maxBudget:null,restrictTraders:false,excludeArenaUnlocks:false};
  const statuses={};
  for(const sound of ['silenced','unsilenced']){
    const proof=compatibleChoice(catalog,{...physical,sound},solver);
    statuses[sound]=proof==='compatible'&&!reachable[sound]?'unavailable':proof;
  }
  return statuses;
}

export function variantCacheKey(catalog,options){
  return JSON.stringify({version:catalog?.meta?.version,weaponId:options.weaponId,excludeArenaUnlocks:options.excludeArenaUnlocks,allowGrenadeLaunchers:options.allowGrenadeLaunchers,restrictTraders:options.restrictTraders,traderLevels:options.traderLevels,includeQuestOffers:options.includeQuestOffers,includeBarters:options.includeBarters});
}
