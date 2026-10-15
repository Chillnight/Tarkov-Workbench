// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChoiceCache,attachmentCacheKey} from '../dist/choice-cache.mjs';
import {createChoiceQueue,choicePriority,recommendedChoiceWorkers} from '../dist/choice-queue.mjs';
import {isStaleCacheKey} from '../dist/storage.mjs';
const id=n=>n.toString(16).padStart(24,'0');
const candidates=[{id:id(1),name:'Alpha reflex',shortName:'Alpha',zoomLevels:[[1]],category:'Reflex sight'},{id:id(2),name:'Bravo scope',shortName:'Bravo',zoomLevels:[[1,6]],category:'Scope'},{id:id(3),name:'Charlie scope',shortName:'Charlie',zoomLevels:[[1,6]],category:'Scope'},{id:id(4),name:'Delta scope',shortName:'Delta',zoomLevels:[[4]],category:'Scope'}];
const options={weaponId:id(99),sound:'silenced',scopeId:null,magazineId:null,magazine:30,restrictTraders:true,includeBarters:true,includeQuestOffers:true,includeFleaMarket:true,traderLevels:{one:1,two:2},maxBudget:null};
function storeFixture(){const values=new Map();return {values,async get(key){return structuredClone(values.get(key));},async put(key,value){values.set(key,structuredClone(value));return true;},async remove(key){values.delete(key);}};}
function workersFixture(){
  const workers=[],tasks=[];
  function createWorker(){const worker={onmessage:null,onerror:null,stopped:false,postMessage(value){if(value.type==='check')tasks.push({worker,...value});},terminate(){this.stopped=true;},ready(){this.onmessage({data:{type:'ready'}});},finish(status='compatible'){const task=tasks.findLast(t=>t.worker===this);this.onmessage({data:{type:'choice',id:task.id,task:task.task,status}});}};workers.push(worker);return worker;}
  return {workers,tasks,createWorker};
}
test('Partial proofs survive a fresh cache instance; unchecked and malformed results are never retained',async()=>{
  const store=storeFixture(),key=attachmentCacheKey({meta:{version:'one'}},options,'scope');
  await createChoiceCache({store}).put(key,{[id(1)]:'compatible',[id(2)]:'incompatible',[id(3)]:'unchecked',invalid:'compatible'});
  const restarted=createChoiceCache({store});assert.deepEqual(await restarted.get(key),{[id(1)]:'compatible',[id(2)]:'incompatible'});
  const copy=await restarted.get(key);copy[id(4)]='compatible';assert.equal((await restarted.get(key))[id(4)],undefined);
});
test('Every availability, pin, budget, database and proof preference invalidates its own cache entry',()=>{
  const c={meta:{version:'one'}},key=attachmentCacheKey(c,options,'scope');
  for(const [field,value] of [['weaponId',id(44)],['sound','unsilenced'],['magazineId',id(50)],['magazine',0],['maxBudget',100],['restrictTraders',false],['includeBarters',false],['includeQuestOffers',false],['includeFleaMarket',false],['excludeArenaUnlocks',false],['allowGrenadeLaunchers',true],['preferLighterParts',false],['traderLevels',{one:4,two:2}]])assert.notEqual(key,attachmentCacheKey(c,{...options,[field]:value},'scope'),field);
  assert.notEqual(key,attachmentCacheKey({meta:{version:'two'}},options,'scope'));
  assert.equal(key,attachmentCacheKey(c,{...options,traderLevels:{two:2,one:1}},'scope'));
  assert.equal(key,attachmentCacheKey(c,{...options,scopeId:id(50)},'scope'));
  assert.equal(attachmentCacheKey(c,options,'magazine'),attachmentCacheKey(c,{...options,magazineId:id(50),magazine:60},'magazine'));
  assert.notEqual(attachmentCacheKey(c,options,'magazine'),attachmentCacheKey(c,{...options,scopeId:id(50)},'magazine'));
});
test('The proof cache remains bounded and storage write failures retain safe in-memory proofs',async()=>{
  const store=storeFixture(),cache=createChoiceCache({store,maxEntries:2});
  for(let i=1;i<=4;i++)await cache.put('choices:test:'+i,{[id(i)]:'compatible'});
  assert.equal((await store.get('choices:index')).length,2);assert.equal(store.values.has('choices:test:1'),false);
  const broken=createChoiceCache({store:{get:async()=>undefined,put:async()=>false}});await broken.put('choices:x',{[id(1)]:'compatible'});assert.deepEqual(await broken.get('choices:x'),{[id(1)]:'compatible'});
  const unavailable=createChoiceCache({store:{get:async()=>{throw Error('Storage unavailable');},put:async()=>false}});assert.deepEqual(await unavailable.get('choices:x'),{});
  store.values.set('choices:bad',{schema:999,records:{[id(1)]:'compatible'}});assert.deepEqual(await createChoiceCache({store}).get('choices:bad'),{});
});
test('Snapshot cleanup removes stale proof caches but preserves the index and user records',()=>{
  assert.equal(isStaleCacheKey('choices:old:data:selection','data','new'),true);
  assert.equal(isStaleCacheKey('choices:new:old:selection','data','new'),true);
  for(const key of ['choices:new:data:selection','choices:index','saved-build:personal','settings:trader'])assert.equal(isStaleCacheKey(key,'data','new'),false);
});
test('Filtered and searched candidates are scheduled ahead of unrelated choices, including after reprioritization',()=>{
  const fake=workersFixture(),updates=[];
  const queue=createChoiceQueue({catalog:{},options,kind:'scope',candidates,workerCount:1,createWorker:fake.createWorker,onUpdate:value=>updates.push(value)});
  queue.setView({filter:'1-6'});queue.start();fake.workers[0].ready();assert.equal(fake.tasks[0].id,id(2));
  queue.setView({query:'Delta',filter:'all'});fake.workers[0].finish();assert.equal(fake.tasks[1].id,id(4));
  fake.workers[0].finish('incompatible');fake.workers[0].finish();fake.workers[0].finish();
  assert.equal(updates.at(-1).done,true);assert.deepEqual(updates.at(-1).ids,[id(1),id(2),id(3)]);assert.equal(fake.workers[0].stopped,true);
});
test('Concurrent completions remain deterministic and no candidate is sent twice',()=>{
  const fake=workersFixture(),updates=[];
  const queue=createChoiceQueue({catalog:{},options,kind:'scope',candidates,workerCount:4,createWorker:fake.createWorker,onUpdate:value=>updates.push(value)});
  queue.start();for(const w of fake.workers)w.ready();
  for(const index of [3,1,0,2])fake.workers[index].finish();
  assert.deepEqual(updates.at(-1).ids,candidates.map(i=>i.id));assert.equal(new Set(fake.tasks.map(t=>t.id)).size,4);assert.equal(fake.tasks.length,4);
});
test('Closing saves completed proofs; reopening skips them and ignores delayed responses from stopped workers',()=>{
  const fake=workersFixture(),updates=[];
  const queue=createChoiceQueue({catalog:{},options,kind:'scope',candidates,workerCount:2,createWorker:fake.createWorker,onUpdate:value=>updates.push(value)});
  queue.start();fake.workers.forEach(w=>w.ready());fake.workers[0].finish();const saved=queue.stop(),count=updates.length;
  fake.workers[1].finish();assert.equal(updates.length,count);assert.equal(Object.keys(saved.records).length,1);
  const resumed=workersFixture(),next=createChoiceQueue({catalog:{},options,kind:'scope',candidates,records:saved.records,workerCount:2,createWorker:resumed.createWorker});next.start();resumed.workers.forEach(w=>w.ready());assert.ok(resumed.tasks.every(t=>!saved.records[t.id]));next.stop();
});
test('Worker failure never labels an untested option incompatible or cacheable',()=>{
  const fake=workersFixture(),updates=[],errors=[];
  const queue=createChoiceQueue({catalog:{},options,kind:'scope',candidates,workerCount:1,createWorker:fake.createWorker,onUpdate:value=>updates.push(value),onError:error=>errors.push(error)});
  queue.start();fake.workers[0].ready();fake.workers[0].onerror(new Error('Worker stopped'));
  assert.equal(errors.length,1);assert.equal(updates.at(-1).done,true);assert.equal(updates.at(-1).unchecked,4);assert.deepEqual(updates.at(-1).records,{});
});
test('An empty picker or a fully cached picker needs no workers; core counts are bounded',()=>{
  for(const list of [[],candidates]){let started=0;const records=Object.fromEntries(list.map(i=>[i.id,'incompatible']));let last;
    const q=createChoiceQueue({catalog:{},options,kind:'scope',candidates:list,records,createWorker(){started++;throw Error('Unexpected worker');},onUpdate:value=>{last=value;}});q.start();assert.equal(started,0);assert.equal(last.done,true);
  }
  assert.equal(recommendedChoiceWorkers(1,10),1);assert.equal(recommendedChoiceWorkers(2,10),1);assert.equal(recommendedChoiceWorkers(8,10),4);assert.equal(recommendedChoiceWorkers(32,2),2);assert.equal(recommendedChoiceWorkers(32,50,200),1);assert.equal(recommendedChoiceWorkers(32,50,1100),2);assert.equal(recommendedChoiceWorkers(32,50,2500),8);
  assert(choicePriority(candidates[1],'scope',{filter:'1-6',query:'Bravo'})<choicePriority(candidates[0],'scope',{filter:'1-6',query:'Bravo'}));
});
test('Parallel timeouts are retried once with one worker; a second timeout remains unchecked',()=>{
  const fake=workersFixture(),updates=[];
  const queue=createChoiceQueue({catalog:{},options,kind:'scope',candidates:candidates.slice(0,2),workerCount:2,createWorker:fake.createWorker,onUpdate:value=>updates.push(value)});
  queue.start();fake.workers.forEach(w=>w.ready());fake.workers[0].finish('unchecked');fake.workers[1].finish('compatible');
  assert.equal(fake.tasks.length,3);assert.equal(fake.tasks[2].id,id(1));assert.equal(fake.workers[1].stopped,true);
  assert.equal(updates.at(-1).done,false);fake.workers[0].finish('unchecked');
  assert.equal(updates.at(-1).done,true);assert.equal(updates.at(-1).unchecked,1);assert.deepEqual(updates.at(-1).records,{[id(2)]:'compatible'});
});
