// Author: CA
import test from 'node:test';import assert from 'node:assert/strict';
import loadHighs from '../dist/vendor/highs.mjs';
import {createChoiceSolver,nativeChoiceCandidate} from '../dist/choice-solver.mjs';
import {createNativeService} from '../desktop/native-service.mjs';
import {createNativeCP} from '../desktop/native-cp.mjs';
import {fileURLToPath} from 'node:url';
const engine=await loadHighs();
const item=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],categories:[],category:'Mod',ergo:0,recoil:0,weight:0,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],...extra});
const catalog={items:{w:item('w',{types:['gun'],vertical:100,horizontal:200,ergo:40})}},options={weaponId:'w',mode:'ergo',sound:'unsilenced',magazine:0,balance:80};
const capability=()=>Response.json({protocol:1,available:true,allStages:true,choiceWorkers:8});
const native=fileURLToPath(new URL('../desktop/cp-solver/sat_runner.exe',import.meta.url));
test('small choice models stay on HiGHS without a native probe',async()=>{
 assert.equal(nativeChoiceCandidate(1999),false);assert.equal(nativeChoiceCandidate(2000),true);assert.equal(nativeChoiceCandidate(NaN),false);
 let loaded=0;const solver=await createChoiceSolver(catalog,options,()=>{loaded++;return engine;},{edgeCount:1999,fetcher:()=>{throw Error('Unexpected native request');}});
 assert.equal(await solver.check(options),'compatible');assert.equal(loaded,1);
});
test('large choices use the compatibility request and load no HiGHS runtime',async()=>{
 let loads=0,calls=0;const solver=await createChoiceSolver(catalog,options,()=>{loads++;return engine;},{edgeCount:2000,fetcher:async(url,request)=>{
  calls++;if(String(url).endsWith('/api/solver'))return capability();const body=JSON.parse(request.body);assert.equal(body.purpose,'choice');return Response.json(engine.solve(body.text,{output_flag:false}));
 }});assert.equal(await solver.check(options),'compatible');assert.equal(loads,0);assert.equal(calls,2);
});
test('legacy capability and failed native requests retain the standard path',async()=>{
 for(const failure of ['legacy','request','assignment']){
  let loads=0;const solver=await createChoiceSolver(catalog,options,()=>{loads++;return engine;},{edgeCount:2000,fetcher:async url=>{
   if(String(url).endsWith('/api/solver'))return failure==='legacy'?Response.json({protocol:1,available:true}):capability();
   if(failure==='request')throw Error('Backend failed');return Response.json({Status:'Optimal',ObjectiveValue:0,Columns:{}});
  }});assert.equal(await solver.check(options),'compatible');assert.equal(await solver.check(options),'compatible');assert.equal(loads,1);
 }
});
test('only proved infeasibility hides a choice and a timeout stays unchecked',async()=>{
 for(const [status,expected]of [['Infeasible','incompatible'],['Time limit reached','unchecked']]){
  const solver=await createChoiceSolver(catalog,options,()=>{throw Error('Unexpected fallback');},{edgeCount:2000,fetcher:async url=>String(url).endsWith('/api/solver')?capability():Response.json({Status:status,Columns:{}})});
  assert.equal(await solver.check(options),expected);
 }
});
test('cancellation never starts the fallback or a replacement request',async()=>{
 const before=new AbortController();before.abort();await assert.rejects(createChoiceSolver(catalog,options,()=>engine,{signal:before.signal}),{name:'AbortError'});
 const during=new AbortController();let loads=0;
 const solver=await createChoiceSolver(catalog,options,()=>{loads++;return engine;},{edgeCount:2000,signal:during.signal,fetcher:async url=>{
  if(String(url).endsWith('/api/solver'))return capability();during.abort();throw Error('Aborted');
 }});await assert.rejects(solver.check(options),{name:'AbortError'});assert.equal(loads,0);
});
test('native compatibility pool is bounded and released after completion',async()=>{
 const service=createNativeService({cpExecutable:native,cpuThreads:16}),text='Minimize\n obj: 0 x0\nSubject To\n c0: x0 = 1\nBinary\nx0\nEnd';
 try{
  assert.equal((await service.capabilities()).choiceWorkers,8);
  const results=await Promise.allSettled(Array.from({length:9},()=>service.solve({text,purpose:'choice'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,8);assert.equal(results.filter(r=>r.status==='rejected'&&/busy/.test(r.reason.message)).length,1);
  for(const r of results)if(r.status==='fulfilled')assert.equal(r.value.Status,'Optimal');
  assert.equal((await service.solve({text})).Status,'Optimal');
  const aborted=new AbortController();aborted.abort();await assert.rejects(service.solve({text,purpose:'choice'},{signal:aborted.signal}),{name:'AbortError'});
  assert.equal((await service.solve({text,purpose:'choice'})).Status,'Optimal');
  await assert.rejects(service.solve({text,purpose:'other'}),/Invalid optimization purpose/);
 }finally{service.close();}
});
test('invalid native time and linearization settings are rejected before spawning',async()=>{
 for(const extra of [{timeLimit:0},{timeLimit:31},{linearization:3}])await assert.rejects(createNativeCP({executable:native,...extra}),/Invalid optimizer limits/);
});
