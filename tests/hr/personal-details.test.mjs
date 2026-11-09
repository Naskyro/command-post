import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadPersonalDetails,canEditPersonalDetails,personalDetailsRecordId,preparePersonalDetails,sanitizePersonalDetails} from '../../lib/people/details.ts';
import {canReadRecord,listRecord,validateSave} from '../../lib/hr/workflow.ts';
import {personView} from '../../lib/people/policy.ts';

const person=(id,supervisor='')=>({id,kind:'person',version:1,name:id,workerType:'Employee',status:'Active',department:'Dispatch',supervisor});
const people=[person('worker','manager'),person('manager'),person('outside')];
const viewer=(id='worker',actions=[],scope='Team')=>({id,person:id,name:id,role:'Employee',department:'Dispatch',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:actions.map(action=>({action,scope}))});
const fields={homeAddress:'123 Test Street',homeAddress2:'Unit 4',city:'Austin',state:'TX',postalCode:'78744',personalEmail:'worker@example.test',personalPhone:'512-555-0100',dateOfBirth:'1990-05-10',emergencyContactName:'Test Contact',emergencyContactRelationship:'Sibling',emergencyContactPhone:'+1 (512) 555-0101',secondaryEmergencyContactName:'Backup Contact',secondaryEmergencyContactRelationship:'Friend',secondaryEmergencyContactPhone:'512-555-0103',allergies:'Allergies Reported',allergyNotes:'Peanuts',identityDocumentType:'Driver’s License',identityDocumentNumber:'AB-12345',identityIssuingState:'TX',identityExpirationDate:'2024-01-01'};
const at='2026-10-27T20:00:00.000Z';

test('private personnel details require self or scoped administrative responsibility, not generic personnel/pay access',()=>{
 assert.equal(canReadPersonalDetails(viewer(),'worker',people),true);
 assert.equal(canReadPersonalDetails({...viewer(),access:[]},'worker',people),false);
 assert.equal(canEditPersonalDetails({...viewer(),onboardingOnly:true,access:[]},'worker',people),true);
 assert.equal(canReadPersonalDetails({...viewer(),onboardingOnly:true,access:[]},'manager',people),false);
 assert.equal(canReadPersonalDetails(viewer('manager',['managePersonnel']),'worker',people),true);
 assert.equal(canReadPersonalDetails(viewer('manager',['manageOnboarding']),'worker',people),true);
 assert.equal(canReadPersonalDetails(viewer('manager',['managePersonnel']),'outside',people),false);
 for(const action of ['viewPersonnel','manageTaxBank','manageCompensation','recordPerformance'])assert.equal(canReadPersonalDetails(viewer('manager',[action]),'worker',people),false);
 assert.equal(canReadPersonalDetails({...viewer('manager'),owner:true},'worker',people),true);
 assert.equal(canReadPersonalDetails({...viewer('manager'),owner:true},'missing',people),false);
});

test('private details preserve actor/time and version, accept existing expired IDs, and cannot move between employees',()=>{
 const first=preparePersonalDetails({personId:'worker',version:0,data:fields},undefined,viewer(),people,at);
 assert.equal(first.id,personalDetailsRecordId('worker'));assert.equal(first.kind,'personal');assert.equal(first.version,1);
 assert.equal(first.createdBy,'worker');assert.equal(first.updatedAt,at);assert.equal(first.data.identityExpirationDate,'2024-01-01');
 const edit=preparePersonalDetails({personId:'worker',version:1,data:{personalPhone:'512-555-0102'}},first,viewer('manager',['managePersonnel']),people,'2026-10-28T20:00:00.000Z');
 assert.equal(edit.data.secondaryEmergencyContactName,'Backup Contact');assert.equal(edit.data.secondaryEmergencyContactPhone,'512-555-0103');assert.equal(edit.data.homeAddress,fields.homeAddress);assert.equal(edit.data.personalPhone,'512-555-0102');assert.equal(edit.createdBy,'worker');assert.equal(edit.updatedBy,'manager');assert.equal(edit.createdAt,at);assert.equal(edit.version,2);
 assert.throws(()=>preparePersonalDetails({personId:'worker',version:0,data:fields},first,viewer(),people,at),/changed/);
 assert.throws(()=>preparePersonalDetails({personId:'outside',version:1,data:fields},first,{...viewer(),owner:true},people,at),/administrator review/);
 assert.throws(()=>preparePersonalDetails({personId:'outside',version:0,data:fields},undefined,viewer('manager',['managePersonnel']),people,at),/assigned personnel/);
});

test('missing allergy disclosure remains unknown, never inferred as no allergies',()=>{
 assert.equal(sanitizePersonalDetails({},undefined,'2026-10-27').allergies,'Not Provided');
 assert.equal(sanitizePersonalDetails({allergies:'No Known Allergies'},fields).allergyNotes,'');
 assert.equal(sanitizePersonalDetails({allergies:'Not Provided'},fields).allergyNotes,'');
 assert.throws(()=>sanitizePersonalDetails({allergies:'Allergies Reported'}),/reported allergies/);
 assert.throws(()=>sanitizePersonalDetails({allergies:'None'}),/valid allergy disclosure/);
});

test('personal details validate dates, limits and allowed field names without accepting employment or authority changes',()=>{
 assert.throws(()=>sanitizePersonalDetails({dateOfBirth:'2026-02-30'},undefined,'2026-10-27'),/valid date of birth/);
 assert.throws(()=>sanitizePersonalDetails({dateOfBirth:'2027-01-01'},undefined,'2026-10-27'),/future/);
 assert.throws(()=>sanitizePersonalDetails({identityExpirationDate:'not-a-date'}),/valid identity-document/);
 assert.throws(()=>sanitizePersonalDetails({identityDocumentType:'Passport'}),/Driver’s License or State ID/);
 assert.throws(()=>sanitizePersonalDetails({identityDocumentNumber:'AB123'}),/document type/);
 assert.throws(()=>sanitizePersonalDetails({dateOfBirth:1990}),/Enter text/);
 assert.throws(()=>sanitizePersonalDetails({homeAddress:'x'.repeat(201)}),/200 characters/);
 assert.equal(sanitizePersonalDetails({genderDescription:'  Genderqueer  '}).genderDescription,'Genderqueer');
 assert.throws(()=>sanitizePersonalDetails({genderDescription:'x'.repeat(151)}),/150 characters/);
 assert.equal(sanitizePersonalDetails({genderDescription:''},{genderDescription:'Genderqueer'}).genderDescription,'');
 assert.throws(()=>sanitizePersonalDetails({personalEmail:'no email'}),/personal email/);
 assert.throws(()=>sanitizePersonalDetails({personalEmail:'x'.repeat(255)}),/254 characters/);
 assert.equal(sanitizePersonalDetails({personalEmail:' Person@Example.Test '}).personalEmail,'person@example.test');
 assert.throws(()=>sanitizePersonalDetails({emergencyContactPhone:'abc'}),/phone number/);
 assert.throws(()=>sanitizePersonalDetails({secondaryEmergencyContactPhone:'abc'}),/phone number/);
 assert.throws(()=>sanitizePersonalDetails({secondaryEmergencyContactName:'x'.repeat(151)}),/150 characters/);
 const cleared=sanitizePersonalDetails({secondaryEmergencyContactName:'',secondaryEmergencyContactRelationship:'',secondaryEmergencyContactPhone:''},fields);assert.equal(cleared.secondaryEmergencyContactName,'');assert.equal(cleared.secondaryEmergencyContactPhone,'');assert.equal(cleared.emergencyContactName,'Test Contact');
 for(const key of ['role','payType','status','updatedBy','createdAt'])assert.throws(()=>sanitizePersonalDetails({[key]:'Owner'}),/cannot change/);
 assert.equal(sanitizePersonalDetails({dateOfBirth:'2000-02-29'},undefined,'2026-10-27').dateOfBirth,'2000-02-29');
});

test('private details are blocked from generic HR reads and mutations; list summaries strip sensitive fields',()=>{
 const record=preparePersonalDetails({personId:'worker',version:0,data:fields},undefined,viewer(),people,at);
 for(const v of [viewer(),viewer('manager',['managePersonnel']),{...viewer(),owner:true}]){
  assert.equal(canReadRecord(record,v,people,[record]),false);
  assert.throws(()=>validateSave(undefined,record,v,people,[]),/Use Personal Details/);
 }
 const safe=listRecord(record);assert.deepEqual(safe.data,{status:'Recorded'});
 const augmented={...people[0],...fields};
 for(const surface of ['finance','timeclock','admin','hr']){
  const view=personView(augmented,{...viewer('manager'),owner:true},people,surface);
  for(const field of Object.keys(fields))assert.equal(Object.hasOwn(view,field),false);
 }
});
