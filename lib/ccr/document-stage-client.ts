import {requestJson} from '@/lib/shared/client';
import {openStage,confirmStageWrite,type TransferPause} from './transfer-retry';
/** The site ingress limits each request. Never send an evidence request body larger than this part. */
export const documentPartBytes=512*1024;
export async function stageDocument<T>(url:string,file:File,fields:Record<string,string>,onProgress?:(sentBytes:number,totalBytes:number)=>void,pause?:TransferPause,resume=false,existingOnly=false):Promise<T>{
 const sum=new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),sha256=Array.from(sum,b=>b.toString(16).padStart(2,'0')).join('');
 const s=await openStage<{id:string;parts:number;partBytes:number;groupParts:number;resumable?:boolean;receivedParts?:number[];sealedGroups?:number[]}>(url,{resume,existingOnly,action:'start',name:file.name,bytes:file.size,declaredMime:file.type,sha256,fields});
 if(!s.id||s.partBytes!==documentPartBytes||s.parts!==Math.ceil(file.size/documentPartBytes)||s.groupParts<1||s.groupParts>8)throw Error('Invalid document upload session.');
 const resumed=resume&&s.resumable===true,parts=new Set(resumed?s.receivedParts:[]),groups=new Set(resumed?s.sealedGroups:[]);
 let sent=0,committing=false;
 for(let i=0;i<s.parts;i++)if(parts.has(i)||groups.has(Math.floor(i/s.groupParts)))sent+=Math.min(s.partBytes,file.size-i*s.partBytes);
 try{
  onProgress?.(sent,file.size);
  for(let first=0;first<s.parts;first+=s.groupParts){
   const end=Math.min(s.parts,first+s.groupParts);if(groups.has(first/s.groupParts))continue;
   // Limit in-flight buffers; await every part before sealing its group or cancelling a session.
   for(let begin=first;begin<end;begin+=3){
    const result=await Promise.allSettled(Array.from({length:Math.min(end-begin,3)},(_,j)=>begin+j).filter(i=>!parts.has(i)).map(async i=>{
     const part=file.slice(i*s.partBytes,(i+1)*s.partBytes,'application/octet-stream');await confirmStageWrite(url,s.id,'part',i,part,pause);sent+=part.size;onProgress?.(sent,file.size);
    }));
    for(const x of result)if(x.status==='rejected')throw x.reason;
   }
   await confirmStageWrite(url,s.id,'group',first/s.groupParts,undefined,pause);
  }
  committing=true;
  return await requestJson<T>(url,{action:'attach',id:s.id},120000);
 }catch(e){
  // A lost final response can mean a record was saved. Never automatically repeat the attach.
  if(!committing&&!resumed)await requestJson(url,{action:'cancel',id:s.id}).catch(()=>{});
  throw e;
 }
}
