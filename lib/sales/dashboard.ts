// The caller passes only its authorized, already-filtered Sales projection.
// This function must not fetch a broader portfolio or recreate dismissed samples.
import type {Row} from '../accounts/model';
import type {Stage} from './config';
import {auditDay} from '../shared/audit-format.ts';

export const salesChannels=['Phone call','Onsite visit','Email'] as const;
export type SalesChannel=typeof salesChannels[number];
export const queueTypes=['Due Now','Upcoming','Needs a Next Step'] as const;
export type QueueType=typeof queueTypes[number];
export const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const isSample=(r:Row)=>Boolean(r.example||r.isSample||r.sample||r.trainingSample||r.isDemo||r.id.startsWith('sales-example:'));
const value=(r:Row)=>typeof r.estimatedAnnualRevenue==='number'&&Number.isFinite(r.estimatedAnnualRevenue)?r.estimatedAnnualRevenue:undefined;
export const estimate=(rows:Row[])=>rows.reduce((sum,r)=>sum+(value(r)??0),0);
const unique=(rows:Row[])=>[...new Map(rows.filter(r=>!r.deletedAt).map(r=>[r.id,r])).values()];
function isoDay(v:unknown){const day=auditDay(v);return day?day.slice(6)+'-'+day.slice(0,2)+'-'+day.slice(3,5):'';}
const priorities:Record<string,number>={Urgent:2,High:1};
const rank=(r:Row)=>priorities[text(r.priority)]||0;
const byName=(a:Row,b:Row)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
export function monthAxis(day:string,offset:number){const base=new Date(day+'T12:00:00Z');return Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+offset+i,1));return {key:d.toISOString().slice(0,7),label:new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short'}).format(d),full:new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',year:'numeric'}).format(d)};});}
export function queueLeads(open:Row[],type:QueueType,day:string,person?:string){
 return open.filter(r=>{if(person!==undefined&&r.assignee!==person)return false;const due=isoDay(r.dueDate);return type==='Due Now'?Boolean(due&&due<=day):type==='Upcoming'?Boolean(due&&due>day):!due||!text(r.nextAction);})
 .sort((a,b)=>type==='Needs a Next Step'?rank(b)-rank(a)||byName(a,b):isoDay(a.dueDate).localeCompare(isoDay(b.dueDate))||rank(b)-rank(a)||byName(a,b));
}
export function dashboardData(rows:Row[],activities:Row[],stages:Stage[],day:string){
 const portfolios=unique(rows).filter(r=>r.kind==='opportunity'),live=portfolios.filter(r=>!isSample(r)),examples=portfolios.filter(isSample);
 const byId=new Map(live.map(r=>[r.id,r]));
 const stageLookup=new Map(stages.map(s=>[s.id,s]));
 const type=(r:Row)=>stageLookup.get(text(r.stage))?.type||(r.stage==='Won'?'won':r.stage==='Lost'?'lost':'open');
 const open=live.filter(r=>type(r)==='open'),won=live.filter(r=>type(r)==='won'),lost=live.filter(r=>type(r)==='lost');
 const logs=unique(activities).filter(r=>r.kind==='salesActivity'&&!isSample(r)&&byId.has(text(r.opportunityId)));
 const stageRows=new Map<string,Row[]>();for(const r of live){const k=text(r.stage);const list=stageRows.get(k)||[];list.push(r);stageRows.set(k,list);}
 const stageMix=[...new Set([...stages.map(s=>s.id),...stageRows.keys()])].map(id=>({id,label:stageLookup.get(id)?.label||id||'Stage Not Recorded',rows:(stageRows.get(id)||[]).slice().sort(byName)}));
 const byChannel=Object.fromEntries(salesChannels.map(k=>[k,logs.filter(r=>r.channel===k).length])) as Record<SalesChannel,number>;
 const eventsByMonth=new Map<string,Row[]>();for(const r of logs)if(salesChannels.some(k=>k===r.channel)){const key=isoDay(r.date).slice(0,7);if(key){const group=eventsByMonth.get(key)||[];group.push(r);eventsByMonth.set(key,group);}}
 const activity=monthAxis(day,-5).map(m=>{const records=(eventsByMonth.get(m.key)||[]).slice().sort((a,b)=>isoDay(b.date).localeCompare(isoDay(a.date))||a.id.localeCompare(b.id));return {...m,records,total:records.length};});
 const forecast=monthAxis(day,0).map(m=>{const records=open.filter(r=>isoDay(r.targetCloseDate).startsWith(m.key)).sort((a,b)=>isoDay(a.targetCloseDate).localeCompare(isoDay(b.targetCloseDate))||byName(a,b));return {...m,records,total:estimate(records),valued:records.filter(r=>value(r)!==undefined).length};});
 const services=Array.from(new Set(live.map(r=>text(r.service)||'Unconfirmed'))).map(name=>({name,rows:live.filter(r=>(text(r.service)||'Unconfirmed')===name).sort(byName)})).sort((a,b)=>b.rows.length-a.rows.length||a.name.localeCompare(b.name));
 const valued=open.filter(r=>value(r)!==undefined).length;
 return {live,examples,byId,open,won,lost,winRate:won.length+lost.length?Math.round(100*won.length/(won.length+lost.length)):null,valued,annual:estimate(open),due:queueLeads(open,'Due Now',day).length,stageMix,byChannel,activity,forecast,services};
}
