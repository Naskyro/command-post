const fixtureSuffix0 = String(1).padStart(4, '0');
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankChargeback,blankChargebackDetails,blankPreArbitration,checkedChargeback,noticeInstant,processorActions,deadlinePassed,chargebackRecoveryQueue,towbookLookupText} from '../../lib/ccr/chargeback.ts';
const now=new Date('2026-11-19T17:30:00Z'),check=(c,old)=>checkedChargeback(c,old,50000,now);
test('payment time stays exactly as shown and an unstated zone is never defaulted to Central',()=>{
 const details={...blankChargebackDetails(),transactionDay:'2026-06-07',transactionTime:'18:45',transactionZone:'',towbookCallNumber:'000042',cardBrand:'Visa',cardLast4:fixtureSuffix0,originalTransactionCents:50000,transactionReference:'pay-1'},c=check({...blankChargeback(),processor:'GoDaddy Payments',details});
 assert.equal(c.details.transactionTime,'18:45');assert.equal(c.details.transactionZone,'');assert.equal(c.details.towbookCallNumber,'000042');
 const lookup=towbookLookupText(c,50000);assert.match(lookup,/2026-06-07/);assert.match(lookup,/18:45 \(time zone not provided\)/);assert.ok(lookup.includes('Visa ending ' + fixtureSuffix0));assert.match(lookup,/Original transaction amount: \$500.00/);assert.match(lookup,/Towbook call number: 000042/);assert.doesNotMatch(lookup,/Chicago|Central|UTC/);
 assert.throws(()=>check({...c,details:{...details,transactionTime:'24:01'}}),/payment time/);assert.throws(()=>check({...c,details:{...details,transactionZone:'Local'}}),/time zone/);
 const utc=check({...c,details:{...details,transactionTime:'23:45',transactionZone:'UTC'}});assert.match(towbookLookupText(utc,50000),/23:45 UTC/);
 const oldPayload={...details};delete oldPayload.transactionTime;delete oldPayload.transactionZone;delete oldPayload.towbookCallNumber;
 const retained=check({...c,details:oldPayload},utc);assert.equal(retained.details.transactionTime,'23:45');assert.equal(retained.details.transactionZone,'UTC');assert.equal(retained.details.towbookCallNumber,'000042');
});
test('stated response time with unknown zone is retained but never converted into an exact deadline instant',()=>{
 const c=check({...blankChargeback(),processor:'GoDaddy Payments',noticeRef:'Screenshot 1',deadlineDay:'2026-11-19',deadlineTime:'18:00',zone:''});
 assert.equal(c.deadlineTime,'18:00');assert.equal(c.zone,'');assert.equal(noticeInstant(c.deadlineDay,c.deadlineTime,c.zone),null);assert.equal(deadlinePassed(c,now),false);assert.deepEqual(processorActions(c),[{due:'2026-11-19',time:'',title:'Submit Processor Evidence'}]);assert.equal(c.reply,'Not Yet Verified');
 const arb=check({...c,preArbitration:{...blankPreArbitration(),noticeRef:'Separate Notice',deadlineDay:'2026-11-25',deadlineTime:'18:00',zone:''}});assert.equal(arb.preArbitration.deadlineTime,'18:00');assert.equal(arb.preArbitration.zone,'');assert.equal(processorActions(arb)[1].time,'');
 assert.throws(()=>check({...c,deadlineTime:'18:90'}),/valid time/);
});
test('recovery queue uses documented losses and distinguishes release matching, mailing and court work',()=>{
 const lost={...blankChargeback(),decision:'Cardholder Prevailed',decisionRef:'Processor loss notice'},matched={...lost,details:{...blankChargebackDetails(),customerName:'Verified Customer',customerAddress:'Mailing Address',towbookCallNumber:'500'}};
 assert.equal(chargebackRecoveryQueue(blankChargeback(),50000),null);assert.equal(chargebackRecoveryQueue({...lost,decision:'Merchant Prevailed'},50000),null);assert.equal(chargebackRecoveryQueue(lost,50000,'Closed'),null);
 assert.equal(chargebackRecoveryQueue(lost,50000).stage,'Find Release Record');assert.equal(chargebackRecoveryQueue(lost,50000).needsCertifiedDemand,true);assert.equal(chargebackRecoveryQueue(matched,50000).stage,'Prepare Certified Demand');
 assert.equal(chargebackRecoveryQueue({...matched,mail:'Submitted for Mailing'},50000).stage,'Awaiting Demand Delivery');assert.equal(chargebackRecoveryQueue({...matched,mail:'Submitted for Mailing'},50000).needsCertifiedDemand,false);
 assert.equal(chargebackRecoveryQueue({...matched,mail:'Delivered'},50000).stage,'Awaiting Payment');assert.equal(chargebackRecoveryQueue({...matched,mail:'Returned or Unclaimed'},50000).stage,'Review Returned Mail');assert.equal(chargebackRecoveryQueue({...matched,mail:'Returned or Unclaimed'},50000).needsCertifiedDemand,true);
 assert.equal(chargebackRecoveryQueue({...matched,mail:'Delivered',deliveryDay:'2026-10-01',mailings:[{stage:'Prepared',submittedDay:'',mailedDay:'',deliveryDay:''}]},50000).stage,'Awaiting Payment');
 assert.equal(chargebackRecoveryQueue({...lost,recoveryStage:'Court Review'},50000).recordedStage,true);assert.equal(chargebackRecoveryQueue({...lost,recoveryStage:'Complete'},50000),null);
 assert.equal(chargebackRecoveryQueue({...lost,entries:[{id:'paid',kind:'Cash Repayment',day:'2026-11-18',cents:50000,reference:'Receipt'}]},50000),null);
 assert.equal(lost.decision,'Cardholder Prevailed');assert.equal(lost.recoveryStage,'Not Reviewed');
});
test('staff identity review preserves bank facts and requires verified records before review completion',()=>{
 const base=blankChargeback();assert.equal(check(base).trespassReview,'Not Requested');
 const needs=check({...base,trespassReview:'Needs Identity Verification',reviewNotes:'Find the signed release receipt.'});assert.equal(needs.decision,'Pending');assert.equal(needs.disposition,'Unverified');
 assert.throws(()=>check({...base,trespassReview:'Pending Staff Review'}),/verified release/);
 assert.throws(()=>check({...base,trespassReview:'Reviewed',identityVerificationRef:'release.pdf'}),/review finding/);
 const reviewed=check({...base,trespassReview:'Reviewed',identityVerificationRef:'release.pdf',reviewNotes:'Staff reviewed the matching release and recorded a decision.'});assert.equal(reviewed.decision,'Pending');assert.equal(reviewed.entries.length,0);
 const stale={...reviewed};delete stale.trespassReview;delete stale.identityVerificationRef;delete stale.reviewNotes;assert.equal(check(stale,reviewed).trespassReview,'Reviewed');
});
