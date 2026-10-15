// Author: CA
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
function cancelled(){const error=new Error('Build calculation cancelled.');error.name='AbortError';return error;}
export function parseNativeSolution(text){
 const lines=text.replaceAll('\r','').split('\n'),statusAt=lines.indexOf('Model status');
 if(statusAt<0)throw new Error('The native optimizer did not return a model status.');
 const Status=lines[statusAt+1]?.trim(),objective=lines.find(line=>line.startsWith('Objective ')),Columns={};let reading=false;
 for(const line of lines){if(line.startsWith('# Columns')){reading=true;continue;}if(reading&&line.startsWith('#'))break;if(reading&&line.trim()){const [name,value]=line.trim().split(/\s+/);Columns[name]={Primal:Number(value)};}}
 return {Status,ObjectiveValue:objective?Number(objective.slice(10)):undefined,Columns};
}
export async function createNativeSearch({executable,workers=4,threads=2,signal,onAttempt=()=>{}}){
 const parent=resolve(tmpdir()),root=await mkdtemp(join(parent,'tarkov-workbench-solver-')),active=new Set();
 let disposed=false,tasks=[],rejectCurrent;
 const abort=()=>{disposed=true;for(const child of active)child.kill();rejectCurrent?.(cancelled());};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 async function solve(text,settings={}){
  if(disposed)throw cancelled();if(tasks.length)throw new Error('The native stage is already running.');
  const model=join(root,'model.lp');await writeFile(model,text);if(disposed)throw cancelled();
  const seeds=[0,1,17,42];
  tasks=Array.from({length:Math.max(1,Math.min(4,workers))},async(_,index)=>{
   const options=join(root,`search-${index}.options`),solution=join(root,`search-${index}.sol`);
   const values={output_flag:false,time_limit:30,mip_rel_gap:0,mip_abs_gap:0,...(settings.presolve==='off'?{presolve:'off'}:{}),parallel:threads>1?'on':'off',threads,random_seed:seeds[index],write_solution_to_file:true,write_solution_style:0};
   await writeFile(options,Object.entries(values).map(([key,value])=>`${key} = ${value}`).join('\n'));if(disposed)throw cancelled();
   return new Promise((resolveAttempt,rejectAttempt)=>{
    const started=performance.now(),child=spawn(executable,[model,`--options_file=${options}`,`--solution_file=${solution}`],{windowsHide:true,stdio:['ignore','pipe','pipe']});active.add(child);let output='';
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-8192);});
    child.on('error',error=>{active.delete(child);rejectAttempt(error);});
    child.on('close',async code=>{active.delete(child);try{if(disposed)throw cancelled();if(code!==0)throw new Error(`Native optimizer exit ${code}: ${output}`);const result=parseNativeSolution(await readFile(solution,'utf8'));onAttempt({seed:seeds[index],threads,status:result.Status,ms:performance.now()-started});resolveAttempt(result);}catch(error){rejectAttempt(error);}});
   });
  });
  return new Promise((resolveStage,rejectStage)=>{
   let pending=tasks.length,settled=false;const results=[],errors=[];
   rejectCurrent=error=>{if(settled)return;settled=true;rejectStage(error);};
   for(const task of tasks)task.then(result=>{
    if(settled)return;
    if(result.Status==='Optimal'||result.Status==='Infeasible'){settled=true;for(const child of active)child.kill();resolveStage(result);return;}
    results.push(result);
   }).catch(error=>{errors.push(error);}).finally(()=>{
    if(--pending||settled)return;settled=true;
    if(disposed){rejectStage(cancelled());return;}
    const usable=results.filter(r=>/limit/i.test(r.Status)&&Number.isFinite(r.ObjectiveValue)&&r.Columns&&Math.round(r.Columns.x0?.Primal??0)===1&&Object.values(r.Columns).every(c=>Number.isFinite(c.Primal)));
    const minimizing=!/^\s*Maximize\b/i.test(text);usable.sort((a,b)=>minimizing?a.ObjectiveValue-b.ObjectiveValue:b.ObjectiveValue-a.ObjectiveValue);
    if(usable.length||results.length)resolveStage(usable[0]??results[0]);else rejectStage(errors[0]??new Error('The native optimizer could not calculate this stage.'));
   });
  });
 }
 async function dispose(){
  abort();signal?.removeEventListener('abort',abort);await Promise.allSettled(tasks);
  // Only remove the private temporary directory created by this instance.
  if(dirname(resolve(root))!==parent||!basename(root).startsWith('tarkov-workbench-solver-'))throw new Error('Unexpected solver temporary directory.');
  await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});
 }
 return {solve,dispose};
}
