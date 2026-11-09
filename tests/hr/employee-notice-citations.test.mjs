import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHrPdfDocument} from '../../components/people/hr/documents.ts';
import {savedPolicyReferences} from '../../lib/hr/performance-reference-labels.ts';

const privateRef={code:'SECRET-014',id:'private-sop-id',title:'Private Review Example',version:8,publicationState:'current'};
const sharedRef={id:'eq-return',code:'EQ-004',title:'Equipment Return',version:2,revision:'B',publicationState:'historical'};
const record={issuedDate:'2026-11-01',issuer:'Supervisor Example',action:'Written Warning',category:'Reviewed',
 reason:'An employee missed a return entry.',expectedStandardImpact:'Record each item handed back.',expectations:'Complete the return sheet.',
 support:'A checklist demonstration.',improvementDeadline:'Next handoff',followUpDate:'2026-11-15',consequence:'Further incidents will be reviewed.',
 employeeExplanation:'Requested training.',policyReference:privateRef.code,subject:privateRef.title,relatedSop:privateRef.code,
 policySnapshot:privateRef,sopCitations:[privateRef,sharedRef],employeePdfCitations:[{restricted:true},sharedRef]};
async function printed(data){const pdf=await buildHrPdfDocument('corrective',{name:'Example Employee',title:'Dispatcher'},data);return pdf.internal.pages.flat().join('\n');}
test('a manager can see a pinned reference that the employee notice must redact, without losing a second permitted citation',async()=>{
 assert.equal(savedPolicyReferences(record)[0].title,privateRef.title);const pdf=await printed(record);
 for(const text of ['Restricted Policy Reference','Equipment Return','EQ-004','Version 2','Revision B'])assert.ok(pdf.includes(text),text);
 for(const text of [privateRef.title,privateRef.code,privateRef.id])assert.ok(!pdf.includes(text),text);
});
test('a missing recipient projection fails closed in a write-up PDF, including legacy mirrors',async()=>{
 const pdf=await printed({...record,employeePdfCitations:undefined});
 assert.ok(pdf.includes('Restricted Policy Reference'));for(const text of [privateRef.title,privateRef.code,sharedRef.title])assert.ok(!pdf.includes(text));
});
test('preserved legacy record titles and versions come from the saved snapshot',()=>{
 const [ref]=savedPolicyReferences({policyReference:'OLD-004',subject:'Different Subject',policyVersion:'8',policySnapshot:{id:'OLD-004',title:'Original Subject',version:'1'}});
 assert.equal(ref.title,'Original Subject');assert.equal(ref.version,'1');
});
