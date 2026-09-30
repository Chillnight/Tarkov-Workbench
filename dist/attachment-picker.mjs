// Author: CA
import {matchesOpticFilter,zoomLabel} from './optics.mjs';
import {offerLabel} from './traders.mjs';
export function setupAttachmentPickers({getCatalog,getOptions,imageURL,onSelect}){
  const $=id=>document.getElementById(id),cache=new Map();
  let worker=null,active=null,entries=[],progress=null,sequence=0;
  function stop(){sequence++;worker?.terminate();worker=null;}
  function render(){
    if(!active)return;
    const kind=active,options=getOptions(),query=$(`${kind}-search`).value.trim().toLowerCase();
    const visible=entries.filter(i=>`${i.name} ${i.shortName}`.toLowerCase().includes(query)&&
      (kind==='scope'?matchesOpticFilter(i,$('scope-filter').value):!Number($('magazine-filter').value)||i.capacity>=Number($('magazine-filter').value)));
    const grid=$(`${kind}-grid`);grid.replaceChildren();
    $(`${kind}-count`).textContent=`${visible.length} compatible ${kind==='scope'?(visible.length===1?'sight':'sights'):(visible.length===1?'magazine':'magazines')}${progress&&!progress.done?` · Checking ${progress.checked} / ${progress.total} …`:''}${progress?.unchecked?` · ${progress.unchecked} could not be verified`:''}`;
    for(const item of visible){
      const card=document.createElement('button');card.type='button';card.className='scope-card';card.setAttribute('aria-label',`Use ${item.name}`);
      card.setAttribute('aria-pressed',String(options[kind==='scope'?'scopeId':'magazineId']===item.id));
      const img=document.createElement('img');img.src=imageURL(item.icon);img.alt='';img.loading='lazy';img.width=80;img.height=64;
      const copy=document.createElement('span');copy.className='scope-card-copy';
      for(const [tag,cls,text] of [['b','',item.shortName],['span','scope-full',item.name],['span','scope-meta',`${kind==='scope'?zoomLabel(item):item.capacity+' rounds'} · ${item.ergo>0?'+':''}${item.ergo} Ergo`],['span','scope-meta',offerLabel(item,options)]]){
        const el=document.createElement(tag);el.className=cls;el.textContent=text;copy.append(el);
      }
      card.append(img,copy);card.addEventListener('click',()=>{onSelect(kind,item.id);$(`${kind}-dialog`).close();});grid.append(card);
    }
    if(!visible.length){const p=document.createElement('p');p.className='empty';p.textContent=progress&&!progress.done?'Checking complete assemblies and available mounts …':'No matching compatible options. Try another search, suppressor variant, magazine choice or trader settings.';grid.append(p);}
  }
  function open(kind){
    stop();active=kind;entries=[];progress={done:false,checked:0,total:0};
    const catalog=getCatalog(),options=getOptions();
    if(!options.weaponId)return;
    const key=JSON.stringify({version:catalog.meta.version,kind,weaponId:options.weaponId,sound:options.sound,scopeId:kind==='scope'?null:options.scopeId,magazineId:kind==='magazine'?null:options.magazineId,magazine:kind==='magazine'?1:options.magazine,excludeArenaUnlocks:options.excludeArenaUnlocks,allowGrenadeLaunchers:options.allowGrenadeLaunchers,restrictTraders:options.restrictTraders,traderLevels:options.traderLevels,includeQuestOffers:options.includeQuestOffers,includeBarters:options.includeBarters});
    $(`${kind}-dialog`).showModal();$(`${kind}-search`).focus();
    if(cache.has(key)){progress=cache.get(key);entries=progress.ids.map(id=>catalog.items[id]);render();return;}
    render();const current=sequence;worker=new Worker('./choices-worker.mjs',{type:'module'});
    worker.onmessage=event=>{
      if(current!==sequence)return;const message=event.data;
      if(message.type==='error'){$(`${kind}-count`).textContent=`Compatibility check failed: ${message.message}`;stop();return;}
      progress=message;entries=message.ids.map(id=>catalog.items[id]);render();
      if(message.done){if(!message.unchecked)cache.set(key,message);stop();}
    };
    worker.onerror=()=>{if(current!==sequence)return;$(`${kind}-count`).textContent='Compatibility check could not start. Close and reopen the picker to retry.';stop();};
    worker.postMessage({catalog,options,kind});
  }
  for(const kind of ['scope','magazine']){
    $(`${kind}-change`).addEventListener('click',()=>open(kind));
    $(`${kind}-close`).addEventListener('click',()=>$(`${kind}-dialog`).close());
    $(`${kind}-dialog`).addEventListener('close',()=>{stop();active=null;});
    $(`${kind}-search`).addEventListener('input',render);
    $(`${kind}-filter`).addEventListener('change',render);
  }
  $('scope-none').addEventListener('click',()=>{onSelect('scope',null);$('scope-dialog').close();});
  $('magazine-auto').addEventListener('click',()=>{onSelect('magazine',null);$('magazine-dialog').close();});
}
