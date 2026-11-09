'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ClipboardCheck,Download,FileText,FolderLock,RefreshCw,Search,ShieldCheck,Upload,Users,X} from 'lucide-react';
import type {Viewer} from '@/lib/finance/model';
import {canAccess} from '@/lib/finance/access';
import {auditDay,auditStamp} from '@/lib/shared/audit-format';
import {stageDocument} from '@/lib/ccr/document-stage-client';
import {requestJson,timedFetch} from '@/lib/shared/client';
import type {ReviewDocument,ReviewItem} from '@/lib/ccr/personnel-review';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';
import CcrDocumentUpload from './CcrDocumentUpload';
import './personnel-files.css';
type Data={rights:{twc:boolean;screening:boolean};rows:ReviewItem[]};
type Index={files:ReviewDocument[];canUpload:boolean};
function ReviewFiles({row,openUpload}:{row:ReviewItem;openUpload:boolean}){
 const [index,setIndex]=useState<Index>(),[error,setError]=useState(''),[rev,retry]=useState(0),[success,setSuccess]=useState('');
 const url='/api/ccr/personnel/files?review='+encodeURIComponent(row.id);
 useEffect(()=>{let active=true;setIndex(undefined);setError('');void requestJson<Index>(url).then(d=>{if(active)setIndex(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[url,rev]);
 async function upload(file:File,classification:{documentType:string;otherDocumentType?:string}){
  setSuccess('');type Result={file?:ReviewDocument;error?:string};let result:Result;
  if(file.size>480*1024){
   try{result=await stageDocument<Result>(url+'&personnelStage=1',file,{reviewId:row.id,documentType:classification.documentType,...(classification.otherDocumentType?{otherDocumentType:classification.otherDocumentType}:{})},(sent,total)=>setSuccess('Uploading '+Math.round(100*sent/total)+'%'+(sent===total?' · Verifying Document…':'')));}catch(e){setSuccess('');throw e;}
  }else{
   const fd=new FormData();fd.set('file',file);fd.set('documentType',classification.documentType);if(classification.otherDocumentType)fd.set('otherDocumentType',classification.otherDocumentType);
   const res=await timedFetch(url,{method:'POST',body:fd},60000);result=await res.json() as Result;if(!res.ok)throw new Error(result.error||'Upload could not be confirmed.');
  }
  if(!result.file)throw new Error(result.error||'Upload could not be confirmed.');const saved=result.file;
  setIndex(old=>old?{...old,files:[saved,...old.files.filter(f=>f.id!==saved.id)]}:old);
  setSuccess('Document saved to this '+(row.type==='TWC Inquiry'?'TWC inquiry.':'screening review.'));
 }
 return <div className="ccrp-files-panel"><div><h3><FolderLock size={17}/> Review Documents</h3><p>{row.employee} · {row.type}</p></div>{!index?(error?<p role="alert">{error} <button onClick={()=>retry(n=>n+1)}>Retry</button></p>:<p role="status">Loading documents…</p>):<>
 {index.canUpload&&<CcrDocumentUpload section={row.type==='TWC Inquiry'?'twc':'screening'} initiallyOpen={openUpload} onUpload={upload}/>}
 {success&&<p role="status">{success}</p>}
 {index.files.length?<ul className="ccrp-files-list">{index.files.map(f=><li key={f.id}><FileText size={18}/><div><b>{f.documentType}</b><span>{f.fileName}</span><small>{auditStamp(f.uploadedAt)} · {f.uploadedBy}</small></div><a href={url+'&file='+encodeURIComponent(f.id)} download aria-label={'Download '+f.fileName} title={'Download '+f.fileName}><Download size={17}/></a></li>)}</ul>:<p className="ccrp-no-files">No documents attached to this review.</p>}</>}
 </div>;
}
export default function PersonnelReview({viewer,onOpen,uploadOnOpen=false}:{viewer:Viewer;onOpen:(module:string,tab?:string,section?:string)=>void;uploadOnOpen?:boolean}){
 const [data,setData]=useState<Data>(),[error,setError]=useState(''),[v,refresh]=useState(0),[query,setQuery]=useState(''),[filter,setFilter]=useState('Open'),[selected,setSelected]=useState(''),[picking,setPicking]=useState(uploadOnOpen),[upload,setUpload]=useState(uploadOnOpen);
 useEffect(()=>{let alive=true;setError('');setData(undefined);void requestJson<Data>('/api/ccr/personnel').then(r=>{if(alive)setData(r)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[v]);
 useEffect(()=>{if(uploadOnOpen){setPicking(true);setUpload(true)}},[uploadOnOpen]);
 const rows=(data?.rows||[]).filter(r=>(filter!=='Open'||!r.closed)&&(filter!=='Completed'||r.closed)&&(!['TWC Inquiry','Screening Review'].includes(filter)||r.type===filter)&&[r.employee,r.type].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const tab=['credentials','performance','people','home','hiring','compensation','reports'].find(t=>canAccess(viewer,'People & HR',t));
 const active=data?.rows.find(r=>r.id===selected),panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selected&&!picking)panel.current?.focus();},[selected,picking]);
 const editable=canAccess(viewer,'Compliance, Claims & Recovery','people',true);
 return <section className="ccrp" aria-label="Personnel Review"><header className="ccrp-head"><div><small><Users size={14}/> Workforce Compliance</small><h1>Personnel Review</h1><p>Follow up on TWC inquiries and screening reviews assigned to your HR access.</p></div><div className="ccrp-file-actions">{editable&&data&&(data.rights.twc||data.rights.screening)&&<button onClick={()=>{setPicking(true);setUpload(true);setSelected('')}}><Upload size={16}/> Upload Document</button>}<button aria-label="Refresh Personnel Reviews" title="Refresh Personnel Reviews" onClick={()=>refresh(n=>n+1)}><RefreshCw size={16}/></button></div></header>
 {data&&<div className="ccrp-routes">{tab&&canAccess(viewer,'People & HR','performance')&&<button onClick={()=>onOpen('People & HR','performance')}><ClipboardCheck size={20}/><span><b>Performance Records</b><small>Notes, corrective actions, and personnel history</small></span><ArrowUpRight size={15}/></button>}{data.rights.twc&&tab&&<button onClick={()=>onOpen('People & HR',tab,'ccr-twc')}><FolderLock size={20}/><span><b>TWC &amp; Personnel Records</b><small>Open the HR response work queue</small></span><ArrowUpRight size={15}/></button>}</div>}
 {data&&picking&&editable&&(data.rights.twc||data.rights.screening)&&<section className="ccrp-card ccrp-picker"><div className="ccrp-picker-title"><h2><Upload size={17}/> Upload a Review Document</h2><button type="button" aria-label="Close Review Selection" onClick={()=>{setPicking(false);setUpload(false);setSelected('')}}><X size={17}/></button></div>{data.rows.length?<label>Personnel Review<select value={selected} onChange={e=>{setSelected(e.target.value);setUpload(true)}}><option value="">Choose an Employee and Review…</option>{data.rows.map(r=><option key={r.id} value={r.id}>{r.employee} · {r.type} · {r.closed?'Completed':'Open'} · {auditDay(r.updated.slice(0,10))} · {r.id.slice(-8)}</option>)}</select></label>:<><p>Create the TWC inquiry or screening review in HR first. Its documents will be linked to that specific employee and review.</p>{tab&&<button onClick={()=>onOpen('People & HR',tab,data.rights.twc?'ccr-twc':undefined)}>Open People &amp; HR <ArrowUpRight size={14}/></button>}</>}</section>}
 {active&&<div ref={panel} tabIndex={-1} aria-label="Selected Personnel Review Documents" className="ccrp-card ccrp-selected-files"><div className="ccrp-picker-title"><h2>Selected Review</h2><button aria-label="Close Selected Review" onClick={()=>{setSelected('');setUpload(false)}}><X size={17}/></button></div><ReviewFiles key={active.id+':'+upload} row={active} openUpload={upload}/></div>}
 <section className="ccrp-card"><h2>Review Directory</h2>{!data?error?<p role="alert">{error} <button onClick={()=>refresh(n=>n+1)}>Retry</button></p>:<p role="status">Loading personnel reviews…</p>:!data.rights.twc&&!data.rights.screening?<div className="ccrp-empty"><ShieldCheck/><strong>No Review Responsibility Assigned</strong><p>TWC and screening records require separate HR permissions.</p></div>:<><div className="ccrp-tools"><label><Search size={16}/><ResponsiveSearchInput type="search" aria-label="Search Personnel Reviews" placeholder="Search Employees or Review Types" compactPlaceholder="Search Reviews" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter Personnel Reviews" value={filter} onChange={e=>setFilter(e.target.value)}>{['Open','Completed','All',...(data.rights.screening?['Screening Review']:[]),...(data.rights.twc?['TWC Inquiry']:[])].map(x=><option key={x}>{x}</option>)}</select></div>{!rows.length?<div className="ccrp-empty"><ClipboardCheck/><strong>{query?'No Matching Reviews':filter==='Open'?'No Open Personnel Reviews':'No Reviews in This View'}</strong></div>:<ul className="ccrp-items">{rows.map(r=><li key={r.id}><div className="ccrp-itemname"><b>{r.employee}</b><small>{r.type} · {r.closed?'Completed':'Open'}</small></div><div><span>{r.due?'Due '+auditDay(r.due):'No Due Date'}</span><small>Updated {auditStamp(r.updated)}</small></div><button aria-expanded={selected===r.id} onClick={()=>{setSelected(r.id===selected?'':r.id);setPicking(false);setUpload(false)}}><FileText size={15}/> Documents</button>{tab&&<button onClick={()=>onOpen('People & HR',tab,'ccr-review:'+r.id)}>Open HR Record <ArrowUpRight size={14}/></button>}</li>)}</ul>}</>}</section></section>
}
