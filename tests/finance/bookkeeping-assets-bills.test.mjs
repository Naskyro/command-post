import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {alignBookkeeping} from '../../lib/finance/bookkeeping.ts';
import {assetTotals,assetValues,validateAsset} from '../../lib/finance/assets.ts';
import {billAction,billBalance,validateBillEdit} from '../../lib/finance/bills.ts';
const rec=(id,kind,fields={})=>({id,kind,version:0,...fields});
const owner={id:'owner-user',person:'jerson',name:'Jerson',role:'Owner',department:'Operations',owner:true,canManage:true,canRelease:true};
const source=JSON.parse(readFileSync(new URL('../../lib/finance/source-data.json',import.meta.url)));
test('all 61 owner categories have matching unique account names and survive a rename',()=>{
 const categories=[...source.records.filter(r=>r.kind==='category'),rec('unit5','category',{name:'Vehicle Maintenance & Repairs Unit #5',accountType:'Expense',status:'Active'})];
 const records=alignBookkeeping(categories),charts=records.filter(r=>r.kind==='chart');assert.equal(charts.length,61);assert.equal(new Set(charts.map(r=>r.code)).size,61);
 for(const c of records.filter(r=>r.kind==='category'))assert.equal(charts.find(r=>r.code===c.accountCode).name,c.name);
 const cat=records.find(r=>r.id==='unit5');cat.name='Updated category';const updated=alignBookkeeping(records);assert.equal(updated.find(r=>r.kind==='chart'&&r.code===cat.accountCode).name,'Updated category');
});
test('sold trucks are excluded and unknown asset amounts remain unknown',()=>{
 const records=[rec('a','asset',{cost:1200,depreciation:200,status:'In service'}),rec('b','asset',{amount:24000,status:'Sold'}),rec('c','asset',{status:'In service'}),rec('d','account',{amount:100,accountType:'Asset',institution:'Chase'}),rec('bill','bill',{amount:80,paid:30,status:'Partly paid'}),rec('cancel','bill',{amount:500,status:'Cancelled'})];
 const t=assetTotals(records);assert.equal(t.count,2);assert.equal(t.value,1000);assert.equal(t.unvalued,1);assert.equal(t.netWorth,1050);assert.equal(assetValues(records[2]).current,null);assert.equal(assetValues(rec('zero','asset',{amount:0})).current,0);
 assert.throws(()=>validateAsset(rec('x','asset',{name:'Laptop',cost:100,depreciation:101})),/Depreciation/);
});
test('bill approval is attributed; payment cannot precede approval or exceed remaining amount',()=>{
 const bill=rec('b','bill',{vendor:'Shop',amount:100,status:'Unpaid'});
 assert.throws(()=>billAction(bill,'recordBillPayment',{amount:100,date:'2026-09-05',method:'Cash',reference:'cash-1'},owner),/Approve/);
 const approved=billAction(bill,'approveBill',{},owner);assert.equal(approved.approvedById,owner.id);assert.ok(approved.approvedAt);
 const paid=billAction(approved,'recordBillPayment',{amount:40,date:'2026-09-05',method:'Cash',reference:'cash-1'},owner);assert.equal(paid.status,'Partly paid');assert.equal(billBalance(paid),60);assert.equal(paid.payments[0].recordedById,owner.id);
 assert.throws(()=>billAction(paid,'recordBillPayment',{amount:61,date:'2026-09-05',method:'Check',reference:'2'},owner),/unpaid balance/);
 assert.throws(()=>billAction(paid,'recordBillPayment',{amount:40,date:'2026-09-05',method:'Cash',reference:'cash-1'},owner),/already recorded/);
 const settled=billAction(paid,'recordBillPayment',{amount:60,date:'2026-09-05',method:'Check',reference:'2'},owner);assert.equal(settled.status,'Paid');assert.equal(billBalance(settled),0);
});
test('generic edits cannot forge approval or payment, and amount changes require approval again',()=>{
 const bill=rec('b','bill',{vendor:'Shop',amount:100,status:'Unpaid'}),approved=billAction(bill,'approveBill',{},owner);
 assert.throws(()=>validateBillEdit({...bill,paid:100},bill),/Record payment/);
 assert.throws(()=>validateBillEdit({...bill,approvedAt:'forged'},bill),/Approve payment/);
 const changed={...approved,amount:110};validateBillEdit(changed,approved);assert.equal(changed.approvedAt,undefined);assert.equal(changed.status,'Unpaid');
 const staff={...owner,id:'staff',person:'staff',owner:false,canManage:false,canRelease:false,role:'Employee',customAccess:true,access:[{module:'Finance',tab:'Outflows',level:'View'}]};
 assert.throws(()=>billAction(bill,'approveBill',{},staff),/not assigned/);
});
