// Author: CA
export function importFleaData(item) {
  return {allowed:!item.types.includes('noFlea'),minLevel:item.minLevelForFlea,
    priceRUB:Number.isFinite(item.avg24hPrice)&&item.avg24hPrice>0?Math.round(item.avg24hPrice):null};
}
export const hasFleaData = catalog => Boolean(catalog?.items)&&Object.values(catalog.items).every(item=>item.flea!==undefined);
export function fleaOffer(item,options={}) {
  if(options.includeFleaMarket!==true||item?.flea?.allowed!==true||item.types?.includes('noFlea'))return null;
  const price=Number.isFinite(item.flea.priceRUB)&&item.flea.priceRUB>0?item.flea.priceRUB:null;
  return {kind:'flea',trader:'flea',price,priceRUB:price,currency:'RUB',minLevel:item.flea.minLevel};
}
export const fleaOfferLabel = offer => `Flea Market · ${offer.priceRUB===null?'price unavailable':`${offer.priceRUB.toLocaleString('en-GB')} RUB · 24h average`}${offer.minLevel>0?` · unlock level ${offer.minLevel}`:''}`;
