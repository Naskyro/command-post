'use client';
import FilterBar from '@/components/shared/FilterBar';
import './work.css';
import { useState } from 'react';
import { AlertCircle, CalendarDays, Check, ChevronDown, Circle, Clock3, List, MessageSquare, Plus, Search, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { actionDate, checklistProgress, isFinished, isWaiting, workGroup } from '@/lib/accounts/work';
import { today, type Row } from '@/lib/accounts/model';
const groups = ['Overdue', 'Today', 'Upcoming', 'Waiting', 'Needs scheduling', 'Completed', 'Cancelled'];
const formatDate = (date: string) => date ? new Date(date+'T12:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}) : 'Unscheduled';
const initials = (s: string) => s.split(/\s+/).slice(0,2).map(n=>n[0]).join('');
export function WorkQueue({rows,all,staff,viewerId,editable,onOpen,onAccount,onNew,onRequest,orders=false}:{rows:Row[];all:Row[];staff:{id:string;name:string}[];viewerId:string;editable:(r:Row)=>boolean;onOpen:(r:Row)=>void;onAccount?:(id:string)=>void;onNew?:()=>void;onRequest?:()=>void;orders?:boolean}) {
  const [scope,setScope]=useState('All'),[query,setQuery]=useState(''),[person,setPerson]=useState(''),[type,setType]=useState(''),[metric,setMetric]=useState(''),[view,setView]=useState('List'),[limit,setLimit]=useState(60);
  const name=(id:unknown)=>staff.find(p=>p.id===id)?.name||all.find(p=>p.id===id)?.name||'Unassigned';
  const date=today(),end=new Date(Date.parse(date+'T12:00Z')+(6-new Date(date+'T12:00Z').getUTCDay())*86400000).toISOString().slice(0,10);
  const base=rows.filter(r=>(scope!=='Mine'||r.assignee===viewerId)&&(scope!=='Requested'||r.authorId===viewerId)&&(!person||r.assignee===person)&&(!type||r.type===type)&&(!query||[r.name,name(r.accountId),name(r.assignee),r.details,r.waitingOn].join(' ').toLowerCase().includes(query.toLowerCase())));
  const displayName=(r:Row)=>r.name==='Monthly check-in'?'Monthly Check-In':r.name;
  const matches=(r:Row,key:string)=>key==='This week'?!isFinished(r)&&!!actionDate(r)&&actionDate(r)>=date&&actionDate(r)<=end:workGroup(r,date)===key;
  const result=base.filter(r=>!metric||matches(r,metric));
  const metrics=[['Overdue',AlertCircle],['Today',CalendarDays],['This week',Clock3],['Completed',Check]] as const;
  const sorted=[...result].sort((a,b)=>(actionDate(a)||'9999').localeCompare(actionDate(b)||'9999')||a.name.localeCompare(b.name));
  const shown=sorted.slice(0,limit);
  function open(r:Row,complete=false){onOpen(complete&&!r.derived?{...r,status:'Completed'}:r);}
  function task(r:Row){const progress=checklistProgress(r),comments=all.filter(c=>c.kind==='comment'&&c.parentId===r.id).length,group=workGroup(r,date);return <article key={r.id} className={'am-task-row '+(group==='Overdue'?'is-overdue':'')}>
    <button className="am-task-check" aria-label={(r.status==='Completed'?'View completed task: ':'Complete: ')+displayName(r)} onClick={()=>open(r,editable(r)&&r.kind==='task')} disabled={!editable(r)&&!r.derived&&r.status!=='Completed'}>{r.status==='Completed'?<Check size={18}/>:<Circle size={20}/>}</button>
    <div className="am-task-title"><button onClick={()=>open(r)}>{r.kind==='workOrder'&&<Wrench size={15}/>}<b>{displayName(r)}</b></button>{r.accountId&&(onAccount?<button className="am-task-property" onClick={()=>onAccount(String(r.accountId))}>{name(r.accountId)}</button>:<span className="am-task-property">{name(r.accountId)}</span>)}<small>{isWaiting(r)?'Waiting on '+(r.waitingContactId?name(r.waitingContactId)+' · ':'')+(r.waitingOn||'property'):r.type}</small></div>
    <div className="am-task-progress">{progress.total>0?<><progress value={progress.done} max={progress.total}/><small>{progress.done}/{progress.total}</small></>:<span className={'am-task-status '+(r.status==='Completed'?'done':'')}>{r.status==='Open'?'Not started':r.status}</span>}</div>
    <div className="am-task-date"><CalendarDays size={15}/><span>{formatDate(actionDate(r))}{isWaiting(r)&&r.remindOn&&<small>Follow-up reminder</small>}</span></div>
    <div className="am-task-assignee"><span className="am-person-initials" aria-hidden="true">{r.assignee?initials(name(r.assignee)):'—'}</span><span>{name(r.assignee)}</span></div>
    <button className="am-task-comments" aria-label={'Comments for '+r.name} onClick={()=>open(r)}><MessageSquare size={17}/>{comments||''}</button>
  </article>}
  return <div className="am-work-queue"><div className="am-queue-metrics">{metrics.map(([label,Icon])=><button key={label} className={label.toLowerCase().replace(' ','-')} aria-pressed={metric===label} onClick={()=>{setMetric(metric===label?'':label);setLimit(60)}}><Icon size={19}/><span>{label}</span><b>{base.filter(r=>matches(r,label)).length}</b></button>)}</div>
    <div className="am-queue-toolbar"><div className="am-queue-scopes" aria-label="Task scope">{[['All',orders?'All work orders':'All tasks'],['Mine','My tasks'],['Requested','Requested by me']].map(([id,label])=><button key={id} aria-pressed={scope===id} onClick={()=>{setScope(id);setLimit(60)}}>{label}</button>)}</div><div className="am-actions">{onRequest&&<Button variant="outline" size="sm" onClick={onRequest}><Wrench size={16}/>Request Operations</Button>}{onNew&&<Button size="sm" onClick={onNew}><Plus size={16}/>{orders?'New work order':'New task'}</Button>}</div></div>
    <FilterBar className="am-queue-filters"><label className="am-queue-search"><Search size={17}/><input aria-label="Search tasks" placeholder="Search tasks or accounts" value={query} onChange={e=>{setQuery(e.target.value);setLimit(60)}}/></label><select aria-label="Assigned to" value={person} onChange={e=>setPerson(e.target.value)}><option value="">All assignees</option>{staff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Task type" value={type} onChange={e=>setType(e.target.value)}><option value="">All types</option>{[...new Set(rows.map(r=>String(r.type||'')))].filter(Boolean).sort().map(t=><option key={t}>{t}</option>)}</select>{metric&&<Button variant="ghost" size="sm" onClick={()=>setMetric('')}>Clear {metric}</Button>}<div className="am-queue-view"><button aria-label="List view" aria-pressed={view==='List'} onClick={()=>setView('List')}><List size={18}/></button><button aria-label="Agenda view" aria-pressed={view==='Agenda'} onClick={()=>setView('Agenda')}><CalendarDays size={18}/></button></div></FilterBar>
    {!result.length&&<p className="am-empty">No tasks match these filters.</p>}
    {view==='List'?groups.map(group=>{const tasks=shown.filter(r=>workGroup(r,date)===group);return tasks.length>0&&<details className="am-task-group" key={group} open={!['Completed','Cancelled'].includes(group)||!!metric}><summary><ChevronDown size={17}/>{group}<span>{result.filter(r=>workGroup(r,date)===group).length}</span></summary><div className="am-task-table"><div className="am-task-columns"><span>Task / account</span><span>Progress</span><span>Due date</span><span>Assigned to</span><span/></div>{tasks.map(task)}</div></details>}):<div className="am-queue-agenda">{[...new Set(shown.map(r=>actionDate(r)||'Unscheduled'))].sort().map(day=><section className="am-panel" key={day}><header><h3>{day==='Unscheduled'?day:formatDate(day)}</h3></header>{shown.filter(r=>(actionDate(r)||'Unscheduled')===day).map(task)}</section>)}</div>}
    {result.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+60)}>Show more ({result.length-limit})</Button>}
  </div>;
}
