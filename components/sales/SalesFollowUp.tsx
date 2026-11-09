'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CalendarDays,Check,Clock3,Pencil,Plus} from 'lucide-react';
import {requestJson} from '@/lib/shared/client';
import {auditDay} from '@/lib/shared/audit-format';
import type {Row} from '@/lib/accounts/model';
import './sales-planning.css';

export default function SalesFollowUp({lead,editable,refresh,alwaysOpen=false}:{lead:Row;editable:boolean;refresh:()=>Promise<void>;alwaysOpen?:boolean}){
 const [editing,setEditing]=useState(alwaysOpen&&editable),[note,setNote]=useState(String(lead.nextAction||'')),[day,setDay]=useState(String(lead.dueDate||'')),[version,setVersion]=useState(lead.version),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[local,setLocal]=useState<{id:string;version:number;nextAction:string;dueDate:string}>();
 const field=useRef<HTMLInputElement>(null),baseline=useRef({id:lead.id,version:lead.version,note:String(lead.nextAction||''),day:String(lead.dueDate||'')});
 const [conflict,setConflict]=useState(false);
 const current=local&&local.id===lead.id&&local.version>lead.version?local:lead;
 const action=String(current.nextAction||''),due=String(current.dueDate||''),has=Boolean(action||due);
 useEffect(()=>{if(baseline.current.id!==lead.id||!editable){setEditing(alwaysOpen&&editable);setNote(action);setDay(due);setVersion(current.version);baseline.current={id:lead.id,version:current.version,note:action,day:due};setConflict(false);setError('');setMessage('');return;}
  if(baseline.current.version>=current.version)return;
  const prior=baseline.current,dirty=editing&&(note!==prior.note||day!==prior.day);
  if(dirty&&(action!==prior.note||due!==prior.day)){setConflict(true);return;}
  baseline.current={id:lead.id,version:current.version,note:action,day:due};setVersion(current.version);if(!dirty){setNote(action);setDay(due);}setConflict(false);
 },[lead.id,current.version,alwaysOpen,editable,action,due,note,day,editing]);
 useEffect(()=>{if(editing&&!alwaysOpen)field.current?.focus();},[editing,alwaysOpen]);
 function reset(){baseline.current={id:lead.id,version:current.version,note:action,day:due};setNote(action);setDay(due);setVersion(current.version);setConflict(false);setError('');}
 function begin(){reset();setNote(action);setDay(due);setVersion(current.version);setError('');setMessage('');setEditing(true);}
 async function persist(clear=false){if(busy||!editable||conflict)return;const nextAction=clear?'':note.trim(),dueDate=clear?'':day;if(!clear&&(!nextAction||!dueDate)){setError('Enter a next step and a follow-up date.');return;}setBusy(true);setError('');
  try{const result=await requestJson<{records:Row[]}>('/api/sales',{action:'followUp',id:lead.id,version,nextAction,dueDate});const saved=result.records?.find(r=>r.id===lead.id);setLocal({id:lead.id,version:saved?.version??version+1,nextAction:String(saved?.nextAction??nextAction),dueDate:String(saved?.dueDate??dueDate)});baseline.current={id:lead.id,version:saved?.version??version+1,note:nextAction,day:dueDate};setConflict(false);setEditing(alwaysOpen);setNote(nextAction);setDay(dueDate);setVersion(saved?.version??version+1);setMessage(clear?'Follow-up removed.':'Follow-up saved.');try{await refresh();}catch{setMessage('Saved. Refresh this page to load the latest activity.');}}
  catch(e){setError(e instanceof Error?e.message:'Unable to save this follow-up.');try{await refresh();}catch{/* Keep the entered follow-up visible on network failures. */}}finally{setBusy(false);}
 }
 if(!editable&&!has)return null;
 return <section className="sfollow" aria-label="Lead Follow-Up"><div className="sfollow-line"><span className="sfollow-icon"><CalendarDays size={18}/></span><div className="sfollow-text"><small>Next Follow-Up</small><strong>{action||(due?'Scheduled Follow-Up':'No Follow-Up Scheduled')}</strong></div>{due&&<time dateTime={due}><Clock3 size={13}/>{auditDay(due)}</time>}{editable&&!editing&&<button className="sfollow-edit" onClick={begin}>{has?<Pencil size={13}/>:<Plus size={13}/>} {has?'Edit':'Set Follow-Up'}</button>}</div>
 {editing&&<form onSubmit={(e:FormEvent)=>{e.preventDefault();void persist();}} className="sfollow-form"><label>Next Step<input ref={field} required maxLength={1000} value={note} placeholder="e.g., Call the property manager about the contract" onChange={e=>setNote(e.target.value)}/></label><label>Follow-Up Date<input type="date" required value={day} onChange={e=>setDay(e.target.value)}/></label><div className="sfollow-controls"><button type="submit" disabled={busy||conflict||!!(has&&note.trim()===action&&day===due)} className="scrm-btn primary"><Check size={14}/>{busy?'Saving…':'Save Follow-Up'}</button><button type="button" disabled={busy} className="scrm-btn" onClick={()=>{reset();if(!alwaysOpen)setEditing(false);}}>{alwaysOpen?'Reset':'Cancel'}</button>{has&&<button type="button" className="sfollow-clear" disabled={busy||conflict} onClick={()=>void persist(true)}>Remove Follow-Up</button>}</div>{conflict&&<p role="alert" className="scrm-error">This follow-up changed while you were editing. <button type="button" className="sfollow-clear" onClick={reset}>Load Current Follow-Up</button></p>}{error&&<p role="alert" className="scrm-error">{error}</p>}</form>}{message&&<p className="sfollow-status" role="status">{message}</p>}</section>;
}
