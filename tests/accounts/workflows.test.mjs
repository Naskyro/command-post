import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const temporary=await mkdtemp(join(tmpdir(),'account-workflows-'));
const bundle=join(temporary,'logic.mjs');
await build({stdin:{contents:"export * from './lib/safety/server'; export * from './lib/safety/model'; export * from './lib/accounts/field-rules'; export * from './lib/shared/save-feedback'; export * from './lib/accounts/model'; export * from './lib/accounts/policy'; export * from './lib/accounts/releases'; export * from './lib/accounts/server'; export * from './lib/accounts/onboarding'; export * from './lib/accounts/dashboard'; export * from './lib/accounts/profile-summary'; export * from './lib/sales/server'; export * from './lib/sales/model'; export * from './lib/accounts/dispatch-notes'; export * from './lib/shared/notifications';",resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'database-fixture',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=new Proxy({}, {get:(_,key)=>globalThis.accountTestBindings[key]});',loader:'js'}));}}]});
const api=await import(pathToFileURL(bundle));
const db=new DatabaseSync(':memory:');
for(const file of ['drizzle/0005_perfect_blue_marvel.sql'])db.exec(await readFile(file,'utf8'));
db.exec('CREATE TABLE finance_records(id TEXT PRIMARY KEY, kind TEXT, payload TEXT, version INTEGER, updated_by TEXT, updated_at TEXT); CREATE TABLE finance_audit(id TEXT PRIMARY KEY,record_id TEXT,actor TEXT,actor_id TEXT,at TEXT,reason TEXT,before TEXT,after TEXT);');
const binding={prepare(sql){return {sql,args:[],bind(...args){return {...this,args};},async all(){return {results:db.prepare(this.sql).all(...this.args)};},async first(){return db.prepare(this.sql).get(...this.args)||null;},async run(){return {meta:db.prepare(this.sql).run(...this.args)};}};},async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>({meta:db.prepare(s.sql).run(...s.args)}));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
globalThis.accountTestBindings={DB:binding};
after(async()=>{db.close();await rm(temporary,{recursive:true,force:true});});
const row=(kind,id,extra={})=>({id,kind,version:0,name:id,...extra});
const account=row('account','test-property',{assignee:'am',status:'Active',companyId:'company'});
const company=row('company','company'),pm=row('contact','pm',{name:'Property Manager'}),tenure=row('affiliation','tenure',{contactId:'pm',accountId:account.id,role:'Property Manager',startDate:'2025-01-01'}),evidence=row('file','request',{accountId:account.id,category:'Release request'});
const am={id:'user-am',person:'am',name:'Assigned Manager',email:'am@example.com',role:'Employee',department:'Account Managers',owner:false,canManage:false,canRelease:false};
const head={...am,id:'user-alex',person:'alex',name:'Alex',role:'Department Head'};
const dispatcher={...am,id:'user-dispatch',person:'dispatch',name:'Dispatcher',department:'Dispatch'};
const staff=[am,head,dispatcher].map(v=>row('person',v.person,{name:v.name,status:'Active',role:v.role,department:v.department}));

test('new properties persist as pending with a launch checklist and stay out of working portfolios',async()=>{
 const template=row('playbook','pending-template',{name:'Confirm signage',type:'Onboarding',phase:'Before activation',required:true,status:'Current'});
 const created=await api.save({record:{id:'pending-property-test',kind:'account',version:0,name:'New property',assignee:am.person}},{all:[template],viewer:am,staff});
 const pending=created.find(r=>r.kind==='account');
 assert.equal(pending.status,'Onboarding');assert(pending.onboardingStartedAt);
 assert.equal(created.find(r=>r.kind==='task').required,true);
 const durable=await api.records();assert(durable.some(r=>r.id===pending.id&&r.name==='New property'));
 assert.equal(api.portfolio([pending,account],am.person).length,1);
 assert(!api.projection([...created,account],dispatcher,'dispatch').some(r=>r.id===pending.id||r.accountId===pending.id));
 const [updated]=await api.save({record:{id:pending.id,kind:'account',version:pending.version,name:pending.name,address:'100 Main St'}},{all:created,viewer:am,staff});
 assert.equal(updated.status,'Onboarding');assert.equal(updated.address,'100 Main St');
 assert((await api.records()).some(r=>r.id===updated.id&&r.address==='100 Main St'));
});

test('activation requires every onboarding section and cannot be bypassed with a decision exception',async()=>{
 const pending=row('account','pending-guard',{assignee:am.person,status:'Onboarding',onboardingStartedAt:'2026-09-01'});
 const ctx={all:[pending],viewer:am,staff};
 await assert.rejects(()=>api.save({action:'activateOnboarding',accountId:pending.id,accountVersion:0},ctx),/Finish onboarding/);
 await assert.rejects(()=>api.save({record:{id:'bypass-pending',kind:'decision',version:0,name:'Bypass',accountId:pending.id,type:'Activate',date:api.today(),effectiveDate:api.today(),reason:'Test',exception:true},accountVersion:0},ctx),/Finish the pending property/);
 assert.equal(api.onboardingReadiness(pending,[pending]).ready,false);
});

test('property contact saves atomically and keeps work numbers on the matching affiliation',async()=>{
 const [pending]=await api.save({record:{id:'pending-contact-test',kind:'account',version:0,name:'Contact property',assignee:am.person}},{all:[],viewer:am,staff});
 const saved=await api.save({action:'onboardingContact',accountId:pending.id,accountVersion:pending.version,affiliationVersion:0,name:'Test manager',role:'Property Manager',workPhone:'512-555-0100',workEmail:'manager@example.com'},{all:[pending],viewer:am,staff});
 const contact=saved.find(r=>r.kind==='contact'),affiliation=saved.find(r=>r.kind==='affiliation'),updated=saved.find(r=>r.kind==='account');
 assert.equal(updated.primaryContactId,contact.id);assert.equal(affiliation.workPhone,'512-555-0100');assert.equal(affiliation.accountId,pending.id);assert.equal(contact.personalPhone,undefined);assert.equal(contact.phone,undefined);
 const all=await api.records();assert(all.some(r=>r.id===affiliation.id&&r.workEmail==='manager@example.com'));
 await assert.rejects(()=>api.save({action:'onboardingContact',accountId:pending.id,accountVersion:pending.version,affiliationVersion:0,contactId:contact.id,role:'Property Manager'}, {all,viewer:am,staff}),e=>e.status===409);
});

test('complete onboarding activates the same property and records the service decision',async()=>{
 const [pending]=await api.save({record:{id:'ready-pending-test',kind:'account',version:0,name:'Ready property',assignee:am.person,address:'100 Main St',propertyType:'Residential',service:'Full Patrol',instructions:'Follow the agreed patrol plan',launchDate:api.today(),agreementVerified:true}},{all:[],viewer:am,staff});
 const contact=row('contact','ready-contact',{email:'manager@example.com'}),affiliation=row('affiliation','ready-aff',{accountId:pending.id,contactId:contact.id,role:'Property Manager'});
 const ready={...pending,primaryContactId:contact.id};
 const evidence=[row('file','ready-photo',{accountId:pending.id,category:'Account photo',status:'Current',storageKey:'test-photo'}),row('file','ready-agreement',{accountId:pending.id,category:'Agreement',status:'Current',storageKey:'test-agreement'})];
 const task=row('task','ready-required',{accountId:pending.id,type:'Onboarding',required:true,status:'Completed',resolution:'Confirmed'});
 const all=[ready,contact,affiliation,...evidence,task];
 assert.equal(api.onboardingReadiness(ready,all).percent,100);
 assert.equal(api.onboardingReadiness(ready,[...all.filter(r=>r.id!==task.id),{...task,status:'Cancelled'}]).ready,false);
 assert.equal(api.onboardingReadiness({...ready,launchDate:'2099-01-01'},all).ready,false);
 await assert.rejects(()=>api.save({action:'activateOnboarding',accountId:ready.id,accountVersion:0},{all,viewer:am,staff}),e=>e.status===409);
 const saved=await api.save({action:'activateOnboarding',accountId:ready.id,accountVersion:ready.version},{all,viewer:am,staff});
 const active=saved.find(r=>r.kind==='account');assert.equal(active.id,pending.id);assert.equal(active.status,'Active');assert(active.onboardingCompletedAt);
 assert(saved.some(r=>r.kind==='decision'&&r.type==='Activate'&&r.accountId===pending.id));
 assert((await api.records()).some(r=>r.id===active.id&&r.status==='Active'));
});
const fixture=[account,company,pm,tenure,evidence];
const release=(id,extra={})=>row('courtesy',id,{accountId:account.id,vehicle:'2019 Toyota Corolla',date:'2026-05-10',vin:'1HGCM82633A004352',category:'Leasing office clerical error',releaseType:'Full courtesy',reason:'Office entered the wrong plate.',errorType:'Wrong plate',originalCharges:300,amountCharged:0,managerAffiliationId:'tenure',requestEvidenceId:'request',responsibilityAcknowledged:true,historyReviewed:true,...extra});
const payload=r=>Object.fromEntries(['id','kind','version','name','accountId',...api.forms[r.kind].map(f=>f.key)].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
const prepare=(r,old,v=am,all=fixture,action='approveRelease')=>api.prepareRelease(payload(r),old,v,all,staff,action);
const context=(all,viewer=am)=>({all,viewer,staff});

test('assigned AM approves within policy without owner or finance release privileges',()=>{const r=release('approve',{status:'Pending review'});const result=prepare(r,r);assert.equal(result.next.status,'Approved');assert.equal(result.next.amountWaived,300);assert.equal(result.next.approvedById,'am');assert.equal(result.next.policyOccurrence,1);assert.equal(result.serialize,true);});
test('dispatcher can submit but cannot approve or change approved dollar amounts',()=>{const r=release('dispatch');const pending=prepare(r,undefined,dispatcher,fixture,'submitRelease').next;assert.equal(pending.status,'Pending review');assert.throws(()=>prepare(pending,pending,dispatcher),/assigned Account Manager/);const approved={...pending,status:'Approved'};assert.throws(()=>prepare({...approved,amountCharged:25,correctionReason:'Adjustment'},approved,dispatcher,fixture,'save'),/corrected request/);});
test('courtesy corrections never silently bypass a completed policy review',()=>{const r=release('correction',{status:'Released'});assert.throws(()=>prepare({...r,amountCharged:20,correctionReason:'Wrong figure'},r,head,fixture,'save'),/new policy review/);});
test('second clerical event allows fifty percent and third none; head exceptions are documented',()=>{const old=release('prior',{status:'Released'}),r=release('repeat',{status:'Pending review'});assert.throws(()=>prepare(r,r,am,[...fixture,old]),/Department Head/);assert.equal(prepare({...r,amountCharged:150,releaseType:'Reduced charge'},r,am,[...fixture,old]).next.policyOccurrence,2);assert.equal(api.assessment(r,[old,{...old,id:'another'}]).maxPercent,0);assert.equal(prepare({...r,exceptionReason:'Documented relationship preservation exception'},r,head,[...fixture,old]).next.status,'Approved');});
test('staff repeat allowance follows the person across different vehicles and properties',()=>{const r=release('staff',{category:'Property staff vehicle',subjectContactId:'resident'}),prior={...r,id:'past',accountId:'other-property',vehicle:'Different vehicle',status:'Released'};assert.equal(api.assessment(r,[prior]).maxPercent,50);assert.equal(api.assessment({...r,subjectContactId:'another-person'},[prior]).maxPercent,100);});
test('new move-in registration and staff personal visits have distinct limits',()=>{assert.equal(api.assessment(release('move',{category:'New move-in registration failure'}),[]).maxPercent,100);assert.equal(api.assessment(release('personal',{category:'Staff non-business visit'}),[]).maxPercent,50);});
test('VINs, fractional cents, original charges and dated manager affiliations are validated',()=>{const r=release('validation',{status:'Pending review'});for(const patch of [{vin:'VIN'},{amountCharged:301},{amountCharged:.001}])assert.throws(()=>prepare({...r,...patch},r));assert.throws(()=>prepare(r,r,am,fixture.map(x=>x.id==='tenure'?{...x,startDate:'2026-06-01'}:x)),/tenure covering/);});
test('manager snapshot remains tied to the historical tenure after a manager moves',()=>{const r=release('historic',{status:'Pending review'}),approved=prepare(r,r).next;const moved=fixture.map(x=>x.id==='tenure'?{...x,endDate:'2026-06-01'}:x.id==='pm'?{...x,name:'Updated contact name'}:x);const result=prepare({...approved,details:'Verified supporting records'},approved,am,moved,'save').next;assert.equal(result.managerContactId,'pm');assert.equal(result.managerName,'Property Manager');assert.equal(result.managerTenureStart,'2025-01-01');});
test('after-hours requests need the prescribed routing and office acknowledgement',()=>{const r=release('night',{status:'Pending review',afterHours:true});assert.throws(()=>prepare(r,r),/after-hours/);assert.equal(prepare({...r,dispatchReplyRecorded:true,supportForwardRecorded:true,assignedAmCopied:true},r).next.status,'Approved');assert.throws(()=>prepare({...r,afterHours:false,responsibilityAcknowledged:false},r),/responsibility/);});
test('physical release requires documents and Towbook reference; free return is company-error-only',()=>{const r=release('physical',{status:'Approved'});assert.throws(()=>prepare(r,r,dispatcher,fixture,'completeRelease'),/release documents/);assert.throws(()=>prepare({...r,returnTransportation:'Free return',correctionReason:'Transport'},r,am,fixture,'save'),/company error/);const approvedEvidence={...evidence,id:'approval',category:'Release approval'};assert.equal(prepare({...r,approvalEvidenceId:'approval',releaseDocumentsComplete:true,towbookRecorded:true,towbookReference:'TB-123',correctionReason:'Recorded Towbook reference'},r,dispatcher,[...fixture,approvedEvidence],'completeRelease').next.status,'Released');});
test('custom view grants cannot become edits via a legacy tab or job title',()=>{const viewer={...head,access:[{module:'Account Management',tab:'files',level:'View'},{module:'Account Management',tab:'compliance',level:'Edit'}]};assert.equal(api.access(viewer,'files',true),false);assert.equal(api.canEdit({...am,person:'other'},account,fixture,staff),false);assert.equal(api.canEdit(am,account,fixture,staff),true);});
test('dispatch payload omits relationship intelligence, financial data and private email drafts',()=>{const secret={...account,healthReason:'Internal account strategy',ownerId:'private-owner'},mail=row('email','private',{accountId:account.id,status:'Draft',authorId:am.person,body:'Private'}),fin=row('financial','private-cost',{accountId:account.id,amount:99});const projected=api.projection([secret,company,pm,tenure,mail,fin,release('shared')],dispatcher,'dispatch');assert.equal(projected.find(x=>x.id===account.id).healthReason,undefined);assert.equal(projected.find(x=>x.id==='private-cost'),undefined);assert.equal(projected.find(x=>x.id==='private'),undefined);assert.equal(projected.find(x=>x.id==='shared').vin,'1HGCM82633A004352');assert.equal(api.canRead(head,mail),false);});
test('protected file categories cannot be relabeled to bypass sharing controls',()=>{const file=row('file','policy',{category:'Internal policy',accountId:account.id});assert.throws(()=>api.clean(payload({...file,category:'Other'}),file,head,[...fixture,file],staff),/fixed by its source/);assert.equal(api.canReadFile({...dispatcher,access:[{module:'Accounts',tab:'overview',level:'View'}]},file),false);});
test('signage six-month deadline uses a confirmed inspection, never the upload date',()=>{const confirmed=row('inspection','inspection',{accountId:account.id,date:'2026-03-31',dateConfirmed:true,complete:true}),upload=row('inspection','upload',{accountId:account.id,date:'2026-09-01',dateConfirmed:false,complete:false});assert.equal(api.signageDue([confirmed,upload],account.id),'2026-09-30');assert.equal(api.addMonths('2026-01-31',1),'2026-02-28');});
test('monthly follow-up excludes internal notes and future scheduled contacts',()=>{const visited=row('activity','visit',{accountId:account.id,date:'2026-04-01',channel:'Onsite visit'}),scheduled={...visited,id:'scheduled',date:'2026-07-01',response:'Scheduled'};assert.equal(api.lastContact([visited,scheduled,{...visited,id:'note',date:'2026-05-10',channel:'Note'}],account.id,'2026-06-01'),'2026-04-01');assert.ok(api.queue([account,visited,scheduled],'2026-06-01').some(x=>x.name==='Monthly check-in'));});
test('historical Drive imports retain evidence while unknown loss and VIN remain unknown',async()=>{const rows=JSON.parse(await readFile('lib/accounts/seed-data.json','utf8')),releases=rows.filter(r=>r.kind==='courtesy'),photos=rows.filter(r=>r.kind==='file'&&r.category==='Signage');assert.equal(releases.length,94);assert.equal(photos.length,271);assert.ok(releases.every(r=>r.sourceUrl&&r.vin===''&&r.amountWaived===undefined&&!r.managerContactId));assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.deepEqual([...new Set(photos.filter(p=>!p.accountId).map(p=>p.sourceFolder))],['Airport Valero']);for(const name of ['Yager Flats','Wildhorse Flats'])assert.equal(rows.find(r=>r.kind==='account'&&r.name===name).companyId,rows.find(r=>r.kind==='company'&&r.name==='Elmington Property Management').id);});
test('single database record projects to both modules after an edit, with audit evidence',async()=>{const record=release('shared-storage',{status:'Draft'});const [saved]=await api.writeMany([{next:record}],dispatcher,'Created shared request');const [updated]=await api.writeMany([{old:saved,next:{...saved,details:'Updated by AM'}}],am,'Updated shared request');const all=await api.records();assert.equal(api.projection(all,dispatcher,'dispatch').find(r=>r.id===updated.id).details,'Updated by AM');assert.equal(api.projection(all,am,'manager').find(r=>r.id===updated.id).version,2);assert.equal(db.prepare('SELECT count(*) AS n FROM account_audit WHERE record_id=?').get(updated.id).n,2);});
test('stale edits roll back the entire multi-record operation',async()=>{const [a]=await api.writeMany([{next:row('account','atomic-account',{assignee:'am'})}],am,'Create');await api.writeMany([{old:a,next:{...a,instructions:'Current'}}],am,'Update');await assert.rejects(api.writeMany([{next:row('task','should-not-save',{accountId:a.id})},{old:a,next:{...a,instructions:'Stale'}}],am,'Stale operation'),e=>e.status===409);assert.equal(db.prepare('SELECT id FROM account_records WHERE id=?').get('should-not-save'),undefined);});
test('contact follow-up rescheduling updates the same task without duplicate entry',async()=>{let all=[...fixture];const r=row('activity','reschedule',{accountId:account.id,date:'2026-05-01',channel:'Phone call',assignee:'am',nextFollowUp:'2026-06-01'});let saved=await api.save({record:payload(r)},context(all));all=[...all,...saved];const activity=saved.find(x=>x.kind==='activity'),task=saved.find(x=>x.kind==='task');saved=await api.save({record:payload({...activity,nextFollowUp:'2026-06-10'})},context(all));assert.equal(saved.find(x=>x.kind==='task').id,task.id);assert.equal(saved.find(x=>x.kind==='task').dueDate,'2026-06-10');});
test('mileage submission creates one linked Finance claim and retry is idempotent',async()=>{const visit=row('activity','mileage-test',{accountId:account.id,date:'2026-05-01',channel:'Onsite visit',assignee:'am',miles:10.5,mileageRate:.7,startPoint:'Office',destination:'Property'});const [saved]=await api.writeMany([{next:visit}],am,'Visit');const [submitted]=await api.save({action:'submitMileage',id:saved.id,version:saved.version},context([...fixture,saved]));assert.equal(submitted.submittedAmount,7.35);const [retried]=await api.save({action:'submitMileage',id:saved.id,version:saved.version},context([...fixture,submitted]));assert.equal(retried.reimbursementId,submitted.reimbursementId);assert.equal(db.prepare('SELECT count(*) AS n FROM finance_records WHERE id=?').get(submitted.reimbursementId).n,1);});
test('manager change ends one affiliation and preserves prior release attribution',async()=>{const old=row('affiliation','moving-tenure',{accountId:account.id,contactId:pm.id,role:'Property Manager',startDate:'2025-01-01'}),next=row('affiliation','new-tenure',{accountId:'second-property',contactId:pm.id,role:'Property Manager',startDate:'2026-07-01'});const saved=await api.save({record:payload(next),endAffiliationId:old.id,endAffiliationVersion:old.version},context([...fixture,old,row('account','second-property',{assignee:'am'})]));assert.equal(saved.find(r=>r.id===old.id).endDate,'2026-07-01');assert.equal(saved.find(r=>r.id===next.id).contactId,pm.id);});

test('private sent email stays private, including for the owner; only linked sent conversations are shared',()=>{
 const privateMail=row('email','private',{status:'Sent',authorId:'someone-else'}),owner={...head,owner:true};
 assert.equal(api.canRead(owner,privateMail),false);assert.equal(api.canRead(am,{...privateMail,authorId:am.person}),true);
 assert.equal(api.canRead(am,{...privateMail,accountId:account.id}),true);
 assert.equal(api.canRead(am,{...privateMail,accountId:account.id,status:'Sending'}),false);
});
test('coverage accepts active Operations and account staff, rejects dispatcher',()=>{
 assert.throws(()=>api.clean(payload({...account,backup:dispatcher.person,backupUntil:'2026-10-01'}),account,head,fixture,staff),/coverage is limited/);
 const ops=row('person','ops',{status:'Active',department:'Operations'});
 assert.equal(api.clean(payload({...account,backup:'ops',backupUntil:'2026-10-01'}),account,head,fixture,[...staff,ops]).backup,'ops');
});
test('commercial contacts and history retain separate plate fields',()=>{
 assert(api.forms.affiliation.find(f=>f.key==='role').options.includes('Facility Manager'));
 const r=release('plate',{vin:'',plate:'abc-1234',plateState:'tx'});
 const n=prepare(r,undefined,dispatcher,fixture,'submitRelease').next;
 assert.equal(n.plate,'ABC1234');assert.equal(n.plateState,'TX');
});

test('damage claim changes are one durable record in account and compliance projections',async()=>{
 const evidence=row('file','claim-proof',{category:'Claim evidence',accountId:account.id});
 const claim=row('claim','shared-damage',{accountId:account.id,date:'2026-08-01',assignee:'am',plate:'XYZ123',plateState:'TX',allegation:'Scratched bumper reported.',finding:'Inconclusive',investigation:'Compared photographs.',propertyCommunication:'Manager updated.',attachmentIds:[evidence.id],proposedSettlement:100});
 const [saved]=await api.save({record:payload(claim),action:'submitClaim'},context([...fixture,evidence]));
 const durable=await api.records(),ops={...am,person:'ops',name:'Operations',role:'Department Head',department:'Operations'};
 assert.equal(api.projection(durable,am,'manager').find(r=>r.id===saved.id).status,'Pending review');
 assert.equal(api.projection(durable,ops,'claims').find(r=>r.id===saved.id).version,saved.version);
 await assert.rejects(()=>api.save({record:payload({...saved,version:0,investigation:'stale'}),action:'save'},context([...fixture,evidence,saved])),/changed|updated|another|reload/i);
});


test('Operations work orders share one saved record and comments with Account Management', async()=>{
 const operations={...am,id:'ops-user',person:'ops-worker',department:'Operations',name:'Operations'};
 const team=[...staff,row('person','ops-worker',{department:'Operations',status:'Active'})];
 const input=row('workOrder','labor-request',{accountId:account.id,type:'Paint Removal',details:'Remove old parking marks before striping.',status:'Requested',dueDate:'2026-09-11'});
 const [saved]=await api.save({record:payload(input)},{all:fixture,viewer:am,staff:team});
 assert.equal(saved.authorId,am.person);assert.equal(saved.status,'Requested');
 let all=[...fixture,saved];assert.equal(api.projection(all,operations,'orders').find(r=>r.id===saved.id).details,input.details);
 const [scheduled]=await api.save({record:payload({...saved,status:'Scheduled',assignee:'ops-worker',scheduledDate:'2026-09-10'})},{all,viewer:operations,staff:team});
 all=[...fixture,scheduled];assert.equal(api.projection(all,am,'manager').find(r=>r.id===saved.id).scheduledDate,'2026-09-10');
 const [comment]=await api.save({record:payload(row('comment','labor-comment',{accountId:account.id,parentId:saved.id,details:'Leasing confirmed access.'}))},{all,viewer:am,staff:team});
 assert.equal(api.projection([...all,comment],operations,'orders').find(r=>r.id===comment.id).details,'Leasing confirmed access.');
 await assert.rejects(()=>api.save({record:payload({...scheduled,status:'Completed',resolution:'Done'})},{all,viewer:am,staff:team}),/Operations manages/);
 const [completed]=await api.save({record:payload({...scheduled,status:'Completed',resolution:'Washed and photographed the old marks.'})},{all,viewer:operations,staff:team});
 assert.equal(api.projection([...fixture,completed],am,'manager').find(r=>r.id===completed.id).status,'Completed');
 assert(!api.queue([...fixture,completed]).some(r=>r.id===completed.id));
 assert.throws(()=>api.projection([...fixture,completed],{...operations,access:[{module:'Work Orders',tab:'assets',level:'View'}]},'orders'));
 assert.throws(()=>api.clean(payload({...completed,version:0,id:'new-order',status:'Requested',assignee:'dispatch'}),undefined,operations,fixture,team),/Operations employee/);
});


test('shared work type options persist, reach both teams, and reject stale edits',async()=>{
 const ops={...am,id:'ops-settings',person:'ops',department:'Operations'};
 const [created]=await api.save({action:'workTypes',version:0,options:['Signage Install','Power Washing']},context(fixture));
 const all=await api.records();
 assert.deepEqual(api.projection(all,am,'manager').find(r=>r.id===created.id).options,['Signage Install','Power Washing']);
 assert.deepEqual(api.projection(all,ops,'orders').find(r=>r.id===created.id).options,created.options);
 const [updated]=await api.save({action:'workTypes',version:created.version,options:['Power Washing']},context(all,ops));
 const reloaded=await api.records();
 assert.deepEqual(reloaded.find(r=>r.id===created.id).options,['Power Washing']);
 await assert.rejects(()=>api.save({action:'workTypes',version:created.version,options:['Stale']},context(reloaded)),e=>e.status===409);
 await assert.rejects(()=>api.save({action:'workTypes',version:updated.version,options:['Forbidden']},context(reloaded,{...am,access:[{module:'Account Management',tab:'workOrders',level:'View'}]})),e=>e.status===403);
 assert.equal(db.prepare('SELECT count(*) AS n FROM account_audit WHERE record_id=?').get(created.id).n,2);
});


test('annual revenue uses the selected calendar year, includes refunds, and exposes partial coverage',()=>{
 const payments=[{accountId:'a',paymentDate:'2026-01-05',cents:10000},{accountId:'a',paymentDate:'2026-02-03',cents:-2500},{accountId:'a',paymentDate:'2026-01-06',cents:99000,void:true},{accountId:'b',paymentDate:'2026-08-20',cents:20000},{accountId:'a',paymentDate:'2025-12-31',cents:40000},{accountId:'a',paymentDate:'2026-12-31',cents:90000}];
 const r=api.annualRevenue(payments,'a',2026,'2026-09-07');
 assert.equal(r.total,75);assert.equal(r.paymentCount,2);assert.equal(r.coverageTo,'2026-08-20');assert.equal(r.to,'2026-09-07');
 assert.equal(api.annualRevenue(payments,'a',2025,'2026-09-07').total,400);
 assert.equal(api.annualRevenue(payments,'missing',2026,'2026-09-07').paymentCount,0);
});

test('the Hangar policy corrects the imported authorization note without inventing visitor enforcement',()=>{
 const a=row('account','account:citizenhousebergstrom',{instructions:'Patrol not allowed. Strict Call in from Regional or Manager'});
 const corrected=api.operatingDefaults(a);
 assert.equal(corrected.towAuthorization,'Property manager only');assert.equal(corrected.carportEnforcement,'Authorized call-in only');assert.equal(corrected.visitorParkingEnforcement,undefined);
 assert(!corrected.instructions.includes('Regional'));assert(corrected.towAuthorizationNotes.includes('Assistant property managers and residents cannot'));
 assert.equal(api.operatingDefaults({...corrected,towAuthorization:'Authorized leasing office staff',instructions:'New reviewed agreement'}).instructions,'New reviewed agreement');
 assert.equal(api.projection([corrected],dispatcher,'dispatch')[0].towAuthorization,'Property manager only');
});

test('enforcement summary keeps overnight windows, rule scopes, and excludes ended schedules',()=>{
 const rules=[row('patrol','mon',{accountId:'a',day:'Monday',scope:'Property / KDM',mode:'Allowed window',starts:'22:00',ends:'03:00',startDate:'2026-01-01'}),row('patrol','tue',{accountId:'a',day:'Tuesday',scope:'Property / KDM',mode:'Allowed window',starts:'22:00',ends:'03:00'}),row('patrol','old',{accountId:'a',day:'Wednesday',scope:'Internal',mode:'No towing',endDate:'2026-08-01'})];
 const schedule=api.enforcementSchedule(rules,'a','2026-09-07');assert.equal(schedule.length,1);assert.equal(schedule[0].daysLabel,'Mon, Tue');assert.equal(schedule[0].hours,'22:00–03:00 (overnight)');assert.equal(schedule[0].scope,'Property / KDM');
});

test('a new property manager can replace the primary contact while preserving the former work number and tenure',async()=>{
 const a=row('account','manager-change-property',{assignee:am.person,status:'Active',primaryContactId:'manager-change-old'});
 const old=row('contact','manager-change-old',{name:'Former Manager'}),oldAff=row('affiliation','manager-change-former',{accountId:a.id,contactId:old.id,role:'Property Manager',startDate:'2025-01-01',workPhone:'512-555-0101'});
 const saved=await api.save({action:'propertyContact',accountId:a.id,accountVersion:0,affiliationVersion:0,name:'New Manager',role:'Property Manager',workEmail:'new@example.com',workPhone:'512-555-0102',startDate:'2026-09-01',makePrimary:true,endPrevious:true,previousAffiliationVersion:0},{all:[a,old,oldAff],viewer:am,staff});
 const next=saved.find(r=>r.kind==='account'),person=saved.find(r=>r.kind==='contact');
 assert.equal(next.primaryContactId,person.id);assert.equal(saved.find(r=>r.id===oldAff.id).endDate,'2026-09-01');assert.equal(saved.find(r=>r.id===oldAff.id).workPhone,'512-555-0101');assert.equal(person.personalPhone,undefined);
 const current=saved.find(r=>r.kind==='affiliation'&&r.contactId===person.id);assert.equal(current.workPhone,'512-555-0102');
 const all=await api.records();
 const edited=await api.save({action:'propertyContact',accountId:a.id,accountVersion:next.version,contactId:person.id,contactVersion:person.version,name:'Updated Manager',role:'Property Manager',workPhone:'512-555-0103',workEmail:'updated@example.com',startDate:'2026-09-01',affiliationVersion:current.version},{all,viewer:am,staff});
 assert.equal(edited.find(r=>r.kind==='contact').name,'Updated Manager');assert.equal(edited.find(r=>r.id===current.id).workPhone,'512-555-0103');
 await assert.rejects(async()=>api.save({action:'propertyContact',accountId:a.id,accountVersion:next.version,name:'Stale edit',affiliationVersion:0},{all:await api.records(),viewer:am,staff}),e=>e.status===409);
});

test('adding another manager keeps the primary contact and enforces account edit permissions',async()=>{
 const a=row('account','manager-secondary-property',{assignee:am.person,status:'Active',primaryContactId:pm.id});
 const body={action:'propertyContact',accountId:a.id,accountVersion:0,affiliationVersion:0,name:'Assistant',role:'Assistant Property Manager',workEmail:'assistant@example.com',makePrimary:false};
 await assert.rejects(()=>api.save(body,{all:[a,pm],viewer:dispatcher,staff}),e=>e.status===403);
 const saved=await api.save(body,{all:[a,pm],viewer:am,staff});assert.equal(saved.find(r=>r.kind==='account').primaryContactId,pm.id);
 assert(saved.some(r=>r.kind==='affiliation'&&r.role==='Assistant Property Manager'));
});


test('sales prospects and contact history persist, with scheduled follow-ups and ownership checks',async()=>{
 const record={id:'crm-test-prospect',kind:'opportunity',version:0,name:'Test prospect',stage:'Prospect',assignee:am.person,address:'20 Sales St',service:'Full Patrol',contactName:'Prospect Manager',email:'prospect@example.com',units:200,estimatedAnnualRevenue:45000};
 const [lead]=await api.saveSales({record},{all:[],viewer:am,staff});assert.equal(lead.stage,'Prospect');assert(lead.createdAt);
 assert.equal(api.salesMetrics([lead]).estimatedAnnual,45000);
 const log=await api.saveSales({action:'activity',id:lead.id,version:lead.version,channel:'Phone call',date:api.today(),details:'Discussed service needs',nextAction:'Send proposal',dueDate:api.today()},{all:[lead],viewer:am,staff});
 assert(log.some(r=>r.kind==='salesActivity'&&r.opportunityId===lead.id));assert.equal(log.find(r=>r.kind==='opportunity').nextAction,'Send proposal');
 const all=await api.records();assert(all.some(r=>r.kind==='salesActivity'&&r.opportunityId===lead.id));
 await assert.rejects(()=>api.saveSales({record:{...record,name:'Stale'}},{all,viewer:am,staff}),e=>e.status===409);
 const readonly={...am,access:[{module:'Sales CRM',tab:'pipeline',level:'View'}]};await assert.rejects(()=>api.saveSales({record},{all,viewer:readonly,staff}),e=>e.status===403);
 await assert.rejects(()=>api.saveSales({record:{...record,id:'sales-other-owner',assignee:head.person}},{all:[],viewer:am,staff}),e=>e.status===403);
});

test('won sales handoff creates one pending account and preserves contacts without activating service',async()=>{
 const record={id:'crm-test-won',kind:'opportunity',version:0,name:'CRM won test',companyName:'CRM company test',stage:'Won',assignee:am.person,address:'99 Sales St',propertyType:'Residential',service:'Full Patrol',contactName:'Leasing Manager',email:'leasing@example.com',phone:'512-555-0133',details:'Requested visitor validation.'};
 const [lead]=await api.saveSales({record},{all:[],viewer:am,staff});
 const template=row('playbook','sales-template',{type:'Onboarding',status:'Current',phase:'Before activation',required:true,name:'Signed agreement'});
 const saved=await api.saveSales({action:'handoff',id:lead.id,version:lead.version,assignee:am.person},{all:[lead,template],viewer:am,staff});
 const property=saved.find(r=>r.kind==='account'),updated=saved.find(r=>r.kind==='opportunity');
 assert.equal(property.status,'Onboarding');assert.equal(saved.find(r=>r.kind==='company').name,'CRM company test');assert.equal(property.companyId,saved.find(r=>r.kind==='company').id);assert.equal(updated.onboardingAccountId,property.id);assert(saved.some(r=>r.kind==='task'&&r.accountId===property.id));
 assert.equal(saved.find(r=>r.kind==='affiliation').workPhone,'512-555-0133');assert.equal(saved.find(r=>r.kind==='contact').personalPhone,undefined);
 const all=await api.records();const again=await api.saveSales({action:'handoff',id:lead.id,version:lead.version,assignee:am.person},{all,viewer:am,staff});assert.equal(again.find(r=>r.kind==='account').id,property.id);
 assert.equal((await api.records()).filter(r=>r.kind==='account'&&r.sourceOpportunityId===lead.id).length,1);
 await assert.rejects(()=>api.saveSales({record:{id:updated.id,kind:'opportunity',version:updated.version,stage:'Lost',lossReason:'Changed'}},{all,viewer:am,staff}),/handed off/);
});

test('dispatch note history retains stars and unacknowledged urgent notes beyond seven days',()=>{
 const now=Date.parse('2026-09-08T12:00:00Z'),note=row('activity','archive-note',{channel:'Dispatcher note',noteCreatedAt:'2026-09-01T12:00:00Z',priority:'Normal'});
 assert.equal(api.noteArchived(note,now-1),false);assert.equal(api.noteArchived(note,now),true);
 assert.equal(api.noteArchived({...note,pinned:true},now),false);
 assert.equal(api.noteArchived({...note,priority:'Urgent'},now),false);
 assert.equal(api.noteArchived({...note,priority:'Urgent',acknowledgedAt:'2026-09-02'},now),true);
});

test('dispatcher handoffs route to the manager and active backup; only account staff acknowledge and star them',async()=>{
 const a=row('account','dispatch-handoff-property',{name:'Handoff property',status:'Active',assignee:am.person,backup:head.person,backupUntil:'2099-12-31'});
 const body={action:'dispatchMessage',id:'dispatch-handoff-note',accountId:a.id,category:'Reported stolen vehicle',priority:'Urgent',details:'Police confirmed the vehicle was reported stolen.',plate:'ABC1234',towbookReference:'TB-77'};
 const [note]=await api.save(body,{all:[a],viewer:dispatcher,staff});assert.deepEqual(note.recipientIds,[am.person,head.person]);assert.equal(note.plate,'ABC1234');
 const ctx={all:[a,note],viewer:dispatcher,staff};assert.equal((await api.save(body,ctx))[0].id,note.id);
 await assert.rejects(()=>api.save({action:'ackDispatchNote',noteId:note.id,version:note.version},ctx),e=>e.status===403);
 const notices=api.notifications(am,staff,[a,note]);assert(notices.some(n=>n.id==='dispatch:'+note.id));
 const reply=await api.save({action:'dispatchReply',id:'dispatch-reply-test',noteId:note.id,details:'I will reach out to the property.'},{all:[a,note],viewer:am,staff});assert.equal(reply[0].parentNoteId,note.id);assert.equal(api.lastContact([note,...reply],a.id),'');
 const [ack]=await api.save({action:'ackDispatchNote',noteId:note.id,version:note.version},{all:[a,note,...reply],viewer:am,staff});assert(ack.acknowledgedAt);
 assert(!api.notifications(am,staff,[a,ack]).some(n=>n.id==='dispatch:'+note.id));
 const [pinned]=await api.save({action:'pinDispatchNote',noteId:note.id,version:ack.version,pinned:true},{all:[a,ack],viewer:am,staff});assert.equal(pinned.pinned,true);
 await assert.rejects(()=>api.save({action:'pinDispatchNote',noteId:note.id,version:ack.version,pinned:false},{all:[a,pinned],viewer:am,staff}),e=>e.status===409);
});

test('dispatch reference exposes permit rules and message threads without account revenue or sales intelligence',()=>{
 const a={...account,permitSystem:'Physical and digital',vehiclesPerLeaseholder:2,visitorApproval:'Required',visitorVisitsPerMonth:7,evParkingEnforcement:'Yes',healthReason:'Private relationship assessment',estimatedAnnualRevenue:90000};
 const note=row('activity','dispatch-visible',{accountId:a.id,channel:'Dispatcher note',details:'Call concern',priority:'Urgent'}),reply=row('activity','dispatch-visible-reply',{accountId:a.id,channel:'Dispatcher reply',parentNoteId:note.id,details:'Handled'});
 const lead=row('opportunity','private-sales',{name:'Private prospect',estimatedAnnualRevenue:50000});
 const result=api.projection([a,note,reply,lead],dispatcher,'dispatch'),property=result.find(r=>r.kind==='account');
 assert.equal(property.vehiclesPerLeaseholder,2);assert.equal(property.visitorApproval,'Required');assert.equal(property.evParkingEnforcement,'Yes');assert.equal(property.healthReason,undefined);assert.equal(property.estimatedAnnualRevenue,undefined);
 assert(result.some(r=>r.id===reply.id&&r.parentNoteId===note.id));assert(!result.some(r=>r.kind==='opportunity'));
});


test('count fields reject fractions while money, mileage and durations retain meaningful decimals',()=>{
 for(const key of ['units','parkingSpaces','vehiclesPerLeaseholder','visitorVisitsPerMonth','visitorConsecutiveDays','cancellationDays','propertyNightLimit','propertyWeekLimit','internalNightLimit','internalWeekLimit','parkingGarageFloors','commercialUnits']) {
  assert.equal(api.numberStep(key),1,key);
  assert.throws(()=>api.clean({id:account.id,kind:'account',version:0,[key]:1.5},account,am,fixture,staff),/whole number/,key);
  assert.equal(api.clean({id:account.id,kind:'account',version:0,[key]:2,internalLimitBy:'am',internalLimitReason:'Confirmed operating limit'},account,am,fixture,staff)[key],2);
 }
 assert.equal(api.numberStep('originalCharges'),0.01);assert.equal(api.numberStep('mileageRate'),'any');
 assert.equal(api.clean({id:account.id,kind:'account',version:0,visitorPermitHours:1.5},account,am,fixture,staff).visitorPermitHours,1.5);
 const r=release('fractional-money',{originalCharges:319.47,amountCharged:0});
 assert.equal(prepare(r,undefined,am,fixture,'save').next.originalCharges,319.47);
 const visit=row('activity','fractional-travel',{accountId:account.id,date:'2026-09-01',channel:'Onsite visit',miles:10.5,mileageRate:0.725});
 assert.equal(api.clean(payload(visit),undefined,am,fixture,staff).mileageRate,0.725);
});

test('facility and permit follow-up questions require the applicable parent choice',()=>{
 const a={...account,permitSystem:'Digital only',carportParking:'No',garageParking:'No',parkingGarage:'No',visitorSection:'No',evParkingEnforcement:'No'};
 for(const key of ['physicalPermitType','physicalPermitDisplay','carportEnforcement','carportRules','garageEnforcement','garageRules','parkingGarageFloors','parkingGarageVisitorParking','parkingGarageVisitorLocation','visitorSectionLocation','evParkingRules'])assert.equal(api.fieldVisible(a,key),false,key);
 assert.equal(api.fieldVisible(a,'permitPlatform'),true);
 assert.equal(api.fieldVisible({...a,permitSystem:'Physical only'},'visitorApproval'),false);
 for(const key of ['physicalPermitType','physicalPermitDisplay','permitPlatform','visitorApproval'])assert.equal(api.fieldVisible({...a,permitSystem:'Physical and digital'},key),true);
 assert.equal(api.fieldVisible({...a,permitSystem:'No permits required'},'physicalPermitType'),false);
 assert.equal(api.fieldVisible({...a,carportParking:'Yes'},'carportEnforcement'),true);
 assert.equal(api.fieldVisible({...a,garageParking:'Yes'},'garageRules'),true);
 assert.equal(api.fieldVisible({...a,parkingGarage:'Yes'},'parkingGarageVisitorParking'),true);
 assert.equal(api.fieldVisible({...a,parkingGarage:'Yes',parkingGarageVisitorParking:'Designated areas / floors'},'parkingGarageVisitorLocation'),true);
 assert.equal(api.fieldVisible({...a,parkingGarage:'Yes',parkingGarageVisitorParking:'Visitors not allowed'},'parkingGarageVisitorLocation'),false);
});

test('mixed-use profiles preserve separate parking-area rules and owner-confirmed building facts',()=>{
 const mixed={...account,propertyType:'Mixed use',commercialTenantParking:'Yes',customerParking:'Yes',residentialParkingLocation:'Beyond the commercial parking',commercialTenantParkingHours:'Business hours',customerParkingAuthority:'Listed commercial contacts only'};
 const saved=api.clean(payload(mixed),account,am,fixture,staff);
 assert.equal(saved.customerParkingAuthority,'Listed commercial contacts only');
 assert(api.fieldVisible(saved,'commercialTenantParkingHours'));assert(api.fieldVisible(saved,'residentialParkingLocation'));
 assert(!api.fieldVisible({...saved,customerParking:'No'},'customerParkingAuthority'));
 assert(!api.fieldVisible({...saved,propertyType:'Residential'},'commercialTenantParkingHours'));
 const mlk=api.operatingDefaults(row('account','account:mlkhighline',{propertyType:'Mixed'}));
 assert.equal(mlk.propertyType,'Mixed use');assert.equal(mlk.parkingGarage,'Yes');assert.equal(mlk.residentialBuildingType,'Mid rise');assert.match(mlk.residentialParkingLocation,/farther inside/);
 assert.equal(api.operatingDefaults({...mlk,customerParkingLocation:'Verified customer bays'}).customerParkingLocation,'Verified customer bays');
 const cole=api.operatingDefaults(row('account','account:thecole'));
 assert.equal(cole.parkingGarage,'Yes');assert.equal(cole.parkingGarageVisitorParking,undefined);
});

test('Account Hub retains agreement source links and operating facts while excluding revenue',async()=>{
 const source=JSON.parse(await readFile('lib/accounts/agreement-data.json','utf8'));
 const altura=source.find(r=>r.accountId==='account:altura');assert(altura);
 const a={...account,relationshipStart:'2025-01-01',launchDate:'2025-02-01',parkingGarage:'Yes',customerParkingRules:'Customer bays only',revenue:1000};
 const projected=api.projection([a,{...altura,accountId:a.id}],dispatcher,'dispatch');
 const document=projected.find(r=>r.kind==='file');assert.equal(document.sourceOnly,true);assert.equal(document.sourceUrl,altura.sourceUrl);
 const profile=projected.find(r=>r.kind==='account');assert.equal(profile.parkingGarage,'Yes');assert.equal(profile.relationshipStart,'2025-01-01');assert.equal(profile.customerParkingRules,'Customer bays only');assert(!('revenue' in profile));
});

test('imported courtesy edits retain corrections without treating an empty field as a new change',()=>{
 const imported=release('imported-edit',{status:'Imported',category:'Unclassified'});
 const unchanged=prepare({...imported,plate:''},imported,am,fixture,'save').next;
 assert.equal(unchanged.status,'Imported');
 assert.throws(()=>prepare({...imported,category:'Account preservation'},imported,am,fixture,'save'),/correction reason/);
 const corrected=prepare({...imported,category:'Account preservation',correctionReason:'Classified the source entry after reviewing the request'},imported,am,fixture,'save').next;
 assert.equal(corrected.category,'Account preservation');assert.equal(corrected.status,'Imported');
});

test('a failed follow-up refresh cannot undo confirmed save feedback or duplicate local records',async()=>{
 let refreshFailed=false;
 const saved={...account,version:1,name:'Updated property'};
 const rows=api.mergeSavedRows([account],[saved]);
 assert.equal(rows.length,1);assert.equal(rows[0].name,'Updated property');
 assert.equal(api.mergeSavedRows(rows,[account])[0].version,1);
 assert.doesNotThrow(()=>api.refreshAfterSave(async()=>{throw Error('List unavailable');},()=>{refreshFailed=true;}));
 await new Promise(resolve=>setImmediate(resolve));assert(refreshFailed);
});


test('enforcement cards reuse explicitly labeled imported hours and edits keep that line consistent',()=>{
 const a={...account,instructions:'Enforcement: 6pm - 8am\nResident space calls only.'};
 assert.equal(api.recordedEnforcementHours(a),'6pm - 8am');
 assert.equal(api.recordedEnforcementHours({...a,enforcementHours:'7pm - 9am'}),'7pm - 9am');
 assert.equal(api.recordedEnforcementHours({...a,instructions:'Call the office for authorization.'}),'');
 const saved=api.clean({id:a.id,kind:'account',version:0,enforcementHours:'7pm - 9am'},a,am,fixture,staff);
 assert.equal(saved.instructions,'Enforcement: 7pm - 9am\nResident space calls only.');
});

test('leasing office rules are optional and follow-up fields only apply to the recorded choice',()=>{
 for(const choice of ['',undefined,'Not applicable','Not confirmed'])for(const key of ['leasingOfficeParkingHours','leasingOfficeParkingAuthority','leasingOfficeParkingRules'])assert(!api.fieldVisible({...account,leasingOfficeParking:choice},key));
 assert(api.fieldVisible({...account,leasingOfficeParking:'Enforced'},'leasingOfficeParkingHours'));
 assert(api.fieldVisible({...account,leasingOfficeParking:'Do not tow'},'leasingOfficeParkingRules'));
 assert(!api.fieldVisible({...account,leasingOfficeParking:'Do not tow'},'leasingOfficeParkingHours'));
 const a=api.clean({id:account.id,kind:'account',version:0,leasingOfficeParking:'Enforced',leasingOfficeParkingHours:'After the office closes',leasingOfficeParkingAuthority:'Property manager only'},account,am,fixture,staff);
 const dispatch=api.projection([a],dispatcher,'dispatch')[0];assert.equal(dispatch.leasingOfficeParking,'Enforced');assert.equal(dispatch.leasingOfficeParkingHours,a.leasingOfficeParkingHours);
});

test('trespass cases, evidence metadata, and reviews persist with a shared audit history',async()=>{
 const input={id:crypto.randomUUID(),name:'Safety workflow fixture',incidentDate:'2026-08-01',location:'Test yard',behavior:'Reported safety incident.',accountId:account.id,version:0,vehiclesJson:JSON.stringify([{vin:'1HGCM82633A004352',plate:'FIX123',plateState:'TX',description:'Test sedan',relationship:'Reported association'}])};
 const saved=await api.saveSafety({action:'save',record:input,raiseAlert:true,staffGuidance:'Contact Dispatch before assisting.'},{all:[account],viewer:dispatcher,staff});
 const c=saved.find(r=>r.kind==='trespass');assert(c);assert.equal(c.version,1);assert(saved.some(r=>r.kind==='safetyUpdate'));
 const event=saved.find(r=>r.kind==='safetyEvent');assert(event);const records=await api.records(),ctx={all:records,viewer:am,staff};const alert=api.safetyData(ctx,true).alerts.find(a=>a.caseId===c.id);assert(alert);
 assert(api.safetyData({...ctx,viewer:dispatcher}).records.some(r=>r.id===c.id));
 await assert.rejects(()=>api.saveSafety({action:'clear',caseId:c.id,alertId:alert.id,reason:'Reviewed with manager.'},{...ctx,viewer:dispatcher}),/Account Manager/);
 const cleared=await api.saveSafety({action:'clear',caseId:c.id,alertId:alert.id,reason:'Reviewed. No active risk remains for this occurrence.'},ctx);assert(cleared.some(r=>r.kind==='safetyReview'));assert(cleared.find(r=>r.id===c.id).lastReviewedAt);
 const updated=await api.records();assert(!api.safetyData({all:updated,viewer:am,staff},true).alerts.some(a=>a.id===alert.id));assert(api.safetyData({all:updated,viewer:am,staff}).records.some(r=>r.id===event.id));
 const repeat=await api.saveSafety({action:'clear',caseId:c.id,alertId:alert.id,reason:'Already reviewed'},{all:updated,viewer:am,staff});assert.equal(repeat.length,0);
 const again=await api.saveSafety({action:'encounter',caseId:c.id,date:api.today(),details:'Vehicle appeared again.',plate:'FIX123',plateState:'TX',raiseAlert:true,staffGuidance:'A new encounter needs review.'},{all:updated,viewer:dispatcher,staff});
 assert(api.safetyData({all:[...updated,...again],viewer:am,staff},true).alerts.some(a=>a.caseId===c.id));assert(db.prepare('SELECT count(*) AS n FROM account_audit WHERE record_id=?').get(c.id).n>=2);
});
test('all staff receive active safety guidance without receiving case or evidence payloads',async()=>{
 const driver={...dispatcher,department:'Drivers'},r=row('trespass','private-safety',{name:'Fixture',behavior:'Restricted detailed allegation',incidentDate:'2026-08-01',location:'Yard',caseStatus:'Open',watchEnabled:true,vehiclesJson:'[]'}),e=row('safetyEvent','private-safety-alert',{caseId:r.id,raiseAlert:true,staffGuidance:'Check with Dispatch.',encounterDate:api.today()}),f=row('file','private-id',{category:'Trespass evidence',caseId:r.id,name:'ID copy',storageKey:'private/path'}),ctx={all:[r,e,f],viewer:driver,staff};
 const result=api.safetyData(ctx,true);assert.equal(result.alerts.length,1);assert.equal(result.canView,false);assert(!JSON.stringify(result).includes('Restricted detailed'));assert(!JSON.stringify(result).includes('private/path'));assert.throws(()=>api.safetyData(ctx),/access/);
 assert(!api.projection([r,e,f],am,'manager').length);assert(!api.projection([r,e,f],dispatcher,'dispatch').length);
});
