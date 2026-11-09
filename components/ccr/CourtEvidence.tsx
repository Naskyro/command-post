'use client';
import {useState} from 'react';
import {Download,FileText,Upload,X} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {auditDay,auditStamp} from '@/lib/shared/audit-format';
import {documentTypeLabel} from '@/lib/ccr/document-types';
import {cancelCourtStage,stageCourtOriginal,courtInlineFileLimit} from '@/lib/ccr/court-stage-client';
import {requestJson,timedFetch} from '@/lib/shared/client';
import {courtResults,settlementStages,type CourtOutcome,type Matter,type PoliceReference} from '@/lib/ccr/docket-model';
import CcrDocumentUpload from './CcrDocumentUpload';

export function CourtFileList({matter,canEdit,onUpload}:{matter:Matter;canEdit:boolean;onUpload?:()=>void}){
 const docs=matter.files||[];
 return <section className="cd-section"><div className="cd-section-head"><h3><FileText size={17}/>Court Documents <span className="cd-count">{docs.length}</span></h3>{canEdit&&onUpload&&<button type="button" className="cd-text" onClick={onUpload}><Upload size={15}/>Upload Document</button>}</div>{docs.length?<ul className="cd-doc-list">{docs.slice().reverse().map(d=><li key={d.id}><FileText size={16}/><div><b>{documentTypeLabel(d)}</b><span>{d.name}</span><small>{auditStamp(d.at)} · {d.by}</small></div><a href={'/api/ccr/docket/file?'+new URLSearchParams({id:matter.id,file:d.id})} download={d.name} title={'Download '+d.name} aria-label={'Download '+d.name}><Download size={17}/></a></li>)}</ul>:<p className="cd-inline-empty">No documents attached to this matter.</p>}</section>;
}
export function CourtFileDialog({rows,initialId,onSaved,onNew,onClose}:{rows:Matter[];initialId?:string;onSaved:(m:Matter)=>void;onNew:()=>void;onClose:()=>void}){
 const [target,setTarget]=useState(initialId||''),[busy,setBusy]=useState(false);const picked=rows.find(r=>r.id===target);
 async function upload(file:File,meta:{documentType:string;otherDocumentType?:string}){
  if(!picked)throw new Error('Select the court record first.');setBusy(true);
  try{if(file.size>courtInlineFileLimit){const id=await stageCourtOriginal(file);try{onSaved(await requestJson<Matter>('/api/ccr/docket/stage',{action:'attach',id,matterId:picked.id,version:picked.version,...meta},120000));}catch(e){await cancelCourtStage(id);throw e;}return;}const fd=new FormData();fd.set('id',picked.id);fd.set('version',String(picked.version));fd.set('documentType',meta.documentType);if(meta.otherDocumentType)fd.set('otherDocumentType',meta.otherDocumentType);fd.set('file',file);const resp=await timedFetch('/api/ccr/docket/file',{method:'POST',body:fd},90000);const data=await resp.json() as Matter&{error?:string};if(!resp.ok)throw new Error(data?.error||'The document could not be uploaded.');onSaved(data);}
  finally{setBusy(false);}
 }
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className="ccr-docket-dialog" aria-describedby={undefined} showCloseButton={false}><header className="cd-form-head"><div><span className="cd-kicker">Court Docket</span><DialogTitle>Upload Court Document</DialogTitle></div><button type="button" disabled={busy} onClick={onClose} className="cd-icon-btn" title="Close" aria-label="Close Court Document Upload"><X size={17}/></button></header><div className="cd-form-scroll cd-upload-body">{rows.length?<label className="cd-target">Court Record<select value={target} disabled={busy} onChange={e=>setTarget(e.target.value)}><option value="">Choose a Court Record</option>{[...rows].sort((a,b)=>a.title.localeCompare(b.title)).map(m=><option key={m.id} value={m.id}>{m.title}{m.number?' · '+m.number:''}</option>)}</select></label>:<p>No court records yet. Create a matter to keep its documents, outcomes, and deadlines together.</p>}{picked&&<CcrDocumentUpload key={picked.id} section="hearings" initiallyOpen onUpload={upload} onClose={onClose}/>}<button type="button" className="cd-text" disabled={busy} onClick={onNew}>Create a New Court Record</button></div></DialogContent></Dialog>;
}
export type OutcomeDraft={result:string;on:string;stage:string;prevailingParty:string;otherParty:string;amount:string};
export const emptyOutcome=():OutcomeDraft=>({result:'',on:'',stage:'',prevailingParty:'',otherParty:'',amount:''});
export function outcomePayload(d:OutcomeDraft){if(!d.result)return undefined;return {result:d.result,on:d.on,...(d.result==='Settled'?{stage:d.stage,...(d.amount!==''?{settlementCents:Math.round(Number(d.amount)*100)}:{})}:{prevailingParty:d.prevailingParty,otherParty:d.otherParty})};}
export function OutcomeFields({value:d,required,onChange}:{value:OutcomeDraft;required:boolean;onChange:(d:OutcomeDraft)=>void}){
 const set=(k:keyof OutcomeDraft,v:string)=>onChange({...d,[k]:v});
 return <section className="cd-form-section"><h3>Disposition</h3><div className="cd-fields"><label>Outcome<select required={required} value={d.result} onChange={e=>onChange({...emptyOutcome(),result:e.target.value,on:d.on})}><option value="">{required?'Select Outcome':'No New Disposition'}</option>{[...courtResults].sort().map(r=><option key={r}>{r}</option>)}</select></label>{d.result&&<><label>Outcome Date<input type="date" required value={d.on} onChange={e=>set('on',e.target.value)}/></label>{d.result==='Settled'?<><label>Settlement Stage<select required value={d.stage} onChange={e=>set('stage',e.target.value)}><option value="">Select Stage</option>{settlementStages.map(s=><option key={s}>{s}</option>)}</select></label><label>Settlement Amount (If Known)<input type="number" min="0" step=".01" max="999999999.99" value={d.amount} onChange={e=>set('amount',e.target.value)}/></label></>:d.result==='PTE Won'||d.result==='PTE Lost'?<label>{d.result==='PTE Won'?'Losing Party':'Winning Party'} (If Named)<input maxLength={140} value={d.otherParty} onChange={e=>set('otherParty',e.target.value)}/></label>:null}</>}</div></section>;
}
export function OutcomeSummary({o}:{o:CourtOutcome}){
 const terms=[o.result,auditDay(o.on),o.stage,o.otherParty?((o.result==='PTE Won'?'Losing Party: ':o.result==='PTE Lost'?'Winning Party: ':'Party: ')+o.otherParty):'',o.settlementCents!==undefined?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(o.settlementCents/100):''].filter(Boolean);
 return <div className="cd-outcome">{terms.map((term,i)=><span key={i}>{term}</span>)}</div>;
}
export function PoliceFields({refs,onChange}:{refs:PoliceReference[];onChange:(r:PoliceReference[])=>void}){
 const spec=[['agency','Agency',140],['number','Police Report Number',110],['officer','Officer Name',140],['badge','Badge Number',60]] as const;
 return <details className="cd-form-section"><summary>Law Enforcement References ({refs.length})</summary>{refs.map((r,i)=><fieldset key={r.id}><legend>Reference {i+1}</legend><div className="cd-fields">{spec.map(([key,label,max])=><label key={key}>{label}<input maxLength={max} value={r[key]} onChange={e=>onChange(refs.map(x=>x.id===r.id?{...x,[key]:e.target.value}:x))}/></label>)}</div><button className="cd-text" type="button" onClick={()=>onChange(refs.filter(x=>x.id!==r.id))}>Remove Reference</button></fieldset>)}<button type="button" className="cd-text" onClick={()=>onChange([...refs,{id:crypto.randomUUID(),agency:'',number:'',officer:'',badge:''}])}>Add Police Report or Officer</button></details>;
}
