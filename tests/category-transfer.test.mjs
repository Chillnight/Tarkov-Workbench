// Author: CA
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileFingerprint, transferIsCurrent } from '../dist/category-transfer.mjs';

const baseProfile = Object.freeze({
  weaponId: 'weapon-a', mode: 'balanced', sound: 'silenced', balance: 75,
  scopeId: null, magazineId: null, magazine: 1, maxBudget: 150000,
  allowGrenadeLaunchers: false, restrictTraders: true,
  traderLevels: { skier: 2, mechanic: 3 }, includeFleaMarket: true,
  includeBarters: true, includeQuestOffers: true, excludeArenaUnlocks: true,
  preferPracticalMounts: true, preferLighterParts: true
});

function current(changes = {}) {
  return { ...baseProfile, ...changes, traderLevels: changes.traderLevels ?? { ...baseProfile.traderLevels } };
}

test('category transfer profile guard accepts an unchanged profile and identity', () => {
  const catalog = {};
  const expected = profileFingerprint(baseProfile);
  assert.equal(transferIsCurrent({ catalog, expectedCatalog: catalog, currentProfile: current(), expectedProfile: expected, token: 4, expectedToken: 4 }), true);
});

test('category transfer profile guard rejects user changes and stale database/token state', () => {
  const catalog = {};
  const expected = profileFingerprint(baseProfile);
  for (const changes of [
    { mode: 'ergo' }, { balance: 80 }, { sound: 'unsilenced' }, { weaponId: 'weapon-b' },
    { scopeId: 'scope-a' }, { magazineId: 'mag-a' }, { magazine: 30 },
    { maxBudget: 90000 }, { includeFleaMarket: false }, { preferLighterParts: false }
  ]) {
    assert.equal(transferIsCurrent({ catalog, expectedCatalog: catalog, currentProfile: current(changes), expectedProfile: expected, token: 4, expectedToken: 4 }), false, JSON.stringify(changes));
  }
  assert.equal(transferIsCurrent({ catalog: {}, expectedCatalog: catalog, currentProfile: current(), expectedProfile: expected, token: 4, expectedToken: 4 }), false);
  assert.equal(transferIsCurrent({ catalog, expectedCatalog: catalog, currentProfile: current(), expectedProfile: expected, token: 5, expectedToken: 4 }), false);
});
