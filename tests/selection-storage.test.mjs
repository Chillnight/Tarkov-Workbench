// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {moddableWeapons,matchingWeapons} from '../dist/weapon-picker.mjs';
import {isStaleCacheKey} from '../dist/storage.mjs';

test('weapon search finds MOD.4 across punctuation; unmodifiable weapons are hidden',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../dist/data/catalog.json',import.meta.url),'utf8'));
  const weapons=moddableWeapons(catalog);
  assert.ok(weapons.length>100);
  assert.ok(weapons.every(item=>item.slots.some(slot=>slot.allowed.some(id=>catalog.items[id]?.types.includes('mods')))));
  assert.ok(!weapons.some(item=>item.name.includes('reactive signal')||item.name.includes('signal pistol')));
  for(const query of ['Mod','Mod4','VAL MOD.4','val mod 4'])assert.ok(matchingWeapons(weapons,query).some(item=>item.shortName==='AS VAL MOD.4'),query);
  assert.equal(matchingWeapons(weapons,'no-such-weapon-xyz').length,0);
});

test('snapshot cleanup removes only stale derived caches, preserving personal records',()=>{
  for(const key of ['catalog:old','build:old-engine:new-data:{}','build:new-engine:old-data:{}'])assert.equal(isStaleCacheKey(key,'new-data','new-engine'),true,key);
  for(const key of ['catalog:new-data','build:new-engine:new-data:{}','preset:personal','settings','saved-build:old-data',42])assert.equal(isStaleCacheKey(key,'new-data','new-engine'),false,String(key));
});
