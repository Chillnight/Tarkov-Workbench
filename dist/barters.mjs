// Author: CA
export const BARTERS_URL='https://json.tarkov.dev/regular/barters';
export function importBarters(raw,source,locale,items){
  const trades=JSON.parse(raw.text).data;
  if(!Array.isArray(trades)||trades.length<100||trades.length>20000)throw new Error('Incomplete barter export; existing data preserved.');
  for(const item of Object.values(items))item.barters=[];
  for(const trade of trades){
    const target=items[trade.offeredItem?.item];if(!target)continue;
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(trade.id)||!/^[a-f0-9]{24}$/.test(trade.trader)||!Number.isInteger(trade.minTraderLevel)||trade.minTraderLevel<1||trade.minTraderLevel>4||!(trade.offeredItem.count>0)||!Array.isArray(trade.requiredItems)||!trade.requiredItems.length)throw new Error('Invalid barter offer');
    let known=true,total=0;
    const requiredItems=trade.requiredItems.map(entry=>{
      const ingredient=source.items[entry.item];
      if(!ingredient||!Number.isFinite(entry.count)||entry.count<=0)throw new Error('Missing barter ingredient data');
      const attributes=entry.attributes??{};
      const market=ingredient.avg24hPrice>0?ingredient.avg24hPrice:null;
      const cash=(ingredient.buyFromTrader??[]).filter(o=>o.priceRUB>0&&!o.taskUnlock).map(o=>o.priceRUB);
      // Market valuation is only a comparison estimate, not a claim that the
      // user's trader level or flea access can purchase these ingredients.
      const unitEstimate=Object.keys(attributes).length?null:market??(cash.length?Math.min(...cash):null);
      if(unitEstimate===null)known=false;else total+=unitEstimate*entry.count;
      return {id:entry.item,name:locale[ingredient.name]??ingredient.name,shortName:locale[ingredient.shortName]??ingredient.shortName,count:entry.count,attributes};
    });
    target.barters.push({id:trade.id,kind:'barter',trader:trade.trader,minTraderLevel:trade.minTraderLevel,taskUnlock:trade.taskUnlock??null,requiredItems,rewardCount:trade.offeredItem.count,priceRUB:known?Math.round(total/trade.offeredItem.count):null});
  }
  return trades.length;
}
