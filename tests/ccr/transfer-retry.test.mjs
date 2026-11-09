import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
test('court and register transfers retry only an unconfirmed part or seal; honor backoff, bound attempts and never replay start or attachment',async t=>{
 const tmp=await mkdtemp(join(tmpdir(),'retry-stage-')),original=globalThis.fetch;t.after(async()=>{globalThis.fetch=original;await rm(tmp,{recursive:true,force:true});});
 await build({entryPoints:{court:'lib/ccr/court-stage-client.ts',register:'lib/ccr/document-stage-client.ts'},outdir:tmp,bundle:true,outExtension:{'.js':'.mjs'},format:'esm',platform:'node'});
 const {stageCourtOriginal}=await import(pathToFileURL(join(tmp,'court.mjs'))),{stageDocument}=await import(pathToFileURL(join(tmp,'register.mjs'))),file=new File([new Uint8Array(1024*1024+1)],'case.pdf'),client='https://example.invalid/api/ccr/register/stage';
 const noWait=async()=>{},chunk=512*1024;
 function fixture(mode){const calls=new Map();globalThis.fetch=async(path,init)=>{
  const u=new URL(String(path),'https://example.invalid'),i=u.searchParams.get('part'),b=i===null?JSON.parse(init.body):{},k=i===null?(b.action==='seal'?'seal'+b.group:b.action):'p'+i,seen=(calls.get(k)||0)+1;calls.set(k,seen);
  if(mode==='start-bad'&&k==='start')return Response.json({error:'Gateway overloaded'},{status:503});
  if(k==='start')return Response.json({id:'stage-one',parts:3,chunkSize:chunk,partBytes:chunk,groupParts:2,partsPerGroup:2});
  if(mode==='transient'&&k==='p1'&&seen===1)return Response.json({error:'Please wait'},{status:429,headers:{'Retry-After':'120'}});
  if(mode==='transient'&&k==='p1'&&seen===2)throw Error('connection reset');
  if(mode==='transient'&&k==='p1'&&seen===3)return new Response('login page?',{status:200});
  if(mode==='transient'&&k==='seal1'&&seen===1)return Response.json({error:'Please retry'},{status:503,headers:{'Retry-After':new Date(Date.now()+6500).toUTCString()}});
  if(mode==='part-403'&&k==='p1')return Response.json({error:'No longer assigned'},{status:403});
  if(mode==='part-502'&&k==='p1')return Response.json({error:'Bad gateway'},{status:502});
  if(mode==='attach-lost'&&k==='attach')throw Error('ambiguous');
  return Response.json(i!==null?{part:Number(i)}:b.action==='seal'?{group:b.group}:{ok:true});
 };return calls;}
 for(const name of ['court','register']){
  const execute=(progress,wait=noWait)=>name==='court'?stageCourtOriginal(file,undefined,progress,wait):stageDocument(client,file,{id:'abc'},progress,wait);
  let c=fixture('transient'),delays=[],progress=[];await execute((done)=>progress.push(done),async ms=>delays.push(ms));assert.equal(c.get('p0'),1);assert.equal(c.get('p1'),4);assert.equal(c.get('p2'),1);assert.equal(c.get('seal1'),2);assert.equal(c.get('seal0'),1);assert.equal(c.get('start'),1);assert.equal(c.get('cancel'),undefined);assert.equal(c.get('attach'),name==='court'?undefined:1);assert.equal(progress.at(-1),file.size);assert.equal(new Set(progress).size,progress.length);assert.equal(delays[0],15000);assert.ok(delays.at(-1)>=5000&&delays.at(-1)<=6500);
  c=fixture('part-403');await assert.rejects(()=>execute(),/HTTP 403.*No longer assigned/);assert.equal(c.get('p1'),1);assert.equal(c.get('attach'),undefined);assert.equal(c.get('cancel'),1);
  c=fixture('part-502');await assert.rejects(()=>execute(),/HTTP 502.*Bad gateway/);assert.equal(c.get('p1'),4);assert.equal(c.get('p0'),1);assert.equal(c.get('start'),1);assert.equal(c.get('attach'),undefined);
  c=fixture('start-bad');await assert.rejects(()=>execute(),/HTTP 503/);assert.equal(c.get('start'),1);
 }
 const c=fixture('attach-lost');await assert.rejects(()=>stageDocument(client,file,{id:'rec'},undefined,noWait),/Connection lost/);assert.equal(c.get('attach'),1);assert.equal(c.get('cancel'),undefined);
});
