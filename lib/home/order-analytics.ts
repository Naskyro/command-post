import type {FinRecord,Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {localDate} from '../finance/timeclock.ts';
import type {HomeOrderAnalytics,HomeOrderWeek} from './order-analytics-types';
export type {HomeOrderAnalytics,HomeOrderWeek} from './order-analytics-types';
type Field=string|null;
export type OrderFact={
 id:string;status:Field;requested:Field;created:Field;completed:Field;completedOn:Field;
 auditAt:Field;isCreation:number;isFinish:number;afterCompletion:Field;
 beforeCompletion:Field;wasFinished:number;
};
// Return event dates only, not the contents of requests or supervisor remarks.
// JOIN to current work orders so deleted/missing records and other account kinds cannot leak.
// Creation/transition facts are needed because some older rows have no explicit event stamps.
// The inventory fulfillment flow stores completedDate (possibly backdated), not completedAt.
export const orderFactsSql=`
SELECT a.id, json_extract(a.payload,'$.status') AS status,
 json_extract(a.payload,'$.requestedAt') AS requested, json_extract(a.payload,'$.createdAt') AS created,
 json_extract(a.payload,'$.completedAt') AS completed,json_extract(a.payload,'$.completedDate') AS completedOn,
 h.at AS auditAt, CASE WHEN h.id IS NOT NULL AND h.before IS NULL THEN 1 ELSE 0 END AS isCreation,
 CASE WHEN json_extract(h.after,'$.status')='Completed' AND COALESCE(json_extract(h.before,'$.status'),'')<>'Completed' THEN 1 ELSE 0 END AS isFinish,
 COALESCE(NULLIF(json_extract(h.after,'$.completedDate'),''),json_extract(h.after,'$.completedAt')) AS afterCompletion,
 COALESCE(NULLIF(json_extract(h.before,'$.completedDate'),''),json_extract(h.before,'$.completedAt')) AS beforeCompletion,
 CASE WHEN json_extract(h.before,'$.status')='Completed' THEN 1 ELSE 0 END AS wasFinished
FROM account_records a
LEFT JOIN account_audit h ON h.record_id=a.id AND
 (h.before IS NULL OR (json_extract(h.before,'$.status') IS NOT json_extract(h.after,'$.status')
 AND (json_extract(h.after,'$.status')='Completed' OR json_extract(h.before,'$.status')='Completed')))
WHERE a.kind='workOrder' AND COALESCE(json_extract(a.payload,'$.status'),'')<>'Deleted'
 AND COALESCE(json_extract(a.payload,'$.deletedAt'),'')=''
 AND NOT (COALESCE(json_extract(a.payload,'$.deleted'),0)
 OR COALESCE(json_extract(a.payload,'$.isSample'),0) OR COALESCE(json_extract(a.payload,'$.sample'),0)
 OR COALESCE(json_extract(a.payload,'$.example'),0) OR COALESCE(json_extract(a.payload,'$.isExample'),0)
 OR COALESCE(json_extract(a.payload,'$.isDemo'),0) OR COALESCE(json_extract(a.payload,'$.demo'),0)
 OR COALESCE(json_extract(a.payload,'$.trainingSample'),0) OR COALESCE(json_extract(a.payload,'$.trainingExample'),0))
 AND lower(a.id) NOT GLOB 'sample[:_-]*' AND lower(a.id) NOT GLOB 'demo[:_-]*'
`;
const isoDay=/^\d{4}-\d\d-\d\d$/;
const stamp=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/;
function day(v:Field){if(typeof v!=='string')return '';const base=v.slice(0,10);
 if(!isoDay.test(base)||(!isoDay.test(v)&&!stamp.test(v)))return '';
 const noon=Date.parse(base+'T12:00:00Z');if(!Number.isFinite(noon)||new Date(noon).toISOString().slice(0,10)!==base)return '';
 if(isoDay.test(v))return v;const time=Date.parse(v);return Number.isFinite(time)?localDate(time):'';
}
function shift(d:string,n:number){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
function weekStart(d:string){return shift(d,-new Date(d+'T12:00:00Z').getUTCDay());}
const earliest=(a:string,b:string)=>!a?b:!b?a:(a<b?a:b);
export function projectOrderWeeks(facts:OrderFact[],now=new Date()):HomeOrderAnalytics{
 const today=localDate(now),start=weekStart(today),events=new Map<string,{open:string;firstSave:string;finish:string;wasFinished:boolean}>();
 for(const f of facts){
  let e=events.get(f.id);if(!e){e={open:day(f.requested)||day(f.created),firstSave:'',finish:day(f.completedOn)||day(f.completed),wasFinished:f.status==='Completed'};events.set(f.id,e);}
  if(f.isCreation)e.firstSave=earliest(e.firstSave,day(f.auditAt));
  if(f.isFinish){e.wasFinished=true;e.finish=earliest(e.finish,day(f.afterCompletion)||day(f.auditAt));}
  if(f.wasFinished){e.wasFinished=true;e.finish=earliest(e.finish,day(f.beforeCompletion));}
 }
 let coverage='',undatedOpened=0,undatedCompleted=0;
 const bins=new Map<string,{opened:number;completed:number}>();
 function include(date:string,series:'opened'|'completed'){if(!date||date>today)return;coverage=earliest(coverage,date);
  const key=weekStart(date),bucket=bins.get(key)||{opened:0,completed:0};bucket[series]++;bins.set(key,bucket);}
 for(const e of events.values()){
  const open=e.open||e.firstSave;if(!open)undatedOpened++;else include(open,'opened');
  if(e.finish)include(e.finish,'completed');else if(e.wasFinished)undatedCompleted++;
 }
 const weeks:HomeOrderWeek[]=Array.from({length:12},(_,i)=>{const week=shift(start,7*(i-11)),end=shift(week,6),unknown=!coverage||end<coverage,counts=bins.get(week);
  return {week,opened:unknown?null:counts?.opened??0,completed:unknown?null:counts?.completed??0,partial:!unknown&&(week===start||week<coverage&&coverage<=end)};
 });
 return {weeks,asOf:today,coverageFrom:coverage||null,undatedOpened,undatedCompleted};
}
export async function homeOrderAnalytics(v:Viewer,records:FinRecord[],now=new Date()):Promise<HomeOrderAnalytics|null>{
 if(v.onboardingOnly||!canAccess(v,'Work Orders','orders')||!records.some(p=>p.kind==='person'&&p.id===v.person&&p.status==='Active'&&p.accountStatus!=='Disabled'))return null;
 const {financeDb}=await import('@/db/finance');const result=await financeDb().prepare(orderFactsSql).all<OrderFact>();
 return projectOrderWeeks(result.results,now);
}
