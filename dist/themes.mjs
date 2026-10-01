// Author: CA
export const THEMES=Object.freeze(['original','blue','bourbon','graphite']);
export const normalizeTheme=value=>THEMES.includes(value)?value:'original';
export function applyTheme(value,root=document.documentElement){
  const theme=normalizeTheme(value);
  root.dataset.theme=theme;
  return theme;
}
