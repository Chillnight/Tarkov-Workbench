// Author: CA
export const MAGAZINE_MINIMUMS=Object.freeze([0,1,10,20,30,60]);
export const DEFAULT_MAGAZINE_MINIMUM=30;
export const normalizeMagazineMinimum=value=>MAGAZINE_MINIMUMS.includes(value)?value:DEFAULT_MAGAZINE_MINIMUM;
export const magazineMinimumLabel=value=>value===0?'No magazine required':value===1?'Any capacity':`Prefer ${value}+ rounds`;
