import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('course media uses bounded uploads, exact lesson linkage, scoped playback, and byte ranges',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'school-media-')),rows=[],objects=new Map(),uploads=new Map(),audit=[];
 const courses={course:{id:'course',title:'Fixture Course',status:'Published',createdBy:'author',departmentIds:['dispatch'],lessons:[{id:'video',kind:'video',title:'Video'},{id:'audio',kind:'audio',title:'Audio'}]},other:{id:'other',status:'Published',createdBy:'other',departmentIds:['drivers'],lessons:[]}};
 const viewers={author:{v:{id:'author-login',person:'author',name:'Author'},creator:true,all:true,manager:true,departmentId:'dispatch',records:[]},second:{v:{id:'second-login',person:'second',name:'Second Author'},creator:true,all:false,manager:true,departmentId:'dispatch',records:[]},learner:{v:{id:'learner-login',person:'learner',name:'Learner'},creator:false,all:false,manager:false,departmentId:'dispatch',records:[]},outsider:{v:{id:'outsider-login',person:'outsider',name:'Outside'},creator:true,all:false,manager:false,departmentId:'drivers',records:[]}};
 const bytesOf=b=>typeof b==='string'?new TextEncoder().encode(b):new Uint8Array(b.buffer||b,b.byteOffset||0,b.byteLength).slice();
 const put=async(k,b,options={})=>{objects.set(k,{bytes:bytesOf(b),...options});};
 const bucket={put,delete:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])objects.delete(k);},head:async k=>{const o=objects.get(k);return o?{size:o.bytes.length,customMetadata:o.customMetadata}:null;},get:async(k,options)=>{const o=objects.get(k);if(!o)return null;const bytes=options?.range?o.bytes.slice(options.range.offset,options.range.offset+options.range.length):o.bytes;return {body:bytes,size:o.bytes.length,customMetadata:o.customMetadata,arrayBuffer:async()=>bytes.slice().buffer,json:async()=>JSON.parse(new TextDecoder().decode(bytes))};},createMultipartUpload:async(key,options)=>{const uploadId=crypto.randomUUID();uploads.set(uploadId,{key,options,parts:new Map()});return {uploadId,abort:async()=>uploads.delete(uploadId)};},resumeMultipartUpload:(key,uploadId)=>({uploadPart:async(partNumber,bytes)=>{const u=uploads.get(uploadId);if(!u||u.key!==key)throw new Error('No multipart upload');const b=bytesOf(bytes),etag=createHash('sha256').update(b).digest('hex');u.parts.set(partNumber,{bytes:b,etag});return {partNumber,etag};},complete:async parts=>{const u=uploads.get(uploadId);if(!u||u.key!==key)throw new Error('No multipart upload');for(let i=0;i<parts.length;i++){assert.equal(parts[i].etag,u.parts.get(parts[i].partNumber).etag);if(i<parts.length-1)assert(u.parts.get(parts[i].partNumber).bytes.length>=5*1024*1024);}const buffer=Buffer.concat(parts.map(p=>Buffer.from(u.parts.get(p.partNumber).bytes)));await put(key,buffer,u.options);uploads.delete(uploadId);},abort:async()=>uploads.delete(uploadId)})};
 globalThis.schoolMediaTest={rows,objects,bucket,courses,viewers,audit};
 t.after(async()=>{delete globalThis.schoolMediaTest;await rm(dir,{recursive:true,force:true});});
 const mocks=new Map([
  ['@/db/finance','export const financeFiles=()=>globalThis.schoolMediaTest.bucket;'],
  ['school-server',`const f=globalThis.schoolMediaTest;export async function context(r){return f.viewers[r.headers.get('role')||'author'];}export async function getCourse(ctx,id){const c=f.courses[id];if(!c||!ctx.all&&!c.departmentIds.includes(ctx.departmentId))throw Object.assign(new Error('Course unavailable'),{status:403});return c;}export function requireEdit(ctx,c){if(!ctx.creator||!ctx.all&&c.createdBy!==ctx.v.person&&!c.departmentIds.includes(ctx.departmentId))throw Object.assign(new Error('No editing access'),{status:403});}export const inTeam=()=>false;`],
  ['school-store',`const f=globalThis.schoolMediaTest;export async function records(){return structuredClone(f.rows);}export async function get(id){return structuredClone(f.rows.find(r=>r.id===id));}export async function commit(v,changes,action){if(f.failCommit)throw new Error('Storage unavailable');for(const {before,after} of changes){const i=f.rows.findIndex(r=>r.id===after.id);if(before&&(i<0||f.rows[i].version!==before.version)||!before&&i>=0)throw Object.assign(new Error('Conflict'),{status:409});}for(const {after} of changes){const i=f.rows.findIndex(r=>r.id===after.id);if(i<0)f.rows.push(structuredClone(after));else f.rows[i]=structuredClone(after);}f.audit.push(action);}`],
  ['@/lib/hr/permissions','export const hrCan=()=>false;'],
 ]);
 await build({entryPoints:{stage:'app/api/school/media/stage/route.ts',media:'app/api/school/media/route.ts',rules:'lib/school/media.ts'},outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',plugins:[{name:'media-fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const path=a.path==='@/lib/school/server'||a.importer.endsWith('/school/media-stage-server.ts')&&a.path==='./server'?'school-server':a.path==='@/lib/school/store'||a.importer.endsWith('/school/media-stage-server.ts')&&a.path==='./store'?'school-store':a.path;return mocks.has(path)?{path,namespace:'fixture'}:undefined;});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks.get(a.path)}));}}]});
 const [stage,media,rules]=await Promise.all(['stage','media','rules'].map(x=>import(pathToFileURL(join(dir,x+'.mjs')))));
 const url='https://test.invalid/api/school/media/stage',headers=role=>({role,origin:'https://test.invalid'});
 function request(body,query='',role='author',origin='https://test.invalid'){return new Request(url+query,{method:'POST',headers:{...headers(role),origin,'content-type':body instanceof Uint8Array?'application/octet-stream':'application/json'},body:body instanceof Uint8Array?body:JSON.stringify(body)});}
 const post=(body,query='',role='author',origin)=>stage.POST(request(body,query,role,origin));
 const read=(id,role='author',range)=>media.GET(new Request('https://test.invalid/api/school/media?id='+id,{headers:{role,...(range?{range}:{})}}));
 const video=new Uint8Array(6*1024*1024+17);video.set([0,0,0,24,...new TextEncoder().encode('ftypisom')]);video[video.length-1]=123;
 const metadata=(bytes=video,extra={})=>({action:'start',name:'Road Safety.mp4',mime:'video/mp4',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),courseId:'course',lessonId:'video',lessonKind:'video',...extra});
 async function start(bytes=video,extra={}){const r=await post(metadata(bytes,extra));assert.equal(r.status,200,await r.clone().text());return r.json();}
 async function complete(bytes=video,extra={}){const s=await start(bytes,extra);for(let i=0;i<s.parts;i++){const p=await post(bytes.subarray(i*s.partBytes,Math.min(bytes.length,(i+1)*s.partBytes)),'?id='+s.id+'&part='+i);assert.equal(p.status,200,await p.clone().text());}for(let i=0;i<s.groups;i++)assert.equal((await post({action:'seal',id:s.id,group:i})).status,200);const r=await post({action:'finish',id:s.id});assert.equal(r.status,200,await r.clone().text());return {stage:s,receipt:await r.json()};}

 await t.test('authoring, exact subject, origin, size, and format checks run before any upload',async()=>{
  assert.equal((await post(metadata(),'','learner')).status,403);assert.equal((await post(metadata(),'','outsider')).status,403);assert.equal((await post(metadata(),'','author','https://other.invalid')).status,403);
  assert.equal((await post(metadata(video,{size:50*1024*1024+1}))).status,413);assert.equal((await post(metadata(video,{size:0}))).status,413);
  assert.equal((await post(metadata(video,{mime:'text/html'}))).status,400);assert.equal((await post(metadata(video,{lessonKind:'audio'}))).status,400);assert.equal((await post(metadata(video,{lessonId:''}))).status,400);assert.equal(uploads.size,0);
  globalThis.schoolMediaTest.failCommit=true;try{assert((await post(metadata())).status>=400);}finally{globalThis.schoolMediaTest.failCommit=false;}assert.equal(uploads.size,0);
 });
 await t.test('same-course editors cannot hijack uploads; malformed and changed parts fail',async()=>{
  const s=await start();const first=video.subarray(0,s.partBytes);
  assert.equal((await post(first,'?id='+s.id+'&part=0','second')).status,404);assert.equal((await post(first.subarray(0,15),'?id='+s.id+'&part=0')).status,400);
  const forged=first.slice();forged.set(new TextEncoder().encode('<html>'));assert.equal((await post(forged,'?id='+s.id+'&part=0')).status,400);
  assert.equal((await post(first,'?id='+s.id+'&part=0')).status,200);assert.equal((await post(first,'?id='+s.id+'&part=0')).status,200);const changed=first.slice();changed[50]=1;assert.equal((await post(changed,'?id='+s.id+'&part=0')).status,409);
  assert.equal((await post({action:'finish',id:s.id})).status,409);
  const cancelled=await stage.DELETE(new Request(url+'?id='+s.id,{method:'DELETE',headers:headers('author')}));assert.equal(cancelled.status,200);assert.equal((await post(first,'?id='+s.id+'&part=0')).status,404);assert(![...objects.keys()].some(k=>k.includes(s.id)));
 });
 let uploaded;
 await t.test('6 MB original is verified, assembled with bounded R2 parts, and completion is idempotent',async()=>{
  uploaded=await complete();const {stage:s,receipt:r}=uploaded;assert.equal(r.courseId,'course');assert.equal(r.lessonId,'video');assert.equal(r.mime,'video/mp4');assert.equal(r.size,video.length);assert.equal(r.name,'Road Safety.mp4');
  assert.deepEqual(await(await post({action:'finish',id:s.id})).json(),r);assert.equal(rows.filter(x=>x.kind==='media').length,1);assert.equal(uploads.size,0);assert(![...objects.keys()].some(k=>k.includes(s.id)));
  const object=objects.get(rows.find(x=>x.id===r.id).key);assert.equal(createHash('sha256').update(object.bytes).digest('hex'),metadata().sha256);assert(audit.includes('Upload Course Lesson Media'));
 });
 await t.test('only the uploader previews unlinked files; linked learners can play and seek, other departments cannot',async()=>{
  const r=uploaded.receipt;assert.equal((await read(r.id)).status,200);assert.equal((await read(r.id,'second')).status,403);assert.equal((await read(r.id,'learner')).status,403);
  const lesson=courses.course.lessons[0];lesson.mediaId=r.id;rules.validateLessonMedia(lesson,'course',rows.find(x=>x.id===r.id));assert.equal(lesson.mediaUrl,r.url);assert.equal(lesson.mediaName,r.name);
  assert.equal((await read(r.id,'learner')).status,200);assert.equal((await read(r.id,'outsider')).status,403);
  const partial=await read(r.id,'learner','bytes=0-99');assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Range'),'bytes 0-99/'+video.length);assert.equal(partial.headers.get('Content-Length'),'100');assert.deepEqual(new Uint8Array(await partial.arrayBuffer()),video.slice(0,100));assert.match(partial.headers.get('cache-control'),/no-store/);
  const suffix=await read(r.id,'learner','bytes=-5');assert.equal(suffix.status,206);assert.deepEqual(new Uint8Array(await suffix.arrayBuffer()),video.slice(-5));
  const bad=await read(r.id,'learner','bytes='+video.length+'-');assert.equal(bad.status,416);assert.equal(bad.headers.get('Content-Range'),'bytes */'+video.length);assert.equal((await read(r.id,'learner','bytes=0-2,5-8')).status,416);
 });
 await t.test('media cannot move between courses or lessons, bypass type checks, or use a pasted private URL',()=>{
  const m=rows.find(x=>x.id===uploaded.receipt.id),base={...courses.course.lessons[0]};
  assert.throws(()=>rules.validateLessonMedia({...base,id:'audio'},'course',m),/course and lesson/);assert.throws(()=>rules.validateLessonMedia(base,'other',m),/course and lesson/);assert.throws(()=>rules.validateLessonMedia({...base,kind:'audio'},'course',m),/lesson type/);assert.throws(()=>rules.validateLessonMedia({id:'video',kind:'video',mediaUrl:uploaded.receipt.url},'course',undefined),/pasting/);
 });
 await t.test('audio upload and replacement preserve prior media until a new lesson link is saved',async()=>{
  const audio=new Uint8Array(8192);audio.set(new TextEncoder().encode('RIFF'));audio.set(new TextEncoder().encode('WAVE'),8);const result=await complete(audio,{name:'Briefing.wav',mime:'audio/wav',lessonId:'audio',lessonKind:'audio'});assert.equal((await read(result.receipt.id,'learner')).status,403);const l=courses.course.lessons[1];l.mediaId=result.receipt.id;rules.validateLessonMedia(l,'course',rows.find(x=>x.id===l.mediaId));assert.equal((await read(result.receipt.id,'learner')).status,200);
  const replacement=await complete();assert.equal((await read(uploaded.receipt.id,'learner')).status,200);courses.course.lessons[0].mediaId=replacement.receipt.id;rules.validateLessonMedia(courses.course.lessons[0],'course',rows.find(x=>x.id===replacement.receipt.id));assert.equal((await read(uploaded.receipt.id,'learner')).status,403);assert.equal((await read(replacement.receipt.id,'learner')).status,200);
 });
 await t.test('checksum mismatch never completes or exposes a media file',async()=>{
  const bytes=new Uint8Array(20);bytes.set(new TextEncoder().encode('ID3'));const s=await start(bytes,{name:'bad.mp3',mime:'audio/mpeg',lessonKind:'audio',lessonId:'audio',sha256:'0'.repeat(64)});assert.equal((await post(bytes,'?id='+s.id+'&part=0')).status,200);assert.equal((await post({action:'seal',id:s.id,group:0})).status,200);const before=rows.filter(r=>r.kind==='media').length;assert.equal((await post({action:'finish',id:s.id})).status,409);assert.equal(rows.filter(r=>r.kind==='media').length,before);
 });
});
