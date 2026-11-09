import type { FinRecord, Viewer } from '../finance/model';
import type { Row } from '../accounts/model';
import type { PulseItem, PulseSignal } from './pulse-types';
import type { HomeTarget } from './widgets';
import { addDays, money } from '../finance/model.ts';
import { localDate } from '../finance/timeclock.ts';
import { canAccess } from '../finance/access.ts';
import { visible } from '../finance/visibility.ts';
import { billBalance } from '../finance/bills.ts';
import { auditDay } from '../shared/audit-format.ts';

const financeTarget = (tab:string, section:string):HomeTarget => ({module:'Finance',tab,section});
const budgetsTarget=financeTarget('Overview','Suggested budgets'),billsTarget=financeTarget('Outflows','Bills & renewals'),taxesTarget=financeTarget('Reports & Taxes','Taxes & deadlines');
const salesTarget={module:'Sales CRM',tab:'activity'};
const validDay=(value:unknown):value is string => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!!auditDay(value);
const cents=(value:unknown):number|undefined => {
  if((typeof value!=='number'&&typeof value!=='string')||typeof value==='string'&&!value.trim())return;
  const x=Number(value);if(!Number.isFinite(x))return;const c=Math.round(x*100);return Number.isSafeInteger(c)?c:undefined;
};
const cash=(c:number)=>money(c/100);
const periodLabel=(month:string)=>new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-15T12:00:00Z'));
const sortItem=(a:PulseItem,b:PulseItem)=>String(a.due).localeCompare(String(b.due))||a.title.localeCompare(b.title)||a.id.localeCompare(b.id);
const superseded=(a:FinRecord,b:FinRecord)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||b.version-a.version||a.id.localeCompare(b.id);
const real=(r:FinRecord)=>!r.example&&!r.sample&&!r.isSample;
type BudgetException={item:PulseItem;over:number;recent:boolean};
function budgetSignal(rows:FinRecord[], imported:FinRecord[], day:string):PulseSignal {
 const base:PulseSignal={id:'budget-variance',module:'Finance',title:'Over Budget',description:'Recorded spending above approved monthly limits.',unit:'budget exceptions',target:budgetsTarget,count:0,items:[],tone:'neutral',score:0,dateLabel:periodLabel(day.slice(0,7))};
 const month=day.slice(0,7),weekStart=addDays(day,-6),prior=addDays(month+'-01',-1).slice(0,7);
 // The Finance register overlays corrected bank records by ID. A refund offsets its category and a document/receipt is never counted as a second bank transaction.
 const tx=new Map<string,FinRecord>();for(const t of [...imported,...rows.filter(r=>r.kind==='transaction')])if(t.kind==='transaction')tx.set(t.id,t);
 const payments=new Map<string,Map<string,number>>(),coverage=new Map<string,string>();
 for(const t of tx.values()){
   if(!real(t)||!validDay(t.date)||t.date>day||['Voided','Deleted','Cancelled'].includes(String(t.status)))continue;
   const period=t.date.slice(0,7),amount=cents(t.amount);if(amount===undefined||!(period===month||period===prior))continue;
   if(!coverage.has(period)||coverage.get(period)!<t.date)coverage.set(period,t.date);
   if(!t.category)continue;const key=period+':'+t.category,net=payments.get(key)??new Map<string,number>();
   net.set(t.date,(net.get(t.date)??0)-amount);payments.set(key,net);
 }
 const categories=new Map(rows.filter(r=>r.kind==='category').map(r=>[String(r.name||''),r]));
 const exceptions:BudgetException[]=[];let configured=0;
 for(const p of [month,...(weekStart.slice(0,7)===prior?[prior]:[])]){
   const limits=new Map<string,number>();
   for(const [category,c] of categories){
     if(!category||c.accountType!=='Expense'||c.status==='Archived'||c.budgetMode!=='Monthly budget')continue;
     if(p!==month&&c.updatedAt){const changed=String(c.updatedAt),ts=Date.parse(changed);if(!Number.isFinite(ts)||(validDay(changed)?changed:localDate(ts)).slice(0,7)>p)continue;}
     const limit=cents(c.budgetAmount);if(limit!==undefined&&limit>=0)limits.set(category,limit);
   }
   const overrides=rows.filter(r=>r.kind==='budget'&&r.status==='Approved'&&r.period===p&&r.category).sort(superseded);
   const seen=new Set<string>();
   for(const r of overrides){
     const category=String(r.category),known=categories.get(category);
     if(seen.has(category)||known&&(known.status==='Archived'||known.accountType!=='Expense'))continue;
     const limit=cents(r.amount);if(limit!==undefined&&limit>=0){limits.set(category,limit);seen.add(category);}
   }
   if(p===month)configured=limits.size;
   for(const [category,limit] of limits){
     let net=0,crossed='';
     for(const [date,change] of [...(payments.get(p+':'+category)?.entries()??[])].sort(([a],[b])=>a.localeCompare(b))){
       const old=net;net+=change;if(old<=limit&&net>limit)crossed=date;
     }
     if(net<=limit||!crossed||p!==month&&crossed<weekStart)continue;
     const over=net-limit,recent=crossed>=weekStart;
     exceptions.push({item:{id:p+':'+category,title:category+' · '+cash(over)+' Over',detail:periodLabel(p)+' · '+cash(net)+' net spending / '+cash(limit)+' budget · crossed '+auditDay(crossed),at:crossed,target:budgetsTarget,severity:'warning'},over,recent});
   }
 }
 exceptions.sort((a,b)=>Number(b.recent)-Number(a.recent)||b.over-a.over||a.item.id.localeCompare(b.item.id));
 if(exceptions.length){const recent=exceptions.filter(e=>e.recent).length;return {...base,description:recent?recent+' crossed a monthly limit in the past seven days.':'Current month-to-date spending above approved limits.',count:exceptions.length,items:exceptions.slice(0,35).map(e=>e.item),tone:'warning',score:recent?85:66,dateLabel:periodLabel(month)};}
 if(!configured)return {...base,displayValue:'—',description:'No monthly spending limits are set for this period.'};
 if(!coverage.has(month))return {...base,displayValue:'—',description:'Monthly limits are set; no bank transactions are recorded for this month yet.'};
 return {...base,description:configured+' configured '+(configured===1?'limit':'limits')+' compared with bank entries through '+auditDay(coverage.get(month))+'.'};
}
function dueSignal(rows:FinRecord[],day:string,mode:'bill'|'tax'):PulseSignal{
 const isBill=mode==='bill',end=addDays(day,13),target=isBill?billsTarget:taxesTarget;
 const items:PulseItem[]=[];let undated=0;
 for(const r of rows.filter(r=>r.kind===mode)){
   const closed=['Cancelled','Voided','Archived','Deleted'];
   if(closed.includes(String(r.status)))continue;
   if(isBill){if(r.status==='Paid'||r.status==='Draft'||!(billBalance(r)>0))continue;}
   else {
     const filed=r.filingStatus==='Accepted'||r.filingStatus==='Filed'||r.status==='Filed';
     if(filed&&['Paid','Not due'].includes(String(r.paymentStatus)))continue;
   }
   if(!validDay(r.due)){undated++;continue;}
   if(r.due>end)continue;
   const overdue=r.due<day,dueNow=r.due===day;
   const detail=isBill?money(billBalance(r))+' outstanding':([r.agency,r.period||r.year,r.filingStatus||r.status,r.paymentStatus].filter(Boolean).join(' · ')||'Filing or payment pending');
   items.push({id:r.id,title:String(isBill?r.vendor||r.name||'Vendor Bill':r.name||'Tax Filing'),detail,due:r.due,calendar:true,target,severity:overdue||dueNow?'warning':'info'});
 }
 items.sort(sortItem);
 const overdue=items.filter(i=>i.due!<day).length,dueNow=items.some(i=>i.due===day);
 const description=(overdue?overdue+' overdue. ':'')+(isBill?'Open bills':'Recorded filing and payment deadlines')+' due through '+auditDay(end)+'.'+(undated?' '+undated+' without a confirmed due date.':'');
 return {id:isBill?'bills-due':'tax-deadlines',module:'Finance',title:isBill?'Bills Due':'Tax Deadlines',unit:isBill?'bills':'deadlines',target,description,count:items.length,items:items.slice(0,40),tone:overdue||dueNow?'warning':items.length?'info':'neutral',score:overdue?(isBill?77:87):dueNow?75:items.length?48:0,dateLabel:'Overdue & Next 14 Days'};
}
/** Testable Finance projection with imported transactions supplied separately, matching the Finance API. */
export function financePulse(v:Viewer,records:FinRecord[],now:Date,imported:FinRecord[]):PulseSignal[]{
 if(v.onboardingOnly)return [];
 const overview=canAccess(v,'Finance','Overview'),outflows=canAccess(v,'Finance','Outflows'),taxes=canAccess(v,'Finance','Reports & Taxes');if(!overview&&!outflows&&!taxes)return [];
 const day=localDate(now),scoped=visible(v,records.filter(r=>real(r)&&['category','budget','transaction','bill','tax'].includes(r.kind)));
 return [...(overview?[budgetSignal(scoped,imported,day)]:[]),...(outflows?[dueSignal(scoped,day,'bill')]:[]),...(taxes?[dueSignal(scoped,day,'tax')]:[])];
}
export async function moneySignals(v:Viewer,records:FinRecord[],now:Date):Promise<PulseSignal[]>{
 const imported=!v.onboardingOnly&&canAccess(v,'Finance','Overview')?(await import('../finance/seed')).sourceTransactions:[];
 return financePulse(v,records,now,imported);
}
export function salesFollowupSignals(v:Viewer,staff:FinRecord[],all:Row[],now:Date):PulseSignal[]{
 if(!canAccess(v,'Sales CRM','activity'))return [];
 const isHead=v.owner||v.role==='Department Head'&&v.department==='Account Managers'||staff.some(r=>r.kind==='department'&&r.name==='Account Managers'&&r.head===v.person);
 const day=localDate(now),end=addDays(day,6);
 // A Finance management flag does not confer responsibility for other salespeople. Follow actual reporting relationships.
 const reports=new Set<string>([v.person]);if(!isHead&&['Supervisor','Department Head'].includes(v.role)){let previous=0;while(previous!==reports.size){previous=reports.size;for(const p of staff)if(p.kind==='person'&&p.supervisor&&reports.has(String(p.supervisor)))reports.add(p.id);}}
 const due:PulseItem[]=all.filter(r=>r.kind==='opportunity'&&!r.example&&!r.id.startsWith('sales-example:')&&!['Won','Lost'].includes(String(r.stage))&&validDay(r.dueDate)&&r.dueDate<=end&&(isHead||reports.has(String(r.assignee)))).map(r=>({id:r.id,title:r.name,detail:String(r.nextAction||'Follow up with this lead'),due:String(r.dueDate),calendar:true,target:salesTarget,severity:String(r.dueDate)<day?'warning':'info'} as PulseItem)).sort(sortItem);
 const late=due.filter(r=>r.due!<day).length;
 return [{id:'sales-followups',module:'Sales CRM',title:'Sales Follow-Ups',unit:'follow-ups',description:(isHead?'Open leads': 'Assigned leads')+' overdue or due in the next seven days.'+(late?' '+late+' overdue.':''),target:salesTarget,count:due.length,items:due.slice(0,40),tone:late?'warning':due.length?'info':'neutral',score:late?70:due.length?45:0,dateLabel:'Next 7 Days'}];
}
