'use client';
import {useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,X} from 'lucide-react';
import {auditDay} from '@/lib/shared/audit-format';
import type {RegisterRecord} from '@/lib/ccr/register-model';
export default function RegisterCalendar({rows,today,chosen,onPick}:{rows:RegisterRecord[];today:string;chosen:string;onPick:(iso:string)=>void}){
 const [anchor,setAnchor]=useState(today.slice(0,7)),[year,month]=anchor.split('-').map(Number);
 const first=new Date(Date.UTC(year,month-1,1,12)),count=new Date(Date.UTC(year,month,0,12)).getUTCDate(),offset=first.getUTCDay(),events=new Map<string,number>();
 rows.forEach(r=>{if(r.dueOn&&r.status!=='Closed')events.set(r.dueOn,1+(events.get(r.dueOn)||0));});
 function move(n:number){setAnchor(new Date(Date.UTC(year,month-1+n,1,12)).toISOString().slice(0,7));onPick('');}
 return <section className="ccrr-month" aria-label="Obligations Calendar"><header><h2><CalendarDays size={17}/>{new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(first)}</h2><div><button className="ccrr-iconbutton" title="Previous Month" aria-label="Previous Month" onClick={()=>move(-1)}><ChevronLeft size={16}/></button><button className="ccrr-button" onClick={()=>{setAnchor(today.slice(0,7));onPick('');}}>Today</button><button className="ccrr-iconbutton" title="Next Month" aria-label="Next Month" onClick={()=>move(1)}><ChevronRight size={16}/></button></div></header><div className="ccrr-dates">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(v=><span key={v}>{v}</span>)}{Array.from({length:offset},(_,i)=><i key={'offset'+i}/>)}{Array.from({length:count},(_,i)=>{const iso=anchor+'-'+String(i+1).padStart(2,'0'),n=events.get(iso)||0;return <button key={iso} type="button" data-due={n||undefined} data-today={iso===today||undefined} disabled={!n} aria-pressed={iso===chosen} aria-label={auditDay(iso)+', '+n+(n===1?' open obligation':' open obligations')} onClick={()=>onPick(iso===chosen?'':iso)}><span>{i+1}</span>{n>0&&<b>{n}</b>}</button>;})}</div>{chosen&&<button className="ccrr-datereset" onClick={()=>onPick('')}><X size={13}/>Clear {auditDay(chosen)} Filter</button>}</section>;
}
