import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const require=createRequire(resolve('package.json')),{build}=require('esbuild'),tmp=await mkdtemp(join(tmpdir(),'accident-reports-')),sql=new DatabaseSync(':memory:');
sql.exec(await readFile('drizzle/0028_ccr_damage_intake.sql','utf8'));
sql.exec('CREATE TABLE hr_records(kind TEXT NOT NULL,payload TEXT NOT NULL)');
const db={prepare(statement){let args=[];return {bind(...v){args=v;return this;},async all(){return {results:sql.prepare(statement).all(...args)};},async first(){return sql.prepare(statement).get(...args)||null;},async run(){return {meta:{changes:sql.prepare(statement).run(...args).changes}};}};},async batch(items){sql.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const objects=new Map(),bucket={async put(k,b){objects.set(k,Uint8Array.from(b));},async get(k){return objects.has(k)?{arrayBuffer:async()=>objects.get(k).slice().buffer}:null;},async delete(k){objects.delete(k);}};
const people=[{id:'driver-one',kind:'person',name:'One Driver',status:'Active',department:'Drivers',supervisor:'supervisor',version:1},{id:'driver-two',kind:'person',name:'Two Driver',status:'Active',department:'Other',version:1},{id:'former-driver',kind:'person',name:'Former Driver',status:'Former',department:'Drivers',supervisor:'supervisor',version:1},{id:'supervisor',kind:'person',name:'Supervisor',status:'Active',department:'Drivers',version:1},{id:'owner',kind:'person',name:'Owner',status:'Active',version:1}];
const base={access:[],owner:false,onboardingOnly:false};
const roles={owner:{...base,id:'owner-auth',person:'owner',name:'Owner',owner:true},driver:{...base,id:'driver-auth',person:'driver-one',name:'One Driver'},other:{...base,id:'other-auth',person:'driver-two',name:'Two Driver'},ordinary:{...base,id:'general-hr-auth',person:'supervisor',name:'Supervisor',access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:[{action:'managePersonnel',scope:'Company'}]},reviewer:{...base,id:'reviewer-auth',person:'supervisor',name:'Supervisor',department:'Drivers',access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:[{action:'manageMedicalReports',scope:'Team'}]},claims:{...base,id:'claims-auth',person:'claims-user',name:'Claims User',access:[{module:'Compliance, Claims & Recovery',tab:'damage',level:'Edit'}]}};
const claims=[{id:'first',kind:'claim',name:'First Incident',driverId:'driver-one',accidentInvolved:'Yes',accidentOn:'2026-07-01',driverInjury:'No'},{id:'second',kind:'claim',name:'Second Incident',driverId:'driver-two',accidentInvolved:'Yes',accidentOn:'2026-07-02',driverInjury:'Yes'},{id:'former',kind:'claim',name:'Former Incident',driverId:'former-driver',accidentInvolved:'Yes',accidentOn:'2026-07-03',driverInjury:'Yes'}];
globalThis.medicalTest={db,bucket,people,roles,claims,key:Buffer.alloc(32,9).toString('base64')};
const mocks=new Map([['@/db/finance','export const financeDb=()=>globalThis.medicalTest.db,financeFiles=()=>globalThis.medicalTest.bucket'],['cloudflare:workers','export const env={get HR_DATA_ENCRYPTION_KEY(){return globalThis.medicalTest.key}}'],['@/lib/finance/server','export const requestRoster=async()=>globalThis.medicalTest.people,allRecords=async()=>globalThis.medicalTest.people,requestViewer=async h=>globalThis.medicalTest.roles[h.get("role")]'],['@/lib/finance/identity','export const financeIdentity=h=>globalThis.medicalTest.roles[h.get("role")],verifiedOwnerRecord=()=>true'],['@/lib/accounts/server','export const yearCaseRows=async()=>globalThis.medicalTest.claims'],['next/server','export const NextResponse={json:Response.json}']]);
try{
await build({bundle:true,format:'esm',platform:'node',outdir:tmp,outExtension:{'.js':'.mjs'},entryPoints:{model:'lib/hr/accident-reports.ts',methods:'lib/hr/accident-reports-server.ts',crypto:'lib/hr/server.ts',route:'app/api/hr/accident-reports/route.ts',files:'app/api/hr/accident-reports/files/route.ts',print:'app/api/hr/accident-reports/print/route.ts'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks.has(a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks.get(a.path)}));}}]});
const [m,core,crypt,route,files,print]=await Promise.all(['methods','model','crypto','route','files','print'].map(x=>import(pathToFileURL(join(tmp,x+'.mjs')))));
function req(path,role='driver',body,origin='https://example.test'){const url=new URL('https://example.test'+path),r=new Request(url,{headers:{role,...(body?{origin,'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});Object.defineProperty(r,'nextUrl',{value:url});return r;}
const input={claimKey:'claim:first',driverId:'driver-one'};
const response=(more={})=>({kind:'Initial report',reportedOn:'2026-07-01',response:'No issues to report at this time',statement:'',source:'Driver statement',...more});
let id,initial,initialHash;
await test('medical permission is separate from ordinary claims/personnel access and is scoped to the driver',async()=>{
 assert.equal((await m.medicalCaseList(roles.driver,people)).length,1);assert.equal((await m.medicalCaseList(roles.reviewer,people)).length,2);
 assert.equal((await m.medicalCaseList(roles.claims,people)).length,0);assert.equal((await m.medicalCaseList(roles.ordinary,people)).length,0);
 await assert.rejects(()=>m.medicalCaseView(roles.other,people,input),e=>e.status===403);
 await assert.rejects(()=>m.medicalCaseView({...roles.owner,id:'preview:owner'},people,input),e=>e.status===403);
 await assert.rejects(()=>m.medicalCaseView(roles.reviewer,people,{claimKey:'claim:second',driverId:'driver-two'}),e=>e.status===403);
});
await test('first request initializes protected storage and schedules all three check-ins without inventing a response',async()=>{
 const view=await m.medicalCaseView(roles.driver,people,input);id=view.record.id;
 assert.equal(view.record.version,0);assert.equal(view.record.reports.length,0);assert.deepEqual(view.schedule.map(x=>x.dueOn),['2026-07-08','2026-07-15','2026-07-22']);assert(view.schedule.every(x=>x.status==='Overdue'));
 assert.equal(core.medicalDueOn('2026-10-30',1),'2026-11-06');
});
await test('neutral reports require an explicit response and observations cannot invent no issues',async()=>{
 const record=(await m.medicalCaseView(roles.driver,people,input)).record;
 assert.throws(()=>core.prepareMedicalReport({...response(),response:''},record,roles.driver,people),e=>e.status===400);
 assert.throws(()=>core.prepareMedicalReport(response({source:'Supervisor observation'}),record,roles.reviewer,people),/Only the driver/);
 assert.throws(()=>core.prepareMedicalReport(response({kind:'Weekly check-in',week:1,reportedOn:'2026-07-02'}),record,roles.driver,people),/on or after/);
 assert.throws(()=>core.prepareMedicalReport(response({kind:'Weekly check-in',week:'1',reportedOn:'2026-07-08'}),record,roles.driver,people),/scheduled week/);
});
await test('a supervisor can prepare an unsigned report; the exact statement is encrypted and preserved',async()=>{
 await m.mutateMedicalCase(roles.reviewer,people,{...input,version:0,action:'submit',data:response()});
 const view=await m.medicalCaseView(roles.driver,people,input);initial=view.record.reports[0];initialHash=initial.reportHash;
 assert.equal(initial.preparedBy.actorId,'reviewer-auth');assert.equal(initial.signatureStatus,'Awaiting driver review');assert(!initial.signature);
 assert.equal(createHash('sha256').update(core.medicalReportContent(initial)).digest('hex'),initialHash);
 const stored=sql.prepare('SELECT payload FROM hr_accident_medical_versions').get().payload;assert.match(stored,/^v1:/);assert.doesNotMatch(stored,/One Driver|No issues|First Incident/);
});
await test('electronic signing requires the authenticated driver, affirmative consent, the exact hash and current version',async()=>{
 const data={signatureName:'One Driver',consent:true,reportHash:initialHash},body={caseId:id,version:1,reportId:initial.id,action:'sign',data};
 await assert.rejects(()=>m.mutateMedicalCase(roles.owner,people,body),e=>e.status===403);
 await assert.rejects(()=>m.mutateMedicalCase(roles.driver,people,{...body,data:{...data,consent:false}}),e=>e.status===400);
 await assert.rejects(()=>m.mutateMedicalCase(roles.driver,people,{...body,data:{...data,reportHash:'0'.repeat(64)}}),e=>e.status===409);
 await m.mutateMedicalCase(roles.driver,people,body);
 await assert.rejects(()=>m.mutateMedicalCase(roles.driver,people,body),e=>e.status===409);
 const current=(await m.medicalCaseView(roles.driver,people,{caseId:id})).record.reports[0];assert.equal(current.signature.signerId,'driver-one');assert.equal(current.signature.method,'Electronic');assert.equal(current.reportHash,initialHash);assert.equal(current.response,initial.response);assert.match(current.signature.acknowledgment,/does not waive/);
});
await test('late symptom reports append without changing the original no-issues statement or prior signature',async()=>{
 await m.mutateMedicalCase(roles.driver,people,{caseId:id,version:2,action:'submit',data:response({kind:'Additional update',reportedOn:'2026-10-15',response:'Update to report',statement:'My shoulder started bothering me this week.',firstNoticedOn:'2026-10-12',assistance:'Please contact me privately.'})});
 const {record}=await m.medicalCaseView(roles.driver,people,{caseId:id});assert.equal(record.reports.length,2);assert.equal(record.reports[0].reportHash,initialHash);assert.equal(record.reports[0].signature.signerId,'driver-one');assert.equal(record.reports[1].reportedOn,'2026-10-15');assert.equal(record.reports[1].signatureStatus,'Awaiting driver review');assert.equal(sql.prepare('SELECT COUNT(*) n FROM hr_accident_medical_versions WHERE id=?').get(id).n,3);
});
await test('no response is a contact outcome, never a completed/no-issues check-in',async()=>{
 await m.mutateMedicalCase(roles.reviewer,people,{caseId:id,version:3,action:'contact',data:{week:1,status:'No response',note:'Called the number on file; no answer.'}});
 const view=await m.medicalCaseView(roles.driver,people,{caseId:id});assert.equal(view.schedule[0].status,'No response');assert.equal(view.record.reports.length,2);
 await assert.rejects(()=>m.mutateMedicalCase(roles.driver,people,{caseId:id,version:4,action:'contact',data:{week:2,status:'No response',note:'No answer'}}),e=>e.status===403);
});
await test('correcting an accident date reschedules check-ins while preserving signed incident snapshots',async()=>{
 claims[0].accidentOn='2026-07-04';const view=await m.medicalCaseView(roles.driver,people,{caseId:id});assert.equal(view.record.accidentOn,'2026-07-04');assert.equal(view.record.reports[0].accidentOn,'2026-07-01');assert.equal(view.record.reports[0].reportHash,initialHash);assert.equal(view.schedule[0].dueOn,'2026-07-11');assert.equal(view.schedule[0].status,'Overdue');assert.deepEqual(view.record.previousAccidentDates,['2026-07-01']);
 claims[0].accidentOn='2026-07-01';
});
await test('changing the operational driver cannot expose original medical reports to the newly linked driver',async()=>{
 claims[0].driverId='driver-two';const other=await m.medicalCaseView(roles.other,people,{claimKey:'claim:first',driverId:'driver-two'});assert.notEqual(other.record.id,id);assert.equal(other.record.reports.length,0);
 await assert.rejects(()=>m.medicalCaseView(roles.other,people,{caseId:id}),e=>e.status===403);assert.equal((await m.medicalCaseView(roles.driver,people,{caseId:id})).record.reports.length,2);
 claims[0].driverId='driver-one';
});
await test('former-driver paper signing needs an actual protected copy; only designated reviewers can attach and read it',async()=>{
 const dst={claimKey:'claim:former',driverId:'former-driver'};await m.mutateMedicalCase(roles.reviewer,people,{...dst,version:0,action:'submit',data:response({reportedOn:'2026-10-16',response:'Update to report',statement:'The driver reports discomfort and requests follow-up.'})});
 const view=await m.medicalCaseView(roles.reviewer,people,dst),r=view.record.reports[0],bytes=new TextEncoder().encode('%PDF-1.7\nSigned paper fixture\n%%EOF');
 const fields={caseId:view.record.id,version:'1',reportId:r.id,reportHash:r.reportHash,signatureName:'Former Driver',signedOn:core.medicalToday(),confirmed:'true'},file={bytes,name:'Signed-Driver-Report.pdf',type:'application/pdf'};
 await assert.rejects(()=>m.attachMedicalPaper(roles.ordinary,people,fields,file),e=>e.status===403);
 await assert.rejects(()=>m.attachMedicalPaper(roles.reviewer,people,{...fields,confirmed:'false'},file),e=>e.status===400);
 await m.attachMedicalPaper(roles.reviewer,people,fields,file);const signed=await m.readMedicalPaper(roles.reviewer,people,view.record.id,r.id);assert.deepEqual(signed.bytes,bytes);assert.equal(objects.size,1);assert.notEqual(Buffer.from([...objects.values()][0]).subarray(0,5).toString(),'%PDF-');
 await assert.rejects(()=>m.readMedicalPaper(roles.driver,people,view.record.id,r.id),e=>e.status===403);
 const current=(await m.medicalCaseView(roles.owner,people,{caseId:view.record.id})).record;assert.equal(current.reports[0].signature.signerId,'former-driver');assert.equal(current.reports[0].signature.recordedBy.personId,'supervisor');assert.equal(current.reports[0].signature.method,'Paper');
});
await test('report and original-download endpoints enforce access, same origin and private responses',async()=>{
 const denied=await route.GET(req('/api/hr/accident-reports?caseId='+id,'other'));assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/shoulder|No issues/);
 assert.equal((await route.POST(req('/api/hr/accident-reports','driver',{caseId:id,version:4,action:'submit',data:response()},'https://wrong.test'))).status,403);
 const good=await route.GET(req('/api/hr/accident-reports?caseId='+id));assert.equal(good.status,200);assert.match(good.headers.get('cache-control'),/no-store/);
 const pdf=await print.GET(req('/api/hr/accident-reports/print?caseId='+id+'&reportId='+initial.id));assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 assert.equal((await print.GET(req('/api/hr/accident-reports/print?caseId='+id+'&reportId='+initial.id,'other'))).status,403);
 assert.equal((await files.GET(req('/api/hr/accident-reports/files?caseId='+id+'&reportId='+initial.id,'other'))).status,403);
 assert(sql.prepare('SELECT COUNT(*) n FROM hr_accident_medical_access').get().n>0);
});
await test('weekly completion requires an actual report and signature, and unsigned corrections remain append-only',async()=>{
 await m.mutateMedicalCase(roles.driver,people,{caseId:id,version:4,action:'submit',data:response({kind:'Weekly check-in',week:2,reportedOn:'2026-07-15'})});
 let view=await m.medicalCaseView(roles.driver,people,{caseId:id});assert.equal(view.schedule[1].status,'Awaiting signature');const r=view.record.reports.at(-1);
 await m.mutateMedicalCase(roles.driver,people,{caseId:id,version:5,reportId:r.id,action:'disposition',data:{status:'Declined to sign',note:'I want to submit a corrected statement first.'}});
 view=await m.medicalCaseView(roles.driver,people,{caseId:id});assert.equal(view.record.reports.at(-1).signatureStatus,'Declined to sign');assert.equal(view.schedule[1].status,'Awaiting signature');assert.equal(view.record.reports.at(-1).reportHash,r.reportHash);
 await m.mutateMedicalCase(roles.driver,people,{caseId:id,version:6,reportId:r.id,action:'sign',data:{signatureName:'One Driver',consent:true,reportHash:r.reportHash}});
 view=await m.medicalCaseView(roles.driver,people,{caseId:id});assert.equal(view.schedule[1].status,'Completed');assert.equal(view.record.reports.at(-1).dispositions.length,1);
});
}finally{delete globalThis.medicalTest;sql.close();await rm(tmp,{recursive:true,force:true});}
