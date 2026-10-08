// Author: CA
import {isAvailable} from './availability.mjs';
import {isOptic,reachableOptics} from './optics.mjs';
import {createProblem} from './optimizer.mjs';

export function reachableMagazines(catalog,weaponId,options={}){
  const seen=new Set(),found=new Map();
  function visit(id){
    if(seen.has(id))return;seen.add(id);
    const item=catalog.items[id];if(!isAvailable(item,{...options,weaponId},catalog)||isOptic(item))return;
    for(const slot of item.slots)for(const childId of slot.allowed){
      const child=catalog.items[childId];
      if(slot.key==='mod_magazine'&&child?.capacity>0&&isAvailable(child,{...options,weaponId},catalog))found.set(childId,child);
      visit(childId);
    }
  }
  visit(weaponId);
  return [...found.values()].sort((a,b)=>a.capacity-b.capacity||a.name.localeCompare(b.name,'en'));
}
export function compatibleChoice(catalog,options,solver,timeLimit=5){
  const problem=createProblem(catalog,options);
  const result=solver.solve(problem.lp('feasibility'),{output_flag:false,time_limit:timeLimit,mip_rel_gap:0,mip_abs_gap:0});
  // A zero-objective optimum proves a complete feasible assembly. A timeout is
  // reported as unchecked, never guessed compatible or incompatible.
  return result.Status==='Optimal'?'compatible':result.Status==='Infeasible'?'incompatible':'unchecked';
}
export function choiceCandidates(catalog,options,kind){
  return kind==='scope'?reachableOptics(catalog,options.weaponId,options):reachableMagazines(catalog,options.weaponId,options);
}
