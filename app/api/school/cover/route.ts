import {financeDb,financeFiles} from '@/db/finance';
import {context,getCourse,requireEdit} from '@/lib/school/server';
import * as store from '@/lib/school/store';
import {coverKey,isLiveStage} from '@/lib/school/covers';
import {prepareProfilePhoto,profilePhotoLimit} from '@/lib/people/photos';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Vary':'Cookie'};
const out=(value:unknown,status=200)=>Response.json(value,{status,headers});
const notFound=()=>new AppError('Course cover unavailable.',404);
function writable(r:Request){if(r.headers.get('origin')!==new URL(r.url).origin||r.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();}
export async function GET(r:Request){
 try{
  const ctx=await context(r),id=new URL(r.url).searchParams.get('id'),key=coverKey(id),m=await store.get(String(id));
  if(!m||m.kind!=='courseCover')throw notFound();
  if(isLiveStage(m)){
   if(!ctx.creator||m.uploadedBy!==ctx.v.person)throw notFound();
   if(m.targetCourse)requireEdit(ctx,await getCourse(ctx,String(m.targetCourse)));
  }else if(m.status==='Attached'&&m.courseId){
   const c=await getCourse(ctx,m.courseId);if(c.coverMediaId!==m.id)throw notFound();
  }else throw notFound();
  const object=await financeFiles().get(key);
  if(!object||!['image/jpeg','image/png','image/webp'].includes(String(m.mime)))throw notFound();
  return new Response(object.body,{headers:{...headers,'Content-Type':String(m.mime),'Content-Length':String(object.size),'Content-Disposition':'inline'}});
 }catch(e){const f=safeFailure(e,'school.cover.read');return out(f.body,f.status);}
}
export async function POST(r:Request){
 try{
  writable(r);const ctx=await context(r);if(!ctx.creator)throw new ForbiddenError('Course authoring access is required.');
  if(Number(r.headers.get('content-length')||0)>profilePhotoLimit+65536)throw new AppError('Choose a cover up to 5 MB.',413);
  const type=r.headers.get('content-type')||'';
  if(!r.body||!type.startsWith('multipart/form-data;'))throw new AppError('Upload a course cover as a file.');
  let length=0;const bounded=r.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){length+=chunk.byteLength;if(length>profilePhotoLimit+65536)throw new AppError('Choose a cover up to 5 MB.',413);controller.enqueue(chunk);}}));
  const form=await new Response(bounded,{headers:{'Content-Type':type}}).formData(),file=form.get('file'),target=form.get('courseId');
  if(typeof target!=='string'&&target!==null||typeof target==='string'&&target.length>160)throw new AppError('Choose a valid course.');
  if(target)requireEdit(ctx,await getCourse(ctx,String(target)));
  if(!(file instanceof File)||file.size>profilePhotoLimit||!file.size||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new AppError('Upload a JPG, PNG or WebP up to 5 MB.');
  const upload=prepareProfilePhoto(new Uint8Array(await file.arrayBuffer()),file.type),now=new Date(),id='cover-'+crypto.randomUUID(),at=now.toISOString();
  // A staged upload is readable by the uploader for at most one day. Reclaim their
  // abandoned private objects on later uploads rather than storing them indefinitely.
  const stages=await financeDb().prepare("SELECT payload FROM school_records WHERE kind='courseCover' AND json_extract(payload,'$.uploadedBy')=? AND json_extract(payload,'$.status')='Staged'").bind(ctx.v.person).all<{payload:string}>();
  const staged=stages.results.map(s=>JSON.parse(s.payload) as store.Stored),expired=staged.filter(m=>!isLiveStage(m,+now)).slice(0,20);
  if(staged.filter(m=>isLiveStage(m,+now)).length>=24)throw new AppError('Save or discard an existing cover before uploading another.',429);
  const row:store.Stored={id,kind:'courseCover',status:'Staged',version:1,mime:upload.mimeType,width:upload.width,height:upload.height,size:upload.bytes.byteLength,uploadedBy:ctx.v.person,uploadedAt:at,expiresAt:new Date(+now+86400000).toISOString(),...(target?{targetCourse:target}:{})},key=coverKey(id);
  await financeFiles().put(key,upload.bytes,{httpMetadata:{contentType:upload.mimeType}});
  try{await store.commit(ctx.v,[{after:row},...expired.map(before=>({before,after:{...before,version:before.version+1,status:'Retired',retiredAt:at}}))],'Stage Course Cover');}catch(e){await financeFiles().delete(key);throw e;}
  await Promise.allSettled(expired.map(m=>financeFiles().delete(coverKey(m.id))));
  return out({id,url:'/api/school/cover?id='+id});
 }catch(e){const f=safeFailure(e,'school.cover.stage');return out(f.body,f.status);}
}
export async function DELETE(r:Request){
 try{
  writable(r);const ctx=await context(r),id=new URL(r.url).searchParams.get('id'),key=coverKey(id),old=await store.get(String(id));
  if(!ctx.creator||!old||old.kind!=='courseCover'||old.status!=='Staged'||old.uploadedBy!==ctx.v.person)throw notFound();
  await store.commit(ctx.v,[{before:old,after:{...old,version:old.version+1,status:'Retired',retiredAt:new Date().toISOString()}}],'Discard Staged Course Cover');
  try{await financeFiles().delete(key);}catch{/* retired rows are never served */}
  return out({discarded:true});
 }catch(e){const f=safeFailure(e,'school.cover.discard');return out(f.body,f.status);}
}
