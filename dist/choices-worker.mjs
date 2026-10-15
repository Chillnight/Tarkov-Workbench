// Author: CA
import loadHighs from './vendor/highs.mjs';
import {createChoiceSolver} from './choice-solver.mjs';
let solver,catalog,options,kind,loading;
self.onmessage=async event=>{
  try{
    const message=event.data;
    if(message.type==='init'){
      ({catalog,options,kind}=message);
      solver=await createChoiceSolver(catalog,options,()=>loading??=loadHighs({locateFile:name=>new URL(`vendor/${name}`,import.meta.url).href}),{edgeCount:message.edgeCount});self.postMessage({type:'ready'});return;
    }
    if(message.type!=='check'||!solver||!catalog)throw new Error('Compatibility worker is not ready.');
    const choice={...options,[kind==='scope'?'scopeId':'magazineId']:message.id};
    if(kind==='magazine')choice.magazine=1;
    const status=await solver.check(choice);
    self.postMessage({type:'choice',id:message.id,task:message.task,status});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
