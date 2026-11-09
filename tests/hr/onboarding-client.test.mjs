import test from 'node:test';
import assert from 'node:assert/strict';
import {onboardingDraftData,onboardingSaveBody,assignOnboardingDocumentData} from '../../lib/hr/onboarding-client.ts';

const record={id:'onboarding-1',kind:'onboarding',personId:'employee-1',version:3,data:{path:'New Hire',paymentMethod:'Direct Deposit',readiness:{ready:false,issues:['Signed Offer Letter']},tasks:[{key:'offer',status:'Pending'},{key:'jobDescription',status:'Pending'},{key:'orientation',status:'Verified',verifiedById:'reviewer',verifiedAt:'2026-10-27T12:00:00Z'}]}};
const document={id:'doc-1',kind:'document',personId:'employee-1',version:1,data:{category:'Offer Letter',signatureStatus:'Not Verified'}};

test('one-action document assignment preserves unrelated checks and never certifies a signature',()=>{
 const before=structuredClone(record.data);
 const assigned=assignOnboardingDocumentData(record.data,'employee-1','offer',document);
 assert.deepEqual(assigned.tasks[0],{key:'offer',status:'Submitted',documentId:'doc-1'});
 assert.deepEqual(assigned.tasks[2],before.tasks[2]);
 assert.equal(assigned.readiness,undefined);
 assert.deepEqual(record.data,before);
 assert.equal(document.data.signatureStatus,'Not Verified');
});
test('document assignment cannot cross employee or document categories',()=>{
 for(const bad of [{...document,personId:'another-person'},{...document,kind:'note'},{...document,data:{category:'Form W-4'}}])assert.throws(()=>assignOnboardingDocumentData(record.data,'employee-1','offer',bad),/matching document/);
 assert.throws(()=>assignOnboardingDocumentData(record.data,'employee-1','jobDescription',document),/matching document/);
 const jd={...document,data:{category:'Job Description'}};
 assert.equal(assignOnboardingDocumentData(record.data,'employee-1','jobDescription',jd).tasks[1].documentId,'doc-1');
});
test('chained saves submit the returned version and all pending details, without derived readiness',()=>{
 const changed={...record.data,paymentMethod:'Check',offer:{title:'Dispatcher',hourlyRate:20}};
 const body=onboardingSaveBody(record,changed);
 assert.equal(body.version,3);assert.equal(body.id,'onboarding-1');
 assert.equal(body.data.paymentMethod,'Check');assert.deepEqual(body.data.offer,changed.offer);
 assert.equal(body.data.readiness,undefined);
 const saved={...record,version:4,data:body.data};
 const next=onboardingSaveBody(saved,assignOnboardingDocumentData(saved.data,'employee-1','offer',document));
 assert.equal(next.version,4);assert.equal(next.data.offer.title,'Dispatcher');
 assert.equal(next.data.tasks[0].status,'Submitted');
 assert.deepEqual(onboardingDraftData(changed),body.data);
});
