// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import loadHighs from 'highs';
import {optimize,validateBuild} from '../dist/optimizer.mjs';
import {findAlternatives,replaceAttachment,applyAlternative,alternativeWeightLabel} from '../dist/alternatives.mjs';
const solver=await loadHighs();
const catalog=JSON.parse(readFileSync(new URL('../dist/data/catalog.json',import.meta.url)));
const sun='61714b2467085e45ef140b2c',standard='616554fe50224f204c1da2aa',t1='58d399e486f77442e0016fe7';
const slim='5bb20e70d4351e0035629f8f',ds='5fbbaa86f9986c4cff3fe5f6';
const slot=(id,allowed,required=false)=>({id,key:id,name:id,allowed,required,missing:[]});
const item=(id,extra={})=>({id,name:id,shortName:id,types:['mods'],category:'Stock',ergo:0,recoil:0,weight:1,slots:[],categories:[],conflicts:[],conflictCategories:[],blockedSlots:[],...extra});
const options={weaponId:'w',mode:'ergo',sound:'unsilenced',scopeId:t1,balance:75,magazine:0};
function fixture(){return {items:{w:item('w',{types:['gun'],category:'Weapon',ergo:50,vertical:100,horizontal:200,slots:[slot('scope',[sun,standard]),slot('stock',[slim,ds],true)]}),...Object.fromEntries([sun,standard,t1,slim,ds].map(id=>[id,structuredClone(catalog.items[id])]))}};}

test('Standard T-1 mounts beat cheaper Sunshade housings in practical mode, in every objective',()=>{
  for(const mode of ['ergo','recoil','balanced']){
    const c=fixture(),o={...options,mode};
    const strict=optimize(c,{...o,preferPracticalMounts:false},solver),r=optimize(c,o,solver);
    assert.ok(strict.rows.some(r=>r.itemId===sun));assert.ok(r.rows.some(r=>r.itemId===standard));
    assert.ok(r.rows.some(r=>r.itemId===t1));assert.equal(r.practical.specialMountsRemoved,1);
    assert.equal(r.ergo,strict.ergo);assert.equal(r.recoil,strict.recoil);
    assert.deepEqual(validateBuild(c,o,r.rows),[]);
  }
});
test('Ordinary mount preference respects the four-Ergo bound, availability and conflicts',()=>{
  let c=fixture();c.items[standard].ergo=-4;
  assert.ok(optimize(c,options,solver).rows.some(r=>r.itemId===standard));
  c.items[standard].ergo=-4.01;assert.ok(optimize(c,options,solver).rows.some(r=>r.itemId===sun));
  c=fixture();c.items[standard].conflicts=[t1];assert.ok(optimize(c,options,solver).rows.some(r=>r.itemId===sun));
  c=fixture();c.items[standard].offers=[];assert.ok(optimize(c,{...options,restrictTraders:true,traderLevels:{'5c0647fdd443bc2504c2d371':4,'5935c25fb3acc3127c3d8cd9':4}},solver).rows.some(r=>r.itemId===sun));
});
test('Lighter DS150 beats cheaper Slim Line at equal performance in every mode',()=>{
  for(const mode of ['ergo','recoil','balanced'])for(const preferPracticalMounts of [true,false]){
    const c=fixture(),o={...options,mode,preferPracticalMounts},r=optimize(c,o,solver);
    assert.ok(r.rows.some(r=>r.itemId===ds));assert.ok(!r.rows.some(r=>r.itemId===slim));
    const index=r.rows.findIndex(r=>r.itemId===ds);
    assert.ok(findAlternatives(c,o,r.rows)[index].includes(slim));
    const swapped=applyAlternative(c,o,r,index,slim);
    assert.ok(Math.abs(swapped.weight-r.weight-.295)<1e-8);
    assert.ok(swapped.cost.priceRUB<r.cost.priceRUB);assert.equal(swapped.ergo,r.ergo);assert.equal(swapped.recoil,r.recoil);
    assert.equal(alternativeWeightLabel(c.items[ds],c.items[slim]),'+295 g vs current part');
    assert.ok(findAlternatives(c,o,swapped.rows)[index].includes(ds));
    c.items[slim].weight=c.items[ds].weight;
    assert.ok(optimize(c,o,solver).rows.some(r=>r.itemId===slim));
  }
});
test('T-1 mount swaps work both ways despite unused slots and conflicts with absent items',()=>{
  const c=fixture(),r=optimize(c,options,solver),index=r.rows.findIndex(r=>r.itemId===standard);
  const swapped=replaceAttachment(c,options,r.rows,index,sun);
  assert.ok(swapped);assert.deepEqual(validateBuild(c,options,swapped),[]);
  assert.ok(findAlternatives(c,options,swapped)[index].includes(standard));
  c.items[sun].conflicts.push(t1);assert.equal(replaceAttachment(c,options,r.rows,index,sun),null);
});
test('Actual RSASS + T-1 uses an ordinary compatible mount and all offered swaps validate',()=>{
  const o={...options,weaponId:'5a367e5dc4a282000e49738f'},r=optimize(catalog,o,solver);
  assert.equal(r.status,'optimal');assert.ok(!r.rows.some(r=>r.itemId===sun));
  const optic=r.rows.find(row=>row.itemId===t1),mount=r.rows[optic.parent-1];
  assert.ok([standard,'58d39d3d86f77445bb794ae7','5b31163c5acfc400153b71cb'].includes(mount.itemId));
  assert.deepEqual(validateBuild(catalog,o,r.rows),[]);
  for(const [index,ids] of findAlternatives(catalog,o,r.rows).entries())for(const id of ids){
    assert.ok(replaceAttachment(catalog,o,r.rows,index,id));
  }
});
