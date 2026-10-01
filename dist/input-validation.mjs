// Author: CA
import {MAGAZINE_MINIMUMS} from './magazine-preferences.mjs';
export function validateBuildInputs(options){
  if(options.maxBudget!=null&&(!Number.isSafeInteger(options.maxBudget)||options.maxBudget<1||options.maxBudget>100000000))return {title:'Invalid attachment budget',message:'Enter a whole-number attachment budget between 1 and 100,000,000 RUB. Zero, negative values and decimal amounts are not allowed.',field:'budget-amount'};
  if(!Number.isFinite(options.balance)||options.balance<0||options.balance>100)return {title:'Invalid ergonomics target',message:'Choose an ergonomics target between 0 and 100.',field:'balance'};
  if(!MAGAZINE_MINIMUMS.includes(options.magazine))return {title:'Invalid magazine preference',message:'Choose a magazine capacity from the available presets.',field:'magazine'};
  return null;
}
