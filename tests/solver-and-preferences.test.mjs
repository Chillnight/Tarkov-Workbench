// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import loadHighs from 'highs';
import {createProblem,optimize,validateBuild} from '../dist/optimizer.mjs';
import {variantCacheKey} from '../dist/weapon-configuration.mjs';
import {attachmentCacheKey} from '../dist/attachment-picker.mjs';
import {findAlternatives} from '../dist/alternatives.mjs';
import {TRADERS} from '../dist/traders.mjs';

const solver=await loadHighs();
const trader=TRADERS[0].id;
const offer=price=>({trader,price,priceRUB:price,currency:'RUB',minTraderLevel:1,taskUnlock:null});
const part=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],categories:[],category:'Foregrip',ergo:0,recoil:0,weight:0.1,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],offers:[],barters:[],...extra});
const slot=(id,allowed,required=true)=>({id,key:id,name:id,allowed,required,missing:[]});
const base={weaponId:'w',mode:'ergo',sound:'unsilenced',balance:50,magazine:0,scopeId:null,magazineId:null,maxBudget:null,preferPracticalMounts:false,restrictTraders:true,includeQuestOffers:true,includeBarters:true,includeFleaMarket:false,traderLevels:{[trader]:4}};
// Two grips with identical stats: the free factory grip is heavier than the purchasable one.
const fixture=()=>({items:{
  w:part('w',{types:['gun'],category:'Assault rifle',ergo:40,vertical:100,horizontal:100,factoryParts:{factory:1},slots:[slot('grip',['factory','light','cheap'])]}),
  factory:part('factory',{ergo:5,recoil:-0.02,weight:0.12}),
  light:part('light',{ergo:5,recoil:-0.02,weight:0.08,offers:[offer(9000)]}),
  cheap:part('cheap',{ergo:5,recoil:-0.02,weight:0.10,offers:[offer(1000)]})
}});
const objectiveLine=(catalog,options,objective)=>createProblem(catalog,options).lp(objective).split(/\r?\n/)[1];
function failingSolver(match,failure){
  const calls=[];
  return {calls,solve(lp,settings){
    calls.push(settings);
    if(match(lp,settings))return failure(lp,settings);
    return solver.solve(lp,settings);
  }};
}
const zeroColumns=lp=>{
  const real=solver.solve(lp,{output_flag:false,time_limit:30});
  return {Status:'Time limit reached',ObjectiveValue:Infinity,Columns:Object.fromEntries(Object.keys(real.Columns).map(k=>[k,{Primal:0}]))};
};

test('A refinement stage that times out without a solution keeps the previous valid build',()=>{
  const c=fixture();
  const price=objectiveLine(c,base,'price');
  const mock=failingSolver(lp=>lp.split(/\r?\n/)[1]===price,zeroColumns);
  const result=optimize(c,base,mock);
  assert.equal(result.status,'feasible');
  assert.equal(result.rows.length,1);
  assert.deepEqual(validateBuild(c,base,result.rows),[]);
  assert.equal(result.ergo,45);
});

test('A numerically false infeasible verdict is retried without presolve',()=>{
  const c=fixture();
  const weight=objectiveLine(c,base,'weight');
  const mock=failingSolver((lp,settings)=>lp.split(/\r?\n/)[1]===weight&&settings.presolve!=='off',()=>({Status:'Infeasible',ObjectiveValue:Infinity,Columns:{}}));
  const result=optimize(c,base,mock);
  assert.equal(result.status,'optimal');
  assert.ok(mock.calls.some(settings=>settings.presolve==='off'));
  assert.deepEqual(validateBuild(c,base,result.rows),[]);
});

test('A first stage without any solution reports an unproven result instead of a build',()=>{
  const c=fixture();
  const result=optimize(c,base,{solve:zeroColumns});
  assert.equal(result.status,'unproven');
  assert.match(result.message,/time limit/);
});

const catalogURL=new URL('../dist/data/catalog.json',import.meta.url);
const catalog=existsSync(catalogURL)?JSON.parse(readFileSync(catalogURL,'utf8')):null;
test('TRG M10 with mixed traders and a budget no longer fails its weight stage',{skip:!catalog},()=>{
  const levels=[2,0,1,4,3,2,1,4,2];
  const options={weaponId:'673cab3e03c6a20581028bc1',mode:'ergo',sound:'unsilenced',balance:40,magazine:1,magazineId:'673cbdfad0453ba50c0f76d6',scopeId:null,maxBudget:300000,allowGrenadeLaunchers:false,restrictTraders:true,includeQuestOffers:true,includeBarters:true,includeFleaMarket:false,traderLevels:Object.fromEntries(TRADERS.map((t,i)=>[t.id,levels[i]])),excludeArenaUnlocks:true,preferPracticalMounts:true};
  const result=optimize(catalog,options,solver);
  assert.ok(['optimal','feasible'].includes(result.status));
  assert.deepEqual(validateBuild(catalog,options,result.rows),[]);
  assert.ok(result.cost.priceRUB<=300000);
});

test('Every availability setting, including Flea Market, separates variant and picker caches',()=>{
  const c={meta:{version:'test'}};
  const options={...base,includeFleaMarket:false};
  for(const [key,value] of [['includeFleaMarket',true],['includeBarters',false],['includeQuestOffers',false],['restrictTraders',false],['excludeArenaUnlocks',false],['allowGrenadeLaunchers',true],['traderLevels',{[trader]:1}]]){
    assert.notEqual(variantCacheKey(c,options),variantCacheKey(c,{...options,[key]:value}),key);
    assert.notEqual(attachmentCacheKey(c,options,'scope'),attachmentCacheKey(c,{...options,[key]:value},'scope'),key);
  }
});

test('Unrestricted planning may use a factory part without an offer more than once',()=>{
  const c={items:{w:part('w',{types:['gun'],category:'Assault rifle',ergo:40,vertical:100,horizontal:100,factoryParts:{grip:1},slots:[slot('a',['grip'],false),slot('b',['grip'],false)]}),grip:part('grip',{ergo:5})}};
  const restricted=optimize(c,base,solver),unrestricted=optimize(c,{...base,restrictTraders:false},solver);
  assert.equal(restricted.rows.length,1);
  assert.equal(unrestricted.rows.length,2);
  assert.deepEqual(validateBuild(c,{...base,restrictTraders:false},unrestricted.rows),[]);
});

test('Displayed Ergo and recoil are the exact sums of the final parts',()=>{
  const c=fixture();
  const result=optimize(c,base,solver);
  const parts=[base.weaponId,...result.rows.map(row=>row.itemId)].map(id=>c.items[id]);
  assert.equal(result.rawErgo,parts.reduce((sum,item)=>sum+item.ergo,0));
  assert.equal(result.recoil,Math.round(parts.reduce((sum,item)=>sum+item.recoil,0)*1e8)/1e8);
});

test('Prefer lighter parts decides between weight and price at equal performance',()=>{
  for(const mode of ['ergo','recoil','balanced']){
    const lighter=optimize(fixture(),{...base,mode},solver);
    assert.equal(lighter.rows[0].itemId,'light',mode);
    assert.equal(lighter.cost.priceRUB,9000);
    // Off: the free factory part is kept even though it is heavier.
    const cheaper=optimize(fixture(),{...base,mode,preferLighterParts:false},solver);
    assert.equal(cheaper.rows[0].itemId,'factory',mode);
    assert.equal(cheaper.cost.priceRUB,0);
    assert.equal(cheaper.ergo,lighter.ergo);
    assert.equal(cheaper.recoil,lighter.recoil);
  }
  // Without a factory part, the cheaper purchase wins; weight only breaks price ties.
  const c=fixture();delete c.items.w.factoryParts.factory;
  assert.equal(optimize(c,{...base,preferLighterParts:false},solver).rows[0].itemId,'cheap');
  const tie=fixture();tie.items.w.factoryParts={};tie.items.cheap.offers=[offer(9000)];
  assert.equal(optimize(tie,{...base,preferLighterParts:false},solver).rows[0].itemId,'light');
});

test('Alternatives are listed in the order of the selected weight preference',()=>{
  const c=fixture();
  const rows=optimize(c,base,solver).rows;
  assert.deepEqual(findAlternatives(c,base,rows)[0],['cheap','factory']);
  assert.deepEqual(findAlternatives(c,{...base,preferLighterParts:false},rows)[0],['factory','cheap']);
  const kept=optimize(c,{...base,preferLighterParts:false},solver).rows;
  assert.deepEqual(findAlternatives(c,{...base,preferLighterParts:false},kept)[0],['cheap','light']);
  assert.deepEqual(findAlternatives(c,base,kept)[0],['light','cheap']);
});
