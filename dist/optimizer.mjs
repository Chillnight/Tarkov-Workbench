// Author: CA
import { isOptic, isIronSight, isIronSightSlot, ironSightKinds, availableIronSightKinds } from './optics.mjs';
import {factoryPartCount} from './factory-parts.mjs';
import { isAvailable } from './availability.mjs';
import { cheapestOffer,buildCost } from './traders.mjs';
import {mountProfile,isSpecialMount} from './mount-profiles.mjs';
import {MAGAZINE_MINIMUMS} from './magazine-preferences.mjs';
import {dominatedLeafNodes} from './equivalent-parts.mjs';
import {preferThermalHandguards} from './thermal-handguards.mjs';
export const ENGINE_VERSION = '1.9.0.7';
const clamp = value => Math.min(100, Math.max(0, value));
const rounded = value => Math.round(value * 1e8) / 1e8;
function expression(terms) {
  const entries = terms.filter(([coefficient]) => Math.abs(coefficient) > 1e-10);
  return entries.length ? entries.map(([coefficient, name]) => `${coefficient < 0 ? '-' : '+'} ${Math.abs(rounded(coefficient))} ${name}`).join(' ') : '0 x0';
}
export function createProblem(catalog, options) {
  const { weaponId, sound = 'silenced', magazine = 1, scopeId = null, magazineId = null } = options;
  const items = catalog.items;
  const weapon = items[weaponId];
  if (!weapon?.types.includes('gun')) throw new Error('Unknown weapon.');
  if (!['silenced', 'unsilenced'].includes(sound)) throw new Error('Invalid suppressor variant.');
  if (!MAGAZINE_MINIMUMS.includes(magazine)) throw new Error('Invalid magazine preference.');
  if(scopeId!==null&&!isOptic(items[scopeId]))throw new Error('Unknown scope. Select a sight from the scope picker.');
  if(magazineId!==null&&!(items[magazineId]?.capacity>0))throw new Error('Unknown magazine. Select a magazine from the picker.');
  if (!Number.isFinite(weapon.vertical) || !Number.isFinite(weapon.horizontal)) throw new Error('Complete recoil base stats are missing for this weapon.');
  const nodes = [], byId = new Map(), visiting = new Set(), slots = [], missing = new Set();
  const usefulMemo = new Map(), usefulActive = new Set();
  function useful(id) {
    if(items[id]&&!isAvailable(items[id],options,catalog))return false;
    if(usefulMemo.has(id))return usefulMemo.get(id);
    if(usefulActive.has(id))throw new Error('Cyclic attachment data: no safe build is possible.');
    const item=items[id];if(!item)return true;
    usefulActive.add(id);
    if(isOptic(item)&&id!==scopeId){usefulActive.delete(id);usefulMemo.set(id,false);return false;}
    const benefit=id===scopeId||(!scopeId&&isIronSight(item))||item.ergo>0||item.recoil<0||(sound==='silenced'&&item.suppressor)||item.slots.some(s=>s.allowed.some(useful));
    usefulActive.delete(id);usefulMemo.set(id,benefit);return benefit;
  }
  function visit(id) {
    if (visiting.has(id)) throw new Error('Cyclic attachment data: a safe optimum cannot be calculated.');
    if (byId.has(id)) return byId.get(id);
    const item = items[id];
    if (!item) throw new Error(`Missing item: ${id}`);
    if (!Number.isFinite(item.ergo) || !Number.isFinite(item.recoil)) throw new Error(`Incomplete stats: ${item.name}`);
    const node = { index: nodes.length, id, item, slots: [], incoming: [] };
    node.x = `x${node.index}`;
    nodes.push(node); byId.set(id,node); visiting.add(id);
    for (const slot of item.slots) {
      for (const absent of slot.missing ?? []) missing.add(absent);
      const isMagazine = slot.key === 'mod_magazine';
      const ironSights = !scopeId && isIronSightSlot(slot,items);
      const required = slot.required || (isMagazine && (magazine > 0 || magazineId));
      const entry = { ...slot, parent: node, required, edges: [] };
      node.slots.push(entry); slots.push(entry);
      for (const childId of slot.allowed) {
        const child = items[childId];
        if (!child) { missing.add(childId); continue; }
        if (!isAvailable(child,options,catalog)) continue;
        if (sound === 'unsilenced' && child.suppressor) continue;
        if (isOptic(child) && childId !== scopeId) continue;
        if(ironSights&&!isIronSight(child))continue;
        if (isMagazine && magazineId && childId!==magazineId) continue;
        // Preserve the requested optic and every adapter path to it, including negative-stat parts.
        if (!required && !useful(childId)) continue;
        const target = visit(childId);
        const edge = { node: target, slot: entry, name: `a${slots.indexOf(entry)}_${entry.edges.length}` };
        entry.edges.push(edge); target.incoming.push(edge);
      }
    }
    visiting.delete(id); return node;
  }
  const root = visit(weaponId);
  // Exact upper bounds on repeated instances, accounting for one choice per slot.
  for (const target of nodes) {
    const memo = new Map();
    function maximum(node) {
      if (memo.has(node.id)) return memo.get(node.id);
      const result = (node === target ? 1 : 0) + node.slots.reduce((sum,slot) => sum + Math.max(0,...slot.edges.map(edge=>maximum(edge.node))),0);
      memo.set(node.id,result); return result;
    }
    target.max = maximum(root);
    target.present = target.max === 1 ? target.x : `y${target.index}`;
  }
  const constraints = [], bounds = [], binaries = [], integers = [], edges = slots.flatMap(s=>s.edges);
  if(!isAvailable(weapon,options))constraints.push(`${root.x} = 0`);
  for (const node of nodes) {
    const factoryCount=factoryPartCount(node.item,options,catalog);
    if(factoryCount){
      if(!cheapestOffer(node.item,options))constraints.push(`${node.x} <= ${factoryCount}`);
      node.purchase=`p${node.index}`;
      integers.push(node.purchase);bounds.push(`0 <= ${node.purchase} <= ${node.max}`);
      constraints.push(`${node.purchase} - ${node.x} >= ${-factoryCount}`);
    }
    if (node.max === 1) binaries.push(node.x); else {
      integers.push(node.x); binaries.push(node.present);
      constraints.push(`${node.x} - ${node.max} ${node.present} <= 0`,`${node.x} - ${node.present} >= 0`);
      bounds.push(`0 <= ${node.x} <= ${node.max}`);
    }
    if (node === root) constraints.push(`${node.x} = 1`);
    else constraints.push(`${expression(node.incoming.map(e=>[1,e.name]))} - ${node.x} = 0`);
    for (const slot of node.slots) {
      constraints.push(`${expression(slot.edges.map(e=>[1,e.name]))} - ${node.x} ${slot.required ? '=' : '<='} 0`);
    }
  }
  for (const edge of edges) {
    if (edge.slot.parent.max === 1) binaries.push(edge.name);
    else { integers.push(edge.name); bounds.push(`0 <= ${edge.name} <= ${edge.slot.parent.max}`); }
  }
  const conflictPairs = new Set();
  const opticReachMemo=new Map();
  function reachesOptic(node){
    if(opticReachMemo.has(node.id))return opticReachMemo.get(node.id);
    const result=isOptic(node.item)||(!scopeId&&isIronSight(node.item))||node.slots.some(s=>s.edges.some(e=>reachesOptic(e.node)));
    opticReachMemo.set(node.id,result);return result;
  }
  for (const node of nodes) {
    if(node.item.opticMount){
      const supporting=node.slots.flatMap(s=>s.edges).filter(e=>reachesOptic(e.node));
      const requiredIncoming=node.incoming.filter(e=>e.slot.required);
      constraints.push(`${expression([...supporting,...requiredIncoming].map(e=>[1,e.name]))} - ${node.x} >= 0`);
    }
    const conflicts = new Set(node.item.conflicts);
    for (const category of node.item.conflictCategories) for (const other of nodes) if (other.item.categories.includes(category)) conflicts.add(other.id);
    // A source item may list its own ID. That prevents a second copy, not the first.
    if(conflicts.has(node.id)&&node.max>1)constraints.push(`${node.x} <= 1`);
    for (const id of conflicts) {
      if(id===node.id)continue;
      const other = byId.get(id); if (!other) continue;
      const key=[node.index,other.index].sort((a,b)=>a-b).join('_');
      if (!conflictPairs.has(key)) {
        constraints.push(`${node.present} + ${other.present} <= 1`); conflictPairs.add(key);
      }
    }
    for (const id of node.item.blockedSlots) {
      for (const slot of slots.filter(s=>s.id === id)) {
        if (slot.edges.length) constraints.push(`${expression(slot.edges.map(e=>[1,e.name]))} + ${slot.parent.max} ${node.present} <= ${slot.parent.max}`);
      }
    }
  }
  if (sound === 'silenced') constraints.push(`${expression(nodes.filter(n=>n.item.suppressor).map(n=>[1,n.x]))} >= 1`);
  else if(root.item.suppressor)constraints.push(`${root.x} = 0`);
  if(magazineId){const chosen=byId.get(magazineId);constraints.push(chosen?`${chosen.x} = 1`:`${root.x} = 0`);}
  if(scopeId){
    const chosen=byId.get(scopeId);
    constraints.push(chosen?`${chosen.x} = 1`:`${root.x} = 0`);
  }else{
    for(const kind of availableIronSightKinds(catalog,weaponId,options)){
      const sightEdges=edges.filter(e=>ironSightKinds(e.node.item,e.slot).includes(kind));
      constraints.push(`${expression(sightEdges.map(e=>[1,e.name]))} >= 1`);
    }
  }
  const dominated=dominatedLeafNodes(catalog,options,nodes);
  for(const node of dominated)constraints.push(`${node.x} = 0`);
  const ergoTerms = nodes.map(n=>[n.item.ergo,n.x]);
  const recoilTerms = nodes.map(n=>[n.item.recoil,n.x]);
  const countTerms = nodes.map(n=>[1,n.x]);
  const weightTerms = nodes.map(n=>[n.item.weight??0,n.x]);
  const priceTerms=nodes.filter(n=>n!==root).map(n=>[cheapestOffer(n.item,options)?.priceRUB??0,n.purchase??n.x]);
  const unpricedTerms=nodes.filter(n=>n!==root&&!(cheapestOffer(n.item,options)?.priceRUB>0)).map(n=>[1,n.purchase??n.x]);
  if(options.maxBudget!==null&&options.maxBudget!==undefined){
    constraints.push(`${expression(unpricedTerms)} = 0`);
    constraints.push(`${expression(priceTerms)} <= ${options.maxBudget}`);
  }
  const magazineFitTerms=slots.filter(s=>s.key==='mod_magazine').flatMap(s=>s.edges.filter(e=>e.node.item.capacity>0).map(e=>[Math.min(e.node.item.capacity,magazine),e.name]));
  // Count sight-supporting mounts, including mixed-purpose rails, but not magwells.
  const sightMemo=new Map();
  function supportsSight(id,active=new Set()){
    if(sightMemo.has(id))return sightMemo.get(id);
    if(active.has(id))return false;
    const item=items[id];if(!item)return false;
    if(isOptic(item)||isIronSight(item))return true;
    active.add(id);
    const result=item.slots.some(s=>s.allowed.some(child=>supportsSight(child,active)));
    active.delete(id);sightMemo.set(id,result);return result;
  }
  const mountTerms=nodes.filter(n=>n.item.category==='Mount'&&supportsSight(n.id)).map(n=>[1,n.x]);
  const highMountTerms=nodes.filter(n=>mountProfile(n.item)==='high').map(n=>[1,n.x]);
  const specialMountTerms=nodes.filter(n=>isSpecialMount(n.item)).map(n=>[1,n.x]);
  const nonLowMountTerms=nodes.filter(n=>n.item.category==='Mount'&&supportsSight(n.id)&&mountProfile(n.item)!=='low').map(n=>[1,n.x]);
  function lp(objective, extra=[]) {
    const terms = {ergo:ergoTerms,count:countTerms,recoil:recoilTerms,mounts:mountTerms,weight:weightTerms,profile:highMountTerms,special:specialMountTerms,nonLow:nonLowMountTerms,price:priceTerms,unpriced:unpricedTerms,magazineFit:magazineFitTerms,feasibility:[]}[objective];
    return `${['ergo','magazineFit'].includes(objective) ? 'Maximize' : 'Minimize'}\n obj: ${expression(terms)}\nSubject To\n${constraints.concat(extra).map((c,i)=>` c${i}: ${c}`).join('\n')}\nBounds\n${bounds.join('\n')}\nBinary\n${binaries.join(' ')}\n${integers.length ? `General\n${integers.join(' ')}\n` : ''}End`;
  }
  return { root,nodes,slots,edges,lp,ergoTerms,recoilTerms,mountTerms,highMountTerms,specialMountTerms,nonLowMountTerms,weightTerms,countTerms,priceTerms,unpricedTerms,magazineFitTerms,missing:[...missing],conflictCount:conflictPairs.size,dominatedCount:dominated.length,byId };
}
export function validateBuild(catalog, options, rows) {
  const items=catalog.items, root=items[options.weaponId], errors=[];
  const occurrences=[{itemId:root.id,parent:null,slotId:null},...rows];
  for(let index=0;index<occurrences.length;index++) {
    const row=occurrences[index], item=items[row.itemId];
    if(!item){errors.push('Unknown item');continue;}
    if(!isAvailable(item,options,catalog))errors.push(`Item excluded by availability settings: ${item.shortName}`);
    const factoryCount=factoryPartCount(item,options,catalog);
    if(factoryCount&&!cheapestOffer(item,options)&&occurrences.filter(r=>r.itemId===item.id).length>factoryCount)errors.push(`Factory quantity exceeded: ${item.shortName}`);
    if(index>0 && (!Number.isInteger(row.parent)||row.parent<0||row.parent>=index)) {errors.push('Invalid assembly chain');continue;}
    for(const slot of item.slots) {
      const children=occurrences.filter((r,i)=>i>0&&r.parent===index&&r.slotId===slot.id);
      const ironSights=!options.scopeId&&isIronSightSlot(slot,items);
      const required=slot.required||(slot.key==='mod_magazine'&&(options.magazine>0||options.magazineId));
      if(children.length>1||(required&&children.length!==1)) errors.push(`Invalid slot assignment: ${item.shortName} / ${slot.name}`);
      for(const child of children) {
        if(!slot.allowed.includes(child.itemId)) errors.push('Incompatible attachment');
        if(ironSights&&!isIronSight(items[child.itemId]))errors.push('Iron sight requirement not met');
        if(slot.key==='mod_magazine'&&options.magazineId&&child.itemId!==options.magazineId)errors.push('Selected magazine requirement not met');
      }
    }
    if(index>0&&!items[occurrences[row.parent].itemId].slots.some(s=>s.id===row.slotId)) errors.push('Unknown attachment slot');
    for(const [otherIndex,other] of occurrences.entries()) {
      if(otherIndex===index)continue;
      if(item.conflicts.includes(other.itemId)||item.conflictCategories.some(c=>items[other.itemId]?.categories.includes(c))) errors.push(`Item conflict: ${item.shortName}`);
      if(other.slotId&&item.blockedSlots.includes(other.slotId)) errors.push(`Blocked slot: ${item.shortName}`);
    }
  }
  const silenced=occurrences.some(r=>items[r.itemId]?.suppressor);
  if(options.magazineId&&occurrences.filter(r=>r.itemId===options.magazineId).length!==1)errors.push('Selected magazine missing or duplicated');
  if(silenced!==(options.sound==='silenced')) errors.push('Suppressor requirement not met');
  const optics=occurrences.filter(r=>isOptic(items[r.itemId]));
  if(options.scopeId ? optics.length!==1||optics[0]?.itemId!==options.scopeId : optics.length!==0)errors.push('Selected optic requirement not met');
  if(!options.scopeId)for(const kind of availableIronSightKinds(catalog,options.weaponId,options)){
    if(!occurrences.some((r,i)=>i>0&&items[occurrences[r.parent]?.itemId]?.slots.some(s=>s.id===r.slotId&&ironSightKinds(items[r.itemId],s).includes(kind))))errors.push(`Missing iron sight: ${kind}`);
  }
  const carriesOptic=index=>occurrences.some((r,i)=>
    i>index&&r.parent===index&&(
      isOptic(items[r.itemId])||(!options.scopeId&&isIronSight(items[r.itemId]))||carriesOptic(i)
    )
  );
  occurrences.forEach((row,index)=>{
    if(index===0||!items[row.itemId]?.opticMount||!Number.isInteger(row.parent)||row.parent<0||row.parent>=index)return;
    const parentSlot=items[occurrences[row.parent].itemId]?.slots.find(s=>s.id===row.slotId);
    if(parentSlot&&!parentSlot.required&&!carriesOptic(index))errors.push('Unused optic mount');
  });
  return [...new Set(errors)];
}
export function optimize(catalog, options, solver, progress=()=>{}) {
  if(!['ergo','recoil','balanced'].includes(options.mode)) throw new Error('Invalid build objective.');
  if(!Number.isFinite(options.balance)||options.balance<0||options.balance>100) throw new Error('Invalid ergonomics threshold.');
  if(options.maxBudget!==null&&options.maxBudget!==undefined&&(!Number.isSafeInteger(options.maxBudget)||options.maxBudget<1||options.maxBudget>100000000))throw new Error('Invalid attachment budget.');
  const started=Date.now(), problem=createProblem(catalog,options);
  const {nodes,lp,ergoTerms,recoilTerms,mountTerms,highMountTerms,specialMountTerms,nonLowMountTerms,weightTerms,countTerms,priceTerms,unpricedTerms,magazineFitTerms}=problem;
  const extra=[]; let allOptimal=true, latest, maxErgo=null, floor=null;
  const sum=(result,terms)=>rounded(terms.reduce((s,[v,k])=>s+v*(result.Columns?.[k]?.Primal??0),0));
  function solve(objective,label) {
    progress(label);
    const result=solver.solve(lp(objective,extra),{output_flag:false,time_limit:30,mip_rel_gap:0,mip_abs_gap:0});
    if(result.Status==='Infeasible') return null;
    if(!result.Columns||!Object.values(result.Columns).every(c=>Number.isFinite(c.Primal))) throw new Error(`No valid solution (${result.Status}). Please try again.`);
    allOptimal&&=result.Status==='Optimal'; latest=result; return result;
  }
  if(options.magazine>1&&!options.magazineId&&magazineFitTerms.length){
    const preferred=solve('magazineFit','Finding the closest compatible magazine capacity …');
    if(!preferred)return {status:'infeasible',missing:problem.missing};
    extra.push(`${expression(magazineFitTerms)} >= ${Math.round(sum(preferred,magazineFitTerms))}`);
  }
  if(options.mode==='ergo'||options.mode==='balanced') {
    const first=solve('ergo','Calculating maximum ergonomics …');
    if(!first) return {status:'infeasible',missing:problem.missing};
    maxErgo=clamp(sum(first,ergoTerms));
    if(options.mode==='balanced'&&!allOptimal) return {status:'unproven',message:'The maximum ergonomics value was not proved within the time limit. A reliable Balanced threshold could not be established.'};
    // Balanced is a target on the 0-100 scale; use the closest achievable maximum
    // if the selected weapon, scope and availability rules cannot reach it.
    floor=options.mode==='ergo'?maxErgo:Math.min(maxErgo,options.balance);
    if(floor>0) extra.push(`${expression(ergoTerms)} >= ${floor-1e-7}`);
    const second=solve('recoil','Minimizing recoil within the ergonomics requirement …');
    if(!second) throw new Error('No solution satisfies the calculated ergonomics threshold.');
    extra.push(`${expression(recoilTerms)} <= ${sum(second,recoilTerms)+1e-8}`);
    if(options.mode==='balanced') {
      const third=solve('ergo','Improving ergonomics at the same recoil …');
      if(!third) throw new Error('Could not select between equivalent builds.');
      const tieErgo=clamp(sum(third,ergoTerms));
      if(tieErgo>0) extra.push(`${expression(ergoTerms)} >= ${tieErgo-1e-7}`);
    }
  } else {
    const first=solve('recoil','Calculating minimum recoil …');
    if(!first) return {status:'infeasible',missing:problem.missing};
    extra.push(`${expression(recoilTerms)} <= ${sum(first,recoilTerms)+1e-8}`);
    const second=solve('ergo','Improving ergonomics at minimum recoil …');
    if(!second) throw new Error('Ergonomics optimization failed.');
    const tieErgo=clamp(sum(second,ergoTerms));
    if(tieErgo>0) extra.push(`${expression(ergoTerms)} >= ${tieErgo-1e-7}`);
  }
  function priceTieBreak(){
    const before=latest;
    extra.push(`${expression(countTerms)} = ${Math.round(sum(before,countTerms))}`);
    if(unpricedTerms.length){
      const known=solve('unpriced','Preferring available vendor offers between equivalent builds …');
      if(!known){latest=before;return;}
      extra.push(`${expression(unpricedTerms)} = ${Math.round(sum(known,unpricedTerms))}`);
    }
    latest=solve('price','Choosing the cheapest equivalent vendor build …')??before;
  }
  const best=solve('weight','Choosing the lightest build at equal performance …');
  if(!best)throw new Error('Weight optimization failed.');
  extra.push(`${expression(weightTerms)} <= ${sum(best,weightTerms)+1e-7}`);
  const compact=solve('count','Removing unnecessary parts …');
  latest=compact??best;
  priceTieBreak();
  const baseline=latest,baselineErgo=clamp(sum(baseline,ergoTerms)),baselineRecoil=sum(baseline,recoilTerms);
  const baselineMounts=Math.round(sum(baseline,mountTerms)),baselineHigh=Math.round(sum(baseline,highMountTerms)),baselineNonLow=Math.round(sum(baseline,nonLowMountTerms));
  const baselineSpecial=Math.round(sum(baseline,specialMountTerms));
  let practical={enabled:options.preferPracticalMounts!==false,applied:false,ergoLoss:0,mountsRemoved:0,baselineErgo,baselineMounts,highMountsRemoved:0,specialMountsRemoved:0,lowerProfile:false};
  if(practical.enabled&&baselineMounts>0){
    // Only simplify the mounting system. Keep the main weapon parts and exact
    // scope; allow iron sights and mounts to move/change with the new route.
    extra.length=0;
    const practicalFloor=Math.max(0,baselineErgo-4);
    if(practicalFloor>0)extra.push(`${expression(ergoTerms)} >= ${practicalFloor-1e-7}`);
    extra.push(`${expression(recoilTerms)} = ${baselineRecoil}`);
    for(const node of nodes)if(node.item.category!=='Mount'&&!isIronSight(node.item)){
      extra.push(`${node.x} = ${Math.round(baseline.Columns[node.x]?.Primal??0)}`);
    }
    const lower=solve('profile','Avoiding high-profile mounts and risers within 4 Ergo …');
    if(lower)extra.push(`${expression(highMountTerms)} = ${Math.round(sum(lower,highMountTerms))}`);
    const standard=lower&&(specialMountTerms.length?solve('special','Preferring ordinary mounts over specialized housings …'):lower);
    if(standard&&specialMountTerms.length)extra.push(`${expression(specialMountTerms)} = ${Math.round(sum(standard,specialMountTerms))}`);
    const lowPreferred=standard&&solve('nonLow','Preferring reviewed low-profile mounting routes …');
    if(lowPreferred)extra.push(`${expression(nonLowMountTerms)} = ${Math.round(sum(lowPreferred,nonLowMountTerms))}`);
    const simpler=lowPreferred&&solve('mounts','Finding practical mounts within 4 Ergo of the reference build …');
    if(simpler&&(Math.round(sum(simpler,highMountTerms))<baselineHigh||Math.round(sum(simpler,specialMountTerms))<baselineSpecial||Math.round(sum(simpler,nonLowMountTerms))<baselineNonLow||Math.round(sum(simpler,mountTerms))<baselineMounts)){
      const mounts=Math.round(sum(simpler,mountTerms));
      extra.push(`${expression(mountTerms)} = ${mounts}`);
      const ergonomic=solve('ergo','Preserving ergonomics with fewer mounts …');
      if(ergonomic){
        const keepErgo=clamp(sum(ergonomic,ergoTerms));
        if(keepErgo>0)extra.push(`${expression(ergoTerms)} >= ${keepErgo-1e-7}`);
        const lighter=solve('weight','Choosing the lighter practical mounting system …');
        if(lighter){
          extra.push(`${expression(weightTerms)} <= ${sum(lighter,weightTerms)+1e-7}`);
          const minimal=solve('count','Removing redundant mounting parts …');
          latest=minimal??lighter;
          priceTieBreak();
        }else latest=ergonomic;
        floor=practicalFloor;
        practical={...practical,applied:true,specialMountsRemoved:baselineSpecial-Math.round(sum(latest,specialMountTerms)),highMountsRemoved:baselineHigh-Math.round(sum(latest,highMountTerms)),lowerProfile:Math.round(sum(latest,highMountTerms))<baselineHigh||Math.round(sum(latest,nonLowMountTerms))<baselineNonLow,ergoLoss:rounded(baselineErgo-clamp(sum(latest,ergoTerms))),mountsRemoved:baselineMounts-Math.round(sum(latest,mountTerms))};
      }else latest=baseline;
    }else latest=baseline;
  }
  const remaining=new Map(problem.edges.map(e=>[e.name,Math.round(latest.Columns[e.name]?.Primal??0)]));
  let rows=[];
  function assemble(node,parentIndex,path) {
    for(const slot of node.slots) {
      const edge=slot.edges.find(e=>remaining.get(e.name)>0);
      if(!edge) {if(slot.required) throw new Error('Incomplete assembly in the optimization result.');continue;}
      remaining.set(edge.name,remaining.get(edge.name)-1);
      const index=rows.length+1;
      rows.push({itemId:edge.node.id,parent:parentIndex,slotId:slot.id,slotName:slot.name,path:`${path} › ${slot.name}`});
      assemble(edge.node,index,`${path} › ${edge.node.item.shortName}`);
    }
  }
  assemble(problem.root,0,problem.root.item.shortName);
  if([...remaining.values()].some(v=>v!==0)) throw new Error('The result contains unattached parts.');
  progress('Checking handguard heat and cooling without changing main stats …');
  const thermalPreference=preferThermalHandguards(catalog,options,rows,validateBuild);
  rows=thermalPreference.rows;
  const errors=validateBuild(catalog,options,rows);
  if(errors.length) throw new Error(`Compatibility validation failed: ${errors.join('; ')}`);
  const cost=buildCost(catalog,options,rows);
  if(options.maxBudget!=null&&(cost.unpriced||cost.priceRUB>options.maxBudget+0.01))throw new Error('The result exceeds the attachment budget.');
  const rawErgo=sum(latest,ergoTerms), recoil=sum(latest,recoilTerms), weapon=problem.root.item;
  if(practical.applied&&(baselineErgo-clamp(rawErgo)>4+1e-5||Math.abs(recoil-baselineRecoil)>1e-6))throw new Error('Practical mounting limits were not met.');
  if(floor>0&&clamp(rawErgo)<floor-1e-5) throw new Error('The ergonomics threshold was not met.');
  const weight=[options.weaponId,...rows.map(row=>row.itemId)].reduce((sum,id)=>sum+(catalog.items[id].weight??0),0);
  const magazineSlotIds=new Set(problem.slots.filter(s=>s.key==='mod_magazine').map(s=>s.id));
  const magazineCapacity=rows.filter(row=>magazineSlotIds.has(row.slotId)).reduce((capacity,row)=>Math.max(capacity,problem.byId.get(row.itemId)?.item.capacity??0),0)||null;
  const balanceTarget=options.mode==='balanced'?options.balance:null;
  const balanceShortfall=balanceTarget===null?0:rounded(Math.max(0,balanceTarget-clamp(rawErgo)));
  return {status:allOptimal&&problem.missing.length===0?'optimal':'feasible',rows,cost,ergo:clamp(rawErgo),rawErgo,recoil,vertical:Math.max(0,weapon.vertical*(1+recoil)),horizontal:Math.max(0,weapon.horizontal*(1+recoil)),weight,magazineCapacity,maxErgo,floor,balanceTarget,balanceShortfall,practical,thermalPreference:{applied:thermalPreference.applied,swaps:thermalPreference.swaps},seconds:(Date.now()-started)/1000,considered:nodes.length,conflictCount:problem.conflictCount,missing:problem.missing,engine:ENGINE_VERSION};
}
