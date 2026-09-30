// Author: CA
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { normalizeExport } from '../dist/catalog-import.mjs';
import { BARTERS_URL } from '../dist/barters.mjs';
const root = new URL('../', import.meta.url);
const local = process.argv.includes('--from-research');
const base = 'https://json.tarkov.dev/regular/items';
async function read(url, file) {
  if (local) { const path=new URL(`research/${file}`,root); return { text: await readFile(path, 'utf8'), modified: '2026-09-27T17:50:36Z', fetchedAt:(await stat(path)).mtime.toISOString() }; }
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Data download failed: HTTP ${response.status}`);
  return { text: await response.text(), modified: response.headers.get('last-modified'), fetchedAt:new Date().toISOString() };
}
const [raw, names, barters] = await Promise.all([read(base, 'items-current.json'), read(`${base}_en`, 'items-en.json'),read(BARTERS_URL,'barters-current.json')]);
const overrides = JSON.parse(await readFile(new URL('scripts/overrides.json',root),'utf8'));
const data = await normalizeExport(raw,names,overrides,barters);
const items=data.items;
await mkdir(new URL('dist/data/', root), { recursive: true });
await mkdir(new URL('dist/images/', root), { recursive: true });
const jobs = Object.values(items).flatMap(i => [{url:i.iconSource,path:i.icon},...(i.image ? [{url:i.imageSource,path:i.image}] : [])]);
let completed = 0;
const failures=[];
async function worker() {
  while (jobs.length) {
    const job = jobs.shift();
    const path = new URL(`dist/${job.path}`, root);
    try { if ((await stat(path)).size > 0) {completed++; continue;} } catch {}
    try {
      const url = new URL(job.url);
      if (url.protocol !== 'https:' || url.hostname !== 'assets.tarkov.dev') throw new Error('Image source is not allowed');
      let response;
      for (let attempt=0;attempt<3;attempt++) {
        response=await fetch(url,{signal:AbortSignal.timeout(30000)});
        if(response.ok) break;
      }
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      await writeFile(path,new Uint8Array(await response.arrayBuffer()));
    } catch (error) { failures.push({path:job.path,error:error.message}); }
    completed++;
    if(completed%250===0) console.log(`${completed} images saved`);
  }
}
if (!process.argv.includes('--skip-images')) await Promise.all(Array.from({length:8},worker));
data.meta.imageFailures=failures;
await writeFile(new URL('dist/data/overrides.json',root),JSON.stringify(overrides));
const next=new URL('dist/data/catalog.next.json',root);
await writeFile(next,JSON.stringify(data));
await rename(next,new URL('dist/data/catalog.json',root));
await writeFile(new URL('dist/data/manifest.json',root),JSON.stringify(data.meta));
console.log(JSON.stringify({...data.meta,bytes:JSON.stringify(data).length}));
if(failures.length) process.exitCode=1;
