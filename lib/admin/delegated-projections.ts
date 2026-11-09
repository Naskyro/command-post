import {canEnterPersonalSopTab} from '@/lib/sop/acknowledgment-access';
import {canAccess,accessCatalog} from '@/lib/finance/access';
import type {Viewer,FinRecord} from '@/lib/finance/model';
import {localDate} from '@/lib/finance/timeclock';
import {AppError,ForbiddenError} from '@/lib/shared/errors';
import type {HomePulse,PulseSignal} from '@/lib/home/pulse-types';
import {availableHomeSections} from '@/lib/home/dashboard-layout';
import {readPulsePreferences} from '@/lib/home/pulse-preferences';

export const workspaceTabs:Record<string,string[]>={
 Accounts:['overview'],'Account Management':['accounts'],'Sales CRM':['pipeline','opportunities'],Timeclock:['Schedule'],'Work Orders':['orders','completed'],'SOP Library':['assigned-learning','courses','learning']
};
type Workspace={module:string;tab:string;columns:string[];rows:string[][];total:number;summary:string;protected:boolean};
const text=(v:unknown)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,220):'';
const own=(o:object,k:string)=>Object.prototype.hasOwnProperty.call(o,k);
const permission=(v:Viewer,m:string,t?:string)=>canAccess(v,m,t)||canEnterPersonalSopTab(v,m,t);
function counts(values:string[]){const map=new Map<string,number>();for(const s of values)map.set(s,(map.get(s)||0)+1);return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([label,n])=>[label,String(n)]);}

export async function previewWorkspace(viewer:Viewer,records:FinRecord[],module:string,selected:string,actor:Viewer):Promise<Workspace>{
 if(!own(accessCatalog,module)||!permission(viewer,module))throw new ForbiddenError();
 const allowed=workspaceTabs[module]||[],tab=selected||allowed.find(t=>permission(viewer,module,t))||'';
 if(tab&&(!own(accessCatalog[module],tab)||!permission(viewer,module,tab)))throw new ForbiddenError();
 const protectedView:Workspace={module,tab,columns:[],rows:[],total:0,protected:true,summary:'Private information and actions are unavailable in Delegated Access.'};
 if(!tab||!allowed.includes(tab)||!permission(actor,module,tab))return protectedView;
 const show=(columns:string[],rows:string[][],summary:string):Workspace=>({module,tab,columns,rows:rows.slice(0,500),total:rows.length,summary,protected:false});
 if(module==='Timeclock'){
  const today=localDate(Date.now()),end=localDate(Date.now()+14*86400000);
  // Managers in the same reporting chain may have different scheduling scopes.
  const available=actor.owner?records:(await import('@/lib/finance/visibility')).visible(actor,records,'timeclock');
  const rows=available.filter(r=>r.kind==='shift'&&r.person===viewer.person&&r.status==='Published'&&text(r.end).slice(0,10)>=today&&text(r.start).slice(0,10)<end).sort((a,b)=>text(a.start).localeCompare(text(b.start)));
  const local=(x:unknown)=>{const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(text(x));return m?m[2]+'-'+m[3]+'-'+m[1]+' '+String(Number(m[4])%12||12).padStart(2,'0')+':'+m[5]+(Number(m[4])<12?'am':'pm')+' CT':'';};
  return show(['Shift Starts','Shift Ends','Department'],rows.map(r=>[local(r.start),local(r.end),text(r.department)]),'Published shifts for this employee over the next 14 days.');
 }
 if(module==='SOP Library'){
  const school=await import('@/lib/school/server'),ctx=await school.contextForViewer(viewer,records);
  const actorCatalog=actor.owner?null:new Set((await school.courses(await school.contextForViewer(actor,records))).filter(c=>c.status==='Published').map(c=>c.id));
  const courses=(await school.data(ctx)).courses.filter(c=>c.status==='Published'&&c.available&&(!actorCatalog||actorCatalog.has(c.id))&&(tab==='courses'||c.assigned));
  return show(['Course','Assignment','Progress'],courses.sort((a,b)=>a.title.localeCompare(b.title)).map(c=>[text(c.title),c.assigned?'Assigned':'Course Catalog',String(c.progress?.percent||0)+'%']),tab==='courses'?'Published courses available to this employee.':'Published training assigned to this employee. Exam answers and grades are private.');
 }
 const accounts=await import('@/lib/accounts/server'),all=await accounts.records();
 if(module==='Accounts'||module==='Account Management'){
  const surface=module==='Accounts'?'dispatch':'manager',actorIds=actor.owner?null:new Set(accounts.projection(all,actor,surface).filter(r=>r.kind==='account').map(r=>r.id));
  const rows=accounts.projection(all,viewer,surface).filter(r=>(!actorIds||actorIds.has(r.id))&&r.kind==='account'&&!r.deletedAt&&(module==='Accounts'||!['Terminated','Cancelled','Pending','Onboarding'].includes(text(r.status)))).sort((a,b)=>a.name.localeCompare(b.name));
  return show(['Property','Property Address','Service','Status'],rows.map(r=>[text(r.name),text(r.address),text(r.service),text(r.status)]),'Property directory. Gate codes, contacts, files, and incident details are protected.');
 }
 if(module==='Sales CRM'){
  const {stageId,stagesFor}=await import('@/lib/sales/config'),stages=stagesFor(all),byId=new Map(stages.map(s=>[s.id,s.label]));
  // Sales CRM's live pipeline projects all opportunities to a permitted pipeline reader (no branch-specific field is exposed).
  const leads=all.filter(r=>r.kind==='opportunity'&&!r.deletedAt);
  return show(['Pipeline Stage','Leads'],counts(leads.map(r=>text(byId.get(stageId(r.stage))||stageId(r.stage)))),'Live lead counts by pipeline stage. Lead communications and contact records are private.');
 }
 if(module==='Work Orders'){
  // The real order API requires the orders grant even with a Completed tab.
  if(!permission(viewer,module,'orders')||!permission(actor,module,'orders'))return protectedView;
  const actorIds=actor.owner?null:new Set(accounts.projection(all,actor,'orders').filter(r=>r.kind==='workOrder').map(r=>r.id));
  const orders=accounts.projection(all,viewer,'orders').filter(r=>(!actorIds||actorIds.has(r.id))&&r.kind==='workOrder'&&!r.deletedAt&&(tab!=='completed'||r.status==='Completed'));
  return show(['Status','Work Orders'],counts(orders.map(r=>text(r.status)||'Unspecified')),'Work order counts by status. Internal notes, attachments, and costs are protected.');
 }
 return protectedView;
}
const allowedSignalIds=new Set(['my_shifts','coverage_gaps','open_shift_pickups','field_onboarding','field_paused','field_terminated','field_started','work_new','work_pending','work_urgent','learning_pending','learning_overdue','sop_signatures']);
export function aggregateSignal(s:PulseSignal):PulseSignal[]{
 if(!allowedSignalIds.has(s.id))return [];
 // No subject names, details, source IDs, financial amounts, arbitrary target query,
 // calendar item, or new source payload can pass through this projection.
 return [{id:s.id,title:s.title,module:s.module,description:s.description,count:s.count,unit:s.unit,target:{module:s.target.module,tab:s.target.tab},items:[],score:s.score,tone:s.tone,dateLabel:s.dateLabel}];
}
export async function previewHome(viewer:Viewer,records:FinRecord[],actor:Viewer) {
 const time=new Date(),today=localDate(time),scope:Viewer={...viewer,owner:false,canRelease:false,canManage:false,customAccess:true,hrResponsibilities:[],access:(viewer.access||[]).filter(g=>permission(actor,g.module,g.tab)&&['Home','Timeclock','Work Orders','SOP Library','Accounts','Account Management'].includes(g.module))};
 const {schedulingSignals}=await import('@/lib/home/pulse-people'),{homeLearning}=await import('@/lib/home/pulse-learning'),{homeOrderAnalytics}=await import('@/lib/home/order-analytics');
 const field=canAccess(scope,'Accounts','overview')||canAccess(scope,'Account Management','accounts')||canAccess(scope,'Home','fieldBriefing'),work=canAccess(scope,'Work Orders','orders');
 const operational=(field||work)?await (await import('@/lib/accounts/server')).records():[];
 const {fieldSignalsFromRows}=await import('@/lib/home/pulse-field'),{caseSignalProjection}=await import('@/lib/home/pulse-cases');
 const source=await Promise.allSettled([schedulingSignals(scope,records,time),homeLearning(scope,records,time),homeOrderAnalytics(scope,records,time)] as const);
 const shifts=source[0].status==='fulfilled'?source[0].value:[],learning=source[1].status==='fulfilled'?source[1].value:null,orders=source[2].status==='fulfilled'?source[2].value:null;
 const signals=[...shifts,...(learning?.signals||[]),...(field?fieldSignalsFromRows(scope,records,operational.filter(r=>['account','decision'].includes(r.kind)),[],time):[]),...(work?caseSignalProjection(scope,operational.filter(r=>r.kind==='workOrder'),[],today):[])].flatMap(aggregateSignal);
 const pulse:HomePulse={asOf:time.toISOString(),today,signals,unavailable:source.flatMap((s,i)=>s.status==='rejected'?[['Shift Counts','Learning Counts','Work Order Trends'][i]]:[]),learning:learning?{assigned:learning.summary.assigned,pending:learning.summary.pending,completed:learning.summary.completed,inProgress:learning.summary.inProgress,overdue:learning.summary.overdue,awaitingReview:learning.summary.awaitingReview,percent:learning.summary.percent,items:[]}:null,orderAnalytics:orders?{asOf:orders.asOf,coverageFrom:orders.coverageFrom,undatedOpened:orders.undatedOpened,undatedCompleted:orders.undatedCompleted,weeks:orders.weeks.map(w=>({week:w.week,opened:w.opened,completed:w.completed,partial:w.partial}))}:null};
 const availableSections=availableHomeSections(scope,pulse),options=await readPulsePreferences(viewer,signals.map(s=>s.id),undefined,availableSections);
 if(!('layout' in options))throw new AppError('Unable to read the dashboard layout.',503);
 return {viewer,title:text(records.find(p=>p.kind==='person'&&p.id===viewer.person)?.title),timeZone:'America/Chicago',pulse,availableSections,layout:options.layout,preferences:options.preferences,preferenceVersion:options.version};
}
