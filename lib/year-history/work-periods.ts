import type {Row} from '../accounts/model';
import {businessDate,businessToday,historicalArchiveYear,type YearEntry} from './model.ts';

export type WorkTransition={record_id:string;at:string;prior:string|null;status:string|null;initial:number;version:number|null};
export const isWorkItem=(r:Row)=>!r.deletedAt&&!r.derived&&(r.kind==='workOrder'||r.kind==='task');
const statusOf=(s:unknown)=>typeof s==='string'?s.trim().toLowerCase():'';
const terminal=(s:unknown)=>['completed','cancelled','canceled'].includes(statusOf(s));
const label=(s:unknown)=>typeof s==='string'?s.trim():'';
const dateOf=(...values:unknown[])=>values.map(businessDate).find(Boolean)||'';
export function workPeriodSummary(r:Row,input:readonly WorkTransition[]=[]){
 const events=input.filter(e=>e.record_id===r.id&&businessDate(e.at)&&e.status).slice().sort((a,b)=>(a.version??0)-(b.version??0)||a.at.localeCompare(b.at));
 const current=statusOf(r.status),finished=terminal(current);
 const periods:{start:string;end?:string}[]=[];
 let open='',auditClose='',last='',lastVersion:number|null=null;
 const writtenOpen=dateOf(r.requestedAt,r.createdAt);
 let openedDate=writtenOpen;
 const days=new Set<string>([writtenOpen,businessDate(r.updatedAt)].filter(Boolean));
 for(const e of events){
  const day=businessDate(e.at),status=statusOf(e.status),before=statusOf(e.prior);
  days.add(day);
  // An incomplete/mismatched audit chain cannot prove that a record stayed open across the gap.
  if(last&&(last!==before||lastVersion!==null&&e.version!==null&&e.version!==lastVersion+1)){open='';auditClose='';}
  if(e.initial){open=terminal(status)?'':writtenOpen||day;if(!openedDate&&open)openedDate=day;}
  else if(!terminal(status)&&(!open||terminal(before))){open=day;auditClose='';}
  if(terminal(status)&&before&&!terminal(before)){
   if(open&&open<=day)periods.push({start:open,end:day});
   open='';auditClose=day;
  }else if(!terminal(status)){auditClose='';}
  last=status;lastVersion=e.version;
 }
 const matchingTail=last===current&&(!r.version||lastVersion===r.version);
 if(!matchingTail&&events.length){open='';auditClose='';}
 // A completedAt on a reopened or later cancelled task is not this task's closure.
 const explicitClose=current==='completed'?dateOf(r.completedAt):['cancelled','canceled'].includes(current)?dateOf(r.cancelledAt,r.canceledAt):'';
 const closedDate=finished?(auditClose||explicitClose):'';
 if(closedDate)days.add(closedDate);
 if(!finished&&open)periods.push({start:open});
 // A single version is sufficient evidence of an uninterrupted original open state.
 if(!events.length&&!finished&&openedDate&&r.version<=1)periods.push({start:openedDate});
 const stamps=[...days].sort();
 return {openedDate:openedDate||undefined,closedDate:closedDate||undefined,activityDate:stamps.at(-1)||'',activityDates:stamps,terminal:finished,openPeriods:periods};
}
/** Client-side only after authorized projection. Never substitute last edit, due date or schedule. */
export function priorClosedWork(r:Row,today=businessToday()){
 const current=statusOf(r.status);
 const closedDate=dateOf(r.yearHistoryClosedDate,current==='completed'?r.completedAt:terminal(current)?r.cancelledAt||r.canceledAt:'');
 return historicalArchiveYear({terminal:terminal(current),closedDate},today)!==null;
}
export function buildWorkEntry(r:Row,module:string,events:WorkTransition[],property?:string):YearEntry{
 const cost=r.actualCost;
 const amount=r.kind==='workOrder'&&typeof cost==='number'&&Number.isFinite(cost)&&cost>=0&&Number.isSafeInteger(Math.round(cost*100))?Math.round(cost*100):undefined;
 return {id:r.id,module,kind:r.kind==='workOrder'?'Work Order':'Account Task',title:label(r.name)||(r.kind==='workOrder'?'Work Order':'Account Task'),status:label(r.status)||'Not Recorded',...workPeriodSummary(r,events),...(property?{property}:{}),...(label(r.type)?{category:label(r.type)}:{}),...(amount!==undefined?{amountCents:amount}:{})};
}
