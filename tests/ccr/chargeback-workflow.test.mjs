import test from 'node:test';import assert from 'node:assert/strict';
import {blankChargeback,blankPreArbitration,checkedChargeback,noticeInstant,totals,processorActions,recoveryAllowed} from '../../lib/ccr/chargeback.ts';
import {summaryItem,prepareRegister} from '../../lib/ccr/register-model.ts';
import {ccrOverview} from '../../lib/ccr/overview.ts';
const clock=new Date('2026-07-03T16:00:00Z');
const draft={...blankChargeback(),reply:'Preparing Response',processor:'Square',noticeRef:'Processor notice 84',deadlineDay:'2026-07-03',deadlineTime:'10:30',zone:'America/Chicago'};
const check=(c,old,amount=5400)=>checkedChargeback(c,old,amount,clock);
test('the notice is authoritative, first response and processor response on behalf are different, deadlines project to Austin',async()=>{
 assert.equal(noticeInstant('2026-07-02','22:30','America/Los_Angeles'),Date.parse('2026-07-03T05:30:00Z'));assert.equal(noticeInstant('2026-11-01','01:30','America/Chicago'),null);
 assert.throws(()=>check({...draft,noticeRef:''}),/notice/);assert.equal(check({...draft,zone:''}).zone,'');assert.equal(noticeInstant(draft.deadlineDay,draft.deadlineTime,''),null);assert.deepEqual(processorActions({...draft,deadlineTime:'',zone:''}),[{due:'2026-07-03',time:'',title:'Submit Processor Evidence'}]);
 assert.equal(recoveryAllowed(check(draft),clock),true);assert.equal(recoveryAllowed(check({...draft,deadlineDay:'2026-07-05'}),clock),false);
 assert.throws(()=>check({...draft,reply:'PTE Submitted'}),/submission date/);const reply=check({...draft,reply:'Processor Responded for PTE',merchantMissed:true,replyDay:'2026-07-03',replyRef:'receipt 4'});assert.equal(reply.decision,'Pending');assert.equal(recoveryAllowed(reply,clock),true);assert.equal(processorActions(reply).length,0);
 assert.equal(check({...draft,deadlineDay:'',deadlineTime:''}).deadlineDay,'');
 const projection=summaryItem({id:'R',section:'recovery',title:'Dispute',chargeback:draft,status:'Open',dueOn:'',ownerName:'',nextAction:'',updatedAt:'',amountCents:5400});assert(!JSON.stringify(projection).includes('Processor notice 84'));
 const v={id:'auth',owner:true,person:'executive'},board=await ccrOverview(v,{court:async()=>[],claims:async()=>[],register:async()=>({sections:['recovery'],items:[projection]})},clock);assert.equal(board.items[0].time,'10:30');assert.equal(board.items[0].pastDue,true);
});
test('separate signed election never overwrites the original evidence response and remains an independent action',()=>{
 const c=check({...draft,reply:'PTE Submitted',replyDay:'2026-07-01',replyRef:'evidence receipt',preArbitration:{...blankPreArbitration(),noticeRef:'election notice',deadlineDay:'2026-07-10',deadlineTime:'11:00',zone:'America/New_York'}});
 assert.equal(c.replyRef,'evidence receipt');assert.deepEqual(processorActions(c),[{due:'2026-07-10',time:'10:00',title:'Submit Signed Pre-Arbitration Election'}]);
 assert.throws(()=>check({...c,preArbitration:{...c.preArbitration,election:'Contested'}}),/signed election/);assert.equal(processorActions(check({...c,preArbitration:{...c.preArbitration,election:'Contested',sentDay:'2026-07-03',signedRef:'signed notice confirmation'}})).length,0);
});
test('cash outreach and official bank outcome are separate; receipts for costs and payments do not inflate principal',()=>{
 const letter={mail:'Sent by Certified Mail',sentDay:'2026-07-03',repayBy:'2026-07-15',tracking:'MAIL-100'};
 assert.equal(check({...draft,deadlineDay:'2026-07-05',...letter}).decision,'Pending'); // Historical contact may be documented without inventing a bank outcome.
 assert.throws(()=>check({...draft,decision:'Cardholder Prevailed'}),/source/);
 const lost={...draft,reply:'PTE Submitted',replyDay:'2026-07-01',replyRef:'processor receipt',decision:'Cardholder Prevailed',decisionDay:'2026-07-02',decisionRef:'bank notice'};
 assert.throws(()=>check({...lost,...letter,tracking:''}),/tracking number/);
 const postage={id:'post',kind:'Certified Mail Postage',day:'2026-07-03',cents:825,reference:'post office 1'},paid={id:'paid',kind:'Cash Repayment',day:'2026-07-03',cents:2400,reference:'till 18'};
 const c=check({...lost,...letter,entries:[postage,paid]});assert.deepEqual(totals(c,5400),{paid:2400,cost:825,remaining:3000});assert.equal(processorActions(c,5400)[0].title,'Follow Up on Cash Repayment');assert.throws(()=>check({...c,entries:[postage,{...postage,id:'duplicate',kind:'Other Case Cost'}]}),/already/);
 assert.throws(()=>check({...c,entries:[{...paid,cents:5401}]}),/exceeds/);assert.equal(processorActions(c,2400).length,0);
 assert.throws(()=>check({...lost,decision:'Merchant Prevailed',...letter,entries:[paid]}),/duplicate recovery/);
});
test('monetary corrections require a reason, keep encrypted version inputs, category cannot silently remove case history',()=>{
 const v={id:'safe',owner:true,person:'exec',name:'Reviewer'},base={version:0,section:'recovery',title:'Dispute',category:'Chargeback',status:'Open',amountCents:5400,steps:[],chargeback:{...draft,entries:[{id:'p',kind:'Certified Mail Postage',day:'2026-07-03',cents:825,reference:'receipt'}]}};
 const old=prepareRegister(v,'recovery',base,undefined,[],true,clock.toISOString()),edit={...base,version:old.version,id:old.id,chargeback:{...base.chargeback,entries:[]}};assert.throws(()=>prepareRegister(v,'recovery',edit,old,[],true,clock.toISOString()),/Explain/);assert.throws(()=>prepareRegister(v,'recovery',{...edit,chargeback:undefined,category:'Other Recovery'},old,[],true,clock.toISOString()),/reclassified/);
 const fixed=prepareRegister(v,'recovery',{...edit,note:'Entered duplicate postage'},old,[],true,clock.toISOString());assert.equal(old.chargeback.entries.length,1);assert.equal(fixed.chargeback.entries.length,0);assert.equal(fixed.history.at(-1).by,'Reviewer');
});
