import {createHash} from 'node:crypto';
import {financeFiles} from '@/db/finance';
import {getCourse,requireEdit,type Context} from './server';
import * as store from './store';
import {AppError,ConflictError,ForbiddenError} from '../shared/errors';
import {schoolMediaPartBytes as partBytes,schoolMediaGroupParts as groupParts,validateMediaMetadata,validateMediaSignature,type MediaLessonKind,type SchoolMediaReceipt} from './media';

type Stage=store.Stored&{kind:'mediaUpload';status:'Uploading'|'Complete'|'Cancelled';courseId:string;lessonId:string;lessonKind:MediaLessonKind;name:string;mime:string;size:number;sha256:string;uploadedBy:string;expiresAt:string;mediaId:string;key:string;uploadId:string;parts:number;groups:number};
const prefix='school-media-staging/';
const key=(id:string,kind:'part'|'group',index:number)=>prefix+id+'/'+kind+'-'+index;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const gone=()=>new AppError('This media upload expired or is unavailable. Choose the file again.',404);
function receipt(m:store.Stored):SchoolMediaReceipt{return {id:m.id,url:'/api/school/media?id='+encodeURIComponent(m.id),name:String(m.name),mime:String(m.mime),size:Number(m.size),courseId:String(m.courseId),lessonId:String(m.lessonId)};}
async function authorized(ctx:Context,id:unknown,complete=false):Promise<Stage>{
 if(typeof id!=='string'||!/^school-upload-[a-f0-9-]{36}$/.test(id))throw gone();
 const row=await store.get(id);if(!row||row.kind!=='mediaUpload'||row.uploadedBy!==ctx.v.person||!ctx.creator)throw gone();
 const stage=row as Stage;requireEdit(ctx,await getCourse(ctx,stage.courseId));
 if(stage.status==='Cancelled'||!complete&&stage.status!=='Uploading'||stage.status==='Uploading'&&Date.parse(stage.expiresAt)<Date.now())throw gone();
 return stage;
}
async function cleanup(stage:Stage){await financeFiles().delete([...Array.from({length:stage.parts},(_,i)=>key(stage.id,'part',i)),...Array.from({length:stage.groups},(_,i)=>key(stage.id,'group',i))]);}
export async function startSchoolMedia(ctx:Context,b:Record<string,unknown>){
 if(!ctx.creator)throw new ForbiddenError('Course authoring access is required.');
 if(typeof b.courseId!=='string'||!b.courseId||b.courseId.length>160||typeof b.lessonId!=='string'||!b.lessonId||b.lessonId.length>160||!['reading','video','audio'].includes(String(b.lessonKind))||typeof b.sha256!=='string'||!/^[a-f0-9]{64}$/.test(b.sha256))throw new AppError('Choose a course, lesson, and supported file.');
 requireEdit(ctx,await getCourse(ctx,b.courseId));
 const meta=validateMediaMetadata(b.name,b.mime,b.size,b.lessonKind as MediaLessonKind),rows=await store.records(),mine=rows.filter(r=>r.kind==='mediaUpload'&&r.status==='Uploading'&&r.uploadedBy===ctx.v.person) as Stage[];
 if(mine.filter(s=>Date.parse(s.expiresAt)>Date.now()).length>=8)throw new AppError('Finish or cancel an existing upload before starting another.',429);
 for(const old of mine.filter(s=>Date.parse(s.expiresAt)<=Date.now()).slice(0,8)){try{await financeFiles().resumeMultipartUpload(old.key,old.uploadId).abort();}catch{/* Expired multipart uploads can already be absent. */}await cleanup(old);await store.commit(ctx.v,[{before:old,after:{...old,version:old.version+1,status:'Cancelled'}}],'Expire Course Media Upload');}
 const id='school-upload-'+crypto.randomUUID(),mediaId='school-media-'+crypto.randomUUID(),objectKey='school/media/'+mediaId,upload=await financeFiles().createMultipartUpload(objectKey,{httpMetadata:{contentType:meta.mime},customMetadata:{sha256:b.sha256}});
 const stage:Stage={...meta,id,kind:'mediaUpload',status:'Uploading',version:1,courseId:b.courseId,lessonId:b.lessonId,lessonKind:b.lessonKind as MediaLessonKind,sha256:b.sha256,uploadedBy:ctx.v.person,uploadedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),mediaId,key:objectKey,uploadId:upload.uploadId,parts:Math.ceil(meta.size/partBytes),groups:Math.ceil(meta.size/(partBytes*groupParts))};
 try{await store.commit(ctx.v,[{after:stage}],'Start Course Media Upload');}catch(e){await upload.abort();throw e;}
 return {id,partBytes,parts:stage.parts,groupParts,groups:stage.groups};
}
async function bounded(r:Request,limit:number){if(Number(r.headers.get('content-length')||0)>limit)throw new AppError('This upload part is too large.',413);const reader=r.body?.getReader();if(!reader)throw new AppError('Upload a media part.');let count=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>limit){await reader.cancel();throw new AppError('This upload part is too large.',413);}chunks.push(value);}const bytes=new Uint8Array(count);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;}
export async function putSchoolMediaPart(ctx:Context,id:string,index:number,r:Request){
 const stage=await authorized(ctx,id);if(!Number.isSafeInteger(index)||index<0||index>=stage.parts)throw new AppError('Choose a valid upload part.');
 const expected=Math.min(partBytes,stage.size-index*partBytes),bytes=await bounded(r,expected);if(bytes.length!==expected)throw new AppError('This upload part is incomplete.');
 const digest=hash(bytes),objectKey=key(stage.id,'part',index),existing=await financeFiles().head(objectKey);
 if(existing){if(existing.customMetadata?.sha256!==digest||existing.size!==expected)throw new ConflictError('An upload part changed. Choose the original file again.');return {received:index};}
 if(index===0)validateMediaSignature(bytes,stage.mime);
 await financeFiles().put(objectKey,bytes,{customMetadata:{sha256:digest},httpMetadata:{contentType:'application/octet-stream'}});return {received:index};
}
export async function sealSchoolMediaGroup(ctx:Context,id:string,index:number){
 const stage=await authorized(ctx,id);if(!Number.isSafeInteger(index)||index<0||index>=stage.groups)throw new AppError('Choose a valid upload group.');
 const groupKey=key(stage.id,'group',index),old=await financeFiles().get(groupKey);if(old)return {sealed:index};
 const start=index*groupParts,end=Math.min(stage.parts,start+groupParts),bytes=new Uint8Array(Math.min(stage.size-start*partBytes,partBytes*groupParts));
 for(let part=start;part<end;part++){const object=await financeFiles().get(key(stage.id,'part',part));if(!object)throw new AppError('Some upload parts are missing. Retry the upload.',409);const chunk=new Uint8Array(await object.arrayBuffer());if(chunk.length!==Math.min(partBytes,stage.size-part*partBytes)||hash(chunk)!==object.customMetadata?.sha256)throw new AppError('An upload part failed verification.',409);bytes.set(chunk,(part-start)*partBytes);}
 const result=await financeFiles().resumeMultipartUpload(stage.key,stage.uploadId).uploadPart(index+1,bytes);await financeFiles().put(groupKey,JSON.stringify(result),{httpMetadata:{contentType:'application/json'}});return {sealed:index};
}
export async function finishSchoolMedia(ctx:Context,id:string){
 const stage=await authorized(ctx,id,true);if(stage.status==='Complete'){const media=await store.get(stage.mediaId);if(!media||media.kind!=='media')throw gone();return receipt(media);}
 const parts:R2UploadedPart[]=[];for(let group=0;group<stage.groups;group++){const object=await financeFiles().get(key(stage.id,'group',group));if(!object)throw new AppError('Some media groups are incomplete. Retry the upload.',409);parts.push(await object.json<R2UploadedPart>());}
 // Verify the exact original in a bounded pass before R2 completes the multipart object.
 const digest=createHash('sha256');let size=0;for(let part=0;part<stage.parts;part++){const object=await financeFiles().get(key(stage.id,'part',part));if(!object)throw new AppError('Some upload parts are missing.',409);const bytes=new Uint8Array(await object.arrayBuffer());size+=bytes.length;digest.update(bytes);}
 if(size!==stage.size||digest.digest('hex')!==stage.sha256)throw new AppError('The uploaded file failed verification. Choose the original file again.',409);
 if(!await financeFiles().head(stage.key)){try{await financeFiles().resumeMultipartUpload(stage.key,stage.uploadId).complete(parts);}catch(e){const completed=await financeFiles().head(stage.key);if(!completed||completed.customMetadata?.sha256!==stage.sha256||completed.size!==stage.size)throw e;}}
 const media:store.Stored={id:stage.mediaId,kind:'media',version:1,courseId:stage.courseId,lessonId:stage.lessonId,name:stage.name,mime:stage.mime,size:stage.size,key:stage.key,sha256:stage.sha256,uploadedBy:ctx.v.person,uploadedAt:new Date().toISOString()};
 try{await store.commit(ctx.v,[{after:media},{before:stage,after:{...stage,status:'Complete',version:stage.version+1}}],'Upload Course Lesson Media');}catch(e){const completed=await store.get(stage.id);if(completed?.status==='Complete'){const m=await store.get(stage.mediaId);if(m?.kind==='media')return receipt(m);}throw e;}
 await cleanup(stage).catch(()=>undefined);return receipt(media);
}
export async function cancelSchoolMedia(ctx:Context,id:string){const stage=await authorized(ctx,id,true);if(stage.status==='Complete')return {cancelled:false};await store.commit(ctx.v,[{before:stage,after:{...stage,status:'Cancelled',version:stage.version+1}}],'Cancel Course Media Upload');try{await financeFiles().resumeMultipartUpload(stage.key,stage.uploadId).abort();}catch{/* Cancellation remains authoritative if the storage upload already expired. */}await cleanup(stage);return {cancelled:true};}
