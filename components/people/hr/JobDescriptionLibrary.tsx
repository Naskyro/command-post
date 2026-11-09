'use client';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';
import ActivityFields from '@/components/shared/ActivityFields';
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {ArrowLeft,BookOpen,CheckCircle2,ChevronRight,Download,FileClock,FilePenLine,FileText,Plus,Search,UserRoundPen} from 'lucide-react';
import type {HrData,HrRecord} from '@/lib/hr/model';
import type {JobEdition} from '@/lib/hr/job-catalog';
import {today} from '@/lib/finance/model';
import {requestJson,delegatedUrl} from '@/lib/shared/client';
import SopPdfPages from '@/components/sop/SopPdfPages';
import JobDescriptionEditor,{descriptionFields,type DescriptionFields} from './JobDescriptionEditor';
import {Button,Empty,Tag} from './ui';
import './job-description-library.css';

type Status='Draft'|'Published'|'Archived';
type Edition=JobEdition;
type Recipient={id:string;name:string;departmentId:string;currentDocumentId?:string;currentDescriptionTitle?:string;currentDescriptionId?:string;currentDescriptionVersion?:number};
type Catalog={descriptions:Edition[];departments:{id:string;name:string}[];canCreate:boolean;assignablePeople:Recipient[];referenceTemplate?:DescriptionFields};
type View=Status|'copies';
type Selection={editionId:string;version:number}|{documentId:string};
const views:{id:View;label:string;icon:typeof BookOpen}[]=[{id:'Published',label:'Published',icon:BookOpen},{id:'Draft',label:'Drafts',icon:FilePenLine},{id:'Archived',label:'Version History',icon:FileClock},{id:'copies',label:'Employee Copies',icon:UserRoundPen}];
const emptyText:Record<View,[string,string]>={Published:['No Published Job Descriptions','Publish a job description to make it available for vacancies and employee signatures.'],Draft:['No Drafts','Drafts saved in the job description editor appear here.'],Archived:['No Previous Versions','When a revised description is published, its previous version remains here.'],copies:['No Employee Copies','Assigned descriptions and uploaded job descriptions you can access appear here.']};
const api='/api/hr/job-descriptions';
const docName=(r:HrRecord)=>String(r.data.jobDescriptionTitle||r.data.descriptionTitle||r.data.title||r.data.name||r.data.fileName||'Job Description');
const memberLabel=(name:string,detail?:string)=>[name,detail].filter(Boolean).join(' · ');
const tone=(s:Status)=>s==='Published'?'green':s==='Draft'?'amber':'gray';
const pdfUrl=(e:Edition)=>`${api}/pdf?id=${encodeURIComponent(e.id)}&version=${e.version}&edition=${e.etag}`;
const matches=(term:string,...fields:unknown[])=>fields.map(v=>String(v??'')).join(' ').toLocaleLowerCase().includes(term);

export default function JobDescriptionLibrary({data,refreshKey,onChanged}:{data:HrData;refreshKey:number;onChanged:()=>Promise<void>}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[loadError,setLoadError]=useState(''),[retry,setRetry]=useState(0);
 const [view,setView]=useState<View>('Published'),[q,setQ]=useState(''),[selection,setSelection]=useState<Selection|null>(null),[editing,setEditing]=useState<Edition|'new'|null>(null);
 const [positionSeed,setPositionSeed]=useState<{content:DescriptionFields;departmentId:string}|null>(null);
 const [assignment,setAssignment]=useState(false),[recipient,setRecipient]=useState(''),[replace,setReplace]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const busyRef=useRef(false);
 useEffect(()=>{let active=true;void requestJson<Catalog>(api).then(result=>{if(active){setCatalog(result);setLoadError('');}}).catch((e:Error)=>{if(active){setCatalog(null);setLoadError(e.message);}});return()=>{active=false;};},[data.viewer.person,retry,refreshKey]);
 const descriptions=catalog?.descriptions??[],people=new Map(data.people.map(p=>[p.id,p]));
 const copies=data.records.filter(r=>r.kind==='document'&&r.data.category==='Job Description'&&r.personId),term=q.trim().toLocaleLowerCase();
 const selected=selection&&'editionId' in selection?descriptions.find(e=>e.id===selection.editionId&&e.version===selection.version):undefined;
 const copy=selection&&'documentId' in selection?copies.find(r=>r.id===selection.documentId):undefined;
 const copyStatus=(r:HrRecord)=>r.data.assignmentSupersededBy?'Previous Assignment':r.data.jobDescriptionAssignedAt?'Current Assignment':r.data.parentId&&copies.some(parent=>parent.id===r.data.parentId)?'Paper Signature Copy':'';
 const employeeName=(r:HrRecord)=>String(people.get(r.personId??'')?.name||r.data.employeeName||'Employee');
 function clearActions(){setAssignment(false);setRecipient('');setReplace(false);setMessage('');setError('');}
 function select(item:Selection|null){clearActions();setSelection(item);}
 function openEditor(e:Edition|'new'){clearActions();setPositionSeed(null);setEditing(e);}
 async function save(content:DescriptionFields,departmentId:string,action:'save'|'publish'){
  const source=editing&&editing!=='new'?{id:editing.id,version:editing.version,etag:editing.etag}:{};
  const {description}=await requestJson<{description:Edition}>(api,{action,...source,departmentId,content},60000);
  // Show the saved version immediately; refresh the list to pick up prior-version changes.
  setCatalog(previous=>previous?{...previous,descriptions:[...previous.descriptions.filter(e=>e.id!==description.id||e.version!==description.version),description]}:previous);
  setEditing(null);setView(description.status);setQ('');setSelection({editionId:description.id,version:description.version});setMessage(action==='publish'?'Version '+description.version+' published.':'Draft saved.');setRetry(n=>n+1);
 }
 const eligible=(catalog?.assignablePeople??[]).filter(p=>selected&&p.departmentId===selected.departmentId).sort((a,b)=>a.name.localeCompare(b.name));
 const alreadyAssigned=(p:Recipient)=>p.currentDescriptionId===selected?.id&&p.currentDescriptionVersion===selected?.version;
 const person=eligible.find(u=>u.id===recipient);
 async function assign(){
  if(!selected||!person||alreadyAssigned(person)||busyRef.current||person.currentDocumentId&&!replace)return;
  setError('');setMessage('');setBusy(true);busyRef.current=true;
  try{await requestJson(api,{action:'assign',id:selected.id,version:selected.version,personId:person.id,...(person.currentDocumentId?{replaceDocumentId:person.currentDocumentId}:{})},60000);setAssignment(false);setRecipient('');setReplace(false);setMessage(`Version ${selected.version} assigned to ${person.name} for signature.`);await onChanged();}
  catch(e){setError((e as Error).message);setRetry(n=>n+1);}finally{setBusy(false);busyRef.current=false;}
 }
 if(loadError)return <section className="jd-library"><h2>Job Description Library</h2><p role="alert" className="hr2-error">{loadError}</p><Button onClick={()=>setRetry(n=>n+1)}>Try Again</Button></section>;
 if(!catalog)return <section className="jd-library" aria-busy="true"><h2>Job Description Library</h2><p role="status">Loading job descriptions…</p></section>;
 if(editing){const source=editing==='new'?undefined:editing;
  return <JobDescriptionEditor context="library" initial={descriptionFields(source?{...source.content,...(source.status==='Published'?{revisedBy:data.viewer.name,revisedDate:today()}:{})}:{...positionSeed?.content,revisedBy:data.viewer.name,revisedDate:today()})} departmentId={source?.departmentId||positionSeed?.departmentId||(catalog.departments.length===1?catalog.departments[0].id:'')} departments={catalog.departments} people={data.people.map(p=>({name:p.name,title:p.title,status:p.status}))} referenceTemplate={source||positionSeed?undefined:catalog.referenceTemplate} version={source?.status==='Published'?source.version+1:source?.version} onSave={save} onCancel={()=>setEditing(null)}/>;
 }
 if(copy){const url=delegatedUrl('/api/hr/files?id='+encodeURIComponent(copy.id)),name=docName(copy),mime=String(copy.data.mimeType||'').toLowerCase();
  return <section className="jd-library"><button type="button" className="hr2-back" onClick={()=>select(null)}><ArrowLeft size={16}/>Employee Copies</button><header className="jd-library-head"><div><h2>{name}</h2><p>{[employeeName(copy),copyStatus(copy),copy.data.signatureStatus].filter(Boolean).join(' · ')}</p></div><a className="hr2-button" href={url} download><Download size={16}/>Download File</a></header>{(mime==='application/pdf'||/\.pdf$/i.test(String(copy.data.fileName||'')))?<SopPdfPages url={url} title={name}/>:mime==='image/jpeg'||mime==='image/png'?<Image unoptimized className="jd-library-image" src={url} alt={name} width={1280} height={960}/>:<p>Download the original file to view it in its native format.</p>}</section>;
 }
 if(selected){const draft=descriptions.find(e=>e.id===selected.id&&e.status==='Draft'&&e.canEdit),url=pdfUrl(selected);
  return <section className="jd-library"><button type="button" className="hr2-back" disabled={busy} onClick={()=>select(null)}><ArrowLeft size={16}/>Job Description Library</button>
   <header className="jd-library-head"><div><div className="jd-library-meta"><Tag tone={tone(selected.status)}>{selected.status}</Tag><span>Version {selected.version}</span><span>{selected.departmentName}</span></div><h2>{selected.content.title}</h2>{selected.updatedAt&&<ActivityFields by={selected.updatedBy} at={selected.updatedAt} byLabel="Updated By" whenLabel="Updated At"/>}</div>
    <div className="hr2-actions"><a className="hr2-button" href={url+'&download=1'} download><Download size={16}/>Download PDF</a>{selected.canEdit&&selected.status!=='Archived'&&<Button disabled={busy} onClick={()=>openEditor(draft||selected)}><FilePenLine size={16}/>{selected.status==='Draft'||draft?'Edit Draft':'Create Revision'}</Button>}{selected.status==='Published'&&eligible.length>0&&!assignment&&<Button primary onClick={()=>{clearActions();setAssignment(true);}}><UserRoundPen size={16}/>Assign for Signature</Button>}</div>
   </header>
   {assignment&&<form className="jd-library-assignment" onSubmit={e=>{e.preventDefault();void assign();}}><div><h3>Assign Version {selected.version} for Signature</h3><p>The employee will receive a copy in their personnel file.</p></div><label>Employee<select required autoFocus disabled={busy} value={recipient} onChange={e=>{setRecipient(e.target.value);setReplace(false);setError('');}}><option value="">Choose an Employee</option>{eligible.map(u=><option key={u.id} value={u.id} disabled={alreadyAssigned(u)}>{u.name}{alreadyAssigned(u)?' · Already Assigned':''}</option>)}</select></label>{person?.currentDocumentId&&<label className="jd-library-confirm"><input type="checkbox" disabled={busy} checked={replace} onChange={e=>setReplace(e.target.checked)}/><span>Replace {person.currentDescriptionTitle?`“${person.currentDescriptionTitle}”`:'the current assignment'} for {person.name}. The earlier copy will stay in their file.</span></label>}<div className="hr2-actions"><Button disabled={busy} onClick={clearActions}>Cancel</Button><Button primary type="submit" disabled={busy||!person||!!person.currentDocumentId&&!replace}>{busy?'Assigning…':'Confirm Assignment'}</Button></div></form>}
   {error&&<p role="alert" className="hr2-error">{error}</p>}{message&&<p role="status" className="hr2-success"><CheckCircle2 size={16}/>{message}</p>}
   <SopPdfPages url={url} title={selected.content.title+' · Version '+selected.version}/>
  </section>;
 }
 const rows=descriptions.filter(e=>e.status===view&&matches(term,e.departmentName,...Object.values(e.content))).sort((a,b)=>a.content.title.localeCompare(b.content.title)||a.departmentName.localeCompare(b.departmentName)||b.version-a.version);
 const files=copies.filter(r=>matches(term,docName(r),employeeName(r),r.data.signatureStatus,people.get(r.personId??'')?.department)).sort((a,b)=>employeeName(a).localeCompare(employeeName(b))||b.createdAt.localeCompare(a.createdAt));
 const count=view==='copies'?files.length:rows.length;
 // Earlier position records are source material, not issued or signed descriptions.
 const positionSources=catalog.canCreate&&['Draft','Published'].includes(view)?data.records.filter(r=>r.kind==='position'&&r.data.status!=='Retired'&&(r.data.summary||r.data.essentialFunctions||r.data.qualifications||r.data.authorityLimits))
  .map(r=>({r,dept:catalog.departments.find(d=>d.id===r.data.departmentId||d.name===r.data.department)}))
  .filter(({r,dept})=>dept&&!descriptions.some(e=>e.departmentId===dept.id&&e.content.title.toLocaleLowerCase()===String(r.data.title).toLocaleLowerCase())&&matches(term,r.data.title,r.data.summary,r.data.essentialFunctions,dept.name))
  .sort((a,b)=>String(a.r.data.title).localeCompare(String(b.r.data.title))):[];
 return <section className="jd-library"><header className="jd-library-head"><div><h2>Job Description Library</h2></div>{catalog.canCreate&&<Button primary onClick={()=>openEditor('new')}><Plus size={17}/>New Job Description</Button>}</header>
  <div className="jd-library-views" role="group" aria-label="Job Description Views">{views.map(v=>{const Icon=v.icon;return <button key={v.id} type="button" aria-pressed={v.id===view} onClick={()=>{select(null);setView(v.id);}}><Icon size={16}/>{v.label}<small>{v.id==='copies'?copies.length:descriptions.filter(e=>e.status===v.id).length}</small></button>;})}</div>
  <label className="jd-library-search"><Search size={18}/><ResponsiveSearchInput aria-label="Search Job Descriptions" placeholder={view==='copies'?'Search employee, role, or department…':'Search job title, department, or duties…'} type="search" value={q} onChange={e=>setQ(e.target.value)}/></label>
  {count>0?<div className="jd-library-list">{view==='copies'?files.map(r=><button type="button" key={r.id} className="jd-library-row" onClick={()=>select({documentId:r.id})}><span className="jd-library-icon"><FileText size={19}/></span><span className="jd-library-title"><strong>{docName(r)}</strong><small>{[employeeName(r),copyStatus(r)].filter(Boolean).join(' · ')}</small><ActivityFields by={r.createdBy} at={r.createdAt} byLabel="Filed By" whenLabel="Filed At"/></span>{!!r.data.signatureStatus&&<Tag>{String(r.data.signatureStatus)}</Tag>}<ChevronRight size={16}/></button>):rows.map(e=><button type="button" key={e.id+':'+e.version} className="jd-library-row" onClick={()=>select({editionId:e.id,version:e.version})}><span className="jd-library-icon"><FileText size={19}/></span><span className="jd-library-title"><strong>{e.content.title}</strong><small>{memberLabel(e.departmentName,e.content.reportsTo?'Reports to '+e.content.reportsTo:'')}</small></span><span className="jd-library-version">Version {e.version}</span><ChevronRight size={16}/></button>)}</div>:positionSources.length&&term?null:<Empty title={term?'No Matching Job Descriptions':emptyText[view][0]} action={term?<Button onClick={()=>setQ('')}>Clear Search</Button>:undefined}>{term?'Try another name, department, or keyword.':emptyText[view][1]}</Empty>}
  {positionSources.length>0&&<details className="jd-library-sources" open={term?true:undefined}><summary>Existing Position Descriptions <small>({positionSources.length})</small></summary><p>Start with the duties already recorded for a position. Review and publish its job description before assigning it.</p>{positionSources.map(({r,dept})=><button type="button" key={r.id} className="jd-library-row" onClick={()=>{openEditor('new');setPositionSeed({departmentId:dept!.id,content:descriptionFields({...r.data,educationExperience:r.data.educationExperience||r.data.qualifications})});}}><span className="jd-library-title"><strong>{String(r.data.title)}</strong><small>{dept!.name}</small></span><span className="jd-library-version">Use in Editor</span><ChevronRight size={16}/></button>)}</details>}
 </section>;
}
