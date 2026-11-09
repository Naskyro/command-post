import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
test('court packet intake checks a read-only receipt before sending or replaying; uncertain final writes retain the same originals and never invent a filing result',async t=>{
 const d=await mkdtemp(join(tmpdir(),'intake-receipt-')),old=globalThis.fetch;t.after(async()=>{globalThis.fetch=old;await rm(d,{recursive:true,force:true});});
 const out=join(d,'client.mjs');await build({entryPoints:['lib/ccr/court-intake-client.ts'],outfile:out,bundle:true,platform:'node',format:'esm'});
 const {newFiling,fileReviewedCase,checkCourtReceipts,receiptTotals}=await import(pathToFileURL(out));
 const path='documents/file.pdf',large=new Uint8Array(450*1024),doc={name:'evidence.pdf',documentType:'Final Judgment',sha256:'d'.repeat(64),path},source={number:'private-cause',title:'Private party',documents:[doc]},data={[path]:large},noop=()=>{};
 function fixture(receipts,attempts){
  const calls={checks:0,sent:[],start:0,parts:0,seals:0,cancel:0};
  globalThis.fetch=async(url,init)=>{
   if(String(url)==='/api/ccr/docket/import/receipt'){calls.checks++;assert.equal(init.method,'POST');const b=JSON.parse(init.body);assert.deepEqual(b.record.documents,[{name:doc.name,documentType:doc.documentType,sha256:doc.sha256}]);assert.doesNotMatch(String(url),/private|cause=|case=/);assert.ok(!init.body.includes(path));const next=receipts.shift();if(next==='offline')throw Error('Transient');if(next===null)return new Response('invalid',{status:200});if(!next)throw Error('unplanned verification');return Response.json({status:next,...(next==='review'?{}:{expectedDocuments:1,matchedDocuments:next==='confirmed'?1:0})});}
   if(String(url)==='/api/ccr/docket/import'){calls.sent.push(init.body);const next=attempts.shift();if(next===undefined)assert.fail('unexpected duplicate write');if(next==='lost')throw Error('Connection lost');if(next==='bad-2xx')return new Response('<html>',{status:200});if(next==='expiry')return Response.json({error:'This upload expired or is unavailable.'},{status:404});if(next==='success')return Response.json({id:'private-id',status:'created',addedFiles:1});return Response.json({error:'Not confirmed'},{status:next});}
   if(String(url).includes('part=')){calls.parts++;return Response.json({part:Number(new URL(url,'https://example.test').searchParams.get('part'))});}
   const b=JSON.parse(init.body);if(b.action==='start'){calls.start++;return Response.json({id:'stage'+calls.start,chunkSize:384*1024,parts:2,partsPerGroup:16});}if(b.action==='cancel'){calls.cancel++;return Response.json({ok:true});}if(b.action==='seal'){calls.seals++;return Response.json({group:b.group});}assert.fail('unexpected route: '+url);
  };return calls;
 }
 const run=s=>fileReviewedCase(source,data,s,noop);
 // Ambiguous final writes plus a verified receipt are successes without guessing how many new files were created.
 for(const value of ['lost','bad-2xx',408,429,500,503]){const f=fixture(['incomplete','confirmed'],[value]),s=newFiling();await run(s);assert.equal(s.phase,'done');assert.match(s.message,/Verified on the docket/);assert.doesNotMatch(s.message,/new document/i);assert.equal(f.sent.length,1);assert.equal(f.checks,2);}
 // Unknown then incomplete does not immediately resend. Following deliberate retry reuses the exact FormData and stage IDs.
 {const f=fixture(['incomplete','offline','offline','incomplete','incomplete','confirmed'],['lost',503]),s=newFiling();await run(s);assert.equal(s.phase,'check');const fd=s.prepared;assert.ok(fd instanceof FormData);assert.equal(s.stages.size,1);assert.equal(f.cancel,0);await run(s);assert.equal(f.sent.length,1);await run(s);assert.equal(s.phase,'ready');assert.equal(f.sent.length,1);await run(s);assert.equal(s.phase,'done');assert.equal(f.start,1);assert.equal(f.sent.length,2);assert.equal(f.sent[1],fd);}
 {const f=fixture(['incomplete','incomplete','confirmed'],[503]),s=newFiling();await run(s);assert.equal(s.phase,'ready');assert.equal(f.cancel,0);await run(s);assert.equal(s.phase,'done');assert.equal(f.sent.length,1);}
 // Expired originals require fresh user action and a fresh read before being staged again.
 {const f=fixture(['incomplete','incomplete','incomplete'],['expiry','success']),s=newFiling();await run(s);assert.equal(s.phase,'ready');assert.equal(s.prepared,undefined);assert.equal(s.stages.size,0);assert.match(s.message,/expired/);assert.equal(f.start,1);await run(s);assert.equal(s.phase,'done');assert.equal(f.start,2);assert.notEqual(f.sent[0],f.sent[1]);}
 for(const value of [403,409,422]){const f=fixture(['incomplete'],[value]),s=newFiling();await run(s);await run(s);assert.equal(s.phase,'blocked');assert.equal(f.sent.length,1);assert.equal(f.cancel,1);assert.equal(f.checks,1);}
 {const f=fixture(['confirmed'],[]),s=newFiling();await run(s);assert.equal(s.phase,'done');assert.equal(f.start,0);assert.equal(f.sent.length,0);}
 {const f=fixture(['review','review',null],[]),s=newFiling();await run(s);await run(s);assert.equal(s.phase,'review');await run(s);assert.equal(s.phase,'check');assert.equal(f.start,0);assert.equal(f.sent.length,0);}
 // The explicit UI operation is receipt-only (even when a stage is present), deduplicates SHA-256s per case,
 // distinguishes missing from unknown, caps concurrency, and retries transient reads but no mutations.
 {
  const cases=Array.from({length:8},(_,i)=>({...source,number:String(i),documents:[doc,{...doc,path:'documents/alias.pdf'}]}));
  const states=cases.map(()=>newFiling()),seen=new Map(),waits=[];let active=0,busiest=0;
  states[0].stages.set(path,'previous-stage');states[3].stages.set(path,'potentially-needed');states[3].prepared=new FormData();
  globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/ccr/docket/import/receipt');assert.equal(init.method,'POST');const payload=JSON.parse(init.body);assert.equal(payload.record.documents.length,2);
   const n=Number(payload.record.number),cnt=(seen.get(n)||0)+1;seen.set(n,cnt);active++;busiest=Math.max(busiest,active);await new Promise(res=>setTimeout(res,2));active--;
   if(n===5&&cnt<3)return Response.json({error:'temporary'},{status:429,headers:{'Retry-After':'1'}});
   if(n===3)return Response.json({status:'review'});if(n===4)return Response.json({error:'permissions'},{status:403});
   if(n===7)return Response.json({status:'confirmed',expectedDocuments:2,matchedDocuments:1});
   return Response.json({status:n===6?'incomplete':'confirmed',expectedDocuments:1,matchedDocuments:n===6?0:1});};
  const updates=[];await checkCourtReceipts(cases,c=>states[Number(c.number)],(c,s,count)=>updates.push(count),undefined,async n=>waits.push(n));
  assert.ok(busiest<=3);assert.ok(busiest>1);assert.equal(seen.get(4),1);assert.equal(seen.get(5),3);assert.equal(seen.get(7),1);assert.deepEqual(waits,[1000,1000]);assert.equal(updates.length,8);
  assert.deepEqual(receiptTotals(cases,c=>states[Number(c.number)].receipt),{confirmedCases:4,outstandingCases:4,matched:4,unmatched:1,unverified:3});
  assert.equal(states[3].stages.size,1);assert.ok(states[3].prepared);assert.equal(states[4].phase,'check');assert.equal(states[7].receipt,undefined);
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should skip confirmed');};for(const i of [0,1,2,5])await fileReviewedCase(cases[i],{},states[i],noop);assert.equal(calls,0);
 }

});
