// Author: CA
import {zoomLabel} from './optics.mjs';
import {offerLabel} from './traders.mjs';
import {choiceCandidates} from './attachment-choices.mjs';
import {createProblem} from './optimizer.mjs';
import {attachmentCacheKey,createChoiceCache} from './choice-cache.mjs';
import {choiceMatches,createChoiceQueue,recommendedChoiceWorkers} from './choice-queue.mjs';
export {attachmentCacheKey} from './choice-cache.mjs';
export function setupAttachmentPickers({getCatalog,getOptions,imageURL,onSelect,validate=()=>true}){
  const $=id=>document.getElementById(id),cache=createChoiceCache(),cards=new Map();
  let queue=null,active=null,entries=[],progress=null,sequence=0,key=null,renderFrame=null,errorText='';
  const view=()=>({query:active?$(`${active}-search`).value:'',filter:active?$(`${active}-filter`).value:'all'});
  function stop(){
    sequence++;
    if(queue){const state=queue.stop();if(key)cache.put(key,state.records);queue=null;}
    if(renderFrame!==null){cancelAnimationFrame(renderFrame);renderFrame=null;}
  }
  function makeCard(item,kind,options,catalog){
    const card=document.createElement('button');card.type='button';card.className='scope-card';card.setAttribute('aria-label',`Use ${item.name}`);
    const img=document.createElement('img');img.src=imageURL(item.icon);img.alt='';img.loading='lazy';img.width=80;img.height=64;
    const copy=document.createElement('span');copy.className='scope-card-copy';
    for(const [tag,cls,text] of [['b','',item.shortName],['span','scope-full',item.name],['span','scope-meta',`${kind==='scope'?zoomLabel(item):item.capacity+' rounds'} · ${item.ergo>0?'+':''}${item.ergo} Ergo`],['span','scope-meta',offerLabel(item,options,catalog)]]){
      const el=document.createElement(tag);el.className=cls;el.textContent=text;copy.append(el);
    }
    card.append(img,copy);card.addEventListener('click',()=>{onSelect(kind,item.id);$(`${kind}-dialog`).close();});return card;
  }
  function render(){
    if(!active)return;
    const kind=active,catalog=getCatalog(),options=getOptions(),currentView=view();
    const visible=entries.filter(item=>{const match=choiceMatches(item,kind,currentView);return match.searched&&match.filtered;});
    const grid=$(`${kind}-grid`),visibleIds=new Set(visible.map(i=>i.id));
    for(const child of [...grid.children])if(!visibleIds.has(child.dataset.choiceId))child.remove();
    for(const [index,item] of visible.entries()){
      let card=cards.get(item.id);if(!card){card=makeCard(item,kind,options,catalog);card.dataset.choiceId=item.id;cards.set(item.id,card);}
      card.setAttribute('aria-pressed',String(options[kind==='scope'?'scopeId':'magazineId']===item.id));
      if(grid.children[index]!==card)grid.insertBefore(card,grid.children[index]??null);
    }
    $(`${kind}-count`).textContent=errorText||`${visible.length} compatible ${kind==='scope'?(visible.length===1?'sight':'sights'):(visible.length===1?'magazine':'magazines')}${progress&&!progress.done?` · Checking ${progress.checked} / ${progress.total} …`:''}${progress?.unchecked?` · ${progress.unchecked} could not be verified`:''}`;
    if(!visible.length){const p=document.createElement('p');p.className='empty';p.textContent=progress&&!progress.done?'Checking complete assemblies. Matching search and filter results are checked first …':progress?.unchecked?'Some options could not be verified. Close and reopen to retry, or adjust your search and settings.':'No matching compatible options. Try another search, suppressor variant, magazine choice or trader settings.';grid.append(p);}
  }
  function requestRender(){if(renderFrame!==null)return;renderFrame=requestAnimationFrame(()=>{renderFrame=null;render();});}
  async function open(kind){
    if(!validate())return;
    stop();active=kind;key=null;entries=[];cards.clear();errorText='';progress={done:false,checked:0,total:0};
    const catalog=getCatalog(),options=structuredClone(getOptions());if(!options.weaponId)return;
    key=attachmentCacheKey(catalog,options,kind);
    $(`${kind}-grid`).replaceChildren();$(`${kind}-dialog`).showModal();$(`${kind}-search`).focus();render();
    const current=sequence,currentKey=key,candidates=choiceCandidates(catalog,options,kind);
    const records=await cache.get(key);
    if(current!==sequence||active!==kind)return;
    let edges=0;try{edges=createProblem(catalog,options).edges.length;}catch{}
    queue=createChoiceQueue({catalog,options,kind,candidates,records,edgeCount:edges,workerCount:recommendedChoiceWorkers(navigator.hardwareConcurrency,candidates.length,edges),onUpdate:message=>{
      if(current!==sequence)return;
      progress=message;entries=message.ids.map(id=>catalog.items[id]);cache.put(currentKey,message.records);requestRender();
    },onError:error=>{if(current!==sequence)return;errorText=`Some compatibility checks failed: ${error.message}`;requestRender();}});
    queue.setView(view());queue.start();
  }
  for(const kind of ['scope','magazine']){
    $(`${kind}-change`).addEventListener('click',()=>open(kind));
    $(`${kind}-close`).addEventListener('click',()=>$(`${kind}-dialog`).close());
    $(`${kind}-dialog`).addEventListener('close',()=>{stop();active=null;key=null;});
    const changed=()=>{if(active!==kind)return;queue?.setView(view());render();};
    $(`${kind}-search`).addEventListener('input',changed);$(`${kind}-filter`).addEventListener('change',changed);
  }
  $('scope-none').addEventListener('click',()=>{onSelect('scope',null);$('scope-dialog').close();});
  $('magazine-auto').addEventListener('click',()=>{onSelect('magazine',null);$('magazine-dialog').close();});
  return {flush:()=>cache.flush()};
}
