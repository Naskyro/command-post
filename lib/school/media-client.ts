import {mediaTypeForFile,schoolMediaLimit,validateMediaMetadata,validateMediaSignature,type MediaLessonKind,type SchoolMediaReceipt} from './media';
type Subject={courseId?:string;lessonId?:string;lessonKind?:MediaLessonKind;personId?:string};
type Options={signal?:AbortSignal;onProgress?:(percent:number,label:string)=>void};
const endpoint='/api/school/media/stage';
async function response<T>(res:Response):Promise<T>{if(!res.headers.get('content-type')?.includes('application/json'))throw new Error(res.status===413?'This upload request was too large. Choose the file again to retry in smaller parts.':'The upload service could not respond. Please try again.');const body=await res.json() as T&{error?:string};if(!res.ok)throw new Error(body.error||'The file could not be uploaded.');return body;}
async function post<T>(body:unknown,signal?:AbortSignal):Promise<T>{return response<T>(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal}));}
export async function uploadSchoolMedia(file:File,subject:Subject,options:Options={}):Promise<SchoolMediaReceipt>{
 const mime=mediaTypeForFile(file.name,file.type);validateMediaMetadata(file.name,mime,file.size,subject.lessonKind);
 validateMediaSignature(new Uint8Array(await file.slice(0,65536).arrayBuffer()),mime);
 if(!subject.courseId){const form=new FormData();form.append('file',new File([file],file.name,{type:mime}));if(subject.personId)form.append('personId',subject.personId);return response<SchoolMediaReceipt>(await fetch('/api/school/media',{method:'POST',body:form,signal:options.signal}));}
 if(!subject.lessonId||!subject.lessonKind)throw new Error('Choose the lesson that will use this file.');
 if(file.size>schoolMediaLimit)throw new Error('Choose a file up to 50 MB.');
 options.onProgress?.(0,'Checking the original file');
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 let stageId='';try{
  const stage=await post<{id:string;partBytes:number;parts:number;groupParts:number;groups:number}>({action:'start',name:file.name,mime,size:file.size,sha256,...subject},options.signal);stageId=stage.id;let uploaded=0;
  for(let start=0;start<stage.parts;start+=3){await Promise.all(Array.from({length:Math.min(3,stage.parts-start)},(_,n)=>start+n).map(async part=>{const bytes=file.slice(part*stage.partBytes,Math.min(file.size,(part+1)*stage.partBytes));await response(await fetch(endpoint+'?id='+encodeURIComponent(stage.id)+'&part='+part,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes,signal:options.signal}));uploaded+=bytes.size;options.onProgress?.(Math.round(uploaded/file.size*88),'Uploading '+file.name);}));}
  for(let group=0;group<stage.groups;group++){await post({action:'seal',id:stage.id,group},options.signal);options.onProgress?.(88+Math.round((group+1)/stage.groups*8),'Preparing playback');}
  const receipt=await post<SchoolMediaReceipt>({action:'finish',id:stage.id},options.signal);options.onProgress?.(100,'Upload verified');return receipt;
 }catch(e){if(stageId)void fetch(endpoint+'?id='+encodeURIComponent(stageId),{method:'DELETE',keepalive:true}).catch(()=>{});if(options.signal?.aborted)throw new Error('Upload cancelled. The lesson’s saved media has not changed.');throw e;}
}
