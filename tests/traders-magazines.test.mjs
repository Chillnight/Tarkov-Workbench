// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import loadHighs from 'highs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
import {compatibleChoice,reachableMagazines} from '../dist/attachment-choices.mjs';
import {reachableOptics} from '../dist/optics.mjs';
import {isAvailable,isUnderbarrelLauncher} from '../dist/availability.mjs';
import {defaultTraderSettings,normalizeTraderSettings,cheapestOffer,buildCost} from '../dist/traders.mjs';
const solver=await loadHighs();
const offer=(price,level=1,extra={})=>({trader:'prapor',price,priceRUB:price,currency:'RUB',minTraderLevel:level,taskUnlock:null,...extra});
const item=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],category:'Mount',ergo:0,recoil:0,weight:1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],categories:[],offers:[offer(100)],...extra});
const slot=(id,allowed,required=false,key=id)=>({id,name:id,key,allowed,required,missing:[]});
const options={weaponId:'w',mode:'recoil',sound:'unsilenced',balance:75,magazine:1,scopeId:null,preferPracticalMounts:false,restrictTraders:true,traderLevels:{prapor:1}};
function fixture(){return {items:{
  w:item('w',{types:['gun'],category:'Weapon',ergo:50,vertical:100,horizontal:200,offers:[],slots:[slot('mag',['small','large'],false,'mod_magazine'),slot('grip',['cheap','expensive'],true),slot('rail',['adapter']),slot('underbarrel',['launcher'])]}),
  small:item('small',{category:'Magazine',capacity:10,ergo:2}),large:item('large',{category:'Magazine',capacity:30,ergo:-3}),
  cheap:item('cheap',{category:'Foregrip',ergo:5,recoil:-.02,offers:[offer(100)]}),expensive:item('expensive',{category:'Foregrip',ergo:5,recoil:-.02,offers:[offer(1000)]}),
  adapter:item('adapter',{ergo:-1,slots:[slot('lens',['scope'])]}),scope:item('scope',{category:'Scope',ergo:-2}),
  launcher:item('launcher',{category:'UBGL',recoil:-.08,conflicts:['cheap','expensive']})
}};}
test('Trader levels and quest policy filter buying offers, never selling prices',()=>{
  const i=item('i',{offers:[offer(20,3),offer(50,1,{taskUnlock:'quest'}),offer(80,1)],sellToTrader:[{priceRUB:1}]});
  assert.equal(cheapestOffer(i,options).priceRUB,50);
  assert.equal(cheapestOffer(i,{...options,includeQuestOffers:false}).priceRUB,80);
  assert.equal(cheapestOffer(i,{...options,traderLevels:{prapor:3}}).priceRUB,20);
  assert.equal(cheapestOffer(i,{...options,traderLevels:{prapor:0}}),null);
  assert.equal(defaultTraderSettings().includeQuestOffers,true);
  assert.equal(normalizeTraderSettings({}).includeQuestOffers,true);
  assert.equal(normalizeTraderSettings({includeQuestOffers:false}).includeQuestOffers,false);
});
test('Exact magazine choice overrides optimizer preference and is validated',()=>{
  const c=fixture(),o={...options,magazineId:'large'},r=optimize(c,o,solver);
  assert.ok(r.rows.some(r=>r.itemId==='large'));assert.ok(!r.rows.some(r=>r.itemId==='small'));
  assert.deepEqual(validateBuild(c,o,r.rows),[]);
  assert.ok(validateBuild(c,o,r.rows.map(r=>r.itemId==='large'?{...r,itemId:'small'}:r)).length);
  c.items.other=item('other',{capacity:60});assert.equal(optimize(c,{...o,magazineId:'other'},solver).status,'infeasible');
});
test('Automatic magazine capacity is a target and supports every offered preset',()=>{
  const c=fixture();
  for(const [target,chosen] of [[10,'small'],[20,'large'],[30,'large'],[60,'large']]){
    const o={...options,magazine:target},r=optimize(c,o,solver);
    assert.equal(r.status,'optimal');
    assert.ok(r.rows.some(row=>row.itemId===chosen),`Expected ${chosen} for target ${target}`);
    assert.equal(r.magazineCapacity,c.items[chosen].capacity);
    assert.deepEqual(validateBuild(c,o,r.rows),[]);
  }
  c.items.large.capacity=25;
  const fallback=optimize(c,{...options,magazine:30},solver);
  assert.equal(fallback.magazineCapacity,25);
  assert.ok(fallback.rows.some(row=>row.itemId==='large'));
  const pinned=optimize(c,{...options,magazine:60,magazineId:'small'},solver);
  assert.equal(pinned.magazineCapacity,10);
  assert.deepEqual(validateBuild(c,{...options,magazine:60,magazineId:'small'},pinned.rows),[]);
});
test('Magazine target falls back when the larger magazine conflicts with required parts',()=>{
  const c=fixture();c.items.large.conflicts=['cheap','expensive'];
  const o={...options,magazine:30},r=optimize(c,o,solver);
  assert.equal(r.status,'optimal');
  assert.equal(r.magazineCapacity,10);
  assert.ok(r.rows.some(row=>row.itemId==='small'));
  assert.deepEqual(validateBuild(c,o,r.rows),[]);
});
test('A self-conflicting item can be fitted once but not twice',()=>{
  const c=fixture();
  c.items.w.slots.push(slot('stock',['ravage'],true,'mod_stock'),slot('second-stock',['ravage'],false,'mod_stock'));
  c.items.ravage=item('ravage',{category:'Stock',ergo:20,recoil:-.17,conflicts:['ravage']});
  const r=optimize(c,options,solver);
  assert.equal(r.status,'optimal');
  assert.equal(r.rows.filter(row=>row.itemId==='ravage').length,1);
  assert.deepEqual(validateBuild(c,options,r.rows),[]);
});
test('Cheapest available equivalent mod wins without reducing objective stats',()=>{
  const c=fixture(),r=optimize(c,options,solver);
  assert.ok(r.rows.some(r=>r.itemId==='cheap'));assert.ok(!r.rows.some(r=>r.itemId==='expensive'));
  c.items.expensive.ergo=6;const better=optimize(c,options,solver);assert.ok(better.rows.some(r=>r.itemId==='expensive'));
});
test('Unknown prices do not become free and currency comparisons use RUB',()=>{
  const c=fixture();c.items.cheap.offers=[];
  assert.ok(optimize(c,{...options,restrictTraders:false},solver).rows.some(r=>r.itemId==='expensive'));
  c.items.cheap.offers=[offer(5,1,{currency:'USD',priceRUB:1500})];
  assert.ok(optimize(c,options,solver).rows.some(r=>r.itemId==='expensive'));
  const cost=buildCost(c,options,[{itemId:'w'},{itemId:'cheap'}]);assert.equal(cost.unpriced,1);assert.equal(cost.priceRUB,1500);
});
test('Low trader levels exclude mods and required adapters; root weapon is owned',()=>{
  const c=fixture();c.items.expensive.offers=[offer(50,2)];c.items.adapter.offers=[offer(100,2)];
  assert.equal(isAvailable(c.items.w,options),true);
  assert.ok(!optimize(c,options,solver).rows.some(r=>r.itemId==='expensive'));
  assert.equal(reachableOptics(c,'w',options).length,0);
  assert.equal(compatibleChoice(c,{...options,scopeId:'scope'},solver),'incompatible');
  assert.equal(compatibleChoice(c,{...options,scopeId:'scope',traderLevels:{prapor:2}},solver),'compatible');
  c.items.cheap.offers=[];assert.equal(optimize(c,options,solver).status,'infeasible');
});
test('Picker checks reject global conflicts even when a mounting path exists',()=>{
  const c=fixture();c.items.scope.conflicts=['large'];
  assert.deepEqual(reachableMagazines(c,'w',options).map(i=>i.id),['small','large']);
  assert.equal(reachableOptics(c,'w',options).length,1);
  assert.equal(compatibleChoice(c,{...options,scopeId:'scope',magazineId:'large'},solver),'incompatible');
  assert.equal(compatibleChoice(c,{...options,scopeId:'scope',magazineId:'small'},solver),'compatible');
  c.items.adapter.blockedSlots=['mag'];assert.equal(compatibleChoice(c,{...options,scopeId:'scope'},solver),'incompatible');
});
test('Underbarrel launchers are excluded by default and opt in explicitly',()=>{
  const c=fixture();c.items.w.slots.find(s=>s.id==='grip').required=false;
  const normal=optimize(c,options,solver),allowed=optimize(c,{...options,allowGrenadeLaunchers:true},solver);
  assert.ok(normal.rows.some(r=>r.itemId==='cheap'));assert.ok(!normal.rows.some(r=>r.itemId==='launcher'));
  assert.ok(allowed.rows.some(r=>r.itemId==='launcher'));
  assert.ok(validateBuild(c,options,allowed.rows).length);
  assert.equal(isUnderbarrelLauncher(item('pad',{category:'Stock',name:'GP-25 accessory kit recoil pad'})),false);
});
test('Real M4 picker excludes AK magazines, incompatible pistol sights and unavailable offers',()=>{
  const c=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
  const o={...options,weaponId:'5447a9cd4bdc2dbd208b4567',restrictTraders:false};
  const mags=reachableMagazines(c,o.weaponId,o);
  assert.ok(mags.some(i=>i.id==='55d4887d4bdc2d962f8b4570'));
  assert.ok(!mags.some(i=>i.name.startsWith('AK-74')));
  assert.equal(compatibleChoice(c,{...o,scopeId:'5b3b99475acfc432ff4dcbee',magazineId:'55d4887d4bdc2d962f8b4570'},solver),'compatible');
  assert.equal(compatibleChoice(c,{...o,weaponId:'5e81c3cbac2bb513793cdc75',scopeId:'5b3b99475acfc432ff4dcbee'},solver),'incompatible');
  assert.ok(!Object.values(c.items).filter(i=>i.offers?.length).some(i=>i.offers.some(o=>o.priceRUB<=0)));
});
test('Real VPO-215 uses its four-round magazine with the default 30-round target',()=>{
  const c=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
  const o={...options,weaponId:'5de652c31b7e3716273428be',mode:'balanced',magazine:30,restrictTraders:false};
  const r=optimize(c,o,solver);
  assert.equal(r.status,'optimal');
  assert.equal(r.magazineCapacity,4);
  assert.deepEqual(validateBuild(c,o,r.rows),[]);
});
