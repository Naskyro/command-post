'use client';
import {isDelegatedClient} from '@/lib/shared/client';
import {useEffect,useRef,useState} from 'react';
import {BadgeCheck,PenLine,ShieldCheck} from 'lucide-react';
import SopPdfPages from './SopPdfPages';
import {EditionText} from './CorrectiveAudience';
import type {CorrectiveEdition,SopContent} from '@/lib/sop/model';
import {auditStamp} from '@/lib/shared/audit-format';
import './sop.css';

export type PolicySignature={accessEdition?:'employee'|'management';signerName:string;signedAt:string;version:number;policyId:string;code:string;title:string;revision:string;attestation:string;contentHash:string;personId:string};
type Signable={accessEdition?:CorrectiveEdition;id:string;version:number;code:string;content:{title:string;sections?:SopContent['sections']};signature?:PolicySignature;previousVersionSigned?:number;requireOnboardingSignature?:boolean};
type Props={policy:Signable;url:string;title?:string;signerNames:string[];attestation:string;onOpened?:()=>Promise<void>;onSign:(name:string)=>Promise<PolicySignature>};

export default function SopSignatureReader(props:Props){return <Signature key={props.policy.id+':'+props.policy.version+':'+(props.policy.accessEdition||'')} {...props}/>}

function Signature({policy,url,title,signerNames,attestation,onSign,onOpened}:Props){
 const [name,setName]=useState(''),[assent,setAssent]=useState(false),[busy,setBusy]=useState(false),[error,fail]=useState(''),[result,setResult]=useState<PolicySignature>(),[ready,setReady]=useState(false),[plain,showPlain]=useState(false),lock=useRef(false);
 const receipt=result||policy.signature,viewed=ready||plain&&!!policy.content.sections?.length,canSign=!receipt&&viewed&&name.trim().length>0&&attestation.trim().length>0&&assent;
 const openLock=useRef(false),openHandler=useRef(onOpened),[openError,setOpenError]=useState('');openHandler.current=onOpened;
 function markOpened(){if(isDelegatedClient()||!viewed||receipt||openLock.current||!openHandler.current)return;openLock.current=true;setOpenError('');void openHandler.current().catch(e=>{openLock.current=false;setOpenError(e.message||'Could not record this policy opening.');});}
 useEffect(()=>{markOpened()},[viewed]);
 async function sign(){if(isDelegatedClient()||lock.current||!canSign)return;lock.current=true;setBusy(true);fail('');try{const x=await onSign(name.trim());setResult(x);setName('');setAssent(false)}catch(e){fail((e as Error).message)}finally{lock.current=false;setBusy(false)}}
 return <div className="sop-workspace sop-signing"><div className="sop-reader-format"><span>Version {policy.version} · {policy.code}</span>{!!policy.content.sections?.length&&<button className="sop-back" type="button" onClick={()=>showPlain(!plain)}>{plain?'Show Original Layout':'Read as Text'}</button>}</div>
 {plain?<EditionText title={policy.content.title} sections={policy.content.sections||[]} accessEdition={policy.accessEdition}/>:<SopPdfPages url={url} title={title||policy.code+' · '+policy.content.title} onReady={()=>setReady(true)}/>}
 {openError&&<p role="alert" className="sop-error">{openError} <button type="button" className="sop-btn" onClick={markOpened}>Retry Recording This Opening</button></p>}
 {receipt?<section className="sop-surface sop-form sop-signature-receipt" aria-label="Signature Receipt"><div className="sop-form-heading"><BadgeCheck size={24}/><div><h2>Signed Acknowledgment</h2><p>{receipt.code} · Version {receipt.version}{receipt.accessEdition==='management'?' · With Supervisor Guidance':receipt.accessEdition==='employee'?' · Employee Edition':''}{receipt.revision?' · Revision '+receipt.revision:''}</p></div></div><dl><div><dt>Signed By</dt><dd>{receipt.signerName}</dd></div><div><dt>Date Signed</dt><dd>{auditStamp(receipt.signedAt)}</dd></div></dl><p className="sop-prose">{receipt.attestation}</p></section>:
 <form className="sop-surface sop-form sop-signature-form" onSubmit={e=>{e.preventDefault();void sign()}}><div className="sop-form-heading"><PenLine size={23}/><div><h2>Sign This Version</h2><p>{policy.code} · Version {policy.version}{policy.requireOnboardingSignature?' · Required for onboarding':''}</p></div></div>{policy.previousVersionSigned!=null&&<p className="sop-notice">You signed version {policy.previousVersionSigned}. That signature remains on file. Review this version before signing it.</p>}
 <label className="sop-field"><span>Type Your Name</span><input required autoComplete="off" maxLength={160} placeholder={signerNames?.[0]||'Your full name'} value={name} onChange={e=>setName(e.target.value)} disabled={busy||isDelegatedClient()}/></label>
 <label className="sop-attestation"><input type="checkbox" checked={assent} disabled={busy||isDelegatedClient()} onChange={e=>setAssent(e.target.checked)}/><span>{attestation}</span></label>
 {error&&<p className="sop-error" role="alert">{error}</p>}<div className="sop-tools"><button className="sop-btn primary" disabled={busy||isDelegatedClient()||!canSign} type="submit"><ShieldCheck size={16}/>{busy?'Signing…':'Sign Policy'}</button></div></form>}
 </div>
}
