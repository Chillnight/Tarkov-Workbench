// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import loadHighs from 'highs';
import {importFleaData,fleaOffer,hasFleaData} from '../dist/flea-market.mjs';
import {defaultTraderSettings,normalizeTraderSettings,cheapestOffer,offerLabel} from '../dist/traders.mjs';
import {isAvailable} from '../dist/availability.mjs';
import {validateCatalog} from '../dist/data-validation.mjs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
import {choiceCandidates,compatibleChoice} from '../dist/attachment-choices.mjs';
import {attachmentCacheKey} from '../dist/attachment-picker.mjs';
import {createShoppingList,formatShoppingList} from '../dist/shopping-list.mjs';

const catalog=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
const solver=await loadHighs();
const trader='54cb50c76803fa8b248b4571';
const cash=price=>({trader,price,priceRUB:price,currency:'RUB',minTraderLevel:1,taskUnlock:null});
const item=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],category:'Foregrip',ergo:0,recoil:0,weight:0.1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],categories:[],offers:[],barters:[],...extra});
const options={weaponId:'w',sound:'unsilenced',mode:'ergo',balance:75,magazine:1,scopeId:null,preferPracticalMounts:false,restrictTraders:true,includeFleaMarket:true,traderLevels:{[trader]:1}};
function fixture(){return {items:{
  w:item('w',{types:['gun'],category:'Weapon',ergo:50,vertical:100,horizontal:200,factoryParts:{factory:1},slots:[{id:'grip',key:'grip',name:'grip',required:true,allowed:['factory','market','unknown','loot'] }]}),
  factory:item('factory',{types:['mods','noFlea'],ergo:1,flea:{allowed:false,minLevel:0,priceRUB:null}}),
  market:item('market',{ergo:5,flea:{allowed:true,minLevel:25,priceRUB:100}}),
  unknown:item('unknown',{ergo:8,flea:{allowed:true,minLevel:25,priceRUB:null}}),
  loot:item('loot',{types:['mods','noFlea'],ergo:20,flea:{allowed:false,minLevel:25,priceRUB:null}})
}};}

test('Flea is default-on and settings preserve an explicit opt-out',()=>{
  assert.equal(defaultTraderSettings().includeFleaMarket,true);
  assert.equal(normalizeTraderSettings({}).includeFleaMarket,true);
  assert.equal(normalizeTraderSettings({includeFleaMarket:false}).includeFleaMarket,false);
});
test('Flea flags, prices and unlock levels come from source fields, never from trader selling prices',()=>{
  assert.deepEqual(importFleaData({types:['mods'],minLevelForFlea:40,avg24hPrice:80000}),{allowed:true,minLevel:40,priceRUB:80000});
  assert.deepEqual(importFleaData({types:['mods','noFlea'],minLevelForFlea:20,avg24hPrice:null}),{allowed:false,minLevel:20,priceRUB:null});
  assert.equal(hasFleaData(catalog),true);
  for(const i of Object.values(catalog.items))assert.equal(i.flea.allowed,!i.types.includes('noFlea'));
});
test('Purchase availability combines traders, barters, Flea and factory parts; loot-only items stay out',()=>{
  const c=fixture();
  for(const id of ['factory','market','unknown'])assert.equal(isAvailable(c.items[id],options,c),true);
  assert.equal(isAvailable(c.items.loot,options,c),false);
  assert.equal(isAvailable(c.items.market,{...options,includeFleaMarket:false},c),false);
  c.items.loot.offers=[cash(100)];assert.equal(isAvailable(c.items.loot,options,c),true);
  c.items.loot.offers[0].minTraderLevel=4;assert.equal(isAvailable(c.items.loot,options,c),false);
  c.items.loot.barters=[{kind:'barter',trader,minTraderLevel:1,taskUnlock:null,priceRUB:null,requiredItems:[],rewardCount:1}];
  assert.equal(isAvailable(c.items.loot,options,c),true);
  assert.equal(isAvailable(c.items.loot,{...options,includeBarters:false},c),false);
  assert.equal(fleaOffer({...c.items.market,types:['mods','noFlea']},options),null);
});
test('Arena exclusions still apply to items with market data',()=>{
  const i=item('6984b82c5aab442620032fe8',{flea:{allowed:true,minLevel:20,priceRUB:10}});
  assert.equal(isAvailable(i,{...options,excludeArenaUnlocks:true}),false);
  assert.equal(isAvailable(i,{...options,excludeArenaUnlocks:false}),true);
});
test('The cheapest eligible purchase wins, with trader cash preferred at equal prices',()=>{
  const i=item('market',{offers:[cash(110)],flea:{allowed:true,minLevel:25,priceRUB:100}});
  assert.equal(cheapestOffer(i,options).kind,'flea');
  i.offers[0]=cash(100);assert.notEqual(cheapestOffer(i,options).kind,'flea');
  i.offers[0].minTraderLevel=4;assert.equal(cheapestOffer(i,options).kind,'flea');
  assert.match(offerLabel(i,options),/24h average.*unlock level 25/);
});
test('Flea prices count toward budgets; unknown prices are eligible only without a budget',()=>{
  const c=fixture();
  assert.equal(optimize(c,options,solver).rows[0].itemId,'unknown');
  const priced=optimize(c,{...options,maxBudget:100},solver);
  assert.equal(priced.rows[0].itemId,'market');assert.equal(priced.cost.priceRUB,100);assert.equal(priced.cost.fleaCount,1);
  assert.deepEqual(validateBuild(c,{...options,maxBudget:100},priced.rows),[]);
  assert.equal(optimize(c,{...options,maxBudget:99},solver).rows[0].itemId,'factory');
  assert.equal(optimize(c,{...options,includeFleaMarket:false},solver).rows[0].itemId,'factory');
});
test('Flea shopping groups show estimates and quantities without fictitious loyalty levels',()=>{
  const c=fixture(),list=createShoppingList(c,options,[{itemId:'market'},{itemId:'market'},{itemId:'unknown'},{itemId:'factory'}]);
  assert.equal(list.groups[0].traderName,'Flea Market');assert.equal(list.groups[0].kind,'flea');
  assert.equal(list.cost.priceRUB,200);assert.equal(list.cost.fleaCount,3);assert.equal(list.cost.unpriced,1);
  assert.equal(list.included.length,1);
  const text=formatShoppingList(list);assert.match(text,/estimated total 200 RUB/);assert.match(text,/price unavailable/);assert.doesNotMatch(text,/LLundefined|NaN|undefined/);
});
test('Legacy databases remain valid and malformed market data is rejected',()=>{
  const legacy=structuredClone(catalog);for(const i of Object.values(legacy.items))delete i.flea;
  assert.equal(hasFleaData(legacy),false);assert.equal(validateCatalog(legacy),legacy);
  const id='6567e7681265c8a131069b0f';
  for(const change of [i=>{i.flea.minLevel=-1;},i=>{i.flea.priceRUB=-10;},i=>{i.flea.allowed='yes';},i=>{i.types.push('noFlea');}]){
    const broken=structuredClone(catalog);change(broken.items[id]);assert.throws(()=>validateCatalog(broken),/Flea Market data/);
  }
});
test('Picker caches separate Flea settings and TANGO6T mounts on MCX and both NL545 variants in all objectives',()=>{
  const id='6567e7681265c8a131069b0f',weapons=Object.values(catalog.items).filter(i=>['MCX','NL545 DI','NL545 GP'].includes(i.shortName)&&i.types.includes('gun'));
  assert.equal(weapons.length,3);
  for(const weapon of weapons){
  const settings={...defaultTraderSettings(),weaponId:weapon.id,scopeId:id,sound:'silenced',magazine:30,magazineId:null,excludeArenaUnlocks:true,preferPracticalMounts:true,balance:75,traderLevels:Object.fromEntries(Object.keys(defaultTraderSettings().traderLevels).map(t=>[t,t==='6617beeaa9cfa777ca915b7c'?3:4]))};
  const off={...settings,includeFleaMarket:false};
  assert.notEqual(attachmentCacheKey(catalog,settings,'scope'),attachmentCacheKey(catalog,off,'scope'));
  assert.ok(choiceCandidates(catalog,settings,'scope').some(i=>i.id===id));
  assert.ok(!choiceCandidates(catalog,off,'scope').some(i=>i.id===id));
  assert.equal(compatibleChoice(catalog,settings,solver),'compatible');
  for(const mode of ['ergo','recoil','balanced']){
    const r=optimize(catalog,{...settings,mode},solver);assert.equal(r.status,'optimal');
    assert.ok(r.rows.some(row=>row.itemId===id));assert.deepEqual(validateBuild(catalog,{...settings,mode},r.rows),[]);
  }
  }
});
