// Author: CA
import {TRADERS,normalizeTraderSettings} from './traders.mjs';
import * as storage from './storage.mjs';
import {applyTheme,normalizeTheme} from './themes.mjs';
export function setupSettings({settings,theme='original',onSave,firstRun}){
  const $=id=>document.getElementById(id),dialog=$('settings-dialog');
  const grid=$('trader-levels');
  let previewTheme=normalizeTheme(theme);
  function selectTheme(value){
    previewTheme=applyTheme(value);
    for(const button of $('theme-options').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.themeChoice===previewTheme));
  }
  for(const button of $('theme-options').querySelectorAll('button'))button.addEventListener('click',()=>selectTheme(button.dataset.themeChoice));
  function setLevel(traderId,level){
    const group=$(`trader-${traderId}`);group.value=String(level);
    for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(Number(button.dataset.level)===level));
  }
  for(const trader of TRADERS){
    const field=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=trader.name;
    const group=document.createElement('div');group.id=`trader-${trader.id}`;group.className='loyalty-boxes';group.setAttribute('role','group');group.setAttribute('aria-label',`${trader.name} loyalty level`);
    for(let level=1;level<=4;level++){
      const button=document.createElement('button');button.type='button';button.textContent=String(level);button.dataset.level=String(level);
      button.setAttribute('aria-label',`${trader.name} level ${level}`);button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>setLevel(trader.id,Number(group.value)===level?0:level));group.append(button);
    }
    field.append(legend,group);grid.append(field);
  }
  function open(){
    selectTheme(theme);
    $('restrict-traders').checked=settings.restrictTraders;
    $('include-quest-offers').checked=settings.includeQuestOffers;
    $('include-barters').checked=settings.includeBarters;
    $('include-flea-market').checked=settings.includeFleaMarket;
    for(const trader of TRADERS)setLevel(trader.id,settings.traderLevels[trader.id]);
    $('settings-error').textContent='';dialog.showModal();
  }
  $('settings-open').addEventListener('click',open);
  $('settings-cancel').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>selectTheme(theme));
  $('settings-save').addEventListener('click',async()=>{
    const next=normalizeTraderSettings({restrictTraders:$('restrict-traders').checked,includeQuestOffers:$('include-quest-offers').checked,includeBarters:$('include-barters').checked,includeFleaMarket:$('include-flea-market').checked,
      traderLevels:Object.fromEntries(TRADERS.map(t=>[t.id,Number($(`trader-${t.id}`).value)]))});
    $('settings-save').disabled=true;
    try{
      if(!await storage.put('settings:traders',next))throw new Error('Settings storage unavailable');
      if(!await storage.put('settings:theme',previewTheme))throw new Error('Settings storage unavailable');
      if(!await storage.put('settings:setupComplete',true))throw new Error('Settings storage unavailable');
      settings=next;theme=previewTheme;onSave(next);dialog.close();
    }catch{$('settings-error').textContent='Could not save settings. Please try again.';}
    finally{$('settings-save').disabled=false;}
  });
  $('settings-open').disabled=false;
  if(firstRun)open();
}
