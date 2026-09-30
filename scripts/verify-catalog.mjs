// Author: CA
import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import loadHighs from 'highs';
import {createProblem,optimize,validateBuild,ENGINE_VERSION} from '../dist/optimizer.mjs';
import {findAlternatives,replaceAttachment} from '../dist/alternatives.mjs';
const data=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
const solver=await loadHighs();
const report={version:data.meta.version,engine:ENGINE_VERSION,checkedAt:new Date().toISOString(),catalog:[],builds:[],errors:[]};
const guns=Object.values(data.items).filter(i=>i.types.includes('gun'));
for(const item of Object.values(data.items))for(const file of [item.icon,item.image].filter(Boolean)){
  try{if(!(await stat(new URL(`../dist/${file}`,import.meta.url))).size)throw new Error('empty');}catch{report.errors.push(`Missing image: ${file}`);}
}
for(const weapon of guns){
  try{
    const p=createProblem(data,{weaponId:weapon.id,sound:'unsilenced',magazine:1});
    report.catalog.push({id:weapon.id,items:p.nodes.length,missing:p.missing.length});
    if(p.missing.length)report.errors.push(`${weapon.shortName}: missing references`);
  }catch(error){report.errors.push(`${weapon.name}: ${error.message}`);}
}
console.log(`${report.catalog.length}/${guns.length} weapon graphs checked; ${report.errors.length} data errors`);
const selected=['5447a9cd4bdc2dbd208b4567','5644bd2b4bdc2d3b4c8b4572','57838ad32459774a17445cd2','588892092459774ac91d4b11','674d6121c09f69dfb201a888','5e81c3cbac2bb513793cdc75','54491c4f4bdc2db1078b4568'];
const precomputed={version:data.meta.version,engine:ENGINE_VERSION,builds:{}};
for(const weaponId of selected)for(const sound of ['silenced','unsilenced'])for(const mode of ['ergo','recoil','balanced']){
  const options={weaponId,mode,sound,balance:80,magazine:1,scopeId:null,excludeArenaUnlocks:true,preferPracticalMounts:true};
  try{
    const result=optimize(data,options,solver);
    const entry={weapon:data.items[weaponId].shortName,mode,sound,status:result.status,ergo:result.ergo,recoil:result.recoil,seconds:result.seconds};
    report.builds.push(entry);console.log(JSON.stringify(entry));
    if(result.rows){const errors=validateBuild(data,options,result.rows);if(errors.length)throw new Error(errors.join('; '));}
    if(result.status==='optimal'||result.status==='infeasible')precomputed.builds[JSON.stringify(options)]=result;
  }catch(error){report.errors.push(`${data.items[weaponId].shortName} ${mode} ${sound}: ${error.message}`);console.log('ERROR',error.message);}
}
const scoped=[
  {weaponId:'5447a9cd4bdc2dbd208b4567',scopeId:'5b3b99475acfc432ff4dcbee',sound:'silenced'},
  {weaponId:'5447a9cd4bdc2dbd208b4567',scopeId:'618ba27d9008e4636a67f61d',sound:'unsilenced'},
  {weaponId:'57c44b372459772d2b39b8ce',scopeId:'5b3b99475acfc432ff4dcbee',sound:'silenced'},
  {weaponId:'6871284e9a353bb50606f3ed',scopeId:'5b3b99475acfc432ff4dcbee',sound:'silenced'},
  {weaponId:'588892092459774ac91d4b11',scopeId:'5b3b99475acfc432ff4dcbee',sound:'silenced'},
  {weaponId:'5e81c3cbac2bb513793cdc75',scopeId:'5b3b99475acfc432ff4dcbee',sound:'unsilenced'}
];
for(const selection of scoped){
  const options={weaponId:selection.weaponId,mode:'balanced',sound:selection.sound,balance:80,magazine:1,scopeId:selection.scopeId,excludeArenaUnlocks:true,preferPracticalMounts:true};
  try{
    const result=optimize(data,options,solver);
    const entry={weapon:data.items[options.weaponId].shortName,scope:data.items[options.scopeId].shortName,mode:options.mode,sound:options.sound,status:result.status,ergo:result.ergo,seconds:result.seconds};
    if(result.rows){
      if(validateBuild(data,options,result.rows).length)throw new Error('Invalid scoped assembly');
      if(result.rows.filter(r=>r.itemId===options.scopeId).length!==1)throw new Error('Scope missing or duplicated');
      const alternatives=findAlternatives(data,options,result.rows);entry.alternatives=alternatives.flat().length;
      for(const [index,ids] of alternatives.entries())for(const id of ids){
        const swapped=replaceAttachment(data,options,result.rows,index,id);
        if(!swapped||validateBuild(data,options,swapped).length)throw new Error('Invalid alternative');
      }
      if(options.weaponId==='57c44b372459772d2b39b8ce'){
        const cover=result.rows.findIndex(r=>['578395402459774a256959b5','57c44f4f2459772d2c627113'].includes(r.itemId));
        if(cover<0||!alternatives[cover].some(id=>['578395402459774a256959b5','57c44f4f2459772d2c627113'].includes(id)))throw new Error('VAL/VSS equivalent cover missing');
      }
    }
    report.builds.push(entry);console.log(JSON.stringify(entry));
    if(['optimal','infeasible'].includes(result.status))precomputed.builds[JSON.stringify(options)]=result;
    if(options.weaponId==='5e81c3cbac2bb513793cdc75'?result.status!=='infeasible':!['optimal','feasible'].includes(result.status))throw new Error('Unexpected scoped build status');
  }catch(error){report.errors.push(`${data.items[options.weaponId]?.shortName} scope: ${error.message}`);console.log('ERROR',error.message);}
}
await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
await writeFile(new URL('../test-results/catalog-report.json',import.meta.url),JSON.stringify(report,null,2));
await writeFile(new URL('../dist/data/precomputed.json',import.meta.url),JSON.stringify(precomputed));
console.log(JSON.stringify({graphs:report.catalog.length,builds:report.builds.length,cached:Object.keys(precomputed.builds).length,errors:report.errors}));
if(report.errors.length)process.exitCode=1;
