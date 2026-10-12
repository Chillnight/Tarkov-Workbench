// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, validateImageSource } from '../dist/data-validation.mjs';
import { validateBackpackData, filterBackpacks } from '../dist/backpacks.mjs';
import { validateGearOffers, gearOfferEntries, gearOfferLabel, barterIngredientLabel } from '../dist/gear-offers.mjs';
import { defaultTraderSettings } from '../dist/traders.mjs';
import { rigLayout } from '../dist/rig-layouts.mjs';
import { imageJobs } from '../dist/data-update.mjs';
import { validateSnapshot } from '../dist/database-ui.mjs';
const catalog=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
const bags=Object.values(catalog.backpacks);

test('all saved backpacks have complete non-overlapping reference compartments and remain outside weapon optimization',()=>{
  assert.equal(bags.length,47); validateCatalog(catalog);
  for(const bag of bags){
    assert.equal(catalog.items[bag.id],undefined);
    const layout=rigLayout(bag); assert.equal(layout.reviewed,true,bag.name);
    assert.equal(layout.pockets.reduce((n,p)=>n+p.width*p.height,0),bag.capacity);
    assert.deepEqual(layout.pockets.map(g=>g.width+'x'+g.height).sort(),bag.grids.map(g=>g.width+'x'+g.height).sort());
    for(let i=0;i<layout.pockets.length;i++){
      const a=layout.pockets[i];assert.ok(a.x>=0&&a.y>=0&&a.x+a.width<=layout.width+1e-8&&a.y+a.height<=layout.height+1e-8);
      for(const b of layout.pockets.slice(i+1))assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,bag.name+' compartments overlap');
    }
  }
  assert.equal(bags.filter(b=>b.grids.length>1).length,10);
});

test('backpack search and combined storage filters sort numeric weight correctly',()=>{
  assert.equal(filterBackpacks(catalog.backpacks,{search:'nonexistent bag'}).length,0);
  assert.ok(filterBackpacks(catalog.backpacks,{search:'Mechanism'}).some(b=>b.shortName==='Mechanism'));
  const result=filterBackpacks(catalog.backpacks,{minSlots:30,squarePocket:true,sort:'weight'});
  assert.ok(result.length);assert.ok(result.every(b=>b.capacity>=30&&b.grids.some(g=>g.width>=2&&g.height>=2)));
  assert.ok(result.every((b,i)=>!i||b.weight>=result[i-1].weight));
});

test('rigs and backpacks both preserve cash, barter and Flea acquisition data',()=>{
  for(const item of [...bags,...Object.values(catalog.rigs)]){validateGearOffers(item);assert.ok(Array.isArray(item.offers));assert.ok(Array.isArray(item.barters));assert.equal(typeof item.flea.allowed,'boolean');}
  assert.ok(bags.some(b=>b.offers.length&&b.barters.length&&b.flea.allowed));
  assert.ok(Object.values(catalog.rigs).some(b=>b.barters.length));
});

const trader='5ac3b934156ae10c4430e83c',task='000000000000000000000001';
const sample={offers:[{trader,minTraderLevel:3,price:20000,priceRUB:20000,currency:'RUB',taskUnlock:null},{trader,minTraderLevel:2,price:12000,priceRUB:12000,currency:'RUB',taskUnlock:task}],barters:[{id:'barter_fixture',kind:'barter',trader,minTraderLevel:1,taskUnlock:null,rewardCount:2,priceRUB:null,requiredItems:[{id:'customdogtags12345678910',name:'Dogtag',shortName:'Dogtag',count:10,attributes:{minLevel:15}}]}],flea:{allowed:true,minLevel:15,priceRUB:25000}};

test('locked offers remain visible and trader, quest, barter and Flea settings update their availability independently',()=>{
  validateGearOffers(sample);
  let settings=defaultTraderSettings();settings.traderLevels[trader]=1;
  let entries=gearOfferEntries(sample,settings);assert.equal(entries.length,4);
  assert.ok(entries.filter(o=>o.kind==='cash').every(o=>!o.enabled));
  assert.match(entries.find(o=>o.price===20000).status,/Ragman LL3 required/);
  settings.traderLevels[trader]=3;entries=gearOfferEntries(sample,settings);assert.ok(entries.every(o=>o.enabled));
  settings.includeQuestOffers=false;settings.includeBarters=false;settings.includeFleaMarket=false;
  entries=gearOfferEntries(sample,settings);assert.equal(entries.length,4);
  assert.equal(entries.filter(o=>o.enabled).length,1);assert.equal(entries.find(o=>o.taskUnlock).enabled,false);
  settings.restrictTraders=false;settings.traderLevels[trader]=0;settings.includeQuestOffers=true;
  assert.ok(gearOfferEntries(sample,settings).filter(o=>o.kind==='cash').every(o=>o.enabled));
});

test('dogtag conditions and unknown barter values are preserved without inventing a free purchase',()=>{
  const barter=gearOfferEntries(sample,defaultTraderSettings()).find(o=>o.kind==='barter');
  assert.equal(barter.priceRUB,null);assert.match(gearOfferLabel(barter),/Value unknown/);
  assert.equal(barterIngredientLabel(barter.requiredItems[0]),'10 × Dogtag (level 15+)');
  const noPrice={...sample,flea:{allowed:true,minLevel:15,priceRUB:null}};
  assert.match(gearOfferLabel(gearOfferEntries(noPrice,defaultTraderSettings()).find(o=>o.kind==='flea')),/Price unavailable/);
  const denied={...sample,flea:{allowed:false,minLevel:15,priceRUB:25000}};
  assert.ok(gearOfferEntries(denied,defaultTraderSettings()).every(o=>o.kind!=='flea'));
});

test('legacy gear without purchase data loads; malformed new gear prices and backpack geometry are rejected',()=>{
  const legacy=structuredClone(catalog);delete legacy.backpacks;delete legacy.meta.backpackCount;
  for(const rig of Object.values(legacy.rigs)){delete rig.offers;delete rig.barters;delete rig.flea;}
  validateCatalog(legacy);
  assert.throws(()=>validateCatalog(legacy,catalog),/backpacks are missing/);
  const missingOffers=structuredClone(catalog);delete missingOffers.rigs[Object.keys(missingOffers.rigs)[0]].offers;delete missingOffers.rigs[Object.keys(missingOffers.rigs)[0]].barters;delete missingOffers.rigs[Object.keys(missingOffers.rigs)[0]].flea;
  assert.throws(()=>validateCatalog(missingOffers,catalog),/gear purchase offers are missing/);
  for(const mutate of [b=>{b.capacity++;},b=>{b.grids[0].width=0;},b=>{b.weight=-1;},b=>{b.iconSource='https://example.com/image.webp';},b=>{b.flea.priceRUB=0;},b=>{b.offers=[{trader,minTraderLevel:5,price:1,priceRUB:1,currency:'RUB'}];}]){
    const broken=structuredClone(catalog);mutate(broken.backpacks[bags[0].id]);assert.throws(()=>validateBackpackData(broken,validateImageSource),/validation failed/);
  }
});

test('database snapshots require backpack images while old snapshots remain compatible',()=>{
  const old=structuredClone(catalog);delete old.backpacks;delete old.meta.backpackCount;
  assert.equal(imageJobs(catalog).length-imageJobs(old).length,bags.length);
  assert.throws(()=>validateSnapshot({catalog,images:[],schemaVersion:1},old),/missing images/);
  const images=bags.map(b=>({path:b.icon,source:b.iconSource,blob:new Blob(['fixture'],{type:'image/webp'})}));
  assert.ok(validateSnapshot({catalog,images,schemaVersion:1},old));
  const changed={...bags[0],grids:[{width:1,height:1}]};assert.equal(rigLayout(changed).reviewed,false);
});
