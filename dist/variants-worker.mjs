// Author: CA
import loadHighs from './vendor/highs.mjs';
import {verifySuppressorVariants} from './weapon-configuration.mjs';
self.onmessage=async event=>{
  try{
    const {catalog,options}=event.data;
    const solver=await loadHighs({locateFile:name=>new URL(`vendor/${name}`,import.meta.url).href});
    self.postMessage({statuses:verifySuppressorVariants(catalog,options.weaponId,options,solver)});
  }catch(error){self.postMessage({error:error.message});}
};
