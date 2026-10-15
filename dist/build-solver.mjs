// Author: CA
import {createProblem} from './optimizer.mjs';
import {nativeBuildCandidate,useNativeBuildSearch} from './build-execution.mjs';
function cancelled(){const error=new Error('Build calculation cancelled.');error.name='AbortError';return error;}
export async function createBuildSolver(catalog,options,engine,progress=()=>{},{fetcher=globalThis.fetch,signal}={}){
 let accelerated=false,allStages=false,incumbent;
 if(signal?.aborted)throw cancelled();
 const edgeCount=createProblem(catalog,options).edges.length;
 const timeout=ms=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
 if(nativeBuildCandidate(options.mode,edgeCount)){
  try{
   const response=await fetcher(new URL('./api/solver',import.meta.url),{signal:timeout(1500)});
   if(response.ok){const capability=await response.json();allStages=capability.allStages===true;accelerated=capability.protocol===1&&capability.available===true&&(allStages||useNativeBuildSearch(options.mode,edgeCount));}
  }catch{if(signal?.aborted)throw cancelled();}
 }
 return {async solve(text,settings,{searchClass,practicalPhase}={}){
  if(signal?.aborted)throw cancelled();
  if(accelerated&&(allStages||(!practicalPhase&&['ergo-tie','weight','count','unpriced','price'].includes(searchClass)))){
   try{
    const response=await fetcher(new URL('./api/solve',import.meta.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,settings,incumbent}),signal:timeout(35000)});
    if(!response.ok)throw new Error('Accelerated optimizer unavailable.');
    const answer=await response.json();
    if(!answer||!['Optimal','Infeasible','Time limit reached','Time limit'].includes(answer.Status)||!answer.Columns||typeof answer.Columns!=='object'||Array.isArray(answer.Columns))throw new Error('Invalid accelerated optimizer result.');
    if(answer.Status==='Optimal'&&(!Number.isFinite(answer.ObjectiveValue)||Math.round(answer.Columns.x0?.Primal??0)!==1||!Object.values(answer.Columns).every(c=>c&&Number.isFinite(c.Primal))))throw new Error('Invalid accelerated optimizer assignment.');
    incumbent=answer;return answer;
   }catch{
    if(signal?.aborted)throw cancelled();
    accelerated=false;progress('Continuing with the standard optimizer …');
   }
  }
  return engine.solve(text,settings);
 }};
}
