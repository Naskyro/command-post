'use client';
import {useState} from 'react';
import {Check,Pencil,X} from 'lucide-react';
import type {QuickField} from '@/lib/finance/quick-edit';
import type {Value} from '@/lib/finance/model';
export default function InlineCell({value,label,field,display,onSave}:{value:Value;label:string;field:QuickField;display?:string;onSave:(value:Value)=>Promise<void>}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(String(value??'')),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function commit(v:string){setBusy(true);setError('');try{await onSave(field.type==='number'?v===''?'':Number(v):v);setEditing(false);}catch(e){setError(e instanceof Error?e.message:'The change could not be saved.');}finally{setBusy(false);}}
 if(field.type==='select')return <div className="f-inline-cell"><select aria-label={label} disabled={busy} value={String(value||'')} onChange={e=>void commit(e.target.value)}><option value="" disabled>Choose…</option>{value&&!field.options?.includes(String(value))&&<option>{String(value)}</option>}{field.options?.map(o=><option key={o}>{o}</option>)}</select>{busy&&<small role="status">Saving…</small>}{error&&<small className="f-error" role="alert">{error}</small>}</div>;
 return <div className="f-inline-cell">{editing?<div className="f-cell-edit"><input autoFocus aria-label={label} type={field.type} step={field.type==='number'?'0.01':undefined} min={field.type==='number'?'0':undefined} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void commit(draft);}if(e.key==='Escape')setEditing(false);}}/><button aria-label={'Save '+label} disabled={busy} onClick={()=>void commit(draft)}><Check size={15}/></button><button aria-label="Cancel change" disabled={busy} onClick={()=>setEditing(false)}><X size={15}/></button></div>:<button className="f-cell-value" aria-label={'Edit '+label} onClick={()=>{setDraft(String(value??''));setEditing(true);}}>{display??String(value||'—')}<Pencil size={13}/></button>}{error&&<small className="f-error" role="alert">{error}</small>}</div>;
}
