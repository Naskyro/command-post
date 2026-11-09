'use client';
import {useRef,useState} from 'react';
import {Check,FileSignature,BookOpen} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from '@/components/ui/dialog';
import {requestJson} from '@/lib/shared/client';
import type {Policy} from '@/lib/sop/model';
import {manualBulkSopAttestation} from '@/lib/sop/signature-terms';
import './sop.css';
type Props={policies:Policy[];endpoint:string;signerNames:string[];onRead:(p:Policy)=>void;onComplete:(signed:number)=>Promise<void>};
export default function BulkAcknowledgment({policies,endpoint,signerNames,onRead,onComplete}:Props){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[assent,setAssent]=useState(false),[busy,wait]=useState(false),[error,fail]=useState(''),[list,setList]=useState<Policy[]>([]),lock=useRef(false);
 const pending=policies.filter(x=>!x.signature);
 async function sign(){if(lock.current||!name.trim()||!assent||!list.length)return;lock.current=true;wait(true);fail('');
 try{const result=await requestJson<{signed:number}>(endpoint,{action:'signAll',policies:list.map(x=>({id:x.id,version:x.version,accessEdition:x.accessEdition})),assent:true,manualReviewAttestation:true,signerName:name.trim()},120000);setOpen(false);await onComplete(result.signed);}
 catch(e){fail((e as Error).message);}finally{lock.current=false;wait(false);}}
 return <div className="sop-bulk-launch"><div><strong>Sign Policies Together</strong><p>{pending.length?pending.length+(pending.length===1?' policy is':' policies are')+' ready for your acknowledgment.':'No policies are waiting for your signature.'}</p></div>
 <Dialog open={open} onOpenChange={v=>{if(lock.current)return;if(v){setList([...pending].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})));setName('');setAssent(false);fail('')}setOpen(v)}}>
 <DialogTrigger asChild><button type="button" className="sop-btn primary" disabled={!pending.length}><FileSignature size={16}/>Auto Sign All</button></DialogTrigger>
 <DialogContent className="sop-bulk-dialog" showCloseButton={!busy}><DialogTitle>Sign Your SOP Acknowledgments</DialogTitle>
 <DialogDescription>Already reviewed these policies? Confirm that below and sign once. You do not need to reopen each document in Command. Each listed policy version receives its own dated acknowledgment.</DialogDescription>
 <ul className="sop-bulk-editions">{list.map(p=><li key={p.id+'|'+p.version}><div><small>{p.code} · Version {p.version}{p.accessEdition==='management'?' · With Supervisor Guidance':p.accessEdition==='employee'?' · Employee Edition':''}</small><b>{p.content.title}</b></div><div className="sop-bulk-policy-actions">{p.openedAt&&<span><Check size={15}/>Opened in Command</span>}<button type="button" className="sop-btn" onClick={()=>{setOpen(false);onRead(p)}}><BookOpen size={15}/>View Policy</button></div></li>)}</ul>
 <form onSubmit={e=>{e.preventDefault();void sign()}}><label className="sop-field"><span>Your Electronic Signature</span><input disabled={busy} required maxLength={160} autoComplete="off" placeholder={signerNames[0]||'Type your full name'} value={name} onChange={e=>setName(e.target.value)}/></label><label className="sop-attestation"><input disabled={busy} type="checkbox" checked={assent} onChange={e=>setAssent(e.target.checked)}/><span>{manualBulkSopAttestation}</span></label>
 {error&&<p role="alert" className="sop-error">{error}</p>}<button type="submit" className="sop-btn primary" disabled={busy||!assent||!name.trim()}>{busy?'Signing…':'Sign '+list.length+(list.length===1?' Policy':' Policies')}</button></form>
 </DialogContent></Dialog></div>
}
