'use client';

import {useCallback, useEffect, useId, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {CalendarDays, Check, FileText, LockKeyhole, Plus, Printer, RefreshCw, Upload} from 'lucide-react';
import {timedFetch} from '@/lib/shared/client';
import {auditDay, auditStamp} from '@/lib/shared/audit-format';
import type {FollowupContact, MedicalCaseResponse, MedicalKind, MedicalReport, MedicalResponse} from '@/lib/hr/accident-reports';
import './accident-reports.css';

export type AccidentReportsPanelProps={claimKey:string;driverId?:string;accidentInvolved?:string;accidentOn?:string;driverInjury?:string;ownerInjury?:string;onChanged?:()=>void};
type Composer={kind:MedicalKind;week?:1|2|3;key:number};
type SubmitReport={kind:MedicalKind;week?:1|2|3;reportedOn:string;response:MedicalResponse;statement:string;firstNoticedOn:string;assistance:string;workRestrictions:string;source:MedicalReport['source']};
type Mutation=(body:Record<string,unknown>|FormData,success:string)=>Promise<boolean>;
const responses:MedicalResponse[]=['Update to report','No issues to report at this time','Private follow-up requested','Unable to provide an update'];
const electronicConsent='I choose to sign this report electronically.';
const endpoint='/api/hr/accident-reports';

function centralDay(at=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);}
function today(){return centralDay();}
function message(error:unknown){return error instanceof Error?error.message:'The request could not be completed. Please try again.';}
async function responseBody(response:Response){
 try{return await response.json() as Record<string,unknown>;}catch{throw Error('The server returned an unreadable response. Refresh the reports before trying again.');}
}
function reportLabel(report:Pick<MedicalReport,'kind'|'week'>){return report.kind==='Weekly check-in'?`Week ${report.week} Check-In`:report.kind;}
function fileUrl(path:string,caseId:string,reportId:string){return `${endpoint}/${path}?${new URLSearchParams({caseId,reportId})}`;}

export default function AccidentReportsPanel(props:AccidentReportsPanelProps){
 if(!props.driverId)return <section className="accident-reports ar-empty"><h3>Driver Accident Reports</h3><p>Link a driver to open their restricted reports and scheduled check-ins.</p></section>;
 return <ReportSession key={`${props.claimKey}:${props.driverId}`} claimKey={props.claimKey} driverId={props.driverId} onChanged={props.onChanged}/>;
}

function ReportSession({claimKey,driverId,onChanged}:{claimKey:string;driverId:string;onChanged?:()=>void}){
 const [data,setData]=useState<MedicalCaseResponse|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[denied,setDenied]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[composer,setComposer]=useState<Composer|null>(null),[contactWeek,setContactWeek]=useState<1|2|3|null>(null);
 const mounted=useRef(true),sequence=useRef(0),writing=useRef(false),initialRequested=useRef(false),headingId=useId();
 const clearPrivateState=useCallback(()=>{setData(null);setComposer(null);setContactWeek(null);setNotice('');setDenied(true);},[]);
 const load=useCallback(async()=>{
  const request=++sequence.current;setLoading(true);
  try{
   const response=await timedFetch(`${endpoint}?${new URLSearchParams({claimKey,driverId})}`);
   if(!mounted.current||request!==sequence.current)return false;
   if(response.status===401||response.status===403){clearPrivateState();setError('These reports are available only to the driver and designated medical-record reviewers. Sign in with your own authorized account.');return false;}
   const value=await responseBody(response);
   if(!mounted.current||request!==sequence.current)return false;
   if(!response.ok)throw Error(typeof value.error==='string'?value.error:'The accident reports could not be loaded.');
   const result=value as unknown as MedicalCaseResponse;
   if(!result.permissions?.self&&!result.permissions?.manage){clearPrivateState();setError('You do not have access to this restricted record.');return false;}
   setData(result);setDenied(false);setError('');
   if(result.record.initialReportRequested&&!result.record.reports.some(r=>r.kind==='Initial report')&&!initialRequested.current){initialRequested.current=true;setComposer({kind:'Initial report',key:1});}
   return true;
  }catch(e){if(mounted.current&&request===sequence.current)setError(message(e));return false;}
  finally{if(mounted.current&&request===sequence.current)setLoading(false);}
 },[claimKey,driverId,clearPrivateState]);
 useEffect(()=>{mounted.current=true;const initial=setTimeout(()=>void load(),0);return()=>{mounted.current=false;clearTimeout(initial);};},[load]);

 const mutate:Mutation=async(body,success)=>{
  if(writing.current)return false;
  writing.current=true;setBusy(true);setError('');setNotice('');
  // A read begun before this write must not replace the resulting record.
  sequence.current++;
  try{
   const multipart=body instanceof FormData;
   const response=await timedFetch(multipart?`${endpoint}/files`:endpoint,multipart?{method:'POST',body}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},45000);
   if(!mounted.current)return false;
   if(response.status===401||response.status===403){clearPrivateState();setError('Access to this restricted record is no longer available. Sign in with your own authorized account.');return false;}
   const value=await responseBody(response);
   if(!response.ok)throw Error(typeof value.error==='string'?value.error:'The report could not be saved.');
   setNotice(success);
   await load();
   onChanged?.();
   return true;
  }catch(e){if(mounted.current)setError(message(e));return false;}
  finally{writing.current=false;if(mounted.current)setBusy(false);}
 };
 const openReport=(kind:MedicalKind,week?:1|2|3)=>{setNotice('');setComposer(current=>({kind,week,key:(current?.key||0)+1}));setContactWeek(null);};

 if(!data)return <section className="accident-reports ar-empty" aria-labelledby={headingId} aria-busy={loading}>
  <h3 id={headingId}><LockKeyhole size={17} aria-hidden="true"/> Driver Accident Reports</h3>
  <p role={error?'alert':undefined}>{error||'Loading restricted reports…'}</p>
  {!loading&&<button type="button" className="ar-button" onClick={()=>void load()}><RefreshCw size={14} aria-hidden="true"/>{denied?'Check Access':'Try Again'}</button>}
 </section>;

 const {record,permissions,schedule}=data;
 const reportSubmit=async(report:SubmitReport)=>{
  const saved=await mutate({action:'submit',claimKey,driverId,version:record.version,data:report},'Report saved for driver review.');
  if(saved)setComposer(null);
 };
 return <section className="accident-reports" aria-labelledby={headingId} aria-busy={busy||loading}>
  <header className="ar-heading">
   <div><p className="ar-eyebrow"><LockKeyhole size={13} aria-hidden="true"/> Restricted Record</p><h3 id={headingId}>Driver Accident Reports</h3><p>{record.driverName} · {record.accidentOn?`Accident ${auditDay(record.accidentOn)}`:'Accident date not recorded'}</p></div>
   <button type="button" className="ar-button" disabled={busy||loading} onClick={()=>void load()} aria-label="Refresh accident reports"><RefreshCw size={14} aria-hidden="true"/> Refresh</button>
  </header>
  <p className="ar-notice">Report changes as soon as practicable. You can add an update at any time, including after the scheduled check-ins. Earlier statements remain in the record.</p>
  {record.initialReportRequested&&!record.reports.some(report=>report.kind==='Initial report')&&<p className="ar-notice"><strong>Initial driver report requested.</strong> An injury was reported on the claim. Record the driver’s own statement below; it can be saved before a signature is available.</p>}
  {error&&<p className="ar-alert" role="alert">{error}</p>}
  {notice&&<p className="ar-success" role="status">{notice}</p>}
  <div className="ar-section-head"><h4><CalendarDays size={16} aria-hidden="true"/> First Three Weeks</h4><span>7, 14 and 21 days after the accident</span></div>
  {schedule.length?<ol className="ar-schedule">{schedule.map(item=><li key={item.week}>
   <div><strong>Week {item.week}</strong><span>Due {auditDay(item.dueOn)}</span><span className="ar-status" data-state={item.status}>{item.status}</span></div>
   <div className="ar-actions">
    {item.canReport&&<button type="button" className="ar-button" disabled={busy} onClick={()=>openReport('Weekly check-in',item.week)}>{item.reportId?'Add Week Update':'Add Check-In'}</button>}
    {permissions.manage&&<button type="button" className="ar-button ar-button-quiet" disabled={busy} onClick={()=>{setContactWeek(item.week);setComposer(null);}}>Log Contact</button>}
   </div>
  </li>)}</ol>:<p className="ar-muted">Add the accident date to the linked claim to schedule the three check-ins. An initial report or additional update can still be recorded.</p>}
  <p className="ar-small">A missed check-in or contact attempt does not indicate whether someone has symptoms. Earlier information can be recorded as an additional update.</p>
  <div className="ar-actions ar-create-actions">
   {!record.reports.some(report=>report.kind==='Initial report')&&<button type="button" className="ar-button ar-primary" disabled={busy} onClick={()=>openReport('Initial report')}><Plus size={14} aria-hidden="true"/> Initial Report</button>}
   <button type="button" className="ar-button" disabled={busy} onClick={()=>openReport('Additional update')}><Plus size={14} aria-hidden="true"/> Additional Update</button>
  </div>
  {composer&&<ReportComposer key={composer.key} composer={composer} self={permissions.self} accidentOn={record.accidentOn} dueOn={schedule.find(item=>item.week===composer.week)?.dueOn} busy={busy} onCancel={()=>setComposer(null)} onSubmit={reportSubmit}/>}
  {contactWeek&&permissions.manage&&<ContactForm key={contactWeek} week={contactWeek} busy={busy} onCancel={()=>setContactWeek(null)} onSubmit={async(status,note)=>{
   if(await mutate({action:'contact',claimKey,driverId,version:record.version,data:{week:contactWeek,status,note}},'Contact attempt recorded.'))setContactWeek(null);
  }}/>}
  <div className="ar-section-head ar-history-heading"><h4><FileText size={16} aria-hidden="true"/> Report History</h4><span>{record.reports.length} {record.reports.length===1?'report':'reports'}</span></div>
  {record.reports.length?<div className="ar-history">{[...record.reports].reverse().map(report=><ReportEntry key={report.id} report={report} caseId={record.id} version={record.version} self={permissions.self} manage={permissions.manage} busy={busy} mutate={mutate}/>)}</div>:<p className="ar-muted">No reports have been submitted. Choose a response when recording the first report.</p>}
  {record.contacts.length>0&&<details className="ar-contact-history"><summary>Contact History ({record.contacts.length})</summary><ol>{[...record.contacts].reverse().map(contact=><li key={contact.id}><strong>Week {contact.week} · {contact.status}</strong>{contact.note&&<p>{contact.note}</p>}<small>{contact.by.name} · {auditStamp(contact.by.at)}</small></li>)}</ol></details>}
 </section>;
}

function ReportComposer({composer,self,accidentOn,dueOn,busy,onCancel,onSubmit}:{composer:Composer;self:boolean;accidentOn:string;dueOn?:string;busy:boolean;onCancel:()=>void;onSubmit:(data:SubmitReport)=>Promise<void>}){
 const [reportedOn,setReportedOn]=useState(today),[response,setResponse]=useState<MedicalResponse|''>(''),[statement,setStatement]=useState(''),[firstNoticedOn,setFirstNoticedOn]=useState(''),[assistance,setAssistance]=useState(''),[workRestrictions,setWorkRestrictions]=useState(''),[source,setSource]=useState<MedicalReport['source']|''>(self?'Driver statement':'');
 const titleId=useId(),responseId=useId();
 async function submit(event:FormEvent){event.preventDefault();if(!response||!source)return;await onSubmit({kind:composer.kind,...(composer.week?{week:composer.week}:{}),reportedOn,response,statement,firstNoticedOn,assistance,workRestrictions,source});}
 return <form className="ar-form" aria-labelledby={titleId} onSubmit={event=>void submit(event)}>
  <h4 id={titleId}>{reportLabel(composer)}</h4>
  <p className="ar-small">Record what the driver reports or what a supervisor directly observes. Include only information relevant to this accident and any assistance or work limitations.</p>
  <fieldset disabled={busy}>
   <div className="ar-grid">
    <label>Report Received Date<input type="date" required value={reportedOn} min={dueOn||accidentOn||undefined} max={today()} onChange={event=>setReportedOn(event.target.value)}/><small>The date this statement or update was received.</small></label>
    {!self&&<label>Information Source<select required value={source} onChange={event=>{const next=event.target.value as MedicalReport['source']|'';setSource(next);if(next==='Supervisor observation'&&response==='No issues to report at this time')setResponse('');}}><option value="">Choose a source</option><option>Driver statement</option><option>Supervisor observation</option></select></label>}
   </div>
   <label htmlFor={responseId}>Response<select id={responseId} required value={response} onChange={event=>setResponse(event.target.value as MedicalResponse|'' )}><option value="">Choose a response</option>{responses.filter(option=>source!=='Supervisor observation'||option!=='No issues to report at this time').map(option=><option key={option}>{option}</option>)}</select></label>
   <label>{source==='Supervisor observation'?'Observation':'Statement in the Driver’s Own Words'}{response==='Update to report'?'':' (Optional)'}<textarea rows={4} maxLength={8000} required={response==='Update to report'} value={statement} onChange={event=>setStatement(event.target.value)} placeholder={source==='Supervisor observation'?'Describe what you directly observed.':'Describe the update, including relevant symptoms or concerns, if any.'}/></label>
   <div className="ar-grid">
    <label>First Noticed Date (Optional)<input type="date" max={reportedOn||today()} value={firstNoticedOn} onChange={event=>setFirstNoticedOn(event.target.value)}/><small>Leave blank if unknown or not applicable.</small></label>
    <label>Assistance Requested (Optional)<textarea rows={2} maxLength={2500} value={assistance} onChange={event=>setAssistance(event.target.value)} placeholder="Any assistance requested by the driver"/></label>
   </div>
   <label>Work Limitations Reported (Optional)<textarea rows={2} maxLength={2500} value={workRestrictions} onChange={event=>setWorkRestrictions(event.target.value)} placeholder="Describe any work limitations reported, if applicable."/></label>
   <p className="ar-small">Saving creates a dated report for driver review. The driver can sign electronically or review and sign a printed copy. New information and corrections are added as separate reports.</p>
   <div className="ar-actions"><button type="submit" className="ar-button ar-primary">{busy?'Saving…':'Save for Driver Review'}</button><button type="button" className="ar-button" onClick={onCancel}>Cancel</button></div>
  </fieldset>
 </form>;
}

function ContactForm({week,busy,onCancel,onSubmit}:{week:1|2|3;busy:boolean;onCancel:()=>void;onSubmit:(status:FollowupContact['status'],note:string)=>Promise<void>}){
 const [status,setStatus]=useState<FollowupContact['status']|''>(''),[note,setNote]=useState('');
 return <form className="ar-form" onSubmit={event=>{event.preventDefault();if(status)void onSubmit(status,note);}}><h4>Week {week} Contact</h4><p className="ar-small">Record the contact attempt or scheduling detail. Use a report for the driver’s statement or a direct observation.</p><fieldset disabled={busy}><label>Contact Status<select required value={status} onChange={event=>setStatus(event.target.value as FollowupContact['status']|'' )}><option value="">Choose a status</option><option>Contact attempted</option><option>No response</option><option>Rescheduled</option></select></label><label>Contact Note<textarea rows={2} maxLength={2000} required value={note} onChange={event=>setNote(event.target.value)} placeholder="When and how contact was attempted, or the rescheduled time"/></label><div className="ar-actions"><button type="submit" className="ar-button ar-primary">{busy?'Saving…':'Record Contact'}</button><button type="button" className="ar-button" onClick={onCancel}>Cancel</button></div></fieldset></form>;
}

function ReportEntry({report,caseId,version,self,manage,busy,mutate}:{report:MedicalReport;caseId:string;version:number;self:boolean;manage:boolean;busy:boolean;mutate:Mutation}){
 const [action,setAction]=useState<'sign'|'paper'|'disposition'|null>(null);
 const titleId=useId(),signed=!!report.signature;
 async function perform(body:Record<string,unknown>|FormData,success:string){if(await mutate(body,success))setAction(null);}
 return <article className="ar-report" aria-labelledby={titleId}>
  <header><div><h5 id={titleId}>{reportLabel(report)}</h5><p>Received {auditDay(report.reportedOn)} · {report.source}</p></div><span className="ar-status" data-state={signed?'Completed':report.signatureStatus}>{signed&&<Check size={12} aria-hidden="true"/>}{report.signatureStatus}</span></header>
  <dl className="ar-report-facts"><div><dt>Driver</dt><dd>{report.driverName}</dd></div><div><dt>Accident Date</dt><dd>{auditDay(report.accidentOn)||'Not recorded'}</dd></div><div><dt>Response</dt><dd>{report.response}</dd></div>{report.firstNoticedOn&&<div><dt>First Noticed</dt><dd>{auditDay(report.firstNoticedOn)}</dd></div>}</dl>
  {report.statement&&<div className="ar-report-copy"><h6>{report.source==='Supervisor observation'?'Observation':'Statement'}</h6><p>{report.statement}</p></div>}
  {report.assistance&&<div className="ar-report-copy"><h6>Assistance Requested</h6><p>{report.assistance}</p></div>}
  {report.workRestrictions&&<div className="ar-report-copy"><h6>Work Limitations Reported</h6><p>{report.workRestrictions}</p></div>}
  <p className="ar-small">Recorded by {report.preparedBy.name} · {auditStamp(report.preparedBy.at)}</p>
  {report.signature&&<div className="ar-signature"><p><strong>{report.signature.method==='Electronic'?'Signed electronically':'Signed on paper'}</strong> by {report.signature.signerName} · {auditStamp(report.signature.signedAt)||auditDay(report.signature.signedAt)}</p><p className="ar-small">{report.signature.acknowledgment}</p>{report.signature.method==='Paper'&&<p className="ar-small">Recorded by {report.signature.recordedBy.name} · {auditStamp(report.signature.recordedAt)}</p>}</div>}
  {report.dispositions.length>0&&<details className="ar-dispositions"><summary>Signature Notes ({report.dispositions.length})</summary>{report.dispositions.map((entry,index)=><div key={`${entry.by.at}:${index}`}><strong>{entry.status}</strong><p>{entry.note}</p><small>{entry.by.name} · {auditStamp(entry.by.at)}</small></div>)}</details>}
  <div className="ar-actions">
   <a className="ar-button" href={fileUrl('print',caseId,report.id)} target="_blank" rel="noopener noreferrer"><Printer size={14} aria-hidden="true"/> Print Exact Report</a>
   {report.signature?.method==='Paper'&&report.signature.file&&<a className="ar-button" href={fileUrl('files',caseId,report.id)} target="_blank" rel="noopener noreferrer">View Signed Original</a>}
   {!signed&&self&&<button type="button" className="ar-button ar-primary" disabled={busy} onClick={()=>setAction(action==='sign'?null:'sign')}>Review &amp; Sign</button>}
   {!signed&&manage&&<button type="button" className="ar-button" disabled={busy} onClick={()=>setAction(action==='paper'?null:'paper')}><Upload size={14} aria-hidden="true"/> Record Paper Signature</button>}
   {!signed&&(self||manage)&&<button type="button" className="ar-button ar-button-quiet" disabled={busy} onClick={()=>setAction(action==='disposition'?null:'disposition')}>Signature Status</button>}
  </div>
  {!signed&&action==='sign'&&self&&<ElectronicSignature report={report} busy={busy} onCancel={()=>setAction(null)} onSubmit={async signatureName=>perform({action:'sign',caseId,version,reportId:report.id,data:{signatureName,consent:true,reportHash:report.reportHash}},'The driver’s electronic signature was saved.')}/>}
  {!signed&&action==='paper'&&manage&&<PaperSignature report={report} busy={busy} onCancel={()=>setAction(null)} onSubmit={async values=>{values.set('caseId',caseId);values.set('version',String(version));values.set('reportId',report.id);values.set('reportHash',report.reportHash);await perform(values,'The signed paper original was saved.');}}/>}
  {!signed&&action==='disposition'&&(self||manage)&&<SignatureDisposition busy={busy} onCancel={()=>setAction(null)} onSubmit={async(status,note)=>perform({action:'disposition',caseId,version,reportId:report.id,data:{status,note}},'The signature status was recorded.')}/>}
 </article>;
}

function ElectronicSignature({report,busy,onCancel,onSubmit}:{report:MedicalReport;busy:boolean;onCancel:()=>void;onSubmit:(name:string)=>Promise<void>}){
 const [name,setName]=useState(''),[consent,setConsent]=useState(false);
 return <form className="ar-form ar-sign-form" onSubmit={event=>{event.preventDefault();if(consent&&name.trim())void onSubmit(name.trim());}}><h4>Driver Review &amp; Electronic Signature</h4><p className="ar-small">Review the complete report above before signing. If a correction is needed, add an additional update and identify the report being corrected.</p><p className="ar-acknowledgment">{report.acknowledgment}</p><fieldset disabled={busy}><label>Your Full Name<input autoComplete="name" required maxLength={180} value={name} onChange={event=>setName(event.target.value)}/></label><label className="ar-check"><input type="checkbox" required checked={consent} onChange={event=>setConsent(event.target.checked)}/><span>{electronicConsent} I am the driver named in this report.</span></label><div className="ar-actions"><button type="submit" className="ar-button ar-primary" disabled={!consent||!name.trim()}>{busy?'Signing…':'Sign This Report'}</button><button type="button" className="ar-button" onClick={onCancel}>Cancel</button></div></fieldset></form>;
}

function PaperSignature({report,busy,onCancel,onSubmit}:{report:MedicalReport;busy:boolean;onCancel:()=>void;onSubmit:(data:FormData)=>Promise<void>}){
 const [name,setName]=useState(''),[signedOn,setSignedOn]=useState(today),[file,setFile]=useState<File|null>(null),[confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();setError('');
  if(!file||!confirmed||!name.trim())return;
  if(!file.size||file.size>8*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type)){setError('Choose the signed original as a PDF, JPEG or PNG, up to 8 MB.');return;}
  const data=new FormData();data.set('signatureName',name.trim());data.set('signedOn',signedOn);data.set('confirmed','true');data.set('file',file);await onSubmit(data);
 }
 return <form className="ar-form ar-sign-form" onSubmit={event=>void submit(event)}><h4>Record a Signed Paper Original</h4><p className="ar-small">Print this exact report, have the driver review and sign it, then upload the complete signed copy. The uploaded original is retained with this report.</p><p className="ar-acknowledgment">{report.acknowledgment}</p>{error&&<p className="ar-alert" role="alert">{error}</p>}<fieldset disabled={busy}><div className="ar-grid"><label>Driver Name on the Signature<input required maxLength={180} value={name} onChange={event=>setName(event.target.value)}/></label><label>Date Signed<input type="date" required max={today()} min={centralDay(new Date(report.preparedBy.at))} value={signedOn} onChange={event=>setSignedOn(event.target.value)}/></label></div><label>Complete Signed Report<input type="file" required accept="application/pdf,image/jpeg,image/png" onChange={event=>{setFile(event.target.files?.[0]||null);setError('');}}/><small>PDF, JPEG or PNG · maximum 8 MB</small></label><label className="ar-check"><input type="checkbox" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm that the uploaded file contains this complete report and the driver’s paper signature.</span></label><div className="ar-actions"><button type="submit" className="ar-button ar-primary" disabled={!file||!confirmed||!name.trim()}>{busy?'Uploading…':'Save Signed Original'}</button><button type="button" className="ar-button" onClick={onCancel}>Cancel</button></div></fieldset></form>;
}

function SignatureDisposition({busy,onCancel,onSubmit}:{busy:boolean;onCancel:()=>void;onSubmit:(status:'Declined to sign'|'Unable to sign',note:string)=>Promise<void>}){
 const [status,setStatus]=useState<'Declined to sign'|'Unable to sign'|''>(''),[note,setNote]=useState('');
 return <form className="ar-form ar-sign-form" onSubmit={event=>{event.preventDefault();if(status&&note.trim())void onSubmit(status,note.trim());}}><h4>Record Signature Status</h4><p className="ar-small">The report remains available if the driver declines or is unable to sign. This status makes no conclusion about injury or eligibility.</p><fieldset disabled={busy}><label>Status<select required value={status} onChange={event=>setStatus(event.target.value as typeof status)}><option value="">Choose a status</option><option>Declined to sign</option><option>Unable to sign</option></select></label><label>Note<textarea rows={2} required maxLength={2000} value={note} onChange={event=>setNote(event.target.value)} placeholder="Record the circumstances without drawing a medical conclusion."/></label><div className="ar-actions"><button type="submit" className="ar-button ar-primary">{busy?'Saving…':'Save Status'}</button><button type="button" className="ar-button" onClick={onCancel}>Cancel</button></div></fieldset></form>;
}
