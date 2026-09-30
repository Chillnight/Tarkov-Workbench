// Author: CA
import {download,imageType} from '../dist/data-update.mjs';
import {validateImageSource} from '../dist/data-validation.mjs';

export async function imageResponse(source,signal){
  if(!validateImageSource(source))return new Response('Image source is not allowed',{status:400});
  try{
    const {bytes}=await download(source,{signal,maxBytes:5*1024*1024});
    return new Response(bytes,{headers:{'Content-Type':imageType(bytes),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('The item image could not be downloaded',{status:502});}
}
