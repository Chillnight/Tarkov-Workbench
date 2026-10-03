// Author: CA
const known=value=>Number.isFinite(value)&&value>=0;
export function importThermalData(properties={}){
  return {heatFactor:known(properties.heatFactor)?properties.heatFactor:null,coolingFactor:known(properties.coolingFactor)?properties.coolingFactor:null};
}
export const hasThermalData=catalog=>Boolean(catalog?.items)&&Object.values(catalog.items).every(item=>item.thermal!==undefined);
export function sameThermalStats(a,b){
  return ['heatFactor','coolingFactor'].every(key=>{
    const x=a.thermal?.[key],y=b.thermal?.[key];
    return known(x)&&known(y)?Math.abs(x-y)<1e-8:!known(x)&&!known(y);
  });
}
export function thermalDominates(a,b){
  const x=a.thermal,y=b.thermal;
  if(!x||!y||![x.heatFactor,x.coolingFactor,y.heatFactor,y.coolingFactor].every(known))return false;
  return x.heatFactor<=y.heatFactor+1e-8&&x.coolingFactor>=y.coolingFactor-1e-8&&
    (x.heatFactor<y.heatFactor-1e-8||x.coolingFactor>y.coolingFactor+1e-8);
}
export function thermalLabel(item){
  const format=value=>{
    if(!known(value))return 'not supplied';
    const percent=Math.round((value-1)*1000)/10;
    return `${percent>0?'+':''}${percent.toLocaleString('en-GB',{maximumFractionDigits:1})}%`;
  };
  return `Heat ${format(item.thermal?.heatFactor)} · Cooling ${format(item.thermal?.coolingFactor)}`;
}
