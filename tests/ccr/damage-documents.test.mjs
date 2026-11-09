import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {planAssignment} from '../../lib/hr/assignments.ts';
import {damageFacts} from '../../lib/ccr/damage-facts.ts';
const day='2026-11-01',when=day+'T15:00:00Z',stage='At the Courthouse Before the Hearing';
test('asset settlement and officer details are attributed without changing pay or inventing a judgment',()=>{
 const c={id:'hrassetclaim:1',kind:'assetClaim',personId:'worker',version:1,createdAt:when,createdBy:'Reporter',data:{financialAction:'No Liability or Payroll Deduction Authorized',lawAgency:'APD',lawOfficer:'One',statements:[]}};
 const v={id:'v',person:'p',name:'Case Editor',owner:true},p=[{kind:'person',id:'worker',status:'Former'}],d={status:'Resolved',statement:'Settlement agreement filed.',settlementDate:day,settlementStage:stage,lawReportNumber:'TEST-12',lawOfficer:'Two'};
 const result=planAssignment({action:'claimUpdate',version:1,id:c.id,data:d},v,p,[c],when)[0];assert.equal(result.data.lawAgency,'APD');assert.equal(result.data.lawOfficer,'Two');assert.equal(result.data.financialAction,c.data.financialAction);assert.equal(result.data.statements[0].settlementStage,stage);assert.equal(result.data.statements[0].at,when);assert.equal(result.data.statements[0].by,'Case Editor');assert.equal(result.data.paidAmount,undefined);
 assert.throws(()=>damageFacts({...d,settlementDate:'2026-11-02'},{},day),/settlement date/);assert.throws(()=>damageFacts({...d,settlementDate:''},{},day),/both/);
 assert.throws(()=>planAssignment({action:'claimUpdate',version:1,id:c.id,data:d},{...v,owner:false,access:[{module:'Compliance, Claims & Recovery',tab:'damage',level:'View'}]},p,[c],when),/access|permission|authorized|permitted/i);
});
test('typed upload on a closed property claim appends evidence, keeps the decision intact, and rejects files for another property',async t=>{
 const tmp=await mkdtemp(join(tmpdir(),'damage-docs-'));t.after(async()=>{delete globalThis.damageFixture;await rm(tmp,{recursive:true,force:true});});
 const account={kind:'account',id:'a',name:'Example Asset',version:1,assignee:'am'},claim={kind:'claim',id:'claim',name:'Test Claim',version:1,status:'Paid',accountId:'a'},all=[account,claim,{...account,id:'z'}],bucket=new Map(),v={id:'am',person:'am',name:'Case Editor',role:'Employee',owner:false,department:'Account Managers',access:[{module:'Compliance, Claims & Recovery',tab:'damage',level:'Edit'}]};
 globalThis.damageFixture={v,all,db:{async put(k,b){bucket.set(k,b)},async delete(k){bucket.delete(k)}}};
 const stubs=new Map([['@/lib/ccr/document-stage-server','export const handleDocumentStage=()=>{throw Error()}'],['next/server','export const NextResponse={json:Response.json};'],['@/lib/accounts/server',`const f=globalThis.damageFixture;export const context=async()=>({viewer:f.v,all:f.all,staff:[]});export async function writeMany(changes){const rows=changes.map(c=>({...c.next,authorId:f.v.person,version:1}));f.all.push(...rows);return rows}export function fileBytes(){throw Error()} export const fileTargetRows=()=>[];`],['@/db/finance','export const financeFiles=()=>globalThis.damageFixture.db;'],['@/lib/hr/server','export const encryptBytes=async (b)=>new Uint8Array([...b].map(v=>v^65));']]);
 const out=join(tmp,'file.mjs');await build({entryPoints:['app/api/accounts/files/route.ts'],bundle:true,platform:'node',format:'esm',outfile:out,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>stubs.has(a.path)?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs.get(a.path),loader:'js'}));}}]});
 const api=await import(pathToFileURL(out));
 async function upload(type='Settlement Agreement and Release',a='a',other='',id='test-id'){
  const form=new FormData();for(const [k,x]of Object.entries({category:'Claim evidence',claimId:'claim',accountId:a,id,documentType:type,otherDocumentType:other}))form.set(k,x);form.set('file',new File(['%PDF-1.5\nExample\n%%EOF'],'proof.pdf',{type:'application/pdf'}));
  const req=new Request('https://fixture.test/api/accounts/files',{method:'POST',body:form});Object.defineProperty(req,'nextUrl',{value:new URL(req.url)});return api.POST(req);
 }
 assert.equal((await upload('Other')).status,400);assert.equal((await upload('zz')).status,400);assert.equal((await upload('Repair Estimate','z')).status,403);assert.equal(bucket.size,0);
 const ok=await upload();assert.equal(ok.status,200);const record=(await ok.json()).records[0];assert.equal(record.documentType,'Settlement Agreement and Release');assert.equal(record.claimId,claim.id);assert.equal(record.uploadedBy,v.name);assert.match(record.sha256,/^[\da-f]{64}$/);assert.equal(record.encryptedEvidence,true);assert.equal(claim.status,'Paid');assert.equal(claim.version,1);assert.equal(bucket.size,1);
 assert.equal((await upload()).status,200);assert.equal(bucket.size,1);assert.equal((await upload('Repair Estimate')).status,409);
 v.access[0].level='View';assert.equal((await upload('Repair Estimate','a','','different-upload')).status,403);assert.equal(bucket.size,1);
});
