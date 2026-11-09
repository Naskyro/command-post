'use client';
import ActivityFields from '@/components/shared/ActivityFields';
import {useCallback,useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,BadgeCheck,FileText} from 'lucide-react';
import type {Policy,SopReceipt} from '@/lib/sop/model';
import {requestJson} from '@/lib/shared/client';
import BulkAcknowledgment from '@/components/sop/BulkAcknowledgment';
import SopSignatureReader from '@/components/sop/SopSignatureReader';
import {ManagerEditionReader} from '@/components/sop/CorrectiveAudience';
import {Button,Card} from './ui';
type State={required:number;signed:number;policies:Policy[];signerNames?:string[];attestation?:string};
export default function OnboardingSopPanel({personId,own,onSigned}:{personId:string;own:boolean;onSigned:()=>Promise<void>}){
 const [state,update]=useState<State>(),[selected,pick]=useState(''),[error,fail]=useState(''),[attempt,retry]=useState(0);
 const url=own?'/api/sop/onboarding':'/api/hr/onboarding-sop?person='+encodeURIComponent(personId);
 const key=(p:Policy)=>p.id+'@'+p.version+':'+(p.accessEdition||'');
 const load=useCallback(async()=>requestJson<State>(url),[url]);
 useEffect(()=>{let alive=true;update(undefined);pick('');fail('');void load().then(x=>{if(alive)update(x)}).catch(e=>{if(alive)fail(e.message)});return()=>{alive=false}},[load,attempt]);
 const p=state?.policies.find(x=>key(x)===selected);
 if(error)return <Card title="Assigned SOPs"><p role="alert">{error}</p><Button onClick={()=>retry(n=>n+1)}>Reload Policies</Button></Card>;
 if(!state)return <p role="status">Loading assigned policies…</p>;
 if(own&&p)return <section><Button onClick={()=>pick('')}><ArrowLeft size={15}/>All Assigned SOPs</Button><h3>{p.content.title}</h3><ManagerEditionReader key={key(p)+':'+p.accessEdition} policy={p} url={'/api/sop/pdf?id='+encodeURIComponent(p.id)+'&version='+p.version+'&onboarding=1'}><SopSignatureReader policy={p} url={'/api/sop/pdf?id='+encodeURIComponent(p.id)+'&version='+p.version+'&onboarding=1'} signerNames={state.signerNames||[]} attestation={state.attestation||''} onOpened={!p.openedAt?async()=>{const {openedAt}=await requestJson<{openedAt:string}>('/api/sop/onboarding',{action:'opened',id:p.id,version:p.version,accessEdition:p.accessEdition});update(prev=>prev&&({...prev,policies:prev.policies.map(row=>key(row)===key(p)?{...row,openedAt}:row)}))}:undefined} onSign={async name=>{
  const {signature}=await requestJson<{signature:SopReceipt}>('/api/sop/onboarding',{id:p.id,version:p.version,accessEdition:p.accessEdition,signerName:name,assent:true});
  update(prev=>prev&&({...prev,signed:Math.min(prev.required,prev.signed+(prev.policies.some(row=>key(row)===key(p)&&!!row.signature)?0:1)),policies:prev.policies.map(row=>key(row)===key(p)?{...row,signature}:row)}));
  void onSigned().catch(()=>{ /* Signature is committed. The next onboarding refresh rereads server readiness. */ });return signature;
 }}/></ManagerEditionReader></section>;
 return <Card title="Assigned SOPs"><p>{state.required?state.signed+' of '+state.required+' signed.':'No published SOPs currently require a signature for this employee.'}{!!state.required&&(own?' Review your assigned policies, then sign individually or use Auto Sign All to confirm you already reviewed them.':' Only the employee can sign.')} </p>{own&&!!state.required&&<BulkAcknowledgment policies={state.policies} endpoint="/api/sop/onboarding" signerNames={state.signerNames||[]} onRead={row=>pick(key(row))} onComplete={async()=>{try{update(await load());await onSigned()}catch(e){fail((e as Error).message)}}}/>}{state.policies.map(row=><div key={key(row)} className={'hr2-step '+(row.signature?'complete':'')}><span className="hr2-step-number">{row.signature?<BadgeCheck size={18}/>:<FileText size={18}/>}</span><div><h4>{row.content.title}</h4><small>{row.code} · Version {row.version}</small>{row.signature?<ActivityFields by={row.signature.signerName} at={row.signature.signedAt} byLabel="Signed By" whenLabel="Signed At"/>:<p>{row.openedAt?'Opened · Awaiting Signature':'Awaiting Employee Signature'}</p>}</div>{own&&<div className="hr2-step-actions"><Button onClick={()=>pick(key(row))}>{row.signature?'View Receipt':'Read & Sign'}<ArrowRight size={15}/></Button></div>}</div>)}</Card>;
}
