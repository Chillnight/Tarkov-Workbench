// Author: CA
import { importBarters } from './barters.mjs';
import { importFleaData } from './flea-market.mjs';
import { TRADERS, normalizeTraderSettings } from './traders.mjs';

const idPattern = /^[a-f0-9]{24}$/;
const number = value => Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 });
export function importGearOffers(source, locale, gear, rawBarters) {
  for (const item of Object.values(gear)) {
    const original = source.items[item.id];
    if (!Array.isArray(original.buyFromTrader)) throw new Error('Missing gear purchase offers.');
    item.offers = original.buyFromTrader.map(o => ({ trader: o.trader, price: o.price, priceRUB: o.priceRUB, currency: o.currency, minTraderLevel: o.minTraderLevel, taskUnlock: o.taskUnlock ?? null }));
    item.flea = importFleaData(original);
  }
  importBarters(rawBarters, source, locale, gear);
  Object.values(gear).forEach(validateGearOffers);
}

export function validateGearOffers(item) {
  // Old snapshots remain readable and explicitly request a data update in the UI.
  if (item.offers === undefined && item.barters === undefined && item.flea === undefined) return;
  const fail = () => { throw new Error('Data validation failed: invalid gear purchase offers'); };
  if (!Array.isArray(item.offers) || item.offers.length > 100 || item.offers.some(o => !o || !idPattern.test(o.trader) || !Number.isFinite(o.price) || o.price <= 0 || !Number.isFinite(o.priceRUB) || o.priceRUB <= 0 || !['RUB', 'USD', 'EUR'].includes(o.currency) || !Number.isInteger(o.minTraderLevel) || o.minTraderLevel < 1 || o.minTraderLevel > 4 || (o.taskUnlock != null && !idPattern.test(o.taskUnlock)))) fail();
  if (!Array.isArray(item.barters) || item.barters.length > 100 || item.barters.some(o => !o || !/^[a-zA-Z0-9_-]{1,80}$/.test(o.id) || o.kind !== 'barter' || !idPattern.test(o.trader) || !Number.isInteger(o.minTraderLevel) || o.minTraderLevel < 1 || o.minTraderLevel > 4 || (o.taskUnlock != null && !idPattern.test(o.taskUnlock)) || !Number.isFinite(o.rewardCount) || o.rewardCount <= 0 || (o.priceRUB !== null && (!Number.isFinite(o.priceRUB) || o.priceRUB <= 0)) || !Array.isArray(o.requiredItems) || !o.requiredItems.length || o.requiredItems.length > 100 || o.requiredItems.some(i => !i || !/^[a-zA-Z0-9_-]{1,80}$/.test(i.id) || typeof i.name !== 'string' || !i.name || typeof i.shortName !== 'string' || !Number.isFinite(i.count) || i.count <= 0 || !i.attributes || Array.isArray(i.attributes) || typeof i.attributes !== 'object' || Object.entries(i.attributes).length > 32 || Object.entries(i.attributes).some(([key, value]) => key.length > 100 || !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)) || String(value).length > 500)))) fail();
  if (!item.flea || typeof item.flea.allowed !== 'boolean' || !Number.isInteger(item.flea.minLevel) || item.flea.minLevel < 0 || item.flea.minLevel > 200 || !(item.flea.priceRUB === null || Number.isSafeInteger(item.flea.priceRUB) && item.flea.priceRUB > 0)) fail();
}

export function gearOfferEntries(item, preferences) {
  const settings = normalizeTraderSettings(preferences);
  const entries = [...(item.offers ?? []).map(o => ({ ...o, kind: 'cash' })), ...(item.barters ?? [])].map(offer => {
    const name = TRADERS.find(t => t.id === offer.trader)?.name ?? 'Trader';
    const reasons = [];
    if (settings.restrictTraders && (settings.traderLevels[offer.trader] ?? 0) < offer.minTraderLevel) reasons.push(`${name} LL${offer.minTraderLevel} required`);
    if (offer.taskUnlock && !settings.includeQuestOffers) reasons.push('Quest offers disabled');
    if (offer.kind === 'barter' && !settings.includeBarters) reasons.push('Barters disabled');
    return { ...offer, traderName: name, enabled: !reasons.length, status: reasons.join(' · ') || (offer.taskUnlock ? 'Quest unlock assumed' : 'Trader settings match') };
  });
  if (item.flea?.allowed) entries.push({ kind: 'flea', trader: 'flea', traderName: 'Flea Market', priceRUB: item.flea.priceRUB, minTraderLevel: item.flea.minLevel, enabled: settings.includeFleaMarket, status: settings.includeFleaMarket ? `24h average${item.flea.minLevel > 0 ? ` · player level ${item.flea.minLevel} required` : ''}` : 'Flea Market disabled' });
  const price = o => Number.isFinite(o.priceRUB) && o.priceRUB > 0 ? o.priceRUB : Infinity;
  return entries.sort((a, b) => Number(b.enabled) - Number(a.enabled) || price(a) - price(b) || a.traderName.localeCompare(b.traderName, 'en'));
}

export function gearOfferLabel(offer) {
  if (offer.kind === 'flea') return `Flea Market · ${offer.priceRUB === null ? 'Price unavailable' : `${number(offer.priceRUB)} RUB`}`;
  const trader = `${offer.traderName} LL${offer.minTraderLevel}`;
  return offer.kind === 'barter' ? `${trader} · Barter${offer.priceRUB === null ? ' · Value unknown' : ` · ~${number(offer.priceRUB)} RUB/item`}` : `${trader} · ${number(offer.price)} ${offer.currency}`;
}

export function barterIngredientLabel(item) {
  const attributes = Object.entries(item.attributes ?? {}).map(([key, value]) => key === 'minLevel' ? `level ${value}+` : `${key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}: ${value}`).join(', ');
  return `${number(item.count)} × ${item.name}${attributes ? ` (${attributes})` : ''}`;
}
