'use client';
import {useCallback,useEffect,useId,useState} from 'react';
import {Check,ChevronDown,Settings2,X} from 'lucide-react';
import {requestJson} from '@/lib/shared/client';
import {type PayChoice,rateUnits,standardPayChoices} from '@/lib/hr/vacancy-choices';
import './vacancy-choices.css';
type CatalogOption={id:string;label:string;active:boolean;selectable?:boolean;version?:number;department?:string;unit?:string};
export type ChoiceData={choices:PayChoice[];version:number;canEdit:boolean;canManagePositions:boolean;canManageDepartments:boolean;positions:CatalogOption[];departments:CatalogOption[]};
export function useVacancyChoices(){
 const [catalog,set]=useState<ChoiceData>(),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const result=await requestJson<ChoiceData>('/api/hr/hiring/choices');set(result);setError('');return result;}catch(e){setError((e as Error).message);return undefined;}},[]);
 useEffect(()=>{void load();},[load]);
 return {catalog,load,error};
}
export function ChoiceManager({kind,items,version=0,departmentId,onChanged}:{kind:'pay'|'department'|'position';items:CatalogOption[];version?:number;departmentId?:string;onChanged:(id:string,action:string)=>Promise<void>}){
 const [open,setOpen]=useState(false),[id,select]=useState(''),[label,setLabel]=useState(''),[unit,setUnit]=useState('Terms'),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const item=items.find(o=>o.id===id),noun=kind==='pay'?'Pay Option':kind==='position'?'Position':'Department',plural=kind==='pay'?'Pay Options':kind==='position'?'Positions':'Departments',panelId=useId();
 function edit(id:string){const row=items.find(o=>o.id===id);select(id);setLabel(row?.label||'');setReason('');setError('');setNotice('');}
 async function commit(action:string){if(busy)return;setBusy(true);setError('');setNotice('');
  try{const value=label.trim();if((action==='add'||action==='rename')&&!value)throw new Error('Enter a name.');if(kind==='department'&&item&&!reason.trim())throw new Error('Enter a reason for this department change.');
  const versionFor=kind==='pay'?version:item?.version||0;
  let changedId='';
  if(kind==='department'){
   const recordId=item?.id||crypto.randomUUID();
   await requestJson('/api/people',{action:'saveDepartment',id:recordId,version:versionFor,fields:action==='add'||action==='rename'?{name:value}:{status:action==='retire'?'Retired':'Active'},reason:reason.trim()||'Created from vacancy editor'});
   changedId=recordId;
  }else{const result=await requestJson<{id:string}>('/api/hr/hiring/choices',{kind,action,id,version:versionFor,label:value,unit,departmentId});changedId=result.id;}
  await onChanged(changedId,action);edit('');setNotice(noun+(action==='add'?' Added':action==='rename'?' Renamed':action==='retire'?' Retired':' Restored'));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="vac-config"><button type="button" className="hja-text-action" aria-expanded={open} aria-controls={panelId} onClick={()=>{setOpen(!open);setError('');}}><Settings2 size={15}/>Manage {plural}</button>{open&&<section id={panelId} aria-label={'Manage '+plural}><div className="vac-config-head"><strong>Manage {plural}</strong><button type="button" aria-label={'Close '+plural+' Settings'} onClick={()=>setOpen(false)}><X size={16}/></button></div><label>Edit an Option<select value={id} disabled={busy} onChange={e=>edit(e.target.value)}><option value="">Add New {noun}</option>{[...items].sort((a,b)=>a.label.localeCompare(b.label)).map(o=><option key={o.id} value={o.id}>{o.label}{o.department?' · '+o.department:''}{!o.active?' (Retired)':''}</option>)}</select></label>
 <label>{noun} Name<input autoComplete="off" maxLength={kind==='pay'?75:100} value={label} disabled={busy} onChange={e=>setLabel(e.target.value)}/></label>
 {kind==='pay'&&!item&&<label>Offered Rate Unit<select value={unit} onChange={e=>setUnit(e.target.value)}>{[...rateUnits].sort().map(u=><option value={u} key={u}>{u==='Terms'?'Defined in Pay Terms':u}</option>)}</select></label>}
 {kind==='department'&&item&&<label>Reason for Change<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>}
 {kind==='position'&&!item&&!departmentId&&<small>Select a department for this position first.</small>}
 <div className="vac-config-actions"><button type="button" disabled={busy||!label.trim()||!!item&&label.trim()===item.label||kind==='position'&&!item&&!departmentId} onClick={()=>void commit(item?'rename':'add')}>{item?'Save Name':'Add '+noun}</button>{item&&<button disabled={busy} type="button" onClick={()=>void commit(item.active?'retire':'restore')}>{item.active?'Retire':'Restore'} {noun}</button>}</div>
 {error&&<p className="hr2-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>}</div>;
}
export function PayPicker({label,selected,options,onChange,manager}:{label:string;selected:PayChoice[];options:PayChoice[];onChange:(rows:PayChoice[])=>void;manager?:React.ReactNode}){
 const [open,setOpen]=useState(false),panel=useId(),choices=[...options.filter(o=>o.active||selected.some(s=>s.id===o.id)),...selected.filter(s=>!options.some(o=>o.id===s.id))].sort((a,b)=>a.label.localeCompare(b.label));
 function toggle(row:PayChoice){if(selected.some(c=>c.id===row.id))onChange(selected.filter(c=>c.id!==row.id));else if(row.id==='pending')onChange([row]);else onChange([...selected.filter(c=>c.id!=='pending'),row]);}
 return <section className="vac-pay" aria-label={label}><strong>{label}</strong><button className="vac-pay-toggle" type="button" aria-label={label} aria-expanded={open} aria-controls={panel} onClick={()=>setOpen(!open)}>{selected.map(c=>c.label).join(' · ')||'Select Pay Options…'} <ChevronDown size={16}/></button>
 {open&&<div className="vac-pay-menu" id={panel}><small>Select all that apply. The first choice sets the offered amount’s unit.</small><div className="vac-pay-grid">{choices.map(c=>{const index=selected.findIndex(s=>s.id===c.id);return <label key={c.id} className={index>=0?'checked':''}><input type="checkbox" checked={index>=0} onChange={()=>toggle(c)}/><span>{selected[index]?.label||c.label}{index===0&&selected.length>1?' (Primary)':''}{!c.active?' (Retired)':''}</span></label>;})}</div><button type="button" onClick={()=>setOpen(false)}><Check size={14}/>Done</button></div>}
 {manager}</section>;
}
export function DescriptionPaySelector({value,onChange}:{value:string;onChange:(s:string)=>void}){
 const {catalog,load,error}=useVacancyChoices(),options=catalog?.choices||standardPayChoices;
 const selected=value.split(' · ').map(v=>v.trim()).filter(Boolean).map(label=>options.find(c=>c.label.toLowerCase()===label.toLowerCase())||{id:'legacy:'+label,label,unit:'Terms',active:false});
 return <div><PayPicker label="Pay Basis" selected={selected} options={options} onChange={rows=>onChange(rows.map(c=>c.label).join(' · '))} manager={catalog?.canEdit&&<ChoiceManager kind="pay" items={options} version={catalog.version} onChanged={async()=>{await load();}}/>}/>{error&&<small role="alert">Could not load company pay options. <button type="button" onClick={()=>void load()}>Retry</button></small>}</div>;
}
