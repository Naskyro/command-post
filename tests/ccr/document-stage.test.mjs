import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {tdlrEvidenceFlag,tdlrEvidenceStageQuery} from '../../lib/ccr/tdlr-evidence.ts';
import {build} from 'esbuild';import {zipSync,strToU8} from 'fflate';
test('CCR proxy-safe staging binds original typed files to the target and actor, rechecks access, rejects incomplete/corrupt uploads, and reassembles large DOCX files under the request limit',async t=>{
 const sql=new DatabaseSync(':memory:'),map=new Map(),tmp=await mkdtemp(join(tmpdir(),'ccr-stage-')),oldFetch=globalThis.fetch;
 t.after(async()=>{sql.close();globalThis.fetch=oldFetch;delete globalThis.docStageTest;await rm(tmp,{recursive:true,force:true});});
 const db={prepare(s){const q=sql.prepare(s);let a=[];return{bind(...x){a=x;return this;},async run(){return{meta:{changes:q.run(...a).changes}};},async first(){return q.get(...a);},async all(){return{results:q.all(...a)};}};}};
 const r2={async get(k){const v=map.get(k);return !v?null:{arrayBuffer:async()=>v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)};},async put(k,v){map.set(k,v.slice());},async delete(k){for(const key of [k].flat())map.delete(key);}};
 globalThis.docStageTest={db,r2,key:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 const stubs=new Map([['@/db/finance','export const financeDb=()=>globalThis.docStageTest.db,financeFiles=()=>globalThis.docStageTest.r2'],['cloudflare:workers','export const env={get HR_DATA_ENCRYPTION_KEY(){return globalThis.docStageTest.key;}}']]);
 await build({entryPoints:{server:'lib/ccr/document-stage-server.ts',client:'lib/ccr/document-stage-client.ts'},outdir:tmp,outExtension:{'.js':'.mjs'},format:'esm',bundle:true,platform:'node',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>stubs.has(a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs.get(a.path)}));}}]});
 const {handleDocumentStage}=await import(pathToFileURL(join(tmp,'server.mjs'))),{stageDocument,documentPartBytes}=await import(pathToFileURL(join(tmp,'client.mjs')));
 const sum=v=>createHash('sha256').update(v).digest('hex'),base='https://example.invalid/api/ccr/register/stage',user={id:'user:a',person:'a'},other={id:'user:b',person:'b'},scope='register',fields={section:'tdlr',id:'private-case',version:'3',documentType:'Evidence Packet'};
 let allowed=true,commits=0,authN=0,byteRequests=0,lastFingerprint='',maxBody=0;
 const options={maxBytes:f=>f.section==='tdlr'?24*1048576:8*1048576,authorize:f=>{authN++;if(f.id!==fields.id||!allowed)throw Error('not authorized for this case');},attach:async(doc,f,id)=>{assert.deepEqual({...f},fields);assert.match(id,/^[\da-f-]{36}$/);commits++;lastFingerprint=sum(doc.bytes);return {filename:doc.name,type:doc.type,sha256:lastFingerprint};}};
 const fetcher=async(url,init)=>{const headers=new Headers(init.headers);headers.set('origin',new URL(base).origin);const r=new Request(new URL(url,base),{...init,headers});const n=(await r.clone().arrayBuffer()).byteLength;maxBody=Math.max(n,maxBody);if(n>documentPartBytes)return Response.json({error:'proxy body limit'},{status:413});if(r.headers.get('content-type')==='application/octet-stream')byteRequests++;return Response.json(await handleDocumentStage(r,user,scope,options));};globalThis.fetch=fetcher;
 const cb=(b,v=user,sc=scope)=>handleDocumentStage(new Request(base,{method:'POST',headers:{origin:new URL(base).origin,'content-type':'application/json'},body:JSON.stringify(b)}),v,sc,options);
 const part=(id,num,bytes,v=user)=>handleDocumentStage(new Request(base+'?stage='+id+'&part='+num,{method:'POST',headers:{origin:new URL(base).origin,'content-type':'application/octet-stream'},body:bytes}),v,scope,options);
 const xml=strToU8,source=process.env.CCR_STAGE_DOCX_FIXTURE?new Uint8Array(await readFile(process.env.CCR_STAGE_DOCX_FIXTURE)):zipSync({'[Content_Types].xml':xml('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':xml('<Relationships><Relationship Target="word/document.xml"/></Relationships>'),'word/document.xml':xml('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'),'word/media/picture.png':new Uint8Array(20534333)},{level:0});
 const result=await stageDocument(base,new File([source],'packet.docx'),fields);
 assert.equal(result.sha256,sum(source));assert.equal(result.filename,'packet.docx');assert.match(result.type,/wordprocessingml/);assert.equal(commits,1);assert.equal(byteRequests,Math.ceil(source.length/documentPartBytes));assert.equal(maxBody,documentPartBytes);assert.ok(authN>=byteRequests+3);assert.equal(map.size,0);
 const contents=new TextEncoder().encode('%PDF-1.7\nsensitive document\n%%EOF'),start=()=>cb({action:'start',fields,name:'packet.pdf',bytes:contents.length,sha256:sum(contents)});
 const s=await start();assert.doesNotMatch(sql.prepare('select payload from ccr_document_upload_stages').get().payload,/private-case|packet.pdf/);
 await assert.rejects(()=>part(s.id,0,contents,other),/expired|unavailable/);await assert.rejects(()=>cb({action:'attach',id:s.id},user,'different-route'),/expired|unavailable/);
 await assert.rejects(()=>cb({action:'attach',id:s.id}),/missing/);await assert.rejects(()=>part(s.id,0,contents.slice(0,-1)),/complete document/);
 await assert.rejects(()=>part(s.id,0,new Uint8Array(contents.length+1)),/exceeds/);allowed=false;await assert.rejects(()=>part(s.id,0,contents),/not authorized/);allowed=true;
 await part(s.id,0,contents);assert.ok(!Buffer.from([...map.values()][0]).includes('sensitive document'));
 await cb({action:'seal',id:s.id,group:0});allowed=false;await assert.rejects(()=>cb({action:'attach',id:s.id}),/not authorized/);allowed=true;
 const forged=contents.slice();forged[8]^=1;await part(s.id,0,forged);await cb({action:'seal',id:s.id,group:0});await assert.rejects(()=>cb({action:'attach',id:s.id}),/fingerprint/);assert.equal(commits,1);
 await cb({action:'cancel',id:s.id});assert.equal(map.size,0);await assert.rejects(()=>cb({action:'attach',id:s.id}),/unavailable/);
 const fake=await cb({action:'start',fields,name:'disguised.docx',bytes:contents.length,sha256:sum(contents)});await part(fake.id,0,contents);await cb({action:'seal',id:fake.id,group:0});await assert.rejects(()=>cb({action:'attach',id:fake.id}),/valid PDF/);assert.equal(commits,1);
 await assert.rejects(()=>cb({action:'start',fields:{...fields,section:'recovery'},name:'oversize.pdf',bytes:8*1048576+1,sha256:sum(contents)}),/size/);
 // Actual regulatory importer query and a real staged client/server exchange:
 // transport's 'stage=<UUID>' must be distinct from the feature switch.
 let partsChecked=0;globalThis.fetch=async(url,init)=>{const u=new URL(url,base);assert.ok(u.searchParams.has(tdlrEvidenceFlag));if(u.searchParams.has('part')){assert.equal(u.searchParams.getAll('stage').length,1);assert.match(u.searchParams.get('stage'),/^[a-f0-9-]{36}$/);partsChecked++;}return fetcher(url,init);};
 const proof=await stageDocument('https://example.invalid/api/ccr/register/mail-evidence'+tdlrEvidenceStageQuery,new File([contents],'approved-review.pdf'),fields);
 assert.equal(proof.sha256,sum(contents));assert.equal(proof.filename,'approved-review.pdf');assert.equal(partsChecked,1);assert.equal(commits,2);

});
