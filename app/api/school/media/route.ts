import {financeFiles} from '@/db/finance';
import {context,getCourse,inTeam,requireEdit} from '@/lib/school/server';
import * as store from '@/lib/school/store';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
import {hrCan} from '@/lib/hr/permissions';
import {schoolMediaLimit,schoolMediaTypes,mediaTypeForFile,validateMediaMetadata,validateMediaSignature,mediaByteRange,type MediaLessonKind} from '@/lib/school/media';
export const dynamic='force-dynamic';
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Vary':'Cookie'};
async function scope(ctx:Awaited<ReturnType<typeof context>>,m:store.Stored,write=false){
 if(m.courseId){const c=await getCourse(ctx,String(m.courseId));if(write)requireEdit(ctx,c);else if(!c.lessons.some(l=>l.mediaId===m.id||l.mediaUrl==='/api/school/media?id='+encodeURIComponent(m.id))){if(!ctx.creator||m.uploadedBy!==ctx.v.person)throw new ForbiddenError('This file has not been saved to a lesson.');}return c;}
 if(m.personId){const pid=String(m.personId);if(write?!(ctx.all||ctx.manager&&inTeam(ctx,pid)):!(pid===ctx.v.person||ctx.all||ctx.manager&&inTeam(ctx,pid)||hrCan(ctx.v,'viewPersonnel',pid,ctx.records)))throw new ForbiddenError();return;}
 throw new ForbiddenError();
}
export async function POST(r:Request){try{
 if(r.headers.get('origin')!==new URL(r.url).origin||r.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const ctx=await context(r),limit=schoolMediaLimit+65536,type=r.headers.get('content-type')||'';
 if(!r.body||!type.startsWith('multipart/form-data;'))throw new AppError('Upload a file.');if(Number(r.headers.get('content-length')||0)>limit)throw new AppError('Choose a file up to 50 MB.',413);
 let length=0;const bounded=r.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,c){length+=chunk.byteLength;if(length>limit)throw new AppError('Choose a file up to 50 MB.',413);c.enqueue(chunk);}}));
 const form=await new Response(bounded,{headers:{'Content-Type':type}}).formData(),file=form.get('file');if(!(file instanceof File))throw new AppError('Choose a file.');
 const cid=String(form.get('courseId')||''),pid=String(form.get('personId')||''),lid=String(form.get('lessonId')||'');if(!!cid===!!pid||[cid,pid,lid].some(x=>x.length>160))throw new AppError('Choose one course or employee for this file.');
 const id=crypto.randomUUID(),base={id,kind:'media',version:1,courseId:cid||undefined,personId:pid||undefined,...(lid?{lessonId:lid}:{}),uploadedBy:ctx.v.person,uploadedAt:new Date().toISOString()},course=await scope(ctx,base,true),lesson=lid?course?.lessons.find(l=>l.id===lid):undefined;
 if(lid&&!lesson)throw new AppError('Choose a saved lesson.');if(lesson?.kind==='quiz')throw new AppError('Choose a reading, video, or audio lesson.');
 const meta=validateMediaMetadata(file.name,mediaTypeForFile(file.name,file.type),file.size,lesson?.kind as MediaLessonKind|undefined),bytes=new Uint8Array(await file.arrayBuffer());validateMediaSignature(bytes,meta.mime);
 const record={...base,...meta,key:'school/'+id};await financeFiles().put(record.key,bytes,{httpMetadata:{contentType:meta.mime}});try{await store.commit(ctx.v,[{after:record}],'media-upload');}catch(e){await financeFiles().delete(record.key);throw e;}
 return Response.json({id,url:'/api/school/media?id='+id,...meta,...(cid?{courseId:cid}:{}),...(lid?{lessonId:lid}:{})},{headers:privateHeaders});
 }catch(e){const f=safeFailure(e,'school.media-upload');return Response.json(f.body,{status:f.status,headers:privateHeaders});}}
export async function GET(r:Request){let total=0;try{
 const ctx=await context(r),id=new URL(r.url).searchParams.get('id')||'',m=await store.get(id);if(!m||m.kind!=='media'||!(schoolMediaTypes as readonly string[]).includes(String(m.mime)))throw new ForbiddenError();await scope(ctx,m);
 total=Number(m.size);if(!Number.isSafeInteger(total)||total<=0)throw new AppError('File metadata requires review.',503);const range=mediaByteRange(r.headers.get('range'),total),file=await financeFiles().get(String(m.key),range?{range}:undefined);if(!file)throw new AppError('File unavailable.',404);
 const rawName=String(m.name||'Lesson file').replace(/[\r\n"\\]/g,'_'),safeName=rawName.replace(/[^\x20-\x7e]/g,'_'),headers=new Headers({...privateHeaders,'Content-Type':String(m.mime),'Content-Disposition':'inline; filename="'+safeName+'"; filename*=UTF-8\'\''+encodeURIComponent(rawName),'Accept-Ranges':'bytes','Content-Length':String(range?.length||total)});
 if(range)headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${total}`);return new Response(file.body,{status:range?206:200,headers});
 }catch(e){const f=safeFailure(e,'school.media-read');return Response.json(f.body,{status:f.status,headers:{...privateHeaders,...(f.status===416&&total?{'Content-Range':'bytes */'+total}:{})}});}}
