// Author: CA
import {normalizeExport,DATA_URL,NAMES_URL} from './catalog-import.mjs';
import {validateCatalog,validateImageSource} from './data-validation.mjs';
import {BARTERS_URL} from './barters.mjs';

export async function download(url,{signal,maxBytes,fetcher=fetch}){
  if(![DATA_URL,NAMES_URL,BARTERS_URL].includes(url)&&!validateImageSource(url))throw new Error('Download source is not allowed');
  const timeout=AbortSignal.timeout(60000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  combined.throwIfAborted();
  const target=validateImageSource(url)&&globalThis.location?`./api/image?source=${encodeURIComponent(url)}`:url;
  const response=await fetcher(target,{signal:combined,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error(`Download failed (HTTP ${response.status}). Try again later.`);
  if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw new Error('Download exceeds the supported size');}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new Error('Download exceeds the supported size');chunks.push(value);}
  }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  combined.throwIfAborted();
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return {bytes,modified:response.headers.get('last-modified'),type:response.headers.get('content-type')??''};
}

export function imageJobs(catalog){
  return Object.values(catalog.items).flatMap(item=>[{path:item.icon,source:item.iconSource},...(item.image?[{path:item.image,source:item.imageSource}]:[])]);
}

export function imageType(bytes){
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  throw new Error('The image server returned an unsupported file');
}

// A candidate remains in memory until data and all required images have passed validation.
export async function prepareUpdate({current,bundled,storedImages=[],overrides,signal,onProgress=()=>{},fetcher=fetch}){
  onProgress('Downloading item data from tarkov.dev …');
  const raw=await download(DATA_URL,{signal,maxBytes:64*1024*1024,fetcher});
  onProgress('Downloading English item names …');
  const names=await download(NAMES_URL,{signal,maxBytes:12*1024*1024,fetcher});
  onProgress('Downloading trader barter offers …');
  const barters=await download(BARTERS_URL,{signal,maxBytes:12*1024*1024,fetcher});
  signal?.throwIfAborted();onProgress('Checking stats, attachment slots and compatibility …');
  const fetchedAt=new Date().toISOString(),decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const catalog=await normalizeExport({text:decode(raw.bytes),modified:raw.modified,fetchedAt},{text:decode(names.bytes)},overrides,{text:decode(barters.bytes),fetchedAt});
  validateCatalog(catalog,current);signal?.throwIfAborted();
  if(catalog.meta.version===current.meta.version)return {unchanged:true,checkedAt:fetchedAt};
  const bundledSources=new Map(imageJobs(bundled).map(job=>[job.path,job.source]));
  const saved=new Map(storedImages.map(item=>[item.path,item]));
  const images=[],jobs=[];
  for(const job of imageJobs(catalog)){
    if(bundledSources.get(job.path)===job.source)continue;
    const existing=saved.get(job.path);
    if(existing?.source===job.source&&existing.blob instanceof Blob){images.push(existing);continue;}
    jobs.push(job);
  }
  let complete=0,totalBytes=images.reduce((sum,item)=>sum+item.blob.size,0);const total=jobs.length;
  async function worker(){
    while(jobs.length){
      signal?.throwIfAborted();const job=jobs.shift();
      onProgress(`Downloading item images … ${complete} / ${total}`);
      const result=await download(job.source,{signal,maxBytes:5*1024*1024,fetcher});
      totalBytes+=result.bytes.length;if(totalBytes>150*1024*1024)throw new Error('Image update is too large for this app version');
      images.push({...job,blob:new Blob([result.bytes],{type:imageType(result.bytes)})});complete++;
    }
  }
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},worker));
  signal?.throwIfAborted();onProgress('All data checked. Saving the new local database …');
  return {catalog,images,schemaVersion:1,checkedAt:fetchedAt,bundledVersion:bundled.meta.version};
}
