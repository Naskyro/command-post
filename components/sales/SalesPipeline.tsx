'use client';
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {CalendarDays,Columns3,List,ChevronsDownUp,ChevronsUpDown,ChevronLeft,ChevronRight,ChevronDown,ArrowUpRight,CalendarClock,FolderOpen} from 'lucide-react';
import {type Row} from '@/lib/accounts/model';
import {LeadPropertyThumb} from './LeadPropertyPhoto';
import type {Stage} from '@/lib/sales/config';
import {businessDate,businessToday} from '@/lib/year-history/model';
import './pipeline-views.css';
type View='Board'|'List'|'Calendar';
type Prefs={view:View;group:'Stage'|'Assignee';collapsed:string[]};
const defaults:Prefs={view:'Board',group:'Stage',collapsed:[]};
const fmtMoney=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const shortDate=(s:string)=>businessDate(s)?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(businessDate(s)+'T12:00:00Z')):'Not Scheduled';
function yearMonth(base:string,delta:number){const date=new Date(base+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7);}
export function pipelinePrefs(raw:string|null):Prefs{
 try{const p=JSON.parse(raw||'null');return {view:['Board','List','Calendar'].includes(p?.view)?p.view:'Board',group:p?.group==='Assignee'?'Assignee':'Stage',collapsed:Array.isArray(p?.collapsed)?p.collapsed.filter((s:unknown)=>typeof s==='string'&&s.length<250).slice(0,250):[]};}catch{return defaults;}
}
export default function SalesPipeline({rows,stages,person,ownerName,onOpen,card,onClear,hasFilter}:{rows:Row[];stages:Stage[];person:string;ownerName:(id:unknown)=>string;onOpen:(id:string)=>void;card:(r:Row)=>ReactNode;onClear:()=>void;hasFilter:boolean}){
 const [prefs,set]=useState<Prefs>(defaults),[loaded,setLoaded]=useState(false),[month,setMonth]=useState(()=>businessToday().slice(0,7));
 const storageKey='command:sales:pipeline:v1:'+person;
 useEffect(()=>{try{set(pipelinePrefs(localStorage.getItem(storageKey)));}catch{set(defaults);}setLoaded(true);},[storageKey]);
 function change(next:Prefs){set(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Private browsing can still switch views. */}}
 const openStages=stages.filter(s=>s.type==='open'),openIds=new Set(openStages.map(s=>s.id)),open=rows.filter(r=>openIds.has(String(r.stage)));
 const label=(r:Row)=>stages.find(s=>s.id===r.stage)?.label||String(r.stage);
 const groups=prefs.group==='Stage'?openStages.map(s=>({key:'stage:'+s.id,label:s.label,rows:open.filter(r=>r.stage===s.id)})):[...new Set(open.map(r=>String(r.assignee||'')))].map(id=>({key:'owner:'+id,label:ownerName(id),rows:open.filter(r=>String(r.assignee||'')===id)})).sort((a,b)=>a.label.localeCompare(b.label));
 const weekStart=new Date(month+'-01T12:00:00Z').getUTCDay(),nDays=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0,12)).getUTCDate(),today=businessToday(),monthName=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
 const indexed=useMemo(()=>{const idx=new Map<string,Row[]>();for(const r of rows.filter(x=>stages.some(s=>s.type==='open'&&s.id===x.stage))){const d=businessDate(r.dueDate);(idx.get(d)||idx.set(d,[]).get(d)!).push(r);}return idx;},[rows,stages]);
 const dated=[...indexed.keys()].filter(Boolean).sort();
 const neighbor=dated.find(d=>d>=today)||dated.at(-1)||'';
 const monthScheduled=dated.some(d=>d.slice(0,7)===month);
 const calGroups=[...Array.from({length:Math.ceil((weekStart+nDays)/7)},(_,i)=>'week:'+month+':'+i),'unscheduled'];
 const keys=prefs.view==='Calendar'?calGroups:groups.map(g=>g.key),allClosed=keys.length>0&&keys.every(k=>prefs.collapsed.includes(k));
 const toggle=(key:string)=>change({...prefs,collapsed:prefs.collapsed.includes(key)?prefs.collapsed.filter(k=>k!==key):[...prefs.collapsed,key]});
 const ToggleIcon=allClosed?ChevronsUpDown:ChevronsDownUp;
 const dollars=open.filter(r=>!r.example&&typeof r.estimatedAnnualRevenue==='number'),demo=open.filter(r=>r.example).length;
 const openLink=(r:Row)=><button className="pipe-titlelink" type="button" onClick={()=>onOpen(r.id)}>{r.name}<ArrowUpRight size={13} aria-hidden/></button>;
 const details=(r:Row)=><tr key={r.id}><td><div className="pipe-property"><LeadPropertyThumb lead={r} variant="row"/><div>{openLink(r)}{r.example&&<small>Training Example</small>}</div></div></td><td>{prefs.group==='Stage'?ownerName(r.assignee):label(r)}</td><td>{String(r.nextAction||'No Next Action')}<small>{shortDate(String(r.dueDate||''))}</small></td><td>{typeof r.estimatedAnnualRevenue==='number'?fmtMoney.format(r.estimatedAnnualRevenue):'—'}</td></tr>;
 return <section className="pipe" aria-label="Sales Pipeline">
 <header className="pipe-mast"><div><small>OPPORTUNITY MANAGEMENT</small><h2>Sales Pipeline</h2></div><div className="pipe-stats"><span><b>{open.length-demo}</b> Open Leads{demo>0&&<small>{demo} training {demo===1?'example':'examples'}</small>}</span><span><b>{dollars.length?fmtMoney.format(dollars.reduce((a,r)=>a+Number(r.estimatedAnnualRevenue),0)):'—'}</b> Estimated Annual Value</span></div></header>
 <div className="pipe-toolbar"><div className="pipe-switch" role="group" aria-label="Pipeline View">{([['Board',Columns3],['List',List],['Calendar',CalendarDays]] as const).map(([v,Icon])=><button type="button" key={v} aria-pressed={prefs.view===v} onClick={()=>change({...prefs,view:v})} disabled={!loaded}><Icon size={16}/>{v}</button>)}</div>
 <div className="pipe-options">{prefs.view!=='Calendar'&&<label>Group By <select aria-label="Group Pipeline By" value={prefs.group} onChange={e=>change({...prefs,group:e.target.value as Prefs['group']})}><option>Stage</option><option>Assignee</option></select></label>}
 <button type="button" disabled={!keys.length||!loaded} onClick={()=>change({...prefs,collapsed:allClosed?prefs.collapsed.filter(k=>!keys.includes(k)):[...new Set([...prefs.collapsed,...keys])]})}><ToggleIcon size={15}/>{allClosed?'Expand All':'Collapse All'}</button></div></div>
 {hasFilter&&open.length===0&&<p className="pipe-filter-empty">No open leads match your filters. <button type="button" onClick={onClear}>Clear Filters</button></p>}
 {prefs.view!=='Calendar'?<div className={'pipe-groups '+(prefs.view==='Board'?'pipe-board':'pipe-list')}>{groups.map((g,i)=>{const folded=prefs.collapsed.includes(g.key);return <section key={g.key} className={'pipe-group pipe-tone-'+(i%4)}><button className="pipe-grouphead" type="button" onClick={()=>toggle(g.key)} aria-expanded={!folded}>{folded?<ChevronRight size={15}/>:<ChevronDown size={15}/>}<i aria-hidden/><strong>{g.label}</strong><span>{g.rows.length}</span></button>
 {!folded&&(g.rows.length?(prefs.view==='Board'?<div className="pipe-cards">{g.rows.map(card)}</div>:<div className="pipe-scroll"><table><thead><tr><th>Property</th><th>{prefs.group==='Stage'?'Assigned To':'Stage'}</th><th>Next Follow-Up</th><th>Annual Value</th></tr></thead><tbody>{g.rows.map(details)}</tbody></table></div>):<p className="pipe-empty"><FolderOpen size={16}/>No open leads in this section.</p>)}</section>;})}{!groups.length&&<p className="pipe-empty">No assigned leads in this view.</p>}</div>:
 <div className="pipe-cal"><header className="pipe-calhead"><div><CalendarClock size={19}/><h3>Follow-Up Calendar</h3></div><div><button type="button" aria-label="Previous Month" onClick={()=>setMonth(yearMonth(month,-1))}><ChevronLeft size={17}/></button><strong>{monthName}</strong><button type="button" aria-label="Next Month" onClick={()=>setMonth(yearMonth(month,1))}><ChevronRight size={17}/></button><button type="button" onClick={()=>setMonth(today.slice(0,7))}>This Month</button></div></header>
 {!monthScheduled&&<p className="pipe-cal-note">No follow-ups scheduled for {monthName}.{neighbor&&<button type="button" onClick={()=>setMonth(neighbor.slice(0,7))}>Go to {shortDate(neighbor)}</button>}</p>}
 <div className="pipe-cal-scroll"><div className="pipe-days">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><b key={d}>{d}</b>)}</div>{calGroups.slice(0,-1).map((key,week)=>{const folded=prefs.collapsed.includes(key),first=Math.max(1,week*7-weekStart+1),last=Math.min(nDays,week*7-weekStart+7);return <section key={key}><button className="pipe-week" aria-expanded={!folded} onClick={()=>toggle(key)}>{folded?<ChevronRight size={13}/>:<ChevronDown size={13}/>}Week of {shortDate(month+'-'+String(first).padStart(2,'0'))} <small>{open.filter(r=>{const d=businessDate(r.dueDate);return d.startsWith(month+'-')&&Number(d.slice(-2))>=first&&Number(d.slice(-2))<=last;}).length} scheduled</small></button>{!folded&&<div className="pipe-days">{Array.from({length:7},(_,i)=>{const day=week*7+i-weekStart+1,dt=month+'-'+String(day).padStart(2,'0');return day<1||day>nDays?<div className="outside" key={i}/>:<div key={i} className={dt===today?'today':''}><b>{day}</b>{(indexed.get(dt)||[]).map(r=><button key={r.id} title={r.name+' · '+String(r.nextAction||label(r))} onClick={()=>onOpen(r.id)}>{r.name}</button>)}</div>;})}</div>}</section>;})}</div>
 <button className="pipe-grouphead" aria-expanded={!prefs.collapsed.includes('unscheduled')} onClick={()=>toggle('unscheduled')}>{prefs.collapsed.includes('unscheduled')?<ChevronRight size={15}/>:<ChevronDown size={15}/>}<strong>Unscheduled</strong><span>{indexed.get('')?.length||0}</span></button>{!prefs.collapsed.includes('unscheduled')&&((indexed.get('')||[]).length?<div className="pipe-unscheduled">{indexed.get('')!.map(r=><div key={r.id}>{openLink(r)}<small>{label(r)}</small></div>)}</div>:<p className="pipe-empty">No open leads without a follow-up date.</p>)}</div>}
 </section>;
}
