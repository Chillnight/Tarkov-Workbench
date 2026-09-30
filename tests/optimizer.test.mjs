// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import loadHighs from 'highs';
import {optimize,validateBuild,createProblem} from '../dist/optimizer.mjs';
const solver=await loadHighs();
const slot=(id,allowed,required=false,key=id)=>({id,name:id,key,allowed,required,missing:[]});
const item=(id,ergo=0,recoil=0,slots=[],extra={})=>({id,name:id,shortName:id,ergo,recoil,slots,types:['mods'],categories:[],conflicts:[],conflictCategories:[],blockedSlots:[],weight:1,suppressor:false,...extra});
const opts=(mode='ergo',sound='unsilenced',extra={})=>({weaponId:'w',mode,sound,magazine:0,balance:80,...extra});
function fixture(){return {items:{w:item('w',40,0,[slot('grip',['e','r','b'],true),slot('muzzle',['adapter']),slot('rail',['panel']),slot('rail2',['panel'])],{types:['gun'],vertical:100,horizontal:200}),e:item('e',20,0),r:item('r',-20,-.3),b:item('b',10,-.15),adapter:item('adapter',-1,-.01,[slot('silencer',['silencer'])]),silencer:item('silencer',-10,-.1,[],{suppressor:true}),panel:item('panel',2,0)}};}
test('Global objectives match independently enumerated combinations',()=>{
  for(const mode of ['ergo','recoil','balanced'])for(const sound of ['silenced','unsilenced']){
    const c=fixture(),o=opts(mode,sound),r=optimize(c,o,solver);const candidates=[];
    for(const grip of ['e','r','b'])for(const muzzle of [[],['adapter'],['adapter','silencer']])for(const panels of [0,1,2]){
      if(muzzle.includes('silencer')!==(sound==='silenced'))continue;
      const ids=['w',grip,...muzzle,...Array(panels).fill('panel')];
      candidates.push({ergo:ids.reduce((s,k)=>s+c.items[k].ergo,0),recoil:ids.reduce((s,k)=>s+c.items[k].recoil,0)});
    }
    const max=Math.max(...candidates.map(x=>x.ergo));
    const eligible=mode==='balanced'?candidates.filter(x=>x.ergo>=Math.min(max,o.balance)):candidates;
    eligible.sort((a,b)=>mode==='ergo'?(b.ergo-a.ergo||a.recoil-b.recoil):(a.recoil-b.recoil||b.ergo-a.ergo));
    assert.equal(r.status,'optimal');assert.ok(Math.abs(r.ergo-eligible[0].ergo)<1e-6);assert.ok(Math.abs(r.recoil-eligible[0].recoil)<1e-6);
    assert.deepEqual(validateBuild(c,o,r.rows),[]);
  }
});
test('Adapters and repeated attachments remain correctly assembled',()=>{
  const c=fixture(),o=opts('ergo','silenced'),r=optimize(c,o,solver);
  assert.equal(r.rows.filter(x=>x.itemId==='panel').length,2);
  const silence=r.rows.find(x=>x.itemId==='silencer');assert.equal(r.rows[silence.parent-1].itemId,'adapter');
});
test('One-way conflicts are enforced in both directions',()=>{
  const c=fixture();c.items.panel.conflicts=['e'];const r=optimize(c,opts(),solver);
  assert.equal(r.ergo,60);assert.equal(r.rows.some(x=>x.itemId==='panel'),false);
});
test('Blocked slots and category conflicts apply globally',()=>{
  const c=fixture();c.items.e.blockedSlots=['rail'];c.items.e.conflictCategories=['panelCategory'];c.items.panel.categories=['panelCategory'];
  const r=optimize(c,opts(),solver);assert.equal(r.ergo,60);assert.equal(r.rows.some(x=>x.itemId==='panel'),false);
  c.items.e.conflictCategories=[];const r2=optimize(c,opts(),solver);assert.equal(r2.ergo,62);
});
test('Unsilenced is unavailable with an integral suppressor',()=>{
  const c=fixture();c.items.w.suppressor=true;
  assert.equal(optimize(c,opts('ergo','unsilenced'),solver).status,'infeasible');
});
test('Magazine capacity and required parts are enforced',()=>{
  const c=fixture();c.items.w.slots.push(slot('mag',['small','large'],false,'mod_magazine'));
  c.items.small=item('small',5,0,[],{capacity:10});c.items.large=item('large',-5,0,[],{capacity:30});
  const r=optimize(c,opts('ergo','unsilenced',{magazine:30}),solver);assert.ok(r.rows.some(x=>x.itemId==='large'));assert.ok(!r.rows.some(x=>x.itemId==='small'));
  c.items.w.slots.push(slot('required',[],true));assert.equal(optimize(c,opts(),solver).status,'infeasible');
});
test('The 100-Ergo cap uses recoil as a tie-breaker',()=>{
  const c=fixture();c.items.w.ergo=100;const r=optimize(c,opts(),solver);assert.equal(r.ergo,100);assert.ok(r.rows.some(x=>x.itemId==='b'));
});
test('The 0-Ergo cap allows negative raw values',()=>{
  const c=fixture();c.items.w.ergo=-50;const r=optimize(c,opts(),solver);assert.equal(r.ergo,0);assert.ok(r.rows.some(x=>x.itemId==='r'));
});
test('Invalid assemblies and cyclic data are rejected',()=>{
  const c=fixture();assert.ok(validateBuild(c,opts(),[{itemId:'silencer',parent:0,slotId:'grip'}]).length);
  c.items.e.slots.push(slot('cycle',['w'],true));assert.throws(()=>createProblem(c,opts()),/Cyclic/);
});
