// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BARTERS_URL} from '../dist/barters.mjs';
import {normalizeExport,DATA_URL,NAMES_URL} from '../dist/catalog-import.mjs';
import {validateCatalog,validateImageSource} from '../dist/data-validation.mjs';
import {download,prepareUpdate} from '../dist/data-update.mjs';
import {validateSnapshot,loadDatabase} from '../dist/database-ui.mjs';
import {imageResponse} from '../desktop/image-download.mjs';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const [catalogText,overridesText]=await Promise.all([read('../dist/data/catalog.json'),read('../dist/data/overrides.json')]);
const catalog=JSON.parse(catalogText),overrides=JSON.parse(overridesText);

test('image proxy rejects other hosts, paths and URL credentials without fetching',async()=>{
  for(const source of ['https://example.com/image.webp','file:///C:/Windows/win.ini','https://assets.tarkov.dev@localhost/icon.webp','https://assets.tarkov.dev/other-file.txt']){
    assert.equal((await imageResponse(source)).status,400);
  }
});

test('download permits only fixed sources, rejects redirects and limits streamed size',async()=>{
  let called=false;
  await assert.rejects(download('https://example.com/items',{maxBytes:20,fetcher:()=>{called=true;}}),/not allowed/);
  assert.equal(called,false);
  await assert.rejects(download(DATA_URL,{maxBytes:3,fetcher:async(_url,options)=>{
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    return new Response('too large');
  }}),/supported size/);
  await assert.rejects(download(DATA_URL,{maxBytes:20,fetcher:async()=>new Response('error',{status:503})}),/HTTP 503/);
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(download(DATA_URL,{signal:aborted.signal,maxBytes:20,fetcher:()=>{called=true;}}),{name:'AbortError'});
  assert.equal(called,false);
});

test('updated catalogs reject missing stats, broken slots, cycles and unsafe image hosts',()=>{
  const weapon=Object.values(catalog.items).find(item=>item.types.includes('gun')&&item.slots.length);
  for(const mutate of [
    item=>{item.ergo=null;},
    item=>{item.slots[0].allowed=['000000000000000000000000'];},
    item=>{item.slots[0].allowed=[item.id];},
    item=>{item.iconSource='https://example.com/icon.webp';}
  ]){
    const broken=structuredClone(catalog);mutate(broken.items[weapon.id]);assert.throws(()=>validateCatalog(broken),/validation failed/);
  }
  assert.equal(validateImageSource('https://assets.tarkov.dev.evil.example/5447a9cd4bdc2dbd208b4567-icon.webp'),false);
  assert.equal(validateImageSource('https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-icon.webp?redirect=elsewhere'),false);
  assert.equal(validateImageSource('https://assets.tarkov.dev/unknown-item-icon.jpg'),true);
});

test('saved snapshots must include every new image before they can activate',()=>{
  const snapshot={catalog:structuredClone(catalog),images:[],schemaVersion:1};
  assert.equal(validateSnapshot(snapshot,catalog),snapshot);
  const item=Object.values(snapshot.catalog.items)[0];item.iconSource='https://assets.tarkov.dev/000000000000000000000001-icon.webp';
  assert.throws(()=>validateSnapshot(snapshot,catalog),/missing images/);
  snapshot.images=[{path:item.icon,source:item.iconSource,blob:new Blob(['fixture'],{type:'image/webp'})}];
  assert.equal(validateSnapshot(snapshot,catalog),snapshot);
  assert.throws(()=>validateSnapshot({catalog:structuredClone(catalog),images:[],schemaVersion:1},null),/missing images/);
});

test('an asset-free build starts without data and waits for explicit setup',async()=>{
  const loaded=await loadDatabase(null);
  assert.equal(loaded.snapshot,null);
});

test('Legacy snapshots and malformed trader offers cannot silently bypass availability',()=>{
  const legacy=structuredClone(catalog),id=Object.keys(legacy.items)[0];delete legacy.items[id].offers;
  assert.throws(()=>validateCatalog(legacy),/trader offers/);
  for(const patch of [{priceRUB:-1},{minTraderLevel:0},{currency:'UNKNOWN'},{taskUnlock:'invalid'}]){
    const broken=structuredClone(catalog),item=Object.values(broken.items).find(i=>i.offers.length);
    Object.assign(item.offers[0],patch);assert.throws(()=>validateCatalog(broken),/trader offers/);
  }
});

test('a failed download cannot mutate the current database',async()=>{
  const before=JSON.stringify(catalog);
  await assert.rejects(prepareUpdate({current:catalog,bundled:catalog,overrides,fetcher:async()=>{throw new Error('Network unavailable');}}),/Network unavailable/);
  assert.equal(JSON.stringify(catalog),before);
});

// The developer fixture is optional; regular tests still run in a clean source checkout.
let rawFixture,namesFixture,bartersFixture;
try{[rawFixture,namesFixture,bartersFixture]=await Promise.all([read('../research/items-current.json'),read('../research/items-en.json'),read('../research/barters-current.json')]);}catch{}
test('shared importer preserves the bundled snapshot and skips image downloads when unchanged',{skip:!rawFixture||!bartersFixture},async()=>{
  const normalized=await normalizeExport({text:rawFixture,fetchedAt:catalog.meta.fetchedAt,modified:catalog.meta.sourceModified},{text:namesFixture},overrides,{text:bartersFixture});
  assert.equal(normalized.meta.version,catalog.meta.version);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.items)),catalog.items);
  const calls=[];
  const prepared=await prepareUpdate({current:catalog,bundled:catalog,overrides,fetcher:async url=>{
    calls.push(url);return new Response(url===DATA_URL?rawFixture:url===BARTERS_URL?bartersFixture:namesFixture);
  }});
  assert.equal(prepared.unchanged,true);assert.deepEqual(calls,[DATA_URL,NAMES_URL,BARTERS_URL]);
});

test('missing image download rejects the candidate and preserves old data',{skip:!rawFixture||!bartersFixture},async()=>{
  const raw=JSON.parse(rawFixture),id=Object.values(catalog.items)[0].id;
  raw.data.items[id].iconLink='https://assets.tarkov.dev/000000000000000000000001-icon.webp';
  const before=JSON.stringify(catalog);
  await assert.rejects(prepareUpdate({current:catalog,bundled:catalog,overrides,fetcher:async url=>{
    if(url===DATA_URL)return new Response(JSON.stringify(raw));if(url===NAMES_URL)return new Response(namesFixture);if(url===BARTERS_URL)return new Response(bartersFixture);
    return new Response('Image missing',{status:404});
  }}),/HTTP 404/);
  assert.equal(JSON.stringify(catalog),before);
});

test('first-run setup downloads every required image and validates its saved snapshot',{skip:!rawFixture||!bartersFixture},async()=>{
  const webp=new TextEncoder().encode('RIFF0000WEBP');
  let imageDownloads=0;
  const prepared=await prepareUpdate({current:null,bundled:null,overrides,fetcher:async url=>{
    if(url===DATA_URL)return new Response(rawFixture);
    if(url===NAMES_URL)return new Response(namesFixture);
    if(url===BARTERS_URL)return new Response(bartersFixture);
    imageDownloads++;
    return new Response(webp,{headers:{'content-type':'image/webp'}});
  }});
  assert.equal(prepared.images.length,imageDownloads);
  assert.ok(imageDownloads>2000);
  assert.equal(validateSnapshot(prepared,null),prepared);
});
