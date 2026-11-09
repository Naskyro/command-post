import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('exact cause returns a single authorized projected case without a detail read; ambiguous and inaccessible causes disclose no detail',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-case-')); t.after(()=>rm(dir,{recursive:true,force:true}));
 const outfile=join(dir,'test.cjs');await build({entryPoints:['lib/ccr/source-desk-lookup.ts'],bundle:true,platform:'node',format:'cjs',outfile});
 const {lookupDeskCase,assertDeskDocket,deskCaseView}=createRequire(import.meta.url)(outfile);
 const v={id:'real-session',person:'p',name:'Docket reader',access:[{module:'Compliance, Claims & Recovery',tab:'hearings',level:'View'}]};
 const source={id:'id-1',number:'C-1019',title:'First',courtName:'One',status:'Open',statements:[{text:'Court record'}],accountId:'actual-key',propertyLinkHistory:[{by:'hidden'}],counsel:[{attorney:'restricted'}],privateCounselFiles:['withheld']};
 let reads=0;const load=async actor=>{assert.equal(actor,v);reads++;return [source,{...source,id:'other',number:'C-3333'}]};
 const first=await lookupDeskCase(v,'C1019',load);assert.equal(reads,1);assert.equal(first.record.id,'id-1');assert.deepEqual(first.record,deskCaseView(source));assert.equal(first.record.accountId,'linked');for(const k of ['propertyLinkHistory','counsel','privateCounselFiles'])assert.equal(k in first.record,false);
 assert.equal((await lookupDeskCase(v,'C-9999',load)).record,undefined);
 const multi=await lookupDeskCase(v,'C-1019',async()=>[source,{...source,id:'id-2',courtName:'Two'}]);assert.equal(multi.rows.length,2);assert.equal('record' in multi,false);assert.ok(multi.rows.every(row=>!('statements' in row)&&!('accountId' in row)));
 for(const denied of [{...v,id:'preview:reader',owner:true},{...v,onboardingOnly:true},{...v,access:[]},{...v,person:''}]){assert.throws(()=>assertDeskDocket(denied));await assert.rejects(()=>lookupDeskCase(denied,source.number,()=>{assert.fail('denied viewer reached case storage')}));}
});
