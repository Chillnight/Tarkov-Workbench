// Author: CA
import loadHighs from './vendor/highs.mjs';
import {choiceCandidates,compatibleChoice} from './attachment-choices.mjs';
self.onmessage=async event=>{
  try{
    const {catalog,options,kind}=event.data;
    const solver=await loadHighs({locateFile:name=>new URL(`vendor/${name}`,import.meta.url).href});
    const candidates=choiceCandidates(catalog,options,kind),ids=[];let checked=0,unchecked=0;
    for(const item of candidates){
      const choice={...options,[kind==='scope'?'scopeId':'magazineId']:item.id};
      if(kind==='magazine')choice.magazine=1;
      const status=compatibleChoice(catalog,choice,solver);
      if(status==='compatible')ids.push(item.id);
      if(status==='unchecked')unchecked++;
      self.postMessage({type:'choices',ids,checked:++checked,total:candidates.length,unchecked,done:checked===candidates.length});
    }
    if(!candidates.length)self.postMessage({type:'choices',ids,checked:0,total:0,unchecked:0,done:true});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
