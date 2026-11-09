const fixtureSuffix0 = String(1).padStart(4, '0');
import test from 'node:test';
import assert from 'node:assert/strict';
import {validRoutingNumber,validateBankFields,bankBinding,bankHasElectronicAuthorization,bankHasPaperAuthorization,sanitizeBankData,bankSummary,currentBankRecord,BANK_AUTHORIZATION_VERSION} from '../../lib/hr/banking.ts';
import {lookupRouting} from '../../lib/hr/routing.ts';
import {validateSave,canReadRecord} from '../../lib/hr/workflow.ts';

function fixtureRouting(sequence) {
 const first = '00' + String(sequence).padStart(6, '0');
 const sum = [...first].reduce((n, d, i) => n + Number(d) * [3, 7, 1][i % 3], 0);
 return first + String((10 - sum % 10) % 10);
}
const fixture1 = '0'.repeat(11) + '2';
const fixture2 = fixtureRouting(1);
const fixture3 = fixtureRouting(2);
const fixture4 = '0'.repeat(8) + '1';
const fixture5 = '0'.repeat(9) + '6';
const details={nameOnAccount:'Example Employee',routingNumber:fixture3,accountNumber:fixture1,accountType:'Checking',bankName:'Fixture Bank',effectiveDate:'2026-10-27'};
const record=(data,id='bank')=>({id,kind:'bank',personId:'employee',version:1,data,createdAt:'2026-10-27T12:00:00Z',updatedAt:'2026-10-27T12:00:00Z',createdBy:'Employee',updatedBy:'Employee'});
const finance=[{id:'employee',kind:'person',version:1,name:'Example Employee',status:'Active',department:'Dispatch',supervisor:'reviewer'},{id:'reviewer',kind:'person',version:1,name:'Reviewer',status:'Active',department:'Dispatch'}];
const employee={id:'employee-auth',person:'employee',name:'Example Employee',email:'example@test.invalid',owner:false,role:'Employee',department:'Dispatch',canManage:false,canRelease:false,access:[{module:'People & HR',tab:'home',level:'Edit'}],hrResponsibilities:[]};
const reviewer={...employee,id:'reviewer-auth',person:'reviewer',name:'Reviewer',role:'Supervisor',hrResponsibilities:[{action:'manageTaxBank',scope:'Team'}]};
const authorized={...details,status:'Submitted',authorizationAccepted:true,authorizationName:'Example Employee',authorizationAt:'2026-10-27T12:00:00Z',authorizationBy:'employee',authorizationIdentity:'employee-auth',authorizationVersion:BANK_AUTHORIZATION_VERSION,authorizationBinding:bankBinding(details)};

test('routing and account entry reject checksum errors, non-digits and invalid account types while preserving leading zeros',()=>{
 assert.equal(validRoutingNumber(fixture3),true);assert.equal(validRoutingNumber(fixture2),true);assert.equal(validRoutingNumber(fixture4),false);assert.equal(validRoutingNumber('000000000'),false);assert.equal(validRoutingNumber('abcd00025'),false);
 assert.doesNotThrow(()=>validateBankFields({...details},true));assert.equal(details.accountNumber,fixture1);
 assert.throws(()=>validateBankFields({...details,accountNumber:'12-345'},true),/account number/);
 assert.throws(()=>validateBankFields({...details,accountType:'Credit'},true),/Checking or Savings/);
 assert.throws(()=>validateBankFields({...details,bankName:''},true),/bank name/);
});
test('generic bank updates cannot manufacture employee consent or lookup provenance',()=>{
 const forged={...authorized,institutionLookupStatus:'Found',institutionLookupSource:'Forged'};sanitizeBankData(undefined,forged);
 assert.equal(forged.authorizationAccepted,undefined);assert.equal(forged.institutionLookupSource,undefined);assert.equal(forged.accountLast4,details.accountNumber.slice(-4));
 assert.throws(()=>validateSave(undefined,record({...authorized,status:'Verified'}),reviewer,finance,[]),/authorization is required/);
});
test('changing an account or effective date invalidates previous electronic authorization',()=>{
 const same={...authorized};sanitizeBankData(authorized,same);assert.equal(bankHasElectronicAuthorization(same,'employee'),true);
 for(const change of [{accountNumber:fixture5},{routingNumber:fixture2},{nameOnAccount:'Another Person'},{accountType:'Savings'},{effectiveDate:'2026-11-01'}]){const changed={...authorized,...change};sanitizeBankData(authorized,changed);assert.equal(bankHasElectronicAuthorization(changed,'employee'),false);}
 assert.equal(bankHasElectronicAuthorization(authorized,'other-person'),false);
});
test('payroll reviewer can approve genuine employee authorization; employee cannot self-assert reviewer authority',()=>{
 const old=record(authorized),next={...old,version:2,data:{...authorized,status:'Verified'}};
 assert.doesNotThrow(()=>validateSave(old,next,reviewer,finance,[old]));assert.equal(next.data.reviewedBy,'Reviewer');
 assert.throws(()=>validateSave(old,{...next,data:{...authorized,status:'Verified'}},employee,finance,[old]),/verification requires/);
});
test('upload alone is not a signed bank authorization and another employee’s file cannot be reused',()=>{
 const data={...details,signedDocumentId:'signed'},file={...record({category:'Bank Authorization',signatureStatus:'Not Verified'},'signed'),kind:'document'};
 assert.equal(bankHasPaperAuthorization(data,'employee',[file]),false);
 file.data.signatureStatus='Wet Signature Verified';assert.equal(bankHasPaperAuthorization(data,'employee',[file]),true);
 assert.equal(bankHasPaperAuthorization(data,'other-person',[file]),false);
});
test('pending and future instructions do not replace the current approved bank account',()=>{
 const previous=record({...details,status:'Verified',effectiveDate:'2026-09-01'},'previous'),pending={...record({...details,status:'Submitted',effectiveDate:'2026-10-27'},'pending'),createdAt:'2026-10-27T14:00:00Z'},future={...record({...details,status:'Verified',effectiveDate:'2026-11-01'},'future'),createdAt:'2026-10-27T15:00:00Z'};
 assert.equal(currentBankRecord([previous,pending,future],'2026-10-27').id,'previous');assert.equal(currentBankRecord([previous,pending,future],'2026-11-01').id,'future');
 const safe=bankSummary(record({...authorized,accountLast4:fixtureSuffix0}));assert.equal(safe.data.accountNumber,undefined);assert.equal(safe.data.routingNumber,undefined);assert.equal(safe.data.authorizationBinding,undefined);assert.equal(safe.data.accountLast4,fixtureSuffix0);
 const unrelated={...reviewer,person:'elsewhere',id:'elsewhere-auth',hrResponsibilities:[]};assert.equal(canReadRecord(previous,unrelated,finance,[previous]),false);
});
test('routing lookup transmits only public routing number and validates matching provider identity',async()=>{
 let request;const fetcher=async(url,options)=>{request={url,options};return new Response(JSON.stringify({status:'success',data:{aba_number:fixture3,bank_name:'Fixture Bank',city:'Austin',state:'TX'}}),{headers:{'Content-Type':'application/json'}});};
 const found=await lookupRouting(fixture3,fetcher,Date.parse('2026-10-27T12:00:00Z'));assert.equal(found.status,'Found');assert.equal(found.bankName,'Fixture Bank');assert.equal(found.source,'bankrouting.io');assert.equal(request.url,'https://bankrouting.io/api/v1/aba/'+fixture3);assert.equal(request.options.body,undefined);
 const wrong=await lookupRouting(fixture3,async()=>new Response(JSON.stringify({status:'success',data:{aba_number:fixture2,bank_name:'Wrong Bank'}})));assert.equal(wrong.status,'Unavailable');assert.equal(wrong.bankName,undefined);
});
test('provider outages, rate limiting and missing routing entries do not fabricate a bank identity',async()=>{
 assert.equal((await lookupRouting(fixture3,async()=>new Response('',{status:404}))).status,'Not Found');
 assert.equal((await lookupRouting(fixture3,async()=>new Response('',{status:429}))).status,'Unavailable');
 assert.equal((await lookupRouting(fixture3,async()=>{throw new Error('Network');})).status,'Unavailable');
 await assert.rejects(()=>lookupRouting(fixture4,async()=>{throw new Error('Should not fetch');}),/valid nine-digit/);
});
