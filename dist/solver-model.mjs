// Author: CA
// Strict parser for the generated Workbench LP subset. Never a general LP parser.
function expression(text){
 const terms=new Map(); let rest=text.trim();
 const token=/^([+-]?)\s*(?:(\d+(?:\.\d*)?(?:e[+-]?\d+)?)\s+)?([A-Za-z]\w*)\s*/i;
 while(rest){const m=rest.match(token);if(!m)throw Error('Unsupported LP expression: '+rest);const c=Number(m[2]??1)*(m[1]==='-'?-1:1);terms.set(m[3],(terms.get(m[3])??0)+c);rest=rest.slice(m[0].length);}
 return [...terms].filter(([,c])=>c!==0).map(([v,c])=>[c,v]);
}
export function parseLP(text){
 const model={maximize:false,objective:[],rows:[],bounds:{}};let section;
 for(let line of text.split(/\r?\n/)){line=line.trim();if(!line)continue;
  if(['Maximize','Minimize','Subject To','Bounds','Binary','General','End'].includes(line)){section=line;model.maximize||=line==='Maximize';continue;}
  if(section==='Maximize'||section==='Minimize')model.objective=expression(line.replace(/^\w+:\s*/,''));
  else if(section==='Subject To'){const m=line.match(/^\w+:\s*(.*?)\s*(<=|>=|=)\s*([+-]?[\d.e+-]+)$/i);if(!m)throw Error('Unsupported row: '+line);model.rows.push({terms:expression(m[1]),op:m[2],rhs:m[3]});}
  else if(section==='Bounds'){const m=line.match(/^([\d.e+-]+)\s*<=\s*(\w+)\s*<=\s*([\d.e+-]+)$/i);if(!m)throw Error('Unsupported bounds: '+line);model.bounds[m[2]]={lb:Number(m[1]),ub:Number(m[3]),integer:false};}
  else if(section==='Binary'||section==='General')for(const name of line.split(/\s+/)){model.bounds[name]={lb:0,ub:section==='Binary'?1:Infinity,...model.bounds[name],integer:true};}
  else throw Error('Unsupported LP section');
 }
 for(const [name,b]of Object.entries(model.bounds))if(!Number.isSafeInteger(b.lb)||!Number.isSafeInteger(b.ub)||!b.integer)throw Error('Unsupported variable domain '+name);
 for(const row of [{terms:model.objective},...model.rows])for(const [,name]of row.terms)if(!model.bounds[name])throw Error('Undeclared variable '+name);
 return model;
}
export function rational(value){const m=String(value).toLowerCase().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/);if(!m)throw Error('Invalid decimal');const power=(m[3]?.length??0)-Number(m[4]??0),n=BigInt((m[1]||'')+m[2]+(m[3]??''));return power>=0?[n,10n**BigInt(power)]:[n*10n**BigInt(-power),1n];}
export function exactRowValue(terms,values,rhs='0'){
 const parsed=terms.map(([c,v])=>[...rational(c),BigInt(values[v])]),r=rational(rhs);const scale=parsed.reduce((s,[,d])=>s>d?s:d,r[1]);
 return [parsed.reduce((s,[n,d,v])=>s+n*(scale/d)*v,0n),r[0]*(scale/r[1])];
}
export function assignment(model,result){
 if(!result?.Columns||!['Optimal','Time limit reached','Time limit'].includes(result.Status))return null;
 const values={};for(const [v,b]of Object.entries(model.bounds)){const raw=result.Columns[v]?.Primal,n=Math.round(raw);if(!Number.isFinite(raw)||Math.abs(raw-n)>1e-5||n<b.lb||n>b.ub)return null;values[v]=n;}
 for(const {terms,op,rhs}of model.rows){const [a,b]=exactRowValue(terms,values,rhs);if(op==='='?a!==b:op==='<='?a>b:a<b)return null;}
 return values;
}
export function objective(model,values){return model.objective.reduce((n,[c,v])=>n+c*values[v],0);}
export function zeroProof(model,previous){
 if(model.maximize||model.objective.some(([c,v])=>c<0||model.bounds[v].lb<0))return null;
 const values=assignment(model,previous);if(!values)return null;
 const [value]=exactRowValue(model.objective,values);if(value!==0n)return null;
 return {Status:'Optimal',ObjectiveValue:0,Columns:Object.fromEntries(Object.entries(values).map(([v,Primal])=>[v,{Primal}])),_proof:'nonnegative objective and feasible zero assignment'};
}

export function proveZeroObjective(text,previous){if(!previous)return null;try{return zeroProof(parseLP(text),previous);}catch{return null;}}
