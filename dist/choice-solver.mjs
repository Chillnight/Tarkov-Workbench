// Author: CA
import {createProblem} from './optimizer.mjs';
import {compatibleChoice} from './attachment-choices.mjs';
export const nativeChoiceCandidate=edges=>Number.isSafeInteger(edges)&&edges>=2000;
function cancelled(){const error=new Error('Compatibility check cancelled.');error.name='AbortError';return error;}
export async function createChoiceSolver(catalog,options,loadStandard,{edgeCount=0,fetcher=globalThis.fetch,signal}={}){
 let accelerated=false,standard;
 const timeout=ms=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
 const fallback=()=>standard??=Promise.resolve().then(loadStandard);
 if(signal?.aborted)throw cancelled();
 if(nativeChoiceCandidate(edgeCount)){
  try{const response=await fetcher(new URL('./api/solver',import.meta.url),{signal:timeout(1500)});
   if(response.ok){const capability=await response.json();accelerated=capability.protocol===1&&capability.available===true&&capability.allStages===true&&capability.choiceWorkers>0;}
  }catch{if(signal?.aborted)throw cancelled();}
 }
 if(!accelerated)await fallback();
 return {async check(selection){
  if(signal?.aborted)throw cancelled();
  if(accelerated){
   try{
    const problem=createProblem(catalog,selection);
    const response=await fetcher(new URL('./api/solve',import.meta.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'choice',text:problem.lp('feasibility'),settings:{}}),signal:timeout(12000)});
    if(!response.ok)throw new Error('Accelerated compatibility check unavailable.');
    const answer=await response.json();
    if(!answer||!['Optimal','Infeasible','Time limit reached','Time limit'].includes(answer.Status)||!answer.Columns||typeof answer.Columns!=='object'||Array.isArray(answer.Columns))throw new Error('Invalid compatibility response.');
    if(answer.Status==='Optimal'){
     if(answer.ObjectiveValue!==0||Math.round(answer.Columns.x0?.Primal??0)!==1||!Object.values(answer.Columns).every(c=>c&&Number.isFinite(c.Primal)))throw new Error('Invalid compatibility assignment.');
     return 'compatible';
    }
    return answer.Status==='Infeasible'?'incompatible':'unchecked';
   }catch{if(signal?.aborted)throw cancelled();accelerated=false;}
  }
  return compatibleChoice(catalog,selection,await fallback());
 }};
}
