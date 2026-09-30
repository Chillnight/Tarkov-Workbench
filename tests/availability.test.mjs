// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import loadHighs from 'highs';
import {ARENA_UNLOCKS,isAvailable} from '../dist/availability.mjs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
import {reachableOptics} from '../dist/optics.mjs';
import {findAlternatives,replaceAttachment} from '../dist/alternatives.mjs';
const solver=await loadHighs();
const locked='698b338649b46ae2d0092e82';
const slot=(id,allowed,required=false)=>({id,key:id,name:id,allowed,required,missing:[]});
const item=(id,extra={})=>({id,name:id,shortName:id,ergo:0,recoil:0,weight:1,category:'Stock',types:['mods'],categories:[],slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],...extra});
const options={weaponId:'w',mode:'ergo',sound:'unsilenced',magazine:0,balance:80,scopeId:null};
function fixture(){return {items:{
  w:item('w',{types:['gun'],ergo:40,vertical:100,horizontal:200,slots:[slot('stock',[locked,'regular'],true),slot('muzzle',['silencer'])]}),
  [locked]:item(locked,{ergo:30,recoil:-.3}),regular:item('regular',{ergo:10,recoil:-.1,types:['mods','noFlea'],trader:'Ref'}),
  silencer:item('silencer',{suppressor:true,ergo:-5,recoil:-.05})
}};}
test('Default excludes rewards for every objective and suppressor variant; opt-in restores them',()=>{
  for(const mode of ['ergo','recoil','balanced'])for(const sound of ['silenced','unsilenced']){
    const c=fixture(),o={...options,mode,sound},filtered=optimize(c,o,solver),all=optimize(c,{...o,excludeArenaUnlocks:false},solver);
    assert.equal(filtered.status,'optimal');assert.equal(all.status,'optimal');
    assert.ok(filtered.rows.some(r=>r.itemId==='regular'));assert.ok(!filtered.rows.some(r=>r.itemId===locked));
    assert.ok(all.rows.some(r=>r.itemId===locked));assert.ok(filtered.ergo<all.ergo);
    assert.deepEqual(validateBuild(c,o,filtered.rows),[]);
    assert.ok(validateBuild(c,o,all.rows).some(e=>e.includes('Item excluded by availability settings')));
    if(mode==='balanced')assert.ok(filtered.maxErgo<all.maxErgo);
  }
});
test('Required reward-only slots become infeasible, rather than producing incomplete weapons',()=>{
  const c=fixture();c.items.w.slots[0].allowed=[locked];
  assert.equal(optimize(c,options,solver).status,'infeasible');
  assert.equal(optimize(c,{...options,excludeArenaUnlocks:false},solver).status,'optimal');
});
test('Equivalent alternatives cannot reintroduce a excluded reward',()=>{
  const c=fixture();Object.assign(c.items[locked],{ergo:10,recoil:-.1});
  const r=optimize(c,options,solver),index=r.rows.findIndex(r=>r.itemId==='regular');
  assert.ok(!findAlternatives(c,options,r.rows).flat().includes(locked));
  assert.equal(replaceAttachment(c,options,r.rows,index,locked),null);
  assert.ok(replaceAttachment(c,{...options,excludeArenaUnlocks:false},r.rows,index,locked));
});
test('Optic previews and calculation filter entire mounting paths, including restricted adapters',()=>{
  const c=fixture();c.items.w.slots=[slot('rail',[locked])];
  c.items[locked]=item(locked,{category:'Mount',slots:[slot('sight',['optic'],true)]});
  c.items.optic=item('optic',{category:'Scope',optic:true,ergo:-3});
  assert.deepEqual(reachableOptics(c,'w'),[]);
  assert.deepEqual(reachableOptics(c,'w',{excludeArenaUnlocks:false}).map(i=>i.id),['optic']);
  assert.equal(optimize(c,{...options,scopeId:'optic'},solver).status,'infeasible');
  assert.equal(optimize(c,{...options,scopeId:'optic',excludeArenaUnlocks:false},solver).status,'optimal');
});
test('Reward weapons are refused by the optimizer and validator as well as the picker',()=>{
  const c=fixture(),id='6895bb82c4519957df062f82';c.items[id]={...c.items.w,id};
  assert.equal(optimize(c,{...options,weaponId:id},solver).status,'infeasible');
  assert.equal(optimize(c,{...options,weaponId:id,excludeArenaUnlocks:false},solver).status,'optimal');
});
test('Reviewed catalog IDs exist, all UMS colors are excluded, ordinary Ref mounts remain available',()=>{
  const c=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
  for(const id of Object.keys(ARENA_UNLOCKS))assert.ok(c.items[id],`Unknown registry ID ${id}`);
  const stocks=Object.values(c.items).filter(i=>i.name.includes('Universal Mini Stock'));
  assert.equal(stocks.length,3);assert.ok(stocks.every(i=>!isAvailable(i)));
  assert.ok(isAvailable(c.items['6985bed26be2752c150e6898']));
  assert.ok(isAvailable(c.items['6985bee16be2752c150e689b']));
  const m4='5447a9cd4bdc2dbd208b4567',fc1='6985bebd812f88c79b0eed3b';
  assert.ok(!reachableOptics(c,m4).some(i=>i.id===fc1));
  assert.ok(reachableOptics(c,m4,{excludeArenaUnlocks:false}).some(i=>i.id===fc1));
});
test('Season 3 Ravage variants stay out of an RSASS build with the Arena filter enabled',()=>{
  const c=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
  const variants=Object.values(c.items).filter(i=>i.name.startsWith('AR-15 Lead Star Arms Ravage stock'));
  assert.equal(variants.length,3);
  assert.ok(variants.every(i=>ARENA_UNLOCKS[i.id]&&!isAvailable(i)));
  assert.ok(variants.every(i=>isAvailable(i,{excludeArenaUnlocks:false})));
  const result=optimize(c,{
    weaponId:'5a367e5dc4a282000e49738f',mode:'balanced',sound:'silenced',balance:75,
    magazine:1,magazineId:'65293c7a17e14363030ad308',scopeId:null,
    excludeArenaUnlocks:true,preferPracticalMounts:true
  },solver);
  assert.equal(result.status,'optimal');
  assert.ok(result.rows.every(row=>!ARENA_UNLOCKS[row.itemId]));
  assert.deepEqual(validateBuild(c,{weaponId:'5a367e5dc4a282000e49738f',sound:'silenced',magazine:1,magazineId:'65293c7a17e14363030ad308',excludeArenaUnlocks:true},result.rows),[]);
});
