// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import loadHighs from 'highs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
import {findAlternatives,replaceAttachment} from '../dist/alternatives.mjs';
import {matchesOpticFilter,zoomLabel,reachableOptics,classifyOpticMounts} from '../dist/optics.mjs';
const solver=await loadHighs();
const slot=(id,allowed,required=false,key=id)=>({id,name:key,key,allowed,required,missing:[]});
const item=(id,extra={})=>({id,name:id,shortName:id,ergo:0,recoil:0,weight:1,types:['mods'],category:'Mount',categories:[],conflicts:[],conflictCategories:[],blockedSlots:[],suppressor:false,slots:[],...extra});
const options={weaponId:'w',mode:'ergo',sound:'unsilenced',magazine:0,balance:80,scopeId:'vudu'};
function fixture(){
  const items={w:item('w',{types:['gun'],category:'Weapon',ergo:50,vertical:100,horizontal:200,slots:[slot('top',['rail','badRail','empty']),slot('cover',['cover','equal','blocks','different','reverse'],true)]}),
    rail:item('rail',{ergo:-2,slots:[slot('rail-mount',['ring'],false,'mod_mount')]}),
    badRail:item('badRail',{ergo:10,conflicts:['vudu'],slots:[slot('bad-mount',['ring'],false,'mod_mount')]}),
    ring:item('ring',{ergo:.5,slots:[slot('lens',['vudu','badScope'],false,'mod_scope'),slot('cap',['cap'],true,'mod_mount')]}),
    empty:item('empty',{ergo:20,slots:[slot('unused',['badScope'],false,'mod_scope')]}),
    vudu:item('vudu',{ergo:-3,category:'Scope',zoomLevels:[[6,1]]}),
    badScope:item('badScope',{ergo:20,category:'Scope',zoomLevels:[[1]]}),cap:item('cap'),
    cover:item('cover',{ergo:2,category:'Receiver'}),equal:item('equal',{ergo:2,category:'Receiver'}),
    blocks:item('blocks',{ergo:2,category:'Receiver',conflicts:['vudu']}),
    different:item('different',{ergo:2,weight:2,category:'Receiver'}),
    reverse:item('reverse',{ergo:2,category:'Receiver'})};
  items.vudu.conflicts=['reverse'];classifyOpticMounts(items);return {items};
}
test('An exact scope is fitted once through its compatible negative-stat adapter chain',()=>{
  const c=fixture(),r=optimize(c,options,solver);
  assert.equal(r.status,'optimal');
  assert.ok(r.rows.some(x=>x.itemId==='vudu'));assert.ok(r.rows.some(x=>x.itemId==='rail'));
  assert.ok(r.rows.some(x=>x.itemId==='ring'));assert.ok(r.rows.some(x=>x.itemId==='cap'));
  assert.ok(!r.rows.some(x=>['badScope','empty','badRail'].includes(x.itemId)));
  assert.deepEqual(validateBuild(c,options,r.rows),[]);
});
test('No optic never adds a random optic or an empty dedicated scope mount',()=>{
  const c=fixture(),o={...options,scopeId:null},r=optimize(c,o,solver);
  assert.ok(!r.rows.some(x=>['vudu','badScope','ring','empty','rail','badRail'].includes(x.itemId)));
  assert.equal(r.ergo,52);
});
test('Iron sights are the default even when front and rear sights reduce ergonomics',()=>{
  const c=fixture();
  c.items.w.slots.push(slot('front',['front','fake'],false,'mod_sight_front'),slot('rear',['rear'],false,'mod_sight_rear'));
  c.items.front=item('front',{category:'Ironsight',ergo:-2});c.items.rear=item('rear',{category:'Ironsight',ergo:-3});
  c.items.fake=item('fake',{category:'Mount',ergo:20});
  const o={...options,scopeId:null},r=optimize(c,o,solver);
  assert.ok(r.rows.some(x=>x.itemId==='front'));assert.ok(r.rows.some(x=>x.itemId==='rear'));
  assert.ok(!r.rows.some(x=>x.itemId==='fake'));assert.equal(r.ergo,47);
  assert.ok(validateBuild(c,o,r.rows.filter(x=>x.itemId!=='rear')).length);
  const scoped=optimize(c,options,solver);assert.ok(!scoped.rows.some(x=>x.itemId==='rear'));
});
test('Unreachable or conflicting optics report infeasible instead of being silently replaced',()=>{
  const c=fixture();c.items.w.slots[0].allowed=['empty'];
  assert.equal(optimize(c,options,solver).status,'infeasible');
  c.items.w.slots[0].allowed=['badRail'];assert.equal(optimize(c,options,solver).status,'infeasible');
  assert.throws(()=>optimize(c,{...options,scopeId:'missing'},solver),/Unknown scope/);
});
test('Iron-sight builds cannot drop the mount needed to carry the rear sight',()=>{
  const c=fixture();c.items.w.slots.push(slot('rear-platform',['rearMount']));
  c.items.rearMount=item('rearMount',{ergo:-2,slots:[slot('rear-slot',['rear'],false,'mod_sight_rear')]});
  c.items.rear=item('rear',{category:'Ironsight',ergo:-3});
  const o={...options,scopeId:null},r=optimize(c,o,solver);
  assert.ok(r.rows.some(x=>x.itemId==='rearMount'));assert.ok(r.rows.some(x=>x.itemId==='rear'));
  assert.ok(validateBuild(c,o,r.rows.filter(x=>!['rearMount','rear'].includes(x.itemId))).length);
});
test('The validator rejects a removed or substituted selected optic',()=>{
  const c=fixture(),r=optimize(c,options,solver);
  assert.ok(validateBuild(c,options,r.rows.filter(x=>x.itemId!=='vudu')).length);
});
test('Scope filters use primary zoom modes and omit scopes only accessible through another optic',()=>{
  const c=fixture();assert.equal(zoomLabel(c.items.vudu),'1–6×');assert.ok(matchesOpticFilter(c.items.vudu,'1-6'));
  const aug=item('aug',{category:'Assault scope',zoomLevels:[[1.5],[1]]});assert.equal(zoomLabel(aug),'1.5×');
  c.items.vudu.slots.push(slot('backup',['backup']));c.items.backup=item('backup',{category:'Reflex sight'});
  assert.ok(!reachableOptics(c,'w').some(i=>i.id==='backup'));
});
test('Alternatives preserve performance and reject conflicts only with installed parts',()=>{
  const c=fixture(),r=optimize(c,options,solver),index=r.rows.findIndex(x=>c.items[x.itemId].category==='Receiver');
  r.rows[index].itemId='cover';
  const alternatives=findAlternatives(c,options,r.rows)[index];
  assert.deepEqual(alternatives,['equal','different']);
  c.items.equal.conflictCategories=['future'];c.items.future=item('future',{categories:['future']});
  const rows=r.rows.map((r,i)=>i===index?{...r,itemId:'cover'}:r);
  assert.ok(findAlternatives(c,options,rows)[index].includes('equal'));
  c.items.vudu.categories=['future'];
  assert.ok(!findAlternatives(c,options,rows)[index].includes('equal'));
  c.items.equal.conflictCategories=[];c.items.equal.blockedSlots=['unused-slot'];
  assert.ok(findAlternatives(c,options,rows)[index].includes('equal'));
  c.items.equal.blockedSlots=['lens'];
  assert.ok(!findAlternatives(c,options,rows)[index].includes('equal'));
});
test('Equivalent mounts remap child slot IDs and preserve the complete scope assembly',()=>{
  const c=fixture();c.items.ring2=item('ring2',{ergo:.5,slots:[slot('lens2',['vudu','badScope'],false,'mod_scope'),slot('cap2',['cap'],true,'mod_mount')]});
  c.items.rail.slots[0].allowed.push('ring2');classifyOpticMounts(c.items);
  const r=optimize(c,options,solver),index=r.rows.findIndex(x=>['ring','ring2'].includes(x.itemId));
  const other=r.rows[index].itemId==='ring'?'ring2':'ring';
  assert.ok(findAlternatives(c,options,r.rows)[index].includes(other));
  const swapped=replaceAttachment(c,options,r.rows,index,other);
  assert.deepEqual(validateBuild(c,options,swapped),[]);
  assert.ok(swapped.find(x=>x.itemId==='vudu').path.includes(other));
  c.items[other].slots[0].allowed=['badScope'];assert.equal(replaceAttachment(c,options,r.rows,index,other),null);
});
