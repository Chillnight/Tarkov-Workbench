// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import loadHighs from 'highs';
import {eligibleOffers,buildCost} from '../dist/traders.mjs';
import {optimize} from '../dist/optimizer.mjs';
import {createShoppingList} from '../dist/shopping-list.mjs';
import {validateGearOffers} from '../dist/gear-offers.mjs';
const solver=await loadHighs(),execute=promisify(execFile);
const trader='54cb50c76803fa8b248b4571';
const cash={trader,price:100,priceRUB:100,currency:'RUB',minTraderLevel:4,taskUnlock:null};
const piece={id:'part',name:'Upgrade',shortName:'Upgrade',types:['mods'],category:'Stock',categories:[],ergo:5,recoil:-.1,weight:.2,slots:[],conflicts:[],conflictCategories:[],blockedSlots:[],offers:[cash],barters:[]};
const catalog={items:{part:piece,w:{...piece,id:'w',name:'Test weapon',shortName:'W',types:['gun'],category:'Weapon',ergo:40,recoil:0,vertical:100,horizontal:200,weight:2,offers:[],factoryParts:{},slots:[{id:'stock',key:'mod_stock',name:'Stock',required:true,allowed:['part'],missing:[]}]}}};
test('Turning trader limits off makes locked cash and barter offers usable for budgets and shopping, without disabling other offer settings',()=>{
  const barter={id:'trade',kind:'barter',trader,minTraderLevel:4,taskUnlock:null,rewardCount:1,priceRUB:80,requiredItems:[{id:'ingredient',name:'Ingredient',shortName:'Ingredient',count:2,attributes:{}}]};
  for(const level of [0,1,2,3,4])for(const mode of ['ergo','recoil','balanced']){
    const options={weaponId:'w',mode,sound:'unsilenced',balance:80,magazine:0,scopeId:null,maxBudget:100,preferPracticalMounts:false,restrictTraders:false,includeBarters:true,includeFleaMarket:false,traderLevels:{[trader]:level}};
    const result=optimize(catalog,options,solver);assert.equal(result.status,'optimal');assert.equal(result.cost.priceRUB,100);assert.equal(result.cost.unpriced,0);
    assert.equal(createShoppingList(catalog,options,result.rows).groups[0].items[0].offer.priceRUB,100);
    assert.deepEqual(buildCost(catalog,options,result.rows),result.cost);
    assert.equal(eligibleOffers({...piece,barters:[barter]},options)[0].kind,'barter');
    assert.equal(eligibleOffers({...piece,barters:[barter]},{...options,includeBarters:false})[0].priceRUB,100);
    assert.equal(eligibleOffers({...piece,offers:[{...cash,taskUnlock:'quest'}]},{...options,includeQuestOffers:false}).length,0);
    assert.equal(optimize(catalog,{...options,maxBudget:99},solver).status,'infeasible');
    if(level<4)assert.equal(optimize(catalog,{...options,restrictTraders:true},solver).status,'infeasible');
  }
  assert.equal(eligibleOffers(piece,{traderLevels:{[trader]:1}}).length,0,'Legacy calls with an explicit level map keep their filtering');
});
test('Nonfinite barter conditions cannot become misleading gear ingredient labels',()=>{
  const gear={offers:[],flea:{allowed:false,minLevel:0,priceRUB:null},barters:[{id:'trade',kind:'barter',trader,minTraderLevel:1,taskUnlock:null,rewardCount:1,priceRUB:null,requiredItems:[{id:'dogtag',name:'Dogtag',shortName:'Dogtag',count:1,attributes:{minLevel:15}}]}]};
  validateGearOffers(gear);
  for(const bad of [NaN,Infinity,-Infinity]){const altered=structuredClone(gear);altered.barters[0].requiredItems[0].attributes.minLevel=bad;assert.throws(()=>validateGearOffers(altered),/invalid gear purchase offers/);}
});
test('Developer sync preserves the old catalog and images on failed or invalid downloads and refreshes a changed image source',async()=>{
  const source=new URL('../scripts/sync.mjs',import.meta.url),imageModule=new URL('../dist/data-update.mjs',import.meta.url);
  const valid=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.from('fixture')]);
  for(const outcome of ['failure','invalid','success']){
    const folder=await mkdtemp(join(tmpdir(),'workbench-sync-test-'));
    try{
      for(const dir of ['scripts','dist/data','dist/images','research'])await mkdir(join(folder,dir),{recursive:true});
      await cp(source,join(folder,'scripts/sync.mjs'));
      const ids=['000000000000000000000001','000000000000000000000002'];
      const oldItems=Object.fromEntries(ids.map(id=>[id,{id,icon:`images/${id}.webp`,iconSource:`https://assets.tarkov.dev/${id}-icon.webp`}]));
      const nextItems=Object.fromEntries(ids.map(id=>[id,{...oldItems[id],iconSource:`https://assets.tarkov.dev/${id}-512.webp`}]));
      const previous={items:oldItems,rigs:{},backpacks:{},meta:{version:'old'}};
      await writeFile(join(folder,'dist/data/catalog.json'),JSON.stringify(previous));await writeFile(join(folder,'dist/data/manifest.json'),'OLD_MANIFEST');
      for(const id of ids)await writeFile(join(folder,`dist/images/${id}.webp`),Buffer.concat([valid,Buffer.from('old')]));
      await writeFile(join(folder,'scripts/overrides.json'),'{}');
      for(const file of ['items-current.json','items-en.json','barters-current.json'])await writeFile(join(folder,'research',file),'{}');
      await writeFile(join(folder,'dist/catalog-import.mjs'),`export async function normalizeExport(){return ${JSON.stringify({items:nextItems,rigs:{},backpacks:{},meta:{version:'new'}})}}`);
      await writeFile(join(folder,'dist/barters.mjs'),`export const BARTERS_URL='https://json.tarkov.dev/regular/barters';`);
      await writeFile(join(folder,'dist/data-update.mjs'),`export {imageJobs,imageType} from ${JSON.stringify(imageModule.href)};`);
      await writeFile(join(folder,'runner.mjs'),`process.argv.push('--from-research');globalThis.fetch=async url=>String(url).includes('${ids[1]}')&&'${outcome}'==='failure'?new Response('unavailable',{status:503}):new Response('${outcome}'==='invalid'?Buffer.from('not an image'):Buffer.from('${valid.toString('base64')}','base64'));await import('./scripts/sync.mjs');`);
      let failure;try{await execute(process.execPath,[join(folder,'runner.mjs')],{timeout:30000});}catch(error){failure=error;}
      const after=JSON.parse(await readFile(join(folder,'dist/data/catalog.json'),'utf8'));
      if(outcome==='success'){assert.equal(failure,undefined);assert.equal(after.meta.version,'new');for(const id of ids)assert.deepEqual(await readFile(join(folder,`dist/images/${id}.webp`)),valid);}
      else{assert.ok(failure);assert.deepEqual(after,previous);assert.equal(await readFile(join(folder,'dist/data/manifest.json'),'utf8'),'OLD_MANIFEST');for(const id of ids)assert.deepEqual(await readFile(join(folder,`dist/images/${id}.webp`)),Buffer.concat([valid,Buffer.from('old')]));}
      assert.ok((await readdir(join(folder,'dist/images'))).every(file=>!file.includes('.next-')));
    }finally{await rm(folder,{recursive:true,force:true});}
  }
});
