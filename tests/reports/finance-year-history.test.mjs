import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFinanceYearHistory } from '../../lib/year-history/finance.ts';
import {filterYear,historicalArchiveYear} from '../../lib/year-history/model.ts';
const actor=(...tabs)=>({person:'test-user',role:'Employee',owner:false,onboardingOnly:false,access:tabs.map(tab=>({module:'Finance',tab,level:'View'}))});
const v=actor('Reports & Taxes','Overview','Outflows','Receivables','Debts'),record=(kind,id,more={})=>({kind,id,version:1,...more});
const tx=(id,amount,more={})=>record('transaction',id,{date:'2025-12-30',amount,status:'Imported',...more});
const invoice=(id,more)=>record('invoice',id,{date:'2025-01-01',status:'Sent',...more});
test('Finance activity retains corrected, signed register amounts once, excludes private and unposted money, and never adds companion workflows to cash totals',()=>{
 const records=[tx('a',-150.02,{status:'Reconciled'}),tx('b',1,{deletedAt:'now'}),tx('c',10.20),tx('d',450,{status:'Pending'}),tx('e',1.234),tx('f',99,{matchId:'paystub123'}),tx('h',70,{description:'Sensitive payroll details'}),
  record('payment','paystub123',{amount:999999,person:'PRIVATE'}),record('receipt','receipt1',{status:'Recorded',date:'2025-12-30',amount:10.2,memo:'PRIVATE'}),
  record('cashMovement','movement',{status:'Recorded',amount:10.20,date:'2025-12-30',reference:'PRIVATE'}),invoice('i',{amount:10.2,description:'PRIVATE'}),tx('u',5,{date:'bad',description:'PRIVATE'})];
 const out=projectFinanceYearHistory(v,records,[tx('a',-150.01),tx('b',40)]);
 assert.deepEqual(out.filter(e=>e.amountCents!==undefined).map(e=>[e.id,e.amountCents]),[['a',-15002],['c',1020],['u',500]]);
 assert.equal(out.find(e=>e.id==='d').terminal,false);assert.equal(out.find(e=>e.id==='u').activityDate,'');
 const annual=filterYear(out,{module:'Finance',year:2025,view:'activity'},'2026-11-01').selected;
 assert.equal(annual.reduce((a,e)=>a+(e.amountCents||0),0),-13982);
 assert.equal(annual.find(e=>e.id==='a').category,'cash-out');assert.equal(annual.find(e=>e.id==='c').category,'cash-in');
 assert.doesNotMatch(JSON.stringify(out),/PRIVATE|Sensitive payroll|paystub123/);
});
test('open invoices survive rollover, paid bills close on actual settlement, and due dates/edited dates never fabricate settlement',()=>{
 const bills=[record('bill','partial',{status:'Partly paid',date:'2025-12-01',amount:100,paid:40,payments:[{date:'2026-01-06',amount:40}]}),
  record('bill','settled',{status:'Paid',date:'2024-09-10',amount:100,paid:100,payments:[{date:'2025-01-05',amount:75},{date:'2024-12-31',amount:25}]}),
  record('bill','legacy',{status:'Paid',amount:70,paid:70,date:'2025-01-01',due:'2025-01-30',updatedAt:'2025-12-01T12:00:00Z',payments:[{date:'2025-01-25',amount:50}]}),
  invoice('legacy-invoice',{status:'Paid',paid:100,updatedAt:'2025-12-31T12:00:00Z'}),invoice('cross-year',{status:'Paid',paidAt:'2026-01-01T01:00:00Z'}),invoice('still-open',{})];
 const rows=projectFinanceYearHistory(v,bills,[]);
 assert.equal(rows.find(r=>r.id==='partial').activityDate,'2026-01-06');
 assert.equal(rows.find(r=>r.id==='settled').closedDate,'2025-01-05');
 assert.equal(rows.find(r=>r.id==='cross-year').closedDate,'2025-12-31');
 for(const id of ['legacy','legacy-invoice','partial'])assert.equal(historicalArchiveYear(rows.find(r=>r.id===id),'2026-11-01'),null);
 assert.deepEqual(filterYear(rows,{module:'Finance',year:2025,view:'open-at-close'},'2026-11-01').items.map(r=>r.id).sort(),['partial','still-open']);
 assert.deepEqual(filterYear(rows,{module:'Finance',year:2025,view:'undated'},'2026-11-01').items.map(r=>r.id).sort(),['legacy','legacy-invoice']);
});
test('annual report requires the report permission and applies the financial source grants independently',()=>{
 const rows=[tx('t',1),record('bill','b',{status:'Unpaid'}),invoice('i',{status:'Sent'}),record('payrun','p',{status:'Released',lines:[{amount:1}]}),record('account','balance',{amount:10})];
 assert.deepEqual(projectFinanceYearHistory(actor('My pay'),rows,[]),[]);
 assert.deepEqual(projectFinanceYearHistory(actor('Reports & Taxes','Payroll'),rows,[]),[]);
 assert.deepEqual(projectFinanceYearHistory(actor('Reports & Taxes','Receivables'),rows,[]).map(r=>r.id),['i']);
 assert.deepEqual(projectFinanceYearHistory(actor('Reports & Taxes','Overview'),rows,[]).map(r=>r.id),['t']);
});

test('a bill with payments in intermediate years appears in each activity year once and never contributes a second bank movement',()=>{
 const bill=record('bill','three-years',{date:'2023-12-01',status:'Paid',amount:90,paid:90,payments:[{date:'2024-03-10',amount:10},{date:'2024-07-08',amount:20},{date:'2025-05-18',amount:40},{date:'2026-01-05',amount:20}]});
 const [row]=projectFinanceYearHistory(v,[bill],[]);
 assert.equal(row.closedDate,'2026-01-05');assert.equal(row.amountCents,undefined);
 for(const year of [2023,2024,2025,2026])assert.deepEqual(filterYear([row],{module:'Finance',year,view:'activity'},'2026-11-01').selected.map(r=>r.id),['three-years']);
 assert.equal(filterYear([row],{module:'Finance',year:2024,view:'archive'},'2026-11-01').selected.length,0);
});
