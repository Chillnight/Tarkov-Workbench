// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createChoiceQueue} from '../dist/choice-queue.mjs';
import {choiceCandidates} from '../dist/attachment-choices.mjs';
const id=n=>n.toString(16).padStart(24,'0'),trader='54cb50c76803fa8b248b4571';
const offer=price=>({trader,price,priceRUB:price,currency:'RUB',minTraderLevel:1,taskUnlock:null});
const part=(n,extra={})=>({id:id(n),name:'Part '+n,shortName:'P'+n,types:['mods'],category:'Mount',categories:[],slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],ergo:0,recoil:0,weight:.1,offers:[offer(100)],barters:[],...extra});
const slot=(name,key,allowed,required=false)=>({id:name,name,key,allowed:allowed.map(id),missing:[],required});
const catalog={meta:{version:'test'},items:{
  [id(1)]:part(1,{types:['gun'],category:'Weapon',vertical:100,horizontal:200,slots:[slot('stock','mod_stock',[2],true),slot('mag','mod_magazine',[3,4]),slot('scope','mod_scope',[5,6])]}),
  [id(2)]:part(2,{category:'Stock'}),
  [id(3)]:part(3,{capacity:30,category:'Magazine'}),
  [id(4)]:part(4,{capacity:30,category:'Magazine',conflicts:[id(2)]}),
  [id(5)]:part(5,{optic:true,category:'Scope',offers:[offer(300)]}),
  [id(6)]:part(6,{optic:true,category:'Scope',conflicts:[id(2)]})
}};
const base={weaponId:id(1),sound:'unsilenced',scopeId:null,magazineId:null,magazine:1,maxBudget:null,restrictTraders:true,traderLevels:{[trader]:4},includeQuestOffers:true,includeBarters:true,includeFleaMarket:false,excludeArenaUnlocks:true};
function worker(){
  const native=new Worker(new URL('./fixtures/choice-worker-bootstrap.mjs',import.meta.url));
  const bridge={onmessage:null,onerror:null,postMessage:data=>native.postMessage(data),terminate:()=>native.terminate()};
  native.on('message',data=>bridge.onmessage?.({data}));native.on('error',error=>bridge.onerror?.(error));return bridge;
}
async function check(options,kind,workerCount){
  return new Promise((resolve,reject)=>{const queue=createChoiceQueue({catalog,options,kind,candidates:choiceCandidates(catalog,options,kind),workerCount,createWorker:worker,onUpdate:value=>{if(value.done)resolve(value);},onError:reject});queue.start();});
}
test('Actual worker instances preserve global conflicts, exact pins, budgets and trader limits at 1, 2, 4 and 8 workers',async()=>{
  for(const [kind,changes,expected] of [
    ['scope',{magazineId:id(3)},[id(5)]],
    ['magazine',{scopeId:id(5)},[id(3)]],
    ['scope',{magazineId:id(4)},[]],
    ['magazine',{scopeId:id(6)},[]],
    ['scope',{magazineId:id(3),maxBudget:500},[id(5)]],
    ['scope',{magazineId:id(3),maxBudget:499},[]],
    ['magazine',{scopeId:id(5),traderLevels:{[trader]:0}},[]]
  ]){
    for(const workers of [1,2,4,8]){
      const result=await check({...base,...changes},kind,workers);
      assert.deepEqual(result.ids,expected,JSON.stringify({kind,changes,workers}));assert.equal(result.unchecked,0);assert.equal(result.done,true);
    }
  }
});
