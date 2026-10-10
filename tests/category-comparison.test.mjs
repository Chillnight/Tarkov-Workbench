// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import loadHighs from 'highs';
import { caliberLabel, categoryChoices, comparisonWeapons, compareCategory } from '../dist/category-comparison.mjs';
import { createProblem, validateBuild } from '../dist/optimizer.mjs';

const solver = await loadHighs();
const slot = (id, allowed, required = false, key = id) => ({ id, name: id, key, allowed, required, missing: [] });
const item = (id, extra = {}) => ({
  id,
  name: id,
  shortName: id,
  ergo: 0,
  recoil: 0,
  weight: 1,
  types: ['mods'],
  categories: [],
  category: 'Stock',
  caliber: undefined,
  slots: [],
  conflicts: [],
  conflictCategories: [],
  blockedSlots: [],
  offers: [],
  suppressor: false,
  ...extra
});

function fixture() {
  return { items: {
    arHigh: item('arHigh', { name: 'AR High', shortName: 'AR High', category: 'Assault rifle', caliber: 'Caliber556x45NATO', types: ['gun'], ergo: 45, vertical: 100, horizontal: 200, slots: [slot('part', ['arPart'], true)] }),
    arLow: item('arLow', { name: 'AR Low', shortName: 'AR Low', category: 'Assault rifle', caliber: 'Caliber556x45NATO', types: ['gun'], ergo: 35, vertical: 100, horizontal: 200, slots: [slot('part', ['arPart'], true)] }),
    dmr: item('dmr', { name: 'DMR', shortName: 'DMR', category: 'Marksman rifle', caliber: 'Caliber762x51', types: ['gun'], ergo: 50, vertical: 110, horizontal: 210, slots: [slot('part', ['dmrPart'], true)] }),
    arPart: item('arPart', { ergo: 5, recoil: -0.1, weight: 0.5, offers: [{ trader: 'Ref', priceRUB: 100, price: 100, currency: 'RUB', minTraderLevel: 1, taskUnlock: null }] }),
    dmrPart: item('dmrPart', { ergo: 1, recoil: -0.05, weight: 0.5, offers: [{ trader: 'Ref', priceRUB: 100, price: 100, currency: 'RUB', minTraderLevel: 1, taskUnlock: null }] })
  } };
}

const base = { mode: 'ergo', sound: 'unsilenced', balance: 80, magazine: 1, scopeId: null, magazineId: null, restrictTraders: false, excludeArenaUnlocks: true, allowGrenadeLaunchers: false, preferPracticalMounts: false };

test('category choices expose mapped labels, counts, and raw caliber ids', () => {
  const catalog = fixture();
  const choices = categoryChoices(catalog, base);
  assert.deepEqual(choices.map(choice => choice.id), ['Assault rifle', 'Marksman rifle']);
  assert.equal(choices.find(choice => choice.id === 'Marksman rifle').label, 'DMR · Marksman rifles');
  const ar = choices.find(choice => choice.id === 'Assault rifle');
  assert.equal(ar.count, 2);
  assert.deepEqual(ar.calibers, [{ id: 'Caliber556x45NATO', label: '5.56×45', count: 2 }]);
});

test('caliber labels use explicit common-code units and preserve unknown-code fallback', () => {
  assert.equal(caliberLabel('Caliber762x51'), '7.62×51');
  assert.equal(caliberLabel('Caliber556x45NATO'), '5.56×45');
  assert.equal(caliberLabel('CaliberMysteryx99'), 'Mystery×99');
  assert.equal(caliberLabel(null), 'Unknown caliber');
});

test('comparison weapons filter exact category, caliber, availability, and sort deterministically', () => {
  const catalog = fixture();
  assert.deepEqual(comparisonWeapons(catalog, { ...base, category: 'Assault rifle' }).map(item => item.id), ['arHigh', 'arLow']);
  assert.deepEqual(comparisonWeapons(catalog, { ...base, category: 'Assault rifle', caliber: 'Caliber762x51' }), []);
  catalog.items.arLow.types.push('noFlea');
  catalog.items.arLow.id = catalog.items.arLow.id;
  assert.deepEqual(comparisonWeapons(catalog, { ...base, category: 'Assault rifle' }).map(item => item.id), ['arHigh', 'arLow']);
});

test('comparison ranks validated results and returns transfer-ready isolated selections', () => {
  const catalog = fixture();
  const progress = [];
  const result = compareCategory(catalog, { ...base, category: 'Assault rifle' }, solver, (message, checked, total) => progress.push({ message, checked, total }));
  assert.equal(result.status, 'complete');
  assert.equal(result.checked, 2);
  assert.equal(result.total, 2);
  assert.equal(result.completeRanking, true);
  assert.deepEqual(result.entries.map(entry => entry.weaponId), ['arHigh', 'arLow']);
  assert.deepEqual(result.entries.map(entry => entry.rank), [1, 2]);
  assert.equal(result.entries[0].selection.scopeId, null);
  assert.equal(result.entries[0].selection.magazineId, null);
  assert.equal(result.entries[0].selection.magazine, 1);
  assert.equal('category' in result.entries[0].selection, false);
  assert.equal('caliber' in result.entries[0].selection, false);
  assert.deepEqual(validateBuild(catalog, result.entries[0].selection, result.entries[0].result.rows), []);
  assert.ok(progress.some(event => event.checked === 0));
  assert.ok(progress.some(event => event.checked === 2 && event.total === 2));
});

test('infeasible candidates remain excluded and prevent an unqualified complete ranking', () => {
  const catalog = fixture();
  catalog.items.arLow.suppressor = true;
  const result = compareCategory(catalog, { ...base, category: 'Assault rifle' }, solver);
  assert.equal(result.status, 'complete');
  assert.equal(result.entries.length, 1);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].weaponId, 'arLow');
  assert.equal(result.excluded[0].status, 'infeasible');
  assert.match(result.excluded[0].message, /No compatible build fits/);
  assert.equal(result.completeRanking, true);
});

test('unproven results stay excluded and keep completeRanking false', () => {
  const catalog = fixture();
  const result = compareCategory(catalog, { ...base, category: 'Assault rifle' }, { solve() { return { Status: 'Time limit reached', ObjectiveValue: 1, Columns: {} }; } });
  assert.equal(result.status, 'partial');
  assert.equal(result.completeRanking, false);
  assert.equal(result.excluded.length, 2);
  assert.ok(result.excluded.every(item => item.status === 'unproven'));
});

test('a refinement timeout retains validated feasible entries without claiming a complete optimum', () => {
  const catalog = fixture();
  const options = { ...base, category: 'Assault rifle', caliber: 'Caliber556x45NATO' };
  const priceLine = createProblem(catalog, { ...options, weaponId: 'arHigh' }).lp('price').split(/\r?\n/)[1];
  const timeoutSolver = {
    solve(lp, settings) {
      const result = solver.solve(lp, settings);
      return lp.split(/\r?\n/)[1] === priceLine ? { ...result, Status: 'Time limit reached' } : result;
    }
  };
  const result = compareCategory(catalog, options, timeoutSolver);
  assert.equal(result.status, 'complete');
  assert.equal(result.entries.length, 2);
  assert.ok(result.entries.every(entry => entry.result.status === 'feasible'));
  assert.equal(result.completeRanking, false);
});

test('equal performance, weight, and cost use stable names and ids without comparator crashes', () => {
  const catalog = { items: {
    zuluGun: item('zuluGun', { name: 'Zulu rifle', shortName: 'Zulu', types: ['gun'], category: 'Assault rifle', caliber: 'CaliberTie', ergo: 40, vertical: 100, horizontal: 200, weight: 2, slots: [slot('part', ['zuluPart'], true)] }),
    alphaGun: item('alphaGun', { name: 'Alpha rifle', shortName: 'Alpha', types: ['gun'], category: 'Assault rifle', caliber: 'CaliberTie', ergo: 40, vertical: 100, horizontal: 200, weight: 2, slots: [slot('part', ['alphaPart'], true)] }),
    zuluPart: item('zuluPart', { ergo: 5, recoil: -0.1, weight: 1 }),
    alphaPart: item('alphaPart', { ergo: 5, recoil: -0.1, weight: 1 })
  } };
  const result = compareCategory(catalog, { ...base, category: 'Assault rifle', caliber: 'CaliberTie' }, solver);
  assert.deepEqual(result.entries.map(entry => entry.weaponId), ['alphaGun', 'zuluGun']);
  assert.deepEqual(result.entries.map(entry => entry.rank), [1, 2]);
  for (const entry of result.entries) assert.deepEqual(validateBuild(catalog, entry.selection, entry.result.rows), []);
});

test('comparison validates the attachment budget before checking weapons', () => {
  const catalog = fixture();
  for (const maxBudget of [0, 100000001, 1.5]) {
    assert.throws(() => compareCategory(catalog, { ...base, category: 'Assault rifle', maxBudget }, solver), /attachment budget/);
  }
});

test('missing category is empty without mutating options', () => {
  const catalog = fixture();
  const options = { ...base, category: 'Assault rifle', caliber: 'Caliber556x45NATO', scopeId: 'pinned', magazineId: 'pinned', magazine: 30 };
  const before = structuredClone(options);
  const result = compareCategory(catalog, { ...options, category: 'No such category' }, solver);
  assert.equal(result.status, 'empty');
  assert.deepEqual(options, before);
});
