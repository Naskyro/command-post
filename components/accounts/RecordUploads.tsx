'use client';
import {sendDamageFile} from '@/lib/ccr/damage-upload-client';
import { useState, useRef, useEffect } from 'react';
import { Upload, Camera, FileText } from 'lucide-react';
import DamageFileTypeFields from '@/components/ccr/DamageFileTypeFields';
import { timedFetch } from '@/lib/shared/client';
import type { Row } from '@/lib/accounts/model';

export function InlineUpload({accountId='',contactId='',claimId='',category,disabled=false,onUploaded,label,onBusyChange}: {accountId?:string;contactId?:string;claimId?:string;category:string;disabled?:boolean;onUploaded:(rows:Row[])=>Promise<void>|void;label?:string;onBusyChange?:(busy:boolean)=>void}) {
 const [doc,setDoc]=useState(''),[other,setOther]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 useEffect(()=>{if(!status)return;const timer=window.setTimeout(()=>setStatus(''),3500);return()=>window.clearTimeout(timer);},[status]);
 const pending=useRef<{file:File;id:string}[]>([]);const photo=category.includes('photo');
 async function send() {
   setBusy(true);onBusyChange?.(true);setError('');let done=0;
   try {while(pending.current.length) {
     const item=pending.current[0],body=new FormData();body.set('file',item.file);body.set('id',item.id);body.set('accountId',accountId);body.set('contactId',contactId);body.set('category',category);if(category==='Claim evidence'){if(claimId)body.set('claimId',claimId);body.set('documentType',doc);body.set('otherDocumentType',other);}
     const res=await sendDamageFile('/api/accounts/files',body),value=await res.json() as {error?:string;records:Row[]};
     if(!res.ok)throw new Error(value.error||'Upload failed.');
     pending.current.shift();done++;
     try{await onUploaded(value.records);}catch{throw new Error('File uploaded successfully, but the account could not refresh. Refresh the property to see the saved file.');}
   } setStatus(photo?'Photo updated':`${done} file${done===1?'':'s'} uploaded${category==='Claim evidence'?' and selected':''}`);
   } catch(e) {setError((e as Error).message);}finally{setBusy(false);onBusyChange?.(false);}
 }
 return <div className={'am-upload-inline '+(photo?'am-photo-upload':'')}>
   {category==='Claim evidence'&&<DamageFileTypeFields disabled={busy||disabled} value={doc} onChange={setDoc} other={other} onOther={setOther}/>}
   <label className="am-upload-control" title={label||(photo?'Upload photo':'Upload Document')}>{photo?<Camera size={16}/>:<Upload size={18}/>}<span>{busy?'Uploading…':label||(photo?'Upload photo':'Upload Document')}</span><input type="file" aria-label={label||'Upload '+category} accept={photo?'image/jpeg,image/png,image/webp':category==='Claim evidence'?'.jpg,.jpeg,.png,.webp,.pdf,.docx,.eml,.msg':'.jpg,.jpeg,.png,.webp,.pdf'} multiple={!photo} disabled={disabled||busy||(!accountId&&!contactId)||category==='Claim evidence'&&(!doc||doc==='Other'&&other.trim().length<2)} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';setStatus('');if(!files.length)return;pending.current=[];if(files.length>15||files.some(f=>!f.size||f.size>15*1024*1024)){setError('Choose up to 15 files, each under 15 MB.');return;}pending.current=files.map(file=>({file,id:crypto.randomUUID()}));void send();}}/></label>
   {!photo&&<small><FileText size={13}/> {category==='Claim evidence'?'Photos, PDF, Word, EML or MSG':'Photos or PDF'} · Up to 15 MB each</small>}
   {busy&&<span role="status">Keep this form open while files upload.</span>}
   {status&&<small role="status">{status}</small>}{error&&<div role="alert" className="am-error">{error} {pending.current.length>0&&<button type="button" disabled={busy||disabled} onClick={()=>void send()}>Retry Upload</button>}</div>}
 </div>;
}
