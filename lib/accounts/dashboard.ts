import { today, lastContact, signageDue, queue, type Row } from './model';
import { healthScore } from './insights';
import { actionDate, isFinished } from './work';
import { isPendingAccount } from './onboarding';
export const healthBands=['0–20%','>20–40%','>40–60%','>60–80%','>80–100%','Not assessed'];
export function healthBand(a:Row) {const score=healthScore(a).score;return score===null?5:Math.max(0,Math.min(4,Math.ceil(score/20)-1));}
export function monthOffset(day:string,months:number) {const d=new Date(day+'T12:00Z'),n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,last));return d.toISOString().slice(0,10);}
export function portfolio(all:Row[],assignee:string) {return all.filter(a=>a.kind==='account'&& !isPendingAccount(a)&& !['Terminated','Inactive','Archived'].includes(String(a.status)) && (!assignee||a.assignee===assignee));}
export function todayOverview(all:Row[],assignee='',day=today()) {
 const accounts=portfolio(all,assignee),ids=new Set(accounts.map(a=>a.id)),start=day.slice(0,7)+'-01';
 const bands=healthBands.map((name,i)=>({name,ids:accounts.filter(a=>healthBand(a)===i).map(a=>a.id),value:accounts.filter(a=>healthBand(a)===i).length}));
 const checked=accounts.filter(a=>lastContact(all,a.id,day)>=start).map(a=>a.id);
 const responded=accounts.filter(a=>all.some(r=>r.kind==='activity'&&r.accountId===a.id&&['Onsite visit','Phone call','Text message','Email','Video meeting'].includes(String(r.channel))&&r.response==='Responded'&&String(r.date)>=start&&String(r.date)<=day)).map(a=>a.id);
 const renewals=accounts.flatMap(a=>{const end=String(a.renewalDate||a.agreementEnd||''),notice=String(a.noticeDeadline||'');if(!end&&!notice)return [];
   const upcoming=end&&end>=day&&end<=monthOffset(day,2)||notice&&notice>=day&&notice<=monthOffset(day,2);
   if(!upcoming)return [];
   return [{id:a.id,name:a.name,end,notice,verified:!!a.agreementVerified,sort:notice&&notice>=day&&(!end||notice<end)?notice:end}];
 }).sort((a,b)=>a.sort.localeCompare(b.sort));
 const open=queue(all,day).filter(r=>ids.has(String(r.accountId)) || !r.accountId&&(!assignee||r.assignee===assignee));
 const actions=open.filter(r=>actionDate(r)&&actionDate(r)<=day).sort((a,b)=>Number(b.priority==='Urgent')-Number(a.priority==='Urgent')||actionDate(a).localeCompare(actionDate(b)));
 const paused=accounts.filter(a=>a.status==='Paused').map(a=>a.id);
 const signage=accounts.filter(a=>{const date=signageDue(all,a.id);return date&&date<=day;}).map(a=>a.id);
 const claims=all.filter(r=>r.kind==='claim'&&ids.has(String(r.accountId))&&!['Paid','Closed without settlement'].includes(String(r.status)));
 const workOrders=all.filter(r=>r.kind==='workOrder'&&ids.has(String(r.accountId))&&!isFinished(r));
 return {accounts,bands,checked,responded,checkinPercent:accounts.length?Math.round(checked.length/accounts.length*100):null,renewals,actions,paused,signage,claims,workOrders,needsScheduling:open.filter(r=>!actionDate(r)).length};
}
export type RevenuePayment={accountId:string;paymentDate:string;cents:number;void?:boolean};
export function portfolioRevenue(all:Row[],payments:RevenuePayment[],assignee='',day=today()) {
 const accounts=portfolio(all,assignee),ids=new Set(accounts.map(a=>a.id));
 const valid=payments.filter(p=>!p.void&&p.paymentDate<=day),scope=valid.filter(p=>ids.has(p.accountId));
 const latest=valid.map(p=>p.paymentDate).sort().at(-1)||'',end=latest||day,start=end.slice(0,7)+'-01';
 const monthly=Array.from({length:6},(_,i)=>monthOffset(start,i-5).slice(0,7)).map(month=>({month,revenue:scope.filter(p=>p.paymentDate.slice(0,7)===month).reduce((s,p)=>s+p.cents,0)/100}));
 const period=scope.filter(p=>p.paymentDate>=start&&p.paymentDate<=end),sum=(p:RevenuePayment[])=>p.reduce((s,r)=>s+r.cents,0)/100;
 const previousStart=monthOffset(start,-1),previousEnd=monthOffset(end,-1),previous=scope.filter(p=>p.paymentDate>=previousStart&&p.paymentDate<=previousEnd),previousRevenue=sum(previous),revenue=sum(period);
 const properties=accounts.map(a=>({id:a.id,name:a.name,revenue:sum(period.filter(p=>p.accountId===a.id)),previous:sum(previous.filter(p=>p.accountId===a.id))}));
 const declining=properties.filter(p=>p.previous>0&&p.revenue<p.previous).sort((a,b)=>(a.revenue-a.previous)-(b.revenue-b.previous));
 return {count:accounts.length,revenue,historicalRevenue:sum(scope),perAccount:accounts.length?revenue/accounts.length:null,monthly,properties,declining,from:start,to:end,latest,previousFrom:previousStart,previousTo:previousEnd,previousRevenue,change:previousRevenue>0?(revenue-previousRevenue)/previousRevenue*100:null,paymentCount:period.length,recordedFrom:scope.map(p=>p.paymentDate).sort()[0]||''};
}
