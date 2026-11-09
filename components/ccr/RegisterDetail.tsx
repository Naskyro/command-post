'use client';
import {SourceFileShelf} from '@/components/shared/SourceFileShelf';
import {useEffect,useRef,useState} from 'react';
import {Inbox,ArrowLeft,ArrowRight,CalendarClock,Check,ChevronRight,Clock,Download,File,Files,History,LockKeyhole,NotebookPen,Paperclip,Pencil,Upload,UserRound} from 'lucide-react';
import CcrDocumentUpload from './CcrDocumentUpload';
import {documentTypeLabel,type CcrDocumentClassification} from '@/lib/ccr/document-types';
import {auditDay,auditStamp} from '@/lib/shared/audit-format';
import {timedFetch,delegatedUrl} from '@/lib/shared/client';
import {stageDocument,documentPartBytes} from '@/lib/ccr/document-stage-client';
import {registerConfig,type RegisterRecord} from '@/lib/ccr/register-model';
import {TdlrMailPanel} from './RegulatoryCorrespondence';
import {TdlrCaseReadout} from './TdlrCaseFields';
import {RegisterLawReadout} from './RegisterLawFields';
import {ChargebackReadout} from './ChargebackPanel';
import {LegalNoticeReadout} from './LegalNoticePanel';
import {detailSections,guideIcons,registerCopy} from './register-copy';
import type {EditorMode} from './RegisterEditor';
const bytes=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
type Props={record:RegisterRecord;canEdit:boolean;canEditFields:boolean;onBack:()=>void;onEditor:(mode:EditorMode)=>void;onFile:(r:RegisterRecord)=>void;today:string;initialUpload?:boolean};
export default function RegisterDetail({record:r,canEdit,canEditFields,onBack,onEditor,onFile,today,initialUpload=false}:Props){
 const cfg=registerConfig[r.section],copy=registerCopy[r.section],Icon=copy.icon,[section,setSection]=useState<'Overview'|'Evidence'|'History'|'Correspondence'>(initialUpload?'Evidence':'Overview'),[openUpload,setOpenUpload]=useState(initialUpload);
 const live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const pastDue=!!r.dueOn&&r.dueOn<today&&r.status!=='Closed';
 const [transfer,setTransfer]=useState('');
 async function upload(file:File,meta:CcrDocumentClassification){
  const fields={section:r.section,id:r.id,version:String(r.version),documentType:meta.documentType,otherDocumentType:meta.otherDocumentType||''};
  if(file.size>documentPartBytes){
   try{const saved=await stageDocument<RegisterRecord>('/api/ccr/register/stage',file,fields,(done,total)=>{if(live.current)setTransfer(done===total?'Verifying the original and attaching it to this record…':'Uploading '+Math.round(done/total*100)+'%');});if(live.current)onFile(saved);}
   finally{if(live.current)setTransfer('');}return;
  }
  const fd=new FormData();for(const [key,value] of Object.entries(fields))fd.set(key,value);fd.set('file',file);
  const resp=await timedFetch('/api/ccr/register/file',{method:'POST',body:fd},60000);const data=await resp.json() as RegisterRecord&{error?:string};if(!resp.ok)throw new Error(data.error||'Upload failed.');if(live.current)onFile(data);
 }
 return <article className="ccrr-detail" aria-label={'Record: '+r.title}>
 <button className="ccrr-back" onClick={onBack}><ArrowLeft size={16}/> Record Directory</button>
 <header className="ccrr-casehead"><div className="ccrr-caseline"><span className="ccrr-overline"><Icon size={14}/> {copy.singular}</span><span className="ccrr-restricted"><LockKeyhole size={12}/> Confidential</span></div><h2>{r.title}</h2><div className="ccrr-casefoot"><div><span className="ccrr-status"><i/>{r.status}</span><span>{r.category}</span></div>{canEditFields&&<button onClick={()=>onEditor('edit')} className="ccrr-headedit"><Pencil size={14}/> Edit Details</button>}{canEdit&&<button onClick={()=>onEditor('note')} className="ccrr-headedit"><NotebookPen size={14}/> Add Update</button>}</div></header>
 <nav className="ccrr-tabs" aria-label="Record Views">{detailSections.map(([s,I])=><button key={s} aria-pressed={section===s} onClick={()=>setSection(s)}><I size={15}/>{s}{s==='Evidence'&&<small>{r.files.length}</small>}{s==='History'&&<small>{r.history.length}</small>}</button>)}{r.section==='tdlr'&&<button aria-pressed={section==='Correspondence'} onClick={()=>setSection('Correspondence')}><Inbox size={15}/> Correspondence <small>{r.mailCount||0}</small></button>}</nav>
 <div className="ccrr-detailbody">{section==='Correspondence'?<TdlrMailPanel record={r}/>:section==='Overview'?<>
 <div className={'ccrr-actionrow'+(pastDue?' ccrr-pastdue':'')}><span><CalendarClock size={19}/></span><div><small>Next Action</small><strong>{r.nextAction||'No Next Action Recorded'}</strong>{r.dueOn&&<p>{pastDue?'Overdue · ':''}Due {auditDay(r.dueOn)}</p>}</div></div>
 <dl className="ccrr-meta"><div><dt>Assigned To</dt><dd><UserRound size={14}/>{r.ownerName||'Unassigned'}</dd></div><div><dt>{copy.ref}</dt><dd>{r.reference||'Not Entered'}</dd></div><div><dt>Created By</dt><dd>{r.createdBy}</dd></div><div><dt>Created On</dt><dd>{auditStamp(r.createdAt)}</dd></div>{r.resolutionReference&&<div><dt>{r.section==='recovery'?'Finance Reconciliation Reference':'External Evidence Reference'}</dt><dd>{r.resolutionReference}</dd></div>}{r.section==='recovery'&&<div><dt>Amount Tracked</dt><dd>{r.amountCents!=null?dollars.format(r.amountCents/100):'Not Entered'}</dd></div>}</dl>
 {r.section==='tdlr'&&r.tdlr&&<TdlrCaseReadout v={r.tdlr}/>}
 {r.section==='legal'&&r.legalNotice&&<LegalNoticeReadout value={r.legalNotice}/>}
 <RegisterLawReadout rows={r.lawEnforcement}/>
 {r.category==='Chargeback'&&r.chargeback&&<>{canEditFields&&<div className="ccrr-recoveryactions" aria-label="Recovery Actions"><button type="button" className="ccrr-button" onClick={()=>onEditor('contact')}>Log Contact</button><button type="button" className="ccrr-button" onClick={()=>onEditor('appointment')}>Schedule Payment</button><button type="button" className="ccrr-primary" onClick={()=>onEditor('payment')}>Record Payment</button></div>}<ChargebackReadout recordId={r.id} c={r.chargeback} principal={r.amountCents} recordStatus={r.status}/></>}
 <section className="ccrr-block"><header><h3>Documented Milestones</h3><span>{r.steps.length} of {cfg.steps.length}</span></header><div className="ccrr-track" aria-hidden><i style={{width:(cfg.steps.length?100*r.steps.length/cfg.steps.length:0)+'%'}}/></div><ul className="ccrr-checks">{cfg.steps.map(s=><li key={s}><span className={r.steps.includes(s)?'checked':''} aria-label={r.steps.includes(s)?'Documented':'Not Documented'}>{r.steps.includes(s)&&<Check size={12}/>}</span>{s}</li>)}</ul></section>
 <div className="ccrr-byline"><Clock size={14}/><span>Last Changed <time dateTime={r.updatedAt}>{auditStamp(r.updatedAt)}</time> by {r.updatedBy}</span></div></>:section==='Evidence'?<>
 <div className="ccrr-detailbar"><div><span className="ccrr-overline">Attachments</span><h3>Evidence Files</h3></div></div>
 {canEdit&&<CcrDocumentUpload section={r.section} onUpload={upload} initiallyOpen={openUpload} onClose={()=>setOpenUpload(false)}/>}
 {transfer&&<p role="status" aria-live="polite">{transfer}</p>}
 {r.section==='tdlr'&&<SourceFileShelf scope="tdlr" targetId={r.id}/>}
 {r.files.length?<ul className="ccrr-files ccr-list-files">{[...r.files].reverse().map(f=><li key={f.id}><span className="ccrr-miniicon"><File size={18}/></span><div><strong>{f.name}</strong><small className="ccr-document-class">{documentTypeLabel(f)}</small><small>{bytes(f.bytes)} · {auditStamp(f.at)} · {f.by}</small></div><a href={delegatedUrl('/api/ccr/register/file?'+new URLSearchParams({section:r.section,id:r.id,file:f.id}))} download={f.name} title={'Download '+f.name} aria-label={'Download '+f.name}><Download size={16}/></a></li>)}</ul>:<div className="ccrr-smallblank"><Paperclip size={24}/><strong>No Files Attached</strong><p>Supporting files for this record will appear here.</p></div>}</>:<>
 <div className="ccrr-detailbar"><div><span className="ccrr-overline">Activity Log</span><h3>Record History</h3></div>{canEdit&&<button className="ccrr-button" onClick={()=>onEditor('note')}><NotebookPen size={15}/> Add Update</button>}</div>
 {r.history.length?<ol className="ccrr-events">{[...r.history].sort((a,b)=>b.version-a.version).map(ev=><li key={ev.version}><i><History size={13}/></i><div><header><strong>{ev.by}</strong><time dateTime={ev.at}>{auditStamp(ev.at)}</time></header>{ev.note&&<p>{ev.note}</p>}{ev.changes.length>0&&<small>{ev.changes.join(' · ')}</small>}</div></li>)}</ol>:<p className="ccrr-hint">No updates have been recorded.</p>}</>}
 </div></article>;
}
export function RegisterGuide({tab,canEdit,onCreate}:{tab:RegisterRecord['section'];canEdit:boolean;onCreate:()=>void}){
 const copy=registerCopy[tab],Icon=copy.icon;return <article className="ccrr-detail ccrr-guide"><header className="ccrr-casehead"><div className="ccrr-caseline"><span className="ccrr-overline"><Icon size={14}/> {copy.singular}</span><span className="ccrr-restricted"><LockKeyhole size={12}/> Confidential</span></div><h2>{tab==='recovery'?'Recovery Case File':tab==='evidence'?'Inspection Packet':copy.singular+' File'}</h2><p>{copy.intent}</p></header><div className="ccrr-detailbody"><div className="ccrr-detailbar"><div><span className="ccrr-overline">Workflow</span><h3>What Goes in This File</h3></div></div><ol className="ccrr-guidepaths">{copy.instructions.map((s,i)=>{const I=guideIcons[i];return <li key={s}><i><I size={17}/></i><span>{s}</span></li>})}</ol>{canEdit&&<button type="button" className="ccrr-guideaction" onClick={onCreate}>Create {copy.singular}<ArrowRight size={16}/></button>}</div></article>;
}
