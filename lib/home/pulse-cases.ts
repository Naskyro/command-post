import type {Viewer,FinRecord} from '../finance/model';
import type {PulseItem,PulseSignal,PulseTone} from './pulse-types';
import type {HomeTarget} from './widgets';
import {canAccess} from '../finance/access.ts';
import {localDate} from '../finance/timeclock.ts';
import {CCR,docketAccess,realDay,hearingInstant,type Matter} from '../ccr/docket-model.ts';
import type {Row} from '../accounts/model';
export type WorkClaimRow=Pick<Row,'id'|'name'|'kind'> & Partial<Row>;
const addDay=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function dayOf(v:unknown){if(realDay(v))return v as string;return typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d.*(?:Z|[+-]\d\d:?\d\d)$/.test(v)&&!Number.isNaN(Date.parse(v))?localDate(v):'';}
const tone=(items:PulseItem[],fallback:PulseTone):PulseTone=>items.some(i=>i.severity==='critical')?'critical':items.some(i=>i.severity==='warning')?'warning':items.length?fallback:'neutral';
const closedOrder=(r:WorkClaimRow)=>['Completed','Cancelled','Closed'].includes(String(r.status));
const compareDue=(a:PulseItem,b:PulseItem)=>(a.due||'9999').localeCompare(b.due||'9999')||a.title.localeCompare(b.title);
export function caseSignalProjection(v:Viewer,rows:WorkClaimRow[],matters:Matter[],today:string):PulseSignal[]{
 const out:PulseSignal[]=[],daysAgo=addDay(today,-6),start=addDay(today,-new Date(today+'T12:00:00Z').getUTCDay()),next=addDay(start,7),after=addDay(next,7);
 const all=rows.filter(r=>!r.deletedAt&&!r.isSample&&!r.sample&&!r.isDemo&&!r.trainingSample);
 const add=(id:string,title:string,target:HomeTarget,description:string,unit:string,items:PulseItem[],fallback:PulseTone,score:number,dateLabel:string)=>out.push({id,title,module:target.module,description,unit,count:items.length,items,target,tone:tone(items,fallback),score:items.length?score:0,dateLabel});
 if(canAccess(v,'Work Orders','orders')){
  const target={module:'Work Orders',tab:'orders'},orders=all.filter(r=>r.kind==='workOrder'),open=orders.filter(r=>!closedOrder(r));
  const action=(r:WorkClaimRow)=>realDay(String(r.status||'').startsWith('Waiting')?r.remindOn:r.dueDate);
  const created=(r:WorkClaimRow)=>String(r.createdAt||r.requestedAt||r.firstRecorded||'');
  const item=(r:WorkClaimRow):PulseItem=>{const due=action(r),critical=!closedOrder(r)&&(r.priority==='Urgent'||!!due&&due<today),warning=!closedOrder(r)&&(r.priority==='High'||due===today);return {id:'order:'+r.id,title:r.name||'Work Order',detail:[r.status,r.priority,r.assignee===v.person?'Assigned to you':null].filter(Boolean).join(' · '),due:!closedOrder(r)&&due||undefined,calendar:!closedOrder(r)&&!!due,at:created(r)||undefined,target,severity:critical?'critical':warning?'warning':'info'};};
  const queue=open.map(item).sort(compareDue),urgent=open.filter(r=>r.assignee===v.person&&(r.priority==='Urgent'||r.priority==='High'||!!action(r)&&action(r)<=today)).map(item).sort(compareDue);
  const recent=orders.filter(r=>{const d=dayOf(created(r));return !!d&&d>=daysAgo&&d<=today;}).map(r=>({...item(r),calendar:false})).sort((a,b)=>(b.at||'').localeCompare(a.at||''));
  // Do not colour the entire backlog critical merely because one user's assigned work is overdue.
  add('work_new','New Work Orders',target,'Requests entered in the last seven days.','orders',recent.map(i=>({...i,severity:'info'})),'info',42,'Last 7 Days');
  add('work_pending','Pending Work Orders',target,'All requests still awaiting completion or cancellation.','orders',queue.map(i=>({...i,severity:'info'})),'info',48,'Current');
  add('work_urgent','My Priority Work Orders',target,'High or urgent assignments, plus your work due today or overdue.','orders',urgent,'warning',87,'Assigned to Me');
 }
 if(canAccess(v,CCR,'damage')){
  const target={module:CCR,tab:'damage'},active=all.filter(r=>r.kind==='claim'&&!['Paid','Closed','Resolved','Closed without settlement','Closed - No Recovery','Cancelled'].includes(String(r.status)));
  const items=active.map(r=>{const due=realDay(r.nextFollowUp),major=r.claimPriority==='Major';return {id:'claim:'+r.id,title:r.name||'Damage Claim',detail:[major?'Major claim':null,String(r.status||'Under review'),due?'Follow-up due':null].filter(Boolean).join(' · '),due:due||undefined,calendar:!!due,at:realDay(r.date)||undefined,target,severity:major||due&&due<today?'critical':due===today?'warning':'info'} as PulseItem;}).sort((a,b)=> Number(b.severity==='critical')-Number(a.severity==='critical')||compareDue(a,b));
  add('major_claims','Priority Damage Claims',target,'Open claims marked Major or with a follow-up due today or overdue.','claims',items.filter(i=>i.severity!=='info'),'warning',95,'Current');
  add('open_damage_claims','Open Damage Claims',target,'Current damage investigations and asset claims with no final outcome.','claims',items.map(i=>({...i,severity:'info'})),'info',45,'Current');
 }
 if(docketAccess(v)){
  const target={module:CCR,tab:'hearings'},lawsuits:PulseItem[]=[],thisWeek:PulseItem[]=[],nextWeek:PulseItem[]=[],deadlines:PulseItem[]=[];
  for(const m of matters){
   if(m.status==='Outcome Unverified')continue;
   const target={module:CCR,tab:'hearings',section:'matter:'+m.id};
   if(m.type==='Lawsuit'&&m.filedOn>=daysAgo&&m.filedOn<=today)lawsuits.push({id:'case:'+m.id,title:m.title,at:m.filedOn,detail:[m.number,'Filed',m.status].filter(Boolean).join(' · '),target,severity:'warning'});
   if(m.status==='Open'&&realDay(m.dueOn)&&m.dueOn<after)deadlines.push({id:'deadline:'+m.id,title:m.dueFor||'Court Deadline',detail:m.title,due:m.dueOn,calendar:true,severity:m.dueOn<=today?'critical':'warning',target});
   for(const h of m.appearances){
    if(m.status!=='Open'&&h.status!=='Attended'||!realDay(h.date)||!['Scheduled','Attended'].includes(h.status)||h.date<start||h.date>=after)continue;
    const item:PulseItem={id:'hearing:'+m.id+':'+h.id,title:m.title,detail:[h.label,h.status].join(' · '),due:h.time?hearingInstant(h.date,h.time):h.date,calendar:true,target,severity:h.status==='Scheduled'&&h.date===today?'critical':h.status==='Scheduled'&&h.date>=today&&h.date<next?'warning':'info'};(h.date<next?thisWeek:nextWeek).push(item);
   }
  }
  add('new_lawsuits','New Lawsuits',target,'Lawsuits filed in the last seven days, using their recorded filing date.','lawsuits',lawsuits.sort((a,b)=>(b.at||'').localeCompare(a.at||'')),'warning',82,'Last 7 Days');
  add('court_this_week','Court Appearances This Week',target,'Scheduled or attended appearances, Sunday through Saturday.','appearances',thisWeek.sort(compareDue),'info',86,'This Week');
  add('court_next_week','Court Appearances Next Week',target,'Scheduled or attended appearances on next week’s docket.','appearances',nextWeek.sort(compareDue),'info',69,'Next Week');
  add('court_deadlines','Court Deadlines',target,'Outstanding response deadlines through the end of next week, including overdue matters.','deadlines',deadlines.sort(compareDue),'warning',96,'Through Next Week');
 }
 return out;
}
export async function casesSignals(v:Viewer,_records:FinRecord[],now:Date,_getAccountRows?:()=>Promise<Row[]>):Promise<PulseSignal[]>{
 const orders=canAccess(v,'Work Orders','orders'),damage=canAccess(v,CCR,'damage'),hearings=docketAccess(v);
 if(!orders&&!damage&&!hearings)return [];
 const {financeDb}=await import('@/db/finance'),db=financeDb();
 const [work,claims,assets,matters]=await Promise.all([
  orders?db.prepare("SELECT a.payload,(SELECT MIN(h.at) FROM account_audit h WHERE h.record_id=a.id AND h.before IS NULL) AS first_recorded FROM account_records a WHERE a.kind='workOrder'").all<{payload:string;first_recorded:string|null}>():undefined,
  damage?db.prepare("SELECT payload FROM account_records WHERE kind='claim'").all<{payload:string}>():undefined,
  damage?db.prepare("SELECT payload FROM hr_records WHERE kind='assetClaim'").all<{payload:string}>():undefined,
  hearings?(await import('@/lib/ccr/docket-server')).docket(v):[]]);
 const rows:WorkClaimRow[]=[...(work?.results||[]).map(r=>({...JSON.parse(r.payload),firstRecorded:r.first_recorded})),...(claims?.results||[]).map(r=>JSON.parse(r.payload))];
 if(assets?.results.length){const {decode}=await import('@/lib/hr/server');for(const a of await Promise.all(assets.results.map(r=>decode(r.payload))))rows.push({...a.data,id:a.id,name:a.data.title||'Asset Claim',kind:'claim',date:a.data.reportedDate});}
 return caseSignalProjection(v,rows,matters,localDate(now));
}
