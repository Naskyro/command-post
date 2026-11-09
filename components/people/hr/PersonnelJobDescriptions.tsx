'use client';
import ActivityFields from '@/components/shared/ActivityFields';
import {auditDay} from '@/lib/shared/audit-format';
import {useEffect,useState,type ReactNode} from 'react';
import {Archive,CheckCircle2,Download,FileSignature,LibraryBig,PenLine,Upload} from 'lucide-react';
import type {HrRecord} from '@/lib/hr/model';
import {requestJson, timedFetch, delegatedUrl} from '@/lib/shared/client';
import {JOB_ACCEPTANCE,acceptedJobDocument,jobDocumentTitle,personnelJobDocuments} from '@/lib/hr/job-description-acceptance';
import {today} from '@/lib/finance/model';
import SopPdfPages from '@/components/sop/SopPdfPages';
import {Button,Card,Empty,Tag,text} from './ui';
import './personnel-job-descriptions.css';

type Edition={id:string;version:number;status:string;departmentId:string;departmentName:string;content:{title?:string}};
type Catalog={descriptions:Edition[];assignablePeople:{id:string;departmentId?:string;currentDocumentId?:string}[]};
type Props={personId:string;records:HrRecord[];own:boolean;canAssign:boolean;onChanged:()=>Promise<void>;onLibrary?:()=>void;manualUpload?:ReactNode};
const url=(id:string)=>delegatedUrl('/api/hr/files?id='+encodeURIComponent(id));
const editionLabel=(r:HrRecord)=>r.data.jobDescriptionVersion?'Version '+r.data.jobDescriptionVersion:'Personnel Copy';

export default function PersonnelJobDescriptions({personId,records,own,canAssign,onChanged,onLibrary,manualUpload}:Props){
 const {current,history,evidence}=personnelJobDocuments(personId,records);
 const [selected,setSelected]=useState<string>(),[choose,setChoose]=useState(false);
 useEffect(()=>{setSelected(undefined);setChoose(false);},[personId,current?.id]);
 const row=(selected&&history.find(r=>r.id===selected))||current,isCurrent=!!row&&row.id===current?.id;
 return <section className="pj-file" aria-label="Employee Job Description">
  <div className="pj-header"><div><span className="hr2-section-label">Personnel File</span><h2>Job Description</h2></div>{canAssign&&<div className="hr2-actions">{onLibrary&&<Button onClick={onLibrary}><LibraryBig size={16}/>Open Library</Button>}<Button disabled={choose} onClick={()=>setChoose(true)}>{current?'Change Assignment':'Assign a Description'}</Button></div>}</div>
  {choose&&canAssign&&<AssignEdition key={personId} personId={personId} current={current} onDone={async()=>{await onChanged();setChoose(false);setSelected(undefined);}} close={()=>setChoose(false)}/>}
  {row?<><div className="pj-edition"><div><span className="hr2-section-label">{isCurrent?'Current Assignment':'Earlier Personnel Record'}</span><h3>{jobDocumentTitle(row)}</h3><small>{editionLabel(row)}</small><ActivityFields by={row.createdBy} at={row.data.jobDescriptionAssignedAt||row.createdAt} byLabel={row.data.jobDescriptionAssignedAt?'Assigned By':'Filed By'} whenLabel={row.data.jobDescriptionAssignedAt?'Assigned At':'Filed At'}/></div><Tag tone={acceptedJobDocument(row)?'green':isCurrent?'amber':''}>{acceptedJobDocument(row)?'Signed':isCurrent?'Signature Required':'Not Signed'}</Tag></div>
  {!isCurrent&&current&&<Button onClick={()=>setSelected(undefined)}>Return to Current Assignment</Button>}
  <DocumentReview key={row.id+':'+row.version} row={row} evidence={evidence} current={isCurrent} own={own} canAssign={canAssign} onChanged={onChanged}/></>:<Empty title="No Job Description Assigned">{own?'Your job description will appear here when your hiring team assigns it.':'Assign a published job description to send it to this employee for signature.'}</Empty>}
  {history.length>0&&<details className="pj-history"><summary><Archive size={17}/>Previous Descriptions ({history.length})</summary>{history.map(r=><button type="button" key={r.id} aria-current={selected===r.id?'true':undefined} onClick={()=>setSelected(r.id)}><span><b>{jobDocumentTitle(r)}</b><small>{editionLabel(r)}</small><ActivityFields by={r.createdBy} at={r.data.jobDescriptionAssignedAt||r.createdAt} byLabel="Recorded By" whenLabel="Recorded At"/></span><span>{acceptedJobDocument(r)?'Signed':r.data.assignmentSupersededBy?'Superseded':'On File'}</span></button>)}</details>}
  {!current?.data.jobDescriptionId&&canAssign&&manualUpload&&<details className="pj-history"><summary><Upload size={17}/>Use an Existing Paper Document</summary>{manualUpload}</details>}
 </section>;
}

function AssignEdition({personId,current,onDone,close}:{personId:string;current?:HrRecord;onDone:()=>Promise<void>;close:()=>void}){
 const [catalog,setCatalog]=useState<Catalog>(),[edition,setEdition]=useState(''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let live=true;setError('');void requestJson<Catalog>('/api/hr/job-descriptions').then(o=>{if(live)setCatalog(o);}).catch(e=>{if(live)setError((e as Error).message);});return()=>{live=false;};},[personId,attempt]);
 const person=catalog?.assignablePeople.find(p=>p.id===personId),editions=catalog?.descriptions.filter(r=>r.status==='Published'&&r.departmentId===person?.departmentId).sort((a,b)=>String(a.content.title).localeCompare(String(b.content.title))||b.version-a.version)||[];
 const key=(d:Edition)=>d.id+'#'+d.version,choice=editions.find(d=>key(d)===edition);
 async function assign(){if(!choice||!person||busy)return;setBusy(true);setError('');try{await requestJson('/api/hr/job-descriptions',{action:'assign',id:choice.id,version:choice.version,personId,...(person.currentDocumentId||current?{replaceDocumentId:person.currentDocumentId||current?.id}:{})});await onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Card title={current?'Change Assigned Version':'Assign a Published Description'}><div className="pj-form">{error&&<p role="alert" className="hr2-error">{error} {!catalog&&<button type="button" onClick={()=>setAttempt(a=>a+1)}>Retry</button>}</p>}{!catalog&&!error?<span role="status">Loading Published Descriptions…</span>:catalog&&!person?<p>You cannot assign job descriptions for this employee.</p>:catalog&&<><label className="hr2-field"><span>Published Job Description</span><select value={edition} onChange={e=>{setEdition(e.target.value);setConfirmed(false);}}><option value="">Select a Description</option>{editions.map(d=><option key={key(d)} value={key(d)}>{d.content.title} · Version {d.version}{d.departmentName?' · '+d.departmentName:''}</option>)}</select></label>{editions.length===0&&<p>Publish a description for this department in the Job Description Library first.</p>}{current&&<label className="pj-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Request a new signature and keep the previous assignment in history.</label>}</>}
 <div className="hr2-actions"><Button disabled={busy} onClick={close}>Cancel</Button><Button primary disabled={busy||!choice||!person||!!current&&!confirmed||choice?.id===current?.data.jobDescriptionId&&choice?.version===current?.data.jobDescriptionVersion} onClick={()=>void assign()}>{busy?'Assigning…':'Assign for Signature'}</Button></div></div></Card>;
}

function InlineFile({record,onReady}:{record:HrRecord;onReady?:()=>void}){
 const type=text(record.data.mimeType);
 if(type==='application/pdf')return <SopPdfPages url={url(record.id)} title={jobDocumentTitle(record)} onReady={onReady}/>;
 if(['image/png','image/jpeg'].includes(type))return <img className="pj-scan" src={url(record.id)} alt="Scanned Job Description" onLoad={onReady}/>;
 return <p className="hr2-help">This file format cannot be reviewed and signed here. For an outstanding assignment, ask HR for a PDF or scanned copy.</p>;
}
function DocumentReview({row,evidence,current,own,canAssign,onChanged}:{row:HrRecord;evidence:HrRecord[];current:boolean;own:boolean;canAssign:boolean;onChanged:()=>Promise<void>}){
 const [ready,setReady]=useState(false),[name,setName]=useState(''),[consent,setConsent]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [paper,setPaper]=useState(false),[proof,setProof]=useState<HrRecord>(),[proofSeen,setProofSeen]=useState(false),[date,setDate]=useState(today()),[attest,setAttest]=useState(false),[viewProof,setViewProof]=useState(false);
 const accepted=acceptedJobDocument(row),savedProof=evidence.find(r=>r.id===row.data.signedCopyId),pending=evidence.filter(r=>r.data.parentId===row.id&&r.data.sha256!==row.data.sha256).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const issued=!!row.data.jobDescriptionId,storedProof=proof||pending[0],receipt=accepted?(row.data.signatureStatus==='Signed'?'Signed Electronically':'Paper Signature Verified'):'';
 async function execute(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function sign(){await execute(async()=>{await requestJson('/api/hr',{action:'sign',id:row.id,version:row.version,data:{signatureName:name,consent,documentHash:row.data.sha256}});await onChanged();});}
 async function upload(file:File){await execute(async()=>{if(!['application/pdf','image/png','image/jpeg'].includes(file.type)||file.size>20*1024*1024)throw Error('Choose a signed PDF, JPG, or PNG up to 20 MB.');const body=new FormData();body.append('file',file);body.append('parentId',row.id);body.append('category','Job Description');body.append('personId',String(row.personId));const res=await timedFetch('/api/hr/files',{method:'POST',body});const result=await res.json() as {error?:string;record:HrRecord};if(!res.ok)throw Error(result.error||'Upload failed.');setProofSeen(false);setAttest(false);setProof(result.record);});}
 async function verify(){await execute(async()=>{await requestJson('/api/hr',{action:'verifyDocument',id:row.id,version:row.version,data:{signatureConfirmed:attest,signatureDate:date,...(issued?{signedCopyId:storedProof?.id}:{})}});await onChanged();});}
 return <><InlineFile record={row} onReady={()=>setReady(true)}/><div className="pj-actions"><a href={url(row.id)} download><Download size={15}/> {row.data.mimeType==='application/pdf'?'Download PDF':'Download File'}</a></div>
 {error&&<p className="hr2-error" role="alert">{error}</p>}
 {accepted?<div className="pj-receipt"><CheckCircle2 size={22}/><div><b>{receipt}</b>{row.data.signatureStatus==='Signed'?<ActivityFields by={row.data.signatureName} at={row.data.signedAt} byLabel="Signed By" whenLabel="Signed At"/>:<>{!!row.data.signatureDate&&<p>Paper Signature Date: {auditDay(row.data.signatureDate)}</p>}<ActivityFields by={row.data.signatureVerifiedBy} at={row.data.signatureVerifiedAt} byLabel="Verified By" whenLabel="Verified At"/></>}{!!row.data.acceptanceText&&<small>{text(row.data.acceptanceText)}</small>}{savedProof&&<Button onClick={()=>setViewProof(!viewProof)}>{viewProof?'Hide Signed Copy':'View Signed Copy'}</Button>}</div></div>:current&&own?<Card title="Sign Your Job Description"><form className="pj-form" onSubmit={e=>{e.preventDefault();void sign();}}><label className="hr2-field"><span>Your Full Name</span><input type="text" autoComplete="name" maxLength={180} value={name} onChange={e=>setName(e.target.value)} required/></label><label className="pj-confirm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>{JOB_ACCEPTANCE}</label><div className="hr2-actions"><Button type="submit" primary disabled={!ready||busy||!name.trim()||!consent}><PenLine size={16}/>{busy?'Saving…':'Sign and Accept'}</Button></div></form></Card>:null}
 {viewProof&&savedProof&&<InlineFile record={savedProof}/>}
 {!accepted&&current&&canAssign&&<details className="pj-history" open={paper} onToggle={e=>setPaper(e.currentTarget.open)}><summary><FileSignature size={17}/>Record a Paper Signature</summary>{paper&&<div className="pj-form">{issued?<><p>Upload the employee’s signed copy of this assigned version.</p><label className="hr2-field"><span>Signed PDF or Scan</span><input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label>{storedProof&&<InlineFile key={storedProof.id} record={storedProof} onReady={()=>setProofSeen(true)}/>}</>:<p>Verify only if the assigned upload above shows the employee’s actual signature.</p>}<label className="hr2-field"><span>Employee Signature Date</span><input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/></label><label className="pj-confirm"><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/>I reviewed the signed document and verified the employee’s signature and signature date.</label><div className="hr2-actions"><Button disabled={busy||!date||!attest||!(issued?storedProof&&proofSeen:ready)} onClick={()=>void verify()}>Verify Signed Copy</Button></div></div>}</details>}</>;
}
