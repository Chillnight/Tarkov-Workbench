// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import loadHighs from 'highs';
import {validateBuildInputs} from '../dist/input-validation.mjs';
import {attachmentCacheKey} from '../dist/attachment-picker.mjs';
import {verifySuppressorVariants,suppressorVariants} from '../dist/weapon-configuration.mjs';
import {createProblem,optimize,validateBuild} from '../dist/optimizer.mjs';
import {findAlternatives} from '../dist/alternatives.mjs';
import {TRADERS} from '../dist/traders.mjs';
const solver=await loadHighs();
const options={weaponId:'w',mode:'balanced',sound:'unsilenced',balance:75,magazine:1,scopeId:null,magazineId:null,maxBudget:null,preferPracticalMounts:true,restrictTraders:false,excludeArenaUnlocks:false};
const part=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],categories:[],category:'Stock',ergo:0,recoil:0,weight:0.1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],offers:[],barters:[],...extra});
const slot=(id,allowed,key=id)=>({id,key,name:id,allowed,required:true,missing:[]});
const fixture=()=>({items:{w:part('w',{types:['gun'],ergo:40,vertical:100,horizontal:150,slots:[slot('stock',['a','b'])]}),a:part('a',{ergo:5}),b:part('b',{ergo:5,weight:0.2})}});
test('Budget changes invalidate both pickers, including enabling, raising and disabling the cap',()=>{
  for(const kind of ['scope','magazine']){
    const c={meta:{version:'test'}};
    const keys=[null,1,500000].map(maxBudget=>attachmentCacheKey(c,{...options,maxBudget},kind));
    assert.equal(new Set(keys).size,3);
    assert.equal(keys[0],attachmentCacheKey(c,{...options,maxBudget:undefined},kind));
  }
});
test('Invalid numeric input is rejected explicitly; an inactive budget is optional',()=>{
  for(const maxBudget of [0,-1,1.5,100000001,NaN,Infinity]){
    const issue=validateBuildInputs({...options,maxBudget});assert.equal(issue.field,'budget-amount');assert.match(issue.message,/whole-number/);
  }
  for(const maxBudget of [null,1,100000000])assert.equal(validateBuildInputs({...options,maxBudget}),null);
  for(const balance of [-1,101,NaN])assert.equal(validateBuildInputs({...options,balance}).field,'balance');
  assert.equal(validateBuildInputs({...options,magazine:-1}).field,'magazine');
});
test('A reachable suppressor is insufficient when global conflicts prevent assembly',()=>{
  const c=fixture();c.items.w.slots.push(slot('muzzle',['s']));c.items.s=part('s',{suppressor:true,conflicts:['w']});
  assert.equal(suppressorVariants(c,'w',options).silenced,true);
  assert.equal(verifySuppressorVariants(c,'w',options,solver).silenced,'incompatible');
});
test('Required suppressors reject the unsilenced variant; incomplete proofs stay unchecked',()=>{
  const c=fixture();c.items.w.slots.push(slot('muzzle',['s']));c.items.s=part('s',{suppressor:true});
  assert.deepEqual(verifySuppressorVariants(c,'w',options,solver),{silenced:'compatible',unsilenced:'incompatible'});
  assert.deepEqual(verifySuppressorVariants(c,'w',options,{solve:()=>({Status:'Time limit reached'})}),{silenced:'unchecked',unsilenced:'unchecked'});
});
test('Variant checks preserve accessory and budget selections and distinguish unavailable offers',()=>{
  const c=fixture();c.items.w.slots.push({...slot('muzzle',['s']),required:false});c.items.s=part('s',{suppressor:true});
  const selection={...options,scopeId:'chosen-scope',magazineId:'chosen-magazine',maxBudget:1,restrictTraders:true},before=structuredClone(selection);
  c.items.w.factoryParts={a:1};
  assert.equal(verifySuppressorVariants(c,'w',selection,solver).silenced,'unavailable');
  assert.deepEqual(selection,before);
});
test('Equivalent leaves prefer lighter parts but keep compatible alternatives visible',()=>{
  const c=fixture(),p=createProblem(c,options),r=optimize(c,options,solver);
  assert.equal(p.dominatedCount,1);assert.equal(r.rows[0].itemId,'a');
  assert.deepEqual(validateBuild(c,options,r.rows),[]);
  assert.ok(findAlternatives(c,options,r.rows)[0].includes('b'));
});
test('Leaf reduction cannot remove choices referenced by conflicts, pins, profiles or different slots',()=>{
  for(const change of [
    c=>{c.items.w.conflicts=['a'];},
    c=>{c.items.a.blockedSlots=['stock'];},
    c=>{c.items.a.conflictCategories=['different'];},
    c=>{c.items.b.categories=['different'];},
    c=>{c.items.w.slots.push(slot('other',['a','b']));}
  ]){const c=fixture();change(c);assert.equal(createProblem(c,options).dominatedCount,0);}
  const c=fixture();c.items.a.capacity=30;c.items.b.capacity=30;c.items.w.slots[0].key='mod_magazine';
  assert.equal(createProblem(c,{...options,magazineId:'b'}).dominatedCount,0);
  const r=optimize(c,{...options,magazineId:'b'},solver);assert.equal(r.rows[0].itemId,'b');
});
test('A more expensive lighter part cannot dominate a cheap budget-feasible part',()=>{
  const c=fixture(),trader=TRADERS[0].id;
  c.items.a.offers=[{trader,minTraderLevel:1,priceRUB:200,currency:'RUB',price:200}];
  c.items.b.offers=[{trader,minTraderLevel:1,priceRUB:100,currency:'RUB',price:100}];
  assert.equal(createProblem(c,{...options,maxBudget:100}).dominatedCount,0);
  assert.equal(optimize(c,{...options,maxBudget:100},solver).rows[0].itemId,'b');
  c.items.w.factoryParts={b:1};c.items.b.offers=[];
  assert.equal(optimize(c,{...options,maxBudget:1},solver).rows[0].itemId,'b');
});
let catalog;try{catalog=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));}catch{}
test('VAL, VAL MOD.4, Kedr-B and VSS have complete suppressed assemblies only',{skip:!catalog},()=>{
  const levels=Object.fromEntries(TRADERS.map(t=>[t.id,t.name==='Ref'?3:4]));
  const names=['AS VAL','AS VAL MOD.4','Kedr-B','VSS'];
  for(const name of names){
    const gun=Object.values(catalog.items).find(i=>i.types.includes('gun')&&(i.shortName===name||i.shortName.includes(name)));
    assert.ok(gun,name);
    assert.deepEqual(verifySuppressorVariants(catalog,gun.id,{...options,weaponId:gun.id,restrictTraders:true,traderLevels:levels,includeQuestOffers:true,includeBarters:true,excludeArenaUnlocks:true},solver),{silenced:'compatible',unsilenced:'incompatible'},gun.name);
  }
});
