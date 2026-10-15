// Author: CA
import test from 'node:test';import assert from 'node:assert/strict';import loadHighs from 'highs';
import {createBuildSolver} from '../dist/build-solver.mjs';
import {compareCategory,compareCategoryAsync} from '../dist/category-comparison.mjs';
const part=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],category:'Mod',categories:[],ergo:1,recoil:0,weight:.1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],...extra});
const slot=(id,allowed)=>({id,key:id,name:id,allowed,required:true,missing:[]});
const base={weaponId:'w',mode:'balanced',sound:'unsilenced',balance:75,magazine:0,restrictTraders:false};
function catalog(count=1){const items=Object.fromEntries(Array.from({length:count},(_,i)=>['p'+i,part('p'+i)]));items.w=part('w',{types:['gun'],category:'Assault rifle',ergo:40,vertical:100,horizontal:200,slots:[slot('part',Object.keys(items))]});return {items};}
const big=catalog(2000),small=catalog(),answer={Status:'Optimal',ObjectiveValue:1,Columns:{x0:{Primal:1}}};
const response=body=>({ok:true,json:async()=>body});
test('small graphs use the existing engine without any native request',async()=>{
 let calls=0;const solver=await createBuildSolver(small,base,{solve(){calls++;return answer;}},()=>{},{fetcher:()=>{throw Error('Unexpected request');}});assert.equal(await solver.solve('model',{}),answer);assert.equal(calls,1);
});
test('CP-SAT covers every stage and forwards only the previous response as a hint',async()=>{
 const payloads=[];const fetcher=async(url,init)=>{if(url.pathname.endsWith('/solver'))return response({protocol:1,available:true,allStages:true});payloads.push(JSON.parse(init.body));return response(answer);};
 const solver=await createBuildSolver(big,{...base,mode:'recoil'},{solve(){throw Error('Unexpected fallback');}},()=>{},{fetcher});
 await solver.solve('first',{}, {searchClass:'recoil',practicalPhase:false});await solver.solve('second',{}, {searchClass:'profile',practicalPhase:true});assert.equal(payloads[0].incumbent,undefined);assert.deepEqual(payloads[1].incumbent,answer);
});
test('malformed native results trigger one permanent fallback for the current build',async()=>{
 let native=0,local=0;const messages=[],fetcher=async url=>url.pathname.endsWith('/solver')?response({protocol:1,available:true,allStages:true}):(native++,response({Status:'Optimal',ObjectiveValue:0,Columns:{}}));
 const solver=await createBuildSolver(big,base,{solve(){local++;return answer;}},m=>messages.push(m),{fetcher});await solver.solve('first',{}, {searchClass:'ergo'});await solver.solve('second',{}, {searchClass:'price'});assert.equal(native,1);assert.equal(local,2);assert.equal(messages.length,1);
});
test('legacy native mode keeps recoil on the standard engine',async()=>{
 let local=0,requests=0;const solver=await createBuildSolver(big,{...base,mode:'recoil'},{solve(){local++;return answer;}},()=>{},{fetcher:async()=>{requests++;return response({protocol:1,available:true,allStages:false});}});await solver.solve('model',{}, {searchClass:'weight'});assert.equal(requests,1);assert.equal(local,1);
});
test('a cancelled capability request never starts a fallback calculation',async()=>{
 const controller=new AbortController();await assert.rejects(createBuildSolver(big,base,{solve(){throw Error('Unexpected fallback');}},()=>{},{signal:controller.signal,fetcher:async()=>{controller.abort();throw Error('aborted');}}),{name:'AbortError'});
});
test('synchronous and asynchronous category comparison preserve ranking, failures and selections',async()=>{
 const engine=await loadHighs(),c=catalog();c.items.v={...c.items.w,id:'v',name:'v',shortName:'v',ergo:30};
 const clean=r=>JSON.parse(JSON.stringify(r,(key,value)=>key==='seconds'?undefined:value));
 for(const mode of ['ergo','recoil','balanced'])for(const sound of ['silenced','unsilenced'])for(const fail of [false,true]){
  const options={...base,category:'Assault rifle',mode,sound},sync={solve:engine.solve.bind(engine)},factory=selection=>({solve:async(...args)=>{if(fail&&selection.weaponId==='v')throw Error('Deliberate fixture error');return sync.solve(...args);}});
  const expected=fail?null:compareCategory(c,options,sync);
  const actual=await compareCategoryAsync(c,options,factory);if(!fail)assert.deepEqual(clean(actual),clean(expected));else{assert.ok(actual.excluded.some(e=>e.weaponId==='v'&&e.status==='error'));assert.equal(actual.checked,actual.total);assert.equal(actual.completeRanking,false);}
 }
});
