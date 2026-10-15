// Author: CA
import * as storage from './storage.mjs';
import {availabilityKey} from './availability.mjs';
import {ENGINE_VERSION} from './optimizer.mjs';
export const CHOICE_CACHE_SCHEMA=1;
const indexKey='choices:index';
const proven=status=>status==='compatible'||status==='incompatible';
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function attachmentCacheKey(catalog,options,kind){
  return `choices:${ENGINE_VERSION}:${catalog.meta.version}:`+JSON.stringify(canonical({schema:CHOICE_CACHE_SCHEMA,kind,weaponId:options.weaponId,sound:options.sound,scopeId:kind==='scope'?null:options.scopeId,magazineId:kind==='magazine'?null:options.magazineId,magazine:kind==='magazine'?1:options.magazine,maxBudget:options.maxBudget??null,preferLighterParts:options.preferLighterParts!==false,...availabilityKey(options)}));
}
function clean(value){
  if(value?.schema!==undefined&&value.schema!==CHOICE_CACHE_SCHEMA)return {};
  return Object.fromEntries(Object.entries(value?.records??{}).filter(([id,status])=>/^[a-f0-9]{24}$/.test(id)&&proven(status)));
}
export function createChoiceCache({store=storage,maxEntries=48}={}){
  const memory=new Map();let writes=Promise.resolve();
  function touch(key,records){memory.delete(key);memory.set(key,records);while(memory.size>maxEntries)memory.delete(memory.keys().next().value);}
  async function get(key){
    if(memory.has(key)){const records=memory.get(key);touch(key,records);return {...records};}
    await writes.catch(()=>{});
    let saved;try{saved=await store.get(key);}catch{}
    const records=clean(saved);touch(key,records);return {...records};
  }
  function put(key,records){
    const snapshot=clean({records});touch(key,snapshot);
    writes=writes.catch(()=>{}).then(async()=>{
      if(await store.put(key,{schema:CHOICE_CACHE_SCHEMA,records:snapshot})===false)return;
      const prior=await store.get(indexKey);
      const keys=Array.isArray(prior)?prior.filter(k=>typeof k==='string'&&k.startsWith('choices:')&&k!==key):[];
      keys.push(key);
      while(keys.length>maxEntries){const stale=keys.shift();await store.remove?.(stale);}
      await store.put(indexKey,keys);
    }).catch(()=>{});
    return writes;
  }
  return {get,put,flush:()=>writes};
}
