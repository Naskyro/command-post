import type {Viewer, FinRecord} from '../finance/model';
import {canAccess} from '../finance/access';
import type {Row} from '../accounts/model';
import {vehicles} from '../accounts/vehicle-rows';
import {isPendingAccount} from '../accounts/onboarding';
import {safetyAlerts} from '../safety/model';
import type {HomeTarget} from './widgets';
import type {PulseItem, PulseSignal} from './pulse-types';
import {salesFollowupSignals} from './pulse-money';

const ct = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
function localDay(v:unknown):string {
  if(typeof v==='string' && dateOnly.test(v))return v;
  if(!(v instanceof Date) && (typeof v!=='string'||!/(Z|[+-]\d\d:\d\d)$/i.test(v)))return '';
  const d=v instanceof Date?v:new Date(v);
  if(!Number.isFinite(d.valueOf()))return '';
  const parts=Object.fromEntries(ct.formatToParts(d).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function backDays(day:string,count:number){return new Date(Date.parse(day+'T12:00:00Z')-count*86400000).toISOString().slice(0,10);}
function currentStaff(v:Viewer,staff:FinRecord[]){return !v.onboardingOnly&&staff.some(r=>r.kind==='person'&&r.id===v.person&&r.status==='Active');}
const briefing=(section:string):HomeTarget=>({module:'Home',section});
const recentFirst=(a:PulseItem,b:PulseItem)=>String(b.at||'').localeCompare(String(a.at||''))||a.title.localeCompare(b.title);
export function fieldSignalsFromRows(v:Viewer, staff:FinRecord[], all:Row[], vehicleRows:Row[], now:Date):PulseSignal[] {
  if(!currentStaff(v,staff)) return [];
  const today=localDay(now),since=backDays(today,6),recent=(date:unknown)=>{const d=localDay(date);return !!d&&d>=since&&d<=today;};
  const manager=canAccess(v,'Account Management','accounts'), hub=canAccess(v,'Accounts','overview'),field=canAccess(v,'Home','fieldBriefing');
  const regHub=canAccess(v,'Accounts','safety'),regMgr=canAccess(v,'Account Management','safety'),register=regHub||regMgr;
  const regTarget=(id:string):HomeTarget=>regHub?{module:'Accounts',tab:'safety'}:regMgr?{module:'Account Management',tab:'safety'}:briefing(id);
  const signals:PulseSignal[]=[];
  const add=(id:string,title:string,module:string,description:string,unit:string,target:HomeTarget,items:PulseItem[],tone:PulseSignal['tone'],score:number,dateLabel?:string)=>{
    signals.push({id,title,module,description,unit,target,items:items.slice(0,60),count:items.length,tone:items.length?tone:'neutral',score:items.length?score:0,...(dateLabel?{dateLabel}:{})});
  };
  if(manager||hub||field){
    const accounts=all.filter(r=>r.kind==='account'&&!r.example&&!r.sample&&!r.isSample);
    const decisions=new Map<string,Row[]>();
    for(const r of all)if(r.kind==='decision'&&r.accountId){const key=String(r.accountId);const entries=decisions.get(key)||[];entries.push(r);decisions.set(key,entries);}
    const propertyTarget=(key:string,account?:Row):HomeTarget=>{
      if(key==='field_onboarding')return {module:'Account Management',tab:'accounts',section:'pending',...(account?{account:account.id}:{})};
      if(hub)return {module:'Accounts',tab:'overview',...(account?{account:account.id}:{})};
      if(manager)return {module:'Account Management',tab:'accounts',...(key==='field_terminated'?{section:'terminated'}:{}),...(account?{account:account.id}:{})};
      return briefing(key);
    };
    if(manager){
      const pending=accounts.filter(isPendingAccount).map(a=>({id:a.id,title:a.name,detail:a.launchDate?'Planned launch':'Onboarding in progress',...(localDay(a.launchDate)?{due:String(a.launchDate),calendar:true}:{}),target:propertyTarget('field_onboarding',a)}));
      pending.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.title.localeCompare(b.title));
      const overdue=pending.some(p=>p.due&&p.due<today);
      add('field_onboarding','Properties in Onboarding','Account Management','Pending accounts have not been released for enforcement.','properties',propertyTarget('field_onboarding'),pending,overdue?'warning':'info',overdue?76:50,'Current');
    }
    const stamps=(a:Row,types:string[])=> (decisions.get(a.id)||[]).filter(d=>types.includes(String(d.type))).map(d=>String(d.effectiveDate||d.date||'')).filter(d=>localDay(d)&&localDay(d)<=today);
    const service=(id:string,title:string,status:string,types:string[],detail:string,baseline:number,recentScore:number)=>{
      const items=accounts.filter(a=>a.status===status).map(a=>{const at=stamps(a,types).sort().at(-1);return {id:a.id,title:a.name,detail,...(at?{at}:{}),target:propertyTarget(id,a)};}).sort(recentFirst);
      const changed=items.filter(r=>recent(r.at)).length;
      add(id,title,'Account Hub',changed?changed+' changed in the last 7 days. '+detail:detail,'properties',propertyTarget(id),items,changed?'warning':'info',changed?recentScore:baseline,'Current');
    };
    service('field_paused','Service Suspensions','Paused',['Pause service'],'Enforcement is paused at these properties.',54,95);
    service('field_terminated','Terminated Properties','Terminated',['Terminate'],'Do not enforce at these properties.',23,91);
    const starts:PulseItem[]=[];
    for(const a of accounts){
      if(a.status!=='Active')continue;
      // A generic profile update or a planned launch does not authorize enforcement.
      const dates=stamps(a,['Activate','Reactivate']);
      if(a.onboardingCompletedAt&&localDay(a.onboardingCompletedAt)<=today&&localDay(a.onboardingCompletedAt))dates.push(String(a.onboardingCompletedAt));
      const at=dates.sort().at(-1);
      if(at&&recent(at))starts.push({id:a.id,title:a.name,detail:[a.service!=='Unconfirmed'&&a.service,'Confirm posted instructions before enforcing'].filter(Boolean).join(' · '),at,target:propertyTarget('field_started',a)});
    }
    add('field_started','Newly Active Properties','Account Hub','Properties activated or reactivated in the last 7 days.','properties',propertyTarget('field_started'),starts.sort(recentFirst),'info',75,'Last 7 Days');
  }
  // All active staff already receive the alert-only view. Never copy a case, evidence,
  // officer details, charges, IDs or notes into a briefing. Cleared alerts are excluded by safetyAlerts.
  const alerts=safetyAlerts(all,vehicleRows,today).map(a=>({id:a.id,title:a.name,detail:a.reason,at:a.date,target:regTarget('safety_alerts'),severity:'critical' as const}));
  add('safety_alerts','Active Staff Safety Alerts','Account Hub','Open staff alerts for a reported encounter or an associated vehicle return.','alerts',regTarget('safety_alerts'),alerts,'critical',100,'Active Now');
  if(register||field){
    const opened=new Map<string,string>();
    for(const r of all)if(r.kind==='safetyUpdate'&&r.name==='Case opened'&&r.caseId){const at=String(r.updatedAt||r.date||'');if(localDay(at))opened.set(String(r.caseId),at);}
    const cases:PulseItem[]=[];
    for(const c of all){
      if(c.kind!=='trespass')continue;
      if(!register && c.warningStatus!=='Issued')continue;
      // Backdated cases are new when filed, not when the incident happened. Edits never reset the filing date.
      const at=opened.get(c.id)||String(c.createdAt||(c.version===1?c.updatedAt:'')||'');
      // A newly issued CTW in a previously recorded case also belongs in the limited field bulletin.
      const noticeAt=!register&&recent(c.warningDate)?String(c.warningDate):at;
      if(!recent(noticeAt))continue;
      const status=c.warningStatus?String(c.warningStatus):'Status not entered';
      cases.push({id:c.id,title:c.name,detail:'Company yard · CTW: '+status,at:noticeAt,target:regTarget('safety_new')});
    }
    add('safety_new',register?'New Trespass Records':'New CTWs','Account Hub',register?'Cases added to the register in the last 7 days. The CTW status shows whether a warning was issued.':'Issued warnings recorded in the last 7 days for the company yard. Contact Dispatch for guidance.','records',regTarget('safety_new'),cases.sort(recentFirst),'info',84,'Last 7 Days');
  }
  return signals;
}
export async function fieldSignals(v:Viewer, staff:FinRecord[], now:Date, readRows?:()=>Promise<Row[]>):Promise<PulseSignal[]>{
  if(!currentStaff(v,staff))return [];
  const all=await (readRows?readRows():(await import('../accounts/server')).records());
  const vehicleRows=all.some(r=>r.kind==='trespass'&&r.watchEnabled!==false&&r.vehiclesJson)?vehicles(all):[];
  return [...fieldSignalsFromRows(v,staff,all,vehicleRows,now),...salesFollowupSignals(v,staff,all,now)];
}
