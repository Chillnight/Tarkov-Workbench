// Author: CA
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {parseLP,assignment,zeroProof} from '../dist/solver-model.mjs';
import {encodeModel,parseCPResponse,createNativeCP} from '../desktop/native-cp.mjs';
import {createNativeService} from '../desktop/native-service.mjs';
import {optimizeAsync} from '../dist/optimizer.mjs';
const executable=fileURLToPath(new URL('../desktop/cp-solver/sat_runner.exe',import.meta.url));
const lp=`Minimize\n obj: + 0.1 x0 + 0.2 x1\nSubject To\n c0: x0 + x1 >= 1\nBinary\nx0 x1\nEnd`;
test('integer encoding preserves decimal direction and rejects numeric overflow',()=>{
 const model=parseLP(lp),encoded=encodeModel(model,null);assert.match(encoded.text,/coeffs: 1.*coeffs: 2/);
 const constraint=rhs=>parseLP(lp.replace('x0 + x1 >= 1','+ 0.1 x0 <= '+rhs));
 assert.match(encodeModel(constraint('0.09999999')).text,/domain: 0 }/);assert.match(encodeModel(constraint('-0.00000001')).text,/domain: -1 }/);
 assert.throws(()=>encodeModel({...model,objective:[[9000000000000000,'x0'],[0.00000001,'x1']]}),/safe integer/);
});
test('response parser preserves partial and unknown statuses and rejects missing or invalid assignments',()=>{
 const m=parseLP(lp),names=Object.keys(m.bounds);
 assert.equal(parseCPResponse('status: FEASIBLE\nsolution: 1\nsolution: 0\n',m,names).Status,'Time limit reached');
 assert.equal(parseCPResponse('status: UNKNOWN\n',m,names).ObjectiveValue,undefined);
 assert.equal(parseCPResponse('status: INFEASIBLE\n',m,names).Status,'Infeasible');
 for(const text of ['status: OPTIMAL\nsolution: 1\n','status: OPTIMAL\nsolution: 0\nsolution: 0\n','status: BAD\n'])assert.throws(()=>parseCPResponse(text,m,names));
});
test('native service distinguishes CP-SAT from legacy and unavailable runtime paths',async()=>{
 const cp=createNativeService({cpExecutable:executable,cpuThreads:16}),old=createNativeService({executable:fileURLToPath(new URL('../desktop/native-solver/highs.exe',import.meta.url)),cpuThreads:16}),small=createNativeService({cpExecutable:executable,cpuThreads:4});
 try{assert.equal((await cp.capabilities()).allStages,true);assert.equal((await old.capabilities()).allStages,false);assert.equal((await small.capabilities()).available,false);assert.equal((await cp.solve({text:lp})).Status,'Optimal');await assert.rejects(cp.solve({text:lp,settings:{presolve:'unsafe'}}),/Invalid presolve/);}finally{cp.close();old.close();small.close();}
});
test('pre-cancelled work starts no process and cancellation releases the owned helper',async()=>{
 const pre=new AbortController();pre.abort();await assert.rejects(createNativeCP({executable,signal:pre.signal}),{name:'AbortError'});
 const controller=new AbortController();let spawned;const solver=await createNativeCP({executable,signal:controller.signal,onSpawn:pid=>{spawned=pid;controller.abort();}});
 try{await assert.rejects(solver.solve(lp),{name:'AbortError'});assert.ok(spawned);assert.throws(()=>process.kill(spawned,0));}finally{await solver.dispose();}
 const next=await createNativeCP({executable});try{const r=await next.solve(lp);assert.equal(r.Status,'Optimal');assert.ok(assignment(parseLP(lp),r));}finally{await next.dispose();}
});
test('aborting a request at the service boundary permits a subsequent solve',async()=>{
 const service=createNativeService({cpExecutable:executable,cpuThreads:16}),controller=new AbortController();controller.abort();try{await assert.rejects(service.solve({text:lp},{signal:controller.signal}),{name:'AbortError'});assert.equal((await service.solve({text:lp})).Status,'Optimal');}finally{service.close();}
});
test('analytical stage proofs cannot promote a previous incomplete build to optimal',async()=>{
 const item=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],categories:[],category:'Mod',ergo:0,recoil:0,weight:0,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],...extra});
 const catalog={items:{w:item('w',{types:['gun'],vertical:100,horizontal:200,ergo:40})}},options={weaponId:'w',mode:'recoil',sound:'unsilenced',balance:75,magazine:0};let calls=0;
 const result=await optimizeAsync(catalog,options,{async solve(text){calls++;const m=parseLP(text),Columns=Object.fromEntries(Object.keys(m.bounds).map(v=>[v,{Primal:v==='x0'?1:0}]));return {Status:calls===1?'Time limit reached':'Optimal',Columns,ObjectiveValue:0};}});
 assert.equal(result.status,'feasible');
});
