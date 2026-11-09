'use client';
import {useId,useState} from 'react';
import {Check,Plus,Tags} from 'lucide-react';
import {suggestedBusinessTopics,tidyBusinessTopics} from '@/lib/accounts/business-topics';
import './business-topics.css';
export default function BusinessTopicsField({value,disabled,onChange}:{value:unknown;disabled:boolean;onChange:(v:string[])=>void}) {
 const selected=tidyBusinessTopics(value)||[],[draft,setDraft]=useState(''),[err,setErr]=useState(''),hint=useId();
 const options=Array.from(new Set([...suggestedBusinessTopics,...selected])).sort((a,b)=>a.localeCompare(b));
 function set(list:string[]){const next=tidyBusinessTopics(list);if(next===null){setErr('Use up to 15 business topics, each 1–52 characters long.');return false;}setErr('');onChange(next);return true;}
 function add(){if(!disabled&&draft.trim()&&set([...selected,draft]))setDraft('');}
 return <fieldset className="am-wide cp-topic-field" aria-describedby={hint} disabled={disabled}><legend><Tags size={17}/> Business Topics</legend><p id={hint}>Select the service priorities or meeting preferences this contact has shared. These tags can be compared in portfolio reports.</p><div className="cp-topic-picks">{options.map(t=>{const active=selected.includes(t);return <button type="button" key={t} aria-pressed={active} onClick={()=>set(active?selected.filter(x=>x!==t):[...selected,t])}>{active&&<Check size={13}/>} {t}</button>})}</div>{!disabled&&<div className="cp-topic-add"><input aria-label="New Business Topic" placeholder="New Topic" maxLength={52} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}/><button type="button" disabled={!draft.trim()} onClick={add}><Plus size={14}/> Add Topic</button></div>}{err&&<p role="alert">{err}</p>}</fieldset>;
}
