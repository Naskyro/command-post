import {requestJson} from '@/lib/shared/client';
import {openStage,confirmStageWrite,type TransferPause} from './transfer-retry';
const url='/api/ccr/docket/stage';export const courtInlineFileLimit=400*1024,courtRegularFileLimit=16*1024*1024,courtLargeFileLimit=64*1024*1024;
export async function cancelCourtStage(id:string){await requestJson(url,{action:'cancel',id}).catch(()=>{});}
export async function stageCourtOriginal(file:File,expectedSha256?:string,onProgress?:(uploadedBytes:number,totalBytes:number)=>void,pause?:TransferPause){
 if(!file.size||!/\.(pdf|docx|png|jpe?g)$/i.test(file.name)||file.size>(/\.pdf$/i.test(file.name)?courtLargeFileLimit:courtRegularFileLimit))throw Error('Choose a PDF up to 64 MB, or DOCX, PNG or JPG up to 16 MB.');
 const sha256=expectedSha256||Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const s=await openStage<{id:string;chunkSize:number;parts:number;partsPerGroup:number}>(url,{action:'start',name:file.name,bytes:file.size,sha256});
 if(!s.id||!Number.isSafeInteger(s.chunkSize)||s.chunkSize<1||s.chunkSize>512*1024||s.parts!==Math.ceil(file.size/s.chunkSize)||!Number.isSafeInteger(s.partsPerGroup)||s.partsPerGroup<1||s.partsPerGroup>32)throw Error('The document upload session could not be confirmed.');
 let written=0;
 try{for(let g=0;g<Math.ceil(s.parts/s.partsPerGroup);g++){const first=g*s.partsPerGroup,end=Math.min(first+s.partsPerGroup,s.parts);
 for(let i=first;i<end;i+=4){const settled=await Promise.allSettled(Array.from({length:Math.min(4,end-i)},async(_,j)=>{const n=i+j,part=file.slice(n*s.chunkSize,Math.min(file.size,(n+1)*s.chunkSize),'application/octet-stream');await confirmStageWrite(url,s.id,'part',n,part,pause);written+=part.size;onProgress?.(written,file.size);}));const error=settled.find(r=>r.status==='rejected');if(error?.status==='rejected')throw error.reason;}
 if(s.parts>1)await confirmStageWrite(url,s.id,'group',g,undefined,pause);}return s.id;}catch(e){await cancelCourtStage(s.id);throw e;}
}
