import type {FinRecord,Viewer} from '../finance/model';
import {addDays} from '../finance/model';
import {canAccess} from '../finance/access';
import {departmentGaps,localDate,localInstant,managesPerson,isDepartmentDelegate} from '../finance/timeclock';
import {visible} from '../finance/visibility';
import {auditDay,auditStamp} from '../shared/audit-format';
import {displayPersonName} from '../people/display-name';
import {hrCan} from '../hr/permissions';
import {canUseHiring} from '../hr/hiring';
import {isPendingNewHire} from '../hr/sop-gate';
import {canOpenAcknowledgments} from '../sop/acknowledgment-access';
import {isCorrectivePolicy} from '../sop/corrective-content';
import type {HomeTarget} from './widgets';
import type {PulseSignal,PulseItem} from './pulse-types';

type Setup={personId:string;status:string;updatedAt:string};
type DraftMeta={id:string;topicId:string;code:string;originalReference?:string;version:number;status:string;title:string;sourceStatus?:string;updatedAt?:string};
type Source={
  drafts:(person:FinRecord)=>Promise<DraftMeta[]>;
  signatures:(v:Viewer,records:FinRecord[])=>Promise<number>;
  setups:(allowed:string[])=>Promise<Setup[]>;
};

const source:Source={
 async drafts(person){
   const [{financeDb},{default:catalog},{canManageCorrectiveContent}]=await Promise.all([import('@/db/finance'),import('../sop/private/catalog.json'),import('../sop/corrective-access')]);
   // Imported policies start life as v1 drafts; the authoritative version row overlays that exact seed,
   // including archival/publication. Select metadata only: never send indexed contents to Home.
   const rows=await financeDb().prepare(`SELECT policy_id AS id,status,
    json_extract(payload,'$.code') AS code,json_extract(payload,'$.version') AS version,
    json_extract(payload,'$.topicId') AS topicId,json_extract(payload,'$.originalReference') AS originalReference,
    json_extract(payload,'$.content.title') AS title,json_extract(payload,'$.sourceStatus') AS sourceStatus,
    json_extract(payload,'$.updatedAt') AS updatedAt FROM sop_versions`).all<DraftMeta>();
   const map=new Map<string,DraftMeta>(catalog.map(p=>[p.id+'|1',{id:p.id,code:p.id,topicId:p.topicId,title:p.content.title,status:'Draft',version:1,sourceStatus:p.sourceStatus}]));
   for(const p of rows.results)map.set(p.id+'|'+p.version,p);
   const manager=canManageCorrectiveContent(person);
   const drafts=new Map<string,DraftMeta>();
   for(const p of map.values())if(p.status==='Draft'&&(manager||!isCorrectivePolicy(p))&&(!drafts.has(p.id)||drafts.get(p.id)!.version<p.version))drafts.set(p.id,p);
   return [...drafts.values()];
 },
 async signatures(v,records){return (await import('../sop/onboarding')).pendingActiveSopCount(v,records);},
 async setups(allowed){
   if(!allowed.length)return [];
   const [{financeDb},{decode}]=await Promise.all([import('@/db/finance'),import('../hr/server')]);
   // Existing-worker setup is an HR workflow too. Avoid scanning/decoding anyone's unrelated HR file.
   const rows=await financeDb().prepare("SELECT person_id,payload FROM hr_records WHERE kind='onboarding' AND person_id IN (SELECT value FROM json_each(?)) ORDER BY updated_at DESC,id DESC").bind(JSON.stringify(allowed)).all<{person_id:string;payload:string}>();
   const projected=await Promise.all(rows.results.map(async row=>{const r=await decode(row.payload);return r.kind==='onboarding'&&r.personId===row.person_id&&!r.data.deletedAt?{personId:row.person_id,status:String(r.data.status||''),updatedAt:String(r.updatedAt||'')}:null;}));
   return projected.filter((r):r is Setup=>!!r);
 }
};
const target=(module:string,tab:string,section?:string):HomeTarget=>({module,tab,...(section?{section}:{})});
const validStamp=(x:number)=>Number.isFinite(x)?new Date(x).toISOString():undefined;
const isReady=(p:DraftMeta)=>/issue.ready|completed.*issue review|ready.to.issue|ready for issue|ready for .*issuance/i.test(p.sourceStatus||'');
const add=(rows:PulseSignal[],s:PulseSignal)=>rows.push(s);

type Domain='all'|'staffing'|'scheduling'|'policies';
async function readPeopleSignals(v:Viewer,records:FinRecord[],now:Date,io:Source,domain:Domain):Promise<PulseSignal[]>{
 const enabled=(part:Domain)=>domain==='all'||domain===part;
 const result:PulseSignal[]=[],self=records.find(r=>r.kind==='person'&&r.id===v.person);
 if(!self||self.status==='Former'||self.accountStatus==='Disabled')return result;
 const time=now.getTime(),today=localDate(now),fortnight=addDays(today,14),weekEnd=addDays(today,7),end=localInstant(fortnight+'T00:00');
 const canSchedule=canAccess(v,'Timeclock','Schedule'),canOpen=canAccess(v,'Timeclock','Open shifts');
 if(enabled('scheduling')&&(canSchedule||canOpen)){
   const scoped=visible(v,records,'timeclock');
   const activeShifts=scoped.filter(r=>r.kind==='shift'&&r.status!=='Cancelled'&&localInstant(r.end)>time&&localInstant(r.start)<end)
    .sort((a,b)=>localInstant(a.start)-localInstant(b.start)||a.id.localeCompare(b.id));
   const schedule=target('Timeclock','Schedule'),open=target('Timeclock','Open shifts');
   const shiftItem=(r:FinRecord,mine:boolean):PulseItem=>{
    const at=validStamp(localInstant(r.start)),until=validStamp(localInstant(r.end)),dept=String(r.department||'');
    return {id:r.id,title:mine?String(r.coverageRole||r.department||'Assigned')+' Shift':(dept||'Available')+' Opening',
      detail:[mine?String(r.location||''):String(r.coverageRole||''),until?'Ends '+auditStamp(until):''].filter(Boolean).join(' · '),
      at,calendar:mine,target:{...(mine?schedule:open),date:localDate(localInstant(r.start)),...(dept?{department:dept}:{})}};
   };
   if(canSchedule){
    const own=activeShifts.filter(r=>r.status==='Published'&&r.person===v.person);
    add(result,{id:'my_shifts',title:'My Scheduled Shifts',module:'Timeclock',description:'Published shifts assigned to you over the next 14 days.',dateLabel:'Next 14 days',count:own.length,unit:'shifts',tone:'neutral',score:own.length?30:0,target:schedule,items:own.map(s=>shiftItem(s,true))});
    const manager=v.owner||v.canManage||records.some(p=>p.kind==='person'&&p.status==='Active'&&p.id!==v.person&&managesPerson(v,p.id,records))||records.some(r=>r.kind==='department'&&(r.head===v.person||isDepartmentDelegate(r,v.person,today)));
    if(manager){
     const departments=[...new Set(scoped.filter(r=>r.kind==='department'&&r.status!=='Retired'&&r.name&&(v.owner||v.canManage||r.name===v.department||r.head===v.person||isDepartmentDelegate(r,v.person,today))).map(r=>String(r.name)))];
     if(!departments.length&&v.department)departments.push(v.department);
     const gaps=departments.flatMap(d=>departmentGaps(scoped,today,weekEnd,d).filter(g=>g.end>time).map(g=>({...g,dept:d}))).sort((a,b)=>a.start-b.start||a.dept.localeCompare(b.dept)),urgent=gaps.some(g=>g.start<=time+86400000);
     add(result,{id:'coverage_gaps',title:'Gaps in Shift Coverage',module:'Timeclock',description:'Uncovered Dispatch and Driver shifts, plus published vacancies in other departments. Department leadership is separate from the staffing schedule.',dateLabel:'Next 7 days',count:gaps.length,unit:'gaps',tone:urgent?'critical':gaps.length?'warning':'neutral',score:urgent?93:gaps.length?68:0,target:schedule,items:gaps.map(g=>({id:g.dept+':'+g.start,title:g.dept+' Coverage Gap',detail:(g.start<=time?'In progress · ':'')+'Until '+auditStamp(g.end),at:new Date(g.start).toISOString(),calendar:true,severity:g.start<=time+86400000?'critical':'warning',target:{...schedule,date:localDate(Math.max(time,g.start)),department:g.dept}}))});
    }
   }
   if(canOpen){
    const openings=activeShifts.filter(r=>!r.person&&(v.owner||v.canManage||r.department===v.department));
    add(result,{id:'open_shift_pickups',title:'Open Shifts',module:'Timeclock',description:'Unassigned shifts you can open on the schedule.',dateLabel:'Next 14 days',count:openings.length,unit:'open shifts',tone:openings.length?'info':'neutral',score:openings.length?43:0,target:open,items:openings.map(s=>shiftItem(s,false))});
   }
 }
 const hrTarget=target('People & HR','hiring','Onboarding'),sopTarget=target('SOP Library','workflow'),signTarget=target('SOP Library','assigned');
 const administer=enabled('staffing')&&canUseHiring(v),selfSetup=enabled('staffing')&&canAccess(v,'People & HR','hiring');
 const allowed=records.filter(p=>p.kind==='person'&&p.status!=='Former'&&p.accountStatus!=='Disabled'&&((p.id===v.person&&selfSetup)||administer&&hrCan(v,'manageOnboarding',p.id,records)));
 const canReview=enabled('policies')&&!v.onboardingOnly&&self.status==='Active'&&canAccess(v,'SOP Library','workflow',true);
 const canSign=enabled('policies')&&canOpenAcknowledgments(v)&&self.status==='Active';
 const [drafts,signedPending,setups]=await Promise.all([canReview?io.drafts(self):[],canSign?io.signatures(v,records):0,allowed.length?io.setups(allowed.map(p=>p.id)):[]]);
 if(canReview){
  const ready=drafts.filter(isReady).length;
  const ordered=[...drafts].sort((a,b)=>Number(isReady(b))-Number(isReady(a))||a.code.localeCompare(b.code,undefined,{numeric:true}));
  add(result,{id:'sop_review',title:'SOP Drafts to Review',module:'SOP Library',description:ready+' ready for review · '+(drafts.length-ready)+' in development. Published and archived editions are excluded.',dateLabel:'Draft Workshop',count:drafts.length,unit:'drafts',tone:drafts.length?'info':'neutral',score:drafts.length?52:0,target:sopTarget,items:ordered.slice(0,8).map(p=>({id:p.id,title:p.code+' · '+p.title,detail:isReady(p)?'Ready for Review':'In Development',target:{...sopTarget,section:p.id+'@'+p.version}}))});
 }
 if(canSign)add(result,{id:'sop_signatures',title:'My SOP Acknowledgments',module:'SOP Library',description:'Current published policies assigned to you that still need your signature.',count:signedPending,unit:'to sign',dateLabel:'Assigned to me',tone:signedPending?'warning':'neutral',score:signedPending?65:0,target:signTarget,items:[]});
 if(administer||selfSetup){
  const latest=new Map<string,Setup>();
  for(const s of setups)if(!latest.has(s.personId)||s.updatedAt>latest.get(s.personId)!.updatedAt)latest.set(s.personId,s);
  const active=allowed.filter(p=>{const setup=latest.get(p.id);return !p.onboardingClearedAt&&!(setup&&['Cleared','Cancelled'].includes(setup.status))&&(!!setup||isPendingNewHire(p));});
  if(administer){
   const employees=active.filter(p=>hrCan(v,'manageOnboarding',p.id,records)).sort((a,b)=>displayPersonName(a).localeCompare(displayPersonName(b)));
   add(result,{id:'employee_onboarding',title:'Employees in Onboarding',module:'People & HR',description:'Open employee setups within your hiring responsibility. Applicants and cleared setups are excluded.',dateLabel:'In progress',count:employees.length,unit:'employees',tone:employees.length?'info':'neutral',score:employees.length?55:0,target:hrTarget,items:employees.slice(0,12).map(p=>({id:p.id,title:displayPersonName(p)||'Employee',detail:[p.department,p.startDate?'Start '+auditDay(p.startDate):''].filter(Boolean).join(' · '),target:{...hrTarget,person:p.id}}))});
  }
  if(selfSetup&&active.some(p=>p.id===v.person))add(result,{id:'my_onboarding',title:'My Onboarding',module:'People & HR',description:'Open your assigned onboarding checklist to see what remains.',count:1,unit:'open setup',tone:'warning',score:75,target:{...hrTarget,person:v.person},items:[]});
 }
 return result;
}

// Independent sources: an unavailable encrypted personnel store must not hide the schedule or SOP work.
export const staffingSignals=(v:Viewer,records:FinRecord[],now:Date)=>readPeopleSignals(v,records,now,source,'staffing');
export const schedulingSignals=(v:Viewer,records:FinRecord[],now:Date)=>readPeopleSignals(v,records,now,source,'scheduling');
export const policySignals=(v:Viewer,records:FinRecord[],now:Date)=>readPeopleSignals(v,records,now,source,'policies');
export const peopleSignals=(v:Viewer,records:FinRecord[],now:Date,io:Source=source)=>readPeopleSignals(v,records,now,io,'all');
