import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
test('an unknown bulk commit reads its receipt without replaying writes; a verified PDF count survives cold starts without persisting a name, text or file',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'court-bulk-'));t.after(async()=>{delete globalThis.fileBatch;await rm(dir,{recursive:true,force:true});});
 const g=globalThis.fileBatch={store:new Map(),calls:[],async req(url,b){g.calls.push([b.action,b.records.length]);if(b.action==='import')throw Error('unreadable');if(b.action==='receipt'&&g.calls.filter(c=>c[0]==='receipt').length===1)throw Error('Connection lost');return {results:b.records.map(()=>({status:'confirmed'}))};}};
 const stubs=new Map([['@/lib/shared/client','export const requestJson=(...args)=>globalThis.fileBatch.req(...args)'],['@/db/finance',`export const financeFiles=()=>({get:async k=>{const v=globalThis.fileBatch.store.get(k);return v?{text:async()=>v}:null},put:async(k,v)=>globalThis.fileBatch.store.set(k,v)})`]]);
 await build({entryPoints:['lib/ccr/court-batch-client.ts','lib/ccr/court-page-metrics.ts'],outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',plugins:[{name:'m',setup(b){b.onResolve({filter:/.*/},x=>stubs.has(x.path)?{path:x.path,namespace:'m'}:undefined);b.onLoad({filter:/.*/,namespace:'m'},x=>({contents:stubs.get(x.path)}))}}]});
 const {fileCourtGroups}=await import(pathToFileURL(join(dir,'court-batch-client.mjs'))),file=pathToFileURL(join(dir,'court-page-metrics.mjs')),m=await import(file),m2=await import(file+'?fresh-instance');
 const out=[];await fileCourtGroups('/native','import',[1,2,3,4,5],()=>{},(i,r)=>out.push([i,r.status]),(i,reason)=>({status:'review',reason}));assert.deepEqual(out,[[1,'confirmed'],[2,'confirmed'],[3,'confirmed'],[4,'confirmed'],[5,'confirmed']]);assert.deepEqual(g.calls.map(c=>c[0]),['import','receipt','receipt','import','receipt']);assert.deepEqual(g.calls.filter(c=>c[0]==='import').map(c=>c[1]),[4,1]);
 const h='a'.repeat(64);let parsed=0;assert.equal(await m.verifiedPdfPages(h,123,async()=>{parsed++;return 8}),8);assert.equal(await m2.verifiedPdfPages(h,123,async()=>{throw Error('cached')}),8);assert.deepEqual([...g.store.values()],['8']);assert.equal(parsed,1);await assert.rejects(()=>m2.verifiedPdfPages(h,222,async()=>{throw Error('changed byte count');}),/changed byte count/);
});
