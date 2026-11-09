import type {FinRecord, Viewer} from '../finance/model';
import type {Row} from '../accounts/model';
import {vehicles} from '../accounts/vehicle-rows';
import {access as accountAccess} from '../accounts/policy';
import {canAccess} from '../finance/access';
import {localDate} from '../finance/timeclock';
import {hrReportPeople} from '../reports/hr';
import {artifact, day} from '../reports/hr-tools';
import type {HomeBusinessTrends, MonthlySeries} from './module-trends-types';

const active = (v:Viewer, records:FinRecord[]) => !v.onboardingOnly && records.some(r => r.kind==='person' && r.id===v.person && r.status==='Active' && r.accountStatus!=='Disabled');
function bucketMonths(asOf:string):MonthlySeries['months'] {
  const year=Number(asOf.slice(0,4)), month=Number(asOf.slice(5,7))-1;
  return Array.from({length:12},(_,i)=>({month:new Date(Date.UTC(year,month-11+i,1,12)).toISOString().slice(0,7),value:null,secondary:null}));
}
function tally(months:Map<string, MonthlySeries['months'][number]>, date:string, asOf:string, key:'value'|'secondary'){
  if(!date||date>asOf)return;
  const bucket=months.get(date.slice(0,7));
  if(bucket)bucket[key]=(bucket[key]??0)+1;
}
function chartSample(r:{id:string;[key:string]:unknown}){
  return artifact(r)||!!r.example||!!r.isTraining||r.status==='Deleted'||/^(sample|demo|example)[:_-]/i.test(r.id);
}
export function homeHireTrend(v:Viewer, records:FinRecord[], now=new Date()):MonthlySeries|null{
  if(!active(v,records)||!canAccess(v,'People & HR','reports')||!canAccess(v,'People & HR','people'))return null;
  // Use precisely the reports engine's population, including its export-independent HR responsibility and row scope.
  const scoped=hrReportPeople(v,records,'hires');
  if(!v.owner&&!scoped.length)return null;
  const people=scoped.filter(p=>!chartSample(p));
  const asOf=localDate(now), months=bucketMonths(asOf), byMonth=new Map(months.map(m=>[m.month,m]));
  let undated=0;
  for(const person of people){const start=day(person.startDate);if(!start){undated++;continue;}tally(byMonth,start,asOf,'value');}
  return {asOf, months, unit:'Employment Starts', note:'Recorded hire dates from the personnel files you can view, including former staff. Blank months have no dated starts on file.'+(undated?' '+undated+' '+(undated===1?'person has':'people have')+' no valid hire date on file.':'')};
}
export function projectPropertyTowTrend(rows:Row[], vehicleRows:Row[], now=new Date()):MonthlySeries{
  const asOf=localDate(now),months=bucketMonths(asOf), byMonth=new Map(months.map(m=>[m.month,m]));
  const properties=new Set(rows.filter(r=>r.kind==='account'&&!chartSample(r)).map(r=>r.id));
  // The source already resolves saved vehicle edits before importing. The Map also protects against duplicate id rows in adapters.
  const calls=new Map(vehicleRows.filter(r=>r.kind==='vehicle').map(r=>[r.id,r]));
  for(const call of calls.values()){
    if(!properties.has(String(call.accountId||''))||chartSample(call))continue;
    // Use the same two mutually exclusive groups as Monthly Property Activity. Received is NEVER a fallback tow date.
    const tow=day(call.towDate);
    if(tow)tally(byMonth,tow,asOf,'value');
    else tally(byMonth,day(call.receivedDate),asOf,'secondary');
  }
  return {asOf,months,unit:'Confirmed Tows',secondaryUnit:'Received Date Only',note:'Confirmed Tows uses the tow date recorded for a property. Received Date Only counts property calls with an intake date but no confirmed tow date. Blank months have no dated records for that series.'};
}
export async function homeTowTrend(v:Viewer, records:FinRecord[], now=new Date(), getAccountRows?:()=>Promise<Row[]>):Promise<MonthlySeries|null>{
  if(!active(v,records)||!accountAccess(v,'performance'))return null;
  const rows=await (getAccountRows?getAccountRows():import('../accounts/server').then(m=>m.records()));
  return projectPropertyTowTrend(rows,vehicles(rows),now);
}
export async function homeBusinessTrends(v:Viewer, records:FinRecord[], now=new Date(), getAccountRows?:()=>Promise<Row[]>):Promise<HomeBusinessTrends>{
  const hires=homeHireTrend(v,records,now),tows=await homeTowTrend(v,records,now,getAccountRows);
  return {hires,tows};
}
