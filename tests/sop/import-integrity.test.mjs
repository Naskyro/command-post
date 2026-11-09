// The golden digest was computed from the individual files in the supplied archive,
// not from the deduplication implementation. No customer ZIP or database is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('source catalog preserves all 223 original PDFs, categories, sections, release gates and internal references',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'command-sop-import-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const outfile=path.join(dir,'seed.mjs');await build({entryPoints:['lib/sop/imported.ts'],outfile,bundle:true,format:'esm',platform:'node'});
 const {originalPdf,importedPolicies,importedTopics}=await import(pathToFileURL(outfile).href);
 const records=importedPolicies.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 assert.equal(records.length,223);const ids=new Set(records.map(x=>x.id));assert.equal(ids.size,223);
 const countBy=f=>Object.fromEntries([...new Set(records.map(f))].map(k=>[k,records.filter(x=>f(x)===k).length]));
 assert.deepEqual(countBy(x=>x.sourceStatus),{'Completed - Issue Review':95,'Needs Guidance - Not Issued':128});
 const categories=countBy(x=>x.topicId);
 assert.deepEqual(categories,{'ALL':31,'AUC':8,'CCR':4,'DSP':17,'FIN':18,'HR-CA':43,'MGT':21,'MKT':15,'OPS':20,'PPI':19,'RDS':11,'TOW':16});
 assert.deepEqual(importedTopics.map(t=>t.id).sort(),Object.keys(categories).sort());
 let inventory='';
 for(const row of records){
   const bytes=originalPdf(row.id);assert(bytes instanceof Uint8Array,row.id);inventory+=row.id+' '+hash(bytes)+'\n';
   assert.equal(row.content.sections[0].heading,'Purpose',row.id);
   for(const s of row.content.sections)assert(s.text.trim().length>0,row.id+' '+s.heading);
   for(const other of row.content.relatedIds)assert(other!==row.id&&ids.has(other),row.id+' '+other);
 }
 assert.equal(hash(inventory),'319343c234a3a82ceb6e82e2aa599978a1a0c0299e2ef9e0d66f3535fa1d4752');
 assert.equal(originalPdf('not-present'),null);assert.equal(originalPdf('__proto__'),null);
});
