// Author: CA
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {spawn} from 'node:child_process';
import {parseLP,rational,objective,assignment} from '../dist/solver-model.mjs';
const limit=(1n<<63n)-1n,abs=n=>n<0n?-n:n,gcd=(a,b)=>b?gcd(b,a%b):a;
const floor=(n,d)=>n/d-(n<0n&&n%d?1n:0n),ceil=(n,d)=>n/d+(n>0n&&n%d?1n:0n);
function cancelled(){const error=new Error('Build calculation cancelled.');error.name='AbortError';return error;}
export function scaleTerms(terms){
 const parsed=terms.map(([c,v])=>[...rational(c),v]),scale=parsed.reduce((s,[,d])=>s>d?s:d,1n);
 const ints=parsed.map(([n,d,v])=>[n*(scale/d),v]),divisor=ints.reduce((g,[n])=>gcd(g,abs(n)),0n)||1n;
 return {terms:ints.map(([n,v])=>[n/divisor,v]),scale,divisor};
}
export function encodeModel(model,hints){
 const names=Object.keys(model.bounds),indices=new Map(names.map((v,i)=>[v,i]));
 const fields=terms=>terms.map(([n,v])=>`vars: ${indices.get(v)} coeffs: ${n}`).join(' ');
 const check=terms=>{
  const magnitude=terms.reduce((sum,[n,v])=>sum+abs(n)*BigInt(Math.max(Math.abs(model.bounds[v].lb),Math.abs(model.bounds[v].ub))),0n);
  if(magnitude>=(1n<<61n))throw new Error('The model exceeds the safe integer range.');
 };
 const rows=model.rows.map(row=>{
  const scaled=scaleTerms(row.terms),[n,d]=rational(row.rhs),rn=n*scaled.scale,rd=d*scaled.divisor;check(scaled.terms);
  let low=-limit,high=limit;
  if(row.op==='<=')high=floor(rn,rd);else if(row.op==='>=')low=ceil(rn,rd);
  else{if(rn%rd)return 'constraints { bool_or {} }';low=high=rn/rd;}
  if(low < -limit || high > limit)throw new Error('The constraint exceeds the safe integer range.');
  return `constraints { linear { ${fields(scaled.terms)} domain: ${low} domain: ${high} } }`;
 });
 const scaled=scaleTerms(model.objective);check(scaled.terms);
 const terms=model.maximize?scaled.terms.map(([n,v])=>[-n,v]):scaled.terms;
 return {names,text:[...names.map(v=>`variables { name: ${JSON.stringify(v)} domain: ${model.bounds[v].lb} domain: ${model.bounds[v].ub} }`),...rows,`objective { ${fields(terms)} }`,hints?`solution_hint { ${names.map(v=>`vars: ${indices.get(v)} values: ${hints[v]}`).join(' ')} }`:''].join('\n')};
}
export function parseCPResponse(text,model,names){
 const status=text.match(/^status:\s*(\w+)/m)?.[1];
 if(!['OPTIMAL','FEASIBLE','INFEASIBLE','UNKNOWN','MODEL_INVALID'].includes(status))throw new Error('Missing optimizer status.');
 const values=[...text.matchAll(/^solution:\s*(-?\d+)\s*$/gm)].map(m=>Number(m[1])),known=['OPTIMAL','FEASIBLE'].includes(status);
 if(known&&(values.length!==names.length||!values.every(Number.isSafeInteger)))throw new Error('Incomplete optimizer assignment.');
 const selected=known?Object.fromEntries(names.map((v,i)=>[v,values[i]])):{};
 const result={Status:status==='OPTIMAL'?'Optimal':status==='INFEASIBLE'?'Infeasible':status==='MODEL_INVALID'?'Model error':'Time limit reached',Columns:Object.fromEntries(Object.entries(selected).map(([v,Primal])=>[v,{Primal}])),ObjectiveValue:known?objective(model,selected):undefined};
 if(known&&!assignment(model,result))throw new Error('The accelerated result does not satisfy the model.');
 return result;
}
export async function createNativeCP({executable,workers=8,signal,onSpawn=()=>{},timeLimit=30,linearization}){
 if(!Number.isInteger(workers)||workers<1||workers>8)throw new Error('Invalid optimizer worker count.');
 if(!Number.isInteger(timeLimit)||timeLimit<1||timeLimit>30||linearization!==undefined&&![0,1,2].includes(linearization))throw new Error('Invalid optimizer limits.');
 if(signal?.aborted)throw cancelled();
 const parent=resolve(tmpdir()),root=await mkdtemp(join(parent,'workbench-cpsat-'));let active,closed=false,pending;
 const abort=()=>{closed=true;active?.kill();};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 async function run(text,settings={},incumbent){
  if(closed)throw cancelled();
  const model=parseLP(text),hints=assignment(model,incumbent),encoded=encodeModel(model,hints),input=join(root,'model.pb.txt'),output=join(root,'response.txt');
  await writeFile(input,encoded.text);await rm(output,{force:true});if(closed)throw cancelled();
  await new Promise((resolveRun,reject)=>{
   let logs='',expired=false;
   const params=`num_workers:${workers} max_time_in_seconds:${timeLimit} absolute_gap_limit:0 relative_gap_limit:0 random_seed:0 log_search_progress:false${linearization!==undefined?` linearization_level:${linearization}`:workers<8?' linearization_level:2':''}${settings.presolve==='off'?' cp_model_presolve:false':''}`;
   active=spawn(executable,[`--input=${input}`,`--output=${output}`,`--params=${params}`],{windowsHide:true,stdio:['ignore','pipe','pipe']});const child=active;
   const timer=setTimeout(()=>{expired=true;child.kill();},(timeLimit+5)*1000);
   for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{logs=(logs+b).slice(-8192);});
   child.on('spawn',()=>{try{onSpawn(child.pid);}catch{}});
   child.on('error',error=>{clearTimeout(timer);active=null;reject(error);});
   child.on('close',code=>{clearTimeout(timer);active=null;if(closed)reject(cancelled());else if(expired)reject(new Error('The accelerated optimizer timed out.'));else if([0,10,20].includes(code))resolveRun();else reject(new Error(`Accelerated optimizer exit ${code}: ${logs}`));});
  });
  if(closed)throw cancelled();
  const response=await readFile(output,'utf8');if(closed)throw cancelled();return parseCPResponse(response,model,encoded.names);
 }
 function solve(text,settings,incumbent){
  if(closed)throw cancelled();if(pending)throw new Error('The optimizer is busy.');
  pending=run(text,settings,incumbent).finally(()=>{pending=null;});return pending;
 }
 async function dispose(){
  abort();signal?.removeEventListener('abort',abort);await pending?.catch(()=>{});
  if(dirname(resolve(root))!==parent||!basename(root).startsWith('workbench-cpsat-'))throw new Error('Unexpected optimizer temporary directory.');
  await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});
 }
 return {solve,dispose};
}
