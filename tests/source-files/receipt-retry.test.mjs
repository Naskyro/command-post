import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

test('private Drive accession retries only a definitively missing, exact-source write, never ordinary unauthenticated mutations',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'drive-receipt-')),out=join(dir,'model.mjs');
 await build({entryPoints:['lib/source-files/transfer-client.ts'],outfile:out,platform:'node',format:'esm',bundle:true,logLevel:'silent'});
 const {fileSource,resolveTarget}=await import(pathToFileURL(out));
 const old=globalThis.fetch;t.after(async()=>{globalThis.fetch=old;await rm(dir,{recursive:true,force:true})});
 const item={driveId:'drive-id-fixture',scope:'hr',name:'Test Note.pdf',category:'Training Evidence',path:'Personnel/Fixtures/Test Note.pdf',mime:'application/pdf',representation:'Original',bytes:4,sha256:'a'.repeat(64)};
 const target={key:'source-folder',scope:'hr',record:{sourceFolderId:'source-folder'}},blob=new Blob(['data']);
 const j=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
 const gateway=()=>new Response('<html>Unavailable</html>',{status:502});
 const missingFile=()=>j({status:'missing'}),savedFile=()=>j({status:'confirmed'}),missingHr=()=>j({receiptStatus:'missing',recordId:'person-f'}),savedHr=()=>j({receiptStatus:'filed',recordId:'person-f'});
 const script=(entries)=>{const seen=[];globalThis.fetch=async(url,init)=>{const form=init.body instanceof FormData,raw=form?JSON.parse(init.body.get('meta')):JSON.parse(init.body),op=form?'upload':raw.action;seen.push(op);const step=entries[seen.length-1];assert.ok(step,'Unexpected extra request: '+op);assert.equal(step[0],op);if(form){assert.equal(raw.sha256,item.sha256);assert.equal(raw.targetId,'person-f');assert.equal(await init.body.get('file').text(),'data');}return step[1]();};return seen;};
 const upload=()=>fileSource(item,'person-f',blob,true,()=>{});
 await t.test('lost success response reconciles via receipt without retransmitting bytes',async()=>{const seen=script([['receipt',missingFile],['upload',gateway],['receipt',savedFile]]);assert.equal(await upload(),'confirmed');assert.equal(seen.length,3)});
 await t.test('direct file repeats only following “missing” and preserves the same bytes, source, and target',async()=>{const seen=script([['receipt',missingFile],['upload',gateway],['receipt',missingFile],['upload',savedFile]]);assert.equal(await upload(),'confirmed');assert.equal(seen.length,4)});
 await t.test('unrecognized or unavailable receipts never authorize another submission',async()=>{const seen=script([['receipt',missingFile],['upload',gateway],['receipt',()=>j({status:'unknown'})]]);await assert.rejects(upload,/No Additional Submission/);assert.equal(seen.length,3);const missing=script([['receipt',missingFile],['upload',gateway],['receipt',()=>j({error:'No access'},403)]]);await assert.rejects(upload,/403/);assert.equal(missing.length,3)});
 await t.test('authorization, stale revisions, and validation errors never replay or disclose via a second read',async()=>{for(const code of [400,403,404,409,422]){const seen=script([['receipt',missingFile],['upload',()=>j({error:'Review'},code)]]);await assert.rejects(upload,new RegExp(String(code)));assert.equal(seen.length,2)}});
 await t.test('partially committed personnel source resumes only after native authenticated receipt confirms missing',async()=>{const seen=script([['receipt',missingHr],['import',gateway],['receipt',missingHr],['import',savedHr]]);assert.equal(await resolveTarget(target,true),'person-f');assert.equal(seen.length,4)});
 await t.test('limit: one initial write plus at most two reattempts; final missing is not success',async()=>{const sequence=[['receipt',missingHr]];for(let i=0;i<3;i++)sequence.push(['import',gateway],['receipt',missingHr]);const seen=script(sequence);await assert.rejects(()=>resolveTarget(target,true),/Not Filed · Receipt Checked After 3 Attempts/);assert.equal(seen.filter(k=>k==='import').length,3)});
 await t.test('sealed large original retries only its commit, never its parts, after a verified missing-file receipt',async()=>{
  const bytes=new Blob([new Uint8Array(500*1024)]),seen=[];let commits=0;
  globalThis.fetch=async(url,init)=>{let op;const part=String(url).includes('part=');if(part){op='part';assert.equal(init.body.size,bytes.size);}else op=JSON.parse(init.body).action;seen.push(op);
    if(op==='receipt')return missingFile();if(op==='start')return j({status:'ready',id:'stage-f',nextGroup:0,groupParts:8,parts:1,partBytes:512*1024});if(op==='part')return j({part:0});if(op==='seal')return j({group:0});if(op==='commit')return ++commits===1?gateway():savedFile();throw Error('Unknown operation');};
  assert.equal(await fileSource({...item,bytes:bytes.size},'person-f',bytes,true,()=>{}),'confirmed');assert.deepEqual(seen,['receipt','start','part','seal','commit','receipt','commit']);
 });
 await t.test('an existing CCR target is reused, and unsupported preview results do not open another case',async()=>{const c={key:'c',scope:'damage',record:{sourceId:'test-drive'}};const seen=script([['preview',()=>j({status:'matched',targetId:'existing-case'})]]);assert.equal(await resolveTarget(c,true),'existing-case');assert.equal(seen.length,1);const invalid=script([['preview',()=>j({status:'unknown',targetId:'maybe'})]]);await assert.rejects(()=>resolveTarget(c,true),/Destination Receipt Unverified/);assert.equal(invalid.length,1)});
 await t.test('read-only checks never file; unexpected initial statuses do not authorize writing',async()=>{const seen=script([['receipt',missingHr]]);assert.equal(await resolveTarget(target,false),'');assert.deepEqual(seen,['receipt']);const malformed=script([['receipt',()=>j({})]]);await assert.rejects(upload,/Unverified/);assert.deepEqual(malformed,['receipt'])});
});
