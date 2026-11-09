import test from 'node:test';
import assert from 'node:assert/strict';
import {canPrepareCcrExpense, expenseFromCost, parseCostKey, costKey} from '../../lib/ccr/expense-handoff.ts';
const grant=(module,tab,level='Edit')=>({module,tab,level});
const c=grant('Compliance, Claims & Recovery','recovery'), f=grant('Finance','My spending');
const viewer=(...access)=>({id:'worker-session',person:'posting-user',role:'Employee',owner:false,access});
const line={id:'line-1',kind:'Certified Mail Postage',day:'2026-11-01',cents:1285,reference:'secret cardholder and evidence filename.pdf'};
test('A saved postage receipt becomes one unsaved Finance draft. Private evidence, principal and repayments do not cross modules.',()=>{
 const v=viewer(c,f),draft=expenseFromCost(v,'case-1',line);
 assert.deepEqual([draft.version,draft.status,draft.amount,draft.date,draft.kind],[0,'Draft',12.85,'2026-11-01','expense']);
 assert.equal(draft.id,expenseFromCost(v,'case-1',{...line,cents:1200}).id);
 assert.doesNotMatch(JSON.stringify(draft),/secret cardholder|filename\.pdf/);
 assert.deepEqual(parseCostKey(draft.id),{caseId:'case-1',entryId:'line-1'});assert.equal(draft.receipt,'Not attached');
 assert.throws(()=>expenseFromCost(v,'case-1',{...line,kind:'Cash Repayment'}));
 assert.throws(()=>costKey('a:b','c'));assert.throws(()=>parseCostKey('ccr-cost:a:b:c'));
});
test('CCR and Finance edit grants are required; personal Finance permission cannot reveal a CCR case.',()=>{
 for (const v of [viewer(f),viewer(c),viewer(c,{...f,level:'View'}),viewer({...c,level:'View'},f),{...viewer(c,f),onboardingOnly:true}]) {
  assert.equal(canPrepareCcrExpense(v),false);assert.throws(()=>expenseFromCost(v,'case-1',line));
 }
 assert.equal(canPrepareCcrExpense(viewer(c,grant('Finance','Outflows'))),true);
});
