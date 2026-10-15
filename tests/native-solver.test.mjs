// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import loadHighs from 'highs';
import {optimize,optimizeAsync,validateBuild,createProblem} from '../dist/optimizer.mjs';
import {useNativeBuildSearch} from '../dist/build-execution.mjs';
import {TRADERS} from '../dist/traders.mjs';
import {createNativeService,nativeResponse,trustedNativeOrigin,NATIVE_MODEL_LIMIT} from '../desktop/native-service.mjs';
import {createNativeSearch,parseNativeSolution} from '../desktop/native-search.mjs';
const executable=fileURLToPath(new URL('../desktop/native-solver/highs.exe',import.meta.url));
const nativeAvailable=process.platform==='win32'&&existsSync(executable);
const toy='Minimize\n obj: 2 x + 3 z\nSubject To\n c1: x + z >= 4.5\nBounds\n x <= 10\n z <= 10\nGeneral\n z\nEnd';
const slot=(id,allowed,required=false,key=id)=>({id,name:id,key,allowed,required,missing:[]});
const part=(id,ergo=0,recoil=0,slots=[],extra={})=>({id,name:id,shortName:id,ergo,recoil,slots,types:['mods'],category:'Mod',categories:[],conflicts:[],conflictCategories:[],blockedSlots:[],weight:.1,suppressor:false,...extra});
const fixture=()=>({items:{w:part('w',40,0,[slot('grip',['e','r','b'],true),slot('muzzle',['adapter']),slot('rail',['scope']),slot('mag',['m10','m30'],false,'mod_magazine')],{types:['gun'],vertical:100,horizontal:200}),e:part('e',20,0,[],{conflicts:['scope']}),r:part('r',-20,-.3),b:part('b',10,-.15),adapter:part('adapter',-1,-.01,[slot('silencer',['silencer'])]),silencer:part('silencer',-10,-.1,[],{suppressor:true}),scope:part('scope',-2,0,[],{optic:true,category:'Scope'}),m10:part('m10',2,0,[],{capacity:10,category:'Magazine'}),m30:part('m30',-2,0,[],{capacity:30,category:'Magazine'})}});
const comparable=result=>JSON.parse(JSON.stringify(result,(key,value)=>key==='seconds'?undefined:value));
test('Native solution parsing preserves status, precise values and partial incumbents',()=>{
 const parsed=parseNativeSolution('Model status\nTime limit reached\n\n# Primal solution values\nFeasible\nObjective -12.3456789\n# Columns 2\nx0 1\nx1 0\n# Rows 1\nc0 1\n');
 assert.equal(parsed.Status,'Time limit reached');assert.equal(parsed.ObjectiveValue,-12.3456789);assert.equal(parsed.Columns.x0.Primal,1);assert.equal(parsed.Columns.c0,undefined);assert.throws(()=>parseNativeSolution('No model status'),/model status/);
});
test('The local native endpoint rejects foreign hosts and origins',()=>{
 assert.equal(trustedNativeOrigin('127.0.0.1:4206','http://127.0.0.1:4206',4206),true);assert.equal(trustedNativeOrigin('localhost:4206',undefined,4206),true);
 for(const [host,origin] of [['evil.test:4206','http://evil.test:4206'],['127.0.0.1:4206','https://evil.test'],['127.0.0.1:4206','null'],['127.0.0.1:4207',undefined]])assert.equal(trustedNativeOrigin(host,origin,4206),false);
});
test('HTTP transport requires bounded JSON and forwards the cancellation signal',async()=>{
 let calls=0;const fake={capabilities:async()=>({protocol:1,available:true}),async solve(payload,{signal}){calls++;assert.equal(payload.text,toy);assert.ok(signal instanceof AbortSignal);return {Status:'Optimal',Columns:{x0:{Primal:1}},ObjectiveValue:9};}};
 const request=(body,headers={'Content-Type':'application/json'})=>new Request('http://127.0.0.1:4206/api/solve',{method:'POST',headers,body});
 assert.equal((await nativeResponse(request('bad json'),fake)).status,400);assert.equal((await nativeResponse(request('{}',{'Content-Type':'text/plain'}),fake)).status,400);assert.equal(calls,0);
 assert.equal((await nativeResponse(request(JSON.stringify({text:toy})),fake)).status,200);assert.equal(calls,1);
 assert.equal((await nativeResponse(new Request('http://127.0.0.1:4206/api/solve'),fake)).status,405);
});
test('Missing native executable and invalid models fail without starting a process',async()=>{
 const service=createNativeService({executable:executable+'.missing',cpuThreads:16});assert.equal((await service.capabilities()).available,false);
 await assert.rejects(service.solve({text:'invalid'}),/Invalid optimization/);await assert.rejects(service.solve({text:'Minimize '+ 'x'.repeat(NATIVE_MODEL_LIMIT)}),/Invalid optimization/);await assert.rejects(service.solve({text:toy}),/unavailable/);service.close();
});
test('The shared async driver preserves every stage model and result across constrained builds',async()=>{
 const engine=await loadHighs(),catalog=fixture();
 for(const mode of ['ergo','balanced','recoil'])for(const sound of ['silenced','unsilenced'])for(const extra of [{},{scopeId:'scope',magazineId:'m30',magazine:30},{balance:95},{preferLighterParts:false}]){
  const options={weaponId:'w',mode,sound,balance:80,magazine:0,...extra},models=[],asyncModels=[];
  const expected=optimize(catalog,options,{solve(text,settings){models.push({text,settings});return engine.solve(text,settings);}});
  const actual=await optimizeAsync(catalog,options,{async solve(text,settings){asyncModels.push({text,settings});return engine.solve(text,settings);}});
  assert.deepEqual(asyncModels,models);assert.deepEqual(comparable(actual),comparable(expected));if(actual.rows)assert.deepEqual(validateBuild(catalog,options,actual.rows),[]);
 }
});
test('Native searches agree with the complete optimizer for scope, magazine and global conflicts', {skip:!nativeAvailable},async()=>{
 const engine=await loadHighs(),catalog=fixture(),service=createNativeService({executable,cpuThreads:16});
 try{for(const mode of ['ergo','balanced','recoil'])for(const sound of ['silenced','unsilenced']){
  const options={weaponId:'w',mode,sound,balance:75,magazine:30,scopeId:'scope',magazineId:'m30'},expected=optimize(catalog,options,engine);
  const actual=await optimizeAsync(catalog,options,{solve:(text,settings)=>service.solve({text,settings})});
  assert.equal(actual.status,'optimal');for(const key of ['ergo','recoil','weight'])assert.ok(Math.abs(actual[key]-expected[key])<1e-5,key);
  assert.deepEqual(validateBuild(catalog,options,actual.rows),[]);assert.ok(actual.rows.some(r=>r.itemId==='scope'));assert.ok(actual.rows.some(r=>r.itemId==='m30'));assert.ok(!actual.rows.some(r=>r.itemId==='e'));
 }}finally{service.close();}
});
test('Cancelling a native stage releases its processes and allows another calculation', {skip:!nativeAvailable},async()=>{
 const controller=new AbortController(),search=await createNativeSearch({executable,workers:4,threads:2,signal:controller.signal});
 try{controller.abort();await assert.rejects(search.solve(toy,{}),{name:'AbortError'});}finally{await search.dispose();}
 const service=createNativeService({executable,cpuThreads:16});try{const answer=await service.solve({text:toy});assert.equal(answer.Status,'Optimal');assert.ok(Math.abs(answer.ObjectiveValue-9)<1e-5);}finally{service.close();}
});

test('Native acceleration targets the measured slow weapon graphs while fast controls and recoil stay serial',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
 const base={sound:'silenced',mode:'balanced',balance:80,magazine:30,scopeId:null,magazineId:null,maxBudget:null,excludeArenaUnlocks:true,allowGrenadeLaunchers:false,restrictTraders:true,includeQuestOffers:true,includeBarters:true,includeFleaMarket:true,traderLevels:Object.fromEntries(TRADERS.map(t=>[t.id,t.name==='Ref'?3:4]))};
 for(const [name,expected] of [['M4A1',true],['ADAR 2-15',true],['TX-15 DML',true],['M16A1',true],['M16A2',true],['NL545 DI',false],['HK 416A5',false]]){
  const weapon=Object.values(catalog.items).find(i=>i.types.includes('gun')&&i.shortName===name);assert.ok(weapon,name);
  const problem=createProblem(catalog,{...base,weaponId:weapon.id});assert.equal(useNativeBuildSearch('balanced',problem.edges.length),expected,name);assert.equal(useNativeBuildSearch('ergo',problem.edges.length),expected,name);assert.equal(useNativeBuildSearch('recoil',problem.edges.length),false,name);
 }
});
