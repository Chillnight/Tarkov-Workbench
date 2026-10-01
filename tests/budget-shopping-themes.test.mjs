// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import loadHighs from 'highs';
import {optimize} from '../dist/optimizer.mjs';
import {replaceAttachment,findAlternatives} from '../dist/alternatives.mjs';
import {createShoppingList,formatShoppingList} from '../dist/shopping-list.mjs';
import {applyTheme,normalizeTheme} from '../dist/themes.mjs';

const solver=await loadHighs();
const prapor='54cb50c76803fa8b248b4571';
const skier='58330581ace78e27b8b10cee';
const cash=(trader,price)=>({trader,kind:'cash',price,priceRUB:price,currency:'RUB',minTraderLevel:1,taskUnlock:null});
const part=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],category:'Foregrip',ergo:0,recoil:0,weight:0.1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],categories:[],offers:[],barters:[],...extra});
const slot=(id,allowed)=>({id,name:id,key:id,allowed,required:true,missing:[]});
const catalog={items:{
  w:part('w',{types:['gun'],category:'Weapon',ergo:50,vertical:100,horizontal:150,slots:[slot('grip',['cheap','expensive','unknown'])]}),
  cheap:part('cheap',{ergo:5,recoil:-0.01,offers:[cash(prapor,100)]}),
  expensive:part('expensive',{ergo:10,recoil:-0.05,offers:[cash(skier,1000)]}),
  unknown:part('unknown',{ergo:20,recoil:-0.1})
}};
const options={weaponId:'w',mode:'recoil',sound:'unsilenced',balance:70,magazine:1,scopeId:null,preferPracticalMounts:false,restrictTraders:false,traderLevels:{[prapor]:1,[skier]:1}};

test('Budget is a hard attachment cap, excludes unknown prices, and leaves weapon cost out',()=>{
  const noCap=optimize(catalog,options,solver);
  assert.equal(noCap.rows[0].itemId,'unknown');
  const affordable=optimize(catalog,{...options,maxBudget:100},solver);
  assert.equal(affordable.status,'optimal');
  assert.equal(affordable.rows[0].itemId,'cheap');
  assert.equal(affordable.cost.priceRUB,100);
  assert.equal(affordable.cost.unpriced,0);
  const premium=optimize(catalog,{...options,maxBudget:1000},solver);
  assert.equal(premium.rows[0].itemId,'expensive');
  assert.equal(optimize(catalog,{...options,maxBudget:99},solver).status,'infeasible');
  assert.throws(()=>optimize(catalog,{...options,maxBudget:-1},solver),/budget/);
});

test('Manual equivalent swaps and suggested alternatives respect the cap',()=>{
  const c=structuredClone(catalog);
  c.items.expensive.ergo=5;c.items.expensive.recoil=-0.01;
  c.items.unknown.ergo=5;c.items.unknown.recoil=-0.01;
  const selection={...options,maxBudget:100};
  const result=optimize(c,selection,solver);
  assert.equal(result.rows[0].itemId,'cheap');
  assert.equal(replaceAttachment(c,selection,result.rows,0,'expensive'),null);
  assert.equal(replaceAttachment(c,selection,result.rows,0,'unknown'),null);
  assert.deepEqual(findAlternatives(c,selection,result.rows)[0],[]);
});

test('Shopping list groups eligible offers, quantities, barter ingredients and missing offers',()=>{
  const c=structuredClone(catalog);
  c.items.expensive.offers=[];
  c.items.expensive.barters=[{trader:skier,kind:'barter',priceRUB:500,rewardCount:2,minTraderLevel:1,taskUnlock:null,requiredItems:[{name:'Bolts',count:3,attributes:{}}]}];
  const rows=[{itemId:'cheap'},{itemId:'cheap'},{itemId:'expensive'},{itemId:'expensive'},{itemId:'unknown'}];
  const list=createShoppingList(c,options,rows);
  assert.equal(list.groups.length,2);
  assert.equal(list.groups.find(group=>group.kind==='cash').items[0].quantity,2);
  assert.equal(list.groups.find(group=>group.kind==='barter').items[0].quantity,2);
  assert.equal(list.unavailable.length,1);
  assert.equal(list.cost.priceRUB,1200);
  const text=formatShoppingList(list);
  assert.match(text,/Skier · Barter/);
  assert.match(text,/1 trade: 3 × Bolts/);
  assert.match(text,/2 × cheap/);
  assert.match(text,/No eligible trader offer/);
});

test('Theme choices normalize unknown saved values and apply to the root',()=>{
  assert.equal(normalizeTheme('bourbon'),'bourbon');
  assert.equal(normalizeTheme('not-a-theme'),'original');
  const root={dataset:{}};
  assert.equal(applyTheme('blue',root),'blue');
  assert.equal(root.dataset.theme,'blue');
  assert.equal(applyTheme(null,root),'original');
});
