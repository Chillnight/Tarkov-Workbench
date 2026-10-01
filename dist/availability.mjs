import {cheapestOffer} from './traders.mjs';
import {isIncludedFactoryPart} from './factory-parts.mjs';
// Author: CA
// Reviewed 2026-09-30. Explicit item IDs: Ref/noFlea alone does not imply an Arena unlock.
// Sources and maintenance notes: docs/AVAILABILITY.md.
export const AVAILABILITY_REVIEWED = '2026-09-30';
const groups = {
  'BattlePass Season 1': ['68a5ab09c44fa287ba0a97b5','68a5ac69b55a6b93c20a2bc7','6895bb82c4519957df062f82'],
  'BattlePass Season 2': [
    '68a5dc4eed35a7eac1048ff6','68a6f3b27279296357007cd7','68a6fbb07279296357007ce2','68a6fbfdd31595bb360c73bd',
    '68a6ff732885e0bbd30bb6f9','68a6fff085a17dc1cb008066','6984b690b457c5047e0c01fa','6984b74a5aab442620032fe6',
    '6985beb1812f88c79b0eed39','6985bebd812f88c79b0eed3b','698b3592e700c6d632003753','698dac21772d6f3dc00e4284',
    '6981d72ed009ad83920da43a'
  ],
  'Factory Tactical Map': ['68a5dc0c2cd64a8b58023b87','68a6e8fd4ac5b037cb0e9b86','6984b7bf0baed1fc0a0594f6','6984b7d56be2752c150e6895','698b338649b46ae2d0092e82'],
  'Echo Belli crate': ['68a6ff952885e0bbd30bb6fd','68a7000d7708ac5120060527','6985eb089edef67ade080b72','698b358b49b46ae2d0092e86'],
  'BattlePass Season 3': [
    '6984b82c5aab442620032fe8','6a675e25dfb2de5e320d454e','6a6759a5ca1e7d40a007a56f',
    '6a675d8f2ff856278106eb69','6a6720479d7f57e84800faed','6a6724bddfb2de5e320d451d',
    '6a78b7f8c2016eb33e0027cd'
  ],
  'Arena Ravage variant': ['6985ec9fc848f05f4600f6b9','6985eca7de77dd8dd50025ba'],
  // Conservatively exclude the exclusive components of the Season 2 reward weapon too.
  'BattlePass Season 2 · Redline weapon part': ['6981ee9cf819a414310292fb','6981f3e2f819a41431029302','6981f8ca1d2e2070560b7275','6981f97f1d2e2070560b7277','6981f9c5f819a41431029304']
};
export const ARENA_UNLOCKS = Object.freeze(Object.fromEntries(Object.entries(groups).flatMap(([source,ids])=>ids.map(id=>[id,source]))));
export const arenaUnlock = item => ARENA_UNLOCKS[item?.id] ?? null;
export const isUnderbarrelLauncher = item => item?.category==='UBGL'||item?.categories?.includes('55818b014bdc2ddc698b456b');
export const isAvailable = (item,options={},catalog) => Boolean(item) && (options.excludeArenaUnlocks===false || !arenaUnlock(item)) &&
  (options.allowGrenadeLaunchers===true||!isUnderbarrelLauncher(item)) &&
  (!options.restrictTraders||item.id===options.weaponId||isIncludedFactoryPart(item,options,catalog)||Boolean(cheapestOffer(item,options)));
export const availabilityLabel = options => options.excludeArenaUnlocks===false ? 'Arena unlocks allowed' : 'Known Arena unlocks excluded';
