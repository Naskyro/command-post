'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {FilePlus2,Paperclip,Upload} from 'lucide-react';
import {classifyDocument,documentTypesFor,type CcrDocumentClassification,type CcrDocumentSection} from '@/lib/ccr/document-types';
import './document-upload.css';
export type CcrDocumentUploadProps={section:CcrDocumentSection;onUpload:(file:File,meta:CcrDocumentClassification)=>Promise<void>;maxPdfMB?:number;initiallyOpen?:boolean;onClose?:()=>void};
export default function CcrDocumentUpload({section,onUpload,initiallyOpen=false,onClose,maxPdfMB=64}:CcrDocumentUploadProps){
 const maxMB=section==='tdlr'?24:section==='hearings'?16:8;
 const id=useId(),select=useRef<HTMLSelectElement>(null),lock=useRef(false),mounted=useRef(true);
 const [open,setOpen]=useState(initiallyOpen),[busy,setBusy]=useState(false),[kind,setKind]=useState(''),[other,setOther]=useState(''),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(open)select.current?.focus();},[open]);
 function finish(){setOpen(false);setKind('');setOther('');setFile(null);setError('');onClose?.();}
 async function upload(){
  if(lock.current)return;
  try{
   setError('');const meta=classifyDocument(section,kind,other);
   if(!file||!file.size||file.size>(section==='hearings'&&/\.pdf$/i.test(file.name)?maxPdfMB:maxMB)*1024*1024||!(/\.(pdf|docx|png|jpe?g)$/i).test(file.name))throw new Error(`Choose a nonempty PDF, DOCX, JPG, or PNG up to ${maxMB} MB.${section==='hearings'&&maxPdfMB>maxMB?' PDF originals can be up to '+maxPdfMB+' MB.':''}`);
   lock.current=true;setBusy(true);
   await onUpload(file,meta);
   if(mounted.current){setNotice(file.name+' was uploaded.');finish();}
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'The upload could not be completed.');}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 if(!open)return <div className="ccr-doc-entry"><button type="button" className="ccr-document-trigger" onClick={()=>{setNotice('');setOpen(true);}}><Upload size={15}/>Upload Document</button>{notice&&<span role="status">{notice}</span>}</div>;
 return <section className="ccr-doc-form" aria-labelledby={id+'-heading'} aria-busy={busy}>
  <header><FilePlus2 size={18}/><h4 id={id+'-heading'}>Upload Document</h4></header>
  <label htmlFor={id+'-type'}>Document Type</label><select id={id+'-type'} ref={select} required value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setOther('');setError('');}}><option value="">Choose Document Type…</option>{documentTypesFor(section).map(t=><option key={t}>{t}</option>)}</select>
  {kind==='Other'&&<><label htmlFor={id+'-other'}>Name This Document Type</label><input id={id+'-other'} required maxLength={100} value={other} disabled={busy} onChange={e=>setOther(e.target.value)}/></>}
  <label htmlFor={id+'-file'}><Paperclip size={13}/>File</label><input type="file" id={id+'-file'} accept=".pdf,.docx,.jpg,.jpeg,.png" aria-describedby={id+'-help'} disabled={busy} onChange={e=>{setFile(e.currentTarget.files?.[0]||null);setError('');}}/><small id={id+'-help'}>PDF, Word (.docx), JPG, or PNG · Up to {maxMB} MB{section==='hearings'&&maxPdfMB>maxMB?' · PDF up to '+maxPdfMB+' MB':''}</small>
  {error&&<p role="alert">{error}</p>}
  <footer><button type="button" onClick={finish} disabled={busy}>Cancel</button><button type="button" className="ccr-document-trigger" onClick={()=>void upload()} disabled={busy}><Upload size={14}/>{busy?'Uploading…':'Save Document'}</button></footer>
 </section>;
}
