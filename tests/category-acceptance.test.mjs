// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import loadHighs from 'highs';
import { readFile } from 'node:fs/promises';
import { categoryChoices, comparisonWeapons, compareCategory } from '../dist/category-comparison.mjs';
import { validateBuild } from '../dist/optimizer.mjs';
import { ARENA_UNLOCKS } from '../dist/availability.mjs';
import { TRADERS } from '../dist/traders.mjs';

const solver = await loadHighs();
const trader = TRADERS[0].id;
const allTraderLevels = Object.fromEntries(TRADERS.map(entry => [entry.id, 4]));
const lowTraderLevels = Object.fromEntries(TRADERS.map(entry => [entry.id, 1]));
const arenaWeaponId = Object.keys(ARENA_UNLOCKS).find(id => id === '6985ec9fc848f05f4600f6b9') ?? Object.keys(ARENA_UNLOCKS)[0];

const slot = (id, allowed, required = false) => ({ id, key: id, name: id, allowed, required, missing: [] });
const offer = (priceRUB, minTraderLevel = 1) => ({ trader, price: priceRUB, priceRUB, currency: 'RUB', minTraderLevel, taskUnlock: null });
const item = (id, extra = {}) => ({
  id,
  name: id,
  shortName: id,
  types: ['mods'],
  categories: [],
  category: 'Stock',
  caliber: undefined,
  ergo: 0,
  recoil: 0,
  weight: 1,
  slots: [],
  conflicts: [],
  conflictCategories: [],
  blockedSlots: [],
  offers: [],
  barters: [],
  suppressor: false,
  ...extra
});
const gun = (id, partId, extra = {}) => item(id, {
  name: id,
  shortName: id,
  types: ['gun'],
  category: 'Assault rifle',
  caliber: 'Caliber556x45NATO',
  vertical: 100,
  horizontal: 200,
  weight: 2,
  slots: [slot('core', [partId], true)],
  ...extra
});

function fixture() {
  const items = {
    ergoPart: item('ergoPart', { ergo: 10, recoil: -0.1, weight: 0.5, offers: [offer(100)] }),
    recoilPart: item('recoilPart', { ergo: 0, recoil: -0.3, weight: 0.8, offers: [offer(100)] }),
    budgetPart: item('budgetPart', { ergo: 5, recoil: -0.05, weight: 0.5, offers: [offer(100)] }),
    lowPart: item('lowPart', { ergo: 5, recoil: -0.05, weight: 1.5, offers: [offer(500)] }),
    equalLightPart: item('equalLightPart', { ergo: 5, recoil: -0.1, weight: 0.5, offers: [offer(100)] }),
    equalHeavyPart: item('equalHeavyPart', { ergo: 5, recoil: -0.1, weight: 2, offers: [offer(1)] }),
    traderPart: item('traderPart', { ergo: 8, recoil: -0.08, weight: 0.6, offers: [offer(50, 4)] }),
    barterPart: item('barterPart', { ergo: 6, recoil: -0.06, weight: 0.7, barters: [{ id: 'barter-part', kind: 'barter', trader, minTraderLevel: 1, taskUnlock: null, priceRUB: 25, rewardCount: 1, requiredItems: [{ id: 'ingredient', name: 'Ingredient', count: 1, attributes: {} }] }] }),
    fleaPart: item('fleaPart', { ergo: 7, recoil: -0.05, weight: 0.8, flea: { allowed: true, minLevel: 1, priceRUB: 75 } }),
    launcherPart: item('launcherPart', { category: 'UBGL', ergo: -2, recoil: -0.4, weight: 2, offers: [offer(150)] }),
    suppressor: item('suppressor', { category: 'Silencer', ergo: -2, recoil: -0.02, weight: 0.2, suppressor: true, offers: [offer(25)] }),
    arenaPart: item('arenaPart', { ergo: 4, recoil: -0.02, weight: 0.7, offers: [offer(20)] })
  };
  Object.assign(items, {
    ergoWeapon: gun('ergoWeapon', 'ergoPart', { caliber: 'CaliberObjectives' }),
    recoilWeapon: gun('recoilWeapon', 'recoilPart', { caliber: 'CaliberObjectives' }),
    budgetWeapon: gun('budgetWeapon', 'budgetPart', { caliber: 'CaliberBudget', ergo: 35, weight: 2 }),
    lowWeapon: gun('lowWeapon', 'lowPart', { caliber: 'CaliberBudget', ergo: 35, weight: 2 }),
    lightWeapon: gun('lightWeapon', 'equalLightPart', { caliber: 'CaliberWeight', ergo: 40, weight: 1 }),
    heavyWeapon: gun('heavyWeapon', 'equalHeavyPart', { caliber: 'CaliberWeight', ergo: 40, weight: 1 }),
    traderWeapon: gun('traderWeapon', 'traderPart', { caliber: 'CaliberTrader' }),
    barterWeapon: gun('barterWeapon', 'barterPart', { caliber: 'CaliberBarter' }),
    fleaWeapon: gun('fleaWeapon', 'fleaPart', { caliber: 'CaliberFlea' }),
    launcherWeapon: gun('launcherWeapon', 'launcherPart', { caliber: 'CaliberLauncher' }),
    unsilencedWeapon: gun('unsilencedWeapon', 'ergoPart', { caliber: 'CaliberSound', slots: [slot('core', ['ergoPart'], true)] }),
    tieAlpha: gun('tieAlpha', 'equalLightPart', { caliber: 'CaliberTie', ergo: 40, recoil: 0, weight: 2 }),
    tieBravo: gun('tieBravo', 'equalLightPart', { caliber: 'CaliberTie', ergo: 40, recoil: 0, weight: 2 }),
    unknownCaliberWeapon: gun('unknownCaliberWeapon', 'ergoPart', { caliber: undefined }),
    unsupportedWeapon: item('unsupportedWeapon', { types: ['gun'], category: 'Assault rifle', caliber: 'CaliberUnsupported', vertical: 100, horizontal: 200, slots: [slot('missing', ['missingPart'], true)] })
  });
  items[arenaWeaponId] = gun(arenaWeaponId, 'arenaPart', { caliber: 'CaliberArena' });
  for (const id of ['ergoWeapon', 'recoilWeapon']) items[id].slots.push(slot('muzzle', ['suppressor']));
  items[arenaWeaponId].slots.push(slot('muzzle', ['suppressor']));
  return { items };
}

const base = {
  category: 'Assault rifle',
  caliber: null,
  mode: 'ergo',
  sound: 'unsilenced',
  balance: 80,
  magazine: 30,
  scopeId: 'selected-scope',
  magazineId: 'selected-magazine',
  maxBudget: null,
  restrictTraders: false,
  includeQuestOffers: true,
  includeBarters: true,
  includeFleaMarket: true,
  traderLevels: allTraderLevels,
  excludeArenaUnlocks: true,
  allowGrenadeLaunchers: false,
  preferPracticalMounts: true,
  preferLighterParts: true
};

function compare(catalog, overrides = {}) {
  return compareCategory(catalog, { ...base, ...overrides }, solver);
}

test('acceptance: category choices and weapon candidates use exact raw category/caliber and skip unsupported weapons', () => {
  const catalog = fixture();
  const choices = categoryChoices(catalog, base);
  const assault = choices.find(choice => choice.id === 'Assault rifle');
  assert.ok(assault);
  assert.equal(assault.count, 14, 'Arena weapon is excluded while the unsupported gun is not moddable');
  assert.ok(assault.calibers.some(caliber => caliber.id === 'CaliberObjectives'));
  assert.ok(assault.calibers.some(caliber => caliber.id === null && caliber.label === 'Unknown caliber' && caliber.count === 1));
  assert.deepEqual(comparisonWeapons(catalog, { ...base, category: 'Assault rifle', caliber: 'CaliberObjectives' }).map(item => item.id), ['ergoWeapon', 'recoilWeapon']);
  assert.deepEqual(comparisonWeapons(catalog, { ...base, category: 'Assault rifle', caliber: 'CaliberDoesNotExist' }), []);
  assert.ok(!comparisonWeapons(catalog, { ...base, category: 'Assault rifle' }).some(item => item.id === 'unsupportedWeapon'));
});

test('acceptance: Ergo, Recoil, and Balanced rank independently and Balanced falls back to the achievable target', () => {
  const catalog = fixture();
  const ergo = compare(catalog, { caliber: 'CaliberObjectives', mode: 'ergo' });
  const recoil = compare(catalog, { caliber: 'CaliberObjectives', mode: 'recoil' });
  const balanced = compare(catalog, { caliber: 'CaliberObjectives', mode: 'balanced', balance: 99 });
  assert.equal(ergo.status, 'complete');
  assert.equal(recoil.status, 'complete');
  assert.equal(balanced.status, 'complete');
  assert.equal(ergo.entries[0].weaponId, 'ergoWeapon');
  assert.equal(recoil.entries[0].weaponId, 'recoilWeapon');
  assert.ok(balanced.entries.every(entry => entry.result.balanceTarget === 99));
  assert.ok(balanced.entries.every(entry => entry.result.balanceShortfall > 0), 'unreachable Balanced target must report a shortfall');
  assert.equal(balanced.entries[0].weaponId, 'ergoWeapon');
  for (const entry of balanced.entries) assert.deepEqual(validateBuild(catalog, entry.selection, entry.result.rows), []);
});

test('acceptance: silenced requires a suppressor path while unsilenced keeps the same eligible weapon', () => {
  const catalog = fixture();
  const unsilenced = compare(catalog, { caliber: 'CaliberSound', sound: 'unsilenced' });
  const silenced = compare(catalog, { caliber: 'CaliberSound', sound: 'silenced' });
  assert.equal(unsilenced.entries.length, 1);
  assert.equal(unsilenced.entries[0].weaponId, 'unsilencedWeapon');
  assert.equal(silenced.entries.length, 0);
  assert.equal(silenced.excluded[0]?.status, 'infeasible');
  const complete = compare(catalog, { caliber: 'CaliberObjectives', sound: 'silenced' });
  assert.deepEqual(complete.entries.map(entry => entry.weaponId), ['ergoWeapon', 'recoilWeapon']);
  assert.ok(complete.entries.every(entry => entry.result.rows.some(row => row.itemId === 'suppressor')));
});

test('acceptance: trader, barter, Flea, Arena, launcher, and budget filters change eligibility', () => {
  const catalog = fixture();
  const traderOpen = compare(catalog, { caliber: 'CaliberTrader', restrictTraders: true, traderLevels: allTraderLevels, includeFleaMarket: false });
  const traderLocked = compare(catalog, { caliber: 'CaliberTrader', restrictTraders: true, traderLevels: lowTraderLevels, includeFleaMarket: false });
  assert.equal(traderOpen.entries.length, 1);
  assert.equal(traderLocked.entries.length, 0);
  assert.equal(traderLocked.excluded[0]?.status, 'infeasible');

  const barterOn = compare(catalog, { caliber: 'CaliberBarter', restrictTraders: true, traderLevels: lowTraderLevels, includeBarters: true, includeFleaMarket: false });
  const barterOff = compare(catalog, { caliber: 'CaliberBarter', restrictTraders: true, traderLevels: lowTraderLevels, includeBarters: false, includeFleaMarket: false });
  assert.equal(barterOn.entries.length, 1);
  assert.equal(barterOn.entries[0].result.cost.barterCount, 1);
  assert.equal(barterOff.entries.length, 0);

  const fleaOn = compare(catalog, { caliber: 'CaliberFlea', restrictTraders: true, traderLevels: lowTraderLevels, includeFleaMarket: true, includeBarters: false });
  const fleaOff = compare(catalog, { caliber: 'CaliberFlea', restrictTraders: true, traderLevels: lowTraderLevels, includeFleaMarket: false, includeBarters: false });
  assert.equal(fleaOn.entries.length, 1);
  assert.equal(fleaOn.entries[0].result.cost.fleaCount, 1);
  assert.equal(fleaOff.entries.length, 0);

  const arenaExcluded = comparisonWeapons(catalog, { ...base, category: 'Assault rifle', caliber: 'CaliberArena' });
  const arenaIncluded = comparisonWeapons(catalog, { ...base, category: 'Assault rifle', caliber: 'CaliberArena', excludeArenaUnlocks: false });
  assert.deepEqual(arenaExcluded, []);
  assert.deepEqual(arenaIncluded.map(item => item.id), [arenaWeaponId]);

  const launcherOff = compare(catalog, { caliber: 'CaliberLauncher', allowGrenadeLaunchers: false });
  const launcherOn = compare(catalog, { caliber: 'CaliberLauncher', allowGrenadeLaunchers: true });
  assert.equal(launcherOff.entries.length, 0);
  assert.equal(launcherOff.excluded[0]?.status, 'infeasible');
  assert.equal(launcherOn.entries.length, 1);

  const budget = compare(catalog, { caliber: 'CaliberBudget', maxBudget: 150 });
  assert.deepEqual(budget.entries.map(entry => entry.weaponId), ['budgetWeapon'], 'the budget fixture keeps only the 100 RUB build');
  assert.ok(budget.entries.every(entry => entry.result.cost.priceRUB <= 150));
});

test('acceptance: equal stats honor Prefer lighter parts before price, and the opposite setting reverses the tie', () => {
  const catalog = fixture();
  const light = compare(catalog, { caliber: 'CaliberWeight', preferLighterParts: true });
  const cheap = compare(catalog, { caliber: 'CaliberWeight', preferLighterParts: false });
  assert.equal(light.entries[0].weaponId, 'lightWeapon');
  assert.equal(cheap.entries[0].weaponId, 'heavyWeapon');
  assert.equal(light.entries[0].result.ergo, light.entries[1].result.ergo);
  assert.equal(light.entries[0].result.recoil, light.entries[1].result.recoil);
});

test('acceptance: complete ranking ties use deterministic weapon identity fallback', () => {
  const catalog = fixture();
  const result = compare(catalog, { caliber: 'CaliberTie', mode: 'ergo' });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.entries.map(entry => entry.weaponId), ['tieAlpha', 'tieBravo']);
  assert.deepEqual(result.entries.map(entry => entry.rank), [1, 2]);
});

test('acceptance: category comparison never mutates the builder catalog or selection and returns validated transfer data', () => {
  const catalog = fixture();
  const options = { ...base, caliber: 'CaliberObjectives', mode: 'balanced', balance: 55 };
  const catalogBefore = structuredClone(catalog);
  const optionsBefore = structuredClone(options);
  const result = compareCategory(catalog, options, solver);
  assert.deepEqual(catalog, catalogBefore);
  assert.deepEqual(options, optionsBefore);
  assert.ok(result.entries.length > 0);
  for (const entry of result.entries) {
    assert.notStrictEqual(entry.selection, options);
    assert.equal(entry.selection.weaponId, entry.weaponId);
    assert.equal(entry.selection.scopeId, null);
    assert.equal(entry.selection.magazineId, null);
    assert.equal(entry.selection.magazine, 1);
    assert.equal(entry.selection.mode, options.mode);
    assert.equal(entry.selection.sound, options.sound);
    assert.deepEqual(validateBuild(catalog, entry.selection, entry.result.rows), []);
  }
});

test('acceptance: empty and partial comparisons retain diagnostics instead of claiming a complete optimum', () => {
  const catalog = fixture();
  const empty = compareCategory(catalog, { ...base, category: 'No such category' }, solver);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.checked, 0);
  assert.equal(empty.completeRanking, false);

  const timeoutSolver = { solve() { return { Status: 'Time limit reached', ObjectiveValue: 1, Columns: {} }; } };
  const partial = compareCategory(catalog, { ...base, caliber: 'CaliberObjectives' }, timeoutSolver);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.completeRanking, false);
  assert.equal(partial.checked, partial.total);
  assert.ok(partial.excluded.length > 0);
  assert.ok(partial.excluded.every(entry => entry.status === 'unproven'));
});

test('acceptance: category worker protocol streams checked/total progress and transfers validated rows', async () => {
  const messages = [];
  const previousSelf = globalThis.self;
  globalThis.self = { postMessage: message => messages.push(message) };
  try {
    await import(`../dist/category-worker.mjs?acceptance=${Date.now()}`);
    await globalThis.self.onmessage({ data: { catalog: fixture(), options: { ...base, caliber: 'CaliberObjectives' } } });
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
  const progress = messages.filter(message => message.type === 'progress');
  const resultMessage = messages.find(message => message.type === 'result');
  assert.ok(progress.length > 0);
  assert.ok(progress.every(message => Number.isInteger(message.checked) && Number.isInteger(message.total)));
  assert.ok(resultMessage?.result);
  assert.equal(resultMessage.result.status, 'complete');
  for (const entry of resultMessage.result.entries) assert.deepEqual(validateBuild(fixture(), entry.selection, entry.result.rows), []);
});

test('acceptance: bounded real-catalog DMR smoke covers all modes and suppressor variants without expanding to every weapon', { timeout: 120000 }, async (t) => {
  const path = new URL('../dist/data/catalog.json', import.meta.url);
  let catalog;
  try { catalog = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') {
      t.skip('Bundled catalog unavailable; real-catalog DMR smoke was not run.');
      return;
    }
    throw error;
  }
  const dmrs = comparisonWeapons(catalog, { ...base, category: 'Marksman rifle', caliber: null });
  const choices = categoryChoices(catalog, { ...base, category: 'Marksman rifle' });
  const dmrChoice = choices.find(choice => choice.id === 'Marksman rifle');
  assert.ok(dmrChoice, 'the bundled catalog exposes a Marksman rifle category');
  assert.ok(dmrs.length > 0, 'the bundled catalog exposes at least one eligible DMR');
  assert.equal(dmrs.length, dmrChoice.count, 'the category choice count matches the candidate filter');

  const compareMetric = (left, right, direction = 1) => {
    const difference = (left - right) * direction;
    return Math.abs(difference) <= 1e-8 ? 0 : difference < 0 ? -1 : 1;
  };
  const compareRanking = (mode, balance, left, right) => {
    const a = left.result;
    const b = right.result;
    if (mode === 'ergo') return compareMetric(b.ergo, a.ergo) || compareMetric(a.vertical, b.vertical) || compareMetric(a.horizontal, b.horizontal);
    if (mode === 'recoil') return compareMetric(a.vertical, b.vertical) || compareMetric(a.horizontal, b.horizontal) || compareMetric(b.ergo, a.ergo);
    return compareMetric(Math.max(0, balance - a.ergo), Math.max(0, balance - b.ergo)) || compareMetric(a.vertical, b.vertical) || compareMetric(a.horizontal, b.horizontal) || compareMetric(b.ergo, a.ergo);
  };
  const recomputeStats = (selection, rows) => {
    const ids = [selection.weaponId, ...rows.map(row => row.itemId)];
    const root = catalog.items[selection.weaponId];
    const rawErgo = ids.reduce((sum, id) => sum + (catalog.items[id]?.ergo ?? 0), 0);
    const recoil = ids.reduce((sum, id) => sum + (catalog.items[id]?.recoil ?? 0), 0);
    return {
      rawErgo,
      ergo: Math.min(100, Math.max(0, rawErgo)),
      recoil,
      vertical: Math.max(0, root.vertical * (1 + recoil)),
      horizontal: Math.max(0, root.horizontal * (1 + recoil)),
      weight: ids.reduce((sum, id) => sum + (catalog.items[id]?.weight ?? 0), 0)
    };
  };

  for (const mode of ['ergo', 'recoil', 'balanced']) {
    for (const sound of ['unsilenced', 'silenced']) {
      const result = compareCategory(catalog, { ...base, category: 'Marksman rifle', caliber: null, mode, sound, balance: 80, restrictTraders: false, excludeArenaUnlocks: true }, solver);
      assert.equal(result.total, dmrs.length, `${mode}/${sound} candidate total`);
      assert.equal(result.checked, result.total);
      assert.ok(result.entries.length > 0, `${mode}/${sound} must produce at least one validated build`);
      assert.ok(result.excluded.every(entry => entry.status === 'infeasible'), `${mode}/${sound} exclusions must be proven infeasible`);
      assert.ok(result.entries.every(entry => ['optimal', 'feasible'].includes(entry.result.status)));
      for (let index = 1; index < result.entries.length; index += 1) {
        assert.ok(compareRanking(mode, 80, result.entries[index - 1], result.entries[index]) <= 0, `${mode}/${sound} ranking order at ${index}`);
      }
      for (const entry of result.entries) {
        const expected = recomputeStats(entry.selection, entry.result.rows);
        for (const field of ['rawErgo', 'ergo', 'recoil', 'vertical', 'horizontal', 'weight']) {
          assert.ok(Math.abs(entry.result[field] - expected[field]) <= 1e-6, `${mode}/${sound}/${entry.weaponId} ${field} matches assembled parts`);
        }
        assert.deepEqual(validateBuild(catalog, entry.selection, entry.result.rows), [], `${mode}/${sound}/${entry.weaponId}`);
      }
    }
  }
});
