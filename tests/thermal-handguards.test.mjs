// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import loadHighs from 'highs';
import {optimize,createProblem,validateBuild} from '../dist/optimizer.mjs';
import {findAlternatives,applyAlternative,sameRecordedStats} from '../dist/alternatives.mjs';
import {importThermalData,thermalDominates,thermalLabel,hasThermalData} from '../dist/thermal-stats.mjs';
import {validateCatalog} from '../dist/data-validation.mjs';
const solver=await loadHighs();
const trader='54cb50c76803fa8b248b4571';
const offer=price=>({trader,minTraderLevel:1,price,priceRUB:price,currency:'RUB',taskUnlock:null});
const part=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],categories:[],category:'Handguard',ergo:19,recoil:-0.03,weight:0.1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],offers:[offer(10)],barters:[],statExtras:{accuracy:0,durabilityBurn:1},thermal:{heatFactor:1,coolingFactor:1},...extra});
const slot=(id,allowed)=>({id,key:id,name:id,allowed,required:true,missing:[]});
const options={weaponId:'w',mode:'ergo',balance:75,sound:'unsilenced',magazine:1,scopeId:null,magazineId:null,preferPracticalMounts:true,restrictTraders:true,traderLevels:{[trader]:1},includeBarters:true,includeFleaMarket:false,excludeArenaUnlocks:true};
function fixture(){return {items:{
  w:part('w',{category:'Weapon',types:['gun'],ergo:50,recoil:0,vertical:100,horizontal:200,weight:2,slots:[slot('guard',['a','b'])]}),
  a:part('a'),b:part('b',{weight:0.5,offers:[offer(100)],thermal:{heatFactor:0.9,coolingFactor:1.1}})
}};}

test('Thermal data keeps missing values unknown and labels recorded modifiers',()=>{
  assert.deepEqual(importThermalData({heatFactor:0.958,coolingFactor:1.025}),{heatFactor:0.958,coolingFactor:1.025});
  assert.deepEqual(importThermalData({heatFactor:1.017}),{heatFactor:1.017,coolingFactor:null});
  assert.equal(thermalLabel({thermal:{heatFactor:0.958,coolingFactor:1.025}}),'Heat -4.2% · Cooling +2.5%');
  assert.match(thermalLabel({}),/not supplied/);
  assert.equal(thermalDominates({thermal:{heatFactor:0.8,coolingFactor:null}},{thermal:{heatFactor:1,coolingFactor:1}}),false);
});
test('A thermally better handguard wins despite extra weight and cost, in every objective',()=>{
  for(const mode of ['ergo','recoil','balanced']){
    const c=fixture(),o={...options,mode},result=optimize(c,o,solver);
    assert.equal(createProblem(c,o).dominatedCount,0);
    assert.equal(result.rows[0].itemId,'b');assert.equal(result.ergo,69);assert.equal(result.recoil,-0.03);
    assert.equal(result.weight,2.5);assert.equal(result.cost.priceRUB,100);
    assert.equal(result.thermalPreference.applied,true);assert.deepEqual(validateBuild(c,o,result.rows),[]);
  }
});
test('Thermal improvements cannot reduce Ergo, worsen recoil or change other recorded performance stats',()=>{
  for(const change of [b=>{b.ergo=18;},b=>{b.recoil=-0.02;},b=>{b.statExtras.accuracy=-1;}]){
    const c=fixture();change(c.items.b);
    const result=optimize(c,options,solver);assert.equal(result.rows[0].itemId,'a');assert.equal(result.thermalPreference.applied,false);
  }
});
test('Incomparable heat/cooling choices remain visible and can be selected with clear stat differences',()=>{
  const c=fixture();c.items.a.thermal={heatFactor:0.9,coolingFactor:1};c.items.b.thermal={heatFactor:1,coolingFactor:1.1};
  const r=optimize(c,options,solver);assert.equal(r.rows[0].itemId,'a');assert.equal(r.thermalPreference.applied,false);
  assert.equal(sameRecordedStats(c.items.a,c.items.b),false);assert.ok(findAlternatives(c,options,r.rows)[0].includes('b'));
  const swapped=applyAlternative(c,options,r,0,'b');assert.ok(swapped);assert.equal(swapped.weight,2.5);assert.equal(swapped.ergo,r.ergo);assert.deepEqual(validateBuild(c,options,swapped.rows),[]);
});
test('Weight and cost decide between incomparable thermal improvements, never an invented heat/cooling score',()=>{
  const c=fixture();c.items.a.thermal={heatFactor:1.1,coolingFactor:0.9};c.items.b.thermal={heatFactor:0.9,coolingFactor:1};
  c.items.w.slots[0].allowed.push('c');c.items.c=part('c',{weight:0.3,offers:[offer(150)],thermal:{heatFactor:1,coolingFactor:1.1}});
  assert.equal(optimize(c,options,solver).rows[0].itemId,'c');
});
test('Handguard swaps retain and remap installed children, and reject missing mounts or extra required parts',()=>{
  const c=fixture();c.items.a.slots=[{...slot('a-grip',['g']),key:'mod_foregrip'}];c.items.b.slots=[{...slot('b-grip',['g']),key:'mod_foregrip'}];c.items.g=part('g',{category:'Foregrip',ergo:5,recoil:0});
  let r=optimize(c,options,solver);assert.equal(r.rows[0].itemId,'b');assert.equal(r.rows[1].itemId,'g');assert.equal(r.rows[1].slotId,'b-grip');assert.match(r.rows[1].path,/b/);assert.deepEqual(validateBuild(c,options,r.rows),[]);
  c.items.b.slots[0].allowed=[];r=optimize(c,options,solver);assert.equal(r.rows[0].itemId,'a');
  c.items.b.slots=[slot('b-grip',['g']),slot('extra',['g'])];r=optimize(c,options,solver);assert.equal(r.rows[0].itemId,'b');
  assert.equal(r.thermalPreference.applied,false); // Extra Ergo legitimately selected by the primary optimizer.
});
test('Budget, factory ownership, trader levels and Arena exclusions apply to thermal improvements',()=>{
  let c=fixture();assert.equal(optimize(c,{...options,maxBudget:20},solver).rows[0].itemId,'a');
  c.items.w.factoryParts={a:1};c.items.a.offers=[];assert.equal(optimize(c,{...options,maxBudget:1},solver).cost.factoryCount,1);
  c=fixture();c.items.b.offers[0].minTraderLevel=4;assert.equal(optimize(c,options,solver).rows[0].itemId,'a');
  c=fixture();const id='6984b82c5aab442620032fe8';c.items[id]={...c.items.b,id};delete c.items.b;c.items.w.slots[0].allowed=['a',id];
  assert.equal(optimize(c,options,solver).rows[0].itemId,'a');assert.equal(optimize(c,{...options,excludeArenaUnlocks:false},solver).rows[0].itemId,id);
});
test('Unknown thermal fields do not justify replacing a lighter part; legacy catalogs still work',()=>{
  for(const key of ['heatFactor','coolingFactor']){
    const c=fixture();c.items.b.thermal[key]=null;assert.equal(optimize(c,options,solver).rows[0].itemId,'a');
  }
  const c=fixture();for(const item of Object.values(c.items))delete item.thermal;
  assert.equal(hasThermalData(c),false);assert.equal(optimize(c,options,solver).rows[0].itemId,'a');
});
test('Thermal preference does not add optional zero-stat parts solely for cooling',()=>{
  const c=fixture();c.items.w.slots[0].required=false;c.items.a.ergo=0;c.items.b.ergo=0;c.items.a.recoil=0;c.items.b.recoil=0;
  assert.deepEqual(optimize(c,options,solver).rows,[]);
});
test('Saved thermal data matches source fields, and malformed thermal values are rejected',async()=>{
  const c=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
  let raw;try{raw=JSON.parse(await readFile(new URL('../research/items-current.json',import.meta.url),'utf8')).data.items;}catch{}
  assert.equal(hasThermalData(c),true);
  if(raw)for(const i of Object.values(c.items).filter(i=>i.category==='Handguard'))assert.deepEqual(i.thermal,importThermalData(raw[i.id].properties));
  const id=Object.values(c.items).find(i=>i.category==='Handguard').id;
  for(const value of [-1,NaN,'1']){const broken=structuredClone(c);broken.items[id].thermal.heatFactor=value;assert.throws(()=>validateCatalog(broken),/thermal data/);}
  for(const i of Object.values(c.items))delete i.thermal;
  assert.equal(validateCatalog(c),c);
});
