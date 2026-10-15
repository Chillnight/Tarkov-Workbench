// Author: CA
import {matchesOpticFilter} from './optics.mjs';
export function choiceMatches(item,kind,{query='',filter=kind==='scope'?'all':'0'}={}){
  const searched=`${item.name} ${item.shortName}`.toLowerCase().includes(query.trim().toLowerCase());
  const filtered=kind==='scope'?matchesOpticFilter(item,filter):!Number(filter)||item.capacity>=Number(filter);
  return {searched,filtered};
}
export function choicePriority(item,kind,view){
  const {searched,filtered}=choiceMatches(item,kind,view);
  return searched&&filtered?0:searched?1:filtered?2:3;
}
export function recommendedChoiceWorkers(hardwareConcurrency=2,count=Infinity,edges=Infinity){
  const cores=Number.isFinite(hardwareConcurrency)?Math.max(1,Math.floor(hardwareConcurrency)):2;
  const cap=edges<500?1:edges<1500?2:8;
  return Math.max(1,Math.min(cap,Math.max(1,Math.floor(cores/2)),count));
}
export function createChoiceQueue({catalog,options,kind,candidates,records={},edgeCount=0,workerCount=2,createWorker=()=>new Worker('./choices-worker.mjs',{type:'module'}),onUpdate=()=>{},onError=()=>{}}){
  const ids=new Set(candidates.map(i=>i.id));
  const results=new Map(Object.entries(records).filter(([id,status])=>ids.has(id)&&['compatible','incompatible'].includes(status)));
  const slots=[],inFlight=new Set(),retryIds=new Set();let view={},stopped=false,serial=0,serialRetries=false;
  function snapshot(){
    const known=Object.fromEntries([...results].filter(([,status])=>status==='compatible'||status==='incompatible'));
    return {ids:candidates.filter(i=>results.get(i.id)==='compatible').map(i=>i.id),records:known,checked:results.size-retryIds.size,total:candidates.length,unchecked:[...results].filter(([id,status])=>status==='unchecked'&&!retryIds.has(id)).length,done:results.size===candidates.length&&retryIds.size===0,workers:slots.filter(s=>s.worker).length};
  }
  function shutdown(){for(const slot of slots){slot.worker?.terminate();slot.worker=null;}inFlight.clear();}
  function emit(){if(stopped)return;const state=snapshot();onUpdate(state);if(state.done)shutdown();}
  function schedule(){
    if(stopped)return;
    let pending=candidates.map((item,index)=>({item,index})).filter(({item})=>!results.has(item.id)&&!inFlight.has(item.id));
    // A busy CPU must not turn a parallel timeout into a missing choice. Retry
    // each unchecked parallel result once on its own after the normal queue.
    if(!pending.length&&!inFlight.size&&retryIds.size){
      serialRetries=true;const keeper=slots.find(s=>s.worker&&s.ready);
      for(const slot of slots)if(slot!==keeper){slot.worker?.terminate();slot.worker=null;}
      pending=candidates.map((item,index)=>({item,index})).filter(({item})=>retryIds.has(item.id));
    }
    pending.sort((a,b)=>choicePriority(a.item,kind,view)-choicePriority(b.item,kind,view)||a.index-b.index);
    for(const slot of slots){
      if(!slot.ready||slot.itemId||!slot.worker)continue;
      const next=pending.shift();if(!next)break;
      slot.itemId=next.item.id;slot.task=++serial;inFlight.add(slot.itemId);
      if(serialRetries){retryIds.delete(slot.itemId);results.delete(slot.itemId);}
      try{slot.worker.postMessage({type:'check',id:slot.itemId,task:slot.task});}catch(error){fail(slot,error);}
    }
  }
  function fail(slot,error){
    if(stopped||!slot.worker)return;
    if(slot.itemId){results.set(slot.itemId,'unchecked');inFlight.delete(slot.itemId);slot.itemId=null;}
    slot.worker.terminate();slot.worker=null;slot.ready=false;
    if(!slots.some(s=>s.worker)){
      retryIds.clear();for(const item of candidates)if(!results.has(item.id))results.set(item.id,'unchecked');
      onError(error instanceof Error?error:new Error('Compatibility worker failed. Reopen the picker to retry.'));
    }
    emit();schedule();
  }
  function start(){
    if(stopped||slots.length)return;
    if(results.size===candidates.length){emit();return;}
    const size=Math.max(1,Math.min(Math.floor(workerCount)||1,candidates.length-results.size));
    for(let i=0;i<size;i++){
      const slot={worker:null,ready:false,itemId:null,task:0};slots.push(slot);
      try{
        slot.worker=createWorker();
        slot.worker.onmessage=event=>{
          if(stopped||!slot.worker)return;
          const message=event.data;
          if(message.type==='ready'){slot.ready=true;schedule();return;}
          if(message.type==='error'){fail(slot,new Error(message.message));return;}
          if(message.type!=='choice'||message.task!==slot.task||message.id!==slot.itemId)return;
          if(!['compatible','incompatible','unchecked'].includes(message.status)){fail(slot,new Error('Invalid compatibility response.'));return;}
          results.set(message.id,message.status);
          if(message.status==='unchecked'&&workerCount>1&&!serialRetries)retryIds.add(message.id);
          inFlight.delete(message.id);slot.itemId=null;
          emit();schedule();
        };
        slot.worker.onerror=error=>fail(slot,error);
        slot.worker.postMessage({type:'init',catalog,options,kind,edgeCount});
      }catch(error){
        // A constructor failure cannot create an unchecked result for a different task.
        slot.worker?.terminate();
        slot.worker=null;
        if(i===size-1&&!slots.some(s=>s.worker)){for(const item of candidates)if(!results.has(item.id))results.set(item.id,'unchecked');onError(error);emit();}
      }
    }
    emit();
  }
  return {start,setView(next){view={...next};schedule();},snapshot,stop(){if(stopped)return snapshot();const state=snapshot();stopped=true;shutdown();return state;}};
}
