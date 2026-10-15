// Author: CA
import {readFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
async function verify(directory,manifest){
 for(const file of manifest.files){
  if(basename(file.name)!==file.name)throw new Error('Invalid native runtime filename.');
  const bytes=await readFile(join(directory,file.name));
  if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Native runtime checksum mismatch: ${file.name}`);
 }
}
export async function verifyNativeRuntime(directory=join(root,'desktop/cp-solver')){
 const manifest=JSON.parse(await readFile(join(root,'desktop/cp-solver/source.json'),'utf8'));
 try{await verify(directory,manifest);}catch(error){throw new Error('Prepare the pinned native runtime before packaging. Run npm run prepare:solvers -- <portable resources/cp-solver folder>. '+error.message);}
 return {version:manifest.version,files:manifest.files.length};
}
async function main(){
 const argument=process.argv[2];
 if(argument&&argument!=='--check'){
  const source=resolve(argument),destination=join(root,'desktop/cp-solver'),manifest=JSON.parse(await readFile(join(destination,'source.json'),'utf8'));
  await verify(source,manifest);await mkdir(destination,{recursive:true});
  for(const file of manifest.files)await copyFile(join(source,file.name),join(destination,file.name));
 }
 console.log('Verified native runtime:',await verifyNativeRuntime());
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
