// Author: CA
import loadHighs from './vendor/highs.mjs';
import {optimizeAsync} from './optimizer.mjs';
import {createBuildSolver} from './build-solver.mjs';
let engine;
self.onmessage=async event=>{
 try{
  const {catalog,options}=event.data;
  engine??=await loadHighs({locateFile:name=>new URL(`vendor/${name}`,import.meta.url).href});
  const progress=message=>self.postMessage({type:'progress',message});
  const solver=await createBuildSolver(catalog,options,engine,progress);
  const result=await optimizeAsync(catalog,options,solver,progress);
  self.postMessage({type:'result',result});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
