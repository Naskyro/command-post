const fixtureSuffix0 = String(1).padStart(4, '0');
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoDaddyDisputesCsv,readGoDaddyCsv,godaddyCsvMaxBytes,godaddyCsvTemplate,godaddyRequiredHeaders} from '../../lib/ccr/godaddy-import.ts';
import {noticeInstant,recoveryTotals} from '../../lib/ccr/chargeback.ts';

const base={transactionId:'ab1234cd',disputeId:'dc4321ba',transactionDay:'2026-02-04',transactionTime:'18:08',transactionZone:'',originalTransactionCents:'30564',disputedAmountCents:'30563',cardBrand:'Visa',cardLast4:fixtureSuffix0,rawStatus:'LOST',reportedDay:'2026-04-28',responseDeadlineDay:'2026-05-23',responseDeadlineTime:'19:00',responseDeadlineZone:'',rawPhase:'First Chargeback',rawReason:'Consumer: Cancelled Merchandise/Services',rawCardholderLabel:'VISA CARDHOLDER',customerCollectionStage:'Not Started',collectionStageBasis:'Staff confirmed no demand letter has been prepared.'};
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const csv=(rows,additional=[])=>{const columns=[...new Set([...Object.keys(base),...rows.flatMap(Object.keys),...additional])];return '\uFEFF'+columns.map(quote).join(',')+'\r\n'+rows.map(row=>columns.map(key=>quote(row[key])).join(',')).join('\r\n')+'\r\n';};
const first=(row=base)=>parseGoDaddyDisputesCsv(csv([row]),'reviewed.csv').candidates[0];

test('reviewed GoDaddy fields retain separate original/disputed cents and unzoned wall-clock times',()=>{
 const item=first(),c=item.record.chargeback,d=c.details;
 assert.equal(item.key,'godaddy:dispute:dc4321ba');assert.deepEqual(item.sourceKeys,['godaddy:transaction:ab1234cd','godaddy:dispute:dc4321ba']);
 assert.equal(item.record.amountCents,30563);assert.equal(d.originalTransactionCents,30564);assert.equal(d.cardLast4,fixtureSuffix0);
 assert.equal(d.transactionDay,'2026-02-04');assert.equal(d.transactionTime,'18:08');assert.equal(d.transactionZone,'');
 assert.equal(d.reportedDay,'2026-04-28');assert.equal(c.deadlineDay,'2026-05-23');assert.equal(c.deadlineTime,'19:00');assert.equal(c.zone,'');assert.equal(noticeInstant(c.deadlineDay,c.deadlineTime,c.zone),null);
 assert.equal(c.decision,'Cardholder Prevailed');assert.equal(c.decisionDay,'');assert.equal(c.reply,'Not Yet Verified');assert.equal(c.mail,'Not Started');assert.equal(c.recoveryStage,'Find Release Record');
 assert.equal(c.trespassReview,'Not Requested');assert.deepEqual(c.entries,[]);assert.deepEqual(c.mailings,[]);assert.equal(recoveryTotals(c,item.record.amountCents).paid,0);
 assert.match(c.sourceNotes,/Response submission, submitter and submission date remain unverified/);assert.ok(item.warnings.some(w=>/30563.*30564/.test(w)));
});

test('generic customer/cardholder labels remain attributed source text and never become invented names',()=>{
 const item=first({...base,customerName:'Valued Customer',cardholderName:'VISA CARDHOLDER'}),c=item.record.chargeback;
 assert.equal(c.details.customerName,'');assert.equal(c.details.cardholderName,'');assert.match(item.record.title,/Unknown customer/);assert.match(c.sourceNotes,/VISA CARDHOLDER/);
 const named=first({...base,customerName:'Jamie Example',cardholderName:'JAMIE EXAMPLE',identityBasis:'Named signed release and exact transaction ID.'});
 assert.equal(named.record.chargeback.details.customerName,'Jamie Example');assert.equal(named.record.chargeback.details.cardholderName,'JAMIE EXAMPLE');assert.match(named.record.chargeback.sourceNotes,/Named signed release/);
});

test('optional case details and original invoice fees are preserved without fabricating costs or account IDs',()=>{
 const item=first({...base,accountName:'Example Property',propertyAddress:'100 Example Road',customerEmail:'jamie@example.test',customerPhone:'555-0100',customerAddress:'200 Example Street',stockNumber:'STOCK-42',towbookCallNumber:'CALL-42',vehicleYear:'2020',vehicleMake:'Example',vehicleModel:'Sedan',plate:'TEST123',vin:'1HGCM82633A004352',towDay:'2026-02-03',releaseDay:'2026-02-04',sourceFiles:'release.pdf; screenshot.png',sourceNotes:'A signed sentence is crossed out; do not summarize it as an unconditional waiver.',serviceFeesJson:JSON.stringify([{label:'Tow',cents:25000,reference:'Invoice p.2'},{id:'storage',label:'Storage',cents:5564,reference:'Invoice p.2'}])});
 const c=item.record.chargeback;assert.equal(item.sourceAccountName,'Example Property');assert.equal(c.details.accountId,'');assert.equal(c.details.accountName,'');assert.equal(c.details.propertyAddress,'100 Example Road');assert.equal(c.details.stockNumber,'STOCK-42');assert.equal(c.details.towbookCallNumber,'CALL-42');
 assert.equal(c.serviceFees.length,2);assert.equal(c.serviceFees[0].cents,25000);assert.deepEqual(c.entries,[]);assert.match(c.sourceNotes,/crossed out/);assert.match(c.sourceNotes,/not attached by CSV import/);
 assert.throws(()=>first({...base,serviceFeesJson:'[{"label":"Tow","cents":100,"reference":"Invoice","cardNumber":"full"}]'}),/only id, label, cents and reference/);
 assert.throws(()=>first({...base,serviceFeesJson:'[{"label":"Tow","cents":1.2,"reference":"Invoice"}]'}),/amount in cents/);
});

test('pending decisions and historical pre-arbitration phase do not fabricate responses, elections or recovery',()=>{
 const inReview=first({...base,rawStatus:'IN REVIEW'}).record.chargeback;assert.equal(inReview.decision,'Pending');assert.equal(inReview.reply,'Not Yet Verified');assert.equal(inReview.recoveryStage,'Not Reviewed');
 const pre=first({...base,rawPhase:'Pre-Arbitration'}).record.chargeback;assert.equal(pre.decision,'Cardholder Prevailed');assert.equal(pre.preArbitration,undefined);assert.match(pre.sourceNotes,/does not prove an active election/);
 const won=first({...base,rawStatus:'WON'}).record.chargeback;assert.equal(won.decision,'Merchant Prevailed');assert.deepEqual(won.entries,[]);assert.equal(won.decisionDay,'');
 const unknownRecovery=first({...base,customerCollectionStage:''});assert.equal(unknownRecovery.record.chargeback.recoveryStage,'Not Reviewed');assert.match(unknownRecovery.record.nextAction,/verify current recovery correspondence/);
 const response=first({...base,rawStatus:'NEEDS RESPONSE'});assert.equal(response.record.dueOn,base.responseDeadlineDay);assert.equal(response.record.chargeback.reply,'Not Yet Verified');
 assert.throws(()=>first({...base,rawStatus:'IN REVIEW',decisionDay:'2026-05-01'}),/pending bank decision/);
});

test('bounded CSV reading handles quoting, BOM and line breaks without interpreting formulas',()=>{
 assert.deepEqual(readGoDaddyCsv('\uFEFFone,two\r\n"a,b","he said ""yes""\nnext"\r\n'),[['one','two'],['a,b','he said "yes"\nnext']]);
 assert.throws(()=>readGoDaddyCsv('a,b\n"unfinished'),/quoted/);assert.throws(()=>readGoDaddyCsv('a,b\n"closed"oops,x'),/quoting/);assert.throws(()=>readGoDaddyCsv('a\u0000b'),/control/);assert.throws(()=>readGoDaddyCsv('a'.repeat(godaddyCsvMaxBytes+1)),/300 KB/);
 assert.match(first({...base,sourceNotes:'=HYPERLINK("example","data only")\nQuoted facts, retained.'}).record.chargeback.sourceNotes,/=HYPERLINK/);
 assert.throws(()=>parseGoDaddyDisputesCsv(csv([base],['fullCardNumber'])),/Unsupported CSV column/);
 assert.throws(()=>parseGoDaddyDisputesCsv('transactionId,transactionId\na,b'),/unique/);
 assert.throws(()=>parseGoDaddyDisputesCsv('transactionId,disputeId\na,b'),/missing/);
 for(const header of godaddyRequiredHeaders)assert.ok(godaddyCsvTemplate().includes(header));
});

test('duplicate source rows skip once, while conflicting identities or facts fail before import',()=>{
 const repeated=parseGoDaddyDisputesCsv(csv([{...base,caseNumber:'1'},{...base,caseNumber:'2'}]));assert.equal(repeated.candidates.length,1);assert.equal(repeated.duplicatesSkipped,1);
 assert.throws(()=>parseGoDaddyDisputesCsv(csv([base,{...base,disputedAmountCents:'100'}])),/conflicting facts/);
 assert.throws(()=>parseGoDaddyDisputesCsv(csv([base,{...base,disputeId:'different'}])),/different dispute IDs/);
 assert.throws(()=>parseGoDaddyDisputesCsv(csv([base,{...base,transactionId:'different'}])),/conflicting facts/);
 assert.equal(first({...base,transactionId:'AB1234CD',disputeId:'DC4321BA'}).key,first().key);
});

test('invalid money, full card data, dates, zones, source processors and unsafe optional fields are rejected',()=>{
 for(const amount of ['305.63','-1','1e4','999999999999999999'])assert.throws(()=>first({...base,disputedAmountCents:amount}),/amount|whole cents/);
 assert.throws(()=>first({...base,cardLast4:'0'.repeat(16)}),/card last four/);assert.throws(()=>first({...base,cardLast4:'923'}),/exactly the last four/);
 assert.throws(()=>first({...base,transactionDay:'2026-02-30'}),/valid payment date/);assert.throws(()=>first({...base,transactionTime:'25:00'}),/24-hour time/);assert.throws(()=>first({...base,transactionZone:'Guessed Central'}),/time zone/);
 assert.throws(()=>first({...base,processor:'Square'}),/different payment processor/);assert.throws(()=>first({...base,currency:'EUR'}),/USD/);assert.throws(()=>first({...base,rawStatus:'ASSUMED LOST'}),/reviewed GoDaddy status/);
 assert.throws(()=>first({...base,vin:'partial'}),/complete 17-character/);assert.throws(()=>first({...base,customerCollectionStage:'Delivered'}),/Record later recovery activity/);
 assert.throws(()=>first({...base,sourceNotes:'x'.repeat(6001)}),/reviewed source notes/);
 assert.throws(()=>parseGoDaddyDisputesCsv(csv(Array.from({length:201},(_,i)=>({...base,transactionId:'tx'+i,disputeId:'dispute'+i})))),/200 disputes/);
});
