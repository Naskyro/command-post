import type { Viewer, FinRecord } from '../finance/model';
import { localDate } from '../finance/timeclock';
import { fieldSignals } from './pulse-field';
import { casesSignals } from './pulse-cases';
import { staffingSignals, schedulingSignals, policySignals } from './pulse-people';
import { moneySignals } from './pulse-money';
import { approvalsSignal } from './pulse-actions';
import { driveSignals } from './pulse-drive';
import { homeLearning } from './pulse-learning';
import type { Row } from '../accounts/model';
import { rankSignals, type HomePulse, type PulseSignal } from './pulse-types';

export async function buildHomePulse(v:Viewer,records:FinRecord[],at=new Date()):Promise<HomePulse> {
 const now=at.getTime(),today=localDate(now);
 let rowPromise:Promise<Row[]>|undefined;
 const getAccountRows=()=>rowPromise??=(import('../accounts/server').then(m=>m.records()));
 const sources=[
  {label:'Field Operations',read:(v:Viewer,rs:FinRecord[],d:Date)=>fieldSignals(v,rs,d,getAccountRows)},
  {label:'People & HR',read:staffingSignals},
  {label:'Timeclock',read:schedulingSignals},
  {label:'SOP Library',read:policySignals},
  {label:'Work Orders & Cases',read:casesSignals},
  {label:'Finance',read:moneySignals},
  {label:'Company Drive',read:driveSignals},
  {label:'Team Approvals',read:approvalsSignal}
 ];
 // Each module checks its own permissions before reading its source. A failed chart
 // must not hide an unrelated department's alerts or the rest of the calendar.
 const series=<T,>(read:Promise<T>)=>read.then(result=>({result,error:false})).catch(()=>({result:null,error:true}));
 const business=import('./module-trends');
 const [batches,finance,work,orders,hires,tows,learning]=await Promise.all([
  Promise.allSettled(sources.map(s=>s.read(v,records,at))),
  series(import('../reports/finance').then(m=>m.homeFinancialAnalytics(v,records,at))),
  series(import('./work-analytics').then(m=>m.homeWorkAnalytics(v,records,at))),
  series(import('./order-analytics').then(m=>m.homeOrderAnalytics(v,records,at))),
  series(business.then(m=>m.homeHireTrend(v,records,at))),
  series(business.then(m=>m.homeTowTrend(v,records,at,getAccountRows))),
  series(homeLearning(v,records,at))
 ]);
 const signals:PulseSignal[]=[],unavailable:string[]=[];
 for(const [i,b] of batches.entries()){
  if(b.status==='rejected'){unavailable.push(sources[i].label);console.error('Home dashboard source unavailable:',sources[i].label);continue;}
  signals.push(...b.value);
 }
 if(learning.result)signals.push(...learning.result.signals);
 if(learning.error){unavailable.push('School House Learning');console.error('Home dashboard source unavailable: School House Learning');}
 const fieldRole=['Dispatch','Drivers'].includes(v.department);
 const sorted=signals.map(s=>({...s,score:s.score+(fieldRole&&/^(field_|safety_)/.test(s.id)&&s.count>0?10:0)})).sort(rankSignals);
 // No underlying source rows, drafts, documents, or unprojected employee/financial objects leave this boundary.
 if(finance.error)unavailable.push('Financial Trends');if(work.error)unavailable.push('Work Trends');
 if(orders.error)unavailable.push('Work Order Trends');if(hires.error)unavailable.push('Hiring Trends');if(tows.error)unavailable.push('Property Tow Trends');
 return {learning:learning.result?.summary||null,orderAnalytics:orders.result,businessTrends:{hires:hires.result,tows:tows.result},analytics:finance.result,workAnalytics:work.result,asOf:at.toISOString(),today,signals:sorted,unavailable};
}
