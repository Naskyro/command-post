import test from 'node:test';
import assert from 'node:assert/strict';
import {blankOnboarding,driverInsuranceStep,onboardingStepsFor} from '../../lib/hr/model.ts';
import {isDriverPerson} from '../../lib/people/driver-role.ts';
import {verifiedTaskEvidence,driverInsuranceComplete,preserveTaskVerification} from '../../lib/hr/completion.ts';
import {readiness,validateSave,onboardingRecordView,canReadRecord} from '../../lib/hr/workflow.ts';

const person={id:'driver',kind:'person',version:1,name:'New Driver',status:'Onboarding',onboardingRequired:true,department:'Transport',departmentId:'department-2',supervisor:'supervisor',workerType:'Contractor'};
const supervisor={id:'supervisor',kind:'person',version:1,name:'Supervisor',status:'Active',department:'Operations'};
const department={id:'department-2',kind:'department',version:1,name:'Transport',aliases:['Drivers']};
const people=[person,supervisor,department];
const reviewer={id:'supervisor-auth',person:'supervisor',name:'Supervisor',access:[{module:'People & HR',tab:'hiring',level:'Edit'}],hrResponsibilities:[{action:'manageOnboarding',scope:'Team'}]};
const record={id:'onboarding',kind:'onboarding',personId:person.id,version:1,data:blankOnboarding('New Hire',person,people),createdAt:'2026-10-01T12:00:00Z',createdBy:'Supervisor',updatedAt:'2026-10-01T12:00:00Z',updatedBy:'Supervisor'};
const input={key:'driverInsurance',insuranceCarrier:'Test Commercial Auto',insurancePolicyNumber:'TEST-1001',insuranceEffectiveDate:'2026-10-01',insuranceConfirmedOn:'2026-10-01',insuranceConfirmationReference:'Agent email confirming addition, Oct 1, endorsement 001',insuranceConfirmed:true};
const verify=(change={},actor=reviewer,hr=[])=>verifiedTaskEvidence(record,{...input,...change},actor,people,hr,'2026-10-02T12:00:00Z');

test('new driver insurance task follows canonical departments, survives renames, and excludes non-drivers and historical clearance',()=>{
 assert.equal(isDriverPerson(person,people),true);
 assert.equal(isDriverPerson({...person,departmentId:undefined,department:'Drivers'},people),true);
 assert.equal(isDriverPerson({...person,departmentId:undefined,department:'Transport'},people),true);
 assert.equal(isDriverPerson({...person,departmentId:undefined,department:'Dispatch',title:'Driver Support Dispatcher'},people),false);
 assert.equal(record.data.tasks.at(-1).key,'driverInsurance');
 assert.equal(record.data.tasks.at(-1).owner,'Employer');
 assert.equal(record.data.tasks.at(-1).assignedTo,'supervisor');
 for(const prior of [{...person,status:'Active',onboardingRequired:false},{...person,status:'Active',onboardingClearedAt:'2026-09-01T12:00:00Z'},{...person,status:'Former',accountStatus:'Disabled'}]){
  assert.equal(onboardingStepsFor(prior,{},people).some(step=>step.key==='driverInsurance'),false);
 }
 assert.equal(onboardingStepsFor({...person,status:'Active',onboardingClearedAt:'2026-10-02'},record.data,people).some(step=>step.key==='driverInsurance'),true);
});
test('editable onboarding path or a bare completion checkbox cannot bypass driver coverage',()=>{
 const changed={...record,data:{...record.data,path:'Existing Employee',tasks:record.data.tasks.map(task=>({...task,status:'Verified'}))}};
 assert.ok(readiness(changed,person,[],people).issues.includes(driverInsuranceStep.label));
 assert.throws(()=>preserveTaskVerification(undefined,{status:'Verified'},'driverInsurance'),/required review/);
 const next={...record,data:{path:'Existing Employee',tasks:[]}};
 validateSave(undefined,next,reviewer,people,[]);
 assert.ok(next.data.tasks.some(task=>task.key==='driverInsurance'&&task.status==='Pending'));
});
test('insurance review requires employer authority, actual effective coverage and insurer confirmation',()=>{
 assert.throws(()=>verify({}, {...reviewer,person:'driver',owner:true}),/cannot approve their own/);
 assert.throws(()=>verify({}, {...reviewer,hrResponsibilities:[]}),/not assigned/);
 assert.throws(()=>verify({}, {...reviewer,onboardingOnly:true}),/not assigned/);
 for(const change of [{insuranceCarrier:''},{insurancePolicyNumber:''},{insuranceConfirmationReference:''},{insuranceEffectiveDate:'2026-02-30'},{insuranceEffectiveDate:'2099-01-01'},{insuranceConfirmedOn:'2099-01-01'},{insuranceConfirmed:false}])assert.throws(()=>verify(change));
 const evidence=verify({verifiedBy:'Forged Reviewer'});
 assert.equal(evidence.verifiedBy,'Supervisor');assert.equal(evidence.verifiedById,'supervisor-auth');assert.equal(evidence.verifiedAt,'2026-10-02T12:00:00Z');
 assert.equal(driverInsuranceComplete(evidence,person.id,[]),true);
 assert.equal(driverInsuranceComplete(evidence,'other-driver',[]),false);
 const complete={...record,data:{...record.data,tasks:record.data.tasks.map(task=>task.key==='driverInsurance'?evidence:task)}};
 assert.equal(readiness(complete,person,[],people).issues.includes(driverInsuranceStep.label),false);
 assert.throws(()=>preserveTaskVerification(evidence,{...evidence,insurancePolicyNumber:'EDITED'},'driverInsurance'),/record a new review/);
});
test('optional insurance evidence is bound to the driver and remains employer-only',()=>{
 const doc={...record,id:'insurance-proof',kind:'document',data:{category:'Driver Insurance Confirmation',sha256:'a'.repeat(64)}};
 const evidence=verify({insuranceDocumentId:doc.id},reviewer,[doc]);
 assert.equal(driverInsuranceComplete(evidence,person.id,[doc]),true);
 assert.equal(driverInsuranceComplete(evidence,person.id,[]),false);
 assert.throws(()=>verify({insuranceDocumentId:doc.id},reviewer,[{...doc,personId:'other'}]),/this driver/);
 const self={...reviewer,id:'driver-auth',person:person.id,onboardingOnly:true,hrResponsibilities:[]};
 assert.equal(canReadRecord(doc,self,people,[record,doc]),false);
 assert.equal(canReadRecord(doc,reviewer,people,[record,doc]),true);
 const completed={...record,data:{...record.data,tasks:[evidence]}};
 const safe=onboardingRecordView(completed,self,people);
 assert.equal(safe.data.tasks[0].status,'Verified');
 for(const field of ['insurancePolicyNumber','insuranceCarrier','insuranceConfirmationReference','insuranceDocumentId','insuranceDocumentHash'])assert.equal(safe.data.tasks[0][field],undefined);
 assert.equal(onboardingRecordView(completed,reviewer,people).data.tasks[0].insurancePolicyNumber,input.insurancePolicyNumber);
});
