import test from 'node:test';
import assert from 'node:assert/strict';
import {blankChargeback} from '../../lib/ccr/chargeback.ts';
import {blankRecoveryAppointment,blankRecoverySettlement} from '../../lib/ccr/recovery-activity.ts';
import {filterRecoveryRecords,matchesRecoveryFilter,recoveryDashboardStats,recoveryMetricFilters} from '../../lib/ccr/recovery-dashboard.ts';

function record(id,amountCents=10000,chargeback={},changes={}){
 return {id,version:1,section:'recovery',category:'Chargeback',title:'Test case '+id,status:'Open',ownerId:'',ownerName:'',reference:'',resolutionReference:'',dueOn:'',nextAction:'',amountCents,steps:[],createdAt:'2026-11-01T12:00:00Z',createdBy:'Test',updatedAt:'2026-11-01T12:00:00Z',updatedBy:'Test',history:[],files:[],chargeback:{...blankChargeback(),...chargeback},...changes};
}
function entry(id,kind,cents,changes={}){return {id,kind,cents,day:'2026-11-01',reference:'Test receipt '+id,...changes};}
const lost={processor:'Square',noticeRef:'Test processor notice',decision:'Cardholder Prevailed',decisionRef:'Test bank outcome'};

test('bank losses, net receipts, active balances and explicit write-offs remain separate',()=>{
 const active=record('active',10000,{...lost,entries:[entry('payment','Cash Repayment',3000),entry('refund','Recovery Refund',1000),entry('cost','Certified Mail Postage',500,{includeInRecovery:true})]});
 const final=record('final',20000,{...lost,disposition:'Final Loss',recoveryClosedDay:'2026-11-01',writeOffReason:'Recovery ended after documented review.',entries:[entry('payment','Cash Repayment',5000),entry('cost','Certified Mail Postage',1000,{includeInRecovery:true})]});
 const pending=record('pending',30000,{processor:'Square',noticeRef:'Test notice'});
 const win=record('win',40000,{decision:'Merchant Prevailed',decisionRef:'Test decision'});
 const unknown=record('unverified',null);
 const s=recoveryDashboardStats([active,final,pending,win,unknown],'2026-11-02');
 assert.deepEqual(s.bankLosses,{cents:30000,count:2,unknownCount:0});
 assert.deepEqual(s.netRecovery,{cents:7000,count:2,unknownCount:0});
 assert.deepEqual(s.activeRecovery,{cents:8500,count:1,unknownCount:0});
 assert.deepEqual(s.finalLosses,{cents:16000,count:1,unknownCount:0});
 assert.deepEqual(s.pendingBankReview,{cents:30000,count:1,unknownCount:0});
 assert.deepEqual(s.bankWinsAwaitingCredit,{cents:40000,count:1,unknownCount:0});
 assert.deepEqual(s.unverified,{cents:0,count:1,unknownCount:1});
 assert.equal(s.noReceiptsCount,3);assert.equal(s.customerPaymentsCents,8000);assert.equal(s.postedProcessorCreditsCents,0);assert.equal(s.recoveryRefundsCents,1000);
});

test('settlements and appointments do not count as money received; court review requires an explicit decision',()=>{
 const promise=record('promise',10000,{...lost,disposition:'No Response',settlement:{...blankRecoverySettlement(),status:'Agreed',amountCents:10000,agreedDay:'2026-11-01',terms:'Payment promised.',agreementReference:'Test message'},appointments:[{...blankRecoveryAppointment(),person:'Test customer',day:'2026-11-03',status:'Confirmed',expectedAmountCents:10000}]});
 const court=record('court',8000,{...lost,disposition:'Court Planned'});
 const closed=record('closed-court',12000,{...lost,disposition:'Court Filed'},{status:'Closed'});
 const s=recoveryDashboardStats([promise,court,closed],'2026-11-02');
 assert.deepEqual(s.netRecovery,{cents:0,count:0,unknownCount:0});assert.equal(s.noReceiptsCount,3);
 assert.deepEqual(s.activeRecovery,{cents:18000,count:2,unknownCount:0});assert.deepEqual(s.courtReview,{cents:8000,count:1,unknownCount:0});
 assert.equal(matchesRecoveryFilter(promise,'Court Review'),false);assert.equal(matchesRecoveryFilter(court,'Court Review'),true);assert.equal(matchesRecoveryFilter(closed,'Court Review'),false);
 assert.equal(matchesRecoveryFilter(promise,'Appointments'),true);assert.equal(s.unclassifiedClosed.count,1);assert.equal(s.closedBalanceCases[0].id,'closed-court');
});

test('bank wins count only posted credits as receipts and explicit fee recovery remains active',()=>{
 const won=record('won',15000,{decision:'Merchant Prevailed',decisionRef:'Test outcome',entries:[entry('credit','Processor Credit',10000)]});
 const fees=record('won-fees',10000,{decision:'Merchant Prevailed',decisionRef:'Test outcome',disposition:'Court Planned',entries:[entry('credit','Processor Credit',10000),entry('fee','Certified Mail Postage',500,{includeInRecovery:true})]});
 const s=recoveryDashboardStats([won,fees],'2026-11-02');
 assert.deepEqual(s.bankWinsAwaitingCredit,{cents:5000,count:1,unknownCount:0});assert.equal(s.netRecovery.cents,20000);assert.equal(s.postedProcessorCreditsCents,20000);
 assert.deepEqual(s.activeRecovery,{cents:500,count:1,unknownCount:0});assert.deepEqual(s.courtReview,{cents:500,count:1,unknownCount:0});
 assert.equal(matchesRecoveryFilter(won,'Court Review'),false);assert.equal(matchesRecoveryFilter(fees,'Court Review'),true);
});

test('an unverified legacy demand includes selected costs separately without inflating the confirmed recovery target',()=>{
 const processor=record('processor-case',24000,lost);
 const notice=record('unmatched-notice',24000,{mail:'Reported Mailed',disposition:'Unverified',entries:[entry('mail-cost','Certified Mail Postage',4000,{includeInRecovery:true})],sourceNotes:'Possible duplicate of a processor case; identity is not yet matched.'});
 const s=recoveryDashboardStats([processor,notice],'2026-11-02');
 assert.deepEqual(s.activeRecovery,{cents:24000,count:1,unknownCount:0});
 assert.deepEqual(s.unverified,{cents:28000,count:1,unknownCount:0});
 assert.deepEqual(s.bankLosses,{cents:24000,count:1,unknownCount:0});
 assert.deepEqual(s.netRecovery,{cents:0,count:0,unknownCount:0});
 const unverifiedCourt={...notice,chargeback:{...notice.chargeback,disposition:'Court Planned'}};
 const reviewed=recoveryDashboardStats([processor,unverifiedCourt],'2026-11-02');
 assert.deepEqual(reviewed.courtReview,{cents:0,count:0,unknownCount:0});
 assert.equal(matchesRecoveryFilter(unverifiedCourt,'Court Review'),false);
 assert.deepEqual(reviewed.activeRecovery,s.activeRecovery);assert.deepEqual(reviewed.unverified,s.unverified);
});

test('losses enter a recommended release or mailing queue without inventing completed work',()=>{
 const lookup=record('lookup',10000,lost),matched=record('matched',10000,{...lost,details:{...blankChargeback().details,stockNumber:'TEST-1',customerName:'Test customer',customerAddress:'Test address'}});
 const mailed=record('mailed',10000,{...lost,mail:'Submitted for Mailing'}),delivered=record('delivered',10000,{...lost,mail:'Delivered'}),returned=record('returned',10000,{...lost,mail:'Returned or Unclaimed'});
 const before=JSON.stringify([lookup,matched,mailed,delivered,returned]);
 assert.equal(matchesRecoveryFilter(lookup,'Find Release'),true);assert.equal(matchesRecoveryFilter(matched,'Prepare Demand'),true);assert.equal(matchesRecoveryFilter(returned,'Prepare Demand'),true);assert.equal(matchesRecoveryFilter(mailed,'Awaiting Delivery / Payment'),true);assert.equal(matchesRecoveryFilter(delivered,'Awaiting Delivery / Payment'),true);
 const s=recoveryDashboardStats([lookup,matched,mailed,delivered,returned],'2026-11-02');
 assert.equal(s.queueCounts['Find Release'],1);assert.equal(s.queueCounts['Prepare Demand'],2);assert.equal(s.queueCounts['Awaiting Delivery / Payment'],2);assert.equal(s.queueCounts['Court Review'],0);
 assert.equal(JSON.stringify([lookup,matched,mailed,delivered,returned]),before);assert.equal(lookup.chargeback.recoveryStage,'Not Reviewed');assert.equal(lookup.chargeback.recoveryStartedDay,undefined);assert.equal(lookup.chargeback.mail,'Not Started');
});

test('unknown balances stay unknown, latest record versions count once, and other recovery categories stay reachable',()=>{
 const unknown=record('unknown',null,lost),older=record('same',1000,lost),newer=record('same',2000,lost,{version:2}),other=record('other',3000,{}, {category:'Other Recovery'}),legal=record('legal',5000,{}, {section:'legal',category:'Other Legal Notice'});
 const s=recoveryDashboardStats([unknown,older,newer,other,legal],'2026-11-02');
 assert.equal(s.caseCount,2);assert.deepEqual(s.bankLosses,{cents:2000,count:2,unknownCount:1});assert.deepEqual(s.activeRecovery,{cents:2000,count:2,unknownCount:1});assert.equal(s.queueCounts.All,3);
 assert.equal(matchesRecoveryFilter(unknown,'Find Release'),true);assert.equal(matchesRecoveryFilter(other,'All'),true);assert.equal(matchesRecoveryFilter(other,'Find Release'),false);
 const empty=recoveryDashboardStats([],'2026-11-02');assert.equal(empty.caseCount,0);assert.deepEqual(empty.netRecovery,{cents:0,count:0,unknownCount:0});
});

test('appointment ordering retains recorded local clocks and unknown zones without inferring a no-show',()=>{
 const a=(id,day,time,zone='',status='Scheduled')=>({...blankRecoveryAppointment(),id,day,time,zone,status,person:'Test customer'});
 const r=record('visits',10000,{...lost,appointments:[a('future','2026-11-04','09:05','America/Chicago'),a('past','2026-11-01','23:30'),a('today','2026-11-02','00:15','America/Los_Angeles'),a('missing','','','','Needs Scheduling'),a('done','2026-11-01','10:00','','Completed'),a('cancelled','2026-11-03','11:00','','Cancelled')]});
 const closed=record('closed',10000,{...lost,appointments:[a('closed-visit','2026-11-03','12:00')]},{status:'Closed'});
 const final=record('final',10000,{...lost,disposition:'Final Loss',appointments:[a('final-visit','2026-11-03','12:00')]});
 const s=recoveryDashboardStats([r,closed,final],'2026-11-02');
 assert.deepEqual(s.appointments.map(x=>x.appointment.id),['past','today','future','missing']);assert.deepEqual(s.appointments.map(x=>x.timing),['Past Date','Today','Upcoming','Date Needed']);
 assert.equal(s.appointments[0].appointment.zone,'');assert.equal(s.appointments[0].appointment.time,'23:30');assert.equal(s.appointments[0].appointment.status,'Scheduled');assert.equal(s.appointments[1].appointment.time,'00:15');assert.equal(s.appointments[1].appointment.zone,'America/Los_Angeles');
 assert.equal(s.queueCounts.Appointments,1);assert.equal(s.netRecovery.cents,0);
});

test('every overview card opens exactly the cases counted in that financial category',()=>{
 const unpaid=record('unpaid',10000,lost);
 const paid=record('paid',10000,{...lost,disposition:'Recovered',recoveryStage:'Complete',entries:[entry('cash','Cash Repayment',10000)]});
 const pending=record('pending',7000,{processor:'GoDaddy',noticeRef:'Test dispute notice'});
 const win=record('won-credit-pending',8000,{decision:'Merchant Prevailed',decisionRef:'Test bank decision'});
 const unverified=record('unverified',9000,{mail:'Reported Mailed',entries:[entry('postage','Certified Mail Postage',500,{includeInRecovery:true})]});
 const court=record('court',6000,{...lost,disposition:'Court Planned'});
 const final=record('final',5000,{...lost,disposition:'Final Loss',recoveryClosedDay:'2026-11-01',writeOffReason:'Reviewed final loss.'});
 const other=record('other',4000,{}, {category:'Other Recovery'});
 const legal=record('legal',3000,{}, {section:'legal',category:'Other Legal Notice'});
 const rows=[unpaid,paid,pending,win,unverified,court,final,other,legal],stats=recoveryDashboardStats(rows,'2026-11-02');
 const expected={
  'Bank Losses':['bankLosses',['unpaid','paid','court','final']],
  'Recovered':['netRecovery',['paid']],
  'Active Recovery':['activeRecovery',['unpaid','court']],
  'Final Loss':['finalLosses',['final']],
  'Court Review':['courtReview',['court']],
  'Pending Bank Review':['pendingBankReview',['pending']],
  'Bank Credits To Verify':['bankWinsAwaitingCredit',['won-credit-pending']],
  'Unverified':['unverified',['unverified']],
 };
 for(const filter of recoveryMetricFilters){
  const [metric,ids]=expected[filter],matching=filterRecoveryRecords(rows,filter);
  assert.deepEqual(matching.map(r=>r.id),ids,filter+' should open its own cases');
  assert.equal(matching.length,stats[metric].count,filter+' count must match its case list');
 }
 assert.equal(filterRecoveryRecords(rows,'All').length,8);
 assert.equal(matchesRecoveryFilter(legal,'All'),false);
});

test('a fully recovered historical cash payment stays findable with an unknown date and only its latest case version',()=>{
 const old=record('dustin',24150,lost);
 const current=record('dustin',24150,{
  ...lost,disposition:'Recovered',recoveryStage:'Complete',entries:[
   entry('postage','Certified Mail Postage',1445,{includeInRecovery:true}),
   entry('principal','Cash Repayment',24150,{day:'',dateUnknown:true,method:'Cash',allocation:'Principal'}),
   entry('fees','Cash Repayment',1445,{day:'',dateUnknown:true,method:'Cash',allocation:'Fees'}),
  ],
 },{version:2,status:'In Reconciliation'});
 const rows=[old,current,current],stats=recoveryDashboardStats(rows,'2026-11-02');
 assert.deepEqual(stats.bankLosses,{cents:24150,count:1,unknownCount:0});
 assert.deepEqual(stats.netRecovery,{cents:25595,count:1,unknownCount:0});
 assert.deepEqual(stats.activeRecovery,{cents:0,count:0,unknownCount:0});
 assert.deepEqual(filterRecoveryRecords(rows,'Recovered'),[current]);
 assert.deepEqual(filterRecoveryRecords(rows,'Bank Losses'),[current]);
 assert.deepEqual(filterRecoveryRecords(rows,'Find Release'),[]);
 assert.deepEqual(filterRecoveryRecords(rows,'Active Recovery'),[]);
 assert.equal(current.chargeback.entries[1].day,'');
 assert.equal(current.chargeback.entries[1].dateUnknown,true);
});

test('zero-count overview categories return an empty list and unknown amounts retain their matching cases',()=>{
 const unknown=record('unknown',null,lost);
 const stats=recoveryDashboardStats([unknown],'2026-11-02');
 assert.deepEqual(filterRecoveryRecords([unknown],'Bank Losses'),[unknown]);
 assert.deepEqual(filterRecoveryRecords([unknown],'Active Recovery'),[unknown]);
 assert.equal(stats.bankLosses.unknownCount,1);
 for(const filter of ['Recovered','Final Loss','Court Review','Pending Bank Review','Bank Credits To Verify','Unverified']){
  assert.deepEqual(filterRecoveryRecords([unknown],filter),[],filter+' must stay empty');
 }
 assert.deepEqual(filterRecoveryRecords([],'All'),[]);
});
