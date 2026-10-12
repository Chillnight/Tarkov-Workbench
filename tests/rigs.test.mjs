// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importRigs, validateRigData, rigEfficiency, rigNetSlots, filterRigs, armorSummary } from '../dist/rigs.mjs';
import { rigLayout } from '../dist/rig-layouts.mjs';
import { validateCatalog, validateImageSource } from '../dist/data-validation.mjs';
import { imageJobs } from '../dist/data-update.mjs';
import { validateSnapshot } from '../dist/database-ui.mjs';

const catalog = JSON.parse(await readFile(new URL('../dist/data/catalog.json', import.meta.url), 'utf8'));
const scav = catalog.rigs['572b7adb24597762ae139821'];
const avs = catalog.rigs['544a5caa4bdc2d1a388b4568'];
const uley = catalog.rigs['5d5d646386f7742797261fd9'];

test('rig catalogue validates all real pockets and stays separate from optimizer items', () => {
  assert.ok(Object.keys(catalog.rigs).length >= 100);
  validateCatalog(catalog);
  for (const rig of Object.values(catalog.rigs)) {
    assert.equal(catalog.items[rig.id], undefined);
    assert.equal(rig.capacity, rig.grids.reduce((n, g) => n + g.width * g.height, 0));
    const layout = rigLayout(rig);
    assert.equal(layout.reviewed, true, `Missing reference layout for ${rig.name}`);
    assert.equal(layout.pockets.length, rig.grids.length);
    assert.equal(layout.pockets.reduce((n, g) => n + g.width * g.height, 0), rig.capacity);
    for (let i = 0; i < layout.pockets.length; i++) {
      const a = layout.pockets[i];
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.width + 1e-8 && a.y + a.height <= layout.height + 1e-8);
      for (const b of layout.pockets.slice(i + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'Pockets must not overlap');
    }
  }
});

test('armour classification uses components when the source omits the armor type', () => {
  const id = '000000000000000000000001', plateId = '000000000000000000000002';
  const item = { id, name: 'Rig', shortName: 'Rig', width: 2, height: 2, weight: 1, iconLink: `https://assets.tarkov.dev/${id}-icon.webp`, types: ['rig'], properties: { propertiesType: 'ItemPropertiesChestRig', capacity: 4, grids: [{ width: 2, height: 2 }], armorSlots: [{ nameId: 'Front_plate', allowedPlates: [plateId], zones: [] }] } };
  const plate = { id: plateId, name: 'Plate', shortName: 'P', weight: 2, properties: { class: 4, durability: 45, material: 'Aramid' } };
  const data = importRigs({ items: { [id]: item, [plateId]: plate } }, {});
  assert.equal(data.rigs[id].armoured, true);
  assert.equal(data.rigs[id].armor[0].class, null);
  assert.equal(data.rigPlates[plateId].class, 4);
  assert.equal(data.rigs[id].weight, 1, 'Do not silently add removable plate weights');
  assert.throws(() => importRigs({ items: { [id]: item } }, {}), /unknown compatible plate/);
});

test('built-in armour and plates are not collapsed into a misleading global class', () => {
  assert.equal(scav.armoured, false);
  assert.equal(avs.armoured, true);
  assert.deepEqual([...new Set(avs.armor.filter(s => !s.removable).map(s => s.class))], [3]);
  assert.equal(avs.armor.filter(s => s.removable).length, 2);
  assert.match(armorSummary(avs), /Built-in class 3/);
  assert.match(armorSummary(uley), /2 \/ 4/);
  assert.equal(uley.armor.filter(s => s.removable).length, 0);
});

test('reviewed layouts fall back if a later database changes pocket shapes', () => {
  assert.equal(rigLayout(scav).reviewed, true);
  const changed = { ...scav, grids: [{ width: 2, height: 3 }] };
  assert.equal(rigLayout(changed).reviewed, false);
  assert.equal(rigLayout({ ...scav, id: '000000000000000000000099' }).reviewed, false);
});

test('rig search, type and combined pocket filters preserve numerical sorting', () => {
  assert.equal(rigEfficiency(scav), 1);
  assert.equal(rigNetSlots(scav), 0);
  assert.ok(filterRigs(catalog.rigs, { search: 'scav vest' }).some(r => r.id === scav.id));
  assert.equal(filterRigs(catalog.rigs, { search: 'nonexistent search string' }).length, 0);
  const matches = filterRigs(catalog.rigs, { type: 'armoured', minSlots: 20, squarePocket: true, sort: 'weight' });
  assert.ok(matches.length);
  assert.ok(matches.every(r => r.armoured && r.capacity >= 20 && r.grids.some(g => g.width >= 2 && g.height >= 2)));
  assert.ok(matches.every((r, i) => i === 0 || r.weight >= matches[i - 1].weight));
  const slots = filterRigs(catalog.rigs, { descending: true });
  assert.ok(slots.every((r, i) => i === 0 || r.capacity <= slots[i - 1].capacity));
});

test('rig validation rejects malformed pockets, images, plate references and counts', () => {
  for (const mutate of [
    c => { c.rigs[scav.id].capacity++; },
    c => { c.rigs[scav.id].grids[0].height = 0; },
    c => { c.rigs[scav.id].iconSource = 'https://example.com/icon.webp'; },
    c => { c.rigs[avs.id].armor[0].allowedPlates = ['000000000000000000000099']; },
    c => { c.rigs[scav.id].weight = -1; },
    c => { c.meta.rigCount++; },
    c => { c.rigs[avs.id].armor[0].class = 6; },
    c => { c.rigs[scav.id].armoured = false; c.rigs[scav.id].armor = structuredClone(avs.armor); }
  ]) { const broken = structuredClone(catalog); mutate(broken); assert.throws(() => validateRigData(broken, validateImageSource), /validation failed/); }
});

test('legacy databases still load while saved new snapshots require cached rig images', () => {
  const legacy = structuredClone(catalog); delete legacy.rigs; delete legacy.rigPlates; delete legacy.meta.rigCount;
  assert.equal(validateCatalog(legacy), legacy);
  assert.throws(() => validateCatalog(legacy, catalog), /rigs are missing/);
  const jobs = imageJobs(catalog), oldJobs = imageJobs(legacy);
  assert.equal(jobs.length - oldJobs.length, Object.keys(catalog.rigs).length);
  assert.throws(() => validateSnapshot({ catalog, images: [], schemaVersion: 1 }, legacy), /missing images/);
  const images = Object.values(catalog.rigs).map(rig => ({ path: rig.icon, source: rig.iconSource, blob: new Blob(['fixture'], { type: 'image/webp' }) }));
  assert.ok(validateSnapshot({ catalog, images, schemaVersion: 1 }, legacy));
});

test('new colour variants retain their individual reference arrangements', () => {
  const wolf = rigLayout(catalog.rigs['6a7b45c3400bf8420f0e06fe']);
  const coyote = rigLayout(catalog.rigs['6a7c845c1fa6226c17096359']);
  assert.equal(wolf.pockets.filter(g => g.width === 2 && g.height === 2).length, 2);
  assert.equal(coyote.pockets.filter(g => g.width === 2 && g.height === 2).length, 0);
  assert.equal(coyote.pockets.filter(g => g.width === 2 && g.height === 1).length, 10);
  const original = rigLayout(catalog.rigs['5d5d85c586f774279a21cbdb']);
  const updated = rigLayout(catalog.rigs['6a7c84c2bcddc78fbd0f04b6']);
  assert.equal(original.pockets.some(g => g.width === 2 && g.height === 1), false);
  assert.equal(updated.pockets.some(g => g.width === 2 && g.height === 1), true);
  const tenSpeed = rigLayout(catalog.rigs['6a7b44d6609e0bad000de84d']);
  assert.equal(tenSpeed.pockets.filter(g => g.width === 2 && g.height === 2).length, 2);
  assert.ok(tenSpeed.pockets.filter(g => g.width === 2 && g.height === 2).every(g => g.y > 3));
});
