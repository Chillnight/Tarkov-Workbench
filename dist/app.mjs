// Author: CA
import * as storage from './storage.mjs';
import {loadDatabase,setupDatabaseUpdates} from './database-ui.mjs';
import {setupAppUpdates} from './app-update-ui.mjs';
setupAppUpdates();
import {createWeaponPicker,moddableWeapons} from './weapon-picker.mjs';
import {setupAttachmentPickers} from './attachment-picker.mjs';
import {reachableMagazines} from './attachment-choices.mjs';
import {MAGAZINE_MINIMUMS,normalizeMagazineMinimum,magazineMinimumLabel} from './magazine-preferences.mjs';
import {setupSettings} from './settings-ui.mjs';
import {defaultTraderSettings,normalizeTraderSettings,offerLabel,buildCost,TRADERS} from './traders.mjs';
import {ENGINE_VERSION} from './optimizer.mjs';
import {createShoppingList,formatShoppingList} from './shopping-list.mjs';
import {applyTheme} from './themes.mjs';
import {setupVariantSelection} from './variant-ui.mjs';
import {setupFeedback} from './feedback.mjs';
import {validateBuildInputs} from './input-validation.mjs';
import {isOptic,reachableOptics,zoomLabel} from './optics.mjs';
import {findAlternatives,applyAlternative,alternativeWeightLabel} from './alternatives.mjs';
import {arenaUnlock,isAvailable,availabilityLabel,AVAILABILITY_REVIEWED} from './availability.mjs';
const $=id=>document.getElementById(id);
const state={catalog:null,weapons:[],worker:null,result:null,mode:'balanced',sound:'silenced',scopeId:null,magazineId:null,traderSettings:defaultTraderSettings(),optics:[],running:false,run:0,precomputed:{},cancelCurrent:null,picker:null,bundled:null,snapshot:null,imageURLs:new Map(),updating:false,precomputedLoaded:false};
const number=(n,digits=1)=>Number(n).toLocaleString('en-GB',{maximumFractionDigits:digits});
const signed=(n,digits=1)=>`${n>0?'+':''}${number(n,digits)}`;
const date=value=>new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function notice(message,error=false){$('result-status').textContent=message;$('result-status').classList.toggle('error',error);}
const imageURL=path=>state.imageURLs.get(path)??path;
function options(){return {weaponId:$('weapon').value,mode:state.mode,sound:state.sound,balance:Number($('balance').value),magazine:state.magazineId?1:Number($('magazine').value),magazineId:state.magazineId,scopeId:state.scopeId,maxBudget:$('budget-enabled').checked?Number($('budget-amount').value):null,allowGrenadeLaunchers:$('allow-launchers').checked,...state.traderSettings,excludeArenaUnlocks:$('exclude-arena').checked,preferPracticalMounts:$('practical-mounts').checked};}
const notifyUser=setupFeedback();
const variantSelection=setupVariantSelection({getCatalog:()=>state.catalog,getOptions:options,getSound:()=>state.sound,notify:notifyUser,onSoundChange:sound=>{if(state.sound!==sound){state.sound=sound;invalidate();}}});
function validateSelection(){
  const issue=validateBuildInputs(options());
  if(!issue)return true;
  notice(issue.message,true);notifyUser(issue.title,issue.message,$(issue.field));return false;
}
function mountingSummary(result){
  if(result.manualAlternative)return 'Manual alternative selected · performance preserved · weight and price updated';
  if(!result.practical?.enabled)return 'Maximum stats · practical mounting disabled';
  const p=result.practical;
  return p.applied?`Practical mounting · ${p.ergoLoss>0?'-'+number(p.ergoLoss):'0'} Ergo · same recoil${p.lowerProfile?' · lower-profile route':''}${p.specialMountsRemoved>0?' · standard mount preferred':''} · ${p.mountsRemoved>=0?p.mountsRemoved+' fewer':-p.mountsRemoved+' additional'} mounting parts`:'Practical mounting · no preferred route within 4 Ergo at the same recoil';
}
function refreshAvailability(){
  if(!state.catalog)return;
  const selection=options(),selected=selection.weaponId;
  state.weapons=moddableWeapons(state.catalog).filter(item=>isAvailable(item,{...selection,restrictTraders:false}));
  state.picker?.setItems(state.weapons,state.catalog.meta.weaponCount-state.weapons.length);
  if(selected&&state.weapons.some(item=>item.id===selected))state.picker.select(selected);
  const excluded=Object.values(state.catalog.items).filter(arenaUnlock).sort((a,b)=>a.name.localeCompare(b.name));
  $('availability-summary').textContent=`View ${excluded.length} known unlock items`;
  $('availability-list').replaceChildren(...excluded.map(item=>{
    const row=element('li');row.append(safeLink(item.wiki||item.link,item.name),element('small',null,arenaUnlock(item)));return row;
  }));
  $('availability-status').textContent=`${availabilityLabel(selection)} · Rules reviewed ${AVAILABILITY_REVIEWED}`;
  $('data-status').textContent=`${state.weapons.length} selectable weapons / ${state.catalog.meta.modCount} attachments · saved locally\nRetrieved: ${date(state.catalog.meta.fetchedAt)}`;
  weaponChanged();
  if(selected&&!state.weapons.some(item=>item.id===selected))notice('The selected weapon requires an Arena unlock and was cleared by the availability filter. Choose another weapon.');
}
function renderScopeSelection(){
  const item=state.catalog?.items[state.scopeId];
  $('scope-name').textContent=item?`${item.shortName} · ${zoomLabel(item)}`:state.scopeId?'Selected scope missing from database':'Iron sights · no scope selected';
  $('scope-description').textContent=item?item.name:'Default: iron sights. Choose an optional scope below.';
  $('scope-description').hidden=!item;
  $('scope-impact').textContent=item?'Scope and mounting penalties are included in the calculated ergonomics.':'No scope selected. Scopes and their mounts affect ergonomics; builds use iron sights by default.';
  $('scope-image').hidden=!item;
  if(item){$('scope-image').src=imageURL(item.icon);$('scope-image').alt=item.shortName;}
  $('scope-change').textContent=item?'Change scope':'Choose scope';
}
function renderMagazineSelection(){
  const item=state.catalog?.items[state.magazineId];
  const minimum=Number($('magazine').value);
  $('magazine-name').textContent=item?`${item.shortName} · ${item.capacity} rounds`:'Automatic magazine';
  $('magazine-description').textContent=item?item.name:`${magazineMinimumLabel(minimum)} · automatic selection`;
  $('magazine-image').hidden=!item;
  if(item){$('magazine-image').src=imageURL(item.icon);$('magazine-image').alt=item.shortName;}
  $('magazine-change').textContent=item?'Change magazine':'Choose magazine';
  $('magazine-capacity-field').hidden=Boolean(item);
  const weaponId=$('weapon')?.value;
  const checkCapacity=Boolean(!state.magazineId&&minimum>1&&weaponId&&state.catalog);
  const magazines=checkCapacity?reachableMagazines(state.catalog,weaponId,options()):[];
  const highest=Math.max(0,...magazines.map(m=>m.capacity));
  const unavailable=checkCapacity&&highest<minimum;
  $('magazine-minimum-warning').hidden=!unavailable;
  $('magazine-minimum-warning').textContent=unavailable?highest?`Target ${minimum} rounds; available magazines reach up to ${highest}. The build will use the highest capacity that fits the complete assembly. Your preference is kept.`:'No available magazine is listed with these settings. A build requiring one may be impossible.':'';
}
function renderBalance(){
  $('balance-value').value=`${$('balance').value} Ergo`;
  $('balance').setAttribute('aria-valuetext',`${$('balance').value} Ergo`);
}
function renderSuppressorSelection(){
  return variantSelection.refresh();
}
function traderSummary(){
  const settings=state.traderSettings;
  $('trader-summary').textContent=settings.restrictTraders?`Trader offers only · ${TRADERS.map(t=>`${t.name} ${settings.traderLevels[t.id]}`).join(' / ')} · Quest offers ${settings.includeQuestOffers?'included':'excluded'} · Barters ${settings.includeBarters?'included':'excluded'}`:'Unrestricted attachments · Vendor prices shown where available';
}
function invalidate(){
  if(state.running)cancel();
  state.result=null;$('stats').hidden=true;$('copy').disabled=true;$('build-section').hidden=true;$('welcome-guide').hidden=false;
  $('parts').replaceChildren(element('div','empty','Selection ready. Calculate your compatible build.'));
  $('build-caption').textContent='Adapters and required parts are listed in assembly order.';
  notice($('weapon').value?'Selection ready. Select “Calculate build” when you are ready.':'Choose a weapon and objective, then calculate your build.');
}
function weaponChanged(){
  invalidate();const item=state.catalog.items[$('weapon').value];
  $('welcome-banner').hidden=Boolean(item);$('weapon-card').hidden=!item;
  $('calculate').disabled=!item||state.updating;$('scope-change').disabled=!item||state.updating;$('magazine-change').disabled=!item||state.updating;
  renderSuppressorSelection();
  if(!item){state.optics=[];renderScopeSelection();renderMagazineSelection();return;}
  state.optics=reachableOptics(state.catalog,item.id,options());
  if(state.scopeId&&!state.optics.some(i=>i.id===state.scopeId)){notice('Your selected scope is kept, but no eligible mounting path exists with these settings. Adjust trader settings or explicitly choose another scope.',true);}
  const magazines=reachableMagazines(state.catalog,item.id,options());
  if(state.magazineId&&!magazines.some(i=>i.id===state.magazineId)){notice('Your selected magazine is kept, but is unavailable with these settings. Adjust settings or explicitly choose another magazine.',true);}
  renderScopeSelection();renderMagazineSelection();
  $('weapon-name').textContent=item.shortName;$('weapon-full-name').textContent=item.name;
  const caliber=(item.caliber??'').replace(/^Caliber/,'').replace(/NATO$/,' NATO').replace(/x/g,'×');
  $('weapon-category').textContent=`${item.category} / ${caliber}`;
  const img=$('weapon-image');img.hidden=false;img.src=imageURL(item.image);img.alt=item.name;img.onerror=()=>{img.hidden=true;};
}
function setMode(mode){state.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));$('balance-field').hidden=mode!=='balanced';invalidate();}
async function setSound(sound){return variantSelection.select(sound);}
function busy(value){state.running=value;$('calculate').disabled=value||!$('weapon').value||state.updating;$('cancel').hidden=!value;$('calculate').firstChild.textContent=value?'Calculating build … ':'Calculate build ';}
function cancel(){state.run++;state.worker?.terminate();state.worker=null;state.cancelCurrent?.();state.cancelCurrent=null;busy(false);notice('Calculation cancelled. Change your selection or try again.');}
function safeLink(url,label){const a=element('a',null,label);try{const u=new URL(url);if(u.protocol==='https:'&&['escapefromtarkov.fandom.com','escapefromtarkov.wiki.gg','tarkov.dev'].includes(u.hostname)){a.href=u.href;a.target='_blank';a.rel='noreferrer';}}catch{}return a;}
function renderShoppingList(selection,rows){
  const list=createShoppingList(state.catalog,selection,rows),details=element('details','shopping-list');
  const count=rows.length;
  details.append(element('summary',null,`Trader shopping list · ${count} part${count===1?'':'s'} · ${list.groups.length} vendor group${list.groups.length===1?'':'s'}`));
  const copy=element('button','subtle','Copy shopping list');copy.type='button';
  copy.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(formatShoppingList(list));copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy shopping list',2000);}
    catch{notice('Clipboard access was blocked. Select and copy the shopping list manually.',true);}
  });
  details.append(copy,element('p','hint','Attachments only · weapon excluded. Best eligible saved trader offer per part; live stock is not checked. Barter RUB values are estimates.'));
  for(const group of list.groups){
    details.append(element('h3',null,`${group.traderName} · ${group.kind==='barter'?'Barter':'Cash'}`));
    const items=element('ul');
    for(const {item,offer,quantity} of group.items){
      const entry=element('li');
      entry.append(element('b',null,`${quantity} × ${item.shortName} – ${item.name}`));
      const level=`LL${offer.minTraderLevel}${offer.taskUnlock?' · quest unlock assumed':''}`;
      if(group.kind==='barter'){
        const trades=Math.ceil(quantity/(offer.rewardCount||1));
        const recipe=(offer.requiredItems??[]).map(required=>`${required.count*trades} × ${required.name}${Object.keys(required.attributes??{}).length?' ('+Object.entries(required.attributes).map(([key,value])=>`${key}: ${value}`).join(', ')+')':''}`).join(' + ');
        entry.append(element('span',null,`${level} · ${trades} trade${trades===1?'':'s'} · ${recipe||'ingredients unknown'}${Number.isFinite(offer.priceRUB)&&offer.priceRUB>0?` · estimated ${number(offer.priceRUB*quantity,0)} RUB`:''}`));
      }else entry.append(element('span',null,`${level} · ${number(offer.price,0)} ${offer.currency} each`));
      items.append(entry);
    }
    details.append(items);
  }
  if(list.unavailable.length){
    details.append(element('h3',null,'No eligible trader offer / price unknown'));
    const items=element('ul');for(const {item,quantity} of list.unavailable)items.append(element('li',null,`${quantity} × ${item.shortName} – ${item.name}`));details.append(items);
  }
  if(list.included.length){
    details.append(element('h3',null,'Factory parts · included with selected weapon'));
    const items=element('ul');for(const {item,quantity} of list.included)items.append(element('li',null,`${quantity} × ${item.shortName} – ${item.name} · no purchase needed`));details.append(items);
  }
  if(!count)details.append(element('p','hint','No attachments to buy.'));
  return details;
}
function render(result,selection){
  $('build-section').hidden=false;$('welcome-guide').hidden=true;state.result={...result,selection};$('parts').replaceChildren();$('stats').replaceChildren();$('stats').hidden=true;$('copy').disabled=true;
  if(result.status==='infeasible'){
    notice(`No compatible ${selection.sound==='silenced'?'Silenced':'Unsilenced'} build meets these requirements${selection.maxBudget!=null?` within the ${number(selection.maxBudget,0)} RUB attachment budget`:''}. Check trader levels in Settings, the selected scope and magazine, or the suppressor variant. A required upgrade may have no eligible offer${selection.maxBudget!=null?' or known price':''}. Your chosen scope and magazine remain selected.`,true);
    notifyUser('No compatible build found',selection.maxBudget!=null?`No complete build fits your ${number(selection.maxBudget,0)} RUB attachment budget and current settings. Increase the budget or review your trader levels, scope and magazine. Your selected attachments have been kept.`:'No complete build meets the current requirements. Review your trader levels, selected scope, magazine and suppressor variant. Your selected attachments have been kept.');
    $('parts').append(element('div','empty','No valid assembly found.'));return;
  }
  if(result.status==='unproven'){notice(result.message,true);return;}
  if(selection.scopeId&&!result.rows.some(row=>row.itemId===selection.scopeId)){notice('The result does not contain your selected scope. It was rejected; please recalculate.',true);state.result=null;return;}
  const optimal=result.status==='optimal';
  notice(`${optimal?(result.practical?.enabled?'Practical build confirmed':'Optimum confirmed'):'Valid build · optimum not confirmed'} · ${number(result.considered,0)} reachable items checked · ${number(result.seconds)} s${result.missing?.length?' · Incomplete source data':''}`,!optimal);
  $('stats').hidden=false;$('copy').disabled=false;
  for(const [label,value,detail] of [['ERGONOMICS',number(result.ergo),'out of 100'],['VERTICAL RECOIL',number(result.vertical),'lower is better'],['HORIZONTAL RECOIL',number(result.horizontal),`${signed(result.recoil*100)}% modifier`],['WEIGHT',`${number(result.weight,2)} kg`,'without ammunition']]){
    const stat=element('div','stat');stat.append(element('span','stat-label',label),element('span','stat-value',value),element('small',null,detail));$('stats').append(stat);
  }
  $('build-caption').textContent=`${{ergo:selection.preferPracticalMounts!==false?'Ergo-focused':'Maximum ergo',recoil:'Minimum recoil',balanced:'Balanced'}[selection.mode]} · ${selection.sound==='silenced'?'Silenced':'Unsilenced'} · ${selection.scopeId?state.catalog.items[selection.scopeId].shortName:'Iron sights · no scope'} · ${result.rows.length} parts${selection.mode==='balanced'?` · target ${selection.balance} Ergo / actual ${number(result.ergo)}${result.balanceShortfall>0?` (${number(result.balanceShortfall)} below target)`:''}`:''}`;
  $('build-caption').textContent+=` · ${availabilityLabel(selection)} · ${selection.restrictTraders?'Trader levels applied':'Unrestricted attachments'} · ${selection.allowGrenadeLaunchers?'Launchers allowed':'No underbarrel launchers'}`;
  if(selection.maxBudget!=null)$('build-caption').textContent+=` · max ${number(selection.maxBudget,0)} RUB attachments`;
  if(result.magazineCapacity)$('build-caption').textContent+=` · ${result.magazineCapacity}-round magazine${!selection.magazineId&&selection.magazine>1?` (target ${selection.magazine})`:''}`;
  const cost=buildCost(state.catalog,selection,result.rows);
  $('parts').append(element('p','cost-summary',`Attachment cost${cost.barterCount?' estimate':''}: ${number(cost.priceRUB,0)} RUB${cost.unpriced?` + ${cost.unpriced} parts without a known value`:''} · weapon excluded · saved offers${cost.factoryCount?` · ${cost.factoryCount} factory part(s) included with weapon`:''}${cost.barterCount?` · ${cost.barterCount} barter item(s), ingredient values estimated`:``}`));
  $('parts').append(renderShoppingList(selection,result.rows));
  $('parts').append(element('p','mounting-summary',mountingSummary(result)));
  if(!selection.magazineId&&selection.magazine>1&&result.magazineCapacity&&result.magazineCapacity<selection.magazine)$('parts').append(element('p','hint',`Magazine target: ${selection.magazine} rounds. The best compatible capacity is ${result.magazineCapacity} rounds, so the build uses that magazine.`));
  if(selection.mode==='balanced'&&result.maxErgo<selection.balance)$('parts').append(element('p','hint',`Target exceeds the achievable maximum of ${number(result.maxErgo)} Ergo. Used the closest feasible reference build${result.practical?.applied?', then simplified its mounts within 4 Ergo':''}.`));
  if(!result.rows.length)$('parts').append(element('div','empty','This build does not need any additional attachments.'));
  const items=state.catalog.items;
  const alternatives=findAlternatives(state.catalog,selection,result.rows);
  const displayedCounts=new Map();
  for(const [rowIndex,row] of result.rows.entries()){
    const occurrence=(displayedCounts.get(row.itemId)??0)+1;displayedCounts.set(row.itemId,occurrence);
    const item=items[row.itemId];const article=element('article','part');const img=element('img');img.src=imageURL(item.icon);img.alt=item.shortName;img.loading='lazy';img.width=64;img.height=58;
    img.onerror=()=>{img.replaceWith(element('span','muted','Image unavailable'));};
    const content=element('div');const title=element('p','part-name');title.append(element('b',null,item.shortName),document.createTextNode(' – '),safeLink(item.wiki||item.link,item.name));
    content.append(title,element('p','part-path',row.path),element('p','vendor-price',offerLabel(item,selection,state.catalog,occurrence)));
    if(item.id===selection.magazineId)content.append(element('span','scope-badge','Your selected magazine'));
    if(arenaUnlock(item))content.append(element('span','scope-badge',`Requires unlock: ${arenaUnlock(item)}`));
    if(item.id===selection.scopeId){article.classList.add('selected-scope-part');content.append(element('span','scope-badge','Your selected scope'));}
    if(alternatives[rowIndex].length){
      const details=element('details','alternatives');
      details.append(element('summary',null,`${alternatives[rowIndex].length} compatible alternative${alternatives[rowIndex].length===1?'':'s'}`),element('p','alternative-note','Same Ergo, recoil and other recorded performance stats. Weight and price may differ. Each swap preserves all installed parts and is checked against this entire build. Current availability settings apply.'));
      for(const id of alternatives[rowIndex]){
        const alt=items[id],entry=element('div','alternative-item'),thumbnail=element('img');thumbnail.src=imageURL(alt.icon);thumbnail.alt='';thumbnail.loading='lazy';
        const name=element('span');name.append(element('b',null,alt.shortName),document.createTextNode(` – ${alt.name} · ${number(alt.weight??0,3)} kg · ${alternativeWeightLabel(item,alt)} · ${offerLabel(alt,selection,state.catalog,1+result.rows.filter(r=>r.itemId===alt.id).length)}`));
        const use=element('button','subtle','Use');use.type='button';use.setAttribute('aria-label',`Use alternative ${alt.name}`);
        use.addEventListener('click',()=>{
          const swapped=applyAlternative(state.catalog,selection,result,rowIndex,id);
          if(!swapped){notice('This alternative no longer fits the current build. Recalculate to check it again.',true);return;}
          render(swapped,selection);
          notice(`Using ${alt.shortName}. Performance stats preserved; weight and price updated. Complete assembly rechecked.`);
        });
        entry.append(thumbnail,name,use);details.append(entry);
      }
      content.append(details);
    }
    const conflicts=[...new Set([...item.conflicts,...Object.values(items).filter(i=>i.id!==item.id&&(i.conflicts.includes(item.id)||item.conflictCategories.some(c=>i.categories.includes(c))||i.conflictCategories.some(c=>item.categories.includes(c)))).map(i=>i.id)])].filter(id=>id!==item.id&&items[id]);
    if(conflicts.length||item.blockedSlots.length){
      const details=element('details');details.append(element('summary',null,`${conflicts.length} conflicting parts${item.blockedSlots.length?` · ${item.blockedSlots.length} blocked slots`:''}`));
      if(conflicts.length)details.append(element('p',null,conflicts.map(id=>`${items[id].shortName} – ${items[id].name}`).join(' · ')));
      if(item.blockedSlots.length){const labels=Object.values(items).flatMap(i=>i.slots.filter(s=>item.blockedSlots.includes(s.id)).map(s=>`${i.shortName} / ${s.name}`));details.append(element('p',null,`Blocks: ${[...new Set(labels)].join(' · ')}`));}
      content.append(details);
    }
    const values=element('div','part-values');values.append(element('div',null,`${signed(item.ergo)} Ergo`),element('div',null,`${signed(item.recoil*100)} % Recoil`));
    if(item.capacity)values.append(element('div',null,`${item.capacity} rounds`));
    article.append(img,content,values);$('parts').append(article);
  }
}
async function calculate(){
  if(!state.catalog||state.running||state.updating||!$('weapon').value)return;
  if(!validateSelection())return;
  const weaponId=$('weapon').value;
  await renderSuppressorSelection();
  if(weaponId!==$('weapon').value||state.running||state.updating||!validateSelection())return;
  if(!await setSound(state.sound))return;
  if(weaponId!==$('weapon').value||state.running||state.updating)return;
  const selection=options(),run=++state.run;busy(true);$('build-section').hidden=false;$('welcome-guide').hidden=true;state.result=null;$('stats').hidden=true;$('copy').disabled=true;
  $('parts').replaceChildren(element('div','empty','Calculating compatible attachment chains …'));
  notice('Preparing your build. You can continue using the interface during calculation.');
  if(!state.precomputedLoaded){
    state.precomputedLoaded=true;
    try{const response=await fetch('./data/precomputed.json');if(response.ok){const saved=await response.json();if(saved.version===state.catalog.meta.version&&saved.engine===ENGINE_VERSION)state.precomputed=saved.builds;}}catch{}
  }
  if(run!==state.run)return;
  const cacheKey=`build:${ENGINE_VERSION}:${state.catalog.meta.version}:${JSON.stringify(selection)}`;
  const cached=state.precomputed[JSON.stringify(selection)]??await storage.get(cacheKey);
  if(run!==state.run)return;
  if(cached){render(cached,selection);busy(false);return cached;}
  return new Promise((resolve,reject)=>{
    state.cancelCurrent=()=>resolve({status:'cancelled'});
    state.worker?.terminate();const worker=new Worker('./worker.mjs',{type:'module'});state.worker=worker;
    const finish=()=>{worker.terminate();if(state.worker===worker)state.worker=null;state.cancelCurrent=null;busy(false);};
    worker.onmessage=async event=>{
      if(run!==state.run)return;
      const message=event.data;
      if(message.type==='progress'){notice(message.message);return;}
      finish();
      if(message.type==='error'){notice(message.message,true);$('parts').replaceChildren(element('div','empty','The calculation could not be completed.'));reject(new Error(message.message));return;}
      try{
        render(message.result,selection);
        if(['optimal','infeasible'].includes(message.result.status))await storage.put(cacheKey,message.result);
        resolve(message.result);
      }catch(error){reject(error);}
    };
    worker.onerror=()=>{if(run!==state.run)return;finish();notice('The optimizer could not start. Open the desktop app, local launcher or website.',true);reject(new Error('Optimizer unavailable'));};
    worker.postMessage({catalog:state.catalog,options:selection});
  });
}

setupAttachmentPickers({getCatalog:()=>state.catalog,getOptions:options,imageURL,validate:validateSelection,onSelect:(kind,id)=>{
  if(kind==='scope')state.scopeId=id;else state.magazineId=id;
  renderScopeSelection();renderMagazineSelection();invalidate();
}});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
document.querySelectorAll('[data-sound]').forEach(b=>b.addEventListener('click',()=>setSound(b.dataset.sound)));
$('balance').addEventListener('input',()=>{renderBalance();invalidate();});
$('magazine').addEventListener('change',async()=>{
  invalidate();renderMagazineSelection();
  const saved=await storage.put('settings:magazineMinimum',Number($('magazine').value));
  $('magazine-preference-status').textContent=saved?'Saved for automatic selection across weapons and restarts. A specific magazine overrides this target.':'Used for this session. Could not save the magazine target; please try again.';
});
$('allow-launchers').addEventListener('change',()=>{invalidate();storage.put('settings:allowGrenadeLaunchers',$('allow-launchers').checked);});
$('practical-mounts').addEventListener('change',()=>{invalidate();storage.put('settings:preferPracticalMounts',$('practical-mounts').checked);});
$('exclude-arena').addEventListener('change',()=>{refreshAvailability();storage.put('settings:excludeArenaUnlocks',$('exclude-arena').checked);});
$('budget-enabled').addEventListener('change',()=>{$('budget-entry').hidden=!$('budget-enabled').checked;invalidate();storage.put('settings:budgetEnabled',$('budget-enabled').checked);});
$('budget-amount').addEventListener('change',()=>{invalidate();const value=Number($('budget-amount').value);if(Number.isSafeInteger(value)&&value>=1&&value<=100000000)storage.put('settings:maxBudget',value);});
$('calculate').addEventListener('click',()=>calculate().catch(error=>{
  busy(false);state.result=null;$('copy').disabled=true;
  notice(`The calculation could not be completed: ${error.message}`,true);
  $('parts').replaceChildren(element('div','empty','Calculation failed. Please retry or adjust your selection.'));
}));$('cancel').addEventListener('click',cancel);
$('copy').addEventListener('click',async()=>{
  const r=state.result;if(!r?.rows)return;
  const i=state.catalog.items;
  const text=[`${i[r.selection.weaponId].name} | ${r.selection.mode} | ${r.selection.sound}`,`Availability: ${availabilityLabel(r.selection)}`,mountingSummary(r),...(r.balanceTarget===null?[]:[`Balanced target: ${r.balanceTarget} Ergo | Actual: ${number(r.ergo)} Ergo`]),`Scope: ${r.selection.scopeId?i[r.selection.scopeId].name:'Iron sights (no scope selected)'}`,`Magazine: ${r.selection.magazineId?i[r.selection.magazineId].name:'Automatic · '+magazineMinimumLabel(r.selection.magazine)}${r.magazineCapacity?` · chosen ${r.magazineCapacity} rounds`:''}`,`Trader limits: ${r.selection.restrictTraders?TRADERS.map(t=>`${t.name} ${r.selection.traderLevels[t.id]}`).join(', '):'Off'} | Quest offers: ${r.selection.includeQuestOffers?'included':'excluded'}`,`Attachment budget: ${r.selection.maxBudget==null?'Off':`${number(r.selection.maxBudget,0)} RUB`} | Estimated cost: ${number(r.cost?.priceRUB??0,0)} RUB`,`Underbarrel launchers: ${r.selection.allowGrenadeLaunchers?'allowed':'excluded'}`,`Ergo ${number(r.ergo)} | Recoil V ${number(r.vertical)} / H ${number(r.horizontal)}`,...r.rows.map((row,index)=>`${i[row.itemId].shortName} - ${i[row.itemId].name} (${row.path}) | ${offerLabel(i[row.itemId],r.selection,state.catalog,1+r.rows.slice(0,index).filter(part=>part.itemId===row.itemId).length)}`),`Data: ${state.catalog.meta.source} | Retrieved ${date(state.catalog.meta.fetchedAt)}`].join('\n');
  try{await navigator.clipboard.writeText(text);$('copy').textContent='Copied';setTimeout(()=>{$('copy').textContent='Copy list';},2000);}catch{notice('Clipboard access was blocked. You can select and copy the attachment list manually.',true);}
});
function webMCP(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  try{Promise.resolve(context.registerTool({name:'calculate_tarkov_build',title:'Calculate Tarkov build',description:'Select a weapon, calculate its compatible build and display the result.',inputSchema:{type:'object',properties:{weaponId:{type:'string'},mode:{enum:['ergo','recoil','balanced']},sound:{enum:['silenced','unsilenced']},balance:{type:'number',minimum:0,maximum:100},magazine:{enum:MAGAZINE_MINIMUMS},scopeId:{type:['string','null']},magazineId:{type:['string','null']},maxBudget:{type:['integer','null'],minimum:1,maximum:100000000},allowGrenadeLaunchers:{type:'boolean'},excludeArenaUnlocks:{type:'boolean'},preferPracticalMounts:{type:'boolean'}},required:['weaponId','mode','sound'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){
    if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['weaponId','mode','sound','balance','magazine','scopeId','magazineId','maxBudget','allowGrenadeLaunchers','excludeArenaUnlocks','preferPracticalMounts'].includes(k))||!moddableWeapons(state.catalog).some(item=>item.id===input.weaponId)||!['ergo','recoil','balanced'].includes(input.mode)||!['silenced','unsilenced'].includes(input.sound)||!(input.balance===undefined||(Number.isFinite(input.balance)&&input.balance>=0&&input.balance<=100))||!(input.magazine===undefined||MAGAZINE_MINIMUMS.includes(input.magazine))||!(input.maxBudget===undefined||input.maxBudget===null||(Number.isSafeInteger(input.maxBudget)&&input.maxBudget>=1&&input.maxBudget<=100000000)))throw new Error('Invalid build selection');
    if(input.excludeArenaUnlocks!==undefined&&typeof input.excludeArenaUnlocks!=='boolean')throw new Error('Invalid availability filter');
    if(input.preferPracticalMounts!==undefined&&typeof input.preferPracticalMounts!=='boolean')throw new Error('Invalid mounting preference');
    input={...input,scopeId:input.scopeId===undefined?state.scopeId:input.scopeId,magazineId:input.magazineId===undefined?state.magazineId:input.magazineId};
    const availability={...state.traderSettings,weaponId:input.weaponId,allowGrenadeLaunchers:input.allowGrenadeLaunchers??$('allow-launchers').checked,excludeArenaUnlocks:input.excludeArenaUnlocks??$('exclude-arena').checked};
    if(typeof availability.allowGrenadeLaunchers!=='boolean')throw new Error('Invalid launcher preference');
    if(input.magazineId&&!reachableMagazines(state.catalog,input.weaponId,availability).some(item=>item.id===input.magazineId))throw new Error('Magazine excluded or incompatible');
    if(!isAvailable(state.catalog.items[input.weaponId],availability))throw new Error('Weapon excluded by availability filter');
    if(input.scopeId&&!reachableOptics(state.catalog,input.weaponId,availability).some(item=>item.id===input.scopeId))throw new Error('Scope excluded or no available mounting path');
    if(input.scopeId!=null&&!isOptic(state.catalog.items[input.scopeId]))throw new Error('Unknown scope');
    if(state.running||state.updating)throw new Error('A calculation or database update is already running');
    $('allow-launchers').checked=availability.allowGrenadeLaunchers;
    $('practical-mounts').checked=input.preferPracticalMounts??$('practical-mounts').checked;await storage.put('settings:preferPracticalMounts',$('practical-mounts').checked);
    $('exclude-arena').checked=availability.excludeArenaUnlocks;refreshAvailability();await storage.put('settings:excludeArenaUnlocks',availability.excludeArenaUnlocks);
    if(input.maxBudget!==undefined){$('budget-enabled').checked=input.maxBudget!==null;$('budget-entry').hidden=input.maxBudget===null;if(input.maxBudget!==null){$('budget-amount').value=input.maxBudget;await storage.put('settings:maxBudget',input.maxBudget);}await storage.put('settings:budgetEnabled',$('budget-enabled').checked);}
    state.picker.select(input.weaponId);state.picker.close();weaponChanged();setMode(input.mode);$('balance').value=input.balance??80;renderBalance();$('magazine').value=input.magazine??$('magazine').value;state.scopeId=input.scopeId??null;state.magazineId=input.magazineId??null;renderScopeSelection();renderMagazineSelection();
    if(!await setSound(input.sound))return {status:'infeasible',message:'The requested suppressor variant is unavailable.'};
    const r=await calculate();if(!r)return {status:'invalid-input'};return {status:r.status,ergo:r.ergo,vertical:r.vertical,horizontal:r.horizontal,magazineCapacity:r.magazineCapacity,maxBudget:options().maxBudget,cost:r.cost,practical:r.practical,balanceTarget:r.balanceTarget,balanceShortfall:r.balanceShortfall,parts:r.rows?.map(row=>state.catalog.items[row.itemId].name)};
  }},{signal:lifecycle.signal})).catch(()=>{});}catch{}
}
async function activateDatabase(snapshot){
  const selected=$('weapon').value;
  state.snapshot=snapshot;state.catalog=snapshot.catalog;state.precomputed={};state.precomputedLoaded=false;
  for(const url of state.imageURLs.values())URL.revokeObjectURL(url);
  state.imageURLs=new Map(snapshot.images.map(image=>[image.path,URL.createObjectURL(image.blob)]));
  await storage.prepareSnapshot(state.catalog.meta.version,ENGINE_VERSION);
  state.weapons=moddableWeapons(state.catalog).filter(item=>isAvailable(item,{...options(),restrictTraders:false}));
  if(state.picker){state.picker.setItems(state.weapons,state.catalog.meta.weaponCount-state.weapons.length);state.picker.select(state.weapons.some(item=>item.id===selected)?selected:null);}
  else state.picker=createWeaponPicker({root:$('weapon-picker'),items:state.weapons,hiddenCount:state.catalog.meta.weaponCount-state.weapons.length,onSelect:weaponChanged,imageURL});
  if(!selected)state.picker.select(null);
  refreshAvailability();
  const meta=state.catalog.meta;
  $('data-status').textContent=`${state.weapons.length} selectable weapons / ${meta.modCount} attachments · saved locally\nRetrieved: ${date(meta.fetchedAt)}`;
  $('source-detail').textContent=`Source: ${meta.source} · Export updated: ${meta.sourceModified?date(meta.sourceModified):'Not supplied'} · Snapshot ${meta.version}. Stats and images are stored locally. Barter offers retrieved: ${meta.barterFetchedAt?date(meta.barterFetchedAt):'not available'}. Update database downloads a new snapshot only after your confirmation.`;
}
async function init(){
  try{
    const response=await fetch('./data/catalog.json');
    if(response.ok)state.bundled=await response.json();
    else if(response.status!==404)throw new Error('Could not check bundled weapon data');
    $('magazine').value=normalizeMagazineMinimum(await storage.get('settings:magazineMinimum'));renderBalance();
    const mountingPreference=await storage.get('settings:preferPracticalMounts');
    if(typeof mountingPreference==='boolean')$('practical-mounts').checked=mountingPreference;
    const preference=await storage.get('settings:excludeArenaUnlocks');
    if(typeof preference==='boolean')$('exclude-arena').checked=preference;
    state.traderSettings=normalizeTraderSettings(await storage.get('settings:traders'));traderSummary();
    const launchers=await storage.get('settings:allowGrenadeLaunchers');if(typeof launchers==='boolean')$('allow-launchers').checked=launchers;
    const budgetAmount=await storage.get('settings:maxBudget');if(Number.isSafeInteger(budgetAmount)&&budgetAmount>=1&&budgetAmount<=100000000)$('budget-amount').value=budgetAmount;
    $('budget-enabled').checked=(await storage.get('settings:budgetEnabled'))===true;$('budget-entry').hidden=!$('budget-enabled').checked;
    const savedTheme=applyTheme(await storage.get('settings:theme'));
    const loaded=await loadDatabase(state.bundled);
    if(loaded.snapshot)await activateDatabase(loaded.snapshot);
    else{$('data-status').textContent='No local database yet · setup required';notice('Download game data to start using the workbench. Nothing is downloaded without your approval.');}
    if(loaded.warning)$('update-status').textContent=loaded.warning;
    let ready=false;
    async function readyOnce(){if(ready)return;ready=true;webMCP();setupSettings({settings:state.traderSettings,theme:savedTheme,firstRun:!(await storage.get('settings:setupComplete')),onSave:next=>{const changed=JSON.stringify(state.traderSettings)!==JSON.stringify(next);state.traderSettings=next;traderSummary();if(changed)refreshAvailability();}});}
    const updates=setupDatabaseUpdates({getSnapshot:()=>state.snapshot,getBundled:()=>state.bundled,activate:activateDatabase,onReady:readyOnce,setBusy:value=>{
      if(value&&state.running)cancel();state.updating=value;
      document.querySelector('.controls').inert=value;
      $('calculate').disabled=value||state.running||!$('weapon').value;$('scope-change').disabled=value||!$('weapon').value;$('magazine-change').disabled=value||!$('weapon').value;$('settings-open').disabled=value||!state.catalog;
    }});
    $('update-data').disabled=false;
    if(loaded.snapshot)await readyOnce();else updates.showInitialSetup();
  }catch(error){notice(`Could not start: ${error.message}`,true);$('data-status').textContent='Could not load game data';}
}
init();
