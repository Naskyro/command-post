import { publicPersonIdentity } from '../people/display-name.ts';
import type {FinRecord,Viewer} from '../finance/model';
import {workweek} from '../finance/model.ts';
import {canViewDemographics} from './demographics.ts';
import {localDate,overtimeEligible} from '../finance/timeclock.ts';
import {visible} from '../finance/visibility.ts';

export type HrDashboard={people:FinRecord[];leaveTrend:{month:string;label:string;hours:number}[];overtimeTrend:{month:string;label:string;hours:number}[];attrition:{department:string;count:number}[];reportingMonths:number;asOf:string;timeDataAvailable:boolean;leaveDataAvailable:boolean};
export function buildHrDashboard(viewer:Viewer,records:FinRecord[],now=Date.now()):{dashboard:HrDashboard;leaveRequests:FinRecord[]}{
 const asOf=localDate(now),month=asOf.slice(0,7),current=new Date(month+'-01T12:00:00Z');
 const months=Array.from({length:6},(_,i)=>{const d=new Date(current);d.setUTCMonth(d.getUTCMonth()-(5-i));return {month:d.toISOString().slice(0,7),label:d.toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'}),hours:0};});
 const people=records.filter(p=>p.kind==='person'&&canViewDemographics(viewer,p.id,records)).map(p=>({id:p.id,kind:p.kind,version:p.version,...Object.fromEntries(['status','workerType','employmentClass','department','departmentId','startDate','endDate','gender'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),...publicPersonIdentity(p)}) as FinRecord);
 const ids=new Set(people.map(p=>p.id)),timeVisible=viewer.onboardingOnly?[]:visible(viewer,records,'timeclock');
 const leave=timeVisible.filter(r=>r.kind==='leaveRequest'&&ids.has(String(r.person)));
 const leaveRequests=leave.map(r=>Object.fromEntries(['id','kind','version','person','type','date','endDate','hours','status','decision','updatedAt'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])) as FinRecord).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const leaveTrend=months.map(m=>({...m,hours:Math.round(leave.filter(r=>r.status==='Approved'&&String(r.date).slice(0,7)===m.month&&String(r.date)<=asOf).reduce((s,r)=>s+Math.max(0,Number(r.hours)||0),0)*100)/100}));
 const overtimeTrend=months.map(m=>({...m})),company=records.find(r=>r.id==='company'),weekTotals=new Map<string,number>();
 const lower=workweek(months[0].month+'-01',company).start;
 const times=timeVisible.filter(r=>r.kind==='time'&&r.status==='Approved'&&ids.has(String(r.person))&&String(r.date)>=lower&&String(r.date)<=asOf).sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.id.localeCompare(b.id));
 for(const time of times){const p=records.find(r=>r.kind==='person'&&r.id===time.person);if(!p||!overtimeEligible(p))continue;const key=p.id+':'+workweek(String(time.date),company).start,prior=weekTotals.get(key)||0,hours=Math.max(0,Number(time.hours)||0);weekTotals.set(key,prior+hours);const extra=Math.max(0,prior+hours-40)-Math.max(0,prior-40);const bucket=overtimeTrend.find(m=>m.month===String(time.date).slice(0,7));if(bucket)bucket.hours+=extra;}
 for(const m of overtimeTrend)m.hours=Math.round(m.hours*100)/100;
 const attritionCounts=new Map<string,number>();
 for(const p of people.filter(p=>p.status==='Former'&&p.endDate&&String(p.endDate)>=months[0].month+'-01'&&String(p.endDate)<=asOf)){const dept=String(p.department||'Unassigned');attritionCounts.set(dept,(attritionCounts.get(dept)||0)+1);}
 return {dashboard:{people,leaveTrend,overtimeTrend,attrition:[...attritionCounts].map(([department,count])=>({department,count})).sort((a,b)=>b.count-a.count||a.department.localeCompare(b.department)),reportingMonths:6,asOf,timeDataAvailable:times.length>0,leaveDataAvailable:leave.length>0},leaveRequests};
}
