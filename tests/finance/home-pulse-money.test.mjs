import test from 'node:test';
import assert from 'node:assert/strict';
import {financePulse,moneySignals,salesFollowupSignals} from '../../lib/home/pulse-money.ts';
const rec=(kind,id,fields)=>({kind,id,version:1,...fields});
const viewer={id:'signed-in',person:'rep',name:'Rep',role:'Employee',department:'Dispatch',owner:false,canManage:false,canRelease:false};
const owner={...viewer,owner:true,role:'Owner'};
const grants=(module,...tabs)=>({...viewer,access:tabs.map(tab=>({module,tab,level:'View'})),customAccess:true});
const day=new Date('2026-11-02T05:01:00Z'); // Nov 1 in Austin after DST ends; UTC is Nov 2.
const tx=(id,date,amount,category='Fuel')=>rec('transaction',id,{date,amount,category});
const category=(id,cap)=>rec('category',id,{name:id,accountType:'Expense',status:'Active',budgetMode:'Monthly budget',budgetAmount:cap});
const lead=(id,fields)=>({id,name:id,kind:'opportunity',assignee:'rep',stage:'Engaged',dueDate:'2026-11-01',nextAction:'Meeting',...fields});
test('Finance pulse counts period-specific budget exceptions and discounts refunds; future transactions, draft limits and receipt duplicates never count',()=>{
 const rows=[category('Fuel',500),rec('budget','signed',{category:'Fuel',period:'2026-11',status:'Approved',amount:100}),rec('budget','proposed',{category:'Fuel',period:'2026-11',status:'Suggested',amount:50}),
 tx('correction','2026-11-01',-140),tx('refund','2026-11-01',20),tx('future','2026-11-02',-600),rec('expense','duplicate-receipt',{category:'Fuel',date:'2026-11-01',amount:140}),tx('prior','2026-10-27',-570)];
 const [over]=financePulse(owner,rows,day,[tx('correction','2026-11-01',-900),tx('september','2026-09-30',-9500)]);
 assert.equal(over.count,2);assert.ok(over.items.some(x=>x.at==='2026-11-01'&&x.title==='Fuel · $20.00 Over'&&x.detail.includes('$120.00 net spending / $100.00 budget')));
 assert.ok(over.items.some(x=>x.at==='2026-10-27'&&x.detail.includes('Oct 2026')));assert.match(over.description,/2 crossed/);
 const [refunded]=financePulse(owner,[...rows,tx('refund2','2026-11-01',21)],day,[]);assert.equal(refunded.count,1);assert.equal(refunded.items[0].at,'2026-10-27');
});
test('Budget pin distinguishes no inputs from within-limit; zero is valid only when explicitly configured',()=>{
 const [unconfigured]=financePulse(owner,[tx('large','2026-11-01',-3000)],day,[]);assert.equal(unconfigured.displayValue,'—');assert.match(unconfigured.description,/No monthly spending limits/);
 const [missingBank]=financePulse(owner,[category('Fuel',100)],day,[]);assert.equal(missingBank.displayValue,'—');assert.match(missingBank.description,/no bank transactions/);
 const [within]=financePulse(owner,[category('Fuel',100),tx('bank','2026-11-01',-100)],day,[]);assert.equal(within.count,0);assert.equal(within.displayValue,undefined);
 const [zero]=financePulse(owner,[category('Fuel',0),tx('bank','2026-11-01',-0.01)],day,[]);assert.equal(zero.count,1);assert.match(zero.items[0].detail,/\$0\.00 budget/);
});
test('Only authorized Finance surfaces appear, and dated open obligations are distinguished from taxes to verify',async()=>{
 const bill=(id,due,status,amount=200,paid=0)=>rec('bill',id,{due,status,amount,paid,vendor:id});
 const tax=(id,due,filingStatus,paymentStatus)=>rec('tax',id,{name:id,agency:'Agency',due,filingStatus,paymentStatus});
 const rows=[bill('Part paid','2026-10-30','Partly paid',350,100),bill('Paid','2026-10-01','Paid'),bill('Draft','2026-11-01','Draft'),bill('Later','2026-11-15','Unpaid'),tax('Accepted and paid','2026-11-01','Accepted','Paid'),tax('Payment pending','2026-11-14','Accepted','Due'),tax('Undated','','History to verify','Unconfirmed')];
 assert.deepEqual(await moneySignals(grants('Finance','My pay','My spending'),rows,day),[]);
 const [b]=financePulse(grants('Finance','Outflows'),rows,day,[]);assert.equal(b.count,1);assert.equal(b.items[0].detail,'$250.00 outstanding');assert.equal(b.items[0].calendar,true);
 const [t]=financePulse(grants('Finance','Reports & Taxes'),rows,day,[]);assert.equal(t.count,1);assert.equal(t.items[0].title,'Payment pending');assert.match(t.description,/1 without a confirmed due date/);assert.ok(!JSON.stringify(t).includes('Part paid'));
});
test('Sales reps see their open follow-ups; restricted tabs, sample leads, and other reps never appear',()=>{
 const all=[lead('mine',{}),lead('private',{assignee:'other'}),lead('sample',{example:true}),lead('sales-example:training',{}),lead('closed',{stage:'Lost'}),lead('later',{dueDate:'2026-11-08'})];
 const [rep]=salesFollowupSignals(grants('Sales CRM','activity'),[],all,day);assert.deepEqual(rep.items.map(x=>x.id),['mine']);assert.equal(rep.items[0].calendar,true);
 assert.deepEqual(salesFollowupSignals(grants('Sales CRM','pipeline'),[],all,day),[]);assert.equal(salesFollowupSignals(owner,[],all,day)[0].count,2);
});
