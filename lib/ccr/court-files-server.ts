import {courtStage,stageMime,finalizeCourtStage,finishCourtStage,streamCourtDocument} from './court-stage-server';
import {financeFiles} from '@/db/finance';
import {encryptBytes,decryptBytes} from '@/lib/hr/server';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import type {Viewer} from '@/lib/finance/model';
import {docketAccess,type CourtDocument,type Matter} from './docket-model';
import {matterById,insertEdition} from './docket-server';
import {classifyDocument} from './document-types';
import {validatedDocumentFile,ccrCourtFileBytes} from './document-input';
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
const fileKey=(matter:string,id:string)=>'ccr-court-documents/'+matter+'/'+id;
export async function attachCourtDocument(v:Viewer,id:string,version:number,file:File,docType:unknown,otherType:unknown){
 if(!docketAccess(v,true))throw new ForbiddenError();
 const prior=await matterById(id),files=prior.files||[];
 if(prior.version!==version)throw new ConflictError('This matter changed. Refresh the docket before attaching a document.');
 if(files.length>=200)throw new AppError('This matter already has 200 documents.');
 const meta=classifyDocument('hearings',docType,otherType),{name,type,bytes}=await validatedDocumentFile(file,ccrCourtFileBytes),at=new Date().toISOString(),doc:CourtDocument={id:crypto.randomUUID(),name,type,bytes:bytes.byteLength,sha256:await digest(bytes),at,by:v.name,byId:v.id,...meta};
 const next:Matter={...prior,version:prior.version+1,updatedAt:at,updatedBy:v.name,actorId:v.id,files:[...files,doc]};
 const key=fileKey(prior.id,doc.id),bucket=financeFiles();await bucket.put(key,await encryptBytes(bytes),{httpMetadata:{contentType:'application/octet-stream'}});
 try{await insertEdition(next);}catch(e){if(e instanceof ConflictError)await bucket.delete(key).catch(()=>{});throw e;}return next;
}
export async function readCourtDocument(v:Viewer,id:string,fid:string){
 if(!docketAccess(v))throw new ForbiddenError();
 return readAuthorizedCourtOriginal(await matterById(id),fid);
}
// Caller has verified this native docket record and the exact file is visible on its surface.
export async function readAuthorizedCourtOriginal(matter:Matter,fid:string){
 const id=matter.id;if(!/^[a-zA-Z0-9_-]{1,100}$/.test(fid))throw new AppError('Select a document.');const doc=matter.files?.find(d=>d.id===fid);if(!doc)throw new AppError('Document not found on this court matter.',404);
 if(doc.chunks)return {doc,bytes:await streamCourtDocument(doc,doc.chunks,fileKey(matter.id,doc.id))};
 const object=await financeFiles().get(fileKey(matter.id,doc.id));if(!object)throw new AppError('The stored document is unavailable.',503);
 const bytes=await decryptBytes(new Uint8Array(await object.arrayBuffer()));if(bytes.byteLength!==doc.bytes||await digest(bytes)!==doc.sha256)throw new AppError('The stored document could not be verified.',503);
 return {doc,bytes};
}

export async function attachStagedCourtDocument(v:Viewer,id:string,version:number,stagedId:string,kind:unknown,other:unknown){
 if(!docketAccess(v,true))throw new ForbiddenError();
 const s=await courtStage(v,stagedId),prior=await matterById(id),meta=classifyDocument('hearings',kind,other),files=prior.files||[];
 if(prior.version!==version)throw new ConflictError('This matter changed. Refresh before attaching the original.');
 const existing=files.find(d=>d.sha256===s.sha256);if(existing){if(existing.documentType!==meta.documentType||existing.otherDocumentType!==meta.otherDocumentType)throw new ConflictError('This file already has a different classification.');await finishCourtStage(s);return prior;}
 if(files.length>=200)throw new AppError('This matter already has 200 documents.');
 const fid=crypto.randomUUID(),key=fileKey(id,fid),keys:string[]=[],clean=()=>keys.length?financeFiles().delete(keys).catch(()=>{}):Promise.resolve(),at=new Date().toISOString();let chunks:{count:number;size:number};
 try{chunks=await finalizeCourtStage(s,key,keys);}catch(e){await clean();throw e;}
 const doc:CourtDocument={id:fid,name:s.name,type:stageMime(s),bytes:s.bytes,sha256:s.sha256,chunks,at,by:v.name,byId:v.id,...meta};
 const next={...prior,version:prior.version+1,updatedAt:at,updatedBy:v.name,actorId:v.id,files:[...files,doc]};try{await insertEdition(next);}catch(e){if(e instanceof ConflictError||e instanceof AppError&&e.status===413)await clean();throw e;}await finishCourtStage(s);return next;
}
