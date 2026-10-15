// Author: CA
import {stat} from 'node:fs/promises';
import {availableParallelism} from 'node:os';
import {createNativeSearch} from './native-search.mjs';
import {createNativeCP} from './native-cp.mjs';
export const NATIVE_MODEL_LIMIT=8*1024*1024;
const REQUEST_LIMIT=16*1024*1024;
async function readPayload(request){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('Expected JSON.');
 if(Number(request.headers.get('content-length'))>REQUEST_LIMIT)throw new Error('Request is too large.');
 const reader=request.body?.getReader();if(!reader)throw new Error('Missing optimization model.');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>REQUEST_LIMIT){await reader.cancel();throw new Error('Request is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function nativeResponse(request,service){
 const path=new URL(request.url).pathname;
 if(path==='/api/solver'&&request.method==='GET')return Response.json(await service.capabilities(),{headers:{'Cache-Control':'no-store'}});
 if(path!=='/api/solve'||request.method!=='POST')return new Response('Method not allowed',{status:405});
 let payload;try{payload=await readPayload(request);}catch{return Response.json({error:'Invalid optimization request.'},{status:400});}
 try{return Response.json(await service.solve(payload,{signal:request.signal}),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Accelerated optimizer unavailable.'},{status:503});}
}
export function trustedNativeOrigin(host,origin,port){
 const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
 return hosts.has(host)&&(!origin||origin===`http://${host}`);
}
export function createNativeService({executable,cpExecutable,cpuThreads=availableParallelism(),platform=process.platform}={}){
 const workers=Math.max(1,Math.min(4,Math.floor(cpuThreads/4))),threads=2,active=new Set();let busy=false,choiceActive=0;
 async function capabilities(){
  let exists=false,cpExists=false;try{exists=(await stat(executable)).isFile();}catch{}
  try{if(cpExecutable)cpExists=(await stat(cpExecutable)).isFile();}catch{}
  const cp=platform==='win32'&&cpuThreads>=8&&cpExists;
  return {protocol:1,available:cp||(platform==='win32'&&workers>=2&&exists),workers:cp?8:workers,threads:cp?1:threads,engine:cp?'OR-Tools CP-SAT 9.15.6755':'HiGHS 1.15.1',allStages:cp,choiceWorkers:cp?Math.max(1,Math.min(8,Math.floor(cpuThreads/2))):0};
 }
 async function solve(payload,{signal}={}){
  if(!payload||typeof payload.text!=='string'||payload.text.length>NATIVE_MODEL_LIMIT||!/^\s*(?:Minimize|Maximize)\b/.test(payload.text))throw new Error('Invalid optimization model.');
  if(payload.settings!==undefined&&(payload.settings===null||typeof payload.settings!=='object'||Array.isArray(payload.settings)))throw new Error('Invalid solver settings.');
  if(payload.settings?.presolve!==undefined&&!['on','off','choose'].includes(payload.settings.presolve))throw new Error('Invalid presolve option.');
  if(payload.purpose!==undefined&&payload.purpose!=='choice')throw new Error('Invalid optimization purpose.');
  const choice=payload.purpose==='choice',capability=await capabilities();
  if(choice&&!capability.allStages)throw new Error('Accelerated compatibility checks are unavailable.');
  if(!capability.available)throw new Error('The accelerated optimizer is unavailable.');
  if(busy||(choice?choiceActive>=capability.choiceWorkers:choiceActive>0))throw new Error('The accelerated optimizer is busy.');if(choice)choiceActive++;else busy=true;
  const controller=new AbortController(),abort=()=>controller.abort();active.add(controller);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const deadline=setTimeout(abort,choice?10000:35000);let solver;
  try{solver=capability.allStages?await createNativeCP({executable:cpExecutable,workers:choice?1:8,timeLimit:choice?5:30,linearization:choice?0:undefined,signal:controller.signal}):await createNativeSearch({executable,workers,threads,signal:controller.signal});return await solver.solve(payload.text,payload.settings,payload.incumbent);}
  finally{try{await solver?.dispose();}finally{clearTimeout(deadline);signal?.removeEventListener('abort',abort);active.delete(controller);if(choice)choiceActive--;else busy=false;}}
 }
 function close(){for(const controller of active)controller.abort();}
 return {capabilities,solve,close};
}
