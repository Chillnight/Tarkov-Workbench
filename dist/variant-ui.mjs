// Author: CA
import {variantCacheKey} from './weapon-configuration.mjs';
export function setupVariantSelection({getCatalog,getOptions,getSound,onSoundChange,notify}){
  // Only a completed proof blocks a variant. A quick check that ran out of time is
  // not a verdict: the full calculation verifies the assembly with longer limits.
  const blocked=status=>status==='incompatible'||status==='unavailable';
  const buttons=[...document.querySelectorAll('[data-sound]')],hint=document.getElementById('suppressor-availability'),cache=new Map();
  let worker=null,key=null,catalog=null,pending=null,resolvePending=null,statuses=null;
  function render(){
    const weapon=getCatalog()?.items[getOptions().weaponId];
    for(const button of buttons){const status=statuses?.[button.dataset.sound];button.disabled=!weapon;button.setAttribute('data-unavailable',String(Boolean(weapon&&statuses&&blocked(status))));button.setAttribute('aria-describedby','suppressor-availability');button.setAttribute('aria-pressed',String(button.dataset.sound===getSound()));button.title=!weapon?'Choose a weapon first':!statuses?'Checking complete weapon assemblies':status==='compatible'?'':status==='unchecked'?'The quick suppressor check did not finish. Calculate build still verifies this variant.':'This variant is unavailable. Click for details.';}
    hint.hidden=!weapon||Boolean(statuses?.silenced==='compatible'&&statuses?.unsilenced==='compatible');
    hint.textContent=!statuses?'Checking suppressor compatibility …':statuses.silenced==='compatible'?'Silenced is available. Click Unsilenced for availability details.':statuses.unsilenced==='compatible'?'Unsilenced is available. Click Silenced for availability details.':Object.values(statuses).includes('unchecked')?'The quick suppressor check did not finish in time. You can still calculate; the full calculation verifies the selected variant.':'No variant has been confirmed with the current availability settings. Review Settings or click a variant for details.';
  }
  function finish(next){
    statuses=next;
    if(blocked(statuses[getSound()])){
      const available=['silenced','unsilenced'].find(sound=>statuses[sound]==='compatible');
      if(available)onSoundChange(available);
    }
    render();resolvePending?.(next);resolvePending=null;
  }
  function refresh(){
    const nextCatalog=getCatalog(),options=getOptions(),nextKey=variantCacheKey(nextCatalog,options);
    if(nextCatalog!==catalog){cache.clear();catalog=nextCatalog;}
    if(nextKey===key&&pending)return pending;
    worker?.terminate();worker=null;resolvePending?.(null);resolvePending=null;key=nextKey;statuses=null;
    if(!options.weaponId||!nextCatalog){pending=Promise.resolve(null);render();return pending;}
    if(cache.has(key)){finish(cache.get(key));pending=Promise.resolve(statuses);return pending;}
    pending=new Promise(resolve=>{resolvePending=resolve;});render();
    const currentKey=key;worker=new Worker('./variants-worker.mjs',{type:'module'});
    const fail=()=>{if(key!==currentKey)return;worker?.terminate();worker=null;finish({silenced:'unchecked',unsilenced:'unchecked'});pending=null;};
    worker.onmessage=event=>{
      if(key!==currentKey)return;
      if(event.data.error){fail();return;}
      const next=event.data.statuses;
      worker.terminate();worker=null;
      if(Object.values(next).every(value=>value!=='unchecked'))cache.set(key,next);
      finish(next);
    };
    worker.onerror=fail;worker.postMessage({catalog:nextCatalog,options});return pending;
  }
  async function select(sound){
    const selectedKey=variantCacheKey(getCatalog(),getOptions()),next=await refresh();
    if(!next||selectedKey!==variantCacheKey(getCatalog(),getOptions()))return false;
    const weapon=getCatalog().items[getOptions().weaponId];
    if(blocked(next[sound])){
      const label=sound==='unsilenced'?'Unsuppressed':'Suppressed';
      notify(`${label} build unavailable`,`${weapon.shortName} cannot be assembled ${sound==='unsilenced'?'without':'with'} a suppressor using the current availability settings. Your current selection has been kept. ${next[sound]==='unavailable'?'Review your trader levels, quest offers and Arena filter in Settings.':`Choose ${sound==='unsilenced'?'Silenced':'Unsilenced'} or select another weapon.`}`);
      return false;
    }
    onSoundChange(sound);render();return true;
  }
  return {refresh,select};
}
