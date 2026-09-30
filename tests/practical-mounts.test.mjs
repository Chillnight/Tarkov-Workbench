// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import loadHighs from 'highs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
const solver=await loadHighs();
const slot=(id,allowed,required=false)=>({id,key:id,name:id,allowed,required,missing:[]});
const item=(id,extra={})=>({id,name:id,shortName:id,category:'Mount',types:['mods'],slots:[],ergo:0,recoil:0,weight:1,conflicts:[],conflictCategories:[],categories:[],blockedSlots:[],...extra});
const options={weaponId:'w',mode:'balanced',balance:75,sound:'unsilenced',scopeId:'scope',magazine:0};
function fixture(loss=4){return {items:{
  w:item('w',{types:['gun'],category:'Weapon',ergo:75,vertical:100,horizontal:200,slots:[slot('rail',['long','short'])]}),
  long:item('long',{ergo:loss,slots:[slot('adapter',['adapter'])]}),
  adapter:item('adapter',{slots:[slot('lens',['scope'])]}),
  short:item('short',{slots:[slot('lens-direct',['scope'])]}),
  scope:item('scope',{category:'Scope'})
}};}
test('Practical mounting is default-on in all objectives and allows exactly four Ergo loss',()=>{
  for(const mode of ['ergo','recoil','balanced']){
    const c=fixture(),o={...options,mode};
    const reference=optimize(c,{...o,preferPracticalMounts:false},solver),practical=optimize(c,o,solver);
    assert.equal(reference.ergo,79);assert.equal(practical.ergo,75);
    assert.equal(practical.recoil,reference.recoil);assert.equal(practical.practical.ergoLoss,4);
    assert.equal(practical.practical.mountsRemoved,1);assert.ok(practical.rows.some(r=>r.itemId==='short'));
    assert.deepEqual(validateBuild(c,o,practical.rows),[]);
  }
});
test('Mount simplification never exceeds four Ergo or worsens recoil',()=>{
  const c=fixture(4.01),r=optimize(c,options,solver);
  assert.equal(r.practical.applied,false);assert.ok(r.rows.some(r=>r.itemId==='long'));
  const d=fixture();d.items.long.recoil=-.1;
  const s=optimize(d,options,solver);assert.equal(s.practical.applied,false);assert.equal(s.recoil,-.1);
});
test('Balanced uses a 0-100 target and falls back to the closest achievable maximum',()=>{
  const c=fixture();c.items.w.ergo=60;
  const r=optimize(c,{...options,preferPracticalMounts:false},solver);
  assert.equal(r.status,'optimal');assert.equal(r.ergo,64);assert.equal(r.balanceTarget,75);assert.equal(r.balanceShortfall,11);
  const practical=optimize(c,options,solver);
  assert.equal(practical.ergo,60);assert.equal(practical.balanceShortfall,15);assert.equal(practical.practical.ergoLoss,4);
  const feasible=fixture();feasible.items.short.recoil=-.2;
  const target=optimize(feasible,{...options,preferPracticalMounts:false},solver);
  assert.equal(target.ergo,75);assert.equal(target.recoil,-.2);assert.equal(target.balanceShortfall,0);
});
test('Practical Balanced may cross its target, but only within the four-Ergo mounting tolerance',()=>{
  const c=fixture();c.items.w.ergo=72;
  const r=optimize(c,options,solver);
  assert.equal(r.ergo,72);assert.equal(r.balanceShortfall,3);assert.equal(r.practical.baselineErgo,76);
});
test('Mandatory mounting chains and selected suppressors remain intact',()=>{
  const c=fixture();c.items.w.slots[0].allowed=['long'];
  c.items.w.slots.push(slot('muzzle',['silencer'],true));c.items.silencer=item('silencer',{category:'Silencer',suppressor:true,recoil:-.1});
  const o={...options,sound:'silenced'},r=optimize(c,o,solver);
  assert.equal(r.status,'optimal');assert.ok(r.rows.some(r=>r.itemId==='adapter'));
  assert.ok(r.rows.some(r=>r.itemId==='scope'));assert.ok(r.rows.some(r=>r.itemId==='silencer'));
  assert.deepEqual(validateBuild(c,o,r.rows),[]);
  assert.equal(optimize(c,{...o,sound:'unsilenced'},solver).status,'infeasible');
});
test('Main weapon parts cannot be traded away to unlock a simpler mounting route',()=>{
  const c=fixture();c.items.w.slots.push(slot('grip',['grip'],true));
  c.items.grip=item('grip',{category:'Pistol grip',conflicts:['short']});
  assert.equal(optimize(c,options,solver).practical.applied,false);
});
test('Same mount count does not spend Ergo just to reduce weight',()=>{
  const c=fixture();c.items.w.slots[0].allowed=['short','light'];c.items.short.ergo=4;
  c.items.light=item('light',{weight:.1,slots:[slot('light-lens',['scope'])]});
  const r=optimize(c,options,solver);assert.equal(r.ergo,79);assert.equal(r.practical.applied,false);
});
test('VAL MOD.4 uses its top cover instead of the AK-303M chain in practical mode',()=>{
  const c=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
  const o={...options,weaponId:'6871284e9a353bb50606f3ed',scopeId:'5b3b99475acfc432ff4dcbee',sound:'silenced',magazine:1};
  const max=optimize(c,{...o,preferPracticalMounts:false},solver),r=optimize(c,o,solver);
  assert.equal(r.status,'optimal');assert.equal(r.recoil,max.recoil);assert.ok(max.ergo-r.ergo<=4+1e-6);
  assert.ok(max.rows.some(r=>r.itemId==='65f1b1176dbd6c5ba2082eed'));
  assert.ok(!r.rows.some(r=>r.itemId==='65f1b1176dbd6c5ba2082eed'));
  assert.ok(r.rows.some(r=>r.itemId==='68712bd4251b8d4c6c04ec19'));
  assert.equal(r.practical.mountsRemoved,2);assert.deepEqual(validateBuild(c,o,r.rows),[]);
});
