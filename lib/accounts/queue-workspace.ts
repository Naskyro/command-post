import {forms,type Row} from './model';
import {uiChoice,uiTitle} from '../shared/ui-title';
import {orderTypes} from './work-options';
import {actionDate,isFinished,workGroup,checklistProgress} from './work';
import {priorClosedWork} from '../year-history/work-periods';
export const workViews=['List','Board','Agenda'] as const;
export const workGroups=['Due Date','Status','Assignee','Property','Priority'] as const;
export type WorkView=typeof workViews[number];
export type Group=typeof workGroups[number];
export type QueuePrefs={view:WorkView;listGroup:Group;boardGroup:Group};
export const defaultPrefs:QueuePrefs={view:'List',listGroup:'Due Date',boardGroup:'Status'};
export function parsePrefs(s:string|null):QueuePrefs{try{const o=JSON.parse(s||'{}');return {view:workViews.includes(o.view)?o.view:'List',listGroup:workGroups.includes(o.listGroup)?o.listGroup:'Due Date',boardGroup:workGroups.includes(o.boardGroup)?o.boardGroup:'Status'};}catch{return defaultPrefs;}}
export const label=(v:unknown)=>uiTitle(String(v||''));
export const typeLabel=(v:unknown)=>uiChoice(v,[...(forms.task.find(f=>f.key==='type')?.options||[]),...orderTypes,'Release review']);
export const nameOf=(r:Row)=>({'Monthly check-in':'Monthly Check-In','Signage check due':'Signage Check Due','Confirm signage check date':'Confirm Signage Check Date'} as Record<string,string>)[r.name]||r.name;
export const dueGroups=['Overdue','Today','Upcoming','Waiting','Needs Scheduling','Completed','Cancelled'];
export const stateGroups=['Open','Requested','Scheduled','In Progress','Waiting','Ready for Review','Completed','Cancelled'];
export const readableStatus=(r:Row)=>r.status==='Due'?'Open':label(r.status)||'Open';
export const taskKind=(r:Row)=>r.derived?'Property Reminder':r.assetRequest?'Asset Request':r.kind==='workOrder'?'Work Order':'Task';
export const sourceAction=(r:Row)=>r.assetRequest?'Open Asset Library':r.type==='Release review'?'Open Courtesy Releases':r.type==='Signage report'?'Open Signage Checks':'Open Property Activity';
export const dueLabels=['Overdue','Due Today','Next 7 Days','No Date'] as const;
export type Filters={scope:'All'|'Mine'|'Requested';search:string;person:string;property:string;type:string;origin:string;priority:string;status:string;due:string;allYears:boolean};
export const cleanFilters:Filters={scope:'All',search:'',person:'',property:'',type:'',origin:'',priority:'',status:'Active Work',due:'',allYears:false};
export function queueMatchesDue(r:Row,day:string,when:string){const d=actionDate(r);return !when||(!isFinished(r)&&(when==='Overdue'?!!d&&d<day:when==='Due Today'?d===day:when==='No Date'?!d:when==='Next 7 Days'?!!d&&d>=day&&d<=new Date(Date.parse(day+'T12:00Z')+6*86400000).toISOString().slice(0,10):true));}
export function filteredQueue(rows:Row[],f:Filters,viewer:string,day:string,names:Map<string,string>){
 const text=f.search.trim().toLocaleLowerCase();
 return [...new Map(rows.filter(r=>!r.deletedAt).map(r=>[r.id,r])).values()].filter(r=>{
 if(f.scope==='Mine'&&r.assignee!==viewer||f.scope==='Requested'&&r.authorId!==viewer||f.person&&(r.assignee||'__none')!==f.person||f.property&&(r.accountId||'__none')!==f.property||f.type&&r.type!==f.type||f.origin&&f.origin!==taskKind(r)||f.priority&&r.priority!==f.priority)return false;
 if(f.status==='Active Work'?isFinished(r):f.status&&f.status!=='All Statuses'&&readableStatus(r)!==f.status)return false;
 if(!f.allYears&&!['Completed','Cancelled'].includes(f.status)&&priorClosedWork(r,day))return false;
 return queueMatchesDue(r,day,f.due)&&(!text||[nameOf(r),r.details,r.waitingOn,r.nextAction,r.type,r.priority,names.get(String(r.accountId)),names.get(String(r.assignee))].join(' ').toLocaleLowerCase().includes(text));
 }).sort((a,b)=>(actionDate(a)||'9999').localeCompare(actionDate(b)||'9999')||Number(b.priority==='Urgent')-Number(a.priority==='Urgent')||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function groupQueue(rows:Row[],g:Group|'Day',day:string,names:Map<string,string>,board=false){
 const groups=new Map<string,{key:string;title:string;rows:Row[]}>();
 const get=(k:string,t:string)=>{const v=groups.get(k)??{key:k,title:t,rows:[]};groups.set(k,v);return v;};
 for(const r of rows){const k=g==='Day'?actionDate(r)||'Undated':g==='Due Date'?label(workGroup(r,day)):g==='Status'?readableStatus(r):g==='Priority'?label(r.priority)||'Not Set':String((g==='Assignee'?r.assignee:r.accountId)||'');get(k,g==='Assignee'||g==='Property'?names.get(k)||(g==='Assignee'?'Unassigned':'No Linked Property'):k).rows.push(r);}
 if(board&&g==='Status'&&rows.length)for(const k of ['Open','In Progress','Waiting','Completed'])get(k,k);
 const known=g==='Due Date'?dueGroups:g==='Status'?stateGroups:g==='Priority'?['Urgent','High','Normal','Not Set']:[];
 const rank=(s:string)=>known.includes(s)?known.indexOf(s):999;
 return [...groups.values()].sort((a,b)=>rank(a.key)-rank(b.key)||a.title.localeCompare(b.title));
}
export function canQuickEdit(r:Row,editable:(r:Row)=>boolean,ops:boolean){return !r.derived&&!r.assetRequest&&!r.readOnly&&editable(r)&&(r.kind==='task'||r.kind==='workOrder'&&ops);}
export function completionBlock(row:Row,all:Row[]){const progress=checklistProgress(row);if(progress.done!==progress.total)return 'Complete the remaining checklist items first.';if(row.dependsOn&&!all.some(r=>r.id===row.dependsOn&&r.status==='Completed'))return 'Complete the preceding task first.';if(row.kind==='workOrder'&&!row.assignee)return 'Assign an Operations employee first.';return '';}

