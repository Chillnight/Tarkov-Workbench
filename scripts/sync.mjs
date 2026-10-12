// Author: CA
import { readFile, writeFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { normalizeExport } from '../dist/catalog-import.mjs';
import { BARTERS_URL } from '../dist/barters.mjs';
import { imageJobs, imageType } from '../dist/data-update.mjs';
const root = new URL('../', import.meta.url);
const local = process.argv.includes('--from-research');
const base = 'https://json.tarkov.dev/regular/items';
async function read(url, file) {
  if (local) { const path=new URL(`research/${file}`,root); return { text: await readFile(path, 'utf8'), modified: '2026-09-27T17:50:36Z', fetchedAt:(await stat(path)).mtime.toISOString() }; }
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect:'error' });
  if (!response.ok) throw new Error(`Data download failed: HTTP ${response.status}`);
  return { text: await response.text(), modified: response.headers.get('last-modified'), fetchedAt:new Date().toISOString() };
}
const [raw, names, barters] = await Promise.all([read(base, 'items-current.json'), read(`${base}_en`, 'items-en.json'),read(BARTERS_URL,'barters-current.json')]);
const overrides = JSON.parse(await readFile(new URL('scripts/overrides.json',root),'utf8'));
const data = await normalizeExport(raw,names,overrides,barters);
await mkdir(new URL('dist/data/', root), { recursive: true });
await mkdir(new URL('dist/images/', root), { recursive: true });
let previousSources=new Map();
try { previousSources=new Map(imageJobs(JSON.parse(await readFile(new URL('dist/data/catalog.json',root),'utf8'))).map(job=>[job.path,job.source])); } catch {}
const jobs = imageJobs(data), staged=[];
let completed = 0;
const failures=[];
async function worker() {
  while (jobs.length) {
    const job = jobs.shift(), path = new URL(`dist/${job.path}`, root);
    if(previousSources.get(job.path)===job.source){
      try { imageType(await readFile(path)); completed++; continue; } catch {}
    }
    const temporary=new URL(`dist/${job.path}.next-${process.pid}`,root);
    try {
      const url = new URL(job.source);
      if (url.protocol !== 'https:' || url.hostname !== 'assets.tarkov.dev') throw new Error('Image source is not allowed');
      let bytes,lastError;
      for (let attempt=0;attempt<3;attempt++) {
        try {
          const response=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
          if(Number(response.headers.get('content-length'))>5*1024*1024){await response.body?.cancel();throw new Error('Image exceeds the supported size');}
          const candidate=new Uint8Array(await response.arrayBuffer());
          if(candidate.length>5*1024*1024)throw new Error('Image exceeds the supported size');
          imageType(candidate);bytes=candidate;break;
        }catch(error){lastError=error;}
      }
      if(!bytes)throw lastError;
      await writeFile(temporary,bytes);staged.push({temporary,path});
    } catch (error) { await unlink(temporary).catch(()=>{}); failures.push({path:job.path,error:error.message}); }
    completed++;
    if(completed%250===0) console.log(`${completed} images checked`);
  }
}
if (!process.argv.includes('--skip-images')) await Promise.all(Array.from({length:8},worker));
if(failures.length){
  await Promise.all(staged.map(job=>unlink(job.temporary).catch(()=>{})));
  throw new Error(`Image preparation failed for ${failures.length} file(s). The existing catalog and images were kept. ${JSON.stringify(failures)}`);
}
for(const job of staged)await rename(job.temporary,job.path);
data.meta.imageFailures=[];
await writeFile(new URL('dist/data/overrides.json',root),JSON.stringify(overrides));
const next=new URL('dist/data/catalog.next.json',root);
await writeFile(next,JSON.stringify(data));
await rename(next,new URL('dist/data/catalog.json',root));
await writeFile(new URL('dist/data/manifest.json',root),JSON.stringify(data.meta));
console.log(JSON.stringify({...data.meta,bytes:JSON.stringify(data).length}));
