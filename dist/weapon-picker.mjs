// Author: CA
export function moddableWeapons(catalog) {
  return Object.values(catalog.items).filter(item=>item.types.includes('gun')&&
    item.slots.some(slot=>slot.allowed.some(id=>catalog.items[id]?.types.includes('mods')))
  ).sort((a,b)=>a.shortName.localeCompare(b.shortName)||a.name.localeCompare(b.name));
}

export function matchingWeapons(items,query) {
  const normalize=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
  const words=query.trim().split(/\s+/).map(normalize).filter(Boolean);
  return items.filter(item=>words.every(word=>normalize(`${item.shortName} ${item.name}`).includes(word)));
}

export function createWeaponPicker({root,items,hiddenCount,onSelect,imageURL=path=>path}) {
  const button=root.querySelector('#weapon'),panel=root.querySelector('#weapon-popup');
  const search=root.querySelector('#weapon-search'),list=root.querySelector('#weapon-list');
  const count=root.querySelector('#weapon-count');
  let matches=items,active=0;
  function position(){
    if(panel.hidden)return;
    const rect=button.getBoundingClientRect(),below=innerHeight-rect.bottom-20,above=rect.top-20;
    const up=below<240&&above>below;panel.classList.toggle('above',up);
    panel.style.setProperty('--popup-height',`${Math.max(160,up?above:below)}px`);
  }
  function highlight(index,scroll=false) {
    active=index;
    [...list.children].forEach((option,i)=>option.classList.toggle('active',i===active));
    const option=matches.length?list.children[active]:null;
    if(option){
      search.setAttribute('aria-activedescendant',option.id);
      if(scroll){const row=option.getBoundingClientRect(),box=list.getBoundingClientRect();if(row.bottom>box.bottom)list.scrollTop+=row.bottom-box.bottom;else if(row.top<box.top)list.scrollTop-=box.top-row.top;}
    }
    else search.removeAttribute('aria-activedescendant');
  }
  function render() {
    matches=matchingWeapons(items,search.value);
    count.textContent=`${matches.length} matching weapon${matches.length===1?'':'s'} · ${hiddenCount} hidden by filters`;
    list.replaceChildren();
    for(const item of matches){
      const option=document.createElement('div');option.id=`weapon-option-${item.id}`;option.className='weapon-option';
      option.setAttribute('role','option');option.setAttribute('aria-selected',String(item.id===button.value));
      const img=document.createElement('img');img.alt='';img.loading='lazy';
      img.addEventListener('error',()=>{img.src=imageURL(item.icon);},{once:true});
      img.src=imageURL(item.image||item.icon);
      img.title='Standard weapon reference';
      const copy=document.createElement('span'),short=document.createElement('b'),full=document.createElement('span');
      short.textContent=item.shortName;full.textContent=item.name;copy.append(short,full);option.append(img,copy);
      option.addEventListener('pointerdown',event=>event.preventDefault());
      option.addEventListener('click',()=>choose(item.id));list.append(option);
    }
    if(!matches.length){const empty=document.createElement('p');empty.className='weapon-empty';empty.textContent='No matching weapons. Try another name.';list.append(empty);}
    highlight(Math.max(0,matches.findIndex(item=>item.id===button.value)));
    list.scrollTop=0;
  }
  function close(returnFocus=false){panel.hidden=true;button.setAttribute('aria-expanded','false');search.setAttribute('aria-expanded','false');if(returnFocus)button.focus();}
  function open(query=''){
    if(button.disabled)return;
    search.value=query;panel.hidden=false;button.setAttribute('aria-expanded','true');search.setAttribute('aria-expanded','true');position();render();search.focus({preventScroll:true});highlight(active,true);
  }
  function select(id){
    if(!id){button.value='';root.querySelector('#weapon-label').textContent='Choose a weapon …';button.removeAttribute('title');return true;}
    const item=items.find(item=>item.id===id);if(!item)return false;
    button.value=id;root.querySelector('#weapon-label').textContent=`${item.shortName} – ${item.name}`;button.title=item.name;return true;
  }
  function choose(id){const changed=id!==button.value;if(select(id)){close(true);if(changed)onSelect();}}
  button.addEventListener('click',()=>panel.hidden?open():close());
  button.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open();}
    else if(event.key.length===1&&event.key!==' '&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();open(event.key);}
  });
  search.addEventListener('input',render);
  search.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(matches.length)highlight((active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length,true);
    }else if(event.key==='Enter'){event.preventDefault();if(matches[active])choose(matches[active].id);}
  });
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close(true);}});
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))close();});
  document.addEventListener('pointerdown',event=>{if(!root.contains(event.target))close();});
  window.addEventListener('resize',position);
  window.addEventListener('scroll',event=>{if(event.target!==list)position();},true);
  button.disabled=false;
  return {select,close,setItems(next,hidden){items=next;hiddenCount=hidden;close();if(!items.some(item=>item.id===button.value))select(null);}};
}
