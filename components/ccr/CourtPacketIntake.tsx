'use client';
import {useRef,useState} from 'react';
import {Archive,CheckCircle2,FileStack,FolderInput,LoaderCircle} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {type Matter} from '@/lib/ccr/docket-model';
import {openCourtPackage,type CourtPackage} from '@/lib/ccr/court-package';
import {fileReviewedCase,newFiling,checkCourtReceipts,receiptTotals,type FilingState} from '@/lib/ccr/court-intake-client';
type Entry=Pick<FilingState,'phase'|'message'|'receipt'>;
const caseKey=(c:{courtName:string;number:string})=>c.courtName+' / '+c.number;
export default function CourtPacketIntake({rows,onImported}:{rows:Matter[];onImported:()=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[pack,setPack]=useState<CourtPackage>(),[error,setError]=useState(''),[results,setResults]=useState<Record<string,Entry>>({}),[current,setCurrent]=useState(''),[confirmed,setConfirmed]=useState(false);
 const input=useRef<HTMLInputElement>(null),running=useRef(false),pending=useRef(new Map<string,FilingState>()),notify=useRef(false);
 function reset(){pending.current.clear();setPack(undefined);setResults({});setConfirmed(false);setError('');}
 function close(){if(running.current)return;setOpen(false);if(notify.current){notify.current=false;onImported();}
 // Keep prepared multipart data and stage handles in memory while this page is open. Never cancel a filing with an unknown outcome.
 if(!pack||!pending.current.size||[...pending.current.values()].every(s=>s.phase==='done'||s.phase==='blocked'))reset();}
 async function choose(file?:File){if(!file||running.current)return;try{if(file.size>180*1024*1024)throw Error('Choose a reviewed ZIP under 180 MB.');const next=openCourtPackage(new Uint8Array(await file.arrayBuffer()));reset();setPack(next);}catch(e){setError((e as Error).message);}}
 async function submit(){if(!pack||!confirmed||running.current)return;running.current=true;setBusy(true);try{
 for(const c of pack.cases){const key=caseKey(c),state=pending.current.get(key)||newFiling();pending.current.set(key,state);if(state.phase==='done'||state.phase==='blocked')continue;
 await fileReviewedCase(c,pack.data,state,label=>setCurrent(c.number+' · '+label));setResults(prev=>({...prev,[key]:{phase:state.phase,message:state.message,receipt:state.receipt}}));if(pending.current.get(key)?.phase==='done')notify.current=true;}
 }catch(e){setError((e as Error).message);}finally{running.current=false;setBusy(false);setCurrent('');}}
 async function checkReceipts(){if(!pack||running.current)return;running.current=true;setBusy(true);setError('');setCurrent('Checking Filing Receipts');
 try{await checkCourtReceipts(pack.cases,c=>{const key=caseKey(c),state=pending.current.get(key)||newFiling();pending.current.set(key,state);return state;},(c,state,count)=>{setResults(prev=>({...prev,[caseKey(c)]:{phase:state.phase,message:state.message,receipt:state.receipt}}));setCurrent('Checked '+count+' of '+pack.cases.length+' Receipts');});}
 finally{running.current=false;setBusy(false);setCurrent('');}}
 const tally=pack?receiptTotals(pack.cases,c=>results[caseKey(c)]?.receipt):undefined;
 const entries=Object.values(results),done=!!pack&&entries.length===pack.cases.length&&entries.every(r=>r.phase==='done'),canAct=!!pack&&pack.cases.some(c=>!['blocked','done'].includes(results[caseKey(c)]?.phase)),checks=entries.some(r=>r.phase==='check'||r.phase==='review'),ready=entries.some(r=>r.phase==='ready');
 return <><button className="cd-secondary" type="button" onClick={()=>setOpen(true)}><FolderInput size={15}/>Import Court Records</button><Dialog open={open} onOpenChange={v=>{if(!v)close();}}><DialogContent className="ccr-jp-intake" aria-describedby="ccr-jp-help" showCloseButton={!busy}>
 <header><span><Archive size={16}/>Court Docket</span><DialogTitle>Import Reviewed Court Records</DialogTitle><DialogDescription id="ccr-jp-help">Import a reviewed case index and its original documents. Each case stays editable in the docket.</DialogDescription></header>
 <input type="file" hidden accept=".zip" aria-label="Reviewed Court ZIP" ref={input} onChange={e=>{const f=e.target.files?.[0];e.target.value='';void choose(f);}}/>
 {!pack?<><button className="ccr-jp-choose" type="button" onClick={()=>input.current?.click()}><FileStack size={23}/><b>Choose Court Packet</b><span>Reviewed ZIP with case-index.json and originals</span></button><details><summary>Packet Format</summary><p>Use format <code>pte.court.v1</code>. Each case lists its court, cause number, exact PTE party designation, verification basis, status, and exhibits. Each exhibit includes a document type, filename, relative path in <code>documents/</code>, and SHA-256 fingerprint. A dated court ruling or settlement is required to report an outcome.</p><p>For an individual PDF, close this dialog and choose <strong>Upload Document</strong>.</p></details></>:<>
 <b>{pack.cases.length} {pack.cases.length===1?'Case':'Cases'} · {pack.cases.reduce((v,r)=>v+r.documents.length,0)} Source Documents</b>
 <div><button className="cd-secondary" type="button" disabled={busy} onClick={()=>void checkReceipts()}><CheckCircle2 size={15}/>Check Filing Receipts</button><small> Read only · No cases or originals are submitted.</small></div>
 {entries.length>0&&tally&&<div role="status"><strong>{tally.confirmedCases} Cases Confirmed · {tally.outstandingCases} Outstanding</strong><p>{tally.matched} Source Originals Confirmed · {tally.unmatched} Unmatched · {tally.unverified} Unverified</p></div>}
 <ul className="ccr-jp-list">{pack.cases.map(c=>{const k=c.courtName+' / '+c.number,r=results[k];return <li key={k}><b>{c.number}</b><span>{c.title}</span><small>{c.status}{c.newOutcome?' · '+c.newOutcome.result:''} · {c.documents.length} documents{rows.some(m=>m.number===c.number)?' · Existing cause number':''}</small>{r&&<small data-ok={r.phase==='done'} role={r.phase==='done'?'status':'alert'}>{r.message}</small>}</li>;})}</ul>
 {!done&&canAct&&<label className="ccr-jp-confirm"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I verified the company’s identity and each recorded outcome against the source documents.</span></label>}
 {current&&<span role="status"><LoaderCircle size={15}/> {current}…</span>}{done&&<b role="status"><CheckCircle2 size={16}/> All Reviewed Cases Filed</b>}
 <footer><button className="cd-secondary" disabled={busy} onClick={close}>{done?'View Court Docket':'Close'}</button>{!done&&entries.some(r=>r.phase==='blocked'||r.phase==='review')&&<button className="cd-secondary" type="button" disabled={busy} onClick={()=>input.current?.click()}>Choose a Corrected Packet</button>}{!done&&canAct&&<button className="cd-primary" disabled={!confirmed||busy} onClick={()=>void submit()}>{busy?'Working…':checks&&ready?'Check and Retry Incomplete Filings':checks?'Check Filing Status':ready?'Retry Incomplete Filings':'Import Verified Cases'}</button>}</footer>
 </>}{error&&<p role="alert">{error}</p>}
 </DialogContent></Dialog></>;
}
