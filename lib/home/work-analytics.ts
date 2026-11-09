import type {FinRecord,Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {localDate,localInstant} from '../finance/timeclock.ts';
export type HomeWorkWeek={week:string;recorded:number|null;approved:number|null;scheduled:number|null};
export type HomeWorkAnalytics={weeks:HomeWorkWeek[];recordAccess:boolean;scheduleAccess:boolean;historyTab:string};
function shiftDay(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function homeWorkAnalytics(v:Viewer,records:FinRecord[],now=new Date()):HomeWorkAnalytics|null{
 const person=records.find(r=>r.kind==='person'&&r.id===v.person);
 if(v.onboardingOnly||!person||person.status!=='Active'||person.accountStatus==='Disabled')return null;
 const recordAccess=(canAccess(v,'Timeclock','Timesheets')||canAccess(v,'Timeclock','History')||canAccess(v,'Timeclock','Today')),scheduleAccess=canAccess(v,'Timeclock','Schedule');
 if(!recordAccess&&!scheduleAccess)return null;
 const today=localDate(now),current=shiftDay(today,-new Date(today+'T12:00:00Z').getUTCDay());
 const weeks:HomeWorkWeek[]=Array.from({length:12},(_,i)=>({week:shiftDay(current,7*(i-11)),recorded:null,approved:null,scheduled:null}));
 const first=weeks[0].week,lastEnd=shiftDay(current,7);
 const bounds=weeks.map(w=>[localInstant(w.week+'T00:00'),localInstant(shiftDay(w.week,7)+'T00:00')]);
 for(const r of records){if(r.person!==v.person||r.example||r.sample||r.isSample||r.deletedAt)continue;
  const hours=typeof r.hours==='number'||(typeof r.hours==='string'&&r.hours.trim())?Number(r.hours):NaN;
  if(recordAccess&&r.kind==='time'&&typeof r.date==='string'&&r.date>=first&&r.date<=today&&!['Voided','Scheduled','Deleted','Cancelled'].includes(String(r.status))&&Number.isFinite(hours)){
    const b=weeks.findLast(x=>x.week<=String(r.date));if(!b)continue;b.recorded=(b.recorded??0)+hours;b.approved=(b.approved??0)+(r.status==='Approved'?hours:0);
  }
  if(scheduleAccess&&r.kind==='shift'&&r.status==='Published'&&typeof r.start==='string'&&typeof r.end==='string'&&r.end>=first&&r.start<lastEnd){
   const a=localInstant(r.start),b=localInstant(r.end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
   bounds.forEach(([l,h],i)=>{const ms=Math.min(h,b)-Math.max(l,a);if(ms>0)weeks[i].scheduled=(weeks[i].scheduled??0)+ms/3600000;});
  }
 }
 for(const w of weeks)for(const key of ['approved','recorded','scheduled'] as const)if(w[key]!==null)w[key]=Math.round(w[key]!*100)/100;
 return {weeks,recordAccess,scheduleAccess,historyTab:canAccess(v,'Timeclock','Timesheets')?'Timesheets':canAccess(v,'Timeclock','History')?'History':recordAccess?'Today':'Schedule'};
}
