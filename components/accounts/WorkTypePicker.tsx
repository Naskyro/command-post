'use client';
import {useState} from 'react';
import {Plus,X,Settings2} from 'lucide-react';
import {workTypeOptions,workTypeSettingsId} from '@/lib/accounts/work-options';
import {requestJson} from '@/lib/shared/client';
import type {Row} from '@/lib/accounts/model';
export function WorkTypePicker({all,value,disabled,onChange,onRefresh}: {all:Row[];value:string;disabled:boolean;onChange:(value:string)=>void;onRefresh:()=>Promise<void>}) {
 const [open,setOpen]=useState(false),[newType,setNewType]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const values=workTypeOptions(all),config=all.find(r=>r.id===workTypeSettingsId);
 async function save(items:string[],added=''){setBusy(true);setError('');try{await requestJson('/api/accounts',{action:'workTypes',version:config?.version||0,options:items});await onRefresh();if(added){onChange(added);setNewType('');}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="am-work-type"><label><span>Work type *</span><select aria-label="Work type" required value={value} disabled={disabled||busy} onChange={e=>onChange(e.target.value)}><option value="">Choose work type</option>{value&&!values.includes(value)&&<option value={value}>{value} (retired)</option>}{values.map(v=><option key={v} value={v}>{v}</option>)}</select></label>{!disabled&&<button type="button" className="am-text-button" onClick={()=>setOpen(!open)} aria-expanded={open}><Settings2 size={14}/>Manage work types</button>}{open&&!disabled&&<div className="am-type-manager"><p>Shared with Operations. Removing a type keeps existing work orders intact.</p><div className="am-type-options">{values.map(v=><span key={v}>{v}<button type="button" disabled={busy} aria-label={'Remove '+v+' from work types'} onClick={()=>void save(values.filter(x=>x!==v))}><X size={13}/></button></span>)}</div><div className="am-type-add"><input aria-label="New work type" value={newType} maxLength={80} placeholder="New work type" disabled={busy} onChange={e=>setNewType(e.target.value)}/><button type="button" disabled={busy||!newType.trim()} onClick={()=>void save([...values,newType.trim()],newType.trim())}><Plus size={15}/>Add</button></div>{error&&<p role="alert" className="am-error">{error}</p>}</div>}</div>;
}
