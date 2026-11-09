import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

// Run the actual GET handler, including identity, HR scopes and the receipt SQL. Only
// gateway/roster/DB transport are fixtures. No live HTTP or personnel data are used.
test('signed policy receipts survive archival and their HR history is scoped to self or delegated personnel staff',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const name of ['0012_sop_catalog','0013_sop_version_storage','0014_sop_signatures'])db.exec(await readFile('drizzle/'+name+'.sql','utf8'));
 const dir=await mkdtemp(path.join(tmpdir(),'hr-sop-receipts-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const hr=[{module:'People & HR',tab:'hiring',level:'View'}];
 const person=(id,extras={})=>({id,kind:'person',status:'Active',name:id,email:id+'@fixture.test',role:'Employee',department:'Dispatch',accessMode:'Custom',access:hr,...extras});
 globalThis.hrSigRoster=[person('newhire',{status:'Onboarding',supervisor:'lead'}),person('lead',{hrResponsibilities:[{action:'viewPersonnel',scope:'Team'}]}),person('other'),person('former',{status:'Former',supervisor:'lead'}),person('blocked',{accountStatus:'Disabled'})];
 globalThis.hrSigDb={prepare(sql){return {bind(...args){return{all(){return {results:db.prepare(sql).all(...args)}}}}}}};
 const old={policyId:'OPS-017',title:'Original Wording',code:'OPS-017',version:1,signerName:'Original Employee Name',attestation:'I agree to revision 1.',signedAt:'2025-09-10T18:20:00.000Z',contentHash:'1'.repeat(64),personnelName:'Private Legal Name',accountId:'internal-private',personId:'newhire',revision:'1.0'};
 // Intentionally only v2 is current. v1's receipt must never be rebuilt from the currently published policy.
 const insert=db.prepare('INSERT INTO sop_signatures(id,person_id,policy_key,signed_at,receipt) VALUES(?,?,?,?,?)');
 for(const r of [old,{...old,version:2,title:'Revised Wording',signedAt:'2026-04-01T12:00:00.000Z',contentHash:'2'.repeat(64)}, {...old,personId:'other',title:'Coworker Private Title'}, {...old,personId:'former',title:'Separated Employee Receipt'}]){
  insert.run(r.personId+':'+r.version,r.personId,r.policyId+'|'+r.version,r.signedAt,JSON.stringify(r));
 }
 db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run('OPS-017|1','OPS-017','Archived',JSON.stringify({confidentialBody:'Private policy body'}));
 db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run('OPS-017|2','OPS-017','Published',JSON.stringify({title:'Latest Wording'}));
 const mocks=[[/^cloudflare:workers$/,'export const env={}'],[ /^next\/server$/,'export const NextResponse=Response'],[/^@\/lib\/finance\/server$/,'export const allRecords=async()=>globalThis.hrSigRoster'],[/^@\/db\/finance$/,'export const financeDb=()=>globalThis.hrSigDb']];
 const out=path.join(dir,'route.mjs');await build({entryPoints:['app/api/hr/sop-signatures/route.ts'],outfile:out,bundle:true,platform:'node',format:'esm',plugins:[{name:'fixture',setup(b){for(const [filter,contents] of mocks){b.onResolve({filter},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter,namespace:'stub'},()=>({contents}));}}}]});
 const {GET}=await import(pathToFileURL(out).href);
 const call=(who,target)=>GET({nextUrl:new URL('https://command.test/api/hr/sop-signatures?personId='+encodeURIComponent(target)),headers:new Headers(who?{'oai-authenticated-user-email':who+'@fixture.test'}:{})});
 for(const who of ['newhire','lead']){
  const response=await call(who,'newhire');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const {receipts}=await response.json();assert.deepEqual(receipts.map(r=>r.version),[2,1]);
  const {title,code,version,signerName,attestation,signedAt,contentHash}=old;
  assert.deepEqual(receipts[1],{title,code,version,signerName,attestation,signedAt,contentHash});assert.doesNotMatch(JSON.stringify(receipts),/Coworker Private Title|Private Legal Name|Private policy body|internal-private/);
 }
 for(const [who,target] of [['newhire','other'],['other','newhire'],['lead','other'],['former','former'],['blocked','blocked'],['other','missing']]){
  const response=await call(who,target);assert.equal(response.status,403,who+' -> '+target);assert(!('receipts' in await response.json()));
 }
 assert.equal((await call(null,'newhire')).status,401);assert.equal((await call('lead','former')).status,200);
});
