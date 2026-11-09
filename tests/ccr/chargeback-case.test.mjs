const fixtureSuffix0 = String(1).padStart(4, '0');
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankChargeback,blankChargebackDetails,blankChargeMailing,checkedChargeback,recoveryTotals,totals,isRecoveryCost} from '../../lib/ccr/chargeback.ts';
import {expenseFromCost} from '../../lib/ccr/expense-handoff.ts';
import {buildReport,breakdown,filteredLines} from '../../lib/ccr/reports.ts';
import {catalog} from '../../lib/ccr/reports-catalog.ts';

const now=new Date('2026-11-02T03:00:00Z');
const check=(c,principal=50000,old)=>checkedChargeback(c,old,principal,now);
const payment=(id,cents,kind='Cash Repayment',extra={})=>({id,kind,day:'2026-10-01',cents,reference:'receipt-'+id,...extra});

test('canonical account IDs accept directory namespaces and the supported identifier length',()=>{
 const withAccount=accountId=>check({...blankChargeback(),details:{...blankChargebackDetails(),accountId}});
 for(const id of ['account:nexuseast','account:wilder','account-1','account:'+ 'a'.repeat(122)])assert.equal(withAccount(id).details.accountId,id);
 assert.throws(()=>withAccount('account:'+ 'a'.repeat(123)),/length/);
 assert.throws(()=>withAccount('account:nexus/east'),/directory/);
});

test('a sourced historical recovery can have an explicitly unknown payment date without inventing a report date',()=>{
 const receipt={...payment('cash-principal',24150),day:'',dateUnknown:true,method:'Cash',reference:'Jerson confirmed full payment in person; date not provided'};
 const c=check({...blankChargeback(),disposition:'Recovered',entries:[payment('postage',1445,'Certified Mail Postage',{includeInRecovery:true}),receipt,{...receipt,id:'cash-postage',cents:1445,allocation:'Fees'}]},24150);
 assert.equal(c.entries[1].day,'');assert.equal(c.entries[1].dateUnknown,true);assert.equal(c.disposition,'Recovered');assert.equal(recoveryTotals(c,24150).paid,25595);assert.equal(recoveryTotals(c,24150).remaining,0);
 const report=buildReport(catalog.find(x=>x.id==='repayments'),{register:[{id:'historic',section:'recovery',category:'Chargeback',status:'Open',title:'Historical cash payment',createdAt:now.toISOString(),chargeback:c}]},now);
 assert.equal(report.rows.length,2);assert.ok(report.rows.every(r=>r.day===''));assert.equal(breakdown(report.rows,true)[0].value,25595);assert.equal(filteredLines(report.rows,{from:'2025-01-01',to:'2026-12-31'}).length,0);
 const one=e=>check({...blankChargeback(),entries:[e]},24150);
 assert.throws(()=>one({...receipt,dateUnknown:undefined}),/date/);
 assert.throws(()=>one({...receipt,dateUnknown:'true'}),/unknown/);
 assert.throws(()=>one({...receipt,day:'2026-10-01'}),/no known transaction date/);
 assert.throws(()=>one({...receipt,cents:0}),/positive amount/);
 assert.throws(()=>one({...receipt,reference:''}),/source reference/);
 for(const kind of ['Processor Credit','Recovery Refund','Certified Mail Postage'])assert.throws(()=>one({...receipt,kind}),/Only a recovery payment/);
});

test('case facts retain exact vehicle/card/reference facts while an unknown processor outcome remains unknown',()=>{
 const details={...blankChargebackDetails(),customerName:'Customer One',accountId:'account-1',accountName:'Alpha',stockNumber:'000041',vehicleYear:'2022',vehicleMake:'Honda',vehicleModel:'Accord',plate:'AB123',vin:'1HGCM82633A004352',cardBrand:'Visa',cardLast4:fixtureSuffix0,originalTransactionCents:54000,transactionDay:'2026-09-01'};
 const c=check({...blankChargeback(),details,sourceNotes:'Invoice p. 2\nDate still needs confirmation.'});
 assert.equal(c.details.stockNumber,'000041');assert.equal(c.details.cardLast4,fixtureSuffix0);assert.equal(c.reply,'Not Yet Verified');assert.equal(c.decision,'Pending');assert.equal(c.disposition,'Unverified');assert.equal(c.entries.length,0);
 assert.throws(()=>check({...c,details:{...details,cardLast4:'0'.repeat(16)}}),/length|four/);
 assert.throws(()=>check({...c,details:{...details,transactionDay:'2026-02-30'}}),/date/);
 assert.throws(()=>check({...c,details:{...details,vehicleYear:'20222'}}),/length|year/);
 assert.equal(check({...c,details:undefined},50000,c).details.cardLast4,fixtureSuffix0);
});
test('itemized service bill, actual company costs and selected recovery fees remain separate',()=>{
 const c=check({...blankChargeback(),serviceFees:[{id:'tow',label:'Tow Fee',cents:50000,reference:'invoice 1'}],entries:[payment('post',1445,'Certified Mail Postage'),payment('fee',2000,'Processor Fee',{includeInRecovery:true}),payment('partial',15000,'Cash Repayment',{method:'Check'}),payment('fee-repaid',1000,'Cash Repayment',{allocation:'Fees'})],disposition:'Partial Recovery'});
 const t=recoveryTotals(c,50000);
 assert.equal(t.serviceFees,50000);assert.equal(t.cost,3445);assert.equal(t.feesSought,2000);assert.equal(t.target,52000);assert.equal(t.paid,16000);assert.equal(t.remaining,36000);assert.equal(t.unrecoveredPrincipal,35000);assert.equal(t.feesRecovered,1000);
 assert.throws(()=>check({...c,entries:[...c.entries,payment('excess-fee',1001,'Cash Repayment',{allocation:'Fees'})]}),/reconciliation note/);
 assert.throws(()=>check({...c,entries:[...c.entries,payment('duplicate-postage',1445,'Other Case Cost',{reference:'receipt-post'})]}),/already/);
});
test('bank win is not a posted credit; payments, credits and refunds expose duplicate recovery',()=>{
 const won=check({...blankChargeback(),decision:'Merchant Prevailed',decisionRef:'processor export row 2'});
 assert.equal(won.decisionDay,'');assert.deepEqual(totals(won,50000),{paid:0,cost:0,remaining:50000});assert.equal(recoveryTotals(won,50000).processorCreditPending,true);
 assert.throws(()=>check({...won,disposition:'Recovered'}),/actual payments/);
 assert.throws(()=>check({...won,entries:[payment('customer',50000)]}),/duplicate recovery/);
 const duplicate=check({...won,entries:[payment('customer',50000),payment('bank',50000,'Processor Credit')],reconciliationNote:'Both receipts are recorded; customer refund is being reconciled.'});assert.equal(recoveryTotals(duplicate,50000).excess,50000);
 const reconciled=check({...duplicate,entries:[...duplicate.entries,payment('refund',50000,'Recovery Refund')],disposition:'Recovered'});assert.equal(recoveryTotals(reconciled,50000).excess,0);assert.equal(recoveryTotals(reconciled,50000).paid,50000);
 assert.throws(()=>check({...reconciled,entries:[...reconciled.entries,payment('too-much-refund',100000,'Recovery Refund')]}),/refunds cannot exceed/);
});
test('mailing submissions and group tracking never invent individual delivery',()=>{
 const m={...blankChargeMailing(),id:'batch',recipient:'Multiple recipients',documentRef:'Demand letter.pdf',stage:'Submitted for Mailing',submittedDay:'2025-10-05',tracking:'92148900000000000000',trackingScope:'Mailing Group',evidenceRef:'Submission certificate'};
 const c=check({...blankChargeback(),mail:'Submitted for Mailing',submittedDay:'2025-10-05',tracking:m.tracking,mailings:[m]});
 assert.equal(c.sentDay,'');assert.equal(c.deliveryDay,'');assert.equal(c.mailings[0].trackingScope,'Mailing Group');assert.equal(c.mailings[0].deliveryDay,'');assert.equal(c.decision,'Pending');
 assert.throws(()=>check({...c,mail:'Delivered',sentDay:'2025-10-06',deliveryDay:'2025-10-11'}),/delivery or return proof/);
 assert.throws(()=>check({...c,mailings:[{...m,stage:'Delivered',mailedDay:'2025-10-06',deliveryDay:'2025-10-11',evidenceRef:''}]}),/supporting proof/);
 const reported=check({...c,mail:'Reported Mailed',sentDay:'2025-10-06',mailings:[{...m,stage:'Reported Mailed',mailedDay:'2025-10-06'}]});assert.equal(reported.deliveryDay,'');assert.equal(reported.reply,'Not Yet Verified');
});
test('no response, filed court and recovery dispositions require their own facts',()=>{
 assert.throws(()=>check({...blankChargeback(),disposition:'No Response'}),/contact date/);
 assert.equal(check({...blankChargeback(),disposition:'No Response',lastContactDay:'2026-09-01'}).decision,'Pending');
 assert.throws(()=>check({...blankChargeback(),disposition:'Court Filed',courtReference:'Court 2'}),/filing date/);
 assert.equal(check({...blankChargeback(),disposition:'Court Filed',courtReference:'Case 123',courtFiledDay:'2026-09-01'}).courtReference,'Case 123');
 assert.throws(()=>check({...blankChargeback(),disposition:'Partial Recovery'}),/recorded payment/);
 const response=check({...blankChargeback(),reply:'Response Reported (Submitter Unknown)',replyRef:'Square CSV row 4',decision:'Cardholder Prevailed',decisionRef:'Square CSV row 4'});assert.equal(response.replyDay,'');assert.equal(response.decisionDay,'');assert.equal(response.entries.length,0);
});
test('legacy records remain editable and retain optional fields when an older client omits them',()=>{
 const prior={...blankChargeback(),details:{...blankChargebackDetails(),customerName:'Prior Customer'},sourceNotes:'Original source',mail:'Sent by Certified Mail',sentDay:'2025-10-06',tracking:'CERT-12',entries:[payment('old-post',1445,'Certified Mail Postage')]};
 const legacy=Object.fromEntries(Object.entries(prior).filter(([k])=>!['details','sourceNotes','disposition','serviceFees','mailings'].includes(k)));
 const c=check(legacy,50000,prior);assert.equal(c.details.customerName,'Prior Customer');assert.equal(c.sourceNotes,'Original source');assert.equal(c.mail,'Sent by Certified Mail');assert.equal(c.entries[0].cents,1445);
});
test('processor credits/refunds are recovery movements, never Finance expenses or company costs',()=>{
 const entries=[payment('cash',10000),payment('credit',40000,'Processor Credit'),payment('refund',2000,'Recovery Refund'),payment('postage',1445,'Certified Mail Postage')],r={section:'recovery',category:'Chargeback',status:'Open',createdAt:'2026-10-01T00:00:00Z',id:'case',title:'Recovery',chargeback:{...blankChargeback(),processor:'Square',entries}};
 const costs=buildReport(catalog.find(x=>x.id==='costs'),{register:[r]},now),recovery=buildReport(catalog.find(x=>x.id==='repayments'),{register:[r]},now);assert.equal(breakdown(costs.rows,true)[0].value,1445);assert.equal(breakdown(recovery.rows,true)[0].value,48000);
 const v={id:'session',owner:true,person:'owner'};for(const e of entries.slice(0,3)){assert.equal(isRecoveryCost(e),false);assert.throws(()=>expenseFromCost(v,'case',e),/company costs/);}
});
