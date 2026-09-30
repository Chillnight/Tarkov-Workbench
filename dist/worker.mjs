// Author: CA
import loadHighs from './vendor/highs.mjs';
import { optimize } from './optimizer.mjs';
let engine;
self.onmessage=async event=>{
  try {
    const {catalog,options}=event.data;
    engine??=await loadHighs({locateFile:name=>new URL(`vendor/${name}`,import.meta.url).href});
    const result=optimize(catalog,options,engine,message=>self.postMessage({type:'progress',message}));
    self.postMessage({type:'result',result});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
