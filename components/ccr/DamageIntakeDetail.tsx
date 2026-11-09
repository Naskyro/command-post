'use client';
import {CaseSourceInventory} from './DamageAttachmentInventory';
import AccidentReportsPanel from './AccidentReportsPanel';
import ClaimOperationalFields,{operationalPatch,ClaimOperationalSummary,ClaimUpdateChanges} from './ClaimOperationalFields';
import {CasePhotoPreviews} from './DamagePreviews';
import DamagePhotoViewer from './DamagePhotoViewer';
import DamageMailHistory from './DamageMailHistory';
import {SourceFileShelf} from '@/components/shared/SourceFileShelf';
import {useRef,useState} from 'react';
import {ArrowUpRight,ClipboardList,FileText,History,Mail,MessageSquareText,Paperclip,PenLine} from 'lucide-react';
import {auditDay,auditStamp} from '@/lib/shared/audit-format';
import {delegatedUrl,requestJson} from '@/lib/shared/client';
import {businessToday} from '@/lib/year-history/model';
import {documentTypeLabel} from '@/lib/ccr/document-types';
import {damageCaseFactFields,damageIntakeStatuses,type DamageCaseFact,type DamageIntake} from '@/lib/ccr/damage-intake-model';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';

type Mode='details'|'update';
const currentFacts=(r:DamageIntake)=>Object.fromEntries(damageCaseFactFields.map(k=>[k,r[k]||''])) as Record<DamageCaseFact,string>;

export default function DamageIntakeDetail({record:r,canEdit,onSaved,onUpload}:{record:DamageIntake;canEdit:boolean;onSaved:()=>Promise<void>;onUpload:()=>void}){
 const [details,setDetails]=useState<Record<string,unknown>>(r),[facts,setFacts]=useState(currentFacts(r)),[mode,setMode]=useState<Mode|null>(null);
 const [note,setNote]=useState(''),[status,setStatus]=useState(r.status),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const saving=useRef(false);
 const factPatch=Object.fromEntries(damageCaseFactFields.filter(k=>facts[k].trim()!==(r[k]||'')).map(k=>[k,facts[k].trim()]));
 const detailPatch=operationalPatch(r,details,true),changed=!!Object.keys(factPatch).length||!!Object.keys(detailPatch).length;
 function begin(next:Mode){setStatus(r.status);setDetails(r);setFacts(currentFacts(r));setNote('');setErr('');setMode(next);}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!canEdit||!note.trim()||saving.current||mode==='details'&&!changed)return;
  saving.current=true;setBusy(true);setErr('');
  try{
   await requestJson('/api/ccr/damage-intake',{action:'update',id:r.id,version:r.version,status:mode==='details'?r.status:status,note:note.trim(),...(mode==='details'?{caseFacts:factPatch,details:detailPatch}:{})});
   await onSaved();setMode(null);setNote('');
  }catch(e){setErr((e as Error).message);}finally{saving.current=false;setBusy(false);}
 }
 const original=r.originalSource;
 return <div className="ccrc-body">
  {canEdit&&<section className="ccrc-block ccrc-intake-actions" aria-label="Claim Actions"><div className="ccrc-actions">
   <button type="button" className="ccrc-btn primary" onClick={()=>begin('details')}><PenLine size={15}/>Edit Claim Details</button>
   <button type="button" className="ccrc-btn" onClick={()=>begin('update')}><MessageSquareText size={15}/>Add Update</button>
  </div><p className="ccrc-muted">Correct the current facts or add a progress note. Every saved change stays in the case history.</p></section>}
  <section className="ccrc-block"><h3><ClipboardList size={17}/>Current Claim Details</h3><dl className="ccrc-facts">
   <div><dt>Reported On</dt><dd>{r.reportedOn?auditDay(r.reportedOn):'Not Yet Recorded'}</dd></div>
   <div><dt>Vehicle</dt><dd>{r.vehicle||'Not Yet Recorded'}</dd></div>
   <div><dt>Claim Reference</dt><dd>{r.claimReference||'Not Yet Recorded'}</dd></div>
   <div><dt>Property Reported in Source</dt><dd>{r.propertyName||'Not Identified in Source'}</dd></div>
  </dl><div className="ccrc-copy"><h4>Claim Summary</h4><p>{r.summary}</p></div>
  {r.statusBasis&&<div className="ccrc-copy"><h4>Recorded Status Basis</h4><p>{r.statusBasis}</p></div>}
  {r.status==='Outcome Unverified'&&<small>Available records do not establish a final outcome.</small>}
  {original&&<details className="ccrc-original-report"><summary>Original Filed Report</summary><p className="ccrc-muted">Preserved from version {original.version}, filed {auditStamp(original.filedAt)} by {original.filedBy}.</p><dl className="ccrc-facts">
   <div><dt>Original Title</dt><dd>{original.title}</dd></div>
   <div><dt>Original Reported Date</dt><dd>{original.reportedOn?auditDay(original.reportedOn):'Not Identified in Source'}</dd></div>
   <div><dt>Original Vehicle</dt><dd>{original.vehicle||'Not Identified in Source'}</dd></div>
   <div><dt>Original Claim Reference</dt><dd>{original.claimReference||'Not Identified in Source'}</dd></div>
   <div><dt>Original Recorded Status</dt><dd>{original.status}</dd></div>
  </dl><div className="ccrc-copy"><h4>Original Summary</h4><p>{original.summary}</p></div>{original.statusBasis&&<div className="ccrc-copy"><h4>Original Status Basis</h4><p>{original.statusBasis}</p></div>}</details>}
  </section>
  <section className="ccrc-block"><h3><ClipboardList size={17}/>Linked Case Details</h3><ClaimOperationalSummary value={r} includeAccount more/>{!r.driverId&&!r.contactId&&!r.linkedAccountName&&<p className="ccrc-muted">Use Edit Claim Details to link a driver, account, or property contact as the facts become available.</p>}</section>
  {r.driverId&&(r.accidentInvolved==='Yes'||r.driverInjury==='Yes')&&<AccidentReportsPanel claimKey={'intake:'+r.id} driverId={r.driverId} accidentInvolved={r.accidentInvolved} accidentOn={r.accidentOn} driverInjury={r.driverInjury} ownerInjury={r.ownerInjury}/>}
  {!r.evidenceRestricted&&<DamageMailHistory id={r.id}/>}
  {!r.evidenceRestricted&&r.references.length>0&&<section className="ccrc-block"><h3><Mail size={17}/>Source Review Notes</h3><ol className="ccrc-events">{r.references.map(x=><li key={x.messageId}><b>{x.subject}</b><p>{x.note}</p><div>{auditDay(x.on)} · Support Mailbox · <a target="_blank" rel="noreferrer" href={'https://mail.google.com/mail/u/?authuser=support%40gtowingtransport.com#all/'+encodeURIComponent(x.threadId)}>Open Original Thread <ArrowUpRight size={13}/></a></div></li>)}</ol></section>}
  <section className="ccrc-block"><h3><Paperclip size={17}/>Claim Documents</h3>{canEdit&&!r.evidenceRestricted&&<button type="button" className="ccrc-btn" onClick={onUpload}><Paperclip size={14}/>Upload Document</button>}{!r.evidenceRestricted&&<><CaseSourceInventory id={r.id} version={r.version}/><CasePhotoPreviews id={r.id} version={r.version}/></>}{!r.evidenceRestricted&&<DamagePhotoViewer key={r.id} id={r.id} files={r.files}/>}<ul className="ccrc-docs">{r.files.map(f=><li key={f.id}><a target="_blank" rel="noreferrer" href={delegatedUrl('/api/ccr/damage-intake/documents?id='+encodeURIComponent(r.id)+'&file='+encodeURIComponent(f.id))}><FileText size={15}/>{f.name}<ArrowUpRight size={13}/></a><small>{documentTypeLabel(f)} · {auditStamp(f.at)} · {f.by}</small></li>)}</ul>{!r.files.length&&<p className="ccrc-muted">{r.evidenceRestricted?'Original documents and source correspondence are restricted.':'No original files attached. Source correspondence is listed above.'}</p>}</section>
  <SourceFileShelf scope="damage" targetId={r.id}/>
  <section className="ccrc-block"><h3><History size={17}/>Case History</h3><ol className="ccrc-events">{[...r.updates].reverse().map((x,i)=><li key={i}><b>{x.status}</b><p>{x.note}</p><ClaimUpdateChanges changes={x.changes}/><div>{auditStamp(x.at)} · {x.by}</div></li>)}<li><b>{r.sourceKind==='Google Drive'?'Drive Source Record Filed':'Support Correspondence Filed'}</b><div>{auditStamp(r.createdAt)} · {r.createdBy}</div></li></ol></section>
  <Dialog open={mode!==null} onOpenChange={v=>{if(!busy&&!v)setMode(null);}}><DialogContent className="ccrc-dialog claim-details-dialog" aria-describedby={undefined}><DialogHeader><DialogTitle>{mode==='details'?'Edit Claim Details':'Add Update'}</DialogTitle></DialogHeader>
   <form onSubmit={submit}>
    {mode==='details'?<>
     <p>Update the current claim facts. The original filed report, correspondence and documents stay preserved.</p>
     <label>Claim Title<input autoFocus required maxLength={240} value={facts.title} disabled={busy} onChange={e=>setFacts(f=>({...f,title:e.target.value}))}/></label>
     <div className="ccrc-factform"><label>Vehicle<input maxLength={200} value={facts.vehicle} disabled={busy} onChange={e=>setFacts(f=>({...f,vehicle:e.target.value}))}/></label><label>Claim Reference<input maxLength={160} value={facts.claimReference} disabled={busy} onChange={e=>setFacts(f=>({...f,claimReference:e.target.value}))}/></label><label>Reported On<input type="date" max={businessToday()} value={facts.reportedOn} disabled={busy} onChange={e=>setFacts(f=>({...f,reportedOn:e.target.value}))}/></label></div>
     <label>Claim Summary<textarea required rows={5} maxLength={5000} value={facts.summary} disabled={busy} onChange={e=>setFacts(f=>({...f,summary:e.target.value}))}/></label>
     <ClaimOperationalFields value={details} onChange={(key,value)=>setDetails(d=>({...d,[key]:value}))} disabled={busy} includeAccount more/>
     <label>Reason for Changes<textarea required maxLength={4000} rows={3} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="Explain what you corrected and how you confirmed it."/></label>
     <small>The history records each field’s previous and new value, your reason, your name and the time. Case status remains {r.status}.</small>
    </>:<>
     <p>{r.title}</p>
     <label>Update<textarea autoFocus required maxLength={4000} rows={5} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="Record progress, contact attempts, new information or the next step."/></label>
     <label>Case Status<select value={status} disabled={busy} onChange={e=>setStatus(e.target.value as typeof status)}>{damageIntakeStatuses.map(x=><option key={x}>{x}</option>)}</select></label>
     <small>Keep the current status to add a note. If you change it, explain the basis in your update. Earlier updates stay in the case history.</small>
    </>}
    {err&&<p role="alert" className="ccrc-warning">{err}</p>}
    <footer><button type="button" className="ccrc-btn" disabled={busy} onClick={()=>setMode(null)}>Cancel</button><button type="submit" className="ccrc-btn primary" disabled={busy||!note.trim()||mode==='details'&&!changed}>{busy?'Saving…':mode==='details'?'Save Claim Details':'Save Update'}</button></footer>
   </form>
  </DialogContent></Dialog>
 </div>;
}
