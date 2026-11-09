import type {Row} from './model';
import {current} from './model';
import type {Matter} from '../ccr/docket-model';
export type CourtBrief={id:string;accountId:string;type:Matter['type'];dueOn:string;appearances:{id:string;date:string;time?:string}[]};
const txt=(v:unknown)=>typeof v==='string'?v:'';
export const isLive=(r:Partial<Row>)=>!r.deletedAt&&!r.sample&&!r.example&&!r.isSample&&!r.trainingSample&&!r.isDemo&&r.status!=='Deleted';
export function realDate(v:unknown){const x=txt(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return '';const d=new Date(x+'T12:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===x?x:'';}
export function inPortfolio(r:Row,scope:string,day:string){return !scope||r.assignee===scope||r.backup===scope&&Boolean(realDate(r.backupUntil)&&String(r.backupUntil)>=day);}
export function publicCourtBrief(matters:Matter[],allowed:Set<string>):CourtBrief[]{return matters.flatMap(m=>{
 if(m.status!=='Open'||!m.accountId||!allowed.has(m.accountId))return [];
 return [{id:m.id,accountId:m.accountId,type:m.type,dueOn:realDate(m.dueOn),appearances:m.appearances.filter(a=>a.status==='Scheduled'&&realDate(a.date)).map(a=>({id:a.id,date:a.date,...(a.time?{time:a.time}:{})})).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99').localeCompare(b.time||'99'))}];
});}
export function afterDays(day:string,count:number){return new Date(Date.parse(day+'T12:00Z')+count*86400000).toISOString().slice(0,10);}
const daySort=(a:string,b:string)=>(a||'9999').localeCompare(b||'9999');
// Feb 29 observances are shown on the recorded calendar day only; never invent a birthday.
export function nextBirthday(v:unknown,day:string){const birth=realDate(v);if(!birth||birth>day)return '';for(let i=0;i<5;i++){const d=realDate((Number(day.slice(0,4))+i)+birth.slice(4));if(d>=day)return d;}return '';}
export function accountBrief(rows:Row[],scope:string,day:string,court:CourtBrief[]){
 const data=rows.filter(isLive),accounts=data.filter(r=>r.kind==='account'&&inPortfolio(r,scope,day)),byId=new Map(accounts.map(r=>[r.id,r]));
 const operational=new Map(accounts.filter(r=>!['Archived','Inactive','Terminated'].includes(String(r.status))).map(r=>[r.id,r]));
 const claims=data.filter(r=>r.kind==='claim'&&byId.has(String(r.accountId))&&!['Paid','Closed without settlement','Closed','Cancelled','Voided','Archived'].includes(String(r.status))).sort((a,b)=>daySort(realDate(a.nextFollowUp),realDate(b.nextFollowUp))||Number(b.claimPriority==='Major')-Number(a.claimPriority==='Major')||a.name.localeCompare(b.name));
 const pending=[...operational.values()].filter(a=>a.status==='Onboarding').sort((a,b)=>daySort(realDate(a.launchDate),realDate(b.launchDate))||a.name.localeCompare(b.name));
 const contacts=new Map(data.filter(r=>r.kind==='contact').map(r=>[r.id,r])),birthByContact=new Map<string,{id:string,name:string,date:string,properties:Map<string,string>}>();
 for(const r of data){const a=operational.get(String(r.accountId)),c=contacts.get(String(r.contactId));if(r.kind!=='affiliation'||r.role!=='Property Manager'||!a||!c||!current(r,day))continue;
  const d=nextBirthday(c.dateOfBirth,day);if(!d||d>afterDays(day,30))continue;
  const item=birthByContact.get(c.id)||{id:c.id,name:c.name,date:d,properties:new Map<string,string>()};item.properties.set(a.id,a.name);birthByContact.set(c.id,item);}
 const birthdays=[...birthByContact.values()].map(b=>({...b,properties:[...b.properties.values()].sort()})).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
 const cases=court.filter(m=>byId.has(m.accountId)).map(m=>{
  const next=m.appearances.find(a=>a.date>=day),prior=m.appearances.filter(a=>a.date<day).at(-1);
  const nextDate=[m.dueOn,next?.date].filter((s):s is string=>!!s).sort()[0]||'';
  return {...m,next,unconfirmed:prior,nextDate};
 }).sort((a,b)=>daySort(a.nextDate,b.nextDate)||a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
 return {byId,claims,pending,birthdays,cases};
}
type Focus={kind:'court'|'claim'|'task'|'pending';id:string;title:string;accountId:string;date:string};
export function nextAccountPriority(brief:ReturnType<typeof accountBrief>,actions:Row[],day:string,rights:{cases:boolean;claims:boolean;tasks:boolean;pending:boolean}):Focus|undefined{
 const candidates:{level:number;item:Focus}[]=[];
 const add=(level:number,kind:Focus['kind'],id:string,title:string,accountId:unknown,date:string)=>candidates.push({level,item:{kind,id,title,accountId:txt(accountId),date}});
 if(rights.cases)for(const c of brief.cases){
  if(c.dueOn&&c.dueOn<=day)add(1,'court',c.id,c.type+' · '+(c.dueOn<day?'Past Court Deadline':'Court Deadline Today'),c.accountId,c.dueOn);
  if(c.next&&c.next.date<=afterDays(day,6))add(c.next.date===day?1:6,'court',c.id,c.type+' · Scheduled Appearance',c.accountId,c.next.date);
 }
 if(rights.claims)for(const r of brief.claims){const d=realDate(r.nextFollowUp);if(d&&d<=day||r.claimPriority==='Major')add(r.claimPriority==='Major'?2:4,'claim',r.id,r.claimPriority==='Major'?'Review Major Damage Claim':'Damage Claim Follow-Up',r.accountId,d);}
 if(rights.tasks)for(const r of actions){const d=realDate(String(r.status).startsWith('Waiting')?r.remindOn:r.dueDate);if(d&&d<=day)add(r.priority==='Urgent'?2:5,'task',r.id,r.name,r.accountId,d);}
 if(rights.pending)for(const a of brief.pending){const d=realDate(a.launchDate);if(d&&d<=afterDays(day,6))add(d<=day?3:7,'pending',a.id,'Review Planned Property Launch',a.id,d);}
 return candidates.sort((a,b)=>a.level-b.level||daySort(a.item.date,b.item.date)||a.item.id.localeCompare(b.item.id))[0]?.item;
}
