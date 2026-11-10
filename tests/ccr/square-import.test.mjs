import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSquareDisputesCsv,readSquareCsv,squareCsvMaxBytes} from '../../lib/ccr/square-import.ts';

const headers=['case','payment_id','status','disputed_usd','payment_usd','payment_datetime_chicago','card_brand','card_last4','reason','response_due_date','response_states','responses_received_chicago','detail.informationRequestId'];
const base={case:'01',payment_id:'payment-1',status:'Won',disputed_usd:'52.00',payment_usd:'234.00',payment_datetime_chicago:'2026-07-27T11:05:51-05:00',card_brand:'VISA',card_last4:'0142',reason:'AMOUNT_DIFFERS',response_due_date:'2026-09-11',response_states:'CHALLENGED',responses_received_chicago:'2026-09-10T21:08:15-05:00','detail.informationRequestId':'dispute-1'};
const quoted=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const csv=(rows,extra=[])=>{const cols=[...headers,...extra];return '\uFEFF'+cols.map(quoted).join(',')+'\r\n'+rows.map(r=>cols.map(k=>quoted(r[k])).join(',')).join('\r\n')+'\r\n';};

test('CSV quoting accepts BOM, CRLF, quoted commas, line breaks and escaped quotes without executing cell content',()=>{
 assert.deepEqual(readSquareCsv('\uFEFFone,two\r\n"a,b","he said ""yes""\nnext"\r\n'),[['one','two'],['a,b','he said "yes"\nnext']]);
 assert.throws(()=>readSquareCsv('one,two\n"unfinished'),/quoted/);assert.throws(()=>readSquareCsv('one,two\n"closed"oops,x'),/quoting/);
 assert.throws(()=>readSquareCsv('a'.repeat(squareCsvMaxBytes+1)),/1 MB/);
});

test('processor facts do not manufacture names, tow properties, full card data or recovered funds',()=>{
 const item=parseSquareDisputesCsv(csv([base])).candidates[0],c=item.record.chargeback;
 assert.equal(item.paymentId,'payment-1');assert.equal(item.key,'square:information-request:dispute-1');assert.equal(item.record.amountCents,5200);assert.equal(c.details.originalTransactionCents,23400);assert.equal(c.details.cardLast4,'0142');
 assert.equal(c.decision,'Merchant Prevailed');assert.equal(c.decisionDay,'');assert.equal(c.disposition,'Unverified');assert.deepEqual(c.entries,[]);
 assert.equal(c.details.customerName,'');assert.equal(c.details.accountId,'');assert.equal(c.details.stockNumber,'');assert.equal(c.details.vehicleModel,'');
 assert.equal(c.deadlineDay,'2026-09-11');assert.equal(c.deadlineTime,'');assert.equal(c.zone,'');assert.equal(c.reply,'Response Reported (Submitter Unknown)');assert.equal(c.replyDay,'2026-09-10');assert.match(c.sourceNotes,/does not identify who submitted/);
});

test('terminal decision epochs convert using Chicago, while conflicting reported timestamps stay unverified',()=>{
 const row={...base,status:'Lost','detail.merchantResolutionDecisionDate.instantUsec':String(Date.parse('2026-09-20T02:30:00Z')*1000),'detail.disputeReportedAt.instantUsec':String(Date.parse('2026-08-01T12:00:00Z')*1000),'list.disputeReportedAt.instantUsec':String(Date.parse('2026-08-02T12:00:00Z')*1000)};
 const extra=Object.keys(row).filter(k=>!headers.includes(k)),item=parseSquareDisputesCsv(csv([row],extra)).candidates[0];assert.equal(item.record.chargeback.decisionDay,'2026-09-19');assert.equal(item.record.chargeback.details.reportedDay,'');assert.equal(item.warnings.length,1);assert.match(item.record.chargeback.sourceNotes,/2026-08-01T12:00:00.000Z/);assert.match(item.record.chargeback.sourceNotes,/2026-08-02T12:00:00.000Z/);
});

test('same source identity deduplicates exact rows and rejects conflicting or ambiguous source identities',()=>{
 const result=parseSquareDisputesCsv(csv([base,{...base,case:'02'}]));assert.equal(result.candidates.length,1);assert.equal(result.duplicatesSkipped,1);
 assert.throws(()=>parseSquareDisputesCsv(csv([base,{...base,disputed_usd:'53.00'}])),/conflicting/);
 assert.throws(()=>parseSquareDisputesCsv(csv([base,{...base,'detail.informationRequestId':'other-dispute'}])),/different or missing/);
 const other={...base,payment_id:'payment-2','detail.informationRequestId':'dispute-2'};assert.equal(parseSquareDisputesCsv(csv([base,other])).candidates.length,2);
});

test('currency, money precision, complete card numbers, invalid dates and contradictory processor fields are rejected',()=>{
 assert.throws(()=>parseSquareDisputesCsv(csv([{...base,disputed_usd:'52.001'}])),/dollar amount/);
 assert.throws(()=>parseSquareDisputesCsv(csv([{...base,card_last4:'4111111111111111'}])),/too long/);
 assert.throws(()=>parseSquareDisputesCsv(csv([{...base,response_due_date:'2026-02-30'}])),/valid/);
 assert.throws(()=>parseSquareDisputesCsv(csv([{...base,'detail.disputeAmount.currencyCode':'EUR'}],['detail.disputeAmount.currencyCode'])),/USD/);
 assert.throws(()=>parseSquareDisputesCsv(csv([{...base,'detail.paymentId':'wrong-payment'}],['detail.paymentId'])),/conflicting payment ID/);
 assert.throws(()=>parseSquareDisputesCsv(csv([{...base,'detail.disputeAmount.amount':'5201'}],['detail.disputeAmount.amount'])),/dollar amounts conflict/);
});

test('EXPIRED response preserves unknown respondent; card brand mappings and import bounds are explicit',()=>{
 const item=parseSquareDisputesCsv(csv([{...base,status:'Lost',card_brand:'MASTER_CARD',response_states:'EXPIRED',responses_received_chicago:''}])).candidates[0];assert.equal(item.record.chargeback.reply,'Not Yet Verified');assert.equal(item.record.chargeback.details.cardBrand,'Mastercard');assert.match(item.warnings[0],/on PTE/);
 assert.throws(()=>parseSquareDisputesCsv(csv(Array.from({length:201},(_,i)=>({...base,payment_id:'p'+i,'detail.informationRequestId':'d'+i})))),/200 disputes/);
 assert.throws(()=>parseSquareDisputesCsv('payment_id,status\np1,Won'),/missing/);
});

test('explicit processor disputedBy names populate the cardholder field with attribution and conflicting names are rejected',()=>{
 const extra=['detail.disputedBy','list.disputedBy'];
 const row={...base,'detail.disputedBy':'SIXTO VERA','list.disputedBy':'SIXTO VERA'};
 const result=parseSquareDisputesCsv(csv([row],extra)).candidates[0];assert.equal(result.record.chargeback.details.cardholderName,'SIXTO VERA');assert.equal(result.record.chargeback.details.customerName,'');assert.match(result.record.title,/SIXTO VERA/);assert.match(result.record.chargeback.sourceNotes,/Square explicitly identifies disputedBy as SIXTO VERA/);assert.doesNotMatch(result.record.chargeback.sourceNotes,/cardholder identities.*not established/);
 assert.throws(()=>parseSquareDisputesCsv(csv([{...row,'list.disputedBy':'Different Person'}],extra)),/conflicting named disputant/);
});

test('payment date and HH:mm use the exact Chicago conversion, preserving zeros, DST and source seconds',()=>{
 const read=timestamp=>parseSquareDisputesCsv(csv([{...base,payment_datetime_chicago:timestamp}])).candidates[0].record.chargeback;
 const early=read('2025-11-07T08:11:31-06:00');assert.equal(early.details.transactionTime,'08:11');assert.equal(early.details.transactionZone,'America/Chicago');assert.equal(early.details.cardLast4,'0142');assert.match(early.sourceNotes,/08:11:31-06:00/);
 const spring=read('2026-03-08T08:05:10Z');assert.equal(spring.details.transactionDay,'2026-03-08');assert.equal(spring.details.transactionTime,'03:05');
 const fall=read('2026-11-01T07:30:45Z');assert.equal(fall.details.transactionDay,'2026-11-01');assert.equal(fall.details.transactionTime,'01:30');assert.match(fall.sourceNotes,/2026-11-01T07:30:45.000Z/);
 const midnight=read('2026-07-27T05:00:00Z');assert.equal(midnight.details.transactionTime,'00:00');
 const previousDate=read('2026-07-27T04:15:20Z');assert.equal(previousDate.details.transactionDay,'2026-07-26');assert.equal(previousDate.details.transactionTime,'23:15');
 const unknown=read('');assert.equal(unknown.details.transactionDay,'');assert.equal(unknown.details.transactionTime,'');assert.equal(unknown.details.transactionZone,'');
 assert.equal(unknown.recoveryStage,'Not Reviewed');assert.equal(unknown.recoveryStartedDay,undefined);assert.deepEqual(unknown.mailings,[]);assert.equal(unknown.appointments,undefined);
});
