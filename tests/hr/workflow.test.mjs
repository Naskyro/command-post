const fixtureSuffix0 = String(1).padStart(4, '0');
import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadRecord,validateSave,readiness,listRecord,onboardingRecordView,can} from '../../lib/hr/workflow.ts';
import {blankOnboarding,onboardingSteps} from '../../lib/hr/model.ts';
import {onboardingReadiness,isPendingNewHire} from '../../lib/hr/sop-readiness.ts';
import {verifiedTaskEvidence} from '../../lib/hr/completion.ts';
const employee={id:'employee',kind:'person',version:1,name:'Employee',role:'Employee',department:'Dispatch',supervisor:'manager',workerType:'Employee',employmentClass:'Full-Time',status:'Onboarding',payType:'Hourly',rate:20,date:'2026-10-25',exempt:false};
const manager={id:'manager',kind:'person',version:1,name:'Manager',role:'Supervisor',department:'Dispatch',supervisor:'owner',status:'Active'};
const finance=[employee,manager,{id:'owner',kind:'person',version:1,role:'Owner',department:'Operations'}];
const viewer=(person='manager',actions=[])=>({id:person+'-auth',person,name:person,email:person+'@example.test',owner:false,role:person==='employee'?'Employee':'Supervisor',department:'Dispatch',canManage:false,canRelease:false,access:[{module:'People & HR',tab:'hiring',level:'Edit'}],hrResponsibilities:actions.map(action=>({action,scope:'Team'}))});
const owner={...viewer('owner'),owner:true};
const hr=(kind,data={},id=kind,personId='employee')=>({id,kind,personId,version:1,data,createdAt:'2026-10-25T12:00:00Z',createdBy:'Manager',updatedAt:'2026-10-25T12:00:00Z',updatedBy:'Manager'});
test('module edit access does not grant confidential HR duties',()=>{
 assert.equal(canReadRecord(hr('w4',{status:'Verified'}),viewer(),finance,[]),false);
 assert.equal(canReadRecord(hr('note'),viewer(),finance,[]),false);
 assert.equal(canReadRecord(hr('onboarding'),viewer(),finance,[]),false);
});
test('employee cannot read private notes, own draft warnings or offboarding decisions',()=>{
 const self=viewer('employee',['recordPerformance','manageOffboarding']);
 assert.equal(canReadRecord(hr('note'),self,finance,[]),false);
 assert.equal(canReadRecord(hr('corrective',{status:'Draft'}),self,finance,[]),false);
 assert.equal(canReadRecord(hr('offboarding',{reason:'Private draft'}),viewer('employee'),finance,[]),false);
 assert.equal(canReadRecord(hr('corrective',{employeeVisible:true}),self,finance,[]),true);
});
test('onboarding-only sessions read their own tax record but not screening or other employees',()=>{
 const self={...viewer('employee'),onboardingOnly:true};
 assert.equal(canReadRecord(hr('w4'),self,finance,[]),true);
 assert.equal(canReadRecord(hr('w4',{},'another','manager'),self,finance,[]),false);
 assert.equal(canReadRecord(hr('screening'),self,finance,[]),false);
});
test('published corrective attachment access follows the exact parent record',()=>{
 const file=hr('document',{category:'Signed Corrective Action',parentId:'case'});
 const draft=hr('corrective',{employeeVisible:false},'case');
 assert.equal(canReadRecord(file,viewer('employee'),finance,[draft]),false);
 assert.equal(canReadRecord(file,viewer('employee'),finance,[{...draft,data:{employeeVisible:true,signedDocumentId:file.id}}]),true);
 assert.equal(canReadRecord(file,viewer('employee'),finance,[]),false);
});
test('separate start approver and hiring manager can read assigned readiness and offer files',()=>{
 assert.equal(canReadRecord(hr('onboarding'),viewer('manager',['approveStart']),finance,[]),true);
 const file=hr('document',{category:'Offer Letter'});
 assert.equal(canReadRecord(file,viewer('manager',['manageOnboarding']),finance,[]),true);
 assert.equal(canReadRecord(file,viewer('manager',['approveStart']),finance,[]),true);
});
test('Team catalog authority cannot mutate global positions',()=>{
 assert.equal(can(viewer('manager',['managePositions']),'managePositions',undefined,finance),false);
 const next=hr('position',{title:'New Position'},'position',undefined);next.personId=undefined;
 assert.throws(()=>validateSave(undefined,next,viewer('manager',['managePositions']),finance,[]),/not assigned/);
 assert.throws(()=>validateSave(undefined,hr('position',{title:'Forged Catalog'},'x','manager'),viewer('manager',['managePositions']),finance,[]),/cannot be attached/);
});
test('employee cannot verify their own W-4 and onboarding editor cannot verify payroll tasks',()=>{
 const next=hr('w4',{status:'Verified'});
 assert.throws(()=>validateSave(undefined,next,viewer('employee'),finance,[]),/verification requires/);
 const onboarding=hr('onboarding',{...blankOnboarding(),tasks:onboardingSteps.map(s=>({...s,status:s.key==='payTerms'?'Verified':'Pending'}))});
 assert.throws(()=>validateSave(undefined,onboarding,viewer('manager',['manageOnboarding']),finance,[]),/complete its required review/);
});
test('manager task visibility can be explicitly assigned without publishing warnings',()=>{
 const task=hr('task',{title:'Upload Missing Form',employeeVisible:true});
 validateSave(undefined,task,viewer('manager',['managePersonnel']),finance,[]);
 assert.equal(task.data.employeeVisible,true);
 assert.equal(canReadRecord(task,viewer('employee'),finance,[]),true);
});
test('checkbox completion without signed evidence never releases a hire',()=>{
 const onboarding=hr('onboarding',{tasks:onboardingSteps.map(s=>({...s,status:'Verified'}))});
 const result=readiness(onboarding,employee,[]);
 assert.equal(result.ready,false);
 assert.ok(result.issues.includes('Signed Offer Letter'));
 assert.ok(result.issues.includes('I-9 Employer Verification'));
 assert.ok(result.issues.includes('Passed Drug Screen'));
});
test('background pending with owner and follow-up can clear, but drug pending cannot',()=>{
 const onboarding=hr('onboarding',{tasks:onboardingSteps.map(s=>({...s,status:'Verified',documentId:s.key==='offer'?'offer':s.key==='jobDescription'?'jd':''}))});
 const records=[hr('document',{category:'Offer Letter',signatureStatus:'Signed'},'offer'),hr('document',{category:'Job Description',signatureStatus:'Wet Signature Verified'},'jd'),hr('i9',{status:'Verified'}),hr('w4',{status:'Verified'}),hr('bank',{status:'Verified'}),hr('screening',{status:'Verified',drugStatus:'Passed',backgroundStatus:'Pending',owner:'manager',followUpDate:'2026-10-30'})];
 records.push(hr('benefit',{employmentClass:'Full-Time',effectiveDate:'2026-10-25',package:'Standard'},'benefit'));
 const pay=verifiedTaskEvidence(onboarding,{key:'payTerms',personVersion:employee.version,benefitRecordId:'benefit',agreementConfirmed:true},owner,finance,records);
 const orientation=verifiedTaskEvidence(onboarding,{key:'orientation',completedOn:'2026-10-25',trainerId:'manager',topics:['System Access','Yard Safety'],trainerAttested:true,acknowledgmentMethod:'In-Person Acknowledgment',employeeAcknowledged:true},owner,finance,records);
 onboarding.data.tasks=onboarding.data.tasks.map(task=>task.key==='payTerms'?pay:task.key==='orientation'?orientation:task);
 assert.equal(readiness(onboarding,employee,records).ready,true);
 // A manager's completed orientation is never a proxy for employee SOP signatures.
 onboarding.data.sopClearance={required:3,signed:3};
 onboarding.data.path='Existing Employee';
 assert.equal(isPendingNewHire(employee),true);
 const waiting=onboardingReadiness(onboarding,employee,records,{required:3,signed:1});
 assert.equal(waiting.ready,false);assert.equal(waiting.total,12);assert.equal(waiting.completed,10);
 assert.deepEqual(waiting.issues,['Employee SOP Signatures']);
 assert.equal(onboardingReadiness(onboarding,employee,records,{required:3,signed:3}).ready,true);
 const none=onboardingReadiness(onboarding,employee,records,{required:0,signed:0});
 assert.equal(none.total,9);assert.equal(none.ready,true);
 assert.equal(isPendingNewHire({...employee,status:'Active',onboardingRequired:false}),false);
 assert.equal(isPendingNewHire({...employee,status:'Active',onboardingRequired:true,onboardingClearedAt:'2026-10-01T00:00:00Z'}),false);

 const screening=records.find(r=>r.kind==='screening');screening.data.drugStatus='Pending';
 assert.ok(readiness(onboarding,employee,records).issues.includes('Passed Drug Screen'));
 screening.data.drugStatus='Passed';delete screening.data.owner;
 assert.ok(readiness(onboarding,employee,records).issues.includes('Background Review or Assigned Follow-Up'));
});
test('changed offer terms invalidate an older signed document without deleting it',()=>{
 const onboarding=hr('onboarding',{offerUpdatedAt:'2026-10-26T12:00:00Z',tasks:onboardingSteps.map(s=>({...s,status:'Verified',documentId:s.key==='offer'?'offer':''}))});
 const file=hr('document',{category:'Offer Letter',signatureStatus:'Signed'},'offer');
 assert.ok(readiness(onboarding,employee,[file]).issues.includes('Signed Offer Letter'));
 assert.equal(file.data.signatureStatus,'Signed');
});
test('a later screening review supersedes an earlier favorable result',()=>{
 const onboarding=hr('onboarding',{tasks:onboardingSteps.map(s=>({...s,status:'Verified'}))});
 const earlier=hr('screening',{status:'Verified',drugStatus:'Passed',backgroundStatus:'Cleared'},'earlier');
 const later={...hr('screening',{status:'Verified',drugStatus:'Review Required',backgroundStatus:'Review Required'},'later'),updatedAt:'2026-10-26T12:00:00Z'};
 assert.ok(readiness(onboarding,employee,[earlier,later]).issues.includes('Passed Drug Screen'));
 assert.ok(readiness(onboarding,employee,[earlier,later]).issues.includes('Background Review or Assigned Follow-Up'));
});
test('published corrective action does not publish internal evidence',()=>{
 const evidence=hr('document',{category:'Evidence',parentId:'case'});
 const notice=hr('corrective',{employeeVisible:true},'case');
 assert.equal(canReadRecord(evidence,viewer('employee'),finance,[notice]),false);
});
test('a Timeclock-only account cannot read its own restricted HR file',()=>{
 const staff={...viewer('employee'),access:[{module:'Timeclock',tab:'Today',level:'Edit'}]};
 assert.equal(canReadRecord(hr('bank'),staff,finance,[]),false);
});
test('sensitive list payloads contain status but not bank or tax secrets',()=>{
 const safe=listRecord(hr('bank',{status:'Verified',accountNumber:'0'.repeat(9),routingNumber:'0'.repeat(9),accountLast4:fixtureSuffix0}));
 assert.equal(safe.data.accountNumber,undefined);assert.equal(safe.data.routingNumber,undefined);assert.equal(safe.data.accountLast4,fixtureSuffix0);
 assert.equal(listRecord(hr('w9',{taxpayerId:'0'.repeat(9),status:'Verified'})).data.taxpayerId,undefined);
});
test('payment reviewers see the payment setup without offer terms or approval snapshots',()=>{
 const reviewer=viewer('manager',['manageTaxBank']);
 const onboarding=hr('onboarding',{path:'New Hire',paymentMethod:'Check',offer:{salary:12345},tasks:[{key:'payTerms',status:'Verified',payAgreement:{rate:12345}},{key:'payment',status:'Pending'},{key:'orientation',notes:'Private note'}]});
 assert.equal(canReadRecord(onboarding,reviewer,finance,[]),true);
 const safe=onboardingRecordView(onboarding,reviewer,finance);
 assert.equal(safe.data.offer,undefined);
 assert.deepEqual(safe.data.tasks,[{key:'payment',status:'Pending'}]);
 assert.equal(listRecord(onboarding).data.tasks[0].payAgreement,undefined);
});
test('verified I-9 cannot be created by the employee even if an owner',()=>{
 const next=hr('i9',{status:'Verified'},'i9','owner');
 assert.throws(()=>validateSave(undefined,next,owner,finance,[]),/Another authorized person|verification requires/);
});

test('TWC-only delegates can create follow-ups and review scoped personnel evidence without payroll secrets',()=>{
 const responder=viewer('manager',['manageTwc']);
 const task=hr('task',{title:'TWC Response',category:'TWC',employeeVisible:true});
 validateSave(undefined,task,responder,finance,[]);
 assert.equal(task.data.employeeVisible,false);
 assert.equal(canReadRecord(task,responder,finance,[]),true);
 assert.equal(canReadRecord(hr('note'),responder,finance,[]),true);
 assert.equal(canReadRecord(hr('corrective'),responder,finance,[]),true);
 assert.equal(canReadRecord(hr('offboarding'),responder,finance,[]),true);
 assert.equal(canReadRecord(hr('bank'),responder,finance,[]),false);
 assert.equal(canReadRecord(hr('screening'),responder,finance,[]),false);
 assert.equal(canReadRecord(hr('note'),viewer('employee',['manageTwc']),finance,[]),false);
 assert.throws(()=>validateSave(undefined,hr('task',{title:'Other',category:'Missing Records'}),responder,finance,[]),/not assigned/);
 const ordinary=hr('task',{title:'Private Personnel Task',category:'Missing Records'});
 assert.throws(()=>validateSave(ordinary,hr('task',{title:'Reclassified',category:'TWC'}),responder,finance,[ordinary]),/existing responsibility/);
});
