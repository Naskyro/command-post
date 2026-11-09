import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {canReadRecord} from '../../lib/hr/workflow.ts';
import {canRemoveHr} from '../../lib/hr/record-removal.ts';
const grpc=(module,tab,level='View')=>({module,tab,level}),ccr='Compliance, Claims & Recovery',hr='People & HR';
const staff=['reviewer','employee','outside'].map(id=>({id,kind:'person',department:id==='outside'?'Billing':'Dispatch',name:id,status:'Active'}));
const person=(action='reviewScreening',level='Edit',person='reviewer')=>({id:'u:'+person,name:person,person,department:'Dispatch',owner:false,access:[grpc(ccr,'people',level),grpc(hr,'credentials')],hrResponsibilities:[{action,scope:'Department'}]});
const parent=(id,kind,personId)=>({id,kind,personId,data:kind==='task'?{category:'TWC'}:{},version:1,createdAt:'2026-11-01T12:00:00Z',updatedAt:'2026-11-01T12:00:00Z',createdBy:'tester',updatedBy:'tester'});
test('original HR-store bytes require the correct employee-scoped CCR and HR responsibility across listing, write, generic HR, and download',async t=>{
 const sql=new DatabaseSync(':memory:'),bucket=new Map(),tmp=await mkdtemp(join(tmpdir(),'ccr-personnel-'));
 t.after(async()=>{delete globalThis.revFixture;sql.close();await rm(tmp,{force:true,recursive:true})});
 sql.exec(await readFile('drizzle/0006_chilly_whistler.sql','utf8'));
 const db={prepare(s){const q=sql.prepare(s);let a=[];return {bind(...v){a=v;return this;},async first(){return q.get(...a)||null},async all(){return {results:q.all(...a)}},async run(){return {meta:{changes:q.run(...a).changes}}}}},async batch(stmts){return Promise.all(stmts.map(s=>s.run()))}};
 const viewers={s:person(),t:person('manageTwc'),read:person('reviewScreening','View'),hrOnly:{...person(),access:[grpc(hr,'credentials')]},ccrOnly:{...person(),access:[grpc(ccr,'people','Edit')]},own:person('manageTwc','View','employee')};
 const r2={async put(k,b){bucket.set(k,new Uint8Array(b))},async get(k){return bucket.has(k)?{arrayBuffer:async()=>bucket.get(k).slice().buffer}:null},async delete(k){for(const key of Array.isArray(k)?k:[k])bucket.delete(key)}};
 globalThis.revFixture={db,r2,viewers,staff,key:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 const defs=new Map([['@/db/finance','export const financeDb=()=>globalThis.revFixture.db,financeFiles=()=>globalThis.revFixture.r2;'],['cloudflare:workers','export const env={get HR_DATA_ENCRYPTION_KEY(){return globalThis.revFixture.key}}'],['@/lib/finance/server','export const allRecords=async()=>globalThis.revFixture.staff,identify=(_,h)=>globalThis.revFixture.viewers[h.get("user")];'],['next/server','export const NextResponse={json:Response.json}']]);
 await build({entryPoints:{file:'app/api/ccr/personnel/files/route.ts',hr:'lib/hr/server.ts'},outdir:tmp,bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'test',setup(b){b.onResolve({filter:/.*/},a=>defs.has(a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({namespace:'fixture',filter:/.*/},a=>({contents:defs.get(a.path)}))}}]});
 const [route,store]=await Promise.all(['file','hr'].map(k=>import(pathToFileURL(join(tmp,k+'.mjs')).href)));const ps=[parent('s1','screening','employee'),parent('t1','task','employee'),parent('s2','screening','outside')];
 for(const p of ps)await store.writeHrRecord(undefined,p,viewers.s,'Test Record');
 const req=(user,id,file,fd)=>{const url=new URL('https://test.invalid/api/ccr/personnel/files');url.searchParams.set('review',id);if(file)url.searchParams.set('file',file);const req=new Request(url,{headers:{user},...(fd?{method:'POST',body:fd}:{})});return Object.assign(req,{nextUrl:url})};
 const up=(actor,record,type)=>{const f=new FormData();f.set('file',new File(['%PDF-1.6\nRestricted result'], 'restricted.pdf',{type:'application/pdf'}));f.set('documentType',type);return route.POST(req(actor,record,null,f))};
 assert.equal((await up('s','t1','Screening Result')).status,404);assert.equal((await up('s','s1','Employer Response to TWC')).status,400);assert.equal((await up('read','s1','Screening Result')).status,403);
 assert.equal((await up('s','s2','Screening Result')).status,404);assert.equal(bucket.size,0);
 const ok=await up('s','s1','Screening Result');assert.equal(ok.status,201,await ok.clone().text());const {file:f}=await ok.json();assert.equal(f.documentType,'Screening Result');assert.equal(bucket.size,1);
 assert.ok(!Buffer.from([...bucket.values()][0]).includes('%PDF'));const records=await store.readHrRecords(),doc=records.find(d=>d.id===f.id);assert.equal(doc.data.parentId,'s1');assert.match(doc.data.sha256,/^[a-f0-9]{64}$/);assert.equal(canReadRecord(doc,viewers.s,staff,records),true);
 for(const actor of ['t','hrOnly','ccrOnly','own']){assert.equal(canReadRecord(doc,viewers[actor],staff,records),false);const r=await route.GET(req(actor,'s1',f.id));assert.ok([403,404].includes(r.status));assert.doesNotMatch(await r.text(),/restricted\.pdf|Screening Result/)}
 assert.equal((await route.GET(req('t','t1',f.id))).status,404);assert.equal((await route.GET(req('s','s2',f.id))).status,404);
 assert.equal(canReadRecord(doc,viewers.s,staff,records.filter(r=>r.id!=='s1')),false);assert.equal(canReadRecord(doc,viewers.s,staff,records.map(r=>r.id==='s1'?{...r,personId:'outside'}:r)),false);
 assert.equal(canRemoveHr({...viewers.s,owner:true},doc,staff,records),false);assert.equal((await (await route.GET(req('read','s1',f.id))).text()),'%PDF-1.6\nRestricted result');
 const tw=await up('t','t1','Employer Response to TWC');assert.equal(tw.status,201);const idx=await (await route.GET(req('t','t1'))).json();assert.deepEqual(idx.files.map(f=>f.documentType),['Employer Response to TWC']);assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM hr_audit WHERE action='Uploaded CCR Personnel Review Document'").get().n,2);
 // Exercise the proxy-safe path with the same HR store and exact employee scope; revoke access mid-transfer.
 const large=Buffer.alloc(545123,0x41);large.write('%PDF-1.7\n');
 const digest=Buffer.from(await crypto.subtle.digest('SHA-256',large)).toString('hex'),url='https://test.invalid/api/ccr/personnel/files?personnelStage=1&review=s1';
 const staged=(actor,body,query='')=>{const bin=Buffer.isBuffer(body),u=new URL(url+query),r=Object.assign(new Request(u,{method:'POST',headers:{user:actor,Origin:u.origin,'Content-Type':bin?'application/octet-stream':'application/json'},body:bin?body:JSON.stringify(body)}),{nextUrl:u});return route.POST(r);};
 const start=await staged('s',{action:'start',name:'packet.pdf',bytes:large.length,declaredMime:'application/pdf',sha256:digest,fields:{reviewId:'s1',documentType:'Screening Result'}});assert.equal(start.status,200,await start.clone().text());
 const session=await start.json(),part=(i)=>'&stage='+session.id+'&part='+i;
 const rights=viewers.s.hrResponsibilities;viewers.s.hrResponsibilities=[];assert.equal((await staged('s',large.subarray(0,session.partBytes),part(0))).status,404);viewers.s.hrResponsibilities=rights;
 for(let i=0;i<session.parts;i++){const x=await staged('s',large.subarray(i*session.partBytes,(i+1)*session.partBytes),part(i));assert.equal(x.status,200,await x.clone().text());}
 assert.equal((await staged('s',{action:'seal',id:session.id,group:0})).status,200);
 const done=await staged('s',{action:'attach',id:session.id});assert.equal(done.status,200,await done.clone().text());const {file:f2}=await done.json();
 assert.equal(f2.id,'hrdoc:'+session.id);assert.equal(f2.size,large.length);
 assert.deepEqual(Buffer.from(await (await route.GET(req('s','s1',f2.id))).arrayBuffer()),large);
 assert.equal((await route.GET(req('t','s1',f2.id))).status,404);assert.ok(![...bucket.keys()].some(k=>k.startsWith('ccr-document-staging/')));

});
