import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financeProjection,financeCatalog} from '../../lib/reports/finance.ts';
import {homeFinanceProjection} from '../../lib/reports/finance-register.ts';
const clock=new Date('2026-11-01T18:00Z'),owner={owner:true,id:'owner',person:'owner',name:'Owner',role:'Owner',department:'Operations',canRelease:true};
const grants=(...tabs)=>({...owner,owner:false,person:'rep',role:'Employee',canManage:false,canRelease:false,access:tabs.map(tab=>({module:'Finance',tab,level:'View'}))});
const rec=(kind,id,fields)=>({kind,id,version:1,...fields});
const run=(id,records=[],f={},v=owner,imported=[])=>financeProjection(v,records,id,f,imported,clock);
const tx=(id,date,amount,category='Sales')=>rec('transaction',id,{date,amount,category});
const cats=[rec('category','sales',{name:'Sales',accountType:'Income'}),rec('category','capital',{name:'Owner Contribution',accountType:'Income'}),rec('category','fuel',{name:'Fuel',accountType:'Expense'})];
test('Finance catalog applies exact report/source grants; all published definitions execute against real register schema',()=>{
 const permitted=financeCatalog(grants('Reports & Taxes'),[]);assert.ok(permitted.length>1);assert.ok(permitted.every(d=>d.group==='Accounting & Tax'));
 assert.deepEqual(financeCatalog(grants('Payroll'),[]),[]);assert.throws(()=>run('payroll-gross',[],{},grants('Overview','Reports & Taxes')),/outside/);
 assert.equal(homeFinanceProjection(grants('Reports & Taxes'),[],[],clock),null);
 const {records,transactions}=JSON.parse(readFileSync(new URL('../../lib/finance/source-data.json',import.meta.url)));const defs=financeCatalog(owner,records);
 assert.equal(new Set(defs.map(d=>d.id)).size,defs.length);assert.ok(defs.length>=40);
 for(const d of defs){const data=run(d.id,records,{},owner,transactions);assert.ok(data.columns.length&&Array.isArray(data.rows)&&Array.isArray(data.chart),d.id);}
 const series=run('monthly-revenue',records,{},owner,transactions);assert.ok(series.rows.some(r=>r.revenue>0));assert.equal(series.rows.at(-1).month,'2026-09');assert.equal(run('monthly-revenue',records,{from:'2026-10-01'},owner,transactions).rows.length,0);
});
test('Home preserves missing months, omits owner financing from operating receipts, and compares only adjacent covered periods',()=>{
 const source=[tx('anchor','2026-06-01',1),tx('jul','2026-07-02',150),tx('aug','2026-08-20',100),tx('sep','2026-09-02',50),tx('owner','2026-08-01',7000,'Owner Contribution'),tx('fuel1','2026-07-02',-35,'Fuel'),tx('fuel2','2026-08-15',-15,'Fuel'),tx('future','2026-12-01',10000)];
 const saved=[tx('aug','2026-08-20',80),{...tx('sep','2026-09-02',50),deletedAt:'2026-09-03'},tx('last','2026-09-03',0)];
 const home=homeFinanceProjection(owner,[...cats,...saved],source,clock); const get=m=>home.months.find(x=>x.month===m);
 assert.equal(home.through,'2026-09-03');assert.equal(get('2026-08').revenue,80);assert.equal(get('2026-08').netCash,7065);assert.equal(get('2026-09').revenue,0);assert.equal(get('2026-09').complete,false);assert.equal(get('2026-10').revenue,null);
 const [revenue,expense,cash]=home.comparisons;assert.equal(revenue.change,-70);assert.equal(revenue.assessment,'unfavorable');assert.equal(expense.assessment,'favorable');assert.equal(cash.assessment,'neutral');
 assert.deepEqual(run('cash-vs-expense',[...cats,...saved],{from:'2026-08-01',to:'2026-08-31'},owner,source).chart,[{label:'2026-08',x:80,value:15}]);
 assert.equal(run('monthly-revenue',[...cats,...saved],{from:'2026-09-01'},owner,source).rows[0].revenue,0);
});
test('Outstanding invoices exclude drafts and settled balances, preserve partial payments, and present due-date gaps explicitly',()=>{
 const invoices=[rec('invoice','1',{name:'North',date:'2026-07-11',due:'2026-10-01',amount:240,paid:80,status:'Partly paid'}),rec('invoice','2',{name:'West',amount:50,status:'Sent'}),rec('invoice','3',{name:'West',amount:1000,status:'Draft'}),rec('invoice','4',{name:'West',amount:75,paid:75,status:'Paid'})];
 const result=run('ar-aging',invoices);assert.deepEqual(result.rows.map(r=>[r.label,r.value]),[['31–60 days overdue',160],['Due date missing',50]]);
 assert.throws(()=>run('ar-aging',invoices,{from:'2026-01-01'}),/filter/);
});
test('Pay reporting reads released payroll and retains individual authorized lines for a restricted viewer',()=>{
 const line=(person,name,gross)=>({person,name,gross,department:'Dispatch',periodEnd:'2026-10-09'});const records=[rec('payrun','run',{status:'Released',lines:[line('rep','Representative',100),line('private-worker','Private Name',900)]}),rec('payrun','draft',{status:'Draft',lines:[line('rep','Representative',5000)]})];
 const result=run('payroll-gross',records,{},grants('Payroll','Reports & Taxes'));assert.equal(result.rows[0].value,100);assert.equal(result.details.rows.length,1);assert.ok(!JSON.stringify(result).includes('Private'));
 assert.deepEqual(run('payroll-gross',records,{person:'private-worker'},grants('Payroll','Reports & Taxes')).rows,[]);
});
test('Ledger income excludes drafts and cash injections; balance sheet carries earnings in equity',()=>{
 const records=[rec('chart','asset',{code:'1000',name:'Checking',accountType:'Asset'}),rec('chart','income',{code:'4000',name:'Sales',accountType:'Income'}),rec('chart','fund',{code:'3000',name:'Capital',accountType:'Equity'}),rec('journal','posted',{status:'Posted',date:'2026-08-01',lines:[{account:'1000',debit:100},{account:'4000',credit:35},{account:'3000',credit:65}]}),rec('journal','draft',{status:'Draft',date:'2026-08-01',lines:[{account:'4000',credit:999}]})];
 assert.equal(run('ledger-profit-loss',records).rows[0].amount,35);const {rows}=run('balance-sheet',records,{to:'2026-08-02'});assert.equal(rows.find(r=>r.type==='Asset').amount,100);assert.equal(rows.filter(r=>r.type==='Equity').reduce((s,r)=>s+r.amount,0),100);assert.deepEqual(run('balance-sheet',records,{to:'2026-07-01'}).rows,[]);
});
