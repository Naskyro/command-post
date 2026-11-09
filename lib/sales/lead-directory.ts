import type {Row} from '../accounts/model';
import type {Stage} from './config';
export type LeadView='all'|'won'|'lost'|'followups'|'property';
export type FollowQueue='overdue'|'today'|'upcoming'|'unscheduled';
export const followQueues:{id:FollowQueue;label:string}[]=[{id:'overdue',label:'Overdue'},{id:'today',label:'Due Today'},{id:'upcoming',label:'Upcoming'},{id:'unscheduled',label:'Needs a Next Step'}];
export function practiceLead(r:Row){return r.example===true||r.id.startsWith('sales-example:');}
export function propertyLabel(r:Row){return practiceLead(r)?r.name.replace(/^Sample\s*[·:–-]\s*/i,''):r.name;}
export function leadStageType(r:Row,stages:Stage[]){return stages.find(s=>s.id===r.stage)?.type||(r.stage==='Won'?'won':r.stage==='Lost'?'lost':'open');}
export function followQueue(row:Row,day:string):FollowQueue{if(typeof row.nextAction!=='string'||!row.nextAction.trim()||typeof row.dueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate))return 'unscheduled';return row.dueDate<day?'overdue':row.dueDate===day?'today':'upcoming';}
export function leadDirectoryRows(rows:Row[],stages:Stage[],view:LeadView,day:string,{practice,owner='',stage='',queue='',query=''}:{practice:boolean;owner?:string;stage?:string;queue?:string;query?:string}){
 const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 return rows.filter(r=>{if(r.kind!=='opportunity'||r.deletedAt||practiceLead(r)!==practice)return false;const type=leadStageType(r,stages);
 if(view==='followups'){if(type!=='open'&&followQueue(r,day)==='unscheduled')return false;}
 else if(view!=='property'&&type!==(view==='lost'?'lost':view==='won'?'won':'open'))return false;
 if(owner&&String(r.assignee||'')!==owner||stage&&r.stage!==stage||queue&&followQueue(r,day)!==queue)return false;
 const search=[r.name,r.address,r.companyName,r.propertyManager,r.assistantManager,r.contactName,r.currentProvider,r.nextAction,r.service,stages.find(s=>s.id===r.stage)?.label].join(' ').toLocaleLowerCase();
 return words.every(w=>search.includes(w));
 }).sort((a,b)=>{if(view==='followups'){const qa=followQueues.findIndex(q=>q.id===followQueue(a,day)),qb=followQueues.findIndex(q=>q.id===followQueue(b,day));if(qa!==qb)return qa-qb;const dates=String(a.dueDate||'').localeCompare(String(b.dueDate||''));if(dates)return dates;}
 return propertyLabel(a).localeCompare(propertyLabel(b),undefined,{numeric:true})||a.id.localeCompare(b.id);});
}
