import type {FinRecord,Viewer} from '../finance/model';
import type {ReportFilters,ReportResult,ReportRow,ReportColumn,ReportDefinition,ChartPoint} from './types';
import {visible} from '../finance/visibility.ts';
import {canAccess} from '../finance/access.ts';
import {money} from '../finance/model.ts';
import {localDate} from '../finance/timeclock.ts';
import {billBalance} from '../finance/bills.ts';
import {displayPersonName} from '../people/display-name.ts';
import {AppError,ForbiddenError} from '../shared/errors.ts';
import {financeSpecs,allFinanceSpecs} from './finance-catalog.ts';
import {bankEntries,aggregateMonths,round,day,moneyValue,definitions,real,homeFinanceProjection} from './finance-register.ts';

const c=(key:string,label:string,format:ReportColumn['format']='text'):ReportColumn=>({key,label,format});
const amount=c('amount','Amount','money'),count=c('count','Records','number'),dateCol=c('date','Date','date'),dept=c('department','Department'),person=c('employee','Employee'),status=c('status','Status');
const str=(x:unknown,fallback='Unspecified')=>typeof x==='string'&&x.trim()?x.trim():fallback;
const array=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
const val=(r:Record<string,unknown>,k:string)=>moneyValue(r[k]);
const nsum=(a:(number|null)[])=>a.some(n=>n!=null)?round(a.reduce<number>((s,n)=>s+(n??0),0)):null;
const sourceKinds=new Set(['category','budget','transaction','expense','expenseReport','subscription','bill','invoice','receipt','recovery','cashMovement','debt','debtPayment','payrun','tax','journal','chart','close','person','department','settings']);
type Table={columns:ReportColumn[],rows:ReportRow[]};
const table=(columns:ReportColumn[],rows:ReportRow[],note?:string):ReportResult=>({columns,rows,chart:[],note,metric:{label:'Matching Records',value:String(rows.length)}});
function groupTable(d:Table,key:string,groupLabel:string,field:string|undefined,fLabel:string,note:string,format:ReportColumn['format']='money',order='largest'):ReportResult{
 const bag=new Map<string,ReportRow[]>();
 for(const r of d.rows){const k=str(r[key],'Unspecified'),list=bag.get(k)||[];list.push(r);bag.set(k,list);}
 const data=[...bag].map(([label,r])=>({label,count:r.length,value:field?nsum(r.map(x=>typeof x[field]==='number'?Number(x[field]):null)):r.length})).sort((a,b)=>order==='alpha'?a.label.localeCompare(b.label):Number(b.value)-Number(a.value)||a.label.localeCompare(b.label));
 return {columns:[c('label',groupLabel),...(field?[count]:[]),c('value',fLabel,field?format:'number')],rows:data,chart:data.filter(r=>r.value!==null).map(r=>({label:r.label,value:r.value!})),details:d,note,metric:field?{label:fLabel,value:data.some(r=>r.value!==null)?(format==='money'?money(nsum(data.map(r=>r.value))):String(nsum(data.map(r=>r.value)))):'—'}:{label:'Matching Records',value:String(d.rows.length)}};
}
const inRange=(d:string,f:ReportFilters)=>!f.from&&!f.to||!!d&&(!f.from||d>=f.from)&&(!f.to||d<=f.to);
const age=(due:string,today:string)=>{if(!due)return 'Due date missing';const n=(+new Date(today+'T12:00Z')-+new Date(due+'T12:00Z'))/86400000;return n<0?'Not yet due':n===0?'Due today':n<=30?'1–30 days overdue':n<=60?'31–60 days overdue':n<=90?'61–90 days overdue':'Over 90 days overdue';};
const monthCol=c('month','Month'),labelCol=c('name','Name');
export const financeCatalog=(v:Viewer,_records:FinRecord[]):ReportDefinition[]=>financeSpecs(v).map(({tab,...pub})=>pub);
export async function homeFinancialAnalytics(v:Viewer,records:FinRecord[],now=new Date()){if(v.onboardingOnly||!canAccess(v,'Finance','Overview'))return null;const {sourceTransactions}=await import('../finance/seed');return homeFinanceProjection(v,records,sourceTransactions,now);}
export async function runFinanceReport(v:Viewer,records:FinRecord[],id:string,filters:ReportFilters={}){
 if(!financeSpecs(v).some(s=>s.id===id))throw new ForbiddenError('This report is outside your Finance permissions.');
 const imported=bankReport(id)?(await import('../finance/seed')).sourceTransactions:[];
 return financeProjection(v,records,id,filters,imported);
}
const bankReport=(id:string)=>['Cash & Revenue','Banking & Controls'].includes(allFinanceSpecs.find(s=>s.id===id)?.group||'')||['operating-cost-mix','spending-groups','approved-budgets'].includes(id);
export function financeProjection(v:Viewer,records:FinRecord[],id:string,f:ReportFilters,imported:FinRecord[],now=new Date()):ReportResult{
 const spec=financeSpecs(v).find(s=>s.id===id);if(!spec)throw new ForbiddenError('This report is outside your Finance permissions.');
 for(const [k,value] of Object.entries(f))if(value&&!spec.filters?.includes(k as keyof ReportFilters))throw new AppError('This filter does not apply to this report.');
 const today=localDate(now),base=records.filter(r=>sourceKinds.has(r.kind)&&real(r)),data=visible(v,base),get=(kind:string)=>data.filter(r=>r.kind===kind),names=new Map(data.filter(s=>s.kind==='person').map(s=>[s.id,displayPersonName(s)||s.id]));
 const name=(id:unknown)=>names.get(String(id))||str(id,'Unassigned');
 const matchWho=(p:unknown,d:unknown)=>(!f.person||[String(p),name(p)].some(n=>n.toLowerCase()===f.person!.trim().toLowerCase()))&&(!f.department||String(d||'').toLowerCase()===f.department.trim().toLowerCase());
 if(bankReport(id)){
  const bank=bankEntries(records,imported),rows=bank.filter(t=>t.date<=today&&inRange(t.date,f)),month=aggregateMonths(rows);
  const cols=[dateCol,c('description','Bank Entry'),c('category','Category'),c('group','Cost Group'),c('classification','Treatment'),status,amount];
  const dRows=(rr:typeof bank,oper?:'revenue'|'spending'):ReportRow[]=>rr.map(t=>({date:t.date,description:t.description,category:t.category,group:t.group,classification:t.classification,status:t.status,amount:oper?t[oper]:t.amount}));
  const dates=bank.length?'Register entries span '+bank[0].date+' through '+bank[bank.length-1].date+'.':'There are no dated bank entries.';
  const note='Months without entries are omitted; an observed zero is retained. '+dates;
  const tableOf=(rr:typeof bank,oper?:'revenue'|'spending')=>({columns:cols,rows:dRows(rr,oper)});
  if(['monthly-revenue','monthly-expense','monthly-cash-flow','cash-vs-expense','cash-in-out','cash-activity'].includes(id)){
   const fields:Record<string,[keyof typeof month[number],string,ReportColumn['format']][]>={'monthly-revenue':[['revenue','Operating Receipts','money']],'monthly-expense':[['spending','Operating Spending','money']],'monthly-cash-flow':[['netCash','Net Cash Flow','money']],'cash-vs-expense':[['revenue','Operating Receipts (X)','money'],['spending','Operating Spending (Y)','money']],'cash-in-out':[['inflow','Deposits','money'],['outflow','Withdrawals','money']],'cash-activity':[['credits','Credit Entries','number'],['debits','Debit Entries','number'],['transactionCount','Total Entries','number']]};
   const fs=fields[id],key=fs[0][0],out:ReportRow[]=month.map(m=>Object.fromEntries([['month',m.month],...fs.map(([field])=>[field,m[field]])])),chart:ChartPoint[]=id==='cash-vs-expense'?month.map(m=>({label:m.month,x:m.revenue,value:m.spending})):month.flatMap(m=>fs.map(([field,label])=>({label:m.month,value:Number(m[field]),...(fs.length>1?{series:label}:{})})));
   const basis=id==='monthly-revenue'?definitions.revenue:id==='monthly-expense'?definitions.spending:id==='monthly-cash-flow'?definitions.netCash:id==='cash-vs-expense'?'Each dot is an observed month; X is receipts and Y is net expenses.':'';
   const source=key==='revenue'&&id!=='cash-vs-expense'?tableOf(rows.filter(r=>r.revenue!==0),'revenue'):key==='spending'?tableOf(rows.filter(r=>r.spending!==0),'spending'):tableOf(rows);
   return {columns:[monthCol,...fs.map(([k,label,fmt])=>c(k,label,fmt))],rows:out,chart,details:source,note:[basis,note].filter(Boolean).join(' '),metric:{label:fs.length>1?'Observed Months':fs[0][1],value:fs.length>1?String(month.length):month.length?money(nsum(month.map(m=>Number(m[key])))):'—'}};
  }
  if(id==='cash-review'||id==='bank-uncategorized'){const rr=rows.filter(t=>id==='cash-review'?t.needCash:t.unmapped);return table(cols,dRows(rr),dates);}
  if(id==='approved-budgets'){
   const limits=new Map<string,number>();const allCats=base.filter(c=>c.kind==='category'&&c.accountType==='Expense'&&c.status!=='Archived'&&c.budgetMode==='Monthly budget'),periods=new Set(rows.map(x=>x.date.slice(0,7)));
   const monthlyIn=(m:string)=>(!f.from||m>=f.from.slice(0,7))&&(!f.to||m<=f.to.slice(0,7));
   if(monthlyIn(today.slice(0,7)))periods.add(today.slice(0,7));for(const b of get('budget'))if(b.status==='Approved'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.period))&&monthlyIn(String(b.period)))periods.add(String(b.period));
   for(const m of periods)for(const cat of allCats){const n=moneyValue(cat.budgetAmount);if(n!=null&&n>=0&&(m===today.slice(0,7)||cat.updatedAt&&String(cat.updatedAt).slice(0,7)<=m))limits.set(m+'|'+cat.name,n);}
   const latest=get('budget').filter(b=>b.status==='Approved'&&periods.has(String(b.period))&&b.category).sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||''))||a.version-b.version||b.id.localeCompare(a.id));
   for(const b of latest){const n=val(b,'amount');if(n!=null&&n>=0)limits.set(b.period+'|'+b.category,n);}
   const amounts=new Map<string,number>(),covered=new Set<string>();for(const t of bank){const m=t.date.slice(0,7);if(t.date>today||!periods.has(m))continue;covered.add(m);const k=m+'|'+t.category;amounts.set(k,(amounts.get(k)||0)-Math.round(t.amount*100));}
   const out:ReportRow[]=[...limits].map(([k,limit])=>{const p=k.indexOf('|'),month=k.slice(0,p),category=k.slice(p+1),actual=covered.has(month)?(amounts.get(k)||0)/100:null;return {month,category,limit,actual,variance:actual==null?null:round(actual-limit)};}).sort((a,b)=>String(b.month).localeCompare(String(a.month))||Number(b.variance)-Number(a.variance));
   return {...table([monthCol,c('category','Category'),c('limit','Monthly Limit','money'),c('actual','Actual Spending','money'),c('variance','Over / (Under) Limit','money')],out),chart:out.filter(r=>typeof r.variance==='number').map(r=>({label:r.month+' · '+r.category,value:Number(r.variance)})),note:'Date filters select whole budget months. Positive variance means over budget. Approved month-specific limits take precedence. Current general limits without history are not backdated. '+dates};
  }
  if(id==='bank-status')return groupTable(tableOf(rows),'status','Register Status',undefined,'Bank Entries',dates);
  if(id==='cash-treatment')return groupTable(tableOf(rows),'classification','Treatment','amount','Net Cash Movement',definitions.netCash);
  if(id==='receipts-stream')return groupTable(tableOf(rows.filter(t=>t.revenue!==0),'revenue'),'category','Income Category','amount','Operating Receipts',definitions.revenue);
  return groupTable(tableOf(rows.filter(t=>t.spending!==0),'spending'),id==='spending-groups'?'group':'category',id==='spending-groups'?'Cost Group':'Expense Category','amount','Net Spending',definitions.spending);
 }
 const periodNote='Dated records only are included in time series. Figures reflect the records in this workflow, not additional bank transactions.';
 const when=(r:FinRecord,key='date')=>day(r[key]),dateRange=(r:FinRecord,key='date')=>inRange(when(r,key),f);
 const D=(columns:ReportColumn[],rows:ReportRow[])=>({columns,rows});
 const employees=new Map(base.filter(r=>r.kind==='person').map(p=>[p.id,str(p.department,'')]));
 const org=(r:FinRecord)=>str(r.department,employees.get(String(r.person))||'');
 if(['expense-vendors','expense-method','receipt-exceptions','expense-status'].includes(id)){
  const workflow=id==='expense-status',key=workflow?'period':'date';
  const rr=get(workflow?'expenseReport':'expense').filter(r=>dateRange(r,key)&&matchWho(r.person,org(r))&&(id!=='receipt-exceptions'||r.receipt!=='Attached'));
  const d=D(workflow?[dateCol,c('end','Week Ending','date'),person,dept,status]:[dateCol,person,dept,c('vendor','Vendor'),c('category','Category'),c('method','Paid With'),c('receipt','Receipt'),status,amount],rr.map(r=>({date:when(r,key)||null,end:when(r,'periodEnd')||null,employee:name(r.person),department:org(r)||null,vendor:str(r.vendor),category:str(r.category),method:str(r.method),receipt:str(r.receipt,'Not recorded'),status:str(r.status),amount:val(r,'amount')})));
  if(id==='receipt-exceptions')return table(d.columns,d.rows,'Purchases are listed when the receipt field does not say Attached. The register includes drafts and returned purchases.');
  if(workflow)return groupTable(d,'status','Approval Status',undefined,'Weekly Reports','Date range uses the week beginning. Status shows each report’s current workflow state.');
  return groupTable(d,id==='expense-vendors'?'vendor':'method',id==='expense-vendors'?'Vendor':'Payment Method','amount','Recorded Purchases','All non-void purchase records, including draft and review statuses; status is shown in the detail. These are not added to bank charges.');
 }
 if(['ap-aging','ap-vendors','bills-due','ar-aging','ar-clients','invoices-issued'].includes(id)){
  const ap=['ap-aging','ap-vendors','bills-due'].includes(id),issued=id==='invoices-issued',rows=get(ap?'bill':'invoice').filter(r=>r.status!=='Draft'&&(issued?!!when(r)&&dateRange(r):r.status!=='Paid'&&(val(r,'amount')===null||billBalance(r)>0))&&(id!=='bills-due'||dateRange(r,'due')));
  const d=D([c('party',ap?'Vendor':'Client / Property'),c('invoice','Invoice'),dateCol,c('due','Due','date'),status,c('billed','Original Amount','money'),c('paid','Recorded Payments','money'),c('amount','Outstanding','money'),c('age','Age')],rows.map(r=>({party:str(ap?r.vendor:r.name),invoice:str(r.invoice,''),date:when(r)||null,month:when(r).slice(0,7),due:when(r,'due')||null,status:str(r.status),billed:val(r,'amount'),paid:val(r,'paid'),amount:val(r,'amount')==null?null:billBalance(r),age:age(when(r,'due'),today)})));
  if(issued)return groupTable(d,'month','Invoice Month','billed','Invoiced Amount','Issued invoices by invoice date. A payment applied later does not change the original invoiced amount.','money','alpha');
  const note='Current outstanding amounts as of '+today+'. Disputed open balances are included; drafts and paid records are excluded. Missing due dates are kept separate.';
  if(id==='bills-due')return table(d.columns,d.rows.sort((a,b)=>str(a.due,'9999').localeCompare(str(b.due,'9999'))),note+' Filters select the due date.');
  const byAge=id.endsWith('aging');return groupTable(d,byAge?'age':'party',byAge?'Age':ap?'Vendor':'Client / Property','amount','Outstanding Balance',note);
 }
 if(id==='bill-payments'){
  const d=D([dateCol,c('vendor','Vendor'),c('invoice','Invoice'),c('method','Payment Method'),amount],get('bill').flatMap(r=>array(r.payments).filter(p=>inRange(day(p.date),f)).map(p=>({date:day(p.date)||null,vendor:str(r.vendor),invoice:str(r.invoice,''),method:str(p.method),amount:val(p,'amount')}))));
  return groupTable(d,'method','Payment Method','amount','Bill Payments','Amounts are individual payment events; the bill total is not counted for each payment.');
 }
 if(id==='subscriptions'){
  return table([labelCol,c('vendor','Vendor'),c('due','Next Renewal','date'),c('cancel','Cancel By','date'),c('frequency','Frequency'),amount,status],get('subscription').filter(r=>dateRange(r,'due')).map(r=>({name:str(r.name),vendor:str(r.vendor),due:when(r,'due')||null,cancel:when(r,'cancelBy')||null,frequency:str(r.frequency),amount:val(r,'amount'),status:str(r.status)})).sort((a,b)=>str(a.due,'9999').localeCompare(str(b.due,'9999'))),'Amounts are per recorded billing cycle, not normalized annual totals. Filters use the next due date.');
 }
 if(['release-receipts','release-method','release-outcomes','receipts-unmatched'].includes(id)){
  const d=D([dateCol,c('vehicle','Towbook Call / Vehicle'),c('property','Property'),c('method','Payment Method'),c('outcome','Outcome'),status,amount],get('receipt').filter(r=>dateRange(r)&&(id!=='release-receipts'||!!when(r))&&(id!=='receipts-unmatched'||!r.bankMatch)).map(r=>{const a=val(r,'amount');return {date:when(r)||null,month:when(r).slice(0,7),vehicle:str(r.name),property:str(r.property,''),method:str(r.method),outcome:str(r.type),status:str(r.status),amount:a!=null&&['Refund','Chargeback'].includes(String(r.type))?-Math.abs(a):a};}));
  const note='Based on recorded customer receipt outcomes. Refunds and chargebacks reduce net collections; disputed entries remain labeled in the detail. This is not additional bank revenue.';
  if(id==='receipts-unmatched')return table(d.columns,d.rows,note);
  if(id==='release-outcomes')return groupTable(d,'outcome','Release Outcome',undefined,'Receipts',note);
  const monthly=id==='release-receipts';return groupTable(d,monthly?'month':'method',monthly?'Receipt Month':'Payment Method','amount','Net Receipts',note,'money',monthly?'alpha':'largest');
 }
 if(id==='lien-recovery'){
  return table([dateCol,c('vehicle','Vehicle / Call'),c('property','Property'),c('charges','Original Charges','money'),c('prior','Prior Payments','money'),c('proceeds','Sale Proceeds','money'),c('cost','Selling Costs','money'),c('commission','Commission','money'),c('surplus','Recorded Surplus','money'),status],get('recovery').filter(r=>dateRange(r)&&r.status!=='Draft').map(r=>({date:when(r)||null,vehicle:str(r.name),property:str(r.property,''),charges:val(r,'charges'),prior:val(r,'priorPayments'),proceeds:val(r,'amount'),cost:val(r,'cost'),commission:val(r,'commission'),surplus:val(r,'surplus'),status:str(r.status)})),'Recorded recoveries and those in accounting review. A blank financial field has not been entered.');
 }
 if(id==='cash-movements'){
  const d=D([dateCol,c('type','Movement Type'),c('bag','Cash Bag'),person,dept,c('match','Bank Match'),amount],get('cashMovement').filter(r=>dateRange(r)&&matchWho(r.person,org(r))).map(r=>({date:when(r)||null,type:str(r.type),bag:str(r.cashBag,''),employee:name(r.person),department:org(r)||null,match:r.bankMatch?'Linked':'Unmatched',amount:val(r,'amount')})));
  const res=groupTable(d,'type','Movement Type','amount','Movement Volume','Amounts are movements by type. Opposite transfers can describe the same cash; the sum is not a safe balance or bank income.');res.metric={label:'Movement Records',value:String(d.rows.length)};return res;
 }
 if(['debt-register','debt-direction'].includes(id)){
  const d=D([labelCol,c('direction','Direction'),dateCol,c('due','Next Due','date'),c('opening','Original','money'),c('amount','Recorded Balance','money'),c('payment','Planned Payment','money'),c('rate','Annual Rate','percent'),status],get('debt').map(r=>({name:str(r.name),direction:str(r.direction),date:when(r)||null,due:when(r,'due')||null,opening:val(r,'original'),amount:val(r,'amount'),payment:val(r,'payment'),rate:val(r,'rate'),status:str(r.status)})));
  if(id==='debt-register')return table(d.columns,d.rows,'Recorded balance snapshots, including historical balances and amounts awaiting verification. They are not a verified current payoff quote.');
  const g=groupTable({...d,rows:d.rows.filter(r=>r.status==='Active')},'direction','Debt Direction','amount','Recorded Active Balance','Only debt marked Active is included. Unknown direction is shown separately.');g.metric={label:'Active Debts',value:String(g.details?.rows.length||0)};return g;
 }
 if(id==='debt-service'){
  const d=D([dateCol,c('debt','Debt'),c('method','Payment Method'),amount,c('principal','Principal','money'),c('interest','Interest','money')],get('debtPayment').filter(r=>!!when(r)&&dateRange(r)).map(r=>({date:when(r),month:when(r).slice(0,7),debt:str(get('debt').find(x=>x.id===r.debt)?.name,str(r.debt)),method:str(r.method),amount:val(r,'amount'),principal:val(r,'principal'),interest:val(r,'interest')})));
  return groupTable(d,'month','Payment Month','amount','Debt Payments',periodNote,'money','alpha');
 }
 if(spec.group==='Payroll'){
  const byDept=id==='payroll-dept',byPerson=id==='payroll-commission',keys:Record<string,[string,string]>={'payroll-gross':['gross','Gross Pay'],'payroll-employer':['cost','Employer Cost'],'payroll-withholding':['withheld','Employee Tax Withheld'],'payroll-commission':['commission','Commission'],'payroll-dept':['gross','Gross Pay'],'payroll-reimbursement':['reimbursed','Reimbursements']},[field,label]=keys[id];
  const cols=[dateCol,person,dept,c(field,label,'money'),...(id==='payroll-employer'?[c('gross','Gross Pay','money'),c('tax','Employer Taxes','money'),c('reimbursed','Reimbursements','money')]:[])];
  const rows=get('payrun').filter(p=>p.status==='Released').flatMap(p=>array(p.lines).flatMap(l=>{const dt=day(l.periodEnd)||when(p,'periodEnd');if(!dt||!inRange(dt,f)||!matchWho(l.person,l.department))return [];const row:ReportRow={date:dt,employee:str(l.name,name(l.person)),department:str(l.department),[field]:val(l,field)};if(id==='payroll-employer')Object.assign(row,{gross:val(l,'gross'),tax:val(l,'employerTaxes'),reimbursed:val(l,'reimbursed')});return [row];}));
  return groupTable(D(cols,rows),byDept?'department':byPerson?'employee':'date',byDept?'Department':byPerson?'Employee':'Pay Period Ending',field,label,'Only authorized employee lines from released payroll are included. Dates are pay period end dates.','money',byDept||byPerson?'largest':'alpha');
 }
 if(id==='tax-deadlines'){
  return table([labelCol,c('year','Tax Year'),c('agency','Agency'),c('period','Filing Period'),c('due','Due','date'),c('filed','Filed','date'),c('filing','Filing Status'),c('payment','Payment Status'),amount,c('paid','Paid','money')],get('tax').filter(r=>dateRange(r,'due')).map(r=>({name:str(r.name),year:str(String(r.year||''),''),agency:str(r.agency),period:str(r.period,''),due:when(r,'due')||null,filed:when(r,'filedDate')||null,filing:str(r.filingStatus),payment:str(r.paymentStatus),amount:r.filingStatus==='History to verify'&&val(r,'amount')===0?null:val(r,'amount'),paid:r.paymentStatus==='Unconfirmed'&&val(r,'paid')===0?null:val(r,'paid')})),'Filters use the filing due date. Unknown tax history and unconfirmed payments are not shown as verified zero liabilities.');
 }
 if(id==='close-progress'){
  const checks={bankDone:'Banks',cashDone:'Cash',payrollDone:'Payroll',receivablesDone:'Receivables & Payables',assetsDone:'Assets & Adjustments',taxDone:'Tax Obligations'},rr=get('close').filter(r=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(r.period))&&(!f.from||String(r.period)>=f.from.slice(0,7))&&(!f.to||String(r.period)<=f.to.slice(0,7)));
  const rows=rr.map(r=>{const done=Object.keys(checks).filter(k=>r[k]===true).length;return {month:str(r.period),status:str(r.status),done,pending:6-done,value:round(done/6*100)};}).sort((a,b)=>a.month.localeCompare(b.month));
  return {...table([monthCol,status,c('done','Checks Complete','number'),c('pending','Checks Pending','number'),c('value','Complete','percent')],rows),chart:rows.map(r=>({label:r.month,value:r.value})),details:D([monthCol,c('step','Closing Check'),status],rr.flatMap(r=>Object.entries(checks).map(([k,step])=>({month:str(r.period),step,status:r[k]===true?'Complete':'Pending'})))),note:'Compares the six source checks for each recorded month. The final closing status is displayed separately.'};
 }
 if(['ledger-profit-loss','balance-sheet','trial-balance'].includes(id)){
  const bs=id==='balance-sheet',pl=id==='ledger-profit-loss',chartAccounts=new Map(base.filter(r=>r.kind==='chart').flatMap(r=>[[str(r.code),r],[r.id,r]] as [string,FinRecord][]));
  const all=get('journal').filter(r=>r.status==='Posted'&&!!when(r)&&inRange(when(r),bs?{to:f.to||today}:f)).flatMap(r=>array(r.lines).map(l=>{const code=str(String(l.account??'')),a=chartAccounts.get(code);return {date:when(r),code,account:str(a?.name,code),type:str(a?.accountType,'Unclassified'),debit:val(l,'debit')??0,credit:val(l,'credit')??0};}));
  const inStatement=(type:string)=>pl?['Income','Expense'].includes(type):bs?['Liability','Equity','Asset'].includes(type):true;
  const sums=new Map<string,{code:string,account:string,type:string,debit:number,credit:number}>();for(const l of all){if(!inStatement(l.type))continue;const x=sums.get(l.code)||{code:l.code,account:l.account,type:l.type,debit:0,credit:0};x.debit+=Math.round(l.debit*100);x.credit+=Math.round(l.credit*100);sums.set(l.code,x);}
  const rows=[...sums.values()].sort((a,b)=>a.code.localeCompare(b.code)).map(x=>({...x,debit:x.debit/100,credit:x.credit/100,amount:round((pl||bs)&&['Income','Liability','Equity'].includes(x.type)?(x.credit-x.debit)/100:(x.debit-x.credit)/100)}));
  const earnings=all.filter(l=>['Income','Expense'].includes(l.type));const profit=round(earnings.reduce((sum,l)=>sum+l.credit-l.debit,0));
  if(bs&&earnings.length)rows.push({code:'',account:'Accumulated Posted Earnings',type:'Equity',debit:0,credit:0,amount:profit});
  const cols=[c('code','Account Code'),c('account','Account'),c('type','Account Type'),...(!bs?[c('debit','Debits','money'),c('credit','Credits','money')]:[]),c('amount',pl?'Income / Expense':bs?'Balance':'Debit Less Credit','money')];
  const held=all.filter(l=>l.type==='Unclassified').length;const note='Posted journal lines only. Unposted bank activity and opening balances not entered in the ledger are excluded.'+(held&&(pl||bs)?' '+held+' unclassified ledger lines could not be included in this statement.':'')+(bs?' Cumulative through '+(f.to||today)+'.':'');
  const d=D([dateCol,c('code','Account Code'),c('account','Account'),c('type','Account Type'),c('debit','Debit','money'),c('credit','Credit','money')],all.filter(l=>inStatement(l.type)||bs&&['Income','Expense'].includes(l.type)));
  return {...table(cols,rows,note),details:d,chart:pl?rows.map(r=>({label:r.account,value:r.amount,series:r.type})):[],metric:pl?{label:'Posted Net Income',value:earnings.length?money(profit):'—'}:{label:'Ledger Accounts',value:String(sums.size)}};
 }
 throw new AppError('Unknown Finance report.');
}
