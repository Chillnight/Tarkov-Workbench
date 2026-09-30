// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import loadHighs from 'highs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
import {defaultTraderSettings,normalizeTraderSettings,cheapestOffer,offerLabel,buildCost} from '../dist/traders.mjs';
import {isAvailable} from '../dist/availability.mjs';
import {mountProfile} from '../dist/mount-profiles.mjs';
import {prepareUpdate} from '../dist/data-update.mjs';
import {DATA_URL,NAMES_URL} from '../dist/catalog-import.mjs';
import {BARTERS_URL} from '../dist/barters.mjs';
const solver=await loadHighs();
const high='5a33b652c4a28232996e407c',low='5a33b2c9c4a282000c5a9511';
const slot=(id,allowed,required=false)=>({id,key:id,name:id,allowed,required,missing:[]});
const item=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],category:'Mount',ergo:0,recoil:0,weight:1,slots:[],categories:[],conflicts:[],conflictCategories:[],blockedSlots:[],...extra});
const options={weaponId:'w',sound:'unsilenced',magazine:0,scopeId:'scope',mode:'ergo',balance:75};
function fixture(loss=4){return {items:{w:item('w',{types:['gun'],ergo:60,vertical:100,horizontal:200,slots:[slot('rail',[high,low])]}),[high]:item(high,{ergo:loss,slots:[slot('lens',['scope'])]}),[low]:item(low,{slots:[slot('lens-low',['scope'])]}),scope:item('scope',{category:'Scope',ergo:-10})}};}
test('Low-profile mounts win at equal part count within four Ergo, with scope fixed in every mode',()=>{
  for(const mode of ['ergo','recoil','balanced']){
    const c=fixture(),o={...options,mode};
    const strict=optimize(c,{...o,preferPracticalMounts:false},solver),r=optimize(c,o,solver);
    assert.ok(strict.rows.some(r=>r.itemId===high));assert.ok(r.rows.some(r=>r.itemId===low));
    assert.equal(r.practical.ergoLoss,4);assert.equal(r.practical.mountsRemoved,0);assert.equal(r.practical.lowerProfile,true);
    assert.equal(r.rows.filter(r=>r.itemId==='scope').length,1);assert.equal(r.recoil,strict.recoil);assert.deepEqual(validateBuild(c,o,r.rows),[]);
  }
});
test('Low mounts cannot exceed the Ergo allowance or violate compatibility',()=>{
  let c=fixture(4.01);assert.ok(optimize(c,options,solver).rows.some(r=>r.itemId===high));
  c=fixture();c.items[low].conflicts=['scope'];assert.ok(optimize(c,options,solver).rows.some(r=>r.itemId===high));
  c=fixture();c.items[low].recoil=.01;assert.ok(optimize(c,options,solver).rows.some(r=>r.itemId===high));
  assert.equal(mountProfile(item('unreviewed',{name:'Lower rail'})),null);
});
test('An impossible pinned optic yields no build instead of falling back to iron sights',()=>{
  const c=fixture();c.items.scope.conflicts=['w'];
  for(const mode of ['ergo','recoil','balanced'])assert.equal(optimize(c,{...options,mode},solver).status,'infeasible');
});
test('6L18 is an available Prapor level 1 barter by default and can be disabled',()=>{
  const c=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
  const mag=c.items['564ca9df4bdc2d35148b4569'],o=defaultTraderSettings();
  assert.equal(o.includeBarters,true);assert.equal(normalizeTraderSettings({}).includeBarters,true);
  assert.equal(isAvailable(mag,o),true);assert.equal(cheapestOffer(mag,o).kind,'barter');
  assert.match(offerLabel(mag,o),/Prapor LL1.*Barter:/);assert.match(offerLabel(mag,o),/1 ×/);
  assert.equal(isAvailable(mag,{...o,includeBarters:false}),false);
  assert.equal(isAvailable(mag,{...o,traderLevels:{...o.traderLevels,'54cb50c76803fa8b248b4571':0}}),false);
});
test('Unknown barter values remain eligible and never become a free price',()=>{
  const barter={id:'trade',kind:'barter',trader:'p',minTraderLevel:1,taskUnlock:'quest',priceRUB:null,rewardCount:1,requiredItems:[{id:'i',name:'Ingredient',count:2,attributes:{}}]};
  const i=item('i',{offers:[],barters:[barter]}),o={restrictTraders:true,traderLevels:{p:1}};
  assert.equal(isAvailable(i,o),true);assert.match(offerLabel(i,o),/value unknown/);
  assert.equal(buildCost({items:{i}},o,[{itemId:'i'}]).unpriced,1);
  assert.equal(isAvailable(i,{...o,includeQuestOffers:false}),false);
  i.offers=[{trader:'p',price:100,priceRUB:100,currency:'RUB',minTraderLevel:1,taskUnlock:null}];
  assert.equal(cheapestOffer(i,o).priceRUB,100);
});
test('A failed barter download leaves the active snapshot unchanged',async()=>{
  const c=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url))),before=JSON.stringify(c);
  await assert.rejects(prepareUpdate({current:c,bundled:c,overrides:{items:{}},fetcher:async url=>{
    if(url===BARTERS_URL)return new Response('Unavailable',{status:503});
    if(url===DATA_URL||url===NAMES_URL)return new Response('{}');throw new Error('Unexpected image request');
  }}),/503/);assert.equal(JSON.stringify(c),before);
});
