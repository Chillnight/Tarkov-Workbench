// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import loadHighs from 'highs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
import {compatibleChoice,reachableMagazines} from '../dist/attachment-choices.mjs';
import {suppressorVariants} from '../dist/weapon-configuration.mjs';
import {isAvailable} from '../dist/availability.mjs';
import {factoryPartCount} from '../dist/factory-parts.mjs';
import {moddableWeapons} from '../dist/weapon-picker.mjs';
import {TRADERS,buildCost,offerLabel} from '../dist/traders.mjs';
import {createShoppingList,formatShoppingList} from '../dist/shopping-list.mjs';

const solver=await loadHighs();
const trader=TRADERS[0].id;
const offer=(price=100,level=1)=>({trader,price,priceRUB:price,currency:'RUB',minTraderLevel:level,taskUnlock:null});
const slot=(id,allowed)=>({id,key:id,name:id,allowed,required:true,missing:[]});
const part=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],categories:[],category:'Stock',ergo:0,recoil:0,weight:0.1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],offers:[],barters:[],...extra});
const options={weaponId:'w',mode:'ergo',sound:'unsilenced',balance:75,magazine:0,scopeId:null,preferPracticalMounts:false,restrictTraders:true,includeQuestOffers:true,includeBarters:true,traderLevels:{[trader]:1}};
const fixture=()=>({items:{
  w:part('w',{types:['gun'],ergo:40,vertical:100,horizontal:150,factoryParts:{original:1},slots:[slot('stock',['original','worse','equal','better','unavailable'])]}),
  original:part('original',{ergo:5,recoil:-0.01}),
  worse:part('worse',{ergo:4,recoil:-0.01,offers:[offer(1)]}),
  equal:part('equal',{ergo:5,recoil:-0.01,offers:[offer(1)]}),
  better:part('better',{ergo:6,recoil:-0.01,offers:[offer(100,4)]}),
  unavailable:part('unavailable',{ergo:30,recoil:-0.1})
}});

test('Factory parts remain available without offers; ordinary unavailable upgrades stay filtered',()=>{
  const c=fixture();
  assert.equal(isAvailable(c.items.original,options,c),true);
  assert.equal(isAvailable(c.items.unavailable,options,c),false);
  for(const mode of ['ergo','recoil','balanced']){
    const result=optimize(c,{...options,mode},solver);
    assert.equal(result.status,'optimal');
    assert.equal(result.rows[0].itemId,'original');
    assert.deepEqual(result.cost,{priceRUB:0,unpriced:0,barterCount:0,factoryCount:1,fleaCount:0});
  }
  assert.match(offerLabel(c.items.original,options,c),/Factory part.*included/);
});

test('Better upgrades win; factory parts sold by locked traders are still already included',()=>{
  const c=fixture();c.items.original.offers=[offer(200,4)];
  assert.equal(optimize(c,options,solver).rows[0].itemId,'original');
  const result=optimize(c,{...options,traderLevels:{[trader]:4}},solver);
  assert.equal(result.rows[0].itemId,'better');
  assert.equal(result.cost.priceRUB,100);
  c.items.better.weight=1;c.items.equal.weight=0.05;c.items.equal.ergo=5;
  c.items.better.offers=[];
  assert.equal(optimize(c,options,solver).rows[0].itemId,'equal','A lighter part at equal performance is an improvement');
});

test('Factory ownership is per weapon and limited to preset quantities, including budgets and shopping',()=>{
  const c=fixture();
  c.items.w.slots=[slot('rail1',['original']),slot('rail2',['original'])];
  assert.equal(optimize(c,options,solver).status,'infeasible');
  c.items.original.offers=[offer(100)];
  const result=optimize(c,{...options,maxBudget:100},solver);
  assert.equal(result.status,'optimal');
  assert.deepEqual(result.cost,{priceRUB:100,unpriced:0,barterCount:0,factoryCount:1,fleaCount:0});
  assert.deepEqual(validateBuild(c,options,result.rows),[]);
  assert.equal(optimize(c,{...options,maxBudget:99},solver).status,'infeasible');
  const list=createShoppingList(c,options,result.rows);
  assert.equal(list.included[0].quantity,1);assert.equal(list.groups[0].items[0].quantity,1);
  assert.match(offerLabel(c.items.original,options,c,2),/100 RUB/);
  assert.match(formatShoppingList(list),/Factory parts included/);
  assert.equal(factoryPartCount(c.items.original,{weaponId:'other'},c),0);
  c.items.original.offers=[];
  assert.ok(validateBuild(c,options,result.rows).some(error=>error.includes('Factory quantity')));
});

test('Unknown barter value is allowed without budget, but cannot evade an active budget',()=>{
  const c=fixture();c.items.better.offers=[];
  c.items.better.barters=[{kind:'barter',trader,minTraderLevel:1,taskUnlock:null,priceRUB:null,rewardCount:1,requiredItems:[{name:'GP coin',count:1,attributes:{}}]}];
  assert.equal(optimize(c,options,solver).rows[0].itemId,'better');
  const capped=optimize(c,{...options,maxBudget:1},solver);
  assert.equal(capped.rows[0].itemId,'original');
  assert.equal(capped.cost.unpriced,0);
});

test('Factory fallback supports old snapshots and respects current explicit preset data',()=>{
  const aps='5a17f98cfcdbcb0980087290',grip='5a17fc70fcdbcb0176308b3d';
  assert.ok(factoryPartCount({id:grip},{weaponId:aps},{items:{[aps]:{}}})>0);
  assert.equal(factoryPartCount({id:grip},{weaponId:aps},{items:{[aps]:{factoryParts:{}}}}),0);
});

let catalog;
try{catalog=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));}catch{}
const realOptions={...options,magazine:30,preferPracticalMounts:true,excludeArenaUnlocks:true,allowGrenadeLaunchers:false,traderLevels:Object.fromEntries(TRADERS.map(t=>[t.id,t.name==='Ref'?3:4]))};
test('Reported weapons build in every objective and their factory magazines pass the chooser',{skip:!catalog},()=>{
  const guns=Object.values(catalog.items).filter(i=>i.types.includes('gun')&&/AK-545|AK-50|APS |Desert Eagle|G28|G36/.test(i.name));
  assert.ok(guns.length>=8);
  for(const gun of guns){
    const selection={...realOptions,weaponId:gun.id};
    const variants=suppressorVariants(catalog,gun.id,selection);
    const sound=variants.silenced?'silenced':'unsilenced';
    selection.sound=sound;
    const mags=reachableMagazines(catalog,gun.id,selection);
    assert.ok(mags.length,`${gun.name}: no magazines`);
    assert.ok(mags.some(mag=>compatibleChoice(catalog,{...selection,magazine:1,magazineId:mag.id},solver)==='compatible'),`${gun.name}: chooser excludes every magazine`);
    for(const mode of ['ergo','recoil','balanced']){
      const result=optimize(catalog,{...selection,mode},solver);
      assert.equal(result.status,'optimal',`${gun.name} / ${mode}`);
      assert.deepEqual(validateBuild(catalog,{...selection,mode},result.rows),[],gun.name);
    }
  }
});

test('APS, AK-50 and Desert Eagle cannot falsely offer a silenced variant',{skip:!catalog},()=>{
  for(const gun of Object.values(catalog.items).filter(i=>i.types.includes('gun')&&/APS |AK-50|Desert Eagle/.test(i.name))){
    assert.deepEqual(suppressorVariants(catalog,gun.id,{...realOptions,weaponId:gun.id}),{silenced:false,unsilenced:true},gun.name);
  }
});

test('Every selectable weapon has a complete default assembly at max traders and Ref LL3',{skip:!catalog},()=>{
  let checked=0;
  for(const gun of moddableWeapons(catalog)){
    const selection={...realOptions,weaponId:gun.id};
    if(!isAvailable(gun,selection,catalog))continue;
    const variants=suppressorVariants(catalog,gun.id,selection);
    selection.sound=variants.silenced?'silenced':'unsilenced';
    assert.equal(compatibleChoice(catalog,selection,solver),'compatible',gun.name);
    checked++;
  }
  assert.ok(checked>=150);
});
